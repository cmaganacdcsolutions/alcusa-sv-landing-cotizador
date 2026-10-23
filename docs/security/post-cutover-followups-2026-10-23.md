# Post-cutover follow-ups (SEC-024, SEC-028, SEC-030, XFF, AAAA) - 2026-10-23

Author: senior-cybersecurity. Scope: alcusasv.com in production, live since 2026-10-22. Method: read-only. Public pages probed with Playwright (chromium desktop + webkit iPhone 13 emulation), DNS over HTTPS, one TLS/HTTP probe over IPv6 to our own host, repo and doc review. **Server-side checks as `deploy` were NOT possible**: the ssh-agent holds the key (`pc-2026-10`, offered by ssh) and the server answered `Permission denied (publickey)` (see "Access note"). Nothing was changed on any server. Close-by date for the three accepted findings: **2026-10-29**.

Who runs what: **[A]** Foreman/agent as `deploy`; **[U]** the user (root via su from `deploy`/Hostinger console, hPanel DNS, browser).

## Verdicts

| Item | Verdict |
|---|---|
| SEC-028 CSP enforce | Can be enforced. One violation type only: inline `data:` fonts (unused Cyrillic-ext subset). Add `data:` to `font-src` in the same edit. [U] root step in section 1. |
| SEC-024 /128 on IPv6 | Not moot in principle: nginx DOES serve IPv6 (verified from outside). It is only unreachable because there is no AAAA record. Close as accepted-mitigated while no AAAA is published. |
| AAAA | Recommend NOT adding now. Technically safe to add (nginx serves IPv6, 200 over TLS verified), but it re-opens SEC-024. Preconditions listed in section 2. |
| SEC-030 backups | Plan in section 3; needs 3 user decisions (destination, key custody, retention). Restore test is a root step and is the real acceptance. |
| XFF | Static check PASS: a client-supplied `X-Forwarded-For` cannot spoof the IP used for rate limit, lockout, fail2ban or logs. Two read-only server greps pending. |

## Access note (server checks skipped)
`ssh-add -l` lists `SHA256:HNE8Xx...` (`pc-2026-10`, same as `~/.ssh/id_ed25519.pub`); ssh offers it and the server refuses it. Likely the server `authorized_keys` does not contain this key after the SEC-021 passphrase change, or the agent was loaded with a different key. Action [U/Foreman]: confirm which key `deploy` expects, reload it into the agent with its TTL, then run the "server check pending" commands under each item. Evidence below does not depend on it.

---

## 1. SEC-028 - CSP Report-Only -> enforce

### Current state (evidence)
Live header (`curl -I`, public): `content-security-policy-report-only: default-src 'self'; script-src 'self' <7 sha256>; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src https://www.google.com blob: data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'`. Source: `snippets/alcusa-csp-report-only.conf`, included at server level of `alcusa-prod.conf` (`docs/ops/scripts/alcusa-prod-root.sh`, vhost block).

### Violation sweep (production, 2026-10-23)
Method: `securitypolicyviolation` listener injected before page load plus console capture; scroll to load lazy content; every non-GET request aborted client-side (nothing was sent to Alcusa). Pages: `/`, `/nosotros/` (Google Maps iframe), `/contacto/`, `/cotizador/` and a 404 page (that is all 4 sitemap URLs plus 404). Cotizador walk (chromium 1366x800 and webkit iPhone 13): "Puertas de baño" -> "Rectas" -> acabado -> medidas 120 x 200 -> every color and glass button clicked -> Precio -> "Con instalación" -> zone select, colonia, calle, referencia, teléfono (dummy) -> Resumen -> "Obtener cotización en PDF" opens the customer dialog (closed, not submitted).

Result: **40 reports in chromium, all the same one; webkit the same; no other directive was violated.**

| # | Directive | Blocked | Where | Meaning |
|---|---|---|---|---|
| 1 | `font-src` | `data:` | every page (from `Navbar.*.css`) | Vite inlined 4 weights (400/500/600/700) of the Manrope subset `unicode-range: U+460-52F,...` (Cyrillic-ext) as base64. Spanish text never uses it, so enforcement has no visible effect, but the console would show 4 errors per page. |

Checked statically, clean: Google Maps iframe (`frame-src https://www.google.com` is enough; the "Could not load util / search_impl" errors in webkit come from Google's own iframe code, not from our CSP); no `eval`, `new Function`, `Worker`, `importScripts` or `.wasm` in any of the 17 first-party JS chunks fetched from prod; the only blob use is `URL.createObjectURL` + `<a download>` (not governed by CSP); PDF assets are fetched same-origin (`connect-src 'self'`).

**Not exercised:** real PDF generation and the WhatsApp share need the POST that issues the folio (stores customer data on Alcusa's server), which I did not send. Static analysis says they are CSP-clean. Residual check [A] on DEV before prod: with the dev snippet in enforce mode, run one full quote with PDF + WhatsApp share using a test customer; the console must stay empty. (I have no dev credentials; the Foreman runs it with the netrc flow.)

### Recommendation
Enforce on the public site with ONE change: `font-src 'self' data:`. `data:` in font-src is negligible risk (fonts cannot execute script). Backlog (fe-senior, `astro.config.mjs`): `vite.build.assetsInlineLimit: 0` so no inline fonts exist; then `data:` can be dropped again. Keep `style-src 'unsafe-inline'` (137 style attributes, documented trade-off). Roll out dev first, then prod. No `report-uri` (nobody would read it).

### Exact steps
1. [U, root] on DEV first, same commands as step 2 with `alcusa-dev.conf` instead of `alcusa-prod.conf`; then [A] runs the full quote above on dev.
2. [U, root] on prod (su from `deploy`, absolute path):
```bash
cp -a /etc/nginx/snippets/alcusa-csp-report-only.conf /root/alcusa-csp-report-only.conf.$(date +%Y%m%d)-bak
cp -a /etc/nginx/snippets/alcusa-csp-report-only.conf /etc/nginx/snippets/alcusa-csp-enforce.conf
sed -i -e 's/Content-Security-Policy-Report-Only/Content-Security-Policy/' \
       -e "s/font-src 'self';/font-src 'self' data:;/" /etc/nginx/snippets/alcusa-csp-enforce.conf
grep -c "font-src 'self' data:" /etc/nginx/snippets/alcusa-csp-enforce.conf          # must print 1
grep -c "Content-Security-Policy-Report-Only" /etc/nginx/snippets/alcusa-csp-enforce.conf   # must print 0
sed -i 's#include snippets/alcusa-csp-report-only.conf;#include snippets/alcusa-csp-enforce.conf;#' /etc/nginx/sites-available/alcusa-prod.conf
grep -c "alcusa-csp-enforce.conf" /etc/nginx/sites-available/alcusa-prod.conf         # must print 1 (certbot adds a second server block only if it copied the include; if 2, fine)
nginx -t && systemctl reload nginx
```
   The header line the snippet must contain (the hashes stay exactly as they are in the file): `add_header Content-Security-Policy "default-src 'self'; script-src 'self' <existing hashes>; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src https://www.google.com blob: data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'" always;`
   Do NOT run `nginx -T` (prints the admin path). If the grep for the include prints 0, the include line has another form: edit that line by hand.
3. [A] `curl -sI https://alcusasv.com/ | grep -i content-security` shows `content-security-policy:` (not `-report-only`) with `font-src 'self' data:`; re-run the sweep (security) : 0 violations; `/`, `/nosotros/`, `/cotizador/` still 200 and the walk completes.
4. Maintenance rule: the 7 script hashes change whenever an inline script changes. Every release that touches inline scripts must regenerate the snippet (runbook 6.1) or the page breaks silently under enforcement. Owner senior-devops: a release check in `docs/ops/scripts/deploy.sh` (or CI) comparing the built inline-script hashes with the snippet text.

### Rollback
[U, root]: `sed -i 's#alcusa-csp-enforce.conf#alcusa-csp-report-only.conf#' /etc/nginx/sites-available/alcusa-prod.conf && nginx -t && systemctl reload nginx` (original snippet is untouched, a backup is also in /root).

### Admin panel CSP (I cannot reach it)
The admin has its own enforced CSP from the app (helmet) and does not include the public snippet, so this switch does not change it. The user checks once, logged in at the admin path with the browser console open (F12): login, list, create/edit a promo with image upload, publish, logout. Expect no "Refused to ..." messages; anything seen is a new finding for senior-be.

### Close / verify
Closed when: header live on prod (step 3), sweep = 0 violations, admin console clean (user confirms), hash release check filed. Then SEC-028 = Verified/Closed.

---

## 2. SEC-024 (per-IP controls are /128 on IPv6) and the AAAA decision

### Current state (evidence)
- DNS (Google DoH, 2026-10-23): `alcusasv.com` has **no AAAA** (SOA only); `www` is a CNAME to the apex. No IPv6 client reaches the site today.
- nginx **does** serve IPv6: the vhost (`alcusa-prod-root.sh`) declares `listen [::]:80` and the default-ssl catch-all `listen [::]:443 ssl default_server`, and certbot mirrors the 80 listeners for 443. An external probe to our own host, `curl -6 --resolve alcusasv.com:443:[2a02:4780:95:a6f::1] https://alcusasv.com/`, returned **HTTP 200 over TLS**; port 80 over IPv6 returned 301. The server side and the Hostinger firewall therefore already pass IPv6.
- Server check pending (access refused), read-only as deploy: `ss -ltn | grep -E ':(80|443)\b'` should list `[::]:80` and `[::]:443` as well as `0.0.0.0`.
- The /128 issue: `limit_req_zone $binary_remote_addr` (`alcusa-admin-bootstrap.sh` lines 336-337) and the fail2ban jail key one /128 address. An IPv6 attacker normally owns a /64 (2^64 addresses), so rate limit and ban are trivially evaded. This does not weaken the secret admin path (24 chars), basic auth or the app login lockout (also per IP, same caveat).

### Recommendation
Keep **no AAAA** for now. Effect: SEC-024 stays latent; no customer is lost (Salvadoran ISPs fall back to IPv4 and the apex works on IPv4). Close SEC-024 as "accepted - mitigated by not publishing AAAA" and record "AAAA requires /64 rate limiting first" in the runbook (infra adds one line).

Preconditions for a future AAAA (owner senior-infrastructure): (1) nginx limit_req keyed on the /64: derive a key with `map $remote_addr $limit_key { ~^(?<p>[0-9a-f]+:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+): $p; default $binary_remote_addr; }` (IPv4 keeps its own key) and use `limit_req_zone $limit_key ...`; (2) fail2ban banning the /64 for IPv6 hits (custom action or `ipset` with prefix; validate with `fail2ban-regex` and a live test from an IPv6 throwaway client); (3) then add the record. Warning, explicit: adding an AAAA while nginx does NOT listen on IPv6 would black-hole every IPv6 client (browsers fall back to IPv4 after a delay, but some clients and crawlers fail). Today nginx does listen (above), so the record would work, but it must wait for 1-2.

### Steps
- Now: none required. [A] when access is restored: `ss -ltn | grep -E ':(80|443)\b'` and attach the output here.
- Future AAAA [U, hPanel DNS]: add `AAAA alcusasv.com 2a02:4780:95:a6f::1`, TTL 300, only after preconditions; verify `curl -6 -I https://alcusasv.com/` from an IPv6 host; rollback: delete the record (TTL 300).

### Close
SEC-024 closed as accepted-mitigated on the user's confirmation of "no AAAA for now" plus the runbook line.

---

## 3. SEC-030 - backups: same disk, unencrypted, prod restore untested

### Current state (evidence)
`/usr/local/sbin/alcusa-backup.sh` (root, 750; text in `alcusa-prod-root.sh` R8, lines 350-364) runs from `/etc/cron.d/alcusa-backup` at 03:15: `mariadb-dump --single-transaction --routines --events --databases` for `alcusa_dev` and `alcusa_prod`, a `tar` of each `shared/`, written to `/var/backups/alcusa` (700, files 600), pruned after 7 days. Same disk as the data, unencrypted, plus the Hostinger weekly snapshot (same provider). The prod DB holds customer name and WhatsApp (folio), so any off-site copy must be encrypted. Restore was tested on dev only (runbook 11.6). Server verification pending: `/var/backups/alcusa` is root-only, so listing it is a root step.

### Options (the user decides the destination)
| Option | Cost | Notes |
|---|---|---|
| A. Hostinger snapshots only (today) | included | same provider and account: not off-site against account compromise |
| B. Second-provider object storage (Backblaze B2, Wasabi, Cloudflare R2) via `rclone` + `age` | about 1-6 USD/month for a few hundred MB | recommended: independent account, key scoped to one bucket |
| C. Pull from Carlos's PC/NAS over ssh with a forced-command key | free | depends on a machine being on |
| D. Alcusa's own Drive/OneDrive | free | personal data in a customer-managed account, needs their consent; weakest control |

Recommendation: **B + `age`**. Encrypt on the VPS with a public recipient key so the VPS never holds the decryption key; upload with a bucket-scoped key; keep the private key offline. Retention: 30 daily + 12 monthly through the bucket lifecycle. Copy only prod (DB + `shared/`), not dev. Personal data leaving El Salvador hosting is a legal question for the user/client (region choice), flagged here, not advised.

### Decisions the user must make
1. Destination (B recommended) and who pays the account (CDC or Alcusa).
2. Custody of the `age` private key (where, who; losing it makes backups unreadable): password manager plus one offline copy with a second trusted person.
3. Retention (default above) and whether dev is excluded (recommended).

### Steps
**Part 1 - prod restore test (first; it is the real acceptance). Never over `alcusa_prod`.** The dump contains `CREATE DATABASE`/`USE` for `alcusa_prod`; the commands rewrite those lines and a guard stops if any remain.
1. [U, root]:
```bash
f=$(ls -1t /var/backups/alcusa/alcusa_prod-*.sql.gz | head -1); echo "$f"
zcat "$f" | sed -E '/^(CREATE DATABASE|USE) /s/alcusa_prod/alcusa_restoretest/' > /root/restoretest.sql
grep -E '^(CREATE DATABASE|USE) ' /root/restoretest.sql      # must show alcusa_restoretest only
grep -c '`alcusa_prod`' /root/restoretest.sql                # must be 0; if not 0, STOP and do not import
mariadb --protocol=socket -uroot < /root/restoretest.sql
mariadb --protocol=socket -uroot -e "SHOW TABLES FROM alcusa_restoretest; SELECT COUNT(*) AS admins FROM alcusa_restoretest.admin_users;"
```
   Expected: the same tables as live (`SHOW TABLES FROM alcusa_prod`), `admins = 1`; compare row counts of the promotions table against live (3 published at cutover).
2. [U, root] clean up: `mariadb --protocol=socket -uroot -e "DROP DATABASE alcusa_restoretest"; shred -u /root/restoretest.sql`.
3. [U, root] files: `mkdir /root/rt && tar -C /root/rt -xzf /var/backups/alcusa/prod-shared-<ts>.tar.gz && diff -rq /root/rt/shared /var/www/alcusa/prod/shared; rm -rf /root/rt` (expected: identical, or only files newer than the backup).
4. [A] records date and result in runbook 11.6 ("prod restore tested").

**Part 2 - encrypted off-site copy (after decisions 1-3)**
5. [U] creates the bucket and a bucket-scoped application key in the provider console; on his own PC generates the keypair `age-keygen -o alcusa-backup.agekey`; the secret file stays offline, only the `age1...` public string goes to the server.
6. [U, root] on the VPS: install `age` and `rclone` (Ubuntu 24.04 packages), run `rclone config` as root typing the key in the terminal (never pasted into chat; lands in `/root/.config/rclone/rclone.conf`, 600), and write the public key to `/etc/alcusa-backup.recipient`.
7. [senior-infrastructure writes, U installs] append to `alcusa-backup.sh`, after the dumps: for each fresh prod dump and prod shared archive, `age -R /etc/alcusa-backup.recipient -o file.age file`, `rclone copyto file.age remote:bucket/prod/file.age`, remove the temp `.age`; exit non-zero on any failure; `umask 077`; no `set -x`; end with a healthchecks.io style ping so a silent failure is noticed.
8. [U, root] one manual run `/usr/local/sbin/alcusa-backup.sh`, then `rclone ls remote:bucket/prod | tail`.
9. [U] on his PC download one object and `age -d -i alcusa-backup.agekey file.age | gunzip | head` (proves the key custody works).

### Rollback
Both parts are additive. Part 1 only creates and drops `alcusa_restoretest`. Part 2: restore the script from `/root/alcusa-srv/backup/alcusa-backup.sh.<stamp>` and `rclone purge` the bucket if abandoned. No production data is modified.

### Close / verify
Closed when: restore result recorded (step 4); at least one encrypted object in the second location decrypts with the offline key (step 9); the script exits non-zero on failure; the next morning `journalctl -t alcusa-backup -n 5` shows a successful run (user pastes it, no secrets in it). If the user declines Part 2, SEC-030 stays Low with an explicit written acceptance, and Part 1 is still required.

---

## 4. XFF trust (owed since 2026-10-17) - static check

### Evidence
- **nginx overwrites the headers.** `docs/ops/scripts/alcusa-admin-bootstrap.sh` lines 349-356 (admin proxy snippet) set `proxy_set_header X-Real-IP $remote_addr;` and `proxy_set_header X-Forwarded-For $remote_addr;`. `proxy_set_header` replaces any client-supplied header of that name; `$proxy_add_x_forwarded_for` (which appends) is not used anywhere in `docs/ops`. The prod snippet is derived from it by a `sed` that changes only the upstream port (`alcusa-prod-root.sh` line 130, followed by a post-condition grep), so prod has the same lines. No `real_ip` directives exist in the repo, so `$remote_addr` is the TCP peer.
- **The app trusts XFF only from loopback.** `server/src/modules/admin/routes.ts` lines 86-91: `clientIp()` uses `x-forwarded-for` only when `req.socket.remoteAddress` is `127.0.0.1`, `::1` or `::ffff:127.0.0.1`, taking the LAST comma-separated entry (what the nearest proxy wrote), truncated to 64 chars; otherwise the socket address. The app binds `HOST=127.0.0.1` (`alcusa-admin-bootstrap.sh` line 242; `server/src/config/index.ts` default), and a non-loopback peer could not use XFF anyway. Fastify `trustProxy` is off for the admin (`server/src/admin-server.ts` line 10 hard-codes `TRUST_PROXY: false`), so `req.ip` cannot be spoofed either.
- **Where the IP is used.** App login throttle, lockout, password change and audit trail use `clientIp(req)` (routes.ts lines 113, 142, 214, 231, 240; the audit stores an HMAC with `IP_HASH_PEPPER`, never the raw address). nginx `limit_req` keys on `$binary_remote_addr` and fail2ban reads the nginx access log: neither depends on any header.
- **Tests exist:** `server/test/admin/audit-ip.test.ts` and `hardening.test.ts` send `x-forwarded-for` and assert the last entry is used and the raw IP is not stored.
- **Server checks pending (access refused), read-only as deploy:** `grep -n proxy_set_header /etc/nginx/snippets/alcusa-admin-proxy-prod.conf` must show both lines with `$remote_addr` (this is the proxy snippet, NOT `alcusa-admin-prod.conf` which holds the secret path), and `ss -ltn | grep 4501` must show `127.0.0.1:4501` only. No login or auth request was made against any admin.

### Verdict
PASS (static). A client-supplied `X-Forwarded-For` cannot change the IP used for rate limiting, lockout, fail2ban or logging. Residual (Low, no action now): if a CDN or second proxy is ever placed in front, `$remote_addr` becomes the CDN address and every control would key on it; that change must come with `set_real_ip_from` + `real_ip_header`. Infra adds this sentence to the runbook. XFF is closed once the two server checks are attached.

---

## USER steps (short)
1. Fix the ssh-agent identity so `deploy` works (or confirm which key the server expects).
2. Decide AAAA = no for now (accept SEC-024 as mitigated).
3. CSP enforce: dev first, then prod, using section 1 (root, one block, one-line rollback). Then check the admin panel in the browser console.
4. Run the prod restore test (section 3, steps 1-3, about 10 minutes) and decide destination + key custody for off-site backups.
5. Delete the local `.bak` of the dev basic-auth file.
