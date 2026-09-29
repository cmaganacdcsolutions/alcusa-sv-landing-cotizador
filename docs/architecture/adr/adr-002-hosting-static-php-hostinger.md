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
