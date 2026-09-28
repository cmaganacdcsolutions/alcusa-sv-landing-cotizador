# S10 — Motion: "experiencia religiosa"

Goal: apply the soft, elegant, cinematic-but-calm motion language on top
of the now functionally-complete build (S1–S9), per `02-design/
motion-language.md`. Never re-plumb functional behavior — motion is a
layer, not a rewrite. Hill chart: **downhill** (applied polish on known
components).

Appetite: M. Owner: cinematic-effects-expert.

## Tasks

### T10.1 — Section-entry + scroll choreography
Priority: P2 · Depends on: S9 · Blocks: T10.2
Scope: calm entrance transitions for landing sections (hero, cómo
funciona, catálogo, galería, confianza, info, contacto, footer) per
`motion-language.md` timing/easing tokens — no bounce, no aggressive
parallax; "stillness" principle from the brand ("trust needs stillness").
Acceptance Criteria:
- Given `prefers-reduced-motion: reduce`, when the page loads, then all
  entrance transitions are disabled/instant (no motion played) on all 3
  viewports.
- Given normal motion preference, when scrolling, then each section's
  entrance completes within the timing budget defined in
  `motion-language.md` (no jank, no layout thrash — measured, not
  eyeballed).
DoD: design/motion-fidelity check vs `motion-language.md`; reduced-motion
verified.

### T10.2 — Cotizador step transitions + summary sticky behavior
Priority: P2 · Depends on: T10.1 · Blocks: T10.3
Scope: step-to-step transitions (0→7), live price counter animation,
spinner-replaces-label on Wompi "create-link" (already built in S8 —
this task styles its motion only), sticky summary column behavior on
desktop (per `brand-system.md` §8 exception to non-sticky nav).
Acceptance Criteria:
- Given a step transition, when triggered, then it respects
  reduced-motion (instant, no animated slide) and otherwise matches
  `motion-language.md` easing.
- Given the "Pago cancelado" screen (S8 T8.3), when it renders, then NO
  shake/wiggle animation is present — confirmed already forbidden, this
  task must not introduce one.
DoD: e2e check (S11) confirms no forbidden animation exists on the
cancelado screen.

### T10.3 — Drawer + top-bar motion
Priority: P2 · Depends on: T10.2 · Blocks: —
Scope: drawer open/close (scrim fade + panel slide from left), top-bar
scroll-away behavior — calm, no overshoot/spring bounce.
Acceptance Criteria: given reduced-motion, when the drawer opens/closes,
then it does so instantly with no slide animation, on all 3 viewports.
DoD: design-fidelity vs `motion-language.md`; this closes all motion
work for the cycle.

## HANDOFF → senior-qa (S11)
- Reduced-motion is implemented for: section entrances, step
  transitions, drawer open/close. S11's a11y/reduced-motion test pass
  must assert all three, not just one representative case.
- No shake/wiggle exists anywhere in the build (verified here on
  "Pago cancelado" specifically) — S11 should grep/test for this as a
  regression guard, not just visually spot-check.
