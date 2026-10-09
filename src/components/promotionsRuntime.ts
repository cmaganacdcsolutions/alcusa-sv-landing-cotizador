// Refresco en runtime de la seccion de promociones (ADR-011 §4 opcion C / ADR-014 A5).
// El HTML horneado en build es el respaldo (SEO, sin JS, falla del fetch). Al cargar, el navegador pide
// /api/promotions.json (el archivo que publica el panel admin), lo valida con el MISMO parser que el build,
// filtra por vigencia (hoy en El Salvador) y deja a lo mas 3 promos. Si algo falla, no toca nada.
//
// Seguridad: todo dato remoto entra por DOM APIs (`textContent`, `setAttribute`, nodos de texto); nunca
// `innerHTML`. Las imagenes solo pueden ser rutas del mismo origen (/media/promos/ o /images/promos/).
import {
  PROMOS_COPY,
  PROMOTIONS_ENDPOINT,
  PROMO_IMAGE_SIZES,
  discountPct,
  formatUsd,
  isSafePromoImage,
  parsePromotions,
  promoHref,
  promoImageSrcSet,
  promosTitle,
  savings,
  selectActivePromotions,
  todayInSV,
  vigenciaLabel,
  type Promotion,
} from '@content/promotionsParser';
import { ambientThumbSrc } from '../lib/photo-ambient';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FETCH_TIMEOUT_MS = 8000;

type Attrs = Readonly<Record<string, string | undefined>>;
type Child = Node | string;

function apply(node: Element, attrs: Attrs): void {
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, v);
}

/** Crea un elemento HTML; los hijos de tipo texto se agregan como nodos de texto (nunca se parsean). */
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  apply(node, attrs);
  node.append(...children);
  return node;
}

function svg(size: string, paths: readonly Attrs[]): SVGSVGElement {
  const node = document.createElementNS(SVG_NS, 'svg');
  apply(node, { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true' });
  for (const p of paths) {
    const { tag, ...rest } = p;
    const child = document.createElementNS(SVG_NS, tag ?? 'path');
    apply(child, rest);
    node.append(child);
  }
  return node;
}

/** Mismo marco que components/PhotoFrame.tsx (4:5, contain + capa ambiental), construido con DOM APIs. */
function photoFrame(p: Promotion, badge: HTMLElement | null): HTMLElement {
  const common = {
    src: p.image,
    srcset: promoImageSrcSet(p.image),
    sizes: PROMO_IMAGE_SIZES,
    width: '900',
    height: '1600',
    loading: 'lazy',
    decoding: 'async',
  } as const;
  // Capa ambiental: miniatura horneada derivada por convencion (sin blur en vivo); sin ella, color solido.
  const thumb = ambientThumbSrc(p.image);
  const ambient = thumb
    ? h('img', {
        class: 'photo-frame__ambient photo-frame__ambient--baked',
        src: thumb,
        alt: '',
        'aria-hidden': 'true',
        loading: 'lazy',
        decoding: 'async',
      })
    : h('span', { class: 'photo-frame__ambient photo-frame__ambient--solid', 'aria-hidden': 'true' });
  const main = h('img', { class: 'photo-frame__img', ...common, alt: p.imageAlt });
  return h(
    'div',
    { class: 'photo-frame promo-card__photo', style: 'aspect-ratio:4/5', 'data-ratio': '4/5' },
    ambient,
    main,
    ...(badge ? [badge] : []),
  );
}

/** Tarjeta de promo: espejo de components/Promotions.astro (si cambia una, cambia la otra; lo guarda el e2e). */
export function buildPromoCard(p: Promotion): HTMLElement {
  const pct = discountPct(p);
  const ahorro = savings(p);
  const badge = pct !== null ? h('span', { class: 'promo-card__badge' }, `−${pct}%`) : null;
  const antes =
    p.antes !== null
      ? h(
          'span',
          { class: 'promo-card__antes' },
          h('span', { class: 'sr-only' }, 'Precio anterior '),
          h('s', {}, `Antes ${formatUsd(p.antes)}`),
        )
      : h('span', { class: 'promo-card__antes' }, 'Precio especial');
  const bandRow = h('div', { class: 'promo-card__band-row' }, antes);
  if (ahorro !== null && pct !== null) bandRow.append(h('span', { class: 'promo-card__ahorras' }, `Ahorras ${formatUsd(ahorro)}`));

  const text = h(
    'div',
    { class: 'promo-card__text' },
    h('h3', { class: 'promo-card__title', title: p.title }, p.title),
    h('p', { class: 'promo-card__desc' }, p.description),
  );
  if (p.rules.length > 0) {
    text.append(h('ul', { class: 'promo-card__rules' }, ...p.rules.map((r) => h('li', {}, r))));
  }
  text.append(
    h(
      'span',
      { class: 'promo-card__chip' },
      svg('14', [
        { tag: 'rect', x: '4', y: '5.5', width: '16', height: '14', rx: '3' },
        { d: 'M4 10h16M8.5 3.5v4M15.5 3.5v4' },
      ]),
      vigenciaLabel(p.hasta),
    ),
  );

  const cta = h(
    'a',
    { class: 'promo-card__cta', href: promoHref(p), 'data-promo-cta': '' },
    'Cotizar esta promo',
    svg('16', [{ d: 'M5 12h14M13 6l6 6-6 6' }]),
  );

  return h(
    'article',
    { class: 'promo-card', role: 'listitem', 'data-promo-id': p.id },
    photoFrame(p, badge),
    h('div', { class: 'promo-card__band' }, bandRow, h('span', { class: 'promo-card__ahora' }, `Ahora ${formatUsd(p.ahora)}`)),
    h('div', { class: 'promo-card__body' }, text, h('div', { class: 'promo-card__cta-slot' }, cta)),
  );
}

function buildWrap(promos: readonly Promotion[]): HTMLElement {
  const single = promos.length === 1;
  const titleRow = h(
    'div',
    { class: 'promos__title-row' },
    h('h2', { id: 'promo-t', class: 'promos__title title-gradient' }, promosTitle(promos.length)),
    h('p', { class: 'promos__sub promos__sub--desktop' }, PROMOS_COPY.sub),
  );
  if (!single) titleRow.append(h('p', { class: 'promos__sub promos__sub--mobile' }, PROMOS_COPY.subMobileMany));
  return h(
    'div',
    { class: 'promos__wrap' },
    h('div', { class: 'promos__head' }, h('p', { class: 'promos__kicker' }, PROMOS_COPY.kicker), titleRow),
    h('div', { class: 'promos__list', role: 'list' }, ...promos.map(buildPromoCard)),
  );
}

/** Enlaces de la portada a la seccion; se ocultan si la lista de runtime queda vacia. */
function toggleIntroLink(visible: boolean): void {
  const link = document.querySelector<HTMLElement>('.hintro__link');
  if (!link) return;
  link.hidden = !visible;
  link.style.display = visible ? '' : 'none'; // la clase del enlace fija `display`, que le gana al atributo hidden
}

/**
 * Pinta `promos` en la seccion existente. Lista vacia = la seccion se oculta (`hidden`, sigue en el DOM,
 * 0 px y sin gap). Con datos se muestra, aunque el build no hubiera horneado ninguna.
 */
export function renderPromotions(section: HTMLElement, promos: readonly Promotion[]): void {
  section.dataset.runtime = 'applied'; // marca de depuracion/e2e: el refresco de runtime se aplico
  if (promos.length === 0) {
    section.hidden = true;
    section.setAttribute('data-count', '0');
    section.replaceChildren(h('div', { class: 'promos__wrap' }));
    toggleIntroLink(false);
    return;
  }
  const scrollLeft = section.querySelector<HTMLElement>('.promos__list')?.scrollLeft ?? 0;
  section.replaceChildren(buildWrap(promos));
  section.setAttribute('data-count', String(promos.length));
  section.setAttribute('aria-labelledby', 'promo-t');
  section.hidden = false;
  const list = section.querySelector<HTMLElement>('.promos__list');
  if (list && scrollLeft > 0) list.scrollLeft = scrollLeft;
  toggleIntroLink(true);
}

/**
 * Valida el JSON publicado con el parser del sitio y deja las promos vigentes hoy (max. 3).
 * `null` = JSON invalido o imagen fuera de las rutas permitidas: el llamador conserva el HTML horneado.
 */
export function resolveRuntimePromotions(payload: unknown, todayYmd: string): Promotion[] | null {
  let parsed: Promotion[];
  try {
    parsed = parsePromotions(payload);
  } catch {
    return null;
  }
  if (!parsed.every((p) => isSafePromoImage(p.image))) return null;
  return selectActivePromotions(parsed, todayYmd);
}

/** Pide el JSON publicado. `null` ante cualquier falla (red, HTTP no-OK, cuerpo vacio o invalido). */
export async function fetchRuntimePromotions(
  fetcher: typeof fetch = fetch,
  todayYmd: string = todayInSV(),
): Promise<Promotion[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetcher(PROMOTIONS_ENDPOINT, { cache: 'no-cache', signal: ctrl.signal });
    if (!res.ok) return null;
    return resolveRuntimePromotions((await res.json()) as unknown, todayYmd);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function initPromotionsRuntime(): Promise<void> {
  const section = document.getElementById('promociones');
  if (!section) return;
  const promos = await fetchRuntimePromotions();
  if (promos) renderPromotions(section, promos);
  else section.dataset.runtime = 'fallback'; // se conserva el HTML horneado
}
