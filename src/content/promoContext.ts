// Contexto promo del cotizador: una cotizacion vive en UN contexto definido por la URL de entrada
// (`?promo=<id>`) -> reglaje de ESA promo (producto/acabado/alto fijos, ancho dentro del rango, precio
// de la promo, sin 10% con tarjeta). Sin param (o id invalido / fuera de vigencia) = contexto normal.
// Puro: sin React/window/node. Los datos salen de promotions.json (ver promoRegistry.ts para el navegador).
import type { AluminumColor, StraightGlass } from '@engine/pricing';
import { PROMO_PARAM, isActive, type Promotion } from './promotionsParser';

export interface PromoContext {
  id: string;
  title: string;
  /** Precio de la promo (instalada en San Salvador y Santa Tecla; otras zonas suman su envio). */
  price: number;
  productId: 'recta';
  color: AluminumColor;
  glass: StraightGlass;
  widthMinCm: number;
  widthMaxCm: number;
  altoM: number;
}

/** null si la promo no define un reglaje completo (producto recta + color + vidrio + quote_rules). */
export function toPromoContext(p: Promotion): PromoContext | null {
  const cp = p.cotizadorParams;
  if (p.productSlug !== 'recta' || !p.quoteRules || !cp?.color || !cp.vidrio) return null;
  return {
    id: p.id,
    title: p.title,
    price: p.ahora,
    productId: 'recta',
    color: cp.color,
    glass: cp.vidrio,
    widthMinCm: p.quoteRules.widthMinCm,
    widthMaxCm: p.quoteRules.widthMaxCm,
    altoM: p.quoteRules.altoM,
  };
}

/** Resuelve la promo vigente con ese id; id invalido, vencida o sin reglaje => null (flujo normal). */
export function resolvePromoContext(
  id: string | null | undefined,
  promotions: readonly Promotion[],
  todayYmd: string,
): PromoContext | null {
  if (!id) return null;
  const p = promotions.find((x) => x.id === id);
  if (!p || !isActive(p, todayYmd)) return null;
  return toPromoContext(p);
}

export function promoIdFromSearch(search: string): string | null {
  const v = new URLSearchParams(search).get(PROMO_PARAM);
  return v && v.trim() !== '' ? v.trim() : null;
}

/** Ancho en metros con 2 decimales ("0.90"). */
const m = (cm: number): string => (cm / 100).toFixed(2);

export function promoWidthRuleCopy(c: Pick<PromoContext, 'widthMinCm' | 'widthMaxCm'>): string {
  return `Esta promoción aplica de ${m(c.widthMinCm)} a ${m(c.widthMaxCm)} m de pared a pared`;
}

export function isPromoWidthOk(c: Pick<PromoContext, 'widthMinCm' | 'widthMaxCm'>, widthCm: number): boolean {
  return Number.isFinite(widthCm) && widthCm >= c.widthMinCm && widthCm <= c.widthMaxCm;
}

/** Banner del wizard bloqueado. */
export const PROMO_BANNER_PREFIX = 'Promoción';
export const PROMO_EXIT_LABEL = 'Cotizar otro modelo sin promoción';
