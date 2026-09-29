# S0 — Scaffold & CI skeleton

Goal: an empty, deployable-shape app on `dev` with lint, typecheck, unit
test, and build all green in CI, so every later slice only adds code, never
plumbing. Hill chart: **uphill** (figuring out the repo shape) — resolve
first, fast.

Appetite: S (≤1 day). Stack-agnostic: whatever `senior-software-architect`
picks, this slice just needs the four gates wired.

## Tasks

### T0.1 — Scaffold app skeleton
Owner: senior-devops · Priority: P1 · Depends on: — · Blocks: T0.2, S1

Context: `03-dev` currently has only a README; no app exists.
Scope:
- Initialize the app per the architect's stack decision (framework/tooling
  TBD by `senior-software-architect`, running in parallel).
- One home route rendering a placeholder page.
- `.env.example` with placeholder keys for Wompi (mock mode only) and any
  WhatsApp config — no real secrets.
Out of scope: any product UI, any real Wompi/WhatsApp credentials.
Acceptance Criteria:
- Given a fresh clone of `dev`, when the app is installed and started
  locally, then the placeholder route renders with no console errors.
- Given the repo, when scanned for secrets, then none are committed
  (`.env.example` has placeholders only).
DoD: builds locally; no secrets committed; HANDOFF written to T0.2.

### T0.2 — CI pipeline: lint, typecheck, unit test, build
Owner: senior-devops · Priority: P1 · Depends on: T0.1 · Blocks: S1

Context: every slice's DoD requires these four gates green on `dev`.
Scope:
- CI workflow runs on push/PR to `dev`: install → lint → typecheck →
  unit test → build, in that order, failing fast.
- E2E test runner wired but allowed to have zero tests for now (S1 adds
  the first one).
- Viewport test config pre-set for 390×844 (iOS), 412×915 (Android),
  1920×1080 (desktop) so later slices only add specs, not config.
Out of scope: deploy step of any kind (no-go this cycle).
Acceptance Criteria:
- Given a PR against `dev` with a deliberate lint error, when CI runs,
  then the pipeline fails at the lint step (not later).
- Given a PR against `dev` with clean code, when CI runs, then all four
  gates pass and the job reports green.
- Given the e2e config, when inspected, then the three viewport presets
  (390×844, 412×915, 1920×1080) exist and are named for reuse.
DoD: CI green on a trivial PR; no secrets in CI config; HANDOFF written.

## HANDOFF → fe-senior-react (S1)
- App skeleton at repo root, one placeholder route, package scripts for
  lint/typecheck/test/build all wired and passing.
- Viewport presets named (e.g. `ios390`, `android412`, `desktop1920`) —
  reuse these exact names in every later e2e spec, don't redefine them.
- `.env.example` keys present for Wompi mock mode — S8 fills in mock
  behavior, do not wire real Wompi here or in S1.
