# Security review - Alcusa (pre-production gate) - 2026-10-17

Reviewer: senior-cyber-security (audit-only). Commit reviewed: `dev` @ `fcd4ac9` (deployed to dev.alcusasv.com, release 20261017T015513Z). No product code, server, DNS or pipeline was changed. No credential was read or used; external checks were unauthenticated.

## 1. Scope and method
- Static FE (`src/`: cotizador, quote PDF/share, delivery address, wa.me link building), admin server (`server/src/modules/admin/*`, `promotions/images.ts`, `schema.ts`, `service.ts`, `http/app.ts`), migrations list, ops scripts (`deploy.sh`, bootstrap nginx/systemd sections, runbook), `.github/workflows/*`.
- `api/` (PHP): `api/_lib` and `api/_dev` are EMPTY and not tracked. No PHP endpoints exist; nothing `_dev` is deployed.
- Tools: `npm audit` (root, root `--omit=dev`, `server/`), grep secret sweep (gitleaks/semgrep/osv-scanner not installed), tracked-file check for env/key files, unauthenticated curl (headers, redirect, TLS 1.1 vs 1.3, `.git/.env/api` paths), read-only SSH as `deploy` (sshd -T, ss, ufw, nginx -T filtered, stat, versions).
- Not covered (budget): full read of `admin-dev.sh`, `create-admin.ts`, `mariadb-store.ts` bodies (SQL spot-checked: all queries use `execute` with `?` placeholders), the `quotes` module (not registered by the admin entry point nor proxied by nginx), dynamic PoCs. Authenticated admin behaviour was not exercised (no credentials used, by rule).

## 2. Threat model summary
- Assets: admin credential + session (controls what promos the public sees), published `promotions.json` + promo images (defacement), customer PII typed in the cotizador (name, phone, delivery address; kept client-side in sessionStorage, leaves the browser only via PDF download and wa.me text), the VPS (root via `deploy`), domain/email reputation.
- Actors: anonymous visitor; Alcusa admin (single account); attacker with stolen admin password or stolen `deploy` SSH key; malicious uploader (needs admin session).
- Entry points: public static site (nginx); cotizador inputs -> PDF and `wa.me/?text=` (encoded with `encodeURIComponent`, single builder `waLink.ts`); admin SSR panel (`/ops-dev`, forms, multipart image upload); SSH 22.
- Trust boundaries: browser -> nginx (TLS) -> admin Fastify on 127.0.0.1:4500 -> MariaDB 127.0.0.1:3306; admin process -> shared dir (`promotions.json`, images) -> nginx static; laptop -> VPS via `deploy`.
- Top risks: (1) deploy-key theft = root; (2) admin brute-force / lockout abuse once exposed in prod; (3) no CSP on the public site; (4) CI has no security gate; (5) email spoofing without DMARC.

## 3. Checklist results (evidence)
| Area | Result |
|---|---|
| Passwords | argon2id 64 MiB/t=3 (`password.ts:11`), 16-byte salt, timing-safe compare, min 14 chars, dummy hash for unknown users (`auth-service.ts` login). PASS |
| Session | 256-bit random id, only SHA-256 stored, `__Host-` cookie HttpOnly+Secure+SameSite=Strict (`routes.ts:13,39`), idle 30 min / absolute 8 h (`auth-service.ts:6-7`), new session on login and on password change (old sessions deleted), logout deletes server-side. PASS |
| CSRF | per-session token compared in constant time + Origin/Sec-Fetch-Site check on every authenticated POST (`routes.ts` guardPost); login POST has origin check only. PASS (see SEC-008) |
| AuthZ | single role; every route goes through `guard`/`guardPost`; unauth -> 303 login; MFA/enroll routes 404. PASS |
| SQL | all `mariadb-store.ts` queries parameterised (23 execute/query calls, none string-built). PASS |
| Upload | `images.ts`: 5 MiB cap (multipart limit + check), sharp format sniff (jpeg/png/webp only), 24 MP pixel cap, 600-6000 px, full re-encode to WebP (drops metadata/payload), random server-generated filename (client name never used), temp+rename, files=1. Preview route allowlists `^[A-Za-z0-9-]+-(600|900)\.webp$` (no traversal). PASS |
| XSS | no `dangerouslySetInnerHTML`/`innerHTML` in `src`; `set:html` only for two static icon constants (`Confianza.astro:48`, `InfoImportante.astro:50`); promo text rejects `<`/`>` (`schema.ts:111`); client runtime accepts only `/media|images/promos/` image paths (`promotionsParser.ts:264`). PASS |
| Admin headers | CSP `default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'`, `no-store`, noindex (`routes.ts:14,35`) + helmet. PASS |
| Secrets in repo | only `.env.example` files tracked; secret grep found one hit in `server/test/unit/config.test.ts` (test fixture, value not printed/not a real credential). Wompi code gone (stale docs remain, SEC-017). PASS |
| TLS | HTTP->HTTPS 301; TLS 1.3 OK, TLS 1.1 rejected; vhost sets TLSv1.2/1.3 + AEAD ciphers; `server_tokens off`. PASS |
| Host | sshd: root login no, password auth no, kbd-interactive no, MaxAuthTries 3; ufw default-deny, only 22/80/443; fail2ban + unattended-upgrades active; MariaDB 127.0.0.1 only; admin 127.0.0.1:4500 only; env files 600 owned by service users, DDL credential split from the service; systemd unit sandboxed (NoNewPrivileges, ProtectSystem=strict, empty CapabilityBoundingSet...); Ubuntu 24.04.5, 4 pending upgrades, no reboot pending. PASS |
| Dev exposure | `/`, `/ops-dev/login`, `/api/*`, `/.git/config`, `/.env` all answer 401 unauthenticated; X-Robots-Tag noindex. PASS |
| Rate limits | nginx `limit_req` 5 r/min/IP admin login (burst 5), 60 r/min admin, `client_max_body_size 6m`; app lockout 5 fails -> 1/5/15/60 min. PASS (see SEC-007) |

## 4. Findings
No Critical. No High. Counts: Medium 5, Low 7, Info 3 (15 findings listed below as SEC-001..SEC-017; two numbers are Info/Low notes).

### SEC-001 - No Content-Security-Policy on the public site - Medium - Open
- Evidence: `nginx -T` security headers are nosniff/X-Frame/Referrer/Permissions/HSTS only; no `content-security-policy` string in `src/`, `astro.config.mjs`, `public/`, `docs/ops`. The admin has a strict CSP; the public site (Astro inline scripts, e.g. `BaseLayout.astro:43`) has none.
- Impact: any future XSS or injected third-party script is unconstrained; the site handles customer PII in the cotizador.
- Fix: add CSP (start Report-Only) with hashes/nonces for Astro inline scripts, `connect-src 'self'`, `img-src 'self' data:`, `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self'`.
- Acceptance: curl of `/` and `/cotizador` shows CSP; Playwright e2e shows zero CSP violations across catalog + cotizador + PDF download; a test asserts the header.
- Owner: fe-senior-react (policy/hashes) + senior-infrastructure (header). NEEDS USER APPROVAL (nginx).

### SEC-002 - `deploy` has passwordless full sudo (key theft = root) - Medium - Open
- Evidence: `sudo -n -l` as deploy shows `(ALL) NOPASSWD: ALL`. The deploy key lives on the developer workstation (`deploy.sh:15` default `~/.ssh/id_ed25519`).
- Impact: one stolen/phished laptop key = root on the VPS (DB, env files, prod docroot).
- Fix: restrict sudo to an allowlist (systemctl restart alcusa-admin-*, nginx -t/reload) or use a forced-command deploy key limited to the release dirs; passphrase/hardware-back the key; keep a separate key for root tasks.
- Acceptance: `sudo -n -l` as deploy lists only allowlisted commands; `deploy.sh` and `admin-dev.sh release` still work; `sudo -n true` fails.
- Owner: senior-infrastructure. NEEDS USER APPROVAL (server).

### SEC-003 - Prod admin exposure controls not implemented (runbook 11.7) - Medium - Open (blocks admin in prod, not the static site)
- Evidence: runbook 11.7 "not done yet": random admin path, IP allowlist or dedicated auth_basic, fail2ban jail on login 401/429, prod DB/env/unit, `SECRETS_KEY`/`IP_HASH_PEPPER`. Bootstrap constants are dev-only. In dev, shared basic auth fronts the admin; prod will have none by default.
- Impact: admin login (sole control over public promos) would be internet-facing with only 5 r/min/IP + per-account lockout.
- Fix: implement 11.7 before publishing the admin on `alcusasv.com`.
- Acceptance: unauthenticated / non-allowlisted requests to the prod admin return 404/401 with no app fingerprint; fail2ban jail bans after N failures (tested from the owner's throwaway IP); unit sandboxed as in dev.
- Owner: senior-infrastructure (+ senior-be to generalise the script). NEEDS USER APPROVAL.

### SEC-004 - Dev basic-auth password exposed in a transcript, not rotated (known, deferred) - Medium - Open (accepted until cutover)
- Evidence: printed 2026-10-09 (user-known); credential file location documented in runbook lines 51/87.
- Impact: anyone with that transcript reaches dev site and the admin login page (admin password still required).
- Fix: rotate before cutover; never reuse for a prod layer (SEC-003).
- Acceptance: old credential returns 401 on dev; new one never appears in repo/transcripts.
- Owner: senior-infrastructure. NEEDS USER APPROVAL (server). Pre-cutover gate.

### SEC-005 - CI hardening and missing security stage - Medium - Open
- Evidence: `.github/workflows/ci.yml` has no `permissions:` block (default token scope; `visual-baselines.yml:16` correctly sets `contents: read`); actions pinned to major tags (`actions/checkout@v7`, `setup-node@v7`, `upload-artifact@v7`), not SHAs; no `npm audit`, secret-scan or SAST step; no secrets used in either workflow (good).
- Impact: a retagged/compromised action runs with a broad token; vulnerable deps or committed secrets are not caught automatically.
- Fix: top-level `permissions: contents: read`; pin actions by SHA (+ Dependabot); add `npm audit --omit=dev --audit-level=high` (root and `server/`), gitleaks, semgrep; branch protection on `main` requiring CI.
- Acceptance: workflow shows `permissions` and SHA pins; a seeded fake secret / vulnerable dep on a test branch fails the job.
- Owner: senior-devops. NEEDS USER APPROVAL (pipeline).

### SEC-006 - No SPF/DKIM/DMARC (known) - Medium - Open
- Evidence: user-confirmed; DNS not touched by this review.
- Impact: spoofing of `@alcusasv.com` for phishing; deliverability if email is added later.
- Fix: publish SPF, DKIM (for the chosen mail provider) and DMARC at `p=none` with reporting, then tighten; null-MX / `v=spf1 -all` posture if no mail is sent.
- Acceptance: `dig TXT _dmarc.alcusasv.com` returns a policy; a test message passes SPF/DKIM/DMARC alignment.
- Owner: senior-infrastructure. NEEDS USER APPROVAL (DNS).

### SEC-007 - Lockout answers 429 (user enumeration) and can lock out the only admin - Low - Verified (static re-test 2026-10-17; dynamic checks pending senior-qa)
- Evidence: `routes.ts` login handler returns 429 + minutes only for existing locked accounts; `auth-service.ts` locks per account after 5 failures (1/5/15/60 min). Runbook 11.8 item 8.
- Impact: confirms the admin username; an attacker can keep the sole admin locked out (availability), bounded by nginx 5 r/min/IP.
- Fix: identical generic 401 during lockout; consider lock per (account, IP) or progressive delay; CLI unlock.
- Acceptance: test shows locked and unknown user return identical status/body.
- Owner: senior-be.
- **Fix applied (design choice).** The per-account hard lock is gone. A per-(client IP, username) throttle with progressive backoff replaced it (`login-throttle.ts`): every 5th consecutive failure of that pair blocks it for 1, 5, 15, then 60 minutes. While blocked, and for unknown or inactive users, the answer is the same generic 401 as a wrong password, with the same argon2 cost (a dummy verification is always paid). Unknown usernames are tracked exactly like real ones, so nothing separates them.
  - Justification: with one admin, a per-account lock is a denial-of-service lever and an enumeration oracle. Keying on the IP means an attacker only throttles their own pair; the admin logging in from another IP is never blocked (tested).
  - Client IP: the last `X-Forwarded-For` entry, honoured only when the socket peer is loopback (nginx overwrites that header with `$remote_addr`, see `alcusa-admin-bootstrap.sh`); otherwise the socket address.
  - Residual risks: state is in-process (a service restart clears it; nginx `limit_req` 5 r/min/IP stays the outer gate); an attacker rotating IPs is bounded only by nginx and the 14-character password policy (dev also has basic auth). The DB columns `failed_attempts`/`locked_until` no longer lock anything (they are reset on a good login); a stale `locked_until` already in the DB is ignored. The audit action `admin.locked` is still written when a pair enters backoff (feeds the SEC-011 alert).
- Tests: `server/test/admin/auth.test.ts` (throttle, another IP, unknown vs known), `server/test/admin/hardening.test.ts` (HTTP-level identical status and body).

### SEC-008 - `Origin: null` accepted with `Sec-Fetch-Site: same-origin`; requests with neither header pass; login has no CSRF token - Low - Verified (static re-test 2026-10-17; browser smoke pending senior-qa)
- Evidence: `sameOrigin()` in `auth-service.ts`; runbook 11.8 item 5. SameSite=Strict mitigates.
- Fix: reject state-changing requests lacking both Origin and Sec-Fetch-Site; optional pre-session CSRF token for login.
- Acceptance: POST `/promociones` with neither header -> 403.
- Owner: senior-be.
- **Fix applied.** `sameOrigin()` now rejects `Origin: null` in all cases and any request carrying neither `Origin` nor `Sec-Fetch-Site`. The login form has a pre-session CSRF token: GET `/login` issues cookie `__Host-alcusa_login` (HttpOnly, Secure, SameSite=Strict, random 256 bit) and the same value in the hidden `_csrf` field; POST `/login` needs both to match (constant time) plus the origin check; the cookie is cleared on success.
- Note for QA: the old `Origin: null` allowance existed because helmet sent `Referrer-Policy: no-referrer`, under which browsers send `Origin: null` on form POSTs. Admin pages now send `Referrer-Policy: same-origin` and a `<meta name="referrer" content="same-origin">`. Verified in real Chromium: with only the `no-referrer` header the POST carries `Origin: null`; with the meta tag it carries the real origin. The meta tag matters because nginx adds its own Referrer-Policy header on top of the app's. `server/scripts/admin-browser-smoke.ts` needs MariaDB and was NOT run here: please run it on re-test.
- Tests: `hardening.test.ts`, `auth.test.ts` (sameOrigin); the existing admin e2e tests now send `Sec-Fetch-Site: same-origin` like a browser and fetch the login form first.

### SEC-009 - Promo `image` path not validated server-side - Low - Verified (static re-test 2026-10-17)
- Evidence: `routes.ts` `readForm` takes `str(b,'image')` when no file is uploaded; `schema.ts:62-111` checks type, length and `<>` only. The allowlist `SAFE_PROMO_IMAGE` exists only client-side (`promotionsParser.ts:264`).
- Impact: an authenticated admin (or hijacked session) can publish an arbitrary URL in `promotions.json`; the browser runtime rejects it and falls back to baked HTML. Authenticated only, hence Low.
- Fix: enforce the same regex in `validatePromo`.
- Acceptance: unit test: `https://evil/x.png`, `//evil`, `/media/promos/../x` -> 422.
- Owner: senior-be.
- **Fix applied.** `validateAdminLimits` (every save, publish and the importer) rejects an image that does not match `ADMIN_PROMO_IMAGE`: a directory path of `[A-Za-z0-9_-]` segments (no dots, so no `..`; no scheme, no external URL, no query), then `promo-<16 hex>-(600|900).webp` (generated by the ingest) or the legacy `promo-N-(600|900).webp`. The HTTP edge also requires a hand-posted `image` to sit under the configured `PROMO_IMAGE_URL_PREFIX`. The client-side regex is unchanged. Tests: `hardening.test.ts`.

### SEC-010 - `create-admin` cannot rotate/reset the single admin password (known) - Low - Verified (static re-test 2026-10-17; TTY run pending senior-qa)
- Impact: forgotten or compromised password has no supported reset (only in-panel change with the current one).
- Fix: `create-admin --reset`: sets `must_change_password`, kills sessions, audit row; document in runbook.
- Acceptance: CLI test: reset invalidates old password and sessions.
- Owner: senior-be.
- **Fix applied.** `create-admin <usuario> --rotate` (TTY only, hidden prompt twice, policy check) calls `AuthService.rotatePassword`: new argon2id hash, `must_change_password = true`, counters cleared, every session of that admin deleted, audit row `admin.password_rotated` (actor `cli`, username only, never the password). Argv carries only the username and the flag (the parser rejects extra arguments); no env or file path for the password. No migration. Runbook section 11.4 updated with the exact `ssh -t` command. Tests: `auth.test.ts`.

### SEC-011 - Audit/monitoring gaps on admin login - Low - Open
- Evidence: audit rows for failed/unknown logins have no source IP or username (`actor: 'anon'`); no fail2ban jail for the admin; no alert on lockouts. App runs with `TRUST_PROXY: false` (`admin-server.ts`), so the IP is not available to it.
- Fix: enable trustProxy for 127.0.0.1, record IP (per privacy decision), alert on `admin.locked`.
- Acceptance: audit row has IP; lockout triggers a notification.
- Owner: senior-be + senior-infrastructure.

### SEC-012 - Scripts use `StrictHostKeyChecking=accept-new` - Low - Open
- Evidence: `deploy.sh:30`, `admin-dev.sh:40` (trust on first use).
- Fix: pin the VPS host-key fingerprint and use `StrictHostKeyChecking=yes`.
- Owner: senior-devops.

### SEC-013 - Build-time dependency advisories - Low - Open
- Evidence: root `npm audit`: 7 high, all transitive build/dev tooling (`eslint-plugin-astro` -> `astro-eslint-parser` -> `fast-glob` -> `micromatch` -> `braces` ReDoS; `http-cache-semantics`; `source-map-js` DoS). `--omit=dev`: 2 high (`http-cache-semantics`, `source-map-js`) in the Astro build chain, not shipped to browsers or running on the server. `server/`: 0 prod advisories, 1 low (`esbuild` dev server, Windows).
- Impact: DoS of the build machine with attacker-controlled input only; no runtime exposure.
- Fix: `npm audit fix` / bump when compatible; add the audit gate (SEC-005).
- Acceptance: `npm audit --omit=dev --audit-level=high` exits 0 in root and `server/`.
- Owner: fe-senior-react (root), senior-be (server).

### SEC-014 - HSTS without includeSubDomains/preload; prod vhost HTTP-only until cutover - Low - Open (at cutover)
- Evidence: dev sends `max-age=31536000` only; prod vhost serves HTTP with 301 to apex + `.well-known`.
- Fix: at cutover issue the cert, redirect HTTP->HTTPS, HSTS (`includeSubDomains` once all subdomains are HTTPS), confirm `ssl_protocols` TLS1.2+ applies to the prod vhost (the global nginx.conf default still lists TLSv1/1.1; the vhost overrides it, verified rejected on dev).
- Acceptance: testssl/SSL Labs A; `curl -I http://alcusasv.com` -> 301 https; HSTS present.
- Owner: senior-infrastructure. NEEDS USER APPROVAL (server/DNS).

### SEC-015 - Admin v1.0 has no 2FA - Info - Accepted risk (user)
- MFA seam exists: migration `0002_admin_mfa_seam.sql`, `ADMIN_MFA_MODE` (off|optional|required), `stage.ts` `nextStage`, session `stage` enforced in `resolve()`, reserved `/login/mfa` and `/cuenta/mfa-enroll` routes returning 404. Compensating controls: 14+ char argon2id password, lockout, nginx rate limit, SEC-003 second layer. Plan 2FA for v1.1.

### SEC-016 - Customer PII handling - Info - Residual
- Delivery address/name live in tab-scoped sessionStorage (`persist.ts:8`, `stash.ts`), no server transmission in current scope; they leave only through the user's own PDF/wa.me action. Needs a legal/privacy decision (not legal advice) on a privacy notice under El Salvador data-protection requirements, and on retention if quote folios are ever stored server-side.

### SEC-017 - Stale payment docs - Info
- `docs/ops/wompi-go-live.md`, ADR-003 and slice S8 describe removed payment code; mark superseded so nobody re-enables a payment path without a review.

## 5. Residual risks for user acceptance
1. No 2FA in admin v1.0 (SEC-015).
2. Dev basic-auth rotation deferred to pre-cutover (SEC-004).
3. `deploy` NOPASSWD root until SEC-002 is done.
4. Authenticated dynamic testing of the admin (upload/CSRF/session) was not performed; senior-qa should automate the abuse cases in section 6.

## 6. Abuse cases for senior-qa (regression)
- POST `/ops-dev/promociones` without `_csrf`, with a foreign Origin, and with neither Origin nor Sec-Fetch-Site -> 403, nothing persisted.
- Upload: HTML/SVG/PHP renamed `.png`, a 6 MiB file, a 30 MP image, a polyglot JPEG -> rejected or re-encoded to WebP; stored name is random.
- `/media/promos/..%2f..%2fetc%2fpasswd` and any `/media/promos/*` without a session -> 404.
- Session: old session invalid after password change; idle 30 min / absolute 8 h expiry; logout invalidates server-side.
- Throttled vs unknown user responses identical, and the admin from a second IP still logs in (SEC-007); promo `image` allowlist (SEC-009).

## 7. Security-stage spec for senior-devops
Blocking on PR/push: `npm audit --omit=dev --audit-level=high` (root and `server/`); gitleaks (full history on main, diff on PRs); semgrep `p/typescript` + `p/owasp-top-ten` (high = fail); default `permissions: contents: read`; actions pinned by SHA; header check against the built preview (CSP, nosniff, frame-ancestors) once SEC-001 lands; branch protection on `main`. Non-blocking: dev-dependency audit report, weekly Dependabot.

## 8. Go-live verdict
- PUBLIC STATIC SITE + cotizador (PDF/WhatsApp), no admin on prod: CONDITIONAL GO. No Critical/High. Blocking before cutover: SEC-004 (rotate dev credential, no reuse), SEC-014 (prod TLS + redirect + HSTS). Strongly recommended before cutover: SEC-001 (CSP, Report-Only acceptable), SEC-006 (SPF/DMARC, `p=none` acceptable), SEC-002, SEC-005 (user may accept with a dated plan).
- ADMIN on production: NO-GO until SEC-003 is implemented and verified, SEC-007/008/009 fixed (quick Low fixes) and SEC-010 available for recovery.
- Can ship now: everything else; Low/Info go to the tech-debt backlog.

## 9. Items needing user approval (server/DNS/pipeline)
SEC-001 (nginx header), SEC-002 (sudoers/deploy key), SEC-003 (prod nginx/fail2ban/env), SEC-004 (dev credential rotation), SEC-005 (CI workflows), SEC-006 (DNS), SEC-014 (prod TLS/DNS).

## Re-test 2026-10-17 (security gate, static + admin vitest 132 pass, tsc clean)
- SEC-007 Verified. XFF honoured only from loopback peer (routes.ts clientIp), last entry; one argon2 verify on every path; map bounded at 5000 keys with eviction. Notes (Info): first unknown-user request pays an extra hash for the dummy (warm the dummy at boot); a single-IP flood of 5000 random usernames could evict its own block, impractical under nginx limit_req; per-IP only, a distributed guesser is bounded by the password policy plus nginx. Confirm admin app binds loopback only and nginx sets/appends XFF.
- SEC-008 Verified. csrfValid length check + timingSafeEqual; token is 32 random bytes hex; cookie __Host-, HttpOnly, Secure, SameSite=Strict. Referrer-Policy same-origin leaks nothing cross-origin. Browser smoke (Origin on POST) pending QA. UX follow-up: GET /login reuses a well-formed `__Host-alcusa_login` cookie (only mints when absent/malformed) so a second tab or back button does not invalidate the first form; a failed login CSRF re-renders the form (403, fresh token, generic message, username-independent).
- SEC-009 Verified. Anchored regex without m flag, charset [A-Za-z0-9_-] only (no dots, encoding, backslash, //host, query, unicode); prefix check at routes.ts:182 plus schema. Legacy public/images/promos/promo-N-* match. QA: confirm every live promo image edits without error.
- SEC-010 Verified. Password only from hidden TTY prompt, policy applied, must_change, sessions deleted, audit without password. Note (Low/Info): rotatePassword sets isActive true (also reactivates a disabled admin) and does not reset the in-memory throttle.
