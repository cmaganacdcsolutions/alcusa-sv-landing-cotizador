# S7 — Cotizador: multi-item resumen/cart

Goal: turn the single-item summary (S1) into the real step 4 — multiple
items across any of the 6 products in one cart, ONE order-level transport
line, ONE checkout (fixes the legacy "two parallel checkouts" pain point).
Hill chart: **uphill** briefly for the transport-aggregation logic, then
downhill.

Appetite: M. Ref: `prototype-spec.md` §2.1 step 4, §2.4, §2.5.

## Tasks

### T7.1 — "+ Agregar otro producto" loop
Owner: fe-senior-react · Priority: P2 · Depends on: S1, S5, S6 · Blocks: T7.2
Scope: wire the previously-stubbed button (S1 T1.3) to loop back to step
0 with the cart preserved; cart holds items from any of the 6 products,
each keeping its own fields, subtotal, and `requiresQuote` flag (from S6).
Acceptance Criteria:
- Given one recta item already in the cart, when "+ Agregar otro
  producto" is tapped, then step 0 reopens with the existing item intact
  and a new item addable.
- Given a cart with a hinged item and a window item, when viewed, then
  each line shows its own producto/medida/color/vidrio/cantidad/subtotal
  independently.
DoD: e2e on 3 viewports.

### T7.2 — Order-level transport (once per order) + totals
Owner: fe-senior-react, senior-be · Priority: P2 · Depends on: T7.1 · Blocks: T7.3
Scope: `computeOrderTransport(zoneId) → fee` — looked up ONCE from
`ZONE_FEES` (S2) using the single zone selected at step 3 for the whole
order, added once regardless of item count or per-item quantities (per
the pitch's flagged assumption, `client-questions.md` #4). Total = sum of
all item subtotals + transport (once). Anticipo 80% / saldo 20% computed
on that total.
Acceptance Criteria:
- Given a cart with hinged (subtotal $622) + window (subtotal $486),
  zona Soyapango, when totals compute, then transporte = $40 (once, not
  $40×2 or per line-item qty), total = $1,148, anticipo = $918.40, saldo
  = $229.60.
- Given a single recta item (whose own `priceStraight` already includes
  its zone fee per S2), when it is the ONLY item in the cart, then no
  second transport line is added on top of it (no double-charging zone).
DoD: unit test for the double-charge-prevention case above (mixing a
zone-inclusive product with zone-exclusive products in one cart);
design-fidelity vs `ios-05-cotizador-resumen.dc.html` /
`desktop-05-cotizador-resumen.dc.html` sticky summary column.

### T7.3 — Remove-item / requiresQuote handling at cart level
Owner: fe-senior-react · Priority: P2 · Depends on: T7.2 · Blocks: —
Scope: per spec §2.3, a `requiresQuote` item can be removed (paying for
the rest) or the whole cart sent via WhatsApp — never a hard block.
Acceptance Criteria: given a cart with one `requiresQuote` item and one
priced item, when the user removes the `requiresQuote` item, then
"Pagar ahora" becomes available for the remaining total; when the user
instead taps "Enviar por WhatsApp para confirmar" with both items still
present, then the WhatsApp template (S1's `buildQuoteMessage`, extended
for multi-item per spec §2.6 "repeat per item") includes both lines.
DoD: e2e on 3 viewports covering both paths; WhatsApp URL asserted, never
sent for real.

## HANDOFF → fe-senior-react, senior-be (S8)
- `computeOrderTransport` + item subtotal sum is the single source for
  "Total" shown to the payment step — S8 must read this total, never
  recompute it.
- Multi-item `buildQuoteMessage` (extended from S1) is ready for S9's
  contact webform to reuse its URL-encoding helper (not its content
  template — the webform has a different message shape per spec §2.9).
