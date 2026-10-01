# ADR-003: Wompi El Salvador integration boundary + mock mode
> **Amended by ADR-013 (2026-10-01):** the contract, HMAC verification, error envelope and mock mode stand; the PHP implementation (api/wompi-*.php) is superseded by a Node port (ADR-013 §2.4) and endpoints lose the `.php` suffix (`/api/wompi-create-link`, `/api/wompi-webhook`, `/api/wompi-return`).

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

## Confirmado 2026-09-29 (docs.wompi.sv)
Supersedes the "to confirm" items above. Details and runbook: `docs/ops/wompi-go-live.md`.

- **Token**: `POST https://id.wompi.sv/connect/token` (form-urlencoded), `grant_type=client_credentials`, `client_id=<App ID>`, `client_secret=<API Secret>`, `audience=wompi_api`; `expires_in=3600`. API base `https://api.wompi.sv`, `authorization: Bearer`. Env names change: `WOMPI_APP_ID`, `WOMPI_API_SECRET` (the API Secret is also the HMAC key, so `WOMPI_CLIENT_*`/`WOMPI_WEBHOOK_SECRET` from the first draft are replaced), plus `WOMPI_WEBHOOK_URL`, `WOMPI_REDIRECT_BASE`. `WOMPI_ENV`/`WOMPI_API_BASE_URL` dropped: there is no sandbox host.
- **Test mode**: no sandbox. The negocio is put in "modo desarrollo" in panel.wompi.sv; all transactions approve, CVV `111` declines (not with 3DS). `estaProductivo`/`EsProductiva=false` mark tests.
- **Create link**: `POST /EnlacePago` with `identificadorEnlaceComercio`, `monto`, `nombreProducto`, `formaPago{...}`, `configuracion{urlRedirect, urlWebhook, urlRetorno, esMontoEditable, notificarTransaccionCliente, ...}`, `vigencia`, `limitesDeUso`, `idGrupoTarjetas`. Response `{idEnlace, urlEnlace, urlQrCodeEnlace, estaProductivo}`. AMEX cannot be excluded via a flag; only through a card group (`idGrupoTarjetas`) configured in the panel.
- **Webhook**: header `wompi_hash` = hex HMAC-SHA256 of the raw body keyed with the API Secret (confirmed). Payload keys are PascalCase (`IdTransaccion`, `ResultadoTransaccion`, `EsProductiva`, `EnlacePago.IdentificadorEnlaceComercio`, ...). Only successes are notified; Wompi retries until 2xx, hence idempotency by `IdTransaccion`.
- **Return (amends "Return screen")**: the payment-link redirect appends `identificadorEnlaceComercio, idTransaccion, idEnlace, monto, hash` and NO approved flag. The hash needs the API Secret, so it cannot be verified in the browser. `urlRedirect` therefore points at `api/wompi-return.php`, which verifies the hash (HMAC over the four values concatenated in that order), confirms via `GET /TransaccionCompra/{id}` and 303-redirects to `#cotizador/7-resultado?pago=aprobado|rechazado|pendiente&ref=...`. Anything unverifiable is `pendiente` ("en confirmación") until the webhook. The SPA slug is `7-resultado`.
- **Amount**: the browser sends cart total + 80/100, never an amount; the server derives and bounds it and stores the expected amount per reference (Phase 1). PHP re-pricing is Phase 2 (see runbook section 4).
- **Mode flag**: `PUBLIC_COTIZADOR_MODE=mock|wompi` (anything else = mock; CI/e2e force mock).
- **Open**: the docs disagree on the redirect hash order (API-flavour vs payment-link); implemented the payment-link one, to verify with the first real redirect.
