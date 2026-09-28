# ADR-004: WhatsApp deep-link approach + message encoding

Date: 2026-09-28
Status: accepted

## Context
Two flows need WhatsApp: cotizador confirmation (§2.6 template) and the
contact webform (§2.9 template), both to `+503 7680-2410`, client-side only,
no WhatsApp Business API, no backend.

## Decision
`integrations/whatsapp/buildMessage.ts` builds the exact plain-text template
from typed input (cart state or contact form fields) — pure function,
snapshot-tested against the literal strings in `prototype-spec.md` §2.6/§2.9
so the copy can never silently drift. `integrations/whatsapp/waLink.ts` does
`https://wa.me/50376802410?text=${encodeURIComponent(message)}` — nothing
else touches `wa.me` anywhere in the codebase (grepped for at review gate).
The link opens via a real `<a href>` (not `window.open` from a click handler)
so it works identically as a normal navigation on iOS Safari and Android
Chrome, and is trivially interceptable/blockable in Playwright tests.

## Alternatives considered
- **WhatsApp Business API / Cloud API.** Rejected: requires a backend,
  approved templates, and a Meta business verification — far beyond what a
  static-site, no-backend brief calls for. Revisit only if ALCUSA wants
  automated confirmations/receipts at real scale.
- **`window.open()` triggered imperatively.** Rejected: more fragile across
  mobile browser popup-blockers than a plain anchor tag; an `<a>` is also
  easier to make keyboard/screen-reader accessible.

## Consequences
- Good: zero backend, zero secrets, trivially testable (assert the `href`
  string, never navigate).
- Good: message text is single-sourced and tested, so pricing/zone/color
  fields can't drift from what the spec promises the customer.
- Bad: no delivery confirmation or read receipt — acceptable, matches "an
  advisor confirms manually" flow already in the spec.
