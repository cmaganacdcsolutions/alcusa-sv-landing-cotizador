# ADR-002: Hosting on existing Hostinger account — static files + PHP endpoints

Date: 2026-09-28
Status: accepted

## Context
Production host is Alcusa's existing Hostinger account. Plan is unknown; the
safe assumption is plain shared web hosting: Apache + PHP, `.htaccess`
available, SSH/Node **not** guaranteed. Migration/DNS/email cutover from Wix
is an explicitly later phase and out of scope here.

## Decision
The Astro build output (`dist/`) is uploaded as static files to
`public_html/`. The only server-side code is a handful of small PHP files
under `public_html/api/` (`wompi-create-link.php`, `wompi-webhook.php`) that
hold Wompi secrets and make the outbound API calls — nothing else runs
server-side. `.htaccess` at the root sets security headers, forces HTTPS, and
routes `/api/*` to the PHP files. No database, no PHP framework, no
Composer dependency beyond what's needed for an HMAC check (stdlib only).

## Alternatives considered
- **Node/SSR host (Vercel/Netlify/Railway) instead of Hostinger.** Rejected:
  the brief is explicit that Hostinger is the production host — the client
  already pays for it. Introducing a second host adds cost, DNS complexity
  and an exit-cost discussion nobody asked for.
- **Serverless functions on a CDN in front of Hostinger.** Rejected as
  premature: current traffic assumption (50–200 sessions/day) doesn't justify
  a second platform; PHP-on-the-same-host is strictly simpler to operate for
  a one-person team.
- **No server code at all (100% client-side, including Wompi).** Rejected:
  Wompi's API auth uses a Bearer token obtained with a client secret — that
  secret cannot live in a browser bundle. A minimal server hop is mandatory
  (see ADR-003).

## Consequences
- Good: single host, single deploy target, no new recurring cost.
- Good: static files are trivially cacheable and fast; PHP endpoints are
  small enough to review in full at every gate.
- Bad: no guaranteed persistence layer (no DB) — accepted, tracked in
  `tech-debt.md`. If Alcusa's Hostinger plan turns out not to support PHP or
  `.htaccess` overrides, this ADR must be revisited (blocker — see HANDOFF).
- Exit cost: low for the static part (any static host works); the PHP
  endpoints are ~150 lines total and portable to any PHP-capable host.

## Revisión 2026-09-29: VPS KVM 2

Status: accepted (supersedes the shared-hosting assumption in "Context" and
"Decision"; the rest of this ADR stands).

### Change
The client's Hostinger product is a **KVM 2 VPS** (2 vCPU, 8 GB RAM,
100 GB NVMe), not shared web hosting. Hostinger remains the host, so the
"single host, no new recurring cost" reasoning still holds. What changes is
the runtime and who operates it.

- **Runtime**: Ubuntu 24.04 LTS without a control panel, **Nginx + PHP-FPM 8.3**
  (dedicated pool and user). Apache/`.htaccess` is no longer the primary
  mechanism; the security headers, HTTPS redirect and denial of `api/_lib`,
  `api/_dev` and dotfiles move to the Nginx vhost. The `.htaccess` files in the
  repo stay as defense in depth and for any Apache-compatible fallback.
- **Layout**: atomic releases (`releases/<ts>` + `current` symlink) instead of
  uploading into `public_html/`. Wompi secrets and runtime data live in a
  private directory outside the webroot and outside the releases, located via
  `WOMPI_CONFIG_FILE` / `WOMPI_DATA_DIR` set in the PHP-FPM pool (the default
  `dirname(__DIR__, 3)` path would resolve inside `releases/` and must not be
  relied on).
- **TLS**: certbot (Let's Encrypt) managed by us, replacing hPanel-managed
  certificates. HSTS is enabled last and gradually.
- **Deploy**: SSH/rsync from CI is now possible (no FTPS fallback needed);
  the pipeline is owned by senior-devops.
- **DNS/domain**: the domain is being moved from Wix to Hostinger before the
  cutover; Google Workspace mail records are preserved unchanged. See the
  operations runbook (kept outside this public repo).

### Consequences
- Good: SSH, real atomic deploys and instant rollback, per-pool isolation,
  `limit_req` on the payment endpoint, no dependence on shared-host limits.
- Good: the ADR-002 "blocker if the plan lacks PHP/`.htaccess`" risk is gone.
- Bad: we now own OS patching, firewall, TLS renewal, logging and backups
  (unattended-upgrades, ufw, fail2ban, certbot timer, weekly Hostinger
  snapshots plus a backup of the private data directory). This is
  operational cost the shared plan hid.
- Bad: a single VPS is a single point of failure (no HA). Accepted at
  50-200 sessions/day; recovery is a rebuild from the runbook plus the
  restored private data.
- Bad: the runtime holds state (`data/orders`, `data/processed`) that the
  shared-hosting assumption also had; it now needs an explicit backup, since
  the webhook's idempotency depends on it.
- Exit cost: unchanged (static files plus a small PHP surface run on any
  PHP-capable host).
- Follow-ups: S11 to finalize the CSP (Astro inline scripts), senior-devops to
  build the SSH/rsync pipeline excluding `api/_dev`.
