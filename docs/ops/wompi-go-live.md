# Wompi El Salvador: go-live runbook (mock -> modo desarrollo -> producción)

Status: code ready, credentials pending. Confirmed against docs.wompi.sv on 2026-09-29 (see ADR-003).

## 1. How it fits together

```
browser (Step 6)  --POST {pct,total,items}-->  api/wompi-create-link.php  --token+POST /EnlacePago--> Wompi
       ^                                          (derives amount, stores expected amount per reference)
       |  303 #cotizador/7-resultado?pago=...
api/wompi-return.php  <--- redirect from Wompi (?identificadorEnlaceComercio&idTransaccion&idEnlace&monto&hash)
                           verifies hash + GET /TransaccionCompra/{id}
api/wompi-webhook.php <--- POST from Wompi (header wompi_hash = HMAC-SHA256(raw body, API Secret))
```

- `PUBLIC_COTIZADOR_MODE=mock` (default; forced in CI and e2e): Step 6 uses `src/integrations/wompi/mock.ts`, zero network.
- `PUBLIC_COTIZADOR_MODE=wompi`: Step 6 calls our `api/wompi-create-link.php` and redirects to the Wompi hosted page (`urlEnlace`). Any other value behaves as mock.
- PUBLIC_* values are inlined at build time. The build that goes to the host with real credentials is a separate build with `PUBLIC_COTIZADOR_MODE=wompi`.

## 2. Confirmed API facts (docs.wompi.sv, 2026-09-29)

| Topic | Fact |
| --- | --- |
| Token | `POST https://id.wompi.sv/connect/token`, form-urlencoded: `grant_type=client_credentials`, `client_id=<App ID>`, `client_secret=<API Secret>`, `audience=wompi_api`. Returns `access_token`, `expires_in=3600`. Cached on disk until `expires_in - 60s`. |
| API | `https://api.wompi.sv`, header `authorization: Bearer <token>`. |
| Create link | `POST /EnlacePago`. Required: `identificadorEnlaceComercio` (<=500), `monto` (>=0.01), `nombreProducto` (<=500), `configuracion.notificarTransaccionCliente`. At least one of `configuracion.urlWebhook` / `emailsNotificacion` is mandatory. Response: `idEnlace`, `urlQrCodeEnlace`, `urlEnlace`, `estaProductivo`. |
| Test mode | No separate sandbox. Put the negocio in "modo desarrollo" in panel.wompi.sv. Every transaction is approved; CVV `111` simulates a decline (not with 3DS). Test transactions do not show in the transaction report. `estaProductivo=false` on the link, `EsProductiva=false` in the webhook. |
| Webhook | POST JSON: `IdCuenta, FechaTransaccion, Monto, ModuloUtilizado, FormaPagoUtilizada, IdTransaccion, ResultadoTransaccion ("ExitosaAprobada"), CodigoAutorizacion, IdIntentoPago, Cantidad, EsProductiva, Aplicativo{}, EnlacePago{Id, IdentificadorEnlaceComercio, NombreProducto}, cliente{}`. Only successful transactions are notified. Header `wompi_hash` = lowercase hex HMAC-SHA256 of the exact raw body with the API Secret. Wompi retries delivery until 2xx. |
| Redirect | For payment links Wompi appends `identificadorEnlaceComercio, idTransaccion, idEnlace, monto, hash`. `hash` = HMAC-SHA256 (API Secret) of the concatenation `identificadorEnlaceComercio + idTransaccion + idEnlace + monto` (values as received, no separators; per docs.wompi.sv "Validar Parámetros URL Redirect"). The redirect carries NO approved flag, hence the extra `GET /TransaccionCompra/{idTransaccion}` (`esAprobada`, `esReal`, `monto`). |
| Doc inconsistency | The `urlRedirect` row of the "Crear Enlace de Pago" page lists the API-flavour order (`idTransaccion + monto + esReal + formaPago + esAprobada + codigoAutorizacion + mensaje`). The dedicated validation page and the example payment-link URL use the 4-parameter order above; we implement the latter. Verify with the first real redirect (the log line `return/confirmed` vs `return/invalid_hash_or_params`); if it fails, ask Wompi support which order applies. |
| AMEX | `formaPago` has no card-brand flag. Exclusion is done with `idGrupoTarjetas` (panel "Grupos de tarjetas"): create a group without AMEX and set `WOMPI_CARD_GROUP_ID`. Ask Wompi support whether a group without AMEX is available for this negocio. Until then the site copy "excepto American Express" is a promise the gateway does not enforce. |

## 3. Server variables

| Variable | Required | Meaning |
| --- | --- | --- |
| `WOMPI_APP_ID` | yes | panel.wompi.sv > datos del negocio > "App ID" (client_id) |
| `WOMPI_API_SECRET` | yes | same screen > "API Secret" (client_secret and HMAC key) |
| `WOMPI_WEBHOOK_URL` | yes | public HTTPS URL of `api/wompi-webhook.php` |
| `WOMPI_REDIRECT_BASE` | yes | site origin without trailing slash (Origin check + redirect target) |
| `WOMPI_CARD_GROUP_ID` | recommended | card group without AMEX |
| `WOMPI_NOTIFY_EMAILS` | optional | comma separated, Wompi notifies on success |
| `WOMPI_ACCEPT_TEST_TRANSACTIONS` | staging only | `1` lets the return page show "approved" for `esReal=false`. Must be `0`/unset in production |
| `WOMPI_MIN_TOTAL` / `WOMPI_MAX_TOTAL` / `WOMPI_MAX_TRANSPORT` | optional | bounds (defaults 1 / 20000 / 250) |
| `WOMPI_DATA_DIR` / `WOMPI_CONFIG_FILE` | optional | defaults under `<domain-root>/alcusa-private/` |

### Loading them on Hostinger (recommended: config file outside the webroot)

Hostinger layout: `/home/uXXXX/domains/alcusasv.com/public_html` is the webroot. Create the sibling `alcusa-private/`:

```
/home/uXXXX/domains/alcusasv.com/
  public_html/            <- deployed site + api/
  alcusa-private/
    config.php            <- NOT versioned, chmod 600
    data/                 <- created by the code (logs/, orders/, processed/, ratelimit/, token-cache.json), chmod 700
```

`config.php`:

```php
<?php
return [
    'WOMPI_APP_ID' => '...',
    'WOMPI_API_SECRET' => '...',
    'WOMPI_WEBHOOK_URL' => 'https://dev.alcusasv.com/api/wompi-webhook.php',
    'WOMPI_REDIRECT_BASE' => 'https://dev.alcusasv.com',
    'WOMPI_ACCEPT_TEST_TRANSACTIONS' => '1',
];
```

Why not `.htaccess SetEnv`: it works (the code also reads `SetEnv` values, incl. the `REDIRECT_` prefix), but `.htaccess` lives inside the webroot, is easy to overwrite on deploy and easy to commit by mistake. The config file outside the webroot survives deploys and cannot be served. `api/_lib/` and `api/_dev/` also ship a `.htaccess` with `Require all denied`.

Deploy checks: `https://<host>/api/_lib/wompi-config.php` and `.../_dev/wompi-smoke.php` must answer 403/404; `.../api/wompi-webhook.php` by GET must answer 405.

## 4. Amount trust model

Phase 1 (implemented): the browser sends `{pct, total, items[{name, subtotal}]}`, never an amount. The server:
1. accepts only `pct` 80 or 100 and derives `monto = round(total * pct / 100, 2)`;
2. bounds `total` (`WOMPI_MIN_TOTAL..MAX_TOTAL`);
3. requires `sum(items.subtotal) <= total <= sum + WOMPI_MAX_TRANSPORT` (the remainder is transport);
4. stores the expected `monto` per reference; the return page and the webhook compare Wompi's amount with it (`amountMatches`, status `paid_amount_mismatch`);
5. rate limits 10 links / 10 min / IP, checks `Origin`, one successful payment per link, 30 min payment window, link valid 24 h.

Residual risk: a tampered client can still declare a lower `total` inside those checks. Mitigation today: the human reconciliation (webhook log + WhatsApp) before fulfilment, and refundable payments.

Phase 2 (proposed, next slice): re-price in PHP from a canonical cart (product ids and dimensions, zone, entrega). To avoid drift with `src/engine/pricing`, have Vitest export golden vectors (`tests/fixtures/pricing-golden.json`) and make `wompi-smoke.php unit` assert the PHP port against them. Effort: about 400 lines of TS engine to port (straight/hinged/tempered/corner/garden/windows + zone table). Alternative: signed quote issued by a server-side quote endpoint, which also needs the port. Decide with the client whether Phase 1 is acceptable for launch volume.

## 5. Where to test: Wompi cannot reach localhost

The webhook (and the redirect back to a public URL) need a public HTTPS host.

| Option | Pros | Cons |
| --- | --- | --- |
| A. Staging subdomain on Hostinger (`dev.alcusasv.com`), separate build with `PUBLIC_COTIZADOR_MODE=wompi` | Same PHP/Apache/cURL stack as production, stable URL registered once, tests `SetEnv`/permissions/`.htaccess`, client can try it, no extra tooling | Needs the subdomain + a deploy step + Basic Auth or `noindex` |
| B. Tunnel (cloudflared / ngrok) to a local PHP | No deploy, fast loop | Local PHP required (none on the dev machine), URL changes per session unless paid, does not exercise Hostinger |

Recommendation: A. Create `dev.alcusasv.com` on Hostinger (free with the plan), protect it with HTTP Basic Auth for everything except `/api/wompi-webhook.php` and `/api/wompi-return.php`, add `X-Robots-Tag: noindex`, deploy the `dist/` + `api/` with `PUBLIC_COTIZADOR_MODE=wompi`, `PUBLIC_SITE_URL=https://dev.alcusasv.com`. Use a tunnel only for the very first webhook debugging.

## 6. Checklist: dev -> production

### A. Prerequisites (client / owner)
- [ ] Wompi negocio approved; access to panel.wompi.sv.
- [ ] Copy **App ID** and **API Secret** (datos del negocio). Send them over a password manager, never chat or email.
- [ ] Negocio is in **modo desarrollo**.
- [ ] Ask Wompi support: card group without AMEX (`idGrupoTarjetas`), which redirect-hash order applies to payment links, and confirm payment-link `urlRedirect` accepts our `/api/wompi-return.php` URL.
- [ ] `dev.alcusasv.com` created; `alcusa-private/config.php` in place (section 3), chmod 600.

### B. Modo desarrollo (staging)
- [ ] `php api/_dev/wompi-smoke.php unit` passes.
- [ ] `WOMPI_APP_ID`, `WOMPI_API_SECRET` exported locally and `WOMPI_SMOKE_CONFIRM_DEV_MODE=1`, then `php api/_dev/wompi-smoke.php live`: token OK, link created, `estaProductivo=false` (the script aborts otherwise).
- [ ] Register the webhook: either per link (already sent as `configuracion.urlWebhook`) or in panel > aplicativo > "Notifica via Webhook".
- [ ] Full flow on staging: cart -> Pagar ahora 80% -> Wompi page -> pay with a test card -> lands on "Pago completado"; log has `webhook/processed` with `esProductiva:false`, `amountMatches:true`; redelivery of the same webhook gives `duplicate`.
- [ ] CVV `111` (no 3DS): return shows "Pago cancelado"; no webhook is sent (only successes are notified).
- [ ] Tamper test: change `monto` or `hash` in the redirect URL by hand: result must be "Estamos confirmando su pago", never "Pago completado". `curl -X POST` the webhook with a wrong `wompi_hash`: 400.
- [ ] Rotate logs check: `alcusa-private/data/logs/wompi-YYYY-MM-DD.log` exists, contains no secret, card or customer data.

### C. Producción
- [ ] Rotate the API Secret in the panel before go-live (the dev-mode secret was shared during testing); update `config.php`; delete `data/token-cache.json` (forces a new token).
- [ ] Production `config.php`: production `WOMPI_WEBHOOK_URL` (`https://alcusasv.com/api/wompi-webhook.php`), `WOMPI_REDIRECT_BASE=https://alcusasv.com`, **remove** `WOMPI_ACCEPT_TEST_TRANSACTIONS`, set `WOMPI_CARD_GROUP_ID`.
- [ ] Production build with `PUBLIC_COTIZADOR_MODE=wompi`, deploy.
- [ ] In the panel switch the negocio from **desarrollo** to **producción**.
- [ ] Real payment of **$1** (temporarily `WOMPI_MIN_TOTAL=1`, a test cart) with a real card: `estaProductivo=true`, webhook `esProductiva:true`, return shows "Pago completado", transaction visible in panel.wompi.sv > reporte de transacciones.
- [ ] **Refund** that $1 from the panel and note it in the log.
- [ ] Confirm an AMEX card is rejected/not accepted on the Wompi page.
- [ ] Monitor `alcusa-private/data/logs` for `invalid_signature`, `total_mismatch`, `paid_amount_mismatch`, `upstream_error` during the first week.
- [ ] Runbook for rollback: set `PUBLIC_COTIZADOR_MODE=mock` is NOT a safe rollback for a live site (it would fake payments). Rollback = redeploy without the "Pagar ahora" option or remove `WOMPI_APP_ID` from config (endpoint answers 503 `not_configured`, the UI shows the error and the WhatsApp path remains).

## 7. Known gaps / decisions for the client
- Phase 2 server-side re-pricing (section 4).
- Webhook has no DB: `orders/*.json` + `processed/*.json` + logs are the record (ADR-003 tech debt trigger: >20 paid orders/week).
- No email/WhatsApp notification is sent to ALCUSA by our code; use `WOMPI_NOTIFY_EMAILS` (Wompi notifies) or add SMTP later (senior-infrastructure).
- Return-screen copy for "en confirmación" is new (not in the boards): needs design/client approval.
