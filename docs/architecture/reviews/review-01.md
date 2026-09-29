# Architecture review 01 — S0–S3, S9 (branch `dev`, local HEAD)

Reviewer: senior-software-architect. Scope: read-only review against
`docs/architecture/README.md`, `docs/architecture/adr/*`,
`docs/architecture/review-gates.md`. Gates re-run locally: `lint`,
`typecheck`, `test` (coverage), `build` + `scripts/check-bundle-size.mjs`.
No e2e/preview run (dev server on :4321, parallel worktrees for S4–S6).

## Verdict per gate

| Gate | Verdict | Notes |
|---|---|---|
| Boundaries (ADR-001) | **Pass** | `engine/pricing` has zero `window`/`document`/`fetch`/React/Astro imports (grep-verified). `wa.me` appears exactly once, in `waLink.ts`; every other hit is a comment reaffirming the rule. `api/*.php` are 3-line stubs (no secrets, no logic yet — correctly deferred to S8). |
| Secrets / config | **Pass** | `.env.example` matches `env.d.ts`'s `ImportMetaEnv`; CI secret-scan step present and greps for real key patterns, excluding `.env.example`/docs. No secret found in `dist/`. |
| Pricing engine (S2) | **Pass** | `npm run test` → 69/69 passing, engine+integrations 100% stmt/100% fn/98.75% branch, comfortably above the 90% gate. |
| WhatsApp (ADR-004) | **Pass** | `buildMessage.test.ts`/`contactMessage.test.ts` assert exact literal strings (equivalent to the required snapshot). Links are real `<a href>` (`Step5FormaPago.tsx:101`, `ContactForm.tsx`), not `window.open`. |
| Wompi (ADR-003) | **Concern** | Correctly not implemented yet (`client.ts`/`mock.ts` are 3-line stubs, `wompi-mock-flow.spec.ts` is `describe.skip`) — nothing to fail today, but this gate is untested, not passing. Re-verify for real at S8 close-out. |
| Routing/state (ADR-005) | **Concern** | See Finding 3 — hash 3rd-segment (product pre-select) is dropped by `Cotizador.tsx`, already self-tracked in tech-debt.md:18. Blocks an S4 acceptance criterion. |
| Testing (ADR-006) | **Concern** | Network-blocking guard for `wa.me`/`wompi` is present and global (`tests/e2e/fixtures.ts:9-11`) — good. But `a11y.spec.ts` only covers home/drawer/cotizador steps 0,1,4 — steps 2,3,5 and the contact form are untested, contradicting review-gates.md's own checklist. |
| CI workflow | **Pass** (1 concern) | Order (install→secret-scan→lint→typecheck→test→build→e2e→bundle-size) is a reasonable fail-fast reordering of README §7, not a defect. But see Finding 1 — the bundle-size step is a false-green. |
| NFRs — JS budget | **Fail** | See Finding 1 + Finding 2. Gate script reports 0 bytes always; real eager payload is ~75.6KB gz, over the 40KB landing budget. |
| NFRs — a11y | **Concern** | Labels/`aria-invalid`/`aria-describedby` wired correctly in `ContactForm.tsx`; `jsx-a11y` active in `eslint.config.js`. Coverage gap is in e2e axe runs, not static markup (Finding 4). |
| NFRs — SEO/security headers | **Concern** | No `LocalBusiness` JSON-LD in `BaseLayout.astro` (Finding 5); `.htaccess` has nosniff/referrer-policy/permissions-policy but no CSP/HSTS (Finding 6) — comment says "finalized in hardening slice," but neither item is named in any slice doc (S3/S4/S11/S12 checked — no match). |
| Architectural erosion | **Concern** | Boundary rules (engine purity, single `wa.me` site) hold today but are enforced only by grep/manual review, not lint (Finding 7). |

## Findings

**F1 — Bundle-size CI gate is structurally broken (false green). Severity: Critical.**
`scripts/check-bundle-size.mjs` only scans `<script src="*.js">` tags and
`.js` import specifiers inside JS files. Astro 7 islands hydrate via
`<astro-island component-url="...">` custom-element attributes, not
`<script src>` tags — the script never sees them. Ran `npm run build &&
node scripts/check-bundle-size.mjs`: output is `Reachable JS files: 0` /
`0 bytes` for both budgets, always green regardless of real payload.
Already self-tracked in `docs/architecture/tech-debt.md:13` with trigger
"before S3+" — that trigger has now passed (S3 done, S4–S6 in flight in
parallel worktrees as of this review) with the fix still outstanding.
Fix: parse `component-url`/`renderer-url` attributes on `astro-island`
elements too. **Absorb in: S11** (T11.2/Lighthouse-budget task), but
treat as urgent — recommend a hotfix now, since S4–S6 are actively adding
UI weight this gate cannot see.

**F2 — Cotizador island hydrates eagerly (`client:load`), not `client:visible` as ADR-001/README mandate. Severity: High.**
`src/pages/index.astro:32` — `<Cotizador client:load />`. ADR-001 and
`README.md:45,81` both specify `client:visible`. Measured real payload
(gzip, from `dist/_astro/`): `client.CLhIxG29.js` 65.7KB + `Cotizador.js`
6.5KB + `react.js` 3.0KB + `jsx-runtime.js` 0.4KB ≈ **75.6KB gz**, all
downloaded on page load because `client:load` ignores viewport
intersection — this blows the "landing ≤40KB gz before cotizador
hydrates" NFR (README:31) by ~2x, and F1 means CI cannot catch it. This
is drift from the accepted ADR, not an improvement — send back rather
than adopt. Fix: change to `client:visible` on the `#cotizador` section
wrapper. **Absorb in: S7** (next slice that touches `Cotizador.tsx`
root wiring per backlog dependency order) — flag to whoever owns it now
as a pre-existing regression, not new scope.

**F3 — Product pre-select via hash 3rd segment is dropped; blocks an S4 acceptance criterion. Severity: Medium.**
Already self-documented in `tech-debt.md:18`: `Cotizador.tsx`'s
`stepFromHash`/mount effect reads only the step slug, ignoring a 3rd
hash segment (`#cotizador/0-producto/<productId>`), and never dispatches
`SELECT_PRODUCT`. S4's T4.1 AC ("tap 'Cotizar este modelo' on Puerta con
bisagra → step 0 opens with hinged pre-selected") cannot pass as
written until this is fixed, and S4 is running in a parallel worktree
right now. **Absorb in: S4** (already the natural owner per
tech-debt.md — escalating priority since S4 is in flight today).

**F4 — a11y e2e coverage narrower than review-gates.md requires. Severity: Medium.**
`tests/e2e/a11y.spec.ts:14-52` runs axe on home, drawer, and cotizador
steps 0/1/4 only. `review-gates.md:63-64` requires "each cotizador step
reached" + "contact form." Missing: step 2 (precio), step 3
(zonaEntrega), step 5 (forma de pago — has a `role=radiogroup` with a
disabled radio, worth an axe pass), and the contact form. **Absorb in:
S11** (T11.3 accessibility audit — extend the existing spec file, don't
create a second one).

**F5 — No `LocalBusiness` JSON-LD anywhere. Severity: Low-Medium.**
`grep -n "JSON-LD\|LocalBusiness\|ld+json" src/layouts/BaseLayout.astro`
→ no match; confirmed by full read of the file (only OG/Twitter meta
present). Required by README:35 ("even if some fields are placeholders
pending client answers"). Not scoped in `S3`, `S4`, `S11`, or `S12`
slice docs — currently an NFR with no owner. **Absorb in: S11 or S12**
— recommend po-pm add an explicit task now so it doesn't fall through
Cycle 1's release gate.

**F6 — `.htaccess` missing CSP and HSTS. Severity: Low (pre-launch), informational for the demo.**
`.htaccess:5-9` sets `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy` but no `Content-Security-Policy` or
`Strict-Transport-Security`, though README:36 requires both. The file's
own comment defers this to "the hardening slice (S6)" [architecture
numbering] — reasonably maps to S11/S12 — but neither header is named
in those slice docs' acceptance criteria. Also chained to
`tech-debt.md:8` (Hostinger TLS/plan unconfirmed) for HSTS specifically.
Not a demo blocker (no deploy to Hostinger in Cycle 1 per S12 scope).
**Absorb in: S11/S12** — add explicit AC line for CSP/HSTS to close the
gap cleanly at the release gate.

**F7 — Module boundaries enforced by convention/grep only, not lint. Severity: Low.**
No `no-restricted-imports` (or similar) rule in `eslint.config.js`
scoped to `src/engine/**` or the single-`wa.me`-site rule. Holds today
(verified), but nothing stops a future edit from regressing it besides
manual review — acceptable for now given `tech-debt.md:7`'s
single-contributor note, but worth automating once a second contributor
joins. **Absorb in: S11** (nice-to-have, not blocking).

## Passing checks worth naming
Lint/typecheck/unit-test/build all green locally; engine purity and the
single-`wa.me`-site rule hold; env var split (`PUBLIC_*` vs server-only)
is correct and mirrored in `.env.d.ts`; WhatsApp message templates are
exactly asserted; e2e network guard against real `wa.me`/`wompi` calls
is global, not per-spec; Wompi/PHP correctly left as stubs, not
half-wired.

## Top 3 risks before the 2026-09-29 demo

1. **Perf/jank risk during the live demo**: F1+F2 combined mean the
   cotizador currently ships ~75.6KB gz of JS eagerly on page load, on a
   client-visible-facing demo likely shown on mobile — and the one gate
   built to catch this reports false-green, so nobody will see it
   regress further as S4–S6 land today.
2. **The catálogo → cotizador "Cotizar este modelo" flow (F3) may not
   pre-select the product live**, and this is one of the more
   demo-friendly interactions (tap a card, land pre-filled) — likely to
   be shown directly to the client.
3. **NFR blind spots compound quietly**: a11y (F4), JSON-LD (F5), and
   CSP/HSTS (F6) are all either partially tested or entirely unscoped —
   individually low severity, but together they mean "CI is green" is
   currently a weaker signal than the docs imply, right when three
   slices are landing in parallel and review bandwidth is stretched.
