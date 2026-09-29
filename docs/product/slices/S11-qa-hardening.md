# S11 — QA hardening: unit + e2e, 3 viewports, a11y, reduced-motion

Goal: the gate before `dev → main`. Consolidate and extend every slice's
own tests into one full-coverage pass; any gap found here is a bug filed
against the owning agent (P0/P1), not a "later" item. Hill chart:
**downhill** (verification of known-complete work), but treat any failure
found as new uphill work for its owner.

Appetite: L (4–5 days — this is the largest slice; if it doesn't fit,
split by concern: unit/pricing vs e2e/flows vs a11y/motion, don't compress
scope). Owner: senior-qa.

## Tasks

### T11.1 — Pricing engine unit-test audit
Priority: P1 · Depends on: S2, S5, S6, S7 · Blocks: T11.2
Scope: verify every check-value in `exploratory-report.md` §3.1–3.4 has a
corresponding unit test (not just the ones sampled in S2/S5/S6's task
bodies) and that the subtotal-vs-transport-once split (S2 T2.3 decision)
is consistently applied across all 6 products + S7's order-level
transport.
Acceptance Criteria: given the full check-value list in
`exploratory-report.md` §3.1–3.4, when cross-referenced against the test
suite, then 100% have a corresponding assertion (gaps filed as P1 bugs
against senior-be).
DoD: coverage report attached to the QA note; zero untested check-values.

### T11.2 — E2E flows × 3 viewports
Priority: P1 · Depends on: T11.1 · Blocks: T11.3
Scope: run the tracer bullet (S1) and at least one representative flow
per remaining product (S5/S6) plus the multi-item + payment-mock flow
(S7/S8) across all three viewport presets from S0
(`ios390`/`android412`/`desktop1920`). Confirm the drawer's Android
back-gesture annotation (from `render-brief.md`/boards) and desktop's
sticky summary column both behave as specified.
Acceptance Criteria:
- Given each of the 3 viewport presets, when the tracer-bullet flow runs,
  then it completes to a correctly-formed `wa.me` URL with zero real
  WhatsApp messages sent and zero real Wompi network calls (spied and
  asserted, not assumed).
- Given desktop 1920, when the cotizador is open, then the summary
  column is sticky within its own column while the top bar is not.
- Given Android 412, when a cotizador step is open and the system
  back-gesture is simulated, then it steps back one cotizador step (not
  out of the page), per spec annotation.
DoD: all flows green on all 3 viewports; any failure filed as a P0/P1 bug
against the owning agent (fe-senior-react/senior-be), re-entering their
backlog, not a new slice.

### T11.3 — Accessibility audit
Priority: P1 · Depends on: T11.2 · Blocks: T11.4
Scope: keyboard navigation (drawer focus-trap, gallery lightbox
focus-trap), color-never-alone error states (webform, cotizador
validation), tap targets ≥44px (hamburger, WhatsApp quick-icon), alt text
on all imagery, form labels.
Acceptance Criteria:
- Given the drawer open, when Tab is pressed repeatedly, then focus stays
  trapped inside the drawer until it closes, and closing returns focus to
  the hamburger.
- Given any validation error (webform phone, cotizador width-out-of-range,
  quantity-out-of-range), when triggered, then the error is conveyed by
  icon/text/border, never color alone.
DoD: a11y checklist fully passed; any gap filed as a P1 bug against
fe-senior-react.

### T11.4 — Reduced-motion regression pass
Priority: P1 · Depends on: T11.3, S10 · Blocks: —
Scope: confirm S10's reduced-motion implementation holds across section
entrances, cotizador step transitions, and drawer open/close; confirm no
shake/wiggle exists anywhere (grep-style regression guard, not just the
"Pago cancelado" screen).
Acceptance Criteria: given `prefers-reduced-motion: reduce` set at the OS
level, when the full site is exercised end-to-end (landing scroll +
full cotizador + payment result), then no animated transition plays
anywhere, on all 3 viewports.
DoD: this is the final gate before S12; all P0/P1 bugs from T11.1–T11.4
are resolved and re-verified (not just filed) before sign-off.

## HANDOFF → senior-devops (S12)
- All four DoD gates (lint, typecheck, unit, e2e, build) are green on
  `dev`, across all 3 viewports, with the pricing engine at 100%
  check-value coverage, zero real WhatsApp/Wompi calls in test, a11y and
  reduced-motion passed.
- Any bug found and NOT yet re-verified fixed blocks S12 — list them
  explicitly if any remain open at hand-off time (circuit breaker: an
  unresolved P0/P1 does not get waved through to the PR).
