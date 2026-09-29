# S3 — Landing: hero, cómo funciona, confianza, info importante

Goal: the trust-building half of the landing (spec §1 sections 1, 2, 5, 7)
mounted inside S1's shell. Hill chart: **downhill** (content/layout, no
unknowns left after S1/S2).

Appetite: M. Ref: `prototype-spec.md` §1 items 1/2/5/7; boards
`ios-01-home.dc.html`, `desktop-01-inicio.dc.html`.

## Tasks

### T3.1 — Hero `#inicio`
Owner: fe-senior-react · Priority: P2 · Depends on: S1 · Blocks: T3.2
Scope: kicker + H1 + 3 category cards (Puertas de baño/Ventanas/Puertas de
jardín) each with a teaser "Desde $X" price sourced from S2's engine
(promo/base price, no zone fee). Hero image: `product-ventana-bilbao.jpeg`
interim per brand-manual PENDIENTES #4 (not `hero-banner-01/02.jpg`).
Acceptance Criteria:
- Given the hero on iOS 390 / Android 412 / desktop 1920, when rendered,
  then all 3 category cards show a "Desde $X" price computed from S2 (no
  hardcoded duplicate numbers).
- Given a category card tap, when triggered, then the page scrolls/jumps
  to `#cotizador` with that product pre-selected at step 0.
DoD: design-fidelity vs `ios-01-home.dc.html` hero block.

### T3.2 — Cómo funciona `#proceso`
Owner: fe-senior-react · Priority: P2 · Depends on: T3.1 · Blocks: T3.3
Scope: 4-step trust strip (Selecciona/Cotiza/Confirma anticipo 80%/Recibe
20% al entregar), previously `display:none` in legacy — must render, not
be hidden.
Acceptance Criteria: given the section on all 3 viewports, when rendered,
then all 4 steps are visible (not `display:none`) and legible without
horizontal scroll.
DoD: design-fidelity check passed.

### T3.3 — Confianza `#confianza`
Owner: fe-senior-react · Priority: P2 · Depends on: T3.2 · Blocks: T3.4
Scope: Google rating "★4.2 · 130 reseñas", years
`[AÑOS — confirmar 35/39]`, track record
`[+10,000/+15,000 — confirmar]`, garantía 6 meses, entrega 8–10 días
hábiles — literal placeholder copy for unconfirmed facts, never a guess.
Acceptance Criteria: given the section renders, when inspected, then the
years and track-record fields show the literal bracketed placeholder text
(not a picked number) until `client-questions.md` #1/#2 are answered.
DoD: copy matches spec exactly; a follow-up task is filed (not silently
resolved) once the client answers.

### T3.4 — Información importante `#info`
Owner: fe-senior-react · Priority: P2 · Depends on: T3.3 · Blocks: —
Scope: anticipo 80%/saldo 20%, factura normal o crédito fiscal, medios de
pago (Wompi crédito/débito excepto AMEX), Tasa 0% note (flagged
`[confirmar]` per spec §2.7), retiro en tienda −15% — must appear here
consistently with the cotizador's payment step copy (single source of
truth for this copy, not duplicated ad hoc).
Acceptance Criteria: given `#info` and the cotizador payment step (S8),
when compared, then the AMEX-exclusion and 80/20 copy is identical
wording in both places.
DoD: design-fidelity vs `ios-01-home.dc.html` info block; all 4 tasks'
sections pass lint/typecheck/build.

## HANDOFF → fe-senior-react (S4)
- Section components (`Hero`, `ComoFunciona`, `Confianza`, `InfoImportante`)
  mount in landing order right after the shell; S4 adds `Catálogo` and
  `Galería` between `ComoFunciona` and `Confianza` per spec §1 order
  (items 3 and 4) — do not reorder sections 1/2/5/7 built here.
- Placeholder-copy pattern (`[AÑOS — confirmar]` etc.) is now established —
  reuse the same convention, don't invent a different placeholder style.
