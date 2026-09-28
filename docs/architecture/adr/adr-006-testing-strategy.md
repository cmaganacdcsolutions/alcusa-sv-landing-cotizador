# ADR-006: Testing strategy — Vitest + Playwright (3 viewports) + axe

Date: 2026-09-28
Status: accepted

## Context
Money math (pricing engine) and message text (WhatsApp templates) must never
regress silently; the wizard must work identically on iOS Safari, Android
Chrome and desktop 1920×1080; no test may ever send a real WhatsApp message or
touch real Wompi.

## Decision
- **Vitest** for `engine/` and `integrations/`: pure-function unit tests,
  coverage gate ≥90% on `engine/pricing/*`. Pricing tests use fixture values
  taken verbatim from `exploratory-report.md` §3.1–3.4 and
  `source-inventory.md` §6 (zone-fee table) — not invented numbers.
  `buildMessage.ts` is snapshot-tested against the literal templates in
  `prototype-spec.md` §2.6/§2.9.
- **Playwright**, three projects: `ios` (390×844, WebKit), `android` (412×915,
  Chromium mobile emulation), `desktop` (1920×1080, Chromium). Specs:
  `cotizador.spec.ts` (full step 0→7 happy path + the out-of-range /
  `requiresQuote` edge states from §2.3), `whatsapp-links.spec.ts` (asserts
  the built `href` matches the expected encoded template — **never clicks
  through**), `wompi-mock-flow.spec.ts` (forces `PUBLIC_COTIZADOR_MODE=mock`,
  asserts both the success and declined return-screen states), `a11y.spec.ts`
  (`@axe-core/playwright` injected on: home, drawer open, each cotizador step,
  contact form — zero critical/serious violations allowed).
- **Safety net against real sends/payments**: every e2e spec runs with
  `PUBLIC_COTIZADOR_MODE=mock` forced by the CI env, **and** every spec's
  fixture calls `page.route('**/wa.me/**', r => r.abort())` and
  `page.route('**wompi**', r => r.abort())` as a second, independent guard —
  a test can never accidentally reach either service even if a mode flag is
  misconfigured.
- CI runs `test` then `build` then `test:e2e` against `preview` (a real static
  build, not the dev server) so what's tested is what ships.

## Alternatives considered
- **Cypress instead of Playwright.** Rejected: no first-class WebKit project
  for real iOS Safari engine coverage, which this brief explicitly requires.
- **Manual QA only for the 3 viewports.** Rejected: three viewports checked by
  hand on every change doesn't survive contact with a one-person team past
  slice 2; automate it once, pay for it never again.

## Consequences
- Good: pricing regressions and copy drift fail CI, not a customer's order.
- Good: guaranteed no real external side effects from any test run.
- Bad: three Playwright projects roughly triple e2e run time — acceptable at
  this project's size; revisit (shard/parallelize) only if CI time becomes a
  real friction (trigger: e2e stage >8 min).
