# S6 — Cotizador: windows, garden

Goal: the last 2 product cards, both requiring the `requiresQuote`
selection-time chip pattern (spec §2.3) — the first products where an
option can be picked but not auto-priced. Hill chart: **downhill** for the
happy path, **uphill** briefly for the requiresQuote UX (new pattern).

Appetite: M. Ref: `prototype-spec.md` §2.2 (windows/garden fields), §2.3.

## Tasks

### T6.1 — Ventana Francesa/Bilbao (repeatable rows)
Owner: fe-senior-react, senior-be · Priority: P2 · Depends on: S1, S2(T2.3) · Blocks: T6.2
Scope: modelo, repeatable rows (cantidad, ancho, alto), color
(Blanco/Bronce priced; **Natural → `requiresQuote` chip on the option
card at selection time**), vidrio (Claro/Bronce 5mm/Súper gris/Reflectivo
azul priced; **Reflectivo bronce → `requiresQuote` chip**), extras
(zaranda +$30/m² checkbox, desmontaje +$25 radio).
Acceptance Criteria (all values are item subtotals, transport excluded —
per S2 T2.3's decision; transport is added once at order level in S7):
- Given 1.20×1.00 Francesa blanco/claro qty1, when priced, then
  subtotal = $162; + zaranda then $198.
- Given 1.20×1.00 Francesa blanco/claro qty3, when priced, then
  subtotal = $486 (legacy per-unit-zone cart total at Soyapango was
  $606 = 486 + 40×3; that $40 appears once, not ×3, in S7's order total).
- Given Bilbao 1.5×1.2 bronce/súper gris + zaranda + desmontaje qty1,
  when priced, then subtotal = $459.16 (per S2 check-value, zone-free).
- Given "Natural" frame tapped as an option, when the option card
  renders, then it shows a `warning`-token "Cotización personalizada"
  chip immediately (not after checkout) and selecting it still adds the
  row, marked `requiresQuote: true`.
DoD: e2e on 3 viewports; unit test for the 0.8m² area minimum
(0.6×0.6 → $108-equivalent floor).

### T6.2 — Puerta de jardín
Owner: fe-senior-react, senior-be · Priority: P2 · Depends on: T6.1 · Blocks: T6.3
Scope: modelo (1/2/3 hojas/A la medida) with width range per model, alto
(2.10/2.40/Otra), color (Blanco priced; otros → `requiresQuote`), vidrio
(Claro priced; otros → `requiresQuote`), cantidad 1–50.
Acceptance Criteria (item subtotals, transport excluded — per S2 T2.3):
- Given 1 hoja 1.00×2.10 qty1, when priced, then subtotal = $410 (promo
  band); given 1.00×2.40 qty1, then subtotal is also $410 (same promo
  band, height-independent within 2.10/2.40) — legacy verified total at
  Apopa was $470 = 410 + 60 zone; that $60 appears once, at order level,
  in S7, not folded into this subtotal.
- Given custom 1.00×2.10 (non-promo band combination) qty1, when priced,
  then subtotal = $399 as encoded in S2 (flagged quirk, not silently
  corrected).
- Given any color/glass other than Blanco/Claro selected, when the
  option card renders, then it shows the `requiresQuote` chip at
  selection time.
DoD: e2e on 3 viewports.

### T6.3 — requiresQuote → WhatsApp fallback (shared behavior check)
Owner: fe-senior-react · Priority: P2 · Depends on: T6.2 · Blocks: —
Scope: confirm the shared rule from spec §2.3 holds for both new
products: a `requiresQuote` item never hard-blocks checkout — it can be
removed while paying for the rest, or the whole cart can go via
WhatsApp.
Acceptance Criteria: given a cart with one `requiresQuote` window row and
one priced garden row, when the user reaches the summary (S7), then both
"remove the requiresQuote item and pay for the rest" and "send the whole
cart via WhatsApp" remain available (no hard block).
DoD: e2e covers this cross-product case; design-fidelity vs the
requiresQuote chip spec in `prototype-spec.md` §2.3.

## HANDOFF → fe-senior-react (S7)
- All 6 products are now selectable at step 0; `requiresQuote` is a
  first-class per-line-item flag threaded from step 1 through to the
  summary — S7's multi-item cart must preserve this flag per item, not
  just at cart level.
- All 6 pricing functions now return zone-free subtotals (hinged/window/
  garden per T2.3's decision; straight/corner/tempered already include
  their own single zone fee per their original per-item formula). S7 must
  sum every item's subtotal, then add ONE transport line for the whole
  order (based on the order's single delivery zone) — never sum a
  per-item transport across multiple lines. Legacy per-unit-zone totals
  (e.g. hinged $702, window-cart $606, garden $470) only reappear if the
  client later asks to revert the once-per-order assumption
  (`client-questions.md` #4); until then those numbers are reference
  values in the pricing report, not this engine's target output.
