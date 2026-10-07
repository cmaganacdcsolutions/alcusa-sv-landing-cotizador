// Parser/validador de promociones SIN dependencias de Node (sin `node:fs`, sin JSON importado): lo usan
// el build (promotions.ts) y el script del navegador (components/promotionsRuntime.ts). Sigue el contrato
// publico de ADR-011 §4 / ADR-014 (`/api/promotions.json`, publicado por el panel admin).
// Datos invalidos lanzan PromotionsDataError con mensaje claro.
import { findBySlug } from './catalog';
import type { AluminumColor, StraightGlass } from '@engine/pricing';
import { buildCotizadorHref } from './catalogHome';
import { cotizadorHref, toColorParam, toGlassParam } from './deepLink';

/** Acabados que la promo deja preseleccionados en el cotizador (ambos opcionales). */
export interface PromotionCotizadorParams {
  color?: AluminumColor;
  vidrio?: StraightGlass;
}

export interface Promotion {
  id: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  /** Precio anterior; null = promo sin precio anterior ("Precio especial"). */
  antes: number | null;
  ahora: number;
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  productSlug: string;
  /** Acabados preseleccionados en el cotizador (`color` y/o `vidrio`); ausente = solo el producto. */
  cotizadorParams?: PromotionCotizadorParams;
  rules: readonly string[];
  placeholder: boolean;
}

export class PromotionsDataError extends Error {
  constructor(errors: readonly string[]) {
    super(`promotions.json invalido:\n - ${errors.join('\n - ')}`);
    this.name = 'PromotionsDataError';
  }
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const isRec = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isPrice = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isRealDate = (s: string): boolean =>
  YMD.test(s) &&
  !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) &&
  new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Valida y mapea el contrato ADR-011 (snake_case) al modelo de la UI. */
export function parsePromotions(
  input: unknown,
  slugExists: (slug: string) => boolean = (s) => findBySlug(s) !== null,
): Promotion[] {
  const errors: string[] = [];
  const list = isRec(input) ? input.promotions : undefined;
  if (!Array.isArray(list)) throw new PromotionsDataError(['falta el arreglo "promotions"']);
  const seen = new Set<string>();
  const out: Promotion[] = [];
  list.forEach((item: unknown, i: number) => {
    const label = isRec(item) && isStr(item.id) ? ` (${item.id})` : '';
    const at = (m: string) => errors.push(`promotions[${i}]${label}: ${m}`);
    if (!isRec(item)) return at('no es un objeto');
    const n = errors.length;
    for (const k of ['id', 'title', 'description', 'image', 'image_alt', 'product_slug'] as const) {
      if (!isStr(item[k])) at(`"${k}" es obligatorio (texto)`);
    }
    if (isStr(item.id)) {
      if (seen.has(item.id)) at('id duplicado');
      seen.add(item.id);
    }
    if (!isPrice(item.price_promo)) at('"price_promo" debe ser un numero > 0');
    const before = item.price_before ?? null;
    if (before !== null && !isPrice(before)) at('"price_before" debe ser un numero > 0 o null');
    if (isPrice(before) && isPrice(item.price_promo) && item.price_promo >= before) {
      at('"price_promo" debe ser menor que "price_before"');
    }
    for (const k of ['starts_on', 'ends_on'] as const) {
      const v = item[k];
      if (typeof v !== 'string' || !isRealDate(v)) at(`"${k}" debe ser una fecha YYYY-MM-DD valida`);
    }
    if (
      typeof item.starts_on === 'string' &&
      typeof item.ends_on === 'string' &&
      item.starts_on > item.ends_on
    ) {
      at('"starts_on" no puede ser posterior a "ends_on"');
    }
    if (isStr(item.product_slug) && !slugExists(item.product_slug)) {
      at(`"product_slug" "${item.product_slug}" no existe en el catalogo`);
    }
    let cotizadorParams: PromotionCotizadorParams | undefined;
    if (item.cotizador_params !== undefined) {
      const cp = item.cotizador_params;
      if (!isRec(cp)) at('"cotizador_params" debe ser un objeto');
      else {
        const params: PromotionCotizadorParams = {};
        if (cp.color !== undefined) {
          const color = typeof cp.color === 'string' ? toColorParam(cp.color) : null;
          if (color === null) at('"cotizador_params.color" no es un color conocido (natural, blanco o bronce)');
          else params.color = color;
        }
        if (cp.vidrio !== undefined) {
          const vidrio = typeof cp.vidrio === 'string' ? toGlassParam(cp.vidrio) : null;
          if (vidrio === null) at('"cotizador_params.vidrio" no es un vidrio conocido');
          else params.vidrio = vidrio;
        }
        if (params.color || params.vidrio) cotizadorParams = params;
      }
    }
    const rules = item.rules ?? [];
    if (!Array.isArray(rules) || !rules.every((r) => typeof r === 'string')) {
      at('"rules" debe ser un arreglo de textos');
    }
    if (errors.length > n) return;
    out.push({
      id: item.id as string,
      title: item.title as string,
      description: item.description as string,
      image: item.image as string,
      imageAlt: item.image_alt as string,
      antes: before as number | null,
      ahora: item.price_promo as number,
      desde: item.starts_on as string,
      hasta: item.ends_on as string,
      productSlug: item.product_slug as string,
      ...(cotizadorParams ? { cotizadorParams } : {}),
      rules: rules as string[],
      placeholder: item.placeholder === true,
    });
  });
  if (errors.length) throw new PromotionsDataError(errors);
  return out;
}

/** (antes - ahora) / antes, redondeado. null sin precio anterior o si da 0. */
export function discountPct(p: Pick<Promotion, 'antes' | 'ahora'>): number | null {
  if (p.antes === null || p.antes <= p.ahora) return null;
  const pct = Math.round(((p.antes - p.ahora) / p.antes) * 100);
  return pct > 0 ? pct : null;
}

/** Ahorro = antes - ahora; null sin precio anterior. */
export function savings(p: Pick<Promotion, 'antes' | 'ahora'>): number | null {
  return p.antes === null || p.antes <= p.ahora ? null : Math.round((p.antes - p.ahora) * 100) / 100;
}

/** Vigente si desde <= hoy <= hasta (string compare YYYY-MM-DD, ADR-008 §5). */
export function isActive(p: Pick<Promotion, 'desde' | 'hasta'>, todayYmd: string): boolean {
  return p.desde <= todayYmd && todayYmd <= p.hasta;
}

export function activePromotions<T extends Pick<Promotion, 'desde' | 'hasta'>>(
  all: readonly T[],
  todayYmd: string,
): T[] {
  return all.filter((p) => isActive(p, todayYmd));
}

/** Fecha de hoy en El Salvador como YYYY-MM-DD. */
export function todayInSV(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** "Vigente hasta el 31 de octubre" (copy del board). */
export function vigenciaLabel(hastaYmd: string): string {
  const [, m, d] = hastaYmd.split('-').map(Number);
  return `Vigente hasta el ${d} de ${MONTHS[m - 1]}`;
}

/** $1,260 (separador de miles como en el board r02). */
export function formatUsd(n: number): string {
  return `$${Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(2)}`;
}

/**
 * Enlace del CTA "Cotizar esta promo". Con acabados (`color`/`vidrio`) usa el mismo contrato que las
 * tarjetas del inicio (`buildCotizadorHref`): `/cotizador?producto=<slug>&paso=medidas&color=<c>&vidrio=<v>`,
 * es decir, cae directo en Medidas con producto y acabados elegidos (el cliente solo escribe la medida).
 * Sin acabados no hay nada que preseleccionar: se conserva `?producto=<slug>` (contrato previo).
 */
export function promoHref(p: Pick<Promotion, 'productSlug' | 'cotizadorParams'>): string {
  const { color, vidrio } = p.cotizadorParams ?? {};
  if (!color && !vidrio) return cotizadorHref(p.productSlug);
  return buildCotizadorHref(p.productSlug, { color, vidrio });
}

/**
/** Decision de Carlos (2026-09-30): la landing muestra como maximo 3 promos vigentes. */
export const MAX_PROMOS = 3;

/** Vigentes hoy (`todayYmd`, hora SV) y como maximo MAX_PROMOS. Misma regla en build y en el navegador. */
export function selectActivePromotions<T extends Pick<Promotion, 'desde' | 'hasta'>>(
  all: readonly T[],
  todayYmd: string,
): T[] {
  return activePromotions(all, todayYmd).slice(0, MAX_PROMOS);
}

/** Endpoint publico que publica el panel admin (nginx lo sirve; ADR-014 §A5). */
export const PROMOTIONS_ENDPOINT = '/api/promotions.json';

/** Textos de la seccion (una sola fuente para el HTML del build y el re-render del navegador). */
export const PROMOS_COPY = {
  kicker: 'PROMOCIONES DEL MES',
  titleSingle: 'Una oferta que puedes aprovechar hoy',
  titleMany: 'Ofertas que puedes aprovechar hoy',
  sub: 'Precios especiales por tiempo limitado.',
  subMobileMany: 'Precios especiales por tiempo limitado. Desliza para ver más.',
} as const;

export function promosTitle(count: number): string {
  return count === 1 ? PROMOS_COPY.titleSingle : PROMOS_COPY.titleMany;
}

/**
 * Imagenes aceptadas en runtime: solo mismo origen y solo estas dos carpetas
 * (`/media/promos/` = subidas del admin, `/images/promos/` = las del build). Nada de hosts externos,
 * `//host`, `..`, esquemas ni backslashes.
 */
const SAFE_PROMO_IMAGE = /^\/(?:media|images)\/promos\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
export function isSafePromoImage(url: string): boolean {
  return SAFE_PROMO_IMAGE.test(url) && !url.includes('..');
}

/** srcset 600w/900w cuando la imagen sigue la convencion `<clave>-900.webp` (la del sitio y la del admin). */
export function promoImageSrcSet(image: string): string | undefined {
  return /-900\.webp$/.test(image) ? `${image.replace(/-900\.webp$/, '-600.webp')} 600w, ${image} 900w` : undefined;
}

export const PROMO_IMAGE_SIZES = '(min-width: 900px) 376px, 360px';
