# S4 — Landing: catálogo + galería

Goal: the single consolidated catálogo grid (spec §1 item 3, replacing 5
legacy scattered sections) and the real-photo gallery (item 4), inserted
between Cómo funciona and Confianza per landing order. Hill chart:
**downhill**.

Appetite: M. Ref: `prototype-spec.md` §1 items 3–4; boards
`ios-01-home.dc.html` (catálogo/galería blocks), `desktop-01-inicio.dc.html`.

## Tasks

### T4.1 — Catálogo grid `#modelos`
Owner: fe-senior-react · Priority: P2 · Depends on: S1, S2 · Blocks: T4.2
Scope: ONE grid, 6 cards (Puerta recta, Puerta en L, Templado 10mm, Puerta
con bisagra, Puerta de jardín, Ventana Francesa/Bilbao) — photo, name,
"Desde $X" (from S2), "Cotizar este modelo" CTA → jumps to cotizador step
0 with that product pre-selected. No duplicate nav targets (fixes legacy
"Promociones del mes"/"Puertas de baño rectas" both → `#modelos` and two
window links both → `#ventanas`).
Acceptance Criteria:
- Given the grid on iOS 390 (1-up), Android 412 (1-up), desktop 1920
  (3-up per `container.xl` 1320px), when rendered, then all 6 cards show
  distinct "Desde $X" values sourced from S2, no two cards linking to the
  same anchor incorrectly.
- Given "Cotizar este modelo" tapped on the Puerta con bisagra card, when
  triggered, then step 0 opens with hinged pre-selected.
DoD: design-fidelity vs `ios-01-home.dc.html` catálogo block.

### T4.2 — Galería de proyectos reales `#galeria`
Owner: fe-senior-react · Priority: P2 · Depends on: T4.1 · Blocks: —
Scope: horizontal snap-scroll of the 6 real WhatsApp customer photos
(`product-whatsapp-01..06.jpeg`), vignette-treated per imagery rules, tap
→ lightbox. Explicitly excludes the legacy AI-generated image and the
third-party rights-risk photo (brand-manual PENDIENTES / spec rationale).
Acceptance Criteria:
- Given the gallery on all 3 viewports, when rendered, then exactly the 6
  `product-whatsapp-0N.jpeg` photos appear (no AI-generated or
  third-party-rights image present).
- Given a photo tap, when triggered, then it opens in a lightbox
  (keyboard-dismissible, focus-trapped for a11y).
DoD: design-fidelity vs `ios-01-home.dc.html` galería block; images
lazy-loaded (no layout-shift regression on the 3 viewports).

## HANDOFF → fe-senior-react (S5, S6)
- Catálogo card → cotizador pre-selection wiring
  (`preselectProduct(productId)`) is the pattern S5/S6's remaining 5
  product cards in step 0 should reuse — don't build a second navigation
  path.
- Landing section order after this slice: Hero → Cómo funciona → Catálogo
  → Galería → Confianza → Cotizador → Info importante → Contacto → Footer
  (spec §1, complete) — S9's Contacto section is the only one left.
