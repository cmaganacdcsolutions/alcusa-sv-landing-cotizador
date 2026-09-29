# S8 — Payment: forma de pago + Wompi mock + resultado

Goal: step 5–7 of the cotizador — WhatsApp handoff (already done, S1/S7)
vs. "Pagar ahora" against a **local mock/sandbox Wompi**, plus the two
result screens. Real Wompi integration/credentials are explicitly this
cycle's other named rabbit hole — mock only. Hill chart: **uphill**
(mock contract design), then downhill.

Appetite: M. Ref: `prototype-spec.md` §2.7–§2.8; boards `ios-06/07`,
`desktop-03-resumen-pago.dc.html`.

## Tasks

### T8.1 — Forma de pago: option cards + 80/100% sub-choice
Owner: fe-senior-react · Priority: P1 · Depends on: S7 · Blocks: T8.2
Scope: two option cards — "Enviar por WhatsApp para confirmar" (wired
already) and "Pagar ahora" → sub-choice Anticipo 80% ($X) / Pago total
100% ($Y) → button "Pagar $[monto] con Wompi". Fine print: no-AMEX
sentence + Tasa 0% `[confirmar]` sentence, copy identical to `#info`
(S3 T3.4).
Acceptance Criteria:
- Given total $1,148 (from S7's example), when "Anticipo 80%" is chosen,
  then the button reads "Pagar $918.40 con Wompi"; when "Pago total
  100%" is chosen, then "Pagar $1,148.00 con Wompi".
- Given the fine print, when compared to `#info` (S3), then the AMEX and
  80/20 wording matches exactly (single source of truth, no drift).
DoD: design-fidelity vs `ios-06-whatsapp-pago.dc.html`.

### T8.2 — Wompi mock create-link + verify-link
Owner: senior-be · Priority: P1 · Depends on: T8.1 · Blocks: T8.3
Scope: a **local mock** of `create-link`/`verify-link` (in-process fake
or fixture-backed stub — no network call to the real Wompi API, no real
API key ever read at runtime in test/dev unless explicitly running
against a sandbox key the client owns, which is out of scope this
cycle). Mock supports 3 deterministic outcomes selectable in
dev/test: `approved`, `pending`, `rejected`.
Acceptance Criteria:
- Given the mock in `approved` mode, when "Pagar $X con Wompi" is
  tapped, then the loading state (spinner-replaces-label, per
  `motion-language.md`) shows, then resolves to a `approved` result
  without any outbound HTTP call to a real Wompi host (asserted via a
  network-call spy in the test — zero real requests).
- Given the mock in `rejected` mode, when tapped, then the flow reaches
  "Pago cancelado" without any real charge.
- Given no real Wompi credentials configured, when the app boots in
  dev/test, then it still fully functions in mock mode (no crash, no
  silent fallback to a real endpoint).
DoD: unit + integration tests cover all 3 mock outcomes; a code comment
and this task both state explicitly: never call the real Wompi API in
CI or local dev without an explicit, client-provided sandbox key (which
does not exist yet — see `client-questions.md`).

### T8.3 — Resultado: pago completado / cancelado
Owner: fe-senior-react · Priority: P1 · Depends on: T8.2 · Blocks: —
Scope: **Pago completado** — success icon, order recap (from the S7
summary), "Nos pondremos en contacto para coordinar instalación.", CTAs
"Volver al inicio" + "Escribir por WhatsApp". **Pago cancelado** —
warning icon, "Tu pago no se completó.", CTA "Reintentar pago" +
"Cotizar por WhatsApp" fallback. No shake/error-wiggle (forbidden per
`motion-language.md`) — color/border + icon only.
Acceptance Criteria:
- Given the mock resolves `approved`, when the result screen renders,
  then it is "Pago completado" with the correct order recap total.
- Given the mock resolves `rejected`, when the result screen renders,
  then it is "Pago cancelado" with no shake/wiggle animation present
  (checked in S11's motion audit too).
- Given "Volver al inicio" tapped, when triggered, then it returns to
  `#inicio` (not a dead link).
DoD: e2e on 3 viewports for both outcomes; design-fidelity vs
`ios-07-payment-result.dc.html` (both STATE A/B) and
`desktop-03-resumen-pago.dc.html`.

## HANDOFF → senior-qa (S11), cinematic-effects-expert (S10)
- Wompi is 100% mocked this cycle — S11's e2e suite must assert zero
  real network calls to any Wompi host across every payment test.
- Loading-state spinner and the no-shake rule on "Pago cancelado" are the
  two motion-relevant behaviors already built here — S10 applies the
  full cinematic language on top without reintroducing shake/wiggle.
- Real Wompi go-live (who owns the account, real API keys, real DNS) is
  entirely out of scope — see `client-questions.md` and `pitch.md`
  No-gos.
