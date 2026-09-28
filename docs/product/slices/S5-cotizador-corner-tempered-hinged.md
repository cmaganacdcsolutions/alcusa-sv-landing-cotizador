# S5 — Cotizador: corner, tempered, hinged

Goal: enable 3 of the remaining 5 product cards at step 0, each running
the full step 0→6 flow (medidas → precio en vivo → zona → resumen single-
item → WhatsApp), reusing S1's step shell and S2's pricing functions. Hill
chart: **downhill** (formulas de-risked in S2; this is UI wiring + edge
states).

Appetite: M. Ref: `prototype-spec.md` §2.2 (fields), §2.3 (validation).

## Tasks

### T5.1 — Cabina en L (corner)
Owner: fe-senior-react · Priority: P2 · Depends on: S1, S2(T2.2) · Blocks: T5.2
Scope: fixed 0.80×0.80×1.85m (no width input), modelo chips
(Aquaclara/Frosted/Aquafold), color chips (Natural/Bronce only — no
Blanco option rendered at all, not just disabled).
Acceptance Criteria:
- Given Natural + Aquaclara/Frosted/Aquafold, zone San Salvador, when
  priced, then $484/$620/$690 respectively (per S2 check-values).
- Given Bronce selected, when the color chips render, then no "Blanco"
  option exists on the card.
DoD: e2e on 3 viewports; design-fidelity vs `ios-03`/`desktop-03`
(corner variant).

### T5.2 — Templado 10mm
Owner: fe-senior-react · Priority: P2 · Depends on: T5.1 · Blocks: T5.3
Scope: ancho 120–200cm, alto fixed 2.00m, vidrio templado 10mm only (no
color/glass choice needed).
Acceptance Criteria: given widths 120/150/175/200cm, zone San Salvador,
when priced, then $712/$880/$1,020/$1,160 (per S2 check-values); given
119 or 201cm, then the "Cotización personalizada por WhatsApp" card
appears (same copy pattern as S1's recta out-of-range state).
DoD: e2e on 3 viewports.

### T5.3 — Puerta con bisagra (hinged, cart-aware qty 1–50)
Owner: fe-senior-react, senior-be · Priority: P2 · Depends on: T5.2 · Blocks: —
Scope: ancho 40–90cm, alto fixed 1.85m, cantidad 1–50, color
(Natural/Blanco/Bronce), vidrio (Nevado/Claro/Decorado/Mallado/Dúplex),
optional "Paño fijo" (ancho×alto) using S2's `priceHinged` (subtotal,
transport-excluded — see S2 T2.3 decision). This step shows the item
subtotal live; transport is shown only once the order reaches the
resumen (S7), not per hinged line.
Acceptance Criteria:
- Given 70cm natural claro, qty 1, when priced, then subtotal = $270
  (zone-free case, matches S2's derived value).
- Given 65cm natural nevado, qty 2, when priced, then subtotal = $622
  (S2's derived value; legacy per-unit-zone total at Soyapango was
  $702 — that number appears only later, once, in S7's order total).
- Given qty 0 or 51, when entered, then inline error "Ingresa una
  cantidad entre 1 y 50."
- Given 40cm decorado (blanco/bronce), when priced, then $449 exactly as
  encoded in S2 (flagged, not silently corrected).
DoD: e2e on 3 viewports; unit test for the qty-validation boundary
(0/1/50/51).

## HANDOFF → fe-senior-react, senior-be (S6, S7)
- Step-shell reuse pattern confirmed 3× now (corner/tempered/hinged) —
  S6's windows/garden should follow the identical component composition
  (step wrapper + field group + live price card + zone step + summary).
- Hinged is the first product needing a **quantity** field feeding both
  price and zone-fee multiplication — S6 (windows, garden) reuses this
  exact qty×zoneFee pattern, don't reinvent it.
- `requiresQuote` chip-at-selection-time pattern (spec §2.3) not yet
  exercised in this slice (no requiresQuote option among these 3
  products) — S6 is where it first appears (window Natural frame,
  Reflectivo bronce, garden non-white/non-clear); build it there per
  spec, labeled directly on the option card, never silently blocked at
  checkout.
