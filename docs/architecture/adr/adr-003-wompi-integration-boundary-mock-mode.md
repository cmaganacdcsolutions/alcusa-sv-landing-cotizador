# ADR-003: Wompi El Salvador integration boundary + mock mode

Date: 2026-09-28
Status: accepted

## Context
Wompi SV docs (docs.wompi.sv, checked 2026-09-28): API auth uses
`Authorization: Bearer <access_token>` (obtained server-side from a
client id/secret — exact token endpoint/grant to confirm during
implementation, not blocking the architecture). Payment links are created via
a server-to-server POST ("Crear Enlace de Pago") returning a hosted checkout
URL; card data never touches our code (PCI SAQ-A posture). Webhooks are
delivered as a POST with a `wompi_hash` header = HMAC-SHA256 of the raw
request body, keyed with the merchant's API Secret — we must recompute and
compare, not trust the payload blindly. No sandbox credentials exist yet for
this project (blocker, see HANDOFF).

## Decision
- **Boundary**: the browser never talks to Wompi directly and never holds a
  Wompi secret. `integrations/wompi/client.ts` (browser) calls only our own
  `api/wompi-create-link.php`, which holds `WOMPI_CLIENT_ID` /
  `WOMPI_CLIENT_SECRET` as server env vars, gets a Bearer token, creates the
  payment link (amount = 80% or 100% of total per step 5 sub-choice,
  reference = cart id), and returns just `{ url_checkout }` to the browser.
  The browser redirects the user there.
- **Webhook**: `api/wompi-webhook.php` recomputes HMAC-SHA256 over the exact
  raw body using `WOMPI_WEBHOOK_SECRET`, compares to the `wompi_hash` header
  in constant time, returns 400 on mismatch, 200 on match. It logs the event
  (flat file, rotated) — it does **not** write to a database (none exists,
  see ADR-002/tech-debt). It is a reconciliation record, not the UX path.
- **Return screen (step 7)** is driven by the query params Wompi appends on
  redirect back to `#cotizador/7`, read client-side — this is the primary way
  the user sees success/declined, independent of whether the webhook has
  fired yet.
- **Mock mode**: `PUBLIC_COTIZADOR_MODE=mock` (default in `dev` and forced in
  CI/e2e) makes `integrations/wompi/client.ts` resolve from
  `integrations/wompi/mock.ts` instead of calling the PHP endpoint —
  deterministic success/declined fixtures, zero network calls. Tests must
  never reach real Wompi or WhatsApp endpoints (enforced by Playwright route
  blocking as a second safety net, see ADR-006).

## Alternatives considered
- **Client-side Wompi SDK/widget with a public key only.** Investigated
  briefly; rejected because creating a link with the 80/20 split, our own
  reference id, and excluding AMEX per business rule is cleaner to control
  server-side than to trust a client-configured widget, and because the
  secret needed for webhook verification must live server-side regardless.
- **Skip the webhook, rely only on the redirect.** Rejected: the redirect can
  be lost (closed tab, network drop) — the webhook is the only way to know a
  payment succeeded if the user never comes back. Kept as reconciliation-only
  given no DB exists yet.

## Consequences
- Good: no PCI scope on our servers; secrets never reach the client bundle
  (enforced by CI grep gate).
- Good: fully testable locally/in CI without any real credentials.
- Bad / open: exact Wompi token endpoint and grant type must be confirmed
  against `docs.wompi.sv` once sandbox credentials exist — small risk,
  isolated entirely inside `wompi-create-link.php`.
- Tech debt: webhook has no persistent store; if order volume grows enough
  that manual WhatsApp+Wompi-dashboard reconciliation becomes painful,
  revisit (trigger: >20 paid orders/week) — add a minimal flat-file or SQLite
  order log, still no dedicated DB server needed on shared hosting.
