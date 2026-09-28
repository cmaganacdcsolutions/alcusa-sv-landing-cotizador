# ADR-007: Branching model + CI gates

Date: 2026-09-28
Status: accepted

## Context
Small team, one repo, `main` must always be deployable; task brief mandates
all work happen on `dev` with CI required green before merging to `main`.

## Decision
- All feature work commits to `dev` directly (team is small enough that a
  full trunk-based/feature-branch scheme is overhead nobody pays back yet);
  revisit if a second implementing engineer joins mid-project (trigger: >1
  concurrent contributor — add short-lived feature branches + PR review then).
- `main` is protected: no direct pushes, only merges from `dev` when GitHub
  Actions CI is green on the merge commit (lint, typecheck, unit tests + 90%
  coverage gate on `engine/`, build, e2e on 3 viewports + axe, secret-scan,
  bundle-size budget).
- Deploy to Hostinger is a manual/FTP step for now (later phase per brief) —
  not part of this CI pipeline; `main` being green is the release gate, the
  actual upload is out of scope until the deploy slice.
- Commits and PR descriptions never include secrets; `.env` is gitignored,
  `.env.example` is the only committed env file.

## Alternatives considered
- **GitFlow with release branches.** Rejected: no scheduled release train,
  one deploy target, one active contributor at a time — ceremony with no
  payoff.
- **Trunk-only, no `dev`/`main` split.** Rejected: brief explicitly requires
  work on `dev` with a gated promotion to `main`; also gives one manual
  checkpoint before anything reaches the branch that (eventually) maps to
  production.

## Consequences
- Good: simple, matches team size, `main` is always the last known-green
  state.
- Bad: no code review gate on `dev` commits themselves — acceptable given
  team size of one; the architecture review gate (this document's checklist)
  substitutes for peer review at the `dev → main` promotion point.
