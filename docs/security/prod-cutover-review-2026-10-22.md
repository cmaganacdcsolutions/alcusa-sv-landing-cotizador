# Prod cutover pre-execution security review (2026-10-22)

Scope: `docs/ops/prod-cutover-plan-2026-10-22.md` (431 lines, uncommitted) and the root script text in section 4.2 (plan lines 115-371), cross-checked against `docs/ops/scripts/{admin-dev.sh,alcusa-admin-bootstrap.sh}`, `docs/ops/runbook-hostinger-vps.md`, `server/src/modules/admin/routes.ts`, `server/src/config/index.ts`.
Method: read-only static review. Nothing was run, no server or DNS access. Numbering continues after SEC-017 (sec-1017 report). Status of every finding: Open.

## Verdict

| Step | Verdict | Condition |
|---|---|---|
| (a) Run the root script | **GO-with-fixes** | Apply SEC-018, SEC-019, SEC-020 (and SEC-026 if cheap) to the script/plan text, re-hash, I re-read the diff of the final file. |
| (b) Admin prod release (C2-C4) | **GO-with-fixes** | SEC-023 applied; C1 (dev canary) green; script verification output (jail regex 1/2 match, `sudo -n -l`) clean. |
| (c) DNS cutover (Stage E) | **GO-with-fixes** | SEC-004 rotated and verified (SEC-027), SEC-022 (certbot email), jail live test E6 planned, SEC-029 checks added to E3. |

SEC-003 (admin prod NO-GO): **conditionally closed by design**, to be marked Verified only after the live checks below (L5-L8) pass. SEC-014 (TLS/HSTS): design is adequate, closes on L1-L4. SEC-004: closes on L0.
No Critical/High found in the plan itself. The design is sound; the defects are mostly verification gaps and procedure.

## What I checked and found OK (evidence)

- **Hash pin (plan 375).** `install` copies to `/root` (dir 700, file 700 root), `sha256sum -c` runs on THAT copy, `bash /root/...` runs that same path. `deploy` cannot swap it after the copy; a swap before the copy is caught by the hash. A symlink in `handoff/` only changes what is copied; the hash fails. OK. Caveat: the hash trust anchor is the chat; the user should also compute the hash of the file they actually read (see Info I-1).
- **Secrets never on argv/stdout.** DB passwords go via heredoc stdin to `mariadb` (plan 139-147); `openssl passwd -6 -stdin` fed by builtin `printf` (216); `setkv` uses `printf` builtin and mktemp 0600 (128); no `set -x`; `nginx -t` output goes to a file; `fail2ban-regex` output is grepped to `Lines:`. The tee'd log contains only `==> Rn` markers and errors. OK.
- **Modes/owners.** `prod-api.env` alcusa 600, `prod-migrate.env` deploy 600 (same model as dev), htpasswd 640 root:www-data, snippet 640 root:root (nginx master reads as root), handover 600 root, `/root/alcusa-srv/backup` 700. OK.
- **sudoers.** New file `92-deploy-prod` is written to a temp path, `visudo -cf` under `set -e` before `install -m 0440`, then `visudo -c`. No `NOPASSWD: ALL`, no editors/pagers/shells, `systemctl` lines are exact (no globs), `journalctl` has `--no-pager`. `/etc/sudoers` `%sudo` rule is processed before `/etc/sudoers.d`, so last-match NOPASSWD in 92 wins. The only wildcards are `unbanip *` (fixed prefix, harmless) and `create-admin.js *` / `import-promos.js *` (see SEC-021).
- **Jail regex (plan 319-320), read against nginx combined format** `ADDR - USER [time] "REQ" STATUS`: line 1 counts 401 only when the user field is not `-` (bad basic credential, or a failed app login, which `routes.ts:119` answers with 401 and which carries the basic user); line 2 counts any 429 (`limit_req_status 429` is in the derived proxy snippet, bootstrap.sh:364). The sample (333-335) behaves as the plan expects (1 of 2). A trailing space in the regex is stripped by fail2ban's parser and is harmless. `X-Forwarded-For` is overwritten with `$remote_addr` (bootstrap.sh:353) and the app only honours it from loopback (`routes.ts:88-92`), so the IP throttle cannot be spoofed.
- **Admin exposure.** Admin locations have a dedicated access log (the main log never sees the secret path), own `auth_basic` (separate htpasswd from dev), `limit_req` (60/min route, 5/min login), `Authorization` cleared before the app, HSTS/noindex owned by nginx, app session cookie is `secure:true` (login cannot complete over plain HTTP even by mistake). `server_tokens off`. A wrong path falls to the static `try_files ... =404`.
- **Data.** Migrate account: ALL on `alcusa_prod.*` WITH GRANT OPTION only (identical to dev, needed for `grants.js`); app account gets table-level DML from `grants.js` on release, nothing in the script; neither has rights on the other DB. The importer path moves promotion documents and webp only (no admin users, sessions, hashes, peppers), so no dev secret/session reaches prod. **Pepper is distinct per env** (R3 generates one for prod, a separate one for dev, 160-167): correct, since hashed IPs must not be correlatable across environments and a leak of one env must not weaken the other. Dev pepper is added while the old dev release (231d382) is running; it ignores it, harmless.
- **nginx rollback.** `nginx -t` gates the reload; on failure the vhost and the 443 default conf are restored. The leftover new snippets are unreferenced after the restore. OK.
- **TLS design.** certbot defaults give TLS 1.2/1.3; HSTS `max-age=31536000` without `includeSubDomains`/`preload` is correct given unknown subdomains and a Wix rollback; `ssl_reject_handshake` default server stops the dev vhost answering for other names.

## Findings

### SEC-018 · Medium · Root password must never pass through the agent/API · Open
- Asset: root access to the VPS. Location: plan 73 (B2: "or `vps_virtual-machines_set-root-password`"); runbook break-glass.
- Evidence: a root password set via the MCP call lands in the tool-call arguments, i.e. the transcript/logs (violates the secrets rule, and the plan itself forbids printing passwords).
- Fix (plan text, B2): "Set the root password yourself in hPanel (VPS, Settings). Do not set it through any API/MCP call or paste it in chat. After B4 run `passwd -l root` (or set a new random one) in the same terminal." Delete the `set-root-password` alternative.
- Acceptance: B2 contains no API route; after B4 `passwd -S root` shows `L`; the transcript contains no root password.
- Owner: senior-infrastructure.

### SEC-019 · Medium · Jail verification is non-fatal; the jail can be silently dead · Open
- Asset: SEC-003 second layer. Location: plan 335 (`... | grep -E 'Lines:' || true`), 248 (`install ... || true`), 337.
- Root cause: if the regex matches 0 lines (or the log file is missing) the script still prints DONE and the operator believes brute-force protection exists.
- Fix (replace plan line 335):
```bash
out="$(fail2ban-regex "$HO/f2b-sample.log" /etc/fail2ban/filter.d/alcusa-admin.conf 2>&1)"
grep -Eq 'Failregex: 2 total' <<<"$out" && grep -Eq '[0-9]+ matched' <<<"$out" || { echo "f2b regex did not load/match" >&2; exit 1; }
grep -Eq 'Lines: 2 lines, 0 ignored, 1 matched' <<<"$out" || { echo "f2b sample: expected 1 of 2 matched" >&2; exit 1; }
```
  Remove the `|| true` on the log-file creation (248) and make line 337 fail if the jail is not running: `fail2ban-client status alcusa-admin | grep -q 'File list:.*alcusa-admin-prod.access.log' || { echo "jail not watching log" >&2; exit 1; }`.
- Acceptance: with the regex deliberately broken in a scratch copy the script aborts non-zero (test on the dev box by running only that fragment); on the real run the status shows the log file in `File list`.
- Owner: senior-infrastructure.

### SEC-020 · Medium · `sudo nginx -T` (allowlisted) prints the secret admin path to `deploy` and to any transcript · Open
- Location: runbook 44 (allowlist `nginx -T`), plan line 5 (only a "do not run" instruction), plan 18.
- Evidence: after R5 the secret path is literal in `/etc/nginx/snippets/alcusa-admin-prod.conf`; `nginx -T` dumps every included file. The mitigation today is a rule in prose; an agent or a stray `-T` leaks factor 1 into logs.
- Fix: in R7 also remove `nginx -T` from `/etc/sudoers.d/91-deploy-allowlist` (edit a temp copy, `visudo -cf`, `install`, `visudo -c`; per runbook 59-63 use the dead-man switch because this edit removes rather than adds). Keep `nginx -t`. Equivalent alternative if the user wants to keep `-T`: wrap it in a root script `/usr/local/sbin/alcusa-nginx-dump` that pipes through `sed -E 's#/ops-[0-9a-f]{24}#/ops-REDACTED#g'` and allowlist that instead.
- Acceptance: `sudo -n nginx -T` answers "a password is required"; `sudo -n -l` has no `-T`; `sudo nginx -t` still works.
- Owner: senior-infrastructure.

### SEC-021 · Medium (residual, needs explicit user acceptance) · `deploy` key = prod admin takeover · Open (accepted-risk candidate)
- Location: plan 343 (R7), R1 (`$OPT` owned by deploy), `prod-migrate.env` owned by deploy.
- Evidence (by design): sudoers lets `deploy` run `node ... dist/cli/create-admin.js *` as `alcusa` with a RELATIVE script path and cwd chosen by `deploy`; the release tree is deploy-writable. So a holder of the deploy key can run arbitrary JS as `alcusa` with `prod-api.env` loaded (DB app password, pepper, admin path), create new admin accounts, and already owns the DDL credential. The basic-auth + secret path layer does not protect against a deploy-key compromise. Same model as dev; in prod the data is real.
- Mitigation now (cheap): use absolute script paths in the sudoers lines (`/opt/alcusa/prod/current/dist/cli/...`) so a decoy cwd does not work; passphrase-protected deploy key kept on one machine; add `journalctl` review of `create-admin` events and an admin-account count check to the post-cutover checklist (`promos-status` or a status command). Longer term: root-owned immutable releases installed by a root helper.
- Acceptance: user records the residual risk as accepted in chat; sudoers lines use absolute paths; first week review shows exactly one admin account.
- Owner: senior-infrastructure (paths), user (acceptance).

### SEC-022 · Medium · certbot registered without email + HSTS 1 year = silent hard outage on expiry · Open
- Location: plan 95 and runbook 191 (`--register-unsafely-without-email`).
- Impact: Let's Encrypt expiry mails are the only out-of-band warning if renewal breaks (nginx change, DNS move). With HSTS cached for a year, browsers cannot click through an expired certificate.
- Fix (E2 command): replace `--register-unsafely-without-email` with `-m <ops mailbox the user reads>` (needs the allowlisted exact command updated, root job; or register the account once from the root session before E2). Add to F-stage: weekly `certbot certificates` expiry glance, plus an external uptime/cert-expiry monitor.
- Acceptance: `sudo certbot certificates` shows the account/email configured; `systemctl list-timers certbot.timer` active; a `certbot renew --dry-run` passes (already in E2).
- Owner: senior-infrastructure.

### SEC-023 · Medium · Prod release gate allows a dirty tree and runs dependency install scripts · Open
- Location: plan 47 (ASSERT only compares HEAD), `admin-dev.sh:124` (uncommitted changes are only a WARN), `admin-dev.sh:129,150` (`npm ci` without `--ignore-scripts`, on the VPS as `deploy`).
- Fix (admin.sh spec, prod branch only): (1) fatal if `git -C "$src" status --porcelain -- .` is non-empty or HEAD != the dev release commit; (2) before build run `npm audit --omit=dev --audit-level=high` in `server/` and abort on findings (waivers in chat); (3) use `npm ci --omit=dev --ignore-scripts` on the VPS if no runtime dependency needs a build step (verify on C1 dev canary first; if one does, list it explicitly rather than allowing all scripts).
- Acceptance: running `admin.sh prod release` with a modified file in `server/` exits non-zero without uploading; C1 health green with `--ignore-scripts`; audit output attached to the release note.
- Owner: senior-devops.

### SEC-024 · Low · Per-IP controls are per /128 on IPv6 · Open
- Location: `alcusa-admin-limits.conf` (`$binary_remote_addr`), jail, app throttle `clientIp()`. The AAAA record (plan E1) makes the admin reachable over IPv6, where an attacker holding a /64 rotates addresses and sidesteps `limit_req`, the jail and the app throttle. Impact is bounded: the attacker still needs the 96-bit path, the 143-bit basic password and the account password.
- Fix (optional, now or follow-up): key limits by /64 using a `map` over `$remote_addr`, and confirm the jail bans IPv6 (`banaction` must be `*-allports`/nftables with v6 support). Otherwise record as accepted.
- Acceptance: a test from an IPv6 address shows ban/limit applied, or the user accepts the residual.
- Owner: senior-infrastructure.

### SEC-025 · Low · Handover: both outer factors in one file, created only on first run · Open
- Location: plan 214-220, 74 (B4).
- Issues: (a) `ADMIN_URL` (secret path) and `BASIC_PASS` are in one file, so one intercepted message defeats the second layer; (b) if the script aborts after the htpasswd is written but before the handover file, the plaintext is lost and a re-run does not regenerate it (guard is on htpasswd existence); (c) plaintext persists in `/root` until shred.
- Fix: write the handover file BEFORE the htpasswd (or regenerate both if the handover is missing); in the instructions say "send the URL and the basic-auth password through two different channels, the account password through a third (or in person)"; B4 `shred -u` is already planned, keep it the same day.
- Acceptance: re-run after deleting only the handover file produces a new matching pair; user confirms the channels.
- Owner: senior-infrastructure.

### SEC-026 · Low · Idempotency edges of the script · Open
- (a) Plan 248: `install -m 0640 ... /dev/null <file>` OVERWRITES an existing access log on re-run (truncates ban evidence). Fix: `[[ -e $f ]] || install ...`.
- (b) Plan 251: after certbot, a re-run exits at the `listen 443` guard AFTER regenerating snippets and BEFORE R6-R8, so a later jail/sudoers/backup fix cannot be applied by re-running. Fix: replace `exit 1` by skipping the vhost rewrite and the default-ssl conf (`SKIP_VHOST=1`) and continue.
- (c) Plan 151-152: if the account exists but the env key was lost, no password is reset; document that a rotation needs `DROP USER` or delete the key first.
- (d) Pre-flight for R5: `grep -R 'listen.*443.*default_server' /etc/nginx/sites-enabled /etc/nginx/conf.d` should be empty before adding the default server, otherwise `nginx -t` fails mid-run (the rollback handles it but leaves the run half done).
- Acceptance: running the final script twice in a row on the dev box (or `bash -n` plus a dry run in a container) leaves identical file hashes and an unchanged log.
- Owner: senior-infrastructure.

### SEC-027 · Low · SEC-004 procedure gaps · Open
- Location: plan 54-68.
- What is good: no plaintext in argv (`openssl passwd -stdin`, builtin `printf`), only the hash crosses ssh, `.new` created under umask 077, `admin-dev.sh` passes the credential to curl through `-K -` (script lines 97-104).
- Gaps: (1) "and that the old one is refused" has no command. Add: build the old value into curl's stdin config the same way (`printf 'user = "%s"\n' "$(tr -d '\r\n' <"$f.bak-20261022")" | curl -sS -K - -o /dev/null -w '%{http_code}\n' https://dev.alcusasv.com/` expect 401; never echo the variable). (2) The compromised value remains in git history (commits `1c367a4`, `bd59978` removed it only from the index): the rotation is what makes it harmless; confirm it was never pushed, otherwise treat it as burnt (it is, after rotation). (3) `shred` on NTFS gives no guarantee; delete the `.bak` and accept it, or encrypt it. (4) QA/CI secrets holding the old credential must be updated in the same step (plan 68 notes it, make it a checkbox).
- Acceptance: old credential returns 401, new returns 200 on dev root and on `/ops-dev/login`; `.bak` deleted; no plaintext in shell history (`HISTFILE` unset for that session) or in the transcript.
- Owner: senior-infrastructure / Foreman.

### SEC-028 · Low · CSP stays Report-Only, with no deadline · Open
- Location: plan 412, decision 3. Report-Only is acceptable at cutover: prod is a static site with no user-supplied HTML, runtime promos are parsed and validated, and the admin has its own enforced CSP. Gaps: no `report-uri` (violations invisible), and the server-level snippet is not inherited by the locations that re-add headers (`/_astro/`, `/api/promotions.json`, `/media/promos/`), by design.
- Fix: put a dated item (by 2026-10-29) to enforce after hash-regeneration helper exists; until then no new inline scripts without regenerating hashes.
- Acceptance: ticket with date; at enforcement the full e2e passes against a prod-like build.
- Owner: senior-infrastructure + senior-devops.

### SEC-029 · Low · HTTP-only window and plain-HTTP admin checks · Open
- Location: plan 94-97, E3.
- Analysis: between the DNS flip and certbot the vhost serves the admin locations on :80. Acceptable because the path is secret, the session cookie is `Secure` (login cannot complete) and nobody is told to log in before TLS; the window is ~minutes. The residual is that certbot's redirect conversion is assumed, not proven for the admin path.
- Fix (add to E3, run by the user in the hPanel terminal because the Foreman does not know the path): `curl -s -o /dev/null -w '%{http_code}\n' http://alcusasv.com<ADMIN_PATH>/login` must be 301 to https (not 401/200). Also `curl -sk --resolve alcusasv.com:443:<IP> https://<IP>/` and an unknown-SNI test must fail the handshake (default reject), and `curl -sI http://<IP>/` must be 444/closed.
- Acceptance: the three results above recorded in the go-live note.
- Owner: senior-infrastructure.

### SEC-030 · Low · Backups: same disk, unencrypted, prod restore untested · Open (accepted until F4)
- Location: plan 349-368 and decision 7. Dumps are 0600 root in `/var/backups/alcusa` and include the prod admin hashes. Acceptable for day 0 because the host is the only copy. Requirements: off-box encrypted copy and ONE restore test of a prod dump into a scratch database within 7 days (dated item, before any real Alcusa edit would be considered valuable). Also the backup script's `[[ -d ... ]] && tar` as the last statement of the loop is fragile under `set -e`; use `if ...; then ...; fi`.
- Owner: senior-infrastructure.

### Info
- I-1: Any fix to the script changes the hash. The Foreman must recompute the SHA256 and I re-read the diff of the final file (sections R2, R5, R6, R7) before the user pastes it. The user should compute `sha256sum` on the file they read, not copy the hash from the same message that carries the paste.
- I-2: Unit hardening could add `SystemCallFilter=@system-service` and `ProtectProc=invisible`; test on dev first, do not diverge prod from dev today.
- I-3: The promo clone relies on `generated_at` of dev; the plan correctly says to tell Alcusa not to edit dev from now on. After clone, verify prod has only the single admin user created in C4 (no seeded/dev accounts).
- I-4: DNS rollback after HSTS is a known, accepted trade-off (decision 4); confirm Wix serves a valid HTTPS certificate for the apex before the flip (a quick look at the Wix connection status), otherwise returning visitors hard-fail on rollback.

## Post-cutover live checks required for my sign-off

- L0 (SEC-004): old dev basic-auth refused, new accepted (dev root and `/ops-dev`), `.bak` removed.
- L1 `curl -sI https://alcusasv.com`: 200, `strict-transport-security: max-age=31536000` with no `includeSubDomains`/`preload`, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, `content-security-policy-report-only`.
- L2 `http://alcusasv.com` and `http://www.alcusasv.com/x` 301 to `https://alcusasv.com[/x]`; `openssl s_client -tls1_1` fails, `-tls1_2` and `-tls1_3` succeed.
- L3 `certbot certificates` (both names, expiry), `certbot.timer` active, renew dry-run green, account email set (SEC-022).
- L4 unknown SNI and bare IP over HTTPS rejected; no dev vhost content served for a foreign Host.
- L5 admin over HTTPS: correct path without basic credential gives 401; wrong path gives the static 404; with credentials the login page loads and a login plus logout works; the session cookie has HttpOnly, Secure, SameSite; password change forced at first login.
- L6 `http://alcusasv.com<ADMIN_PATH>/login` gives 301 (SEC-029); the path never appears in `/var/log/nginx/access.log` or in `journalctl -u nginx`.
- L7 jail test from a throwaway IP: bans after 8 counted hits, `fail2ban-client status alcusa-admin` shows the banned IP and the log file, unban works with the allowlisted command; one wrong app login appears as a counted 401 (confirms app-layer failures are covered).
- L8 `sudo -n -l` shows the new prod lines only, `sudo -n id` and `sudo -n nginx -T` refused (SEC-020), `systemctl is-active alcusa-admin-prod` and `systemctl show -p User,NoNewPrivileges alcusa-admin-prod`.
- L9 `ls -l` modes/owners of `/etc/alcusa/prod-*.env` (600), htpasswd (640), handover shredded after delivery; no secret in `/root/alcusa-prod-root.log` (grep for `BASIC_PASS`, `PEPPER`, `PASSWORD`; do not print values).
- L10 data: prod `promos-status` equals dev (3 published), `/api/promotions.json` returns 200 JSON with the cache-control and noindex headers, `/media/promos/` has no autoindex, prod `admin_users` has exactly the operator account.
- L11 backups: `alcusa-backup.sh` output lists both DBs; one restore test scheduled with a date.
- L12 mail check (E5) unchanged MX/TXT after the DNS change.
- L13 30-minute monitor of nginx/ssh/fail2ban/admin journals shows no unexpected admin hits.

## Handoff
Owner for SEC-018..022, 024-026, 028-030: senior-infrastructure. SEC-023: senior-devops. SEC-027: Foreman with senior-infrastructure. SEC-021 acceptance: user. Re-test: I re-read the revised script (final hashed text) and run the live checks above; senior-qa to automate L1, L2, L5 (401/404 parts) as a prod smoke spec afterwards. I have not edited the plan or any script and have not committed this file.

---

## Re-test 2026-10-22 (final script)

Scope: `docs/ops/scripts/alcusa-prod-root.sh` (373 lines by `wc -l`), `docs/ops/scripts/set-vps-root-password.sh`, plan stages B/E, runbook lines. Method: full read of both scripts plus read-only SSH as `deploy` (pinned `docs/ops/known_hosts`) to confirm facts. No server change, no secret read.

**Integrity:** `sha256sum` = `a3485e966ab043c08c5e41dedef4745a8ca367ef23f7cc5b363f5745e5f6f32f` (run 1 text, superseded: see "As executed" below; the script that finally ran is `ada0248788455d0a69bc970ca01ac6d6e48008577ffc1db7d788c59d15f9d9d5`); 0 CR bytes.

### Verdict for executing the root script with this exact hash: GO (conditional on the procedural pre-checks below; no script edit required)

No Critical/High. New findings SEC-031..036 are Low/Medium and none requires changing the hashed file. If infra applies the optional patches, the hash changes and I must re-read the diff.

### Status of SEC-018..030

| ID | Status | Evidence / note |
|---|---|---|
| SEC-018 | Verified (static); live: root re-locked, `passwd -S` = `L`, confirmed by the user after the handover | Root password never in chat/argv: generated locally to `~/.alcusa/vps-root.txt` (umask 077); token and password only inside the `curl -K -` stdin config; failure deletes the file and redacts the body. Residuals SEC-034/035 (procedure). |
| SEC-019 | Verified (live, run 2) after a fix; Low residual SEC-032 | My static hand-trace was WRONG: it kept `\[[^\]]+\]` but fail2ban strips the timestamp before applying the failregex, so the bracket group is empty and matched 0/3 sample lines. Run 1 therefore stopped at R6 (R1-R5 OK). Fix (commit b2ae3c7): `\[[^\]]*\]`, verified on the box 2/3 (user `-` rejected by design). The assertion did its job (fatal). A live ban has NOT been proven yet (only `fail2ban-regex`). |
| SEC-020 | Verified (static + live fact) | Diffed the live `sudo -n -l` list (29 entries) against the new 91+92 contents: the only live entry absent from new is `/usr/sbin/nginx -T`; the unsafe certbot line (`RM_C`) is byte-identical to live, so the `Fxq` checks are not vacuous. `sudo -l` output is not wrapped (identical with and without TTY), so `flat()` is reliable. Order correct: `visudo -cf` then install then `visudo -c`, dead-man timer (name matches the stop target) armed before the 91 swap, restore on mismatch. Nit SEC-033. |
| SEC-021 | CLOSED 2026-10-22 | Deploy key `~/.ssh/id_ed25519` now has a passphrase (aes256-ctr/bcrypt), loaded through ssh-agent with a TTL. Cosmetic: the server `authorized_keys` line still carries the old personal-email comment (no action). |
| SEC-022 | Verified (static); deviation ACCEPTED | Better than `-m`: a wildcard certbot sudo rule is root-equivalent (`--pre-hook`). `update_account` runs as root once, email regex-validated, env var, quoted. Remaining allowlisted certbot line is exact; `show_account` prints only account URL and e-mail. Requires an existing ACME account (dev cert exists). Omitting `CERTBOT_EMAIL` only WARNs, so it must be pasted. Gate stays plan E0. |
| SEC-023 | Open (not in this re-test) | `admin.sh`, devops; gates (b) only. |
| SEC-024 | Accepted by user, close-by 2026-10-29 | IPv6 /128 granularity; mitigated by secret path + 24-char secret. Plan: `post-cutover-followups-2026-10-23.md`. |
| SEC-025 | Verified (static) | Separate files, plaintext before hash, matching pair re-issue, `.tmp`+`mv`, `$HO` 0700. See SEC-036. |
| SEC-026 | Verified (static) | `grep -R` follows the sites-enabled symlinks; live only `alcusa-dev.conf` has 443 listens, no `default_server`. `nginx.conf` main file not covered (unreadable to me, low). |
| SEC-004 | CLOSED 2026-10-22 | Dev basic-auth rotated (new 200, old 401). Local `.bak` copy still pending deletion by the user. |
| SEC-027 | Partially | Plan lines 78-81 now check old-refused/new-accepted via `curl -K -`; git-history exposure of the leaked value not re-read. Gates (c). |
| SEC-028 | Accepted by user, close-by 2026-10-29 | Report-Only. Sweep and enforce plan: `post-cutover-followups-2026-10-23.md`. |
| SEC-029 | Verified (plan text) | E3 carries the check; live L6. |
| SEC-030 | Accepted by user, close-by 2026-10-29 | R8 covers dev+prod; same disk, unencrypted, restore untested. Plan: `post-cutover-followups-2026-10-23.md`. |

### Answers to the specific questions

1. **`su -` from deploy.** The hash pin is sound: `install` copies to `/root` (0700), `sha256sum -c` checks that copy, `bash` runs that copy. Swapping `/home/deploy/handoff/` after `install` changes nothing, and the script sources no deploy-controlled code. TIOCSTI is off (`dev.tty.legacy_tiocsti = 0` live), so keystroke injection fails. NOT covered by the pin: the root password is typed into a pty that deploy owns and passes through deploy's shell startup (`~/.bashrc`, `~/.profile` prepends `~/bin` and `~/.local/bin` if present, a function or alias `su`); a hostile deploy session can harvest it (SEC-034). Live baseline: one authorized ed25519 key; rc files untouched since 2026-10-06; no `~/bin` or `~/.local/bin`; `/home/deploy/handoff` not yet created; deploy password LOCKED (`passwd -S` = L); `PermitRootLogin no`, `PasswordAuthentication no`. Note deploy is in group `sudo` and sudo lists `(ALL : ALL) ALL`; harmless only while the password stays locked (never set one).
2. **SEC-022 deviation:** accepted (table).
3. **SEC-020:** sound; only the marker location is weak (SEC-033).
4. **SEC-019:** correct; real gap is username evasion (SEC-032).
5. **SEC-021 residual, precisely.** Live: `/opt/alcusa` is root:root 755; `/opt/alcusa/prod` does not exist yet and will be created by root as deploy:deploy with `releases/`; `/var/www/alcusa/prod` is deploy:deploy. So deploy owns `/opt/alcusa/prod/current/dist/cli/*.js` and the `current` symlink, and the 92 rule `sudo -u alcusa /usr/local/bin/node --env-file=... .../dist/cli/<x>.js` runs JS deploy can replace: deploy gets arbitrary code as user `alcusa` (reads `prod-api.env`: DB app password, IP pepper, secret admin path; writes promos; can create an admin account via a pty). Not a new capability: deploy can already ship `admin-server.js` and `sudo systemctl restart alcusa-admin-prod`, and already holds the migrate DB account (ALL on `alcusa_prod`). `alcusa` has no sudo; `/etc/nginx`, `/etc/sudoers.d`, `/root` are not writable by either. No deploy-to-root path through these rules. With the key unpassphrased, whoever can read `~/.ssh/id_ed25519` on the workstation owns the prod app, DB and admin panel, but not root and not the basic-auth secret (htpasswd root:www-data 640, handover in `/root`). Offer: passphrase + agent (best) or `from=`/`restrict` on the `authorized_keys` line. Needs explicit user acceptance.
6/7. **SEC-025/026:** ok.
8. **User decisions.** noindex removed: confirmed (no include in the public vhost); admin keeps it through `alcusa-admin-proxy-prod.conf` (derived from the dev proxy snippet, which includes `alcusa-noindex.conf`). L1/L10 now expect NO `X-Robots-Tag` on the public site. Legacy Wix 301s: target is the literal `alcusasv.com` plus `$scheme`; no `$host`, `$http_host`, `$arg_*`, `$request_uri` is reflected, exact/prefix locations only: no open redirect, no Host influence. www `location /` uses `$request_uri` with a fixed host (a leading `//evil.com` stays a path on our host). Verified (static).
9. **Vhost R5.** No duplicate locations versus `alcusa-static.conf` (live: only `/.well-known/acme-challenge/` and `= /404.html`) or the snippets. Headers snippet (live): nosniff, X-Frame-Options SAMEORIGIN, Referrer-Policy, Permissions-Policy, HSTS `max-age=31536000` without `includeSubDomains`/`preload`, re-included inside each location that sets `add_header` (correct inheritance handling). CSP-RO at server level is not inherited by those three locations (documented). Admin locations carry `auth_basic`, `limit_req` (zones exist live), dedicated access log. `ssl_reject_handshake` needs 1.19.4+, box has 1.24.0. `$AP` is regex-pinned `^/ops-[0-9a-f]{24}$` (line 72) before it is interpolated into the unquoted heredoc, so a tampered env file cannot inject nginx syntax; the vhost and default-ssl heredocs are quoted so `$scheme/$uri/$request_uri` stay literal. The script's own `nginx -t` with restore is the real validator; failure is safe (exit 1, root stays unlocked).

### New findings

- **SEC-031 · Low (Medium if deploy is hostile during the run) · infra.** Root `install -d` follows deploy-planted symlinks. deploy owns `/var/www/alcusa/prod`, so it can pre-create `shared` (or `shared/data|media|media/promos`) as a symlink; R1 `install -d -m 2755 -o alcusa -g www-data "$SH" ...` then chowns the TARGET (e.g. `/usr/local/sbin` becomes alcusa-owned, alcusa replaces `alcusa-backup.sh`, which deploy runs as root). Live today: `/var/www/alcusa/prod` has only `current` and `releases`, nothing planted. Optional patch before R1: `for d in /var/www/alcusa/prod "$SH" "$SH/data" "$SH/media" "$SH/media/promos" "$OPT"; do [[ ! -L $d ]] || { echo "symlink at $d" >&2; exit 1; }; done`. Without a hash change: run `ls -la /var/www/alcusa/prod /opt/alcusa` right before the paste. Acceptance: no symlink before; L16 after.
- **SEC-032 · Low · infra.** fail2ban evasion by crafted basic-auth username: `\S+` fails on a username containing a space, and user `-` (or starting `- `) counts as anonymous, so neither rule fires. `limit_req` (60 r/m, login 5 r/m), 24-char secret and secret path still hold. Patch next revision: rule 1 `^<HOST> - (?!- \[).+? \[[^\]]*\] "[A-Z]+ \S+ HTTP/[0-9.]+" 401(?: |$)`; rule 2 `^<HOST> - .+? \[[^\]]*\] "[A-Z]+ \S+ HTTP/[0-9.]+" 429(?: |$)`; the 3-line sample assertion stays valid.
- **SEC-033 · Low · infra.** `/var/tmp/sudoers-ok` marker in a world-writable sticky dir: deploy can create it in the window and neutralise the dead-man restore, or plant a symlink that makes the later `touch` fail. Use `"$BK/sudoers-ok"` in the script and the restore helper.
- **SEC-034 · Medium (procedural) · Foreman/user.** Hostile-deploy harvesting of the `su -` password. Before pasting, in the deploy session: `who` (only yours), `ls -la ~; ls -d ~/bin ~/.local/bin` (absent), `type -a su` (only `/usr/bin/su`), `alias | grep -w su` (empty), `wc -l ~/.ssh/authorized_keys` (1), sha256 of `/home/deploy/handoff/alcusa-prod-root.sh` equals the pin. Invoke `/usr/bin/su -` by absolute path.
- **SEC-035 · Low (procedural) · user.** `clip < ~/.alcusa/vps-root.txt` leaves the password in clipboard history (Win+V): clear it. After R9 succeeds, `shred -u ~/.alcusa/vps-root.txt` (the setter script also refuses to run while it exists).
- **SEC-036 · Low · infra.** Re-running after the instructed `shred -u` of the handover (e.g. the planned re-run after certbot) re-issues the basic-auth credential (guard is `-s prod-admin-basic.txt`), invalidating the delivered one. It logs this. Do not re-run after delivery, or re-deliver. Optional patch: key the guard on a marker file.

### Conditions for GO (no hash change)
1. SEC-034 and SEC-031 pre-checks immediately before the paste.
2. Paste with a real `CERTBOT_EMAIL`.
3. If the link drops mid-run, re-run the same script (idempotent; the dead-man timer restores sudoers within 15 min if R7 was interrupted).
4. After success: SEC-035 cleanup and remove `/home/deploy/handoff`.

### Live checks to repeat after execution
- L0 old dev basic-auth refused, new accepted on dev root and `/ops-dev`; `.bak` removed.
- L1 `curl -sI https://alcusasv.com`: 200, HSTS `max-age=31536000` with no `includeSubDomains`/`preload`, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, `content-security-policy-report-only`, and NO `x-robots-tag`.
- L2 `http://alcusasv.com` and `http://www.alcusasv.com/x` 301 to `https://alcusasv.com[/x]`; `s_client -tls1_1` fails, `-tls1_2`/`-tls1_3` succeed.
- L3 `sudo certbot certificates` (both names), `certbot.timer` active, `sudo certbot renew --dry-run` green, `sudo certbot show_account` shows an e-mail.
- L4 unknown SNI and bare IP over HTTPS get a handshake failure; a foreign `Host` never gets dev content.
- L5 admin over HTTPS: right path without basic credential 401; wrong path static 404; with credentials login works and logs out; cookie HttpOnly/Secure/SameSite; forced password change.
- L6 `http://alcusasv.com<ADMIN_PATH>/login` gives 301; the path appears in `/var/log/nginx/access.log` only for that deliberate request (certbot's `if` redirect logs before the location) and never in `journalctl -u nginx`.
- L7 `sudo fail2ban-client status alcusa-admin` lists `alcusa-admin-prod.access.log`; a throwaway IP is banned after 8 counted hits; unban via the allowlisted command; a wrong app login is a counted 401. A request with basic user `a b` is not counted (SEC-032, informational).
- L8 `sudo -n -l` shows the prod 92 lines and no `nginx -T`; `sudo -n nginx -T` and `sudo -n id` refused; `passwd -S deploy` still `L`; `systemctl is-active alcusa-admin-prod`; `systemctl show -p User,NoNewPrivileges alcusa-admin-prod`; `sudo /usr/local/sbin/alcusa-prod-admins` gives `admins=1` after C4.
- L9 modes: `prod-api.env` alcusa 600, `prod-migrate.env` deploy 600, htpasswd root:www-data 640, `alcusa-admin-prod.conf` root 640; handover shredded after delivery; `grep -c` (counts only) for `BASIC_PASS|PEPPER|PASSWORD` in `/root/alcusa-prod-root.log` is 0.
- L10 prod `promos-status` equals dev (3 published); `/api/promotions.json` 200 JSON with `Cache-Control: no-cache`; `/media/promos/` no autoindex; prod `admin_users` has exactly the operator.
- L11 backup output lists both DBs and both shared archives; restore test scheduled with a date.
- L12 mail MX/TXT unchanged after DNS change.
- L13 30-minute monitor of nginx/ssh/fail2ban/admin journals shows no unexpected admin hits.
- L14 (new) `curl -sI https://alcusasv.com/shop`, `/book-online`, `/product-page/x`, `/service-page/x` all 301 `Location: https://alcusasv.com/`; with `-H 'Host: evil.example'` still no foreign Location; `http://www.alcusasv.com/shop` ends on the apex in 2 hops.
- L15 (new) `passwd -S root` = `L`; `~/.alcusa/vps-root.txt` shredded; clipboard cleared.
- L16 (new, SEC-031) `stat -c '%U:%G %a'` on `/usr/local/sbin`, `/usr/local/sbin/alcusa-backup.sh`, `/etc/sudoers.d` is root:root (750 for the script); `/var/www/alcusa/prod/shared` is alcusa:www-data 2755.
- L17 (new) deploy-key policy decision (passphrase/agent or accepted) recorded for SEC-021.

### Handoff (re-test)
Owners: SEC-031/032/033/036 senior-infrastructure (optional patches, Low); SEC-034 Foreman/user (procedure); SEC-035 user. Accept: SEC-021, 024, 028. Still pending elsewhere: SEC-023 (devops, gates b), SEC-027 (Foreman, gates c). Verdict (a), hash `a3485e96...f32f` (run 1; superseded by `ada02487...d9d5`, run 2): GO.

## As executed (2026-10-22) and live state

- **Script hashes.** Run 1: `a3485e96...` (R1-R5 OK, R6 failed, see SEC-019). Run 2, the one that completed: sha256 `ada0248788455d0a69bc970ca01ac6d6e48008577ffc1db7d788c59d15f9d9d5` (commit b2ae3c7 changed the failregex bracket group `+` to `*`). References above to `a3485e96` are historical.
- **SEC-018** closed: root re-locked (`passwd -S` = `L`), confirmed by the user. **SEC-035** closed: handover files shredded, clipboard cleared, `~/.alcusa/vps-root.txt` does not exist. **SEC-021** closed (see table). **SEC-004** closed (local `.bak` deletion pending, user).
- **Live (Foreman-verified):** Let's Encrypt cert apex+www (expires 2027-01-21, auto-renew); http to https 301; www to apex 301; HSTS `max-age=31536000` (no subdomains); CSP Report-Only; legacy Wix 301s; unknown SNI rejected; dev 401 without auth. Admin prod: 1 admin (`alcusa`), jail `alcusa-admin` 0 failed / 0 banned.
- **Not proven:** a live fail2ban ban (only `fail2ban-regex` in stage B). Deliberately not tested from the user's IP.
- **Open, accepted by the user, close-by 2026-10-29:** SEC-024, SEC-028, SEC-030. Closure plans in `docs/security/post-cutover-followups-2026-10-23.md`.
