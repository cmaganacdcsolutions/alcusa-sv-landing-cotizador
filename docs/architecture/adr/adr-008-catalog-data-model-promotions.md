# ADR-008: Shared catalog data model, slugs, static routes and promotions (R1)

Date: 2026-09-29
Status: proposed (client review 2026-09-29; becomes accepted on approval)

## Context
Today `src/content/catalog.ts` exports `CATALOG_PRODUCTS`: 6 flat items keyed by
`ProductId` (`recta|l|templado|bisagra|jardin|ventana`), each with a hand-written
`fromPrice` guarded by `catalog.test.ts` against `engine/pricing/*`. Cotizador Step 0,
the landing grid, Step4/Step5 and `order.test.ts` read it; `?producto=<ProductId>` is
already parsed in `Cotizador.tsx` (`productIdFromSearch`). The 2026-09-29 review
(R1/R2/R3/R5) needs a 3-level taxonomy (category > subcategory > variant), per-subcategory
deep links, static `/catalogo` pages and a promotions block on the landing. One model must
feed landing, `/catalogo`, cotizador and the WhatsApp advisor path, and prices must never
drift from the pricing engine.

Constraints: static Astro site (ADR-001/002), no backend, landing JS budget 40 KB gzip
(README NFR), `zod` is not a dependency, El Salvador is UTC-6 with no DST.

## Decision

### 1. Types (`src/content/catalog.ts`: pure data + pure helpers, no React/DOM)
```ts
export type CategorySlug = 'puertas-de-bano' | 'puertas-de-jardin' | 'ventanas';
/** Which pricing-engine model a leaf uses. Reuses today's ProductId. */
export type QuoterModel = ProductId; // 'recta'|'l'|'templado'|'bisagra'|'jardin'|'ventana'

/** Fixed engine inputs a slug preselects. Only keys the store already has. */
export interface QuoterPreset {
  cornerFinish?: 'aquaclara' | 'frosted' | 'aquafold'; // model 'l'
  gardenHojas?: 1 | 2 | 3;                              // model 'jardin'
  windowType?: 'francesa' | 'bilbao';                   // model 'ventana'
}

type Priced  = { quoterModel: QuoterModel; preset?: QuoterPreset; fromPrice: number; advisorOnly?: false };
type Advisor = { advisorOnly: true; quoterModel?: never; fromPrice?: never };   // XOR enforced by the type

export type Variant = { slug: string; name: string; photo?: string } & (Priced | Advisor);
export type Subcategory = {
  slug: string; name: string; description?: string; photo?: string; altoText?: string;
  group?: string;                       // e.g. 'mas-opciones' (UI grouping only)
} & (Priced | Advisor | { variants: readonly Variant[]; quoterModel?: never; advisorOnly?: never; fromPrice?: never });
export interface Category { slug: CategorySlug; name: string; blurb?: string; photo?: string; subcategories: readonly Subcategory[] }

export const CATEGORIES: readonly Category[]; // array order == display order
```
Rules
- A leaf (a subcategory without `variants`, or a variant) has EXACTLY one of `quoterModel`
  or `advisorOnly: true` (compile-time via the union, re-asserted by the integrity test).
- A subcategory with `variants` stores no price; `subFromPrice()` = min of its priced variants.
- `advisorOnly` leaves have no price field at all, so a `$` cannot be rendered by accident.
- Helpers next to the data (pure, unit-tested): `allLeaves()`, `findBySlug(slug)`
  (category | subcategory | variant), `resolveDeepLink(slug)`, `subFromPrice()`.
- `CATALOG_PRODUCTS` is NOT deleted in R1. It becomes a derived view of `CATEGORIES`
  so Hero, `Catalogo.astro`, Step0/4/5 and `order.test.ts` keep compiling until R3/R5
  migrate them; remove it in R5. `catalog.test.ts` keeps its guard and gains the ones below.

### 2. Canonical taxonomy, slugs and engine mapping
Slugs: lowercase ASCII kebab-case, unique across ALL levels (one `?producto=` namespace),
IMMUTABLE once published (URLs, WhatsApp links and promos reference them). A rename keeps
the old slug in `SLUG_ALIASES`.

| Category (slug) | Subcategory (slug) | Variant (slug) | quoterModel + preset | Engine status |
|---|---|---|---|---|
| Puertas de baño (`puertas-de-bano`) | Templada 10 mm (`templada-10mm`) | | `templado` | PRICED |
| | Rectas (`recta`) | | `recta` | PRICED |
| | En L (`en-l`) | Aquaclara (`l-aquaclara`) | `l` + `cornerFinish:aquaclara` | PRICED (base 444) |
| | | Frosted (`l-frosted`) | `l` + `frosted` | PRICED (580) |
| | | Aquafold (`l-aquafold`) | `l` + `aquafold` | PRICED (650) |
| | Bisagra (`bisagra`) | | `bisagra` | PRICED |
| Puertas de jardín (`puertas-de-jardin`) | 1 hoja corrediza (`jardin-1-hoja`) | | `jardin` + `gardenHojas:1` | PRICED (promo band 410) |
| | 2 hojas corredizas (`jardin-2-hojas`) | | `jardin` + `gardenHojas:2` | PRICED (819) |
| | 3 hojas corredizas (`jardin-3-hojas`) | | `jardin` + `gardenHojas:3` | PRICED (1229) |
| | Más opciones: 2 fijas + 2 corredizas (`jardin-2-fijas-2-corredizas`) | | none | ADVISOR ONLY |
| | Más opciones: 1 fijo + 3 corredizas (`jardin-1-fijo-3-corredizas`) | | none | ADVISOR ONLY |
| Ventanas (`ventanas`) | Francesa (`ventana-francesa`) | | `ventana` + `windowType:francesa` | PRICED (135/m2, min 0.8 m2) |
| | Bilbao (`ventana-bilbao`) | | `ventana` + `windowType:bilbao` | PRICED (192/m2, min 0.8 m2) |

"Más opciones para tu jardín" is a UI grouping (R2 renders a heading over the two combos),
modeled with `group:'mas-opciones'` on two ordinary subcategories, not as a nested level.

Verification (read-only, against the code): `CORNER_BASE` has the 3 finishes;
`GARDEN_PROMO_BANDS` has tiers 1/2/3 and `priceGarden` takes `hojas: 1|2|3|'custom'`;
`WINDOW_RATE` has francesa/bilbao; straight/tempered/hinged modules exist. NO pricing
exists for the mixed fixed+sliding garden combos. `hojas:'custom'` is "A la medida" by m2
and must NOT be reused to price them (it would invent a price; Q9 is open). Result: exactly
2 advisorOnly leaves today. If ALCUSA supplies prices (Q8/Q9), add an engine module and a
`quoterModel` value and drop `advisorOnly`; nothing else changes.

`fromPrice` for a priced leaf = engine output at the minimum valid measures with default
color/glass, computed by the test through `engine/pricing` (never a copy of the tables).
Existing literals kept: recta 222, l 444, templado 672, bisagra 253. Do NOT copy the old
ventana 108 to both windows: Francesa and Bilbao have different rates (135 vs 192/m2),
the test sets each value. Jardin 410/819/1229 are the promo-band prices; the test confirms
them at engine output for the minimum width and the default height.

### 3. Deep link `/cotizador?producto=<slug>`
- Accepts any leaf, subcategory or variant slug and (from R5) a category slug.
  `resolveDeepLink` returns `quoterModel` + `preset`; the island dispatches the existing
  product-select action, applies the preset keys and advances to Medidas. A category slug
  lands on Step 0 with that category open.
- Legacy ids stay valid through `SLUG_ALIASES`: `l->en-l`, `templado->templada-10mm`,
  `jardin->puertas-de-jardin`, `ventana->ventanas`, `recta`/`bisagra` identity. Old links,
  current landing cards and existing e2e keep working.
- Unknown slug: ignored, Step 0 as usual, no console error (R1 AC).
- `advisorOnly` slug: never enters the wizard; shows "Cotiza con asesor" with a WhatsApp link
  built ONLY by `buildWaLink()` (ADR-004) plus a new `buildAdvisorMessage(productName)` in
  `integrations/whatsapp/buildMessage.ts` (snapshot-tested, no price).
- Pure parser in `src/content/deepLink.ts` (no `window`); the island passes `location.search`.

### 4. Static routes (`getStaticPaths`)
```
src/pages/catalogo/index.astro                       -> 3 category cards
src/pages/catalogo/[categoria]/index.astro           -> subcategories in array order
src/pages/catalogo/[categoria]/[subcategoria].astro  -> detail + variants + CTA
```
Each `getStaticPaths()` maps `CATEGORIES` (then `subcategories`): `params` = slugs, `props` =
the typed object, so pages hold no product data. Variants have NO route; they render inside
the subcategory detail (En L shows the 3 finishes) and are reachable by deep link. Output:
1 + 3 + 11 = 15 static pages. Check `build.format`/`trailingSlash` and the `.htaccess`
directory handling from ADR-002 before R2. Legacy `/#catalogo` and `/#galeria` fragments
cannot be redirected server-side; R3 does it with a tiny inline script.

### 5. Promotions: `src/content/promotions.ts` (typed TS module), not an Astro content collection
```ts
export interface Promotion {
  id: string;            // stable, unique
  title: string; blurb?: string; photo?: string;
  productSlug: string;   // any slug findBySlug() resolves; CTA -> /cotizador?producto=<slug> or detail
  precioAntes: number;   // shown struck through
  precioPromo: number;   // EXPLICIT, never computed
  desde: string;         // 'YYYY-MM-DD' inclusive, El Salvador date
  hasta: string;         // 'YYYY-MM-DD' inclusive, El Salvador date
}
export const PROMOTIONS: readonly Promotion[];
export function todayInSV(now = new Date()): string; // now.toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' })
export function isActive(p: Promotion, todayYmd: string): boolean; // desde <= today <= hasta (string compare)
export function activePromotions(all: readonly Promotion[], todayYmd: string): Promotion[];
```
Why a TS module: fewer than 10 rows edited by developers, no `zod`/loader layer to add, and the
integrity test must import the data next to the engine in Vitest. Dates are plain strings,
which avoids the `new Date('2026-10-31')` UTC-parse bug. A collection becomes worthwhile only
if a non-developer must edit promos: move the array to `src/content/promotions/*.json` with
`glob()`, and the `Promotion` type is the schema.

Vigencia filtering. RECOMMENDATION: filter in BOTH build and client, because the site is static.
1. Build: `Promotions.astro` renders `activePromotions(PROMOTIONS, todayInSV())`. An expired
   promo is never in the HTML of a fresh deploy. Zero active = the block is not rendered and
   the CTA to `/catalogo` stays (R3 AC).
2. Client: each `<article>` carries `data-desde` / `data-hasta`. A ~300 B inline `<script>`
   computes today in `America/El_Salvador`, removes inactive articles and removes the section if
   none remain. This covers the gap between expiry and the next deploy, and a promo whose `desde`
   is still in the future. It is not a React island: an island just to compare dates would spend
   part of the 40 KB landing budget on 15 lines of logic.
Residual risk: with JS disabled, a promo that expired after the last deploy stays visible.
Accepted; logged in tech-debt (trigger: any promo with a legal hard end date, then add a
scheduled/manual redeploy the day after). Operational rule: redeploy the morning after a promo ends.

Integrity test (`promotions.test.ts`, fixed "today"): unique ids; `desde <= hasta`; `productSlug`
resolves; `precioPromo < precioAntes`; when the slug is a priced leaf, compare `precioPromo` with
the engine result for the promo's stated case and flag a contradiction (R3 AC); fixture of
3 promos (2 active, 1 expired). The shipped file contains only what the client provides
(or is empty); no invented prices.

## Alternatives considered
- Keep 6 flat products plus filters: cannot express En L finishes, hojas or the approved taxonomy.
- JSON + zod content collections for the catalog: prices are guarded from the engine in TS; splitting
  adds a build layer for no editor and adds a dependency.
- `fromPrice` computed at build from the engine: a better single source of truth, but it ties slug data to
  engine defaults. Kept as stored literal + test guard (existing pattern). Revisit if literals drift twice.
- A route per variant: three near-identical thin pages and more R0 boards.
- `?producto=` limited to `ProductId`: cannot preselect 2 vs 3 hojas or a finish.

## Consequences
Good: one model for landing, catalogo, cotizador and WhatsApp; the type-level XOR prevents a price on an
advisor product; deep links survive R5; promos cannot silently contradict the engine.
Bad: verbose union types; the `CATALOG_PRODUCTS` shim lives until R5; the client date filter is a second
place that knows promo rules (mitigation: it reuses the same `YYYY-MM-DD` string comparison and is covered
by an e2e with a mocked date). Exit path: slugs are the stable contract; storage (TS, JSON, CMS) can change
behind `CATEGORIES` / `PROMOTIONS`.

## Review gate (architect, R1/R2/R3/R5)
- No product name or price literals outside `content/*` (grep components).
- Every leaf has exactly one of quoterModel/advisorOnly; slugs unique; test derives `fromPrice` through the engine.
- `wa.me` still only in `waLink.ts`.
- Landing bundle stays <= 40 KB gzip (promo filter is an inline script).

## Nota 2026-09-29 (CR-01)
El §5 (Promociones) queda **parcialmente superado por ADR-010/ADR-011**: `src/content/promotions.ts` pasa a ser semilla/fallback del build; la fuente de verdad son las promociones de la BD publicadas como `/api/promotions.json` (ADR-011 §4). El resto del catálogo sigue estático y este ADR no cambia.
