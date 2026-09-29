# ADR-001: Astro (static output) + React islands, TypeScript

Date: 2026-09-28
Status: accepted

## Context
One landing page, one interactive subtree (the cotizador wizard + contact
form), must deploy as static files to Hostinger shared hosting, and must hit
LCP ≤2.5s / JS budget ≤150KB gz worst-case on 4G mobile. `fe-senior-react` is
the implementing agent (React/TS/Vite/Node skillset).

## Decision
Build with **Astro**, static output (`output: 'static'`, no adapter, no SSR
runtime), TypeScript throughout. All static landing sections
(Hero/ComoFunciona/Catálogo/Galería/Confianza/InfoImportante/Contacto-shell/
Footer/TopBar/Drawer) are `.astro` components — plain HTML/CSS, effectively
zero shipped JS. The cotizador wizard and the contact form are **React
islands** (`client:visible`), hydrated only when scrolled into view. The
pricing engine is framework-agnostic TS, imported by the island.

## Alternatives considered
- **Plain Vite + React SPA.** Team's most familiar option, one framework only.
  Rejected as default because a bare SPA ships the full React runtime and
  hydrates the entire page (including static marketing content) just to
  render text — directly works against the LCP/JS-budget NFRs for a page
  that is 90% static. Getting real SEO HTML out of it requires bolting on a
  prerenderer (`vite-plugin-ssg`/`react-snap`) anyway, which converges to the
  same amount of tooling as Astro without the JS savings.
- **Next.js (static export).** Rejected: SSR/ISR conventions and a heavier
  build/runtime footprint buy nothing here since Hostinger shared hosting
  cannot run a Node server — we'd only ever use `next export`, at which point
  Next's main value proposition doesn't apply and Astro is the lighter tool
  for the same static output.
- **Eleventy / hand-written HTML + vanilla JS wizard.** Rejected for the
  cotizador specifically: a 7-step wizard with live pricing, validation and
  branching state is exactly what a typed reducer + component tree is good
  at; hand-rolled DOM state management for money math is a bug magnet with
  no type safety.

## Consequences
- Good: static sections cost ~0 JS; only the cotizador pays the React tax,
  and only when a visitor scrolls to it. SEO gets real server-rendered HTML
  for free (build-time, not request-time — no server needed).
- Good: pricing engine stays a plain TS package, portable if the frontend
  ever changes.
- Bad: introduces a build tool (Astro) beyond plain Vite; `fe-senior-react`
  needs a short ramp-up on `.astro` template syntax and island directives
  (`client:visible`/`client:idle`). Mitigated: static components are simple
  HTML+expressions, no new mental model beyond JSX-like templating.
- Bad: two component styles in one repo (`.astro` vs `.tsx`) — mitigated by
  the strict `components/` (static) vs `islands/` (React) folder boundary in
  the README, enforced at review.
- Exit cost: low. `engine/` and `integrations/` are framework-agnostic; if
  Astro is ever abandoned, only `components/*.astro` need rewriting to
  another templating layer — the hard part (pricing, state, integrations)
  survives unchanged.
