# ADR-005: State/routing for the one-page site + cotizador steps

Date: 2026-09-28
Status: accepted

## Context
Single page, two navigation needs that must coexist: (a) plain scroll-anchor
navigation between landing sections (`#inicio`, `#proceso`, `#modelos`,
`#galeria`, `#confianza`, `#cotizador`, `#info`, `#contacto` — drawer links,
footer links, wordmark), and (b) a 7-step wizard (screens 03–07) that needs
its own back-button behavior and a deep link to "start cotizando" from
anywhere on the page.

## Decision
- **Section anchors** stay plain `#id` fragments — native browser scroll,
  zero JS, works even before the cotizador island hydrates.
- **Wizard step position** is encoded as `#cotizador/<step-slug>` (e.g.
  `#cotizador/3-zona-entrega`), i.e. an extension of the same anchor used for
  the section. On mount, the island reads `location.hash`, splits on the
  first `/`: the part before is used for `scrollIntoView('cotizador')`
  (browsers won't auto-scroll a compound fragment), the part after seeds the
  step in the reducer.
- **Step transitions** call `history.pushState(null, '', '#cotizador/<slug>')`
  (not `location.hash =`, to avoid a duplicate scroll jump). A `popstate`
  listener decrements the step in the reducer. From step 0, back navigates
  away from the page as normal (no special-casing — matches user
  expectation).
- **Direct deep link to a mid-wizard step** (e.g. a shared link) is honored
  only if the cart already has state in `sessionStorage`; otherwise it's
  ignored and the wizard opens at step 0 — we never resurrect a payment step
  with no cart behind it.
- Drawer "Cotizar" and any catalog "Cotizar este modelo" CTA set
  `#cotizador/0-producto` with the product pre-selected in the reducer before
  navigating.
- No client-side router library — this is one page with one interactive
  region; a router would add a dependency and a concept (routes) that maps to
  nothing real here.

## Alternatives considered
- **Full client-side router (React Router) treating each step as a route.**
  Rejected: over-fitted for a 7-node linear-ish flow with one page; adds a
  dependency and a mental model (routes, route guards) for no real gain over
  a typed reducer + `pushState`.
- **Query string (`?step=3`) instead of hash.** Rejected: would fight the
  section-anchor fragment on the same URL; hash namespace is simpler here
  since anchors are already hash-based site-wide.

## Consequences
- Good: no router dependency; back button behaves the way a user expects at
  every level (step-back inside the wizard, page-back once past step 0).
- Good: cotizador is directly linkable (`/#cotizador/0-producto`) for
  marketing/ads without any server routing.
- Bad: hand-rolled `popstate` handling is a small but real bit of custom
  logic — must be unit/e2e tested explicitly (back button test is a named
  case in the e2e suite, not optional).
