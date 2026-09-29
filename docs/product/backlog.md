# Backlog — ALCUSA Landing + Cotizador (Cycle 1)

Board of record until a real tracker exists. One file per slice under
`docs/product/slices/`. Full task bodies (Context/Scope/AC/DoD) live there;
this file is the sequencing table.

Definition of Ready (every task below meets this before it leaves the
backlog): problem clear, AC written, dependencies resolved or stubbed, owner
named, size set, spec section referenced.

Definition of Done (every slice): lint + typecheck + unit tests + e2e tests +
build green on `dev` across iOS 390 / Android 412 / desktop 1920 · no secrets
committed · design-fidelity check vs the matching `.dc.html` board ·
`HANDOFF` written. PR `dev → main` opens only once **every** slice below is
Done (see S12).

## Sequencing table

| ID | Slice | Owner(s) | Priority | Depends on | Size | Status |
|---|---|---|---|---|---|---|
| S0 | Scaffold & CI skeleton | senior-devops | P1 | — | S | Todo |
| S1 | Tracer bullet: shell + drawer + recta cotizador → WhatsApp | fe-senior-react | P1 | S0 | M | Todo |
| S2 | Pricing engine — all products, unit-tested | senior-be, senior-qa | P1 | S1 | M | Todo |
| S3 | Landing: hero, cómo funciona, confianza, info importante | fe-senior-react | P2 | S1 | M | Todo |
| S4 | Landing: catálogo + galería | fe-senior-react | P2 | S1, S2 | M | Todo |
| S5 | Cotizador: corner, tempered, hinged | fe-senior-react, senior-be | P2 | S1, S2 | M | Todo |
| S6 | Cotizador: windows, garden | fe-senior-react, senior-be | P2 | S1, S2 | M | Todo |
| S7 | Cotizador: multi-item resumen/cart | fe-senior-react | P2 | S1, S5, S6 | M | Todo |
| S8 | Payment: forma de pago + Wompi mock + resultado | fe-senior-react, senior-be | P1 | S7 | M | Todo |
| S9 | Contacto: webform + socials + footer | fe-senior-react | P2 | S1 | S | Todo |
| S10 | Motion: "experiencia religiosa" | cinematic-effects-expert | P2 | S1–S9 | M | Todo |
| S11 | QA hardening: unit+e2e, 3 viewports, a11y, reduced-motion | senior-qa | P1 | S1–S10 | L | Todo |
| S12 | Release gate: PR dev → main | senior-devops | P1 | S11 | S | Todo |

Legend size: S ≈ ≤1 day, M ≈ 2–3 days, L ≈ 4–5 days (one agent, ≤100k
context each; if a slice's actual work exceeds its size it goes back to
shaping — circuit breaker, not an extension).

## Revisión con cliente 2026-09-29 (R0–R6)

Pitch: `pitch-revision-cliente-2026-09-29.md` · Preguntas: `client-questions-revision-2026-09-29.md` · Detalle/AC: `slices/R-revision-cliente-2026-09-29.md`

| ID | Slice | Owner(s) | Priority | Depends on | Size | Status |
|---|---|---|---|---|---|---|
| R0 | Diseño canvas: landing nueva, /catalogo, promos, PDF (iOS/Android/desktop) | senior-uiux-design | P1 | — | M | Todo |
| R1 | Modelo de datos catálogo + tracer /catalogo → /cotizador?producto= | fe-senior-react, senior-be, arquitecto (ADR) | P1 | S2, S7 | M | Todo |
| R2 | Página /catalogo completa (categorías, subcategorías, detalle, CTA) | fe-senior-react | P2 | R0, R1 | M | Todo |
| R3 | Landing: Promociones del mes + CTA catálogo; catálogo/galería fuera | fe-senior-react | P1 | R0, R1 | M | Todo |
| R4 | PDF de cotización + WhatsApp (Web Share móvil / descarga+wa.me desktop; ADR solo librería) | arquitecto → fe-senior-react (+be) | P1 | R0, S7 | L | Todo |
| R5 | Cotizador adopta taxonomía nueva | fe-senior-react, senior-be | P2 | R1 | M | Todo |
| R6 | Limpieza + e2e/a11y de la revisión (se fusiona en S11) | senior-qa | P2 | R2–R5 | S | Todo |

Encaje con la cola existente (STATE.md): sf-audit sigue primero (tokens/base 18px afectan a las boards nuevas; R0 debe partir de los tokens ya decididos). R0 corre junto al canvas slice 2 (mismo agente de diseño; puede ir antes si el usuario prioriza). R1 y los ADR arrancan en paralelo al diseño. Orden recomendado: sf-audit → R0 ‖ R1+ADRs → canvas slice 2 → R3 → R2 → R5 → R4 → S8 Wompi (S8 depende de S7, no de R; puede ir antes si el cliente prioriza pagos) → S10 motion (después de R2/R3/R4-UI para animar el diseño final) → S11 QA (absorbe R6 y endurece los flakes ios390) → S12 PR dev→main (solo con R0–R6 Done o explícitamente diferidos). S3/S4 se enmiendan: la sección catálogo/galería de S4 se reubica a R2; su e2e se migra (no se borra). Todo en rama dev; gates en worktree separado.

## Slice index

- `slices/S0-scaffold-ci.md`
- `slices/S1-tracer-bullet.md`
- `slices/S2-pricing-engine.md`
- `slices/S3-landing-hero-trust.md`
- `slices/S4-landing-catalogo-galeria.md`
- `slices/S5-cotizador-corner-tempered-hinged.md`
- `slices/S6-cotizador-windows-garden.md`
- `slices/S7-cotizador-resumen-cart.md`
- `slices/S8-payment-wompi-mock.md`
- `slices/S9-contacto-webform.md`
- `slices/S10-motion.md`
- `slices/S11-qa-hardening.md`
- `slices/S12-release-gate.md`
- `slices/R-revision-cliente-2026-09-29.md` (R0–R6)

## Risks / open questions carried from shaping

- Transport-once-per-order is an **assumption** (legacy multiplied it per
  unit for windows/hinged/garden) — built per the new spec, flagged to
  client in `client-questions.md` #4. If the client says "per unit", S2 and
  S6 pricing engine functions change (isolated, unit-tested — low blast
  radius) but S5/S6/S7 UI does not re-plumb.
- Hinged 40cm "decorado" = $449 looks like a data error (see
  `client-questions.md` #9) — S2 unit tests encode the verified value
  **$449** as-is (matches current source) with a `// TODO: confirm with
  client` comment; do not silently "fix" to $355 without client confirmation.
- Bronce surcharge rule conflict (#3) — S2 implements the cotizador-table
  rule (verified against live UI checks in `exploratory-report.md` §3.1),
  not the promo-card's "+10%" claim, and flags it.
- Any content field the client hasn't confirmed ships as literal
  `[PLACEHOLDER — confirmar]` text (years, client count, hours, NIT, etc.) —
  never a guessed number. Tracked as follow-up tasks once
  `client-questions.md` answers arrive; do not block S1–S11 on them.

## HANDOFF notes embedded per slice
Each slice file ends with its own `HANDOFF` block naming the next owner and
exact inputs they need (component names, function signatures expected,
fixture data) — written so `senior-software-architect`'s stack decision can
slot in without renegotiating scope.
