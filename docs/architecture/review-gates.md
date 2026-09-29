# Review gates — run before closing any slice

Architecture review, not a style check. Read the diff (`git diff`), don't take
the PR/slice summary at face value.

## Boundaries (ADR-001)
- [ ] Nothing under `src/engine/**` imports React, Astro, `window`, `document`
      or `fetch`. It is pure functions.
- [ ] Nothing under `src/components/**` (`.astro`) contains pricing math, cart
      state, or a hardcoded `wa.me`/Wompi URL.
- [ ] `wa.me` appears exactly once in the codebase, inside
      `src/integrations/whatsapp/waLink.ts` (`grep -rn "wa.me" src/`).
- [ ] The browser bundle never contains `WOMPI_CLIENT_SECRET`,
      `WOMPI_WEBHOOK_SECRET`, or any Bearer token (`grep` the built `dist/`
      output, not just source, before signing off a slice that touches Wompi).

## Secrets / config
- [ ] No secret, API key, or non-public URL hardcoded anywhere — only via
      `import.meta.env.*` / PHP `getenv`.
- [ ] `.env.example` updated if a new env var was introduced; `.env` is not
      committed (`git status` clean of it).

## Pricing engine (Slice 2+)
- [ ] Every formula/table (straight, corner, tempered, hinged, windows,
      garden, zone-fee) has unit tests with fixture values taken from
      `exploratory-report.md` §3 / `source-inventory.md` §6 — not made up.
- [ ] `requiresQuote` options (Natural window frame, Reflectivo bronce,
      non-white/non-clear garden finish, out-of-range width/height) are
      labeled at selection time, never silently blocked at checkout, per
      §2.3.
- [ ] Coverage on `engine/pricing/*` ≥ 90% in CI output.

## WhatsApp (ADR-004)
- [ ] `buildMessage.ts` output matches the literal template in
      `prototype-spec.md` §2.6 (cotizador) and §2.9 (contact) — snapshot test
      present and passing.
- [ ] Link is a real `<a href>`, not `window.open` in a click handler.

## Wompi (ADR-003)
- [ ] Browser code calls only our own `api/wompi-create-link.php` — never
      `api.wompi.sv`/`id.wompi.sv` directly.
- [ ] `wompi-webhook.php` recomputes HMAC-SHA256 over the **raw** body and
      compares to the `wompi_hash` header before trusting the payload.
- [ ] `PUBLIC_COTIZADOR_MODE=mock` is the default in `dev` and forced in CI;
      `integrations/wompi/mock.ts` covers both success and declined.
- [ ] No AMEX option surfaced anywhere in the payment UI; 80/20 and 100%
      both compute from the same total; Tasa 0% copy only shown for credit
      card, per spec.

## Routing/state (ADR-005)
- [ ] Section anchors (`#inicio`, `#proceso`, …) still work with JS disabled
      (progressive baseline).
- [ ] Back button steps the wizard back one step (not out of the page) for
      steps ≥1; from step 0 it leaves the page normally — manually verified
      on at least one real mobile browser, not just Playwright.
- [ ] A mid-wizard deep link with no `sessionStorage` cart state falls back
      to step 0, not a broken payment step.

## Testing (ADR-006)
- [ ] `test:e2e` ran all 3 projects (iOS WebKit 390×844, Android Chromium
      412×915, Desktop 1920×1080) — check the CI log, not just "tests
      passed" on one project.
- [ ] axe run on: home, drawer open, each cotizador step reached, contact
      form — zero critical/serious violations.
- [ ] Every e2e spec blocks `wa.me` and `wompi` network routes — confirm
      this guard is present in the spec file, not assumed.

## NFRs
- [ ] Lighthouse mobile (throttled): LCP ≤2.5s, CLS ≤0.1, INP ≤200ms on the
      built `preview`, not `dev`.
- [ ] JS budget: landing ≤40KB gz before cotizador hydrates, cotizador island
      ≤90KB gz — CI bundle-size step green.
- [ ] Reduced motion: `prefers-reduced-motion: reduce` disables the Light
      Sweep Reveal and non-essential transitions — manually toggled and
      checked, not assumed from code review alone.
- [ ] `.htaccess` present with CSP/nosniff/referrer-policy/permissions-policy
      headers; verified with `curl -I` against a served build, not just read
      in the file.
- [ ] `LocalBusiness` JSON-LD present and valid (Google Rich Results test),
      even if some fields are placeholders pending client answers (§4 open
      questions in `prototype-spec.md`).

## Architectural erosion (every slice)
- [ ] No second way to build a WhatsApp link, call Wompi, or compute a price
      has appeared anywhere else in the codebase.
- [ ] No direct DOM/`fetch` access from inside `engine/`.
- [ ] No new dependency or layer (state library, router, CSS framework, DB
      client) was added without an ADR — if one was, either write the ADR
      adopting it (if it's genuinely better) or send the slice back naming
      the exact file/line.

## Close-out
- [ ] `docs/architecture/tech-debt.md` updated if this slice introduced or
      resolved a known limitation.
- [ ] CI green on the slice's branch/commit before calling it done.
