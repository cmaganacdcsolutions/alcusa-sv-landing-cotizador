# S2 — Pricing engine: all products, unit-tested

Goal: a single, pure, framework-agnostic pricing module covering all 6
products, matching every verified check-value in `exploratory-report.md`
§3.1–3.4, before it's wired into the remaining cotizador UIs (S5/S6). This is
the pitch's named rabbit hole — do not let UI slices re-derive formulas.
Hill chart: **uphill** (this is the risk the whole cycle hinges on).

Appetite: M (2–3 days). Owner: senior-be (implementation), senior-qa (test
authorship/review — pair on this one).

## Tasks

### T2.1 — Extract + harden STRAIGHT formula (from S1) into shared module
Owner: senior-be · Priority: P1 · Depends on: S1 (T1.2) · Blocks: T2.2

Scope: move T1.2's inline recta logic into `pricing-engine` module with
signature `priceStraight({widthCm, color, glass, pickup}) → {price,
promoApplied}`; add the full promo-band + Table N/Table C branches
(currently only partially exercised by S1's UI paths).
Acceptance Criteria: given every row in `exploratory-report.md` §3.1's
"Verified UI outputs" table for straight doors, when `priceStraight` is
called with matching inputs, then it returns the exact verified price for
all rows (incl. dúplex gris ×0.90, retiro ×0.85, out-of-range → null/flag).
DoD: unit tests pass 1:1 against the verified table; S1's UI behavior
unchanged (regression-tested).

### T2.2 — Corner + tempered formulas
Owner: senior-be · Priority: P1 · Depends on: T2.1 · Blocks: T2.3

Scope: `priceCorner({color, model}) → price` (fixed 0.80×0.80×1.85,
claro/nevado/decorado base × bronce 1.10, blanco not offered);
`priceTempered({widthCm}) → price` ((widthCm/100)×2×280).
Acceptance Criteria: given the corner check-values (Natural
484/620/690; Bronce 528.40/678/755, zone-fee-inclusive per the table —
engine returns pre-zone-fee price, zone fee added by the caller) and the
tempered check-values (120/150/175/200cm → 672/840/980/1120 pre-zone-fee,
+40 zone = 712/880/1020/1160), when called, then results match exactly;
given width 119 or 201cm, then result is out-of-range (null/flag).
DoD: unit tests green for both formulas.

### T2.3 — Hinged, windows, garden formulas + zone-fee module
Owner: senior-be · Priority: P1 · Depends on: T2.2 · Blocks: S5, S6

**Decision (per `prototype-spec.md` §2.4 / pitch): these three product
functions return the item's product-cost subtotal ONLY — qty multiplies
the product cost, but transport/zone fee is NEVER included here.** The
unified cotizador charges transport **once per order** (one delivery
address per order), computed separately at cart/summary level — see S7
T7.2. This deliberately diverges from the legacy site's per-item ×qty
zone-fee behavior; that legacy behavior is preserved only as a documented
comparison, not as this engine's target output (flagged to client as an
open assumption, `client-questions.md` #4).

Scope:
- `priceHinged({widthCm, color, glass, qty, fixedPanel}) → subtotal` —
  (table lookup + fixed-panel $140/m², 0.8m² minimum) × qty. No zone fee.
- `priceWindow({widthM, heightM, model, glass, zaranda, desmontaje, qty})
  → subtotal` — (area×rate×glassFactor + extras) × qty. No zone fee.
  Natural frame / Reflectivo bronce → `requiresQuote: true`.
- `priceGarden({widthM, heightM, hojas, color, glass, qty}) → subtotal` —
  (promo bands at exact 2.10/2.40m heights else $190/m²) × qty. No zone
  fee. Non-white/non-clear → `requiresQuote: true`.
- Shared `ZONE_FEES` constant (23 municipios, `source-inventory.md` §6),
  exported for S7's single order-level transport calculation — not
  consumed inside these three functions.
Acceptance Criteria (product-cost subtotal only, zone fee excluded —
derived from `exploratory-report.md` §3.2–3.4 check-values by removing
the legacy zone×qty term):
- Given hinged 70cm natural claro qty1 (zone-free case, legacy $270 at
  San Salvador where zone=0), when priced, then subtotal = $270.
- Given hinged 65cm natural nevado qty2 (legacy verified total at
  Soyapango was $702 = (311+40)×2), when priced, then subtotal = $622
  (311×2 — transport excluded here, added once at order level in S7).
- Given hinged 90cm blanco dúplex hielo qty1 + fijo 0.5×0.5, when priced,
  then subtotal = $569 (fijo billed at 0.8m² minimum = $112; zone=0 in
  the source example so this value is unaffected by the subtotal/zone
  split).
- Given hinged 40cm blanco/bronce decorado, when priced, then $449 as
  encoded (flagged — see backlog risk note, do not silently change to
  $355 without client confirmation).
- Given window 1.20×1.00 Francesa blanco claro qty1, when priced, then
  subtotal = $162; + zaranda then $198; qty3 (legacy verified cart total
  at Soyapango was $606 = 162×3 + 40×3), when priced, then subtotal =
  $486 (transport excluded, added once at order level in S7); Natural
  frame or Reflectivo bronce → `requiresQuote`.
- Given garden 1.00×2.10 (custom, gap case) qty1, when priced, then
  subtotal = $399 (cheaper than the $410 promo — encoded as-is, flagged
  in `client-questions.md` #8).
- Given any zone outside the 23-municipio list, when the order-level
  transport lookup (S7) runs, then result is `requiresQuote: true` / null
  (never a silent $0) — these 3 product functions themselves never touch
  zone at all, so this AC is verified against `ZONE_FEES` lookup, not
  against `priceHinged`/`priceWindow`/`priceGarden`.
DoD: unit tests pass against every derived subtotal above; module exports
one stable API surface per product (all zone-fee-free); no UI code
imports formulas directly (only this module); a code comment on each
function states "subtotal excludes transport — see S7 for the
once-per-order transport calculation."

## HANDOFF → fe-senior-react (S5, S6, S7, S8)
- Module API: `priceStraight`, `priceCorner`, `priceTempered` return a
  price that already reflects that product's own zone-fee rule (once,
  per spec's original per-item behavior for these 3); `priceHinged`,
  `priceWindow`, `priceGarden` return a **subtotal excluding transport**
  — S7 adds transport once per order on top of the sum of all item
  subtotals. All 6 are pure functions, all returning `{price}` /
  `{subtotal}` or `{requiresQuote: true}` — UI slices call these, never
  re-implement a table lookup.
- `ZONE_FEES` and `buildQuoteMessage` (from S1) are the only two shared
  data/behavior modules every cotizador step should import.
- **Open decision surfaced to the client** (`client-questions.md` #4):
  if they want transport billed per-unit/per-item (legacy behavior)
  instead of once-per-order, only S7's transport calculation and this
  HANDOFF note change — S2's 6 pricing functions do not.
- Known encoded quirks (hinged 40cm decorado $449, garden custom
  1.00×2.10 $399 cheaper-than-promo) are intentional matches to the
  verified source, each with a `// TODO: confirm with client` comment —
  do not "fix" without a client answer landing in `client-questions.md`.
