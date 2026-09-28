# S9 — Contacto: webform + socials + footer

Goal: `#contacto` section (spec §1 item 8, §2.9) and the final footer
(item 9) — the last landing section, closing the sitemap. Hill chart:
**downhill**.

Appetite: S. Ref: `prototype-spec.md` §1 item 8–9, §2.9; boards
`ios-08-contacto-webform.dc.html`, `desktop-04-contacto.dc.html`.

## Tasks

### T9.1 — Contacto info block
Owner: fe-senior-react · Priority: P2 · Depends on: S1 · Blocks: T9.2
Scope: phone/WhatsApp (7680-2410), address (Calle El Pedregal Ciudad
Merliot — pending confirmation, see `client-questions.md`), map link,
social row: Instagram @alcusasv, TikTok @alcusaes, YouTube
@alcusaelsalvador8209. Business hours and email are
`[PLACEHOLDER — confirmar]` per `client-questions.md` #15 (never
invented).
Acceptance Criteria: given the section on all 3 viewports, when
rendered, then all 3 social icons link to the exact handles above, and
hours/email show the literal placeholder text until confirmed.
DoD: design-fidelity vs `ios-08`/`desktop-04` contact block.

### T9.2 — Webform → WhatsApp
Owner: fe-senior-react · Priority: P2 · Depends on: T9.1 · Blocks: T9.3
Scope: fields Nombre, Teléfono, Producto de interés (6 categories +
"Otro"), Mensaje. Button "Enviar por WhatsApp" builds `Hola ALCUSA, soy
{nombre} ({telefono}). Me interesa: {producto}. {mensaje}` →
`wa.me/50376802410?text=…`. No backend. Reuses S1's URL-encoding helper,
not its template (different message shape).
Acceptance Criteria:
- Given the form empty, when rendered, then the submit button is
  disabled (empty-state lifecycle).
- Given Nombre + Teléfono filled (Producto/Mensaje optional), when
  filled, then the button enables.
- Given an invalid phone, when submitted, then an inline `error`-token
  message appears with helper text (never color-only, a11y requirement).
- Given valid Nombre "María" + Teléfono "77778888" + Producto "Ventanas"
  + Mensaje "Cotización urgente", when submitted, then the generated URL
  is `https://wa.me/50376802410?text=<urlencoded: "Hola ALCUSA, soy
  María (77778888). Me interesa: Ventanas. Cotización urgente.">` —
  asserted on the string, never actually sent.
DoD: e2e on 3 viewports; unit test for the phone-validation error state.

### T9.3 — Footer
Owner: fe-senior-react · Priority: P2 · Depends on: T9.2 · Blocks: —
Scope: legal name "Aluminios Cuzcatlán, S.A. de C.V. — brand ALCUSA",
quick links, socials (same 3 handles), WhatsApp CTA repeat. NIT/registro
fiscal line is `[PLACEHOLDER — confirmar]` per `client-questions.md` #6
until legal data arrives.
Acceptance Criteria: given the footer on all 3 viewports, when rendered,
then quick links jump to their in-page anchors correctly and the NIT
line shows the literal placeholder, not an omission or a guess.
DoD: design-fidelity vs footer block in `ios-01-home.dc.html`; this
completes the full sitemap — all 9 landing sections + cotizador now
exist end-to-end.

## HANDOFF → senior-qa (S11), cinematic-effects-expert (S10)
- Landing is now feature-complete top to bottom (S1+S3+S4+S9 sections +
  S1/S5/S6/S7/S8 cotizador) — S10/S11 can run against the full page, not
  fragments.
- Every `[PLACEHOLDER — confirmar]` field is now enumerated across S3
  T3.3, T3.4, T9.1, T9.3 — cross-reference against `client-questions.md`
  when the client answers land, one follow-up task per field, not a bulk
  re-open of these slices.
