# ADR-009: Quote PDF, client-side generation, numbering and WhatsApp delivery (R4)

Date: 2026-09-29
Status: proposed (client review 2026-09-29; becomes accepted on approval)

## Context
R4 adds "Descargar cotización (PDF)" and "Enviar por WhatsApp" to the cotizador summary (S7 cart).
DECIDED by the user (not re-opened here): mobile = `navigator.canShare({files})` then `navigator.share`
with the PDF; desktop or no support = download + `https://wa.me/50376802410?text=...`; `AbortError` =
silent cancel. This ADR decides the PDF library, where it runs, the quote number, the wa.me text
budget, the file name and the CSP impact.

Existing facts: static site with no order database (ADR-002/003/006). Brand fonts are Fraunces
(display) and Manrope (body) via `@fontsource` (woff2, `global.css`). `buildWaLink()` in
`integrations/whatsapp/waLink.ts` is the only allowed wa.me builder (ADR-004, review gate).
The Wompi mock already emits an ORDER number `ALC-<year>-<suffix>` (`integrations/wompi/mock.ts`),
a different thing from the quote number. There is no CSP anywhere yet (tech-debt, S11 will add one).
Cotizador island budget: <= 90 KB gzip, total <= 150 KB (README NFR).

## Decision

### 1. Library: `pdf-lib` + `@pdf-lib/fontkit`, dynamically imported
Layout is a fixed template (logo, header block, one item table, totals, footer). It needs a drawing API,
embedded TTF and text that stays selectable, not a layout engine.

| Criterion | @react-pdf/renderer | pdf-lib (+fontkit) | jsPDF |
|---|---|---|---|
| Bundle (lazy chunk) | Largest: ~1.28 MB min / ~426 KB gzip reported in a public case study (yoga, pdfkit, fontkit, brotli); needs Node polyfills under Vite | Mid: order of a few hundred KB min; zero runtime deps (figures NOT verified, see gate) | Mid: comparable order; optional deps (html2canvas, dompurify) are not loaded if unused (figures NOT verified) |
| Brand fonts (Fraunces/Manrope) | Yes, `Font.register` TTF/woff | Yes, `embedFont(bytes,{subset:true})` via fontkit, subsets so file stays small | Yes, `addFileToVFS`+`addFont` with base64 TTF; embeds more of the font, larger file |
| Spanish glyphs (ñ á é ¿ ¡) | Yes | Yes with embedded font; Standard Helvetica (WinAnsi) also covers them = safe fallback | Same |
| Safari iOS | Works but heavy parse time on low-end phones | Pure JS, no eval/wasm, Blob output works | Pure JS, works |
| Dynamic import | Yes, but chunk too large | Yes | Yes |
| Maintenance | Active | Stable but last upstream release 2021; fork `@cantoo/pdf-lib` is a drop-in | Active; had security advisories (irrelevant here: we only render our own data) |

Choice: pdf-lib. Reasons: smallest dependency-free path with font subsetting (keeps the PDF well under 500 KB),
typed, no polyfills, deterministic output. Cost: manual layout code (row heights, wrapping) and an upstream that is
not actively released. Exit path: swap to `@cantoo/pdf-lib` (same API) or jsPDF behind the single
`buildQuotePdf(quote): Promise<Blob>` boundary; nothing else in the app imports the library.

Measurement gate (T4.1 spike, before UI work): the size figures above come from public reports, not from this
repo. fe-senior-react builds the real chunk in the gates worktree and records gzip KB. Budgets: lazy PDF chunk incl.
fontkit <= 250 KB gzip (raise a new ADR if exceeded; then evaluate jsPDF); fonts <= 120 KB total; PDF with 5 items <= 500 KB; contribution to the initial /cotizador JS = 0.
If pdf-lib fails on iOS Safari real device (font embed or Blob), fall back to jsPDF, same boundary.

Fonts for the PDF: two static TTF/OTF Latin subsets (Fraunces 600 for title/total, Manrope 400/700 for body; max 3 files)
committed in `public/fonts/pdf/` and fetched (`fetch('/fonts/pdf/...')`) only when the PDF is built. Do not try to reuse the
woff2 in `@fontsource` (variable/woff2 handling in fontkit is not guaranteed); fe verifies glyph coverage for `áéíóúñÁÉÍÓÚÑ¿¡$€·–` and if any font fails to load,
the builder falls back to Helvetica (standard font) and logs, so the PDF is never blocked by a font 404.

### 2. Generation: 100% in the browser
`src/integrations/quotePdf/` (pure builder, no store/React imports) takes a `QuoteDocument` DTO built from the same
selector that draws the on-screen summary, so PDF total == screen total by construction (R4 test compares them).
No endpoint, no third party, no upload: customer name/phone/address exist only in memory and in the file the user
saves or shares. Nothing is persisted (no localStorage of customer data). No PHP is needed, so `senior-be` has no work in R4.

Loading: `const { buildQuotePdf } = await import('./buildQuotePdf')` in a separate Vite chunk. AC says "import on button
press". Recommended amendment for po-pm (flag): prefetch the chunk when the summary step mounts (idle, `requestIdleCallback`),
still not in the initial /cotizador JS, because of the activation problem below.

Web Share activation problem (the real risk of R4): `navigator.share` needs transient user activation. If the tap
handler awaits chunk download + font fetch + PDF build (seconds on 3G/low-end iOS) the activation expires and
`share` rejects with `NotAllowedError`. Design: (a) prefetch chunk and fonts at summary mount; (b) build the Blob in the
click handler and call `navigator.share` immediately after; (c) if `share` throws `NotAllowedError`, DO NOT treat as
failure: keep the built File in memory and change the button to "Listo: toca para compartir" (second tap has fresh
activation) ; (d) other non-Abort errors fall to the fallback path, as decided. Cache the last File by
`hash(cart+contact+quoteNumber)` so repeated taps do not rebuild.

Decision function (pure, the 3-branch unit test): `chooseDelivery(nav, file): 'share' | 'fallback'` =
`typeof nav.canShare === 'function' && typeof nav.share === 'function' && nav.canShare({files:[file]})`.
Flow around it per the user's decision. Notes from current docs (MDN, checked 2026-09-29): `share()` needs HTTPS and
transient activation; exceptions `AbortError` (user cancel or no targets), `NotAllowedError`, `TypeError`, `DataError`;
PDF is in the permitted file types. Consequences of `AbortError` also meaning "no share targets available": treat as
silent cancel per the decision, and it is rare on phones.

Desktop caveat (flag for the user, not overridden): Chrome/Edge on Windows/ChromeOS and Safari on macOS also
report `canShare({files})` true, so desktop users may get the OS share sheet instead of download+wa.me. The user rule
is kept ("canShare true = share"). If undesirable, add `&& matchMedia('(pointer: coarse)').matches` inside
`chooseDelivery` (1 line, testable). Open question for the client review.

Fallback order: (1) download via `<a download href=blob:>` then `URL.revokeObjectURL` after ~60 s; (2) open wa.me through a
programmatic click on a real `<a target="_blank" rel="noopener">` built with `buildWaLink(text)` (ADR-004; wa.me stays in
one file); (3) always render the same link as a visible "Abrir WhatsApp" button in the result state as backup for popup
blockers and iOS Safari, plus the notice "Adjunta el PDF descargado". If PDF generation fails: actionable error + link with the
current text-only WhatsApp message (existing behavior).

### 3. Real platform support (validated by search 2026-09-29, honest limits)
- Web Share API Level 2 (files): Chrome Android from v76 (Level 2 shipped in Chrome 75/76), iOS Safari from 15 (Level 1 since 13),
  plus Edge/Chrome desktop on Windows/ChromeOS and Safari macOS. Requires secure context (Hostinger TLS must be on, README
  HSTS note) and `Permissions-Policy` must NOT contain `web-share=()`. MDN marks it "limited availability, not Baseline" so the feature test is mandatory (already decided).
- WhatsApp as a destination for `application/pdf`: the docs say the share sheet lists whatever installed apps accept the type; no
  public doc names WhatsApp. In practice WhatsApp registers for PDF on Android and iOS, but this is NOT verified by any source I could
  fetch. Treat as unverified: mandatory manual device checklist (iOS Safari 15+, iOS Chrome, Android Chrome, Samsung Internet, in-app
  browsers such as Instagram/Facebook WebView, where `canShare` is often false and the fallback must take over).
- Consistent with the slice: real share to WhatsApp is only verifiable on physical devices; e2e stubs `navigator.share`.

### 4. Quote number `ALC-AAAAMMDD-NNN` without a backend
Goal: no visible collisions and no server. A per-device counter (localStorage) collides across devices and resets on cleared storage; a 3-digit
random collides fast (birthday: ~50 quotes/day in a 1000 space gives ~70% chance of at least one duplicate).
Decision: `ALC-<AAAAMMDD>-<SUF>` where date = El Salvador date at generation (`America/El_Salvador`) and SUF =
4 chars Crockford base32 (no I, L, O, U; 32^4 = 1.05 M). Source: `crypto.getRandomValues`. Collision odds for 50 quotes a day within
one date ~0.1%; for 200/day ~2%. Example: `ALC-20260929-K7QM`. This deviates from the literal `NNN` in the request because 3 numeric digits cannot be made safe without a
server. Alternative if the client insists on numeric: `NNN` = 3 digits + device letter... rejected as it still needs shared state.
Rules: (a) generated ONCE per quote session and stored in `sessionStorage` (only the number and a hash of the cart, no customer data);
regenerated only when cart content changes materially, so download + share of the same quote carry the same number; (b) the number is a
reference, not a record: there is no server-side registry, the authoritative copy is the PDF the client received and the WhatsApp thread;
staff must not treat the number as proof of a price (validity date on the PDF covers it); (c) it must not be confused with the Wompi order
number `ALC-<yyyy>-<suffix>`: different length/shape, and the PDF and messages label it "N.º de cotización" while the order stays "N.º de pedido".
If ALCUSA later wants sequential numbers or lookup: needs a tiny PHP counter endpoint (ADR-002 allows PHP); new ADR.
Vigencia (T4.4): stated value comes from po-pm/client (not invented here); a constant `QUOTE_VALIDITY_DAYS` in `content/`, printed as an absolute date.

### 5. wa.me message size
`https://wa.me/<n>?text=<encoded>` is a URL: browsers, Android intents and app links truncate or fail well before WhatsApp's 65,536-char message
limit, and non-ASCII expands (each accented letter = 6 chars, each newline `%0A` = 3). Budget: encoded URL <= 2,000 chars
(safe across browsers/WebViews; the practical, not documented, limit). `buildQuoteMessage()` in `integrations/whatsapp/buildMessage.ts` builds the
full text (quote no., one line per item `qty x product, medidas`, transport, total, "adjunto el PDF descargado") and, if `encodeURIComponent(text).length`
(measured with the number prefix included) exceeds 1,800, degrades: item lines collapse to "N productos (ver PDF)", keeping quote number, total, and the
attachment note. Never truncates mid-item. Unit test the threshold with a 30-item cart and accented names. For the share path the text is short (quote no. + total + validity) as the PDF carries the detail.

### 6. File name
`Cotizacion-ALC-20260929-K7QM.pdf`: ASCII only (no accents/ñ/spaces, safe on iOS Files, WhatsApp, Windows), quote number inside, prefix
"Cotizacion" without accent. `File` created with `type:'application/pdf'`. Share `title` = "Cotización ALCUSA ALC-20260929-K7QM" (accented allowed in the
title, not in the name). PDF metadata: Title, Author "ALCUSA", no customer PII in metadata.

### 7. CSP impact (input for S11; no CSP exists today)
No new external origin is needed. Client-side generation adds:
- `script-src 'self'`: the dynamic chunk is same-origin (Astro/Vite emits under `/_astro/`). pdf-lib and fontkit use no `eval`/`new Function`
  (verify in the spike with a strict-CSP page; if fontkit needs `unsafe-eval`, reject and use the jsPDF fallback, not weaken CSP).
- `connect-src 'self'`: the `fetch` of `/fonts/pdf/*.ttf` (and logo image). Nothing else; wa.me is a navigation, not `connect-src`.
- `font-src 'self'` already needed for `@fontsource`; PDF fonts are fetched as data, so `connect-src`, not `font-src`.
- No `blob:` needed for `<a download>` of a Blob URL; add `blob:` to `img-src`/`frame-src` ONLY if a later change adds an in-page preview
  (out of scope: no preview). No Web Worker planned; if one is added later, `worker-src 'self'`.
- `Permissions-Policy`: keep `web-share` allowed for self (default). Do not add `web-share=()` in `.htaccess`.
- Existing S11 note stays: `frame-src https://www.google.com https://maps.google.com` for the map.
- No `form-action` change (no form posts).

## Alternatives considered
- `@react-pdf/renderer`: nicest authoring (JSX) but by far the heaviest and needs polyfills; overkill for one fixed template.
- jsPDF: viable (kept as fallback): active maintenance, but fuller font embedding and a weaker typed API for tables; add `autotable` for tables = more weight.
- Server-side PDF (PHP/Dompdf/TCPDF): rejected. Sends customer data to the server, adds an endpoint, and breaks the "no data leaves the browser" AC.
- `window.print()` / print-to-PDF: no file for `navigator.share`, inconsistent on iOS.
- HTML-to-canvas-to-PDF (html2canvas): text not selectable, big files, blurry: violates AC.
- Sequential quote numbers via counter file/PHP: real backend state for a value that is only a reference; deferred.
- Open wa.me first and rely on user to attach: it is precisely the fallback the user chose for unsupported browsers.

## Consequences
Good: zero server, zero data egress, small lazy chunk, brand-faithful selectable-text PDF, single library boundary with an exit.
Bad: manual layout code; unverified WhatsApp-as-target claim needs device QA; quote numbers are references, not unique records; a small residual
collision probability; extra static assets (fonts) to host; activation handling adds one extra UI state.
Exit path: replace `buildQuotePdf` implementation; if backend numbering is wanted, add PHP counter behind `generateQuoteNumber()`.

## Review gate (architect, R4)
- `import('pdf-lib')` only inside `quotePdf/`, chunk absent from initial /cotizador JS; measured gzip KB recorded against the budgets above.
- No `fetch`/XHR/`sendBeacon` with customer data; network log during PDF build shows only same-origin font/logo GETs.
- `WHATSAPP_NUMBER` single constant; `wa.me` only via `buildWaLink`; `chooseDelivery` has the 3-branch unit test plus NotAllowedError branch.
- PDF total == on-screen total test; file name matches `^Cotizacion-ALC-\d{8}-[0-9A-HJKMNP-TV-Z]{4}\.pdf$`.
- Device checklist executed by QA on iOS Safari, iOS Chrome, Android Chrome, one in-app WebView.

## Nota 2026-09-29 (CR-01)
El §4 (número de cotización sin backend) queda **superado por ADR-010 §4 y ADR-011 §5**: el folio lo emite el servidor (`ALC-AAAAMMDD-XXXXXX`, 6 chars) y el PDF/WhatsApp se generan después de recibirlo, con folio local de contingencia si la API falla. La generación del PDF 100% en el navegador (pdf-lib) no cambia.
