# Alcusa production cutover plan (2026-10-22) - PLAN ONLY, nothing below has been run

Scope decided by the user on 2026-10-22: static site to `/var/www/alcusa/prod`, admin promo panel in production, DNS `@`/`www` from Wix to the VPS, prod TLS certificate. Wix stays untouched as the DNS-rollback target for 24-48 h. MX/TXT are never touched.
Tags: **[deploy]** runnable as `deploy` over SSH; **[root]** needs root (`su -` from the user's own deploy SSH session, or a console root terminal); **[TTY]** needs the user at an interactive terminal; **[DNS]** Hostinger API via MCP (Foreman).
Never print `/etc/alcusa/*`, `C:\Users\carlo\.alcusa\*`, the admin path, or any password. `nginx -T` is removed from the sudo allowlist by R7 (SEC-020: it would print the secret admin path); use `nginx -t`.

### 0. Decisions made by the user on 2026-10-22 (folded into script + plan)
- **noindex removed at cutover for the public site**; the admin stays noindex; `alcusa-noindex.conf` untouched (dev keeps it). See section 7.
- **SEO matters a lot to the client: permanent 301s for the old Wix URLs indexed by Google.** Wix canonical host was `www`; ours is the apex, and `www` already 301s to the apex. Snippet `snippets/alcusa-prod-legacy-wix.conf` (written by the root script, included in BOTH the apex and the `www` server blocks):

| Old Wix URL | Rule | Target |
|---|---|---|
| `/shop` | `location = /shop` | `/` |
| `/book-online` | `location = /book-online` | `/` |
| `/product-page/...` (puerta-de-ba%C3%B1o-aquafold, puerta-de-ba%C3%B1o-frosted, copia-de-soy-un-producto) | `location ^~ /product-page/` | `/` |
| `/service-page/...` (asesoria-para-remodelar-tu-ba%C3%B1o) | `location ^~ /service-page/` | `/` |

  Target form chosen: `return 301 $scheme://alcusasv.com/;` (scheme-relative, not a hardcoded `https://`). It is correct before certbot (HTTP-only window: stays on http, no broken TLS jump) and after (certbot copies the include into the 443 blocks, where `$scheme` is https). Host is hardcoded to the apex so a `www` hit lands on the canonical host in the same redirect. **Hop count:** certbot's `--redirect` turns port 80 into a plain `http -> https` redirect on the same host. With the legacy rules also inside the `www` block: `http://www/shop` -> `https://www/shop` (1) -> `https://alcusasv.com/` (2) = 2 hops. Without them in the `www` block it would have been 3 (http->https, www->apex, legacy->home). `http://alcusasv.com/shop` -> `https://alcusasv.com/shop` -> `/` = 2; `https://.../shop` = 1. Non-listed Wix paths (e.g. trailing-slash variants, `/blog`) are not redirected (404); extend the snippet by root session if Search Console shows more indexed URLs.
- **CSP stays Report-Only** (SEC-028 accepted, enforce by 2026-10-29). **HSTS 1 year, no `includeSubDomains`, no `preload`.**
- **Admin account is `alcusa`; the user types the initial password at the TTY.**
- **No hPanel:** root via the Hostinger API password + `su -` from a deploy SSH session; `passwd -l root` is the script's last step (Stage B). SEC-018: the root password never goes through chat.
- Findings applied: SEC-018..022, 025..027, 029 (and the cheap part of 030). SEC-023 (admin.sh) is senior-devops; SEC-024 (IPv6 /64) and SEC-021 residual stay open/accepted by the user.
## 1. Server state found (read-only, 2026-10-22 ~21:20 America/El_Salvador, 03:23 UTC Oct 23)

| Item | Finding |
|---|---|
| dev static | `current` -> `releases/20261021T031517Z` (ab5c8dc). Releases kept: 20261015T002024Z, 20261015T013519Z, 20261017T015513Z, 20261018T003653Z, 20261021T031517Z |
| dev admin | `current` -> `/opt/alcusa/dev/releases/20261018T005327Z-231d382`. Releases: 20261007T135531Z-b89856e, 20261007T135911Z-b89856e, 20261009T173108Z-3eebb71, 20261018T005327Z-231d382 |
| **SEC-011** | **Never reached dev.** 231d382 (CSRF fix) is the last admin release. SEC-011 commits `32c6c55` + `6089af3` are in `dev` after it (server/ diff: admin-server.ts, auth-service.ts, mariadb-store.ts, routes.ts, runtime.ts, store.ts, promotions/service.ts; no new migration). **Trap:** `admin-server.ts` now throws at boot in `NODE_ENV=production` without `IP_HASH_PEPPER`. `/etc/alcusa/dev-api.env` (dev runs NODE_ENV=production) has no pepper today, so releasing SEC-011 to dev fails the health check and auto-rolls back until the pepper is added (root step R7). The CLIs do not need the pepper. |
| services | alcusa-admin-dev, mariadb, nginx, fail2ban all active. Disk 2.2/96 GB, RAM 8 GB (6.5 GB free). Node v24.21.0 |
| prod vhost | `/etc/nginx/sites-available/alcusa-prod.conf` (enabled): HTTP only. `www` block -> 301 to apex; apex block has `root /var/www/alcusa/prod/current`, static/headers/noindex snippets (marked REMOVE at launch), `/_astro/` immutable, `try_files`. **No** admin locations, **no** `/api/promotions.json`, **no** `/media/promos/`, **no** CSP, no TLS. Default server is :80 only (443 falls to the dev vhost for unknown SNI) |
| `/var/www/alcusa/prod` | `current -> releases/000-empty` (placeholder `index.html`, 37 bytes). No `shared/` |
| `/opt/alcusa/prod` | does not exist. `/etc/alcusa` holds only `dev-api.env`, `dev-migrate.env` |
| sudo allowlist | as runbook 2.1: only `*-dev` units/journal, nginx -t/-T/reload, `tee /etc/nginx/htpasswd/alcusa-dev`, certbot renew/certificates/exact cutover command, ufw status, fail2ban `status [sshd]`/`unbanip`, `alcusa-backup.sh`, `alcusa-admin-bootstrap` (no args), `ls -l /var/backups/alcusa`; as `alcusa`: only `dev-api.env` create-admin/import-promos/promos-status. `(ALL:ALL) ALL` is present but inert (locked password) | **Update after R7:** `nginx -T` and the `--register-unsafely-without-email` certbot line are removed from 91; 92 adds the prod lines (absolute CLI paths), the exact certbot line without an email flag, `certbot show_account`, and `alcusa-prod-admins`.
| **Blocked without root** | everything for prod admin: DB `alcusa_prod` + accounts, `prod-*.env`, unit `alcusa-admin-prod`, `/opt/alcusa/prod`, `/var/www/alcusa/prod/shared` (alcusa-owned), vhost edit (admin, API, media, CSP), htpasswd, fail2ban jail, sudoers for the prod unit, dev pepper, backup of prod, restart of any `*-prod` unit, noindex removal. **Not blocked:** SEC-004 rotation (`tee .../alcusa-dev` + reload are allowlisted), static `deploy.sh prod`, dev admin release (after the pepper exists), certbot (exact command), nginx -t/reload |
| promos | `promos-status` on dev: store=mariadb, total 3, published 3, drafts 0, archived 0, all `VIGENTE` (2026-10-01..2026-10-31): promo-puerta-aquaclara $222.00, promo-corrediza-nevado $260.00, promo-aquafold $279.99. `shared/data/promotions.json` `generated_at` = **2026-10-17T01:56:40Z** (the file is rewritten on every publish), so no edit has been published since the Oct-16 re-seed. Media: 9 files (promo-{1,2,3}-{600,900,amb}.webp, 604 KB) |

## 2. Repo findings

### 2.1 What `admin-dev.sh` hardcodes (docs/ops/scripts/admin-dev.sh)
`RBASE=/opt/alcusa/dev`, `SERVICE=alcusa-admin-dev`, `ADMIN_PATH=/ops-dev`, `ADMIN_PORT=4500`, `API_ENV=/etc/alcusa/dev-api.env`, `MIGRATE_ENV=/etc/alcusa/dev-migrate.env`, `BASE_URL=https://dev.alcusasv.com`, `BASIC_AUTH_FILE=~/.alcusa/dev-basic-auth.txt`; the health check is `127.0.0.1:4500/ops-dev/login`; `as_app` uses `dev-api.env`; `status` probes `/ops-dev/login`; `seed` defaults to `../03-dev-wt/assets-oficiales`. `alcusa-admin-bootstrap.sh` hardcodes `ENV_NAME=dev`, `VHOST=alcusa-dev.conf`, `DB_NAME=alcusa_dev`, DB users `alcusa_migrate`/`alcusa_app` (global names, so prod needs different ones), the sed anchor on the server-level `include snippets/alcusa-noindex.conf;` in the dev vhost, unit text "(dev)", and the backup script (dev DB + dev shared only).
**Gotcha:** `find_server_dir` prefers `../03-dev-wt/admin-v1/server` when it exists. It DOES exist on this machine (stale worktree). Always pass `ADMIN_SERVER_DIR="<03-dev>/server"`.

### 2.2 Minimal generalisation (spec for senior-devops; dev behaviour unchanged)
1. `git mv admin-dev.sh admin.sh`; add at the top `ENVN="${1:-}"` (`dev|prod`, shift) and a `case` that sets the constants. Dev values stay exactly the current ones; keep `admin-dev.sh` as a 3-line shim `exec bash "$(dirname "$0")/admin.sh" dev "$@"`.

| const | dev (unchanged) | prod |
|---|---|---|
| RBASE | /opt/alcusa/dev | /opt/alcusa/prod |
| SERVICE | alcusa-admin-dev | alcusa-admin-prod |
| ADMIN_PORT | 4500 | 4501 |
| API_ENV / MIGRATE_ENV | dev-api.env / dev-migrate.env | prod-api.env / prod-migrate.env |
| HEALTH_PATH (new) | /ops-dev/login | /api/health (path-independent: the admin path is secret and the deploy user cannot read `prod-api.env`) |
| ADMIN_PATH (probes only) | /ops-dev | `$ALCUSA_PROD_ADMIN_PATH` (from a local secret file, never committed); probe skipped if unset |
| BASE_URL | https://dev.alcusasv.com | https://alcusasv.com |
| BASIC_AUTH_FILE | ~/.alcusa/dev-basic-auth.txt | ~/.alcusa/prod-admin-basic.txt (separate credential) |
| default server dir | unchanged | `$REPO_ROOT/server` only (never the worktree) |

2. `REMOTE_LIB`: `health()` uses `$health_path`; `as_app` uses the env's API_ENV (both are already interpolated at heredoc time, so only the values change).
3. `bootstrap` subcommand: dev only. For prod the root script in section 4 replaces it today (follow-up: fold it into `alcusa-admin-bootstrap.sh` behind the same `case`).
4. New subcommand `clone-promos` (prod only), section 5.
5. `seed` stays dev-only (a prod seed from the repo would overwrite Alcusa's edits). Reject `seed` for prod.
6. Prod `release` ends with the allowlisted `sudo -n systemctl restart alcusa-admin-prod` and `journalctl -u alcusa-admin-prod -n 25 --no-pager` (added in R6). `ASSERT`: prod `release` must refuse to run unless `ADMIN_SERVER_DIR`'s git HEAD equals the `dev` release commit shown by `admin.sh dev status` (same build in both).

### 2.3 How the public site gets promos at runtime
The build bakes `src/content/promotions.json` into the HTML (seed + SEO + no-JS fallback; `promoRegistry.ts` SEED). At load, `promotionsRuntime.ts` and the cotizador fetch `/api/promotions.json` (8 s / 2.5 s timeouts), validate with the same parser, filter by El Salvador date, max 3; **any failure leaves the baked build version untouched**. In dev the file comes from the admin (`alias .../shared/data/promotions.json`) and images from `/media/promos/` (`isSafePromoImage` allows `/media/promos/` and `/images/promos/`). In prod this only works if the prod vhost serves both locations from `/var/www/alcusa/prod/shared` (R4 adds them). **Fallback exists:** if the endpoint 404s the site silently shows the build seed (repo `src/content/promotions.json`, `generated_at` 2026-10-06, same 3 promos). Consequence: a missing/failed admin publish is invisible and stale content could show. Mitigation: after cutover check `curl .../api/promotions.json` returns 200 JSON (stage C9), and keep the repo seed equal to the clone (optional pre-build step: copy dev's current published JSON over `src/content/promotions.json` before the prod build; recommended, decision 8).

## 3. Ordered plan

### Stage A - SEC-004 rotate the dev basic-auth [deploy, local Git Bash] (~5 min, no root, blocker)
Coordinate with QA (QA agents read the local file; do not rotate mid-run). Password never printed.
```bash
f=~/.alcusa/dev-basic-auth.txt
cp -p "$f" ~/.alcusa/dev-basic-auth.txt.bak-20261022          # old (compromised) value, kept only for rollback, shred it at end of day
new="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-28)"
( umask 077; printf 'alcusa:%s\n' "$new" > "$f.new" )
h="$(printf %s "$new" | openssl passwd -6 -stdin)"; unset new
printf 'alcusa:%s\n' "$h" | ssh -o BatchMode=yes -o UserKnownHostsFile="$(cygpath -m "$PWD/docs/ops/known_hosts")" -o StrictHostKeyChecking=yes deploy@179.236.251.239 'sudo tee /etc/nginx/htpasswd/alcusa-dev >/dev/null && sudo systemctl reload nginx'
unset h
# verify the NEW credential (and that the old one is refused) without printing it:
# verify without printing either value (SEC-027): the NEW credential works, the OLD one is refused. Credentials go through curl -K - on stdin only.
unset HISTFILE
ALCUSA_BASIC_AUTH_FILE="$f.new" bash docs/ops/scripts/admin-dev.sh status                       # expect 200s
Rollback: `cp -p ~/.alcusa/dev-basic-auth.txt.bak-20261022 "$f"` and rerun the hash/tee with it. Afterwards delete the .bak (`shred` gives no guarantee on NTFS; delete and accept). The old value stays in git history (commits 1c367a4, bd59978 only unindexed it): the rotation is what makes it harmless. Never reuse this value anywhere in prod.
- [ ] QA / CI secrets that store the dev basic-auth (QA agents' local file, GitHub Actions secrets if any) updated to the new value in the same step; run one QA smoke against dev with the new credential.
- [ ] old credential returns 401 (above), new 200 on `/` and `/ops-dev/login`; `.bak` deleted at end of day.
printf 'user = "%s"\n' "$(tr -d '\r\n' <"$f.bak-20261022")" | curl -sS -K - -o /dev/null -w 'old /: %{http_code}\n' https://dev.alcusasv.com/        # expect 401
printf 'user = "%s"\n' "$(tr -d '\r\n' <"$f.bak-20261022")" | curl -sS -K - -o /dev/null -w 'old /ops-dev/login: %{http_code}\n' https://dev.alcusasv.com/ops-dev/login   # expect 401
mv "$f.new" "$f"
```
Rollback: `cp -p ~/.alcusa/dev-basic-auth.txt.bak-20261022 "$f"` and rerun the hash/tee with it. Afterwards `shred -u` the .bak (Git Bash: `shred` exists; else overwrite+delete). Update any CI/QA secret that stores the dev basic-auth. Never reuse this value anywhere in prod (the prod admin layer gets its own, R5).

### Stage B - Root bootstrap [root; the user in their OWN terminal; no hPanel] (~10 min)
Constraint (2026-10-22): the user has NO hPanel. They have the Hostinger API token and SSH as `deploy` (key `~/.ssh/id_ed25519`, no passphrase). Root is reached only through `su -` from a deploy session (or the Hostinger console); `PermitRootLogin no` and password SSH auth stay off.
B1 [Foreman, deploy]: from the repo copy of `docs/ops/scripts/alcusa-prod-root.sh` (already LF), `sha256sum` it, `ssh deploy@... 'mkdir -p -m 700 handoff'`, `scp` it to `/home/deploy/handoff/alcusa-prod-root.sh`, `ssh ... sha256sum handoff/alcusa-prod-root.sh` must equal the local hash. The user reads the script (~380 lines) and computes the hash of the file THEY read.
B2 [user, SEC-018] set the root password through the Hostinger API ("set root password", VM 2021291): preferred, a local script that generates the value, calls the API and never prints it (kept only in the clipboard/own password manager); alternative through MCP only if the user explicitly accepts that the value appears in the tool call. Never paste it in chat. It is useless remotely (no root SSH, no password SSH) and R9 locks it at the end of the run.
B3 [user, own terminal]:
```
ssh -t deploy@179.236.251.239
su -                      # type the root password
<the one-line paste from section 4.3, with <EMAIL> filled in>
```
Fallback: the same paste in an hPanel/Hostinger console root terminal.
B4 [user, SAME root session, before `exit`] the script ends with `passwd -l root` only on full success (on failure it says "root password is still UNLOCKED", re-run). Print `cat /root/alcusa-handover/prod-admin-path.txt` and `cat /root/alcusa-handover/prod-admin-basic.txt` on your own screen, deliver them to Alcusa over TWO different channels (the admin account password is typed at C4 and goes through a third), then `shred -u /root/alcusa-handover/prod-admin-*.txt`, remove `/home/deploy/handoff/*` and `/root/alcusa-prod-root.sh` (keep the `.log`; the log has no secrets), `passwd -S root` shows `L`, `exit` twice. Later root work needs a new root password via the API.
B5 [deploy]: verify (section 4.4).
Rollback: nothing public changes in this stage. Prod vhost backup is `/root/alcusa-srv/backup/alcusa-prod.conf.<ts>`; sudoers backups in `/root/alcusa-srv/backup/sudoers.d.<ts>` and `91-deploy-allowlist.<ts>`; remove `/etc/nginx/snippets/alcusa-admin-prod.conf` + the include, `systemctl disable alcusa-admin-prod`, delete `/etc/sudoers.d/92-deploy-prod`; `DROP DATABASE alcusa_prod` is safe before data exists. All of these need a new root password session.

### Stage C - Admin release, promo clone, admin account
C1 [deploy, ~5 min] SEC-011 canary on dev (same build that goes to prod; auto-rolls back on a failed health check):
`ADMIN_SERVER_DIR="<03-dev>/server" bash docs/ops/scripts/admin.sh dev release` then `admin.sh dev status`. Expect healthy; log should show the new warn-level `admin.locked` alerts only on abuse. Build from the merged `dev` commit (after the label change merges; `server/` is unaffected by it).
C2 [deploy, ~3 min] `ADMIN_SERVER_DIR="<03-dev>/server" bash docs/ops/scripts/admin.sh prod release` (builds, uploads, `npm ci`, migrate with `prod-migrate.env`, grants, switch, restart, health on `127.0.0.1:4501/api/health`). Rollback: `admin.sh prod rollback`, or `sudo systemctl stop alcusa-admin-prod`.
C3 [deploy, ~3 min] promo clone, section 5.
C4 [TTY - user, ~2 min] create the single admin account `alcusa` (14+ chars, typed by the user at the prompt; first login forces a change). Absolute script path is REQUIRED by the sudoers line (SEC-021):
`ssh -t deploy@179.236.251.239 'sudo -u alcusa /usr/local/bin/node --env-file=/etc/alcusa/prod-api.env /opt/alcusa/prod/current/dist/cli/create-admin.js alcusa --prompt'`
Recovery: same with `--rotate`.
C5 [deploy] **exactly 1 admin account (SEC-021/I-3):** `ssh deploy@179.236.251.239 'sudo /usr/local/sbin/alcusa-prod-admins'` -> `admins=1 users=alcusa`. Anything else: stop and investigate before DNS.

### Stage D - Static prod release, tested on the IP before DNS
D1 [deploy, after the label change merged to dev and QA is green; build with `PUBLIC_SITE_URL=https://alcusasv.com PUBLIC_QUOTE_API=mock npm run build`; without `PUBLIC_QUOTE_API=mock` the 2026-10-22 build shipped http mode and "Cargar cotización" failed (now mock is the default, still pass it explicitly)] then `bash docs/ops/scripts/deploy.sh prod dist` **[TTY]** (it asks to type `prod`; the Foreman can pipe `echo prod |` if the user approves). Pre-build: confirm `dist/robots.txt` and the sitemap name (runbook says `sitemap-index.xml`, repo robots.txt says `sitemap.xml`; align with what the build emits), no `noindex` meta in `dist`, `dist` has the `promotions.json` seed per decision 8, and the CSP hashes (decision 3) match the dist.
D2 [deploy, no credentials on the wire] `curl -sI --resolve alcusasv.com:80:179.236.251.239 http://alcusasv.com/` -> 200, **no `X-Robots-Tag`** (public site is indexable); `www` -> 301; `.../api/promotions.json` -> 200 JSON with 3 promos, no `X-Robots-Tag`; `.../media/promos/promo-1-900.webp` -> 200; `GET http://alcusasv.com/<anything>` -> 404 and no admin fingerprint; legacy Wix paths (section 0): `curl -sI --resolve ... http://alcusasv.com/shop` -> 301 `Location: http://alcusasv.com/` (HTTP window: `$scheme` form), same for `/book-online`, `/product-page/x`, `/service-page/x`. **[user, own terminal]** admin path WITHOUT credentials: `curl -s -o /dev/null -w '%{http_code}\n' --resolve alcusasv.com:80:179.236.251.239 "http://alcusasv.com<ADMIN_PATH>/login"` -> 401 (path from `prod-admin-path.txt`; never send credentials over HTTP: admin login is tested only after TLS, Stage E).
Rollback: `deploy.sh prod --rollback` (to `000-empty`). Nothing is public yet.

### Stage E - DNS flip + TLS (go-live; pick a low-traffic window; user with a terminal open) (~15 min + propagation)
E0 [DNS] list the zone; record it. Confirm TTL 300 on `@`/`www`; MX (5 Google) and SPF TXT as in runbook 7; **list every other record for subdomains** (decision 5). **Gate (SEC-022):** `ssh deploy@... 'sudo certbot show_account'` shows an e-mail (set by R6b). If not, do not flip: a root session (API password + `su -`) with `certbot update_account --email <EMAIL> --no-eff-email --agree-tos` first.
E1 [DNS] `dns_records_validate` then update exactly as runbook section 8 step 1 (A `@` -> 179.236.251.239, CNAME `www` -> `alcusasv.com.`, `overwrite=true` limited to those name+type pairs), then step 2 (AAAA `@` -> 2a02:4780:95:a6f::1, `overwrite=false`), then re-list and confirm MX/TXT byte-identical.
E2 [deploy] wait for public resolvers (`nslookup alcusasv.com 8.8.8.8`, `1.1.1.1`, `www ... 8.8.8.8`); then immediately
`ssh deploy@179.236.251.239 'sudo certbot --nginx -d alcusasv.com -d www.alcusasv.com --redirect --non-interactive --agree-tos && sudo nginx -t && sudo certbot renew --dry-run'`
No `-m`/`--register-unsafely-without-email` here: the registered account (with `<EMAIL>`, E0 gate) is reused; see 4.2 for why `-m` is not in the sudoers line.
Exposure window (HTTP only, TLS not yet issued) is the propagation time plus ~1 minute. Let's Encrypt allows 5 failed validations/hour/host: do not loop; if it fails, read `journalctl`/certbot log via the allowlist, fix, retry at most twice, otherwise DNS-rollback.
E3 [deploy + user] verify (SEC-014, SEC-029):
 - `curl -sI https://alcusasv.com` 200 + `strict-transport-security: max-age=31536000` (no includeSubDomains) + NO `x-robots-tag`; `curl -sI http://alcusasv.com` 301 -> https; `https://www.alcusasv.com/x` 301 -> `https://alcusasv.com/x`; `openssl s_client -tls1_1` rejected, `-tls1_2`/`-tls1_3` OK; `sudo certbot certificates` shows both names and expiry; `systemctl list-timers certbot.timer`.
 - **Legacy redirects, max 2 hops from `http://www`:** `curl -s -o /dev/null -L -w '%{num_redirects} %{http_code} %{url_effective}\n' http://www.alcusasv.com/shop` (also `/book-online`, `/product-page/puerta-de-ba%C3%B1o-aquafold`, `/product-page/puerta-de-ba%C3%B1o-frosted`, `/product-page/copia-de-soy-un-producto`, `/service-page/asesoria-para-remodelar-tu-ba%C3%B1o`) expect `2 200 https://alcusasv.com/`; same from `http://alcusasv.com/...` and `https://alcusasv.com/...` (2, 2, 1 hops).
 - **HTTP admin must redirect (SEC-029) [USER, own terminal; only they hold the path]:** `curl -s -o /dev/null -w '%{http_code}\n' "http://alcusasv.com<ADMIN_PATH>/login"` must print `301` (not 401/200). Paste the path from `prod-admin-path.txt` yourself; do not share the output beyond the code.
 - **Unknown SNI / bare IP rejected:** `curl -sk -o /dev/null -w '%{http_code}\n' https://179.236.251.239/` and `curl -sk -o /dev/null -w '%{http_code}\n' --resolve evil.example:443:179.236.251.239 https://evil.example/` must fail the handshake (`000`, curl exit 35); `curl -sI http://179.236.251.239/` must not return the Alcusa site or the admin (expect closed/444/404). Record all three in the go-live note.
E4 [user + Foreman] admin live check over HTTPS: `https://alcusasv.com/<path>/login` (path+basic credential from the handover files) -> basic prompt, then admin login (account `alcusa`); wrong path -> 404 of the static site; `/<path>/login` without basic credential -> 401. Do not edit real data to test; check the login page loads and the session works, then log out.
E5 [user] mail check: send/receive a test email with an @alcusasv.com mailbox.
E6 [deploy] jail test from the user's throwaway IP (a phone on mobile data): 9 wrong basic-auth attempts to the admin path -> `sudo fail2ban-client status alcusa-admin` shows the ban; `sudo fail2ban-client set alcusa-admin unbanip <ip>` (allowlisted by R7) restores.
E7 monitor 30 min: `sudo journalctl -u nginx -u ssh -u fail2ban --since today --no-pager`, `journalctl -u alcusa-admin-prod`.
DNS rollback (24-48 h window): runbook section 8 "DNS rollback to Wix" JSON, then delete `@ AAAA` only, re-list, MX/TXT untouched. With HSTS already sent (1 year) browsers that visited the new site over HTTPS will refuse Wix over plain HTTP, but Wix serves HTTPS on its own cert for the domain only if the domain is still connected there; so decide the rollback quickly (first hours) or accept that returning visitors may see HTTPS errors if Wix lacks a cert (decision 4).
Cert rollback = DNS rollback (a cert is not "undone"; `certbot delete` needs a root session, only if abandoning the VPS plan).

### Stage F - After go-live
F1 verify noindex is absent on the public site (section 7) and add Search Console (separate approved DNS change). F2 24-48 h later [user/Alcusa]: disconnect domain in Wix (their call). F3 1-2 weeks: raise TTLs to 3600 (runbook 8 step 8). F4 within a week: off-box encrypted backup copy + restore test (decision 7; SEC-030). F5 **CSP enforcement by 2026-10-29** (SEC-028). F6 delete `dev-basic-auth.txt.bak-20261022`. F7 weekly `sudo certbot certificates` expiry glance + an external uptime/cert-expiry monitor (SEC-022; HSTS is 1 year). F8 first week: `sudo /usr/local/sbin/alcusa-prod-admins` still `admins=1 users=alcusa` and `journalctl` has no unexpected `create-admin` (SEC-021). F9 deploy-key passphrase (see 4.2).

## 4. Root bootstrap

### 4.1 Recommendation: one reviewed root script, pasted once (not a sudoers drop-in)
A time-boxed `NOPASSWD: ALL` drop-in re-opens the exact hole SEC-002 closed and keeps a root-equivalent SSH key live while agents run many commands (and a forgotten removal is a permanent regression). The script does all root work itself with a fixed, reviewed set of actions, ends with a **narrow additive allowlist** (prod unit, prod CLIs, fail2ban jail), and needs a single paste. Trade-off: if something fails mid-way the user must paste a fix; mitigated by idempotency, `set -euo pipefail`, `nginx -t` with automatic restore, `visudo -cf` before installing sudoers, and a sha256 pin (the paste installs a root-owned copy first and checks the hash on THAT copy, so `deploy` cannot swap the file between review and execution).
Secrets are generated on the server and never printed: DB passwords (`openssl rand -hex 24`), `IP_HASH_PEPPER` (`openssl rand -base64 32`), the random admin path (`/ops-` + 24 hex), and the admin-layer basic-auth password. The only place plaintext access info lands is `/root/alcusa-handover/prod-admin-access.txt` (root, 600), which the user prints on their own screen when handing over.

### 4.2 The script: `docs/ops/scripts/alcusa-prod-root.sh` (single source of truth)
The plan no longer carries a copy (it drifted). The file is LF, bash (`#!/usr/bin/env bash`, `set -euo pipefail`), enforced by `.gitattributes` (`*.sh text eol=lf`). What it does, with the finding each step closes:

| Step | Does | Findings |
|---|---|---|
| pre-flight | requires root; refuses if ANY other 443 `default_server` exists (before any change); detects a certbot-managed vhost and sets `SKIP_VHOST` | SEC-026b/d |
| R1-R4 | dirs, DB `alcusa_prod` + 2 accounts, env files (600), pepper, random admin path, unit `alcusa-admin-prod` (enabled, not started) | |
| R5 | handover FIRST then htpasswd (matching pair re-issued if either is missing); two separate handover files (`prod-admin-path.txt`, `prod-admin-basic.txt`); admin snippet; access log created only if absent; legacy Wix redirect snippet; prod vhost WITHOUT noindex; `ssl_reject_handshake` default server; `nginx -t` with restore | SEC-025, 026, noindex, SEO |
| R6 | fail2ban jail; regex self-test is FATAL (expects `Lines: 3 lines, 0 ignored, 2 matched, 1 missed`) and the jail must show the log file in `File list` | SEC-019 |
| R6b | `certbot update_account` with `CERTBOT_EMAIL` (env on the paste line) | SEC-022 |
| R7 | `92-deploy-prod` (absolute `/opt/alcusa/prod/current/dist/cli/*.js` paths, exact certbot line without email flag, `certbot show_account`, `alcusa-prod-admins`), then rewrites `91-deploy-allowlist` without `nginx -T` and without the `--register-unsafely-without-email` line: `visudo -cf` before `install`, `visudo -c` after, 15-minute dead-man timer restoring the old file, and a before/after comparison of `sudo -l -U deploy` (nothing else may be lost) | SEC-020, 021, 022 |
| R8 | backups for dev AND prod (`if` instead of `[[ ]] &&`) | SEC-030 (part) |
| R9 | `passwd -l root`, only on full success. Any earlier failure prints "root password is still UNLOCKED - re-run" and leaves root usable | Foreman constraint |

Notes:
- **certbot `-m` decision (SEC-022).** The old allowlisted line was an exact match including `--register-unsafely-without-email`, so a `-m` form would have been refused. A wildcard for certbot arguments is root-equivalent (`--pre-hook`), so I did NOT add one. Instead the e-mail is registered once as root (R6b, `certbot update_account`, via `CERTBOT_EMAIL` on the paste line) and the allowlisted E2 command carries no email flag (certbot reuses the registered account). The unsafe line is removed from 91.
- **SEC-021 absolute paths.** The sudoers lines use `/opt/alcusa/prod/current/dist/cli/*.js`; any caller (C4, `admin.sh prod`, importer) must pass that absolute path, not `dist/cli/...` relative to cwd. senior-devops: `admin.sh prod as_app` must use the absolute path or sudo will refuse it. Dev lines are unchanged (relative).
- **Residual SEC-021:** the deploy SSH key has no passphrase (user, 2026-10-22), so a stolen laptop/key = prod admin takeover. Recommend adding a passphrase (ssh-agent) after go-live; needs explicit acceptance.
- Secrets are generated on the server and never printed: DB passwords, `IP_HASH_PEPPER`, admin path, basic-auth password. Plaintext lands only in the two 0600 handover files under `/root/alcusa-handover/`.

### 4.3 The one paste (sha256 of the LF file; the user also computes the hash of the copy they read)
User line, in the root session (`su -` from the deploy SSH session; also works in an hPanel/console root terminal). `<EMAIL>` = the ops mailbox someone reads (Foreman fills it); the hash does not depend on it:
```
install -m 700 -o root -g root /home/deploy/handoff/alcusa-prod-root.sh /root/alcusa-prod-root.sh && echo "ada0248788455d0a69bc970ca01ac6d6e48008577ffc1db7d788c59d15f9d9d5  /root/alcusa-prod-root.sh" | sha256sum -c - && CERTBOT_EMAIL='<EMAIL>' bash /root/alcusa-prod-root.sh 2>&1 | tee /root/alcusa-prod-root.log
```
`/home/deploy/handoff` is mode 700 owned by deploy; root reads it regardless, so `su -` works. Hash to compare against `sha256sum docs/ops/scripts/alcusa-prod-root.sh` on the user's own machine: `ada0248788455d0a69bc970ca01ac6d6e48008577ffc1db7d788c59d15f9d9d5`.

### 4.4 Verify after the paste [deploy]
The script itself already fails (non-zero, root stays unlocked) if the fail2ban regex does not match 2 of 3 sample lines, if the jail is not watching the log, if `nginx -t` fails, if `visudo` rejects a file, or if the live sudo rules lost anything besides `nginx -T` and the unsafe certbot line. After it: `sudo -n -l` (prod lines present; `sudo -n id` and `sudo -n nginx -T` refused: SEC-020); `sudo nginx -t`; `ls -l /var/www/alcusa/prod/shared` (alcusa:www-data 2755); `ls -l /etc/alcusa` (adds `prod-api.env`, `prod-migrate.env`; modes/owners only); `sudo fail2ban-client status alcusa-admin` (File list shows `alcusa-admin-prod.access.log`); `sudo systemctl status alcusa-admin-prod --no-pager` (enabled, inactive until the first release); `sudo certbot show_account` (shows the e-mail: SEC-022, REQUIRED before Stage E); `curl -sI --resolve alcusasv.com:80:179.236.251.239 http://alcusasv.com/` -> 200 (placeholder) or 404; `sudo /usr/local/sbin/alcusa-backup.sh` and `sudo ls -l /var/backups/alcusa` show both DBs. Root lock: the user confirms `passwd -S root` shows `L` (the script also prints the lock line).
Re-run safety: the script can be pasted again (also after certbot): it never truncates the admin access log, skips the vhost rewrite once `listen 443` exists, and re-applies jail/sudoers/backup. If only a handover file is missing, a re-run re-issues a matching basic-auth pair (the previously delivered basic password is then invalid). If root was already locked, set a new root password through the API first.

## 5. Promo migration dev -> prod (current state, not the repo seed)
Source of truth: dev's published `shared/data/promotions.json` + `shared/media/promos/*.webp` (the importer accepts exactly this document format and regenerates the `-amb.webp` thumbnails). All deploy-runnable after C2 (uses the prod sudoers line; the importer is the supported, validated path, no raw SQL, no root).
1. Pre-check [deploy]: `ssh deploy@... 'cd /opt/alcusa/dev/current && sudo -n -u alcusa /usr/local/bin/node --env-file=/etc/alcusa/dev-api.env dist/cli/promos-status.js; grep -o "generated_at[^,]*" /var/www/alcusa/dev/shared/data/promotions.json'`. Expect `drafts=0 archived=0` and `generated_at` 2026-10-17T01:56:40Z (or later if Alcusa edited). **If drafts/archived > 0** the published JSON does not contain them: either have Alcusa publish/delete them first or recreate them in the prod panel (decision 8); do not guess.
2. Stage [deploy]:
```bash
stage="$(ssh ... 'd=$(mktemp -d /var/tmp/alcusa-seed.XXXXXX) && chmod 755 "$d" && echo "$d"')"
ssh ... "mkdir -p $stage/src/content $stage/public/media/promos && cp /var/www/alcusa/dev/shared/data/promotions.json $stage/src/content/ && cp /var/www/alcusa/dev/shared/media/promos/*.webp $stage/public/media/promos/ && chmod -R u=rwX,go=rX $stage"
```
3. Dry-run then import+publish [deploy] (cwd `/opt/alcusa/prod/current`; the command must match the sudoers line, flags after the script path):
`sudo -n -u alcusa /usr/local/bin/node --env-file=/etc/alcusa/prod-api.env dist/cli/import-promos.js $stage/src/content/promotions.json --allow-production --site-public-dir $stage/public --dry-run` (expect crear=3, imagenes_a_copiar=6), then the same without `--dry-run` and with `--publish`, then `promos-status.js`. Remove `$stage`.
4. Verify [deploy]: prod `promos-status` equals dev's (ids, status, prices, dates); `diff <(sha256sum /var/www/alcusa/dev/shared/media/promos/*-{600,900}.webp | cut -d' ' -f1 | sort) <(same for prod)` (the `-amb` files are re-rendered, compare file names only); `curl --resolve ... /api/promotions.json` JSON equals dev's apart from `generated_at`; spot-check `/media/promos/promo-1-900.webp` 200 `image/webp`.
5. Implement as `admin.sh prod clone-promos` so the Foreman runs one command. Do NOT run `seed` against prod. Re-check dev's `generated_at` just before running; if Alcusa edits dev during cutover, rerun the clone (idempotent upsert) before DNS.
Rollback: the prod panel is the data owner after go-live; before go-live the prod DB can be dropped/re-created (`DROP DATABASE alcusa_prod` in a root session) and the clone rerun. Dev data is never modified.

## 6. Admin prod hardening (runbook 11.7) - how each item is met
| Item | Implementation |
|---|---|
| Random path | `ADMIN_BASE_PATH=/ops-<24 hex>` generated in R3, only in `prod-api.env` (alcusa 600) and the 0640 root nginx snippet, handed over once via the handover file |
| Second layer | dedicated `auth_basic` (user `ops`, random password, `alcusa-prod-admin` htpasswd, different from dev's) + path secrecy + `limit_req` (60/min route, 5/min login per IP) + fail2ban + app-level backoff (SEC-007) |
| fail2ban | jail `alcusa-admin` on `/var/log/nginx/alcusa-admin-prod.access.log` (admin locations only): 8 hits (401 with a supplied user, or 429) in 10 min -> 1 h ban; the browser's initial no-credential challenge (user `-`) is not counted |
| Data separation | DB `alcusa_prod`, accounts `alcusa_prod_migrate` / `alcusa_prod_app` (dev accounts have no grants on it and vice versa) |
| Env | `/etc/alcusa/prod-api.env` (alcusa 600: service config, `DB_APP_PASSWORD`, `IP_HASH_PEPPER`, path), `/etc/alcusa/prod-migrate.env` (deploy 600: DDL credential). `SECRETS_KEY` is not required by the admin entry (only by the quotes API, which is not deployed: PDF/WhatsApp scope), so it is not generated now |
| Unit | `alcusa-admin-prod` (same sandbox as dev, port 4501, loopback) |
| 2FA | `ADMIN_MFA_MODE=off` = SEC-015 accepted risk (v1.1 plan) |

IP allowlist vs `auth_basic`: an allowlist (`allow <ip>; deny all;` answering 404) is the strongest and invisible, but Alcusa's ISP IP is very likely dynamic (and they may use mobile data), so a stale allowlist locks the only operator out and the fix needs a root session. `auth_basic` works from anywhere, adds a second independent secret and the credential is useless without the secret path; its weakness is that it is a shared secret (rotate on staff change) and it is guessable only by brute force, which the jail + `limit_req` bound. **Recommendation: `auth_basic` + secret path + fail2ban now; add an allowlist later only if Alcusa gets a static IP / VPN.**

## 7. Headers, TLS, CSP, noindex
- **TLS (SEC-014):** certbot's `options-ssl-nginx.conf` -> TLS 1.2/1.3, AEAD ciphers; HTTP->HTTPS 301 via `--redirect`; `server_tokens off` is already set; unknown SNI gets `ssl_reject_handshake` (R5). HSTS: shared snippet gives `max-age=31536000` (no `includeSubDomains`, no `preload`). Keep that at cutover; add `includeSubDomains` only after E0 shows every subdomain is HTTPS-capable (`mail.`-style Google CNAMEs can be HTTP-only); never `preload` yet. Acceptance: SSL Labs/testssl A, `curl -I http://alcusasv.com` 301.
- **Other headers:** nosniff, X-Frame-Options SAMEORIGIN, Referrer-Policy, Permissions-Policy come from `alcusa-headers.conf` and are re-included in every location with its own `add_header` (the prod vhost above does this).
- **CSP:** prod includes the same `alcusa-csp-report-only.conf` as dev (Report-Only). Hashes cover the build's inline Astro scripts; they go stale when an inline script changes, which would BREAK an enforcing policy. **SEC-028 accepted with a dated follow-up: enforce by 2026-10-29** once a helper regenerates the hashes from `dist` on every deploy; until then no new inline scripts without regenerating hashes. Admin pages keep the app's own strict CSP.
- **noindex: REMOVED for the public site at cutover (user decision 2026-10-22).** `alcusa-prod-root.sh` writes the prod vhost WITHOUT any `include snippets/alcusa-noindex.conf` (server level and the `/api/promotions.json`, `/media/promos/`, `/_astro/` locations), so there is nothing to sed later. The admin stays noindex because `alcusa-admin-proxy-prod.conf` (derived from the dev proxy snippet) includes the snippet itself and hides the app's own header. The shared snippet `alcusa-noindex.conf` is NOT edited: dev keeps using it. Verify after Stage D/E: `curl -sI https://alcusasv.com | grep -i x-robots` prints nothing; `curl -sI https://dev.alcusasv.com | grep -i x-robots` (with dev basic auth) still shows noindex; the admin path response (user runs it) still shows `x-robots-tag: noindex`. Preconditions that used to gate removal (runbook 9) are accepted risks now: confirm `dist/robots.txt` points at the sitemap the build really emits and that `dist` has no `<meta name="robots" content="noindex">` and canonical `https://alcusasv.com` (D1 pre-build). Search Console (TXT with `overwrite=false`, keeps SPF) and sitemap submit are a separate approved DNS change afterwards.
- **Legacy Wix URLs (SEO):** see section 0.

## 8. Pre-checks, live-checks, time
Pre-checks before Stage E: Stage A done; B5 verification green; C1/C2 healthy; promos cloned and equal; prod admin account created and tested only by loopback health (not over HTTP); D2 green; QA green on the merged `dev` commit and the prod `dist` built from it; zone listed (TTL 300, MX/SPF recorded); low-traffic window; user has a terminal and the root password path ready; Wix untouched. Live-checks per stage are inline above. Realistic total: A 5 + B 15 + C 20 + D 15 + E 20 (+ up to 10 min DNS/propagation wait) + F1 5 = **about 90-100 minutes** of hands-on time if the QA/merge/build is ready; the root paste is the only step that depends on the user being at hPanel, and the admin-account creation (C4) on the user typing a password.

## 9. Open decisions for the user (recommendation first)
1. Root approach: one reviewed script pasted once (**recommended**) vs a time-boxed `NOPASSWD: ALL` drop-in (not recommended).
2. Admin second layer: `auth_basic` + secret path + fail2ban (**recommended**) vs IP allowlist (only if Alcusa has a static IP).
3. CSP on prod: Report-Only at cutover and enforce within a week with a hash-regeneration helper (**recommended**) vs enforce today (risk: any inline-script change breaks the site until the snippet is refreshed by root).
4. HSTS 1 year at cutover while Wix is the rollback: **accept** (no `includeSubDomains`/`preload`); alternative `max-age=86400` for the first 48 h needs a prod-specific snippet (root edit). Note a DNS rollback after browsers cached HSTS only works cleanly if Wix serves a valid HTTPS cert for the domain.
5. Before adding `includeSubDomains`: need the full zone listing (Foreman, E0); **recommend deferring** to the 1-2 week follow-up.
6. noindex: **decided 2026-10-22: REMOVED at cutover for the public site** (the prod vhost never includes `alcusa-noindex.conf` on public locations); the admin stays noindex. See section 7.
7. Off-box backup: recommend an encrypted copy (rclone/rsync + `age`) within a week plus one restore test; today's cover is daily local dumps (7 d), Hostinger weekly snapshots (RPO 24 h on the same disk).
8. Promo data: clone from dev's current published state (**recommended**); also sync the repo seed `src/content/promotions.json` from that JSON before the prod build so the no-JS/fetch-failure fallback is not stale (recommended), and tell Alcusa not to edit promos in dev from now on (their edits belong in the prod panel after go-live).
9. DMARC/SPF (SEC-006): not touched (MX/TXT off limits). Recommend a later, separate approved change: `_dmarc` TXT `p=none` with `overwrite=false`.
10. Admin account: **decided 2026-10-22**: username `alcusa`; the user types the initial password at the TTY prompt (C4) and hands it over out of band (first login forces a change).
11. Time window for Stage E (low traffic; the HTTP-only window is minutes) and that the user has the root password ready (API) and a terminal open.
