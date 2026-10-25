# Runbook — Alcusa VPS (Hostinger)

Provisioned 2026-10-06. No secrets in this file. Local secrets are under `C:\Users\carlo\.alcusa\` (never commit).

## 1. Inventory

| Item | Value |
|---|---|
| Provider / plan | Hostinger KVM 2 (2 vCPU, 8 GB RAM, 100 GB disk), VM id `2021291` |
| Data center | 24 (Boston) |
| OS | Ubuntu 24.04 LTS (template 1077, no panel) |
| Hostname | `srv2021291.hstgr.cloud` |
| IPv4 | `179.236.251.239` |
| IPv6 | `2a02:4780:95:a6f::1` |
| Backups | Hostinger weekly backups enabled |
| Hostinger firewall | `alcusa-web` (id `372986`): TCP 22, 80, 443 from any; everything else dropped |
| Host firewall | ufw: OpenSSH, 80/tcp, 443/tcp |
| Timezone | America/El_Salvador |
| Hostinger SSH key | `cdc-carlos` (id 595390) = `C:\Users\carlo\.ssh\id_ed25519.pub` |
| API access | MCP server `hostinger-alcusa` only (never the generic `hostinger` one) |

Installed: nginx, certbot + python3-certbot-nginx, ufw, fail2ban (jails `sshd`, `nginx-http-auth`), unattended-upgrades (daily security updates), rsync.
Added on 2026-10-07 for the admin panel (dev only): Node.js 24, MariaDB 11.4 (loopback only), the `alcusa-admin-dev` service. See section 11.

## 2. Access

```bash
ssh -i ~/.ssh/id_ed25519 deploy@179.236.251.239      # the only login
sudo -n <allowlisted command>                        # deploy has an sudo ALLOWLIST, not root (2.1)
```

- `root` SSH login is **disabled** (`PermitRootLogin no`), password/keyboard-interactive auth are **disabled**. The config is in `/etc/ssh/sshd_config.d/00-alcusa-hardening.conf`. It is the first file in the directory, so it wins over `50-cloud-init.conf`.
- fail2ban bans an IP for 1 h after 5 failures in 10 min. To unban yourself: `sudo fail2ban-client set sshd unbanip <ip>`.
- Break-glass access, if the key is lost or sshd is broken: use the hPanel → VPS → Browser terminal. That needs a root password, and none was set by us; Hostinger generated a random one and we never saw it. Set one in hPanel, or with the `vps_virtual-machines_set-root-password` API. Store it only in `C:\Users\carlo\.alcusa\vps-root.txt`. The console is not SSH, so `PasswordAuthentication no` doesn't block it.
- To add another dev's key, append it to `/home/deploy/.ssh/authorized_keys`. Don't create password users.

### 2.1 sudo allowlist for `deploy` (SEC-002, since 2026-10-17)

`deploy` no longer has `NOPASSWD: ALL`. `/etc/sudoers.d/91-deploy-allowlist` (root:root 440) lists the exact commands below; `/etc/sudoers.d/90-cloud-init-users` keeps only the `root` line. The `deploy` account has a locked password, so the `%sudo` group rule is inert. Anything else answers `sudo: a password is required`.

| Runs as | Allowed (exact arguments; `*` only where shown) |
|---|---|
| root | `systemctl restart\|start\|stop alcusa-admin-dev`, `systemctl status alcusa-admin-dev --no-pager`, `systemctl reload nginx` |
| root | `nginx -t` (NOT `-T`: it prints the secret prod admin path; removed 2026-10-22, SEC-020), `tee /etc/nginx/htpasswd/alcusa-dev` (dev basic-auth hash, via stdin) |
| root | `certbot renew`, `certbot renew --dry-run`, `certbot certificates`, and the exact cutover `certbot --nginx -d alcusasv.com -d www.alcusasv.com --redirect --non-interactive --agree-tos` (no e-mail flag: the account e-mail is registered once as root with `certbot update_account`, SEC-022; `--register-unsafely-without-email` was removed 2026-10-22), `certbot show_account` |
| root | `journalctl -u alcusa-admin-dev -n 25 --no-pager`, `... -u alcusa-admin-dev --since today --no-pager`, `... -u nginx -u ssh -u fail2ban --since today --no-pager` (always with `--no-pager`: a pager is a shell escape) |
| root | `ufw status [verbose]`, `fail2ban-client status [sshd]`, `fail2ban-client set sshd unbanip *` |
| root | `/usr/local/sbin/alcusa-backup.sh`, `ls -l /var/backups/alcusa`, `/usr/local/sbin/alcusa-admin-bootstrap` (root-owned copy, no arguments) |
| alcusa | `/usr/local/bin/node --env-file=/etc/alcusa/dev-api.env dist/cli/create-admin.js *`, `.../import-promos.js *`, `.../promos-status.js` (run from `/opt/alcusa/dev/current`) |

Release dirs, `current` symlinks and `/var/www/alcusa` are owned by `deploy`, so `deploy.sh` needs no sudo at all. `admin.sh <dev|prod>` needs only the `systemctl restart`, `journalctl -n 25` and `sudo -u alcusa node ...` lines above.

What changed for operations:
- `admin.sh dev bootstrap` and `sudo -n bash -s < alcusa-admin-bootstrap.sh` no longer work (`bash -s` would be root). Run `ssh -t deploy@... 'sudo /usr/local/sbin/alcusa-admin-bootstrap'`. The root-owned copy is refreshed only from a root session (hPanel Browser terminal, section 2): copy the script over it, `chmod 755`. `NODE_UPGRADE=1` also needs a root session.
- Editing nginx vhosts/snippets (for example the noindex removal in section 9), restoring the DB (11.6) and changing sudoers need a **root session** through the hPanel Browser terminal (set a root password first, see Break-glass). This is deliberate: write access to nginx config or `mariadb -uroot` is root-equivalent.
- Residual risk: `deploy` can still run JS as the unprivileged `alcusa` user (it owns the release dirs), which gives the app's DB account. It cannot reach root, the MariaDB root account or the nginx config.

Changing the allowlist (always with a net):
1. Back up: `cp -p /etc/sudoers.d/9* /var/backups/alcusa/sudoers-<date>/` (root session).
2. Arm the dead-man switch: a root-only restore script (`/var/backups/alcusa/sudoers-restore.sh`, copies the backup back and removes the new drop-in unless the flag `/var/tmp/sudoers-ok` exists) started by `systemd-run --on-active=15min --unit=sudoers-restore /var/backups/alcusa/sudoers-restore.sh`.
3. Write the new file to a temp path, `visudo -cf <tmp>`, then `install -m 440 -o root -g root <tmp> /etc/sudoers.d/91-deploy-allowlist`.
4. In a NEW SSH session test every command (`sudo -n -l <cmd>` for the disruptive ones), test that `sudo -n id` is refused, run `deploy.sh dev --list`.
5. Cancel the switch with `touch /var/tmp/sudoers-ok` (the user can do it without sudo; the timer then fires and does nothing). If anything fails, do not touch the flag: the timer restores the old rules.

Applied 2026-10-17. Backup of the previous rules: `/var/backups/alcusa/sudoers-20261017/` (`90-deploy`, `90-cloud-init-users`). The old `90-deploy` file was removed.

## 3. Paths on the server

| Path | Purpose |
|---|---|
| `/var/www/alcusa/dev/releases/<UTC-timestamp>/` | dev releases (owner `deploy`) |
| `/var/www/alcusa/dev/current` → `releases/<ts>` | dev docroot (symlink) |
| `/var/www/alcusa/prod/releases/<UTC-timestamp>/` | prod releases |
| `/var/www/alcusa/prod/current` → `releases/<ts>` | prod docroot (currently `000-empty` placeholder) |
| `/etc/nginx/sites-available/alcusa-dev.conf` | `dev.alcusasv.com` (basic auth, noindex, TLS by certbot) |
| `/etc/nginx/sites-available/alcusa-prod.conf` | `alcusasv.com` + `www` → 301 to apex (noindex for now, HTTP only until cutover) |
| `/etc/nginx/sites-available/alcusa-default.conf` | catch-all `default_server`, which returns 444 (bare IP / unknown hosts) |
| `/etc/nginx/snippets/alcusa-static.conf` | gzip, `error_page 404 /404.html`, ACME challenge location |
| `/etc/nginx/snippets/alcusa-headers.conf` | security headers (nosniff, SAMEORIGIN, Referrer-Policy, Permissions-Policy, HSTS 1y) |
| `/etc/nginx/snippets/alcusa-noindex.conf` | `X-Robots-Tag "noindex, nofollow, noarchive" always` |
| `/etc/nginx/htpasswd/alcusa-dev` | dev basic-auth hash (user `alcusa`, password in `C:\Users\carlo\.alcusa\dev-basic-auth.txt`) |
| `/etc/letsencrypt/live/dev.alcusasv.com/` | dev certificate (auto-renew via `certbot.timer`) |
| `/root/alcusa-srv/` | copies of the bootstrap script and the nginx sources used at provisioning |

Nginx serves Astro static output with `try_files $uri $uri/ $uri.html =404` and the build's `404.html`. `/_astro/*` (hashed assets) gets `Cache-Control: public, max-age=31536000, immutable`. No CSP header yet; add one when the final asset and 3rd-party list (analytics; Wompi was retired 2026-10-14) is known.

## 4. Deploy

Script: `03-dev/docs/ops/scripts/deploy.sh` (Git Bash on Windows, or any bash).

```bash
cd "03-dev"
# prod (until the B3/B6 backend is deployed the quote API MUST be mock; see docs/ops/prod-cutover-plan-2026-10-22.md):
PUBLIC_SITE_URL=https://alcusasv.com PUBLIC_QUOTE_API=mock npm run build   # produces dist/
# dev: PUBLIC_QUOTE_API=mock PUBLIC_QUOTE_FIXTURES=1 npm run build  (FIXTURES=1 keeps the sample folios; never in prod)
bash docs/ops/scripts/deploy.sh dev  dist       # dev
bash docs/ops/scripts/deploy.sh prod dist       # prod (asks you to type 'prod')
bash docs/ops/scripts/deploy.sh dev  --list     # releases, * = current
```

What it does:
1. Uploads `dist/` into a new `releases/<UTC timestamp>/`. It uses rsync if it exists locally; if not, tar over ssh. Git Bash has no rsync, so that's fine.
2. Normalizes the permissions.
3. Atomically swaps `current` (`ln -sfn` to a temp link, then `mv -T`), so no request ever sees a half-uploaded site.
4. Keeps the newest 5 releases (`KEEP=5`) and never deletes the one `current` points to.

Env overrides: `ALCUSA_HOST`, `ALCUSA_USER`, `ALCUSA_SSH_KEY`, `KEEP`.

## 5. Rollback (site content)

```bash
bash docs/ops/scripts/deploy.sh prod --rollback               # previous release
bash docs/ops/scripts/deploy.sh prod --rollback 20261006T221731Z   # a specific one
```
This is instant: only the symlink changes, and nginx follows it on the next request without a reload.

## 6. Dev environment

- URL: https://dev.alcusasv.com. It is behind basic auth (user `alcusa`); the credential is in `C:\Users\carlo\.alcusa\dev-basic-auth.txt`.
- It always sends `X-Robots-Tag: noindex, nofollow, noarchive`, and dev builds should also ship `robots.txt` with `Disallow: /`. **Dev stays private and noindex forever.**
- `/.well-known/acme-challenge/` is exempt from auth so that renewals work.
- To rotate the password, generate a new one into the local file. Then, from Git Bash:
  ```bash
  f=~/.alcusa/dev-basic-auth.txt; h=$(cut -d: -f2- "$f" | tr -d '\r\n' | openssl passwd -6 -stdin)
  printf 'alcusa:%s\n' "$h" | ssh deploy@179.236.251.239 'sudo tee /etc/nginx/htpasswd/alcusa-dev >/dev/null && sudo systemctl reload nginx'
  ```

### 6.1 CSP in Report-Only mode on dev (SEC-001)

`/etc/nginx/snippets/alcusa-csp-report-only.conf` is included at server level of `alcusa-dev.conf` (backup: `/root/alcusa-srv/backup/alcusa-dev.conf.20261017-csp`). It only covers the HTML pages. Locations with their own `add_header` do not inherit it: `/_astro/`, `/api/promotions.json`, `/media/promos/` and `/ops-dev*` (that one has its own enforced CSP). Policy:

```
default-src 'self'; script-src 'self' <sha256 of each Astro inline script>; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src https://www.google.com blob: data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'
```

- Scripts use hashes (7 distinct inline scripts in the 28 pages). The hashes change when an inline script changes, so regenerate the snippet after a build that changes them, or the console shows violations.
- `style-src 'unsafe-inline'` is unavoidable today: the build has 137 `style=""` attributes and 5 `<style>` tags (attributes cannot be hashed without `unsafe-hashes`).
- `frame-src google.com` is the Maps embed in `/nosotros`; `blob:`/`data:` are for the client-side quote PDF. `wa.me`, YouTube, TikTok and Instagram are plain links (navigation), so they need nothing.
- No `report-uri`: violations show only in the browser console. Trade-off: nobody sees violations from real users; fine for dev, where we browse the pages ourselves.
- **Report-Only on dev; enforce at cutover** (rename the header to `Content-Security-Policy` after a clean pass in the browser console, and add it to `alcusa-prod.conf` with the same hashes).
- The vhost is not versioned in this repo; this section and the snippet text on the server are the record.

## 7. DNS (zone `alcusasv.com`, Hostinger nameservers)

State after 2026-10-06:

| Name | Type | Content | TTL |
|---|---|---|---|
| `@` | A | 185.230.63.107, 185.230.63.171, 185.230.63.186 (Wix) | 300 (was 2795) |
| `www` | CNAME | `cdn3.wixdns.net.` (Wix) | 300 (was 3600) |
| `dev` | A | 179.236.251.239 | 300 |
| `dev` | AAAA | 2a02:4780:95:a6f::1 | 300 |
| `@` | MX | Google Workspace (10 aspmx, 20–50 alt1–4) | 3600, **never touch** |
| `@` | TXT | `"v=spf1 include:_spf.google.com ~all"` | 3600, **never touch** |

Hard rules:
- Never run `dns_records_reset`, never change the nameservers, and never touch MX.
- Any new TXT at `@` (Search Console, DMARC, etc.) must use `overwrite=false`. `overwrite=true` on `@ TXT` would **delete SPF**.
- Always run `dns_records_validate` before `dns_records_update`, and re-list the zone after every change.

## 8. Production cutover (only after Alcusa approves shutting down Wix)

**Preconditions**
- [ ] Alcusa has approved shutting down Wix in writing.
- [ ] The prod build is reviewed on dev; the noindex decision is made (§9).
- [ ] The prod release is deployed: `bash docs/ops/scripts/deploy.sh prod dist`.
- [ ] Prod is tested before DNS moves:
  `curl -I --resolve alcusasv.com:80:179.236.251.239 http://alcusasv.com/` → 200, and
  `curl -I --resolve www.alcusasv.com:80:179.236.251.239 http://www.alcusasv.com/` → 301 to `alcusasv.com`.
- [ ] TTLs have been 300 for longer than the old TTL. They were lowered on 2026-10-06, so this is already true; re-list the zone to confirm.
- [ ] You picked a low-traffic window, and someone has hPanel access.

**Steps** (Hostinger API via `hostinger-alcusa`; for every update, run `dns_records_validate` first with the same body):

1. Repoint the apex and www. Use `overwrite=true`, limited to exactly these name+type pairs:
   ```json
   {"domain":"alcusasv.com","overwrite":true,"zone":[
     {"name":"@","type":"A","ttl":300,"records":[{"content":"179.236.251.239"}]},
     {"name":"www","type":"CNAME","ttl":300,"records":[{"content":"alcusasv.com."}]}
   ]}
   ```
2. Add IPv6 (new pair) with `overwrite=false`:
   ```json
   {"domain":"alcusasv.com","overwrite":false,"zone":[
     {"name":"@","type":"AAAA","ttl":300,"records":[{"content":"2a02:4780:95:a6f::1"}]}
   ]}
   ```
3. Run `dns_records_list` and confirm MX (5 Google) and TXT SPF are byte-identical to §7.
4. Wait until public resolvers return the VPS:
   `nslookup alcusasv.com 8.8.8.8`, `nslookup alcusasv.com 1.1.1.1`, `nslookup www.alcusasv.com 8.8.8.8`.
5. Issue the prod certificate (both names, with HTTP→HTTPS redirect):
   ```bash
   ssh deploy@179.236.251.239 'sudo certbot --nginx -d alcusasv.com -d www.alcusasv.com --redirect --non-interactive --agree-tos && sudo nginx -t && sudo certbot renew --dry-run'
   ```
6. Verify:
   - `curl -I https://alcusasv.com` → 200, valid certificate.
   - `curl -I https://www.alcusasv.com/x` → 301 `Location: https://alcusasv.com/x`.
   - `curl -I http://alcusasv.com` → 301 to https.
   - Send a test email to and from an @alcusasv.com mailbox (Google Workspace) to confirm mail is unaffected.
7. Only after 24–48 h stable: disconnect the domain inside Wix and cancel the Wix plan (Alcusa's call). Don't let Wix change the nameservers.
8. After 1–2 weeks stable: raise the TTLs on `@ A`, `@ AAAA` and `www CNAME` back to 3600 (`overwrite=true`, same contents).

**DNS rollback to Wix** (fast because TTL is 300):
```json
{"domain":"alcusasv.com","overwrite":true,"zone":[
  {"name":"@","type":"A","ttl":300,"records":[{"content":"185.230.63.107"},{"content":"185.230.63.171"},{"content":"185.230.63.186"}]},
  {"name":"www","type":"CNAME","ttl":300,"records":[{"content":"cdn3.wixdns.net."}]}
]}
```
Then remove `@ AAAA` with `dns_records_delete` (filter name `@`, type `AAAA` only). Wix serves no IPv6 at the apex, and a leftover AAAA would split traffic. Re-list the zone and confirm MX/TXT are untouched. This only works while the Wix site and plan are still active, so don't cancel Wix until the new site has been stable.

## 9. Launch checklist: removing noindex from production

Production is currently `noindex` because prices are not yet approved.
- [ ] Alcusa has approved prices and promotions in writing.
- [ ] The prod build's `robots.txt` allows crawling and references the sitemap (`Sitemap: https://alcusasv.com/sitemap-index.xml`); the build has no `<meta name="robots" content="noindex">`.
- [ ] Canonical URLs in the build use `https://alcusasv.com` (no www).
- [ ] On the server, remove **both** `include snippets/alcusa-noindex.conf;` lines from `/etc/nginx/sites-available/alcusa-prod.conf` (server block and `/_astro/` location). Needs a root session (2.1). Then run `nginx -t && systemctl reload nginx`. Do **not** edit the snippet itself, because dev uses it too.
- [ ] `curl -sI https://alcusasv.com | grep -i x-robots` returns nothing; `curl -sI https://dev.alcusasv.com | grep -i x-robots` still shows noindex.
- [ ] Google Search Console: add the domain property. The verification TXT goes in with `overwrite=false`, which keeps SPF. Then submit the sitemap.
- [ ] Optional: add a CSP header and consider HSTS `includeSubDomains; preload` once every subdomain is on HTTPS.

## 10. Routine operations

- Certificates: `systemctl list-timers certbot.timer`; `sudo certbot certificates`.
- Logs: `/var/log/nginx/access.log`, `/var/log/nginx/error.log`; `sudo journalctl -u nginx -u ssh -u fail2ban --since today --no-pager`.
- Firewall: `sudo ufw status verbose`; Hostinger side via `vps_firewall_get` (id 372986). After editing Hostinger rules, run `vps_firewall_sync-to-all-assigned-v-ms`.
- Updates: unattended-upgrades applies security updates daily. Check reboot-required with `cat /var/run/reboot-required 2>/dev/null` and reboot in a quiet window.

## 11. Admin panel (dev): runtime, deploy, rollback, backups

Live on `https://dev.alcusasv.com/ops-dev/` since 2026-10-07, behind the dev basic auth (same server-level `auth_basic` as the site). Production is **not** provisioned yet (see 11.7).

Scripts (Git Bash, from `03-dev/docs/ops/scripts/`): `alcusa-admin-bootstrap.sh` (runs on the VPS as root) and `admin.sh <dev|prod>` (runs on your machine; `admin-dev.sh` is a shim for `admin.sh dev`).

### 11.1 Layout

| Piece | Where / how |
|---|---|
| Runtime | Node.js v24 from nodejs.org (sha256-verified) in `/opt/node-v24.x.y-linux-x64`, `/opt/node` symlink, `/usr/local/bin/{node,npm,npx}`. Needs >= 24.7 (`crypto.argon2`). |
| Database | MariaDB 11.4 from the official repo (`mirror.mariadb.org`, key fingerprint pinned in the script, apt pin so Ubuntu's 10.11 never wins). `bind-address=127.0.0.1`, nothing else listens on 3306. DB `alcusa_dev`, utf8mb4. |
| DB accounts | `alcusa_migrate` (ALL on `alcusa_dev.*` WITH GRANT OPTION, used only by migrate/grants) and `alcusa_app` (table-level DML from `db/grants.sql`, used by the service). Each exists for `localhost` and `127.0.0.1`. |
| Env files | `/etc/alcusa/dev-api.env` (owner `alcusa`, 600: service config + `DB_APP_PASSWORD`) and `/etc/alcusa/dev-migrate.env` (owner `deploy`, 600: `DB_MIGRATE_*`). The service never sees the DDL credential. Passwords are generated on the VPS with `openssl rand -hex 24`, never printed. |
| Releases | `/opt/alcusa/dev/releases/<UTC-ts>-<git-sha>/` (`dist/`, `db/`, `package.json`, `package-lock.json`, `node_modules/`), `/opt/alcusa/dev/current` symlink. Owner `deploy`, read-only for the service. 5 kept. |
| Service | `alcusa-admin-dev.service`: user `alcusa` (system, nologin), `127.0.0.1:4500`, `ADMIN_BASE_PATH=/ops-dev`, `Restart=on-failure`, `NoNewPrivileges`, `ProtectSystem=strict` (writes only to `shared/`), `PrivateTmp/PrivateDevices`, `MemoryMax=768M`. |
| Shared data | `/var/www/alcusa/dev/shared/data/promotions.json` (written by the service on every save) and `shared/media/promos/*.webp` (uploads). Owner `alcusa:www-data`, `2755`. It lives outside `releases/`, so site deploys and rollbacks never touch it. |
| nginx | `conf.d/alcusa-admin-limits.conf` (zones `alcusa_admin` 60r/m, `alcusa_admin_login` 5r/m per IP), `snippets/alcusa-admin-proxy.conf`, `snippets/alcusa-admin-dev.conf` (included from `alcusa-dev.conf` right after the server-level noindex include). Vhost backups: `/root/alcusa-srv/backup/alcusa-dev.conf.<ts>`. |

nginx specifics of the admin locations: `Host` is forwarded untouched (the app's Origin check compares against it); `Authorization` is cleared so the basic-auth credential never reaches the app; the app's own helmet headers are kept, while HSTS and `X-Robots-Tag` come from nginx only (the app's copies are hidden to avoid duplicates); `client_max_body_size 6m`; rate limits answer 429. `/api/promotions.json` is `no-cache`; `/media/promos/` is `max-age=3600` (not immutable, so a replaced image shows up within the hour), `nosniff`, no autoindex.

### 11.2 Provision (once, then any time the script changes)

```bash
bash 03-dev/docs/ops/scripts/admin.sh dev bootstrap
# same thing without the wrapper:
ssh deploy@179.236.251.239 'sudo -n /usr/local/sbin/alcusa-admin-bootstrap'   # root-owned copy, see 2.1
```

Idempotent: existing env files and passwords are kept, config files are rewritten only when their content changes, nginx is reloaded only after `nginx -t` passes (if it fails, the vhost is restored from the backup and the script stops). It also installs the daily backup (11.6). It never touches DNS, the prod vhost, basic auth or noindex.

- Rotate the DB passwords: delete both files in `/etc/alcusa/`, re-run bootstrap (it runs `ALTER USER` and writes new files), then `admin.sh dev release` or `sudo systemctl restart alcusa-admin-dev`.
- Move to a newer Node 24: root session only (2.1): `NODE_UPGRADE=1 /usr/local/sbin/alcusa-admin-bootstrap`, then restart the service.

### 11.3 Deploy / update

```bash
export PATH="/c/Users/carlo/AppData/Roaming/fnm/node-versions/v24.21.0/installation:$PATH"   # Node 24 locally
bash 03-dev/docs/ops/scripts/admin.sh dev release     # source: <this repo>/server (override: ADMIN_SERVER_DIR; never a sibling worktree)
bash 03-dev/docs/ops/scripts/admin.sh dev status      # releases, service, promos:status, HTTPS probes
```

`release` builds with tsup (bundles `admin-server` and the `cli/*` entries; `splitting:false` is required because `src/db/paths.ts` resolves `db/` relative to `dist/cli/<x>.js`), uploads, runs `npm ci --omit=dev` on the VPS, then `migrate.js` and `grants.js` with the migrate env, switches `current` atomically, restarts, and polls `127.0.0.1:4500/ops-dev/login`. If the health check fails it switches back to the previous release by itself and exits non-zero.

- Migrations run **before** the switch: write them expand/contract so the previous release still works with the new schema (rollback does not undo migrations).
- `admin.sh dev seed [site-dir]` (dev only; `admin.sh prod seed` is refused) is for first load or re-sync from the site's `src/content/promotions.json` and `public/images/promos/*.webp` (default `../03-dev-wt/assets-oficiales`). It uploads to a temp dir, runs the importer `--dry-run`, then for real with `--allow-production --publish`, and prints `promos:status`. It is an idempotent upsert; once the admin is in use, **do not re-seed casually**, it would overwrite edits made in the panel.
- Check the state any time (as the service user, read-only): `ssh deploy@179.236.251.239 'cd /opt/alcusa/dev/current && sudo -n -u alcusa node --env-file=/etc/alcusa/dev-api.env dist/cli/promos-status.js'`.

### 11.4 Create the admin account (you, in a TTY)

The password is typed by the person who will use it, in the hidden prompt. It never goes through argv, env, a file or chat. The CLI accepts `NODE_ENV=production` (it only loads the same config the service uses) and v1.0 allows exactly one admin account.

```bash
ssh -t deploy@179.236.251.239 'cd /opt/alcusa/dev/current && sudo -u alcusa /usr/local/bin/node --env-file=/etc/alcusa/dev-api.env dist/cli/create-admin.js <usuario> --prompt'
```

Minimum 14 characters; the first login forces a password change. Then sign in at `https://dev.alcusasv.com/ops-dev/login` (the browser asks for the dev basic auth first, then the admin form).

#### Recover or rotate the admin password (forgotten or compromised)

Run the same CLI with `--rotate`, in a TTY. It prompts twice (hidden), checks the 14-character policy, replaces the password, **closes every open session of that admin**, forces a password change on the next login and writes an `admin.password_rotated` audit row. The password never goes through argv, env, a file or chat; type it yourself or hand it over out of band, and it is changed at the first login.

```bash
ssh -t deploy@179.236.251.239 'cd /opt/alcusa/dev/current && sudo -u alcusa /usr/local/bin/node --env-file=/etc/alcusa/dev-api.env dist/cli/create-admin.js <usuario> --rotate'
```

The single dev account is `alcusa`. Failed logins no longer lock the account (they throttle the attacker's IP + username pair for 1/5/15/60 min), so there is nothing to unlock; restarting `alcusa-admin-dev` also clears any throttle.

### 11.5 Rollback

```bash
bash 03-dev/docs/ops/scripts/admin.sh dev rollback            # previous release
bash 03-dev/docs/ops/scripts/admin.sh dev rollback <release>  # a folder name under /opt/alcusa/dev/releases
```

It swaps `current`, restarts and health-checks. Data (DB, `shared/`) is not rolled back. To undo bad content, restore from a backup (11.6) or fix it in the panel.

- nginx: copy `/root/alcusa-srv/backup/alcusa-dev.conf.<ts>` over `/etc/nginx/sites-available/alcusa-dev.conf`, then `sudo nginx -t && sudo systemctl reload nginx`.
- Switch the panel off without touching anything else: `sudo systemctl stop alcusa-admin-dev`. nginx then answers 502 on `/ops-dev/`; the static site, `/api/promotions.json` and `/media/promos/` keep working.

### 11.6 Backups and restore

`/usr/local/sbin/alcusa-backup.sh`, cron `/etc/cron.d/alcusa-backup` at 03:15 (server time, America/El_Salvador), output to the journal (`journalctl -t alcusa-backup`). Writes to `/var/backups/alcusa/` (root, 700, files 600):

- `alcusa_dev-<ts>.sql.gz`: `mariadb-dump --single-transaction --routines --events --databases alcusa_dev`
- `dev-shared-<ts>.tar.gz`: `shared/` (published JSON + uploaded images)
- retention: 7 days (`find -mtime +7 -delete`).

Plus the Hostinger weekly snapshots. **Backups are on the same disk**: they cover mistakes, not loss of the VPS. For production add an off-box copy (rclone/rsync to a second provider, encrypted with `age` or `gpg`) and a restore test. RPO today is 24 h; RTO is "re-run bootstrap + release + restore" (about 30 min).

Restore (DB, root session, see 2.1): `zcat /var/backups/alcusa/alcusa_dev-<ts>.sql.gz | mariadb --protocol=socket -uroot` (the dump includes `CREATE DATABASE`/`USE`; accounts and grants are not in it, they come from bootstrap + `release`). Restore (files): `sudo tar -C /var/www/alcusa/dev -xzf /var/backups/alcusa/dev-shared-<ts>.tar.gz`, then `sudo chown -R alcusa:www-data /var/www/alcusa/dev/shared`.

### 11.7 Production: usage and what changes

`admin.sh prod <subcommand>` (same script as dev; constants in its header `case`): unit `alcusa-admin-prod`, `/opt/alcusa/prod`, loopback port 4501, env files `/etc/alcusa/prod-{api,migrate}.env`, health `http://127.0.0.1:4501/api/health` (path-independent: the admin path is secret and `deploy` cannot read `prod-api.env`), base URL `https://alcusasv.com`, separate basic-auth file `~/.alcusa/prod-admin-basic.txt`. `admin.sh prod config` prints the resolved values without touching the server.

```bash
export ADMIN_SERVER_DIR="<03-dev>/server"          # always explicit for the cutover; default is this repo's server/
bash docs/ops/scripts/admin.sh prod config           # constants, no ssh
bash docs/ops/scripts/admin.sh prod release          # gate + build + upload + npm ci --ignore-scripts + migrate + switch + health
bash docs/ops/scripts/admin.sh prod clone-promos     # one-off: dev's published promos + media -> prod (before go-live)
bash docs/ops/scripts/admin.sh prod status           # ALCUSA_PROD_ADMIN_PATH (local secret) enables the admin probes
bash docs/ops/scripts/admin.sh prod rollback         # previous release, or: sudo systemctl stop alcusa-admin-prod
```

- **Release gate (SEC-023, fatal, nothing is uploaded):** a modified or untracked file under `server/`; HEAD different from the commit of the dev release (override with `ALCUSA_EXPECTED_COMMIT=<sha>`); `npm audit --omit=dev --audit-level=high` with findings (`ALCUSA_SKIP_AUDIT=1` only with a waiver in chat; the audit output path is printed for the release note). The local build uses `npm ci --ignore-scripts`; the VPS runs `npm ci --omit=dev --ignore-scripts` (no production dependency needs an install script; `esbuild`/`fsevents` are dev-only; canary on dev with `ALCUSA_IGNORE_SCRIPTS=1`).
- **Absolute CLI paths (SEC-021):** in prod every CLI runs as `sudo -n -u alcusa /usr/local/bin/node --env-file=/etc/alcusa/prod-api.env /opt/alcusa/prod/current/dist/cli/<cli>.js ...`; the sudoers lines must match that text.
- **`clone-promos`:** checks dev `generated_at` and `borradores=0 archivadas=0` (fatal otherwise; `ALCUSA_CLONE_EXPECT_GENERATED_AT` pins the timestamp, `ALCUSA_CLONE_FORCE=1` overrides), stages dev's `shared/data/promotions.json` and `shared/media/promos/*.webp` under `/var/tmp/alcusa-seed.XXXXXX`, runs the importer `--dry-run`, then `--allow-production --site-public-dir <stage>/public --publish`, compares prod's `promos:status` lines and the `-600/-900` media hashes with dev, and removes the stage. Dev is never written. Re-run it (idempotent upsert) only before go-live: afterwards the prod panel owns the data.
- `admin.sh prod seed` and `admin.sh prod bootstrap` are refused (seed would overwrite panel edits; prod provisioning is `alcusa-prod-root.sh`, section 2.1).

What else changes in prod:

- **Random admin path.** In prod `ADMIN_BASE_PATH` must be a secret random segment generated on the VPS (`/ops-$(openssl rand -hex 12)`), kept in the root-only env file and given to the admin out of band; never commit it, never put it in a ticket. In dev `/ops-dev` is fixed because the dev site is already behind basic auth.
- Prod has no basic auth, so the admin locations need their own second layer: an `allow`/`deny` IP allowlist answering 404 (Addendum 1, item 8) and/or a dedicated `auth_basic` file on the admin locations, plus a fail2ban jail on the login 401/429 lines.
- Separate DB `alcusa_prod`, accounts, env files `/etc/alcusa/prod-*.env`, unit `alcusa-admin-prod`, `/opt/alcusa/prod`, `/var/www/alcusa/prod/shared`. `admin.sh` is generalised (see above); the vhost anchor and the header/noindex rules are part of the production cutover (section 8).
- `SECRETS_KEY` and `IP_HASH_PEPPER` are required by the quotes API in production (`loadConfig`) but not by the admin v1.0 entry point, so the dev env does not carry them. Generate them (`openssl rand -base64 32`) when the quotes API is deployed.

### 11.8 Open points from ADR-014 Addendum 1

- Item 5 (section 3.5): closed (SEC-008, awaiting re-test): `Origin: null` and requests with neither `Origin` nor `Sec-Fetch-Site` are rejected, the login form has a CSRF token, admin pages send `Referrer-Policy: same-origin`.
- Item 8 (section 3.8): closed (SEC-007, awaiting re-test): generic 401 always, per-(IP, user) backoff instead of a per-account lock. The nginx half of the gate (`limit_req` 5/min/IP on login, 60/min/IP on the route) has been in place since 2026-10-07; the optional IP allowlist and the fail2ban jail are not.
- 3-active rule: enforced by `PromoService` (`MAX_ACTIVE = 3`). A 4th overlapping publish must answer 422 "Ya hay 3 promociones publicadas en esas fechas". Check it by hand in the panel once the admin account exists (the seed leaves exactly 3 published).

> **2026-10-14: Wompi retired.** No payments on the web (scope cut). `api/wompi-*.php`, the Wompi env vars and key files are removed from the repo; the VPS dev cleanup is tracked in the scope-cut-pagos handoff. `docs/ops/wompi-go-live.md` is historical only.
