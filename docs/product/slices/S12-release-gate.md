# S12 — Release gate: PR dev → main

Goal: the single, small, ceremonial slice that closes Cycle 1. No new
product behavior — only verification that every prior slice's DoD is
actually met, and opening the PR. Hill chart: **downhill**.

Appetite: S. Owner: senior-devops.

## Tasks

### T12.1 — Final CI run + PR
Priority: P1 · Depends on: S11 · Blocks: —
Scope: confirm CI green on `dev` HEAD (lint, typecheck, unit, e2e,
build); open PR `dev → main` with a summary linking `pitch.md`,
`backlog.md`, and the QA sign-off from S11; no deploy step (Hostinger
deploy is next-cycle, per pitch No-gos).
Acceptance Criteria:
- Given `dev` HEAD, when CI runs, then all four gates report green.
- Given the PR description, when reviewed, then it lists which slices
  (S0–S11) are Done and links this backlog.
- Given the diff, when scanned, then no secrets (real Wompi keys, real
  API tokens) are present anywhere in the PR.
DoD: PR opened; this is the last task of Cycle 1. Cycle 2 (Hostinger
deploy, email migration, DNS, real Wompi go-live) is shaped separately
once `client-questions.md`'s blocking answers land.
