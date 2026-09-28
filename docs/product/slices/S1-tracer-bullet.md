# S1 — Tracer bullet: shell + drawer + recta cotizador → WhatsApp

Goal: the thinnest real path through every layer — top bar, left drawer,
footer, and the full cotizador flow for exactly ONE product (Puerta de baño
recta) ending in a correct, testable WhatsApp deep link. Ships ugly and
real, not pretty and fake; later slices add breadth, never re-plumb this.
Hill chart: **uphill** first half (flow wiring is the unknown), **downhill**
once the recta path works end-to-end.

Appetite: M (2–3 days). Ref: `prototype-spec.md` §1 (top bar/drawer), §2.1–
§2.6 (steps 0–5 for recta only), boards `ios-01/02/03/04/05/06.dc.html`.

## Tasks

### T1.1 — Non-sticky top bar + left drawer shell
Owner: fe-senior-react · Priority: P1 · Depends on: S0 · Blocks: T1.2

Scope:
- Top bar (NOT sticky, scrolls away): hamburger left (44px tap target) →
  opens left drawer; wordmark center; WhatsApp quick-icon right → opens
  `wa.me/50376802410` no prefill. ~64px mobile / 80px desktop.
- Left drawer (anchored LEFT, 320px/85vw, scrim@40%, right corners only):
  Inicio, Catálogo, Cómo funciona, Galería, **Cotizar** (filled primary
  pill row, visually distinct from the other rows), Contacto, footer row
  (WhatsApp quick-contact + IG @alcusasv / TikTok @alcusaes / YouTube
  @alcusaelsalvador8209 icons).
- Empty page body (placeholder sections) below the bar — full sections
  arrive in S3/S4.
- Footer stub: legal name "Aluminios Cuzcatlán, S.A. de C.V. — ALCUSA".
Out of scope: real section content (S3/S4), motion polish (S10).
Acceptance Criteria:
- Given the page loaded on iOS 390 / Android 412 / desktop 1920, when the
  user scrolls down, then the top bar scrolls away with the content (not
  fixed/sticky).
- Given the top bar, when the user taps the hamburger, then the drawer
  opens anchored to the LEFT edge with a scrim behind it, on all 3
  viewports.
- Given the drawer open, when rendered, then the "Cotizar" row is a
  filled primary pill visually distinct from the other plain rows.
- Given the drawer open, when the user taps the scrim or a close
  affordance, then the drawer closes and returns focus to the hamburger
  (keyboard/a11y).
DoD: AC met; lint/typecheck/build green; design-fidelity check vs
`ios-02-drawer-open.dc.html` and `desktop-02-drawer-open.dc.html`.

### T1.2 — Cotizador steps 0–2 for recta: producto, medidas, precio en vivo
Owner: fe-senior-react · Priority: P1 · Depends on: T1.1 · Blocks: T1.3

Scope:
- Step 0: product picker showing only the "Puerta de baño recta" card
  selectable (other 5 cards visible but disabled/"próximamente" for this
  slice — S5/S6 enable them).
- Step 1: ancho input (accepts m or cm, valid 80–200cm), color chips
  (Natural/Blanco/Bronce), vidrio chips (Claro 5mm/Nevado 5mm/Decorado
  incl. sub-design/Mallado/Dúplex ×4 variants), entrega toggle deferred
  to T1.3.
- Step 2: live price card BEFORE address, per formula in
  `exploratory-report.md` §3.1 STRAIGHT branch only (promo band +
  TABLE[N/C]), copy exactly: "Estimado sin transporte: $X. El costo final
  incluye transporte según tu zona."
- Out-of-range width (< 80 or > 200 cm) → inline "Cotización personalizada
  por WhatsApp" card replacing the price, with the exact validation copy
  from spec §2.3, not a silent hide.
Out of scope: the other 5 products (S5/S6); full pricing engine module
(this slice may inline the STRAIGHT-only formula; S2 extracts/hardens it
into the shared engine without changing this UI's behavior).
Acceptance Criteria:
- Given recta selected with width 110cm, Natural, Claro, when step 2
  renders, then the price shown is $222 (promo band) before any
  address/zone is entered, on all 3 viewports.
- Given width 75cm or 201cm, when step 2 renders, then the price is
  replaced by the "Cotización personalizada por WhatsApp" card with the
  exact copy from spec §2.3.
- Given width 125cm, Blanco, Claro, when step 2 renders, then the price
  is $366 (Table C, tier 1.3) per the verified check-value in
  `exploratory-report.md` §3.1.
DoD: AC met; unit test covers the 3 price checks above; design-fidelity
vs `ios-03-cotizador-producto-medidas.dc.html`.

### T1.3 — Steps 3–5 for recta: zona, resumen, WhatsApp handoff
Owner: fe-senior-react · Priority: P1 · Depends on: T1.2 · Blocks: T1.4

Scope:
- Step 3: entrega toggle (con instalación / retiro en tienda −15%),
  municipio combobox (23 zones from `source-inventory.md` §6 zone table),
  zone fee added live; zone not in list → empty state copy per spec §2.3.
- Step 4: single-item summary card (producto, medida, color, vidrio,
  zona, precio unitario → subtotal, transporte, total, anticipo 80%,
  saldo 20%, entrega estimada "8–10 días hábiles"). ("+ Agregar otro
  producto" button visible but disabled/stub — wired in S7.)
- Step 5: two option cards — "Enviar por WhatsApp para confirmar"
  (primary path this slice) and "Pagar ahora" (stub, disabled — wired in
  S8).
- WhatsApp deep link built from the exact template in spec §2.6,
  URL-encoded, opened via `wa.me/50376802410?text=…`.
Out of scope: Wompi payment (S8); multi-item cart (S7).
Acceptance Criteria:
- Given recta 110cm/Natural/Claro, zona Soyapango, con instalación, when
  the user reaches the summary, then total = $262.00 (222+40) matching
  the verified check-value.
- Given the same inputs, when the user taps "Enviar por WhatsApp para
  confirmar", then the generated URL is
  `https://wa.me/50376802410?text=<urlencoded template>` with the
  template's placeholders correctly substituted (producto, medida,
  color, vidrio, zona, entrega, subtotal, transporte, total, anticipo,
  saldo, dirección) — asserted on the URL string, **no real WhatsApp
  message is sent** by the test.
- Given retiro en tienda selected instead, when the summary renders,
  then transporte = $0 and price = $188.70 (222×0.85) per the verified
  check-value.
- Given a municipio outside the 23-zone list, when step 3 renders, then
  the empty-state copy "Tu zona aún no tiene tarifa de transporte
  automática — cotiza por WhatsApp" appears with its CTA.
DoD: AC met; e2e test runs the full recta flow on iOS 390 / Android 412 /
desktop 1920 asserting the final `wa.me` URL, never opening it for real;
design-fidelity vs `ios-04/05/06`; CI green (S0 gates) including this new
e2e spec.

## HANDOFF → senior-be / senior-qa (S2), fe-senior-react (S3–S9)
- Recta STRAIGHT-branch pricing logic lives in [file/module TBD by
  architect] — S2 must extract it into the shared pricing-engine module
  without changing T1.2/T1.3's observable behavior (same function
  signature expected: `priceStraight({widthCm, color, glass, pickup}) →
  {price, transportIncluded}`).
- WhatsApp template builder is a pure function
  `buildQuoteMessage(cartLike) → string` — S7/S9 reuse it for multi-item
  and the contact webform respectively; don't re-implement string
  building per feature.
- Drawer/top-bar/footer components from T1.1 are the shared shell — S3/S4
  mount their sections inside it, they don't rebuild it.
- Zone-fee table (23 municipios) is now a named constant/module — S5/S6
  reuse it, do not hardcode a second copy.
