// F4 (ADR-012 §3): reconstruye el carrito desde una QuoteLoadResponse,
// RECALCULA con el motor actual (nunca se cobra el precio guardado) y arma la
// lista de cambios para el aviso de Resumen. Puro: sin React/window.
import type { CatalogProduct, ProductId } from '@content/catalog';
import { CATALOG_PRODUCTS, findBySlug } from '@content/catalog';
import { isPromoWidthOk, type PromoContext } from '@content/promoContext';
import { getZoneFee } from '@engine/pricing/zoneFee';
import type { QuoteLoadResponse } from '@integrations/quotes/types';
import {
  COLOR_LABELS,
  CORNER_MODEL_LABELS,
  GLASS_LABELS,
  ITEM_FIELD_KEYS,
  initialCotizadorState,
  type CartItem,
  type CotizadorState,
  type Entrega,
} from './cotizadorStore';
import { GARDEN_HOJAS_LABELS, WINDOW_GLASS_LABELS, WINDOW_MODEL_LABELS } from './labels';
import { buildOrderItems, orderTotal } from './order';
import { lookupActivePromo } from './promoRegistry';

/** Version del snapshot (`ITEM_FIELD_KEYS`) que este FE entiende (ADR-012 §2). */
export const SUPPORTED_CONFIG_SCHEMA_VERSION = 1;

export type QuoteChange =
  | { kind: 'price_changed'; name: string; before: number; after: number }
  | { kind: 'promo_expired'; name: string }
  | { kind: 'discontinued'; name: string }
  | { kind: 'unsupported'; name: string };

export interface QuoteLoadNotice {
  code: string;
  createdAt: string;
  validUntil: string;
  expired: boolean;
  changes: QuoteChange[];
  totalBefore: number;
  totalAfter: number;
}

export interface AppliedQuote {
  items: CartItem[];
  entrega: Entrega;
  zone: string;
  /** Promo vigente restaurada (cotizacion de una sola promo); null = contexto normal. */
  promoId: string | null;
  notice: QuoteLoadNotice;
}

const PRODUCT_IDS: ReadonlySet<string> = new Set(CATALOG_PRODUCTS.map((p) => p.id));
const ENUMS: Readonly<Record<string, ReadonlySet<string | number>>> = {
  color: new Set(Object.keys(COLOR_LABELS)),
  glass: new Set(Object.keys(GLASS_LABELS)),
  cornerModel: new Set(Object.keys(CORNER_MODEL_LABELS)),
  windowModel: new Set(Object.keys(WINDOW_MODEL_LABELS)),
  windowFrame: new Set(Object.keys(COLOR_LABELS)),
  windowGlass: new Set(Object.keys(WINDOW_GLASS_LABELS)),
  gardenHojas: new Set(Object.keys(GARDEN_HOJAS_LABELS).map(Number)),
  gardenColor: new Set(Object.keys(COLOR_LABELS)),
  gardenGlass: new Set(Object.keys(GLASS_LABELS)),
  gardenHeightOption: new Set(['2.10', '2.40', 'otra']),
};

export type ParsedItem =
  | { ok: true; fields: Omit<CartItem, 'id'> }
  | { ok: false; reason: 'discontinued' | 'unsupported' };

/** Valida `config` contra la forma actual de CartItem. Nunca lanza. */
export function parseLoadedItem(item: QuoteLoadResponse['items'][number]): ParsedItem {
  const cfg = item.config;
  const productId = cfg.productId;
  if (typeof productId !== 'string' || !PRODUCT_IDS.has(productId) || !findBySlug(item.productSlug)) {
    return { ok: false, reason: 'discontinued' };
  }
  if (item.configSchemaVersion !== SUPPORTED_CONFIG_SCHEMA_VERSION) return { ok: false, reason: 'unsupported' };
  const out: Record<string, unknown> = { productId };
  for (const key of ITEM_FIELD_KEYS) {
    if (key === 'productId') continue;
    const fallback = initialCotizadorState[key];
    const value = cfg[key] === undefined ? fallback : cfg[key];
    if (key === 'windowRows') {
      const okRows =
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((r) => {
          const row = r as Record<string, unknown>;
          return ['id', 'qty', 'widthM', 'heightM'].every((k) => typeof row[k] === 'string');
        });
      if (!okRows) return { ok: false, reason: 'unsupported' };
    } else if (typeof value !== typeof fallback) {
      return { ok: false, reason: 'unsupported' };
    } else if (ENUMS[key] && !ENUMS[key].has(value as string | number)) {
      return { ok: false, reason: 'unsupported' };
    }
    out[key] = value;
  }
  return { ok: true, fields: out as Omit<CartItem, 'id'> };
}

const nameOf = (id: ProductId, products: readonly CatalogProduct[]): string =>
  products.find((p) => p.id === id)?.name ?? id;

export interface ApplyOptions {
  products?: readonly CatalogProduct[];
  /** Hoy ninguna promo se aplica en el motor: una `promoRef` guardada se da por vencida. */
  isPromoActive?: (ref: string) => boolean;
  /** Promo vigente por id (default: registro del build). Si resuelve, la cotizacion vuelve al contexto promo. */
  resolvePromo?: (id: string) => PromoContext | null;
  makeId?: (index: number) => string;
}

export function applyLoadedQuote(res: QuoteLoadResponse, opts: ApplyOptions = {}): AppliedQuote {
  const products = opts.products ?? CATALOG_PRODUCTS;
  const resolvePromo = opts.resolvePromo ?? lookupActivePromo;
  const isPromoActive = opts.isPromoActive ?? ((): boolean => false);
  const makeId = opts.makeId ?? ((i: number): string => `item-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const entrega: Entrega = res.delivery.mode === 'delivery' ? 'instalacion' : 'retiro';
  const zone = entrega === 'instalacion' ? (res.delivery.zone ?? '') : '';

  const changes: QuoteChange[] = [];
  const kept: { item: CartItem; saved: number; promoRef: string | null }[] = [];
  res.items.forEach((it, i) => {
    const parsed = parseLoadedItem(it);
    if (!parsed.ok) {
      changes.push({ kind: parsed.reason, name: it.description });
      return;
    }
    kept.push({ item: { ...parsed.fields, id: makeId(i) }, saved: it.savedLineTotal, promoRef: it.promoRef });
  });

  // Contexto promo: una cotizacion de UNA promo vigente (misma config y ancho en rango) se restaura con el
  // reglaje de la promo (precio plano, instalada). Vencida/inexistente/fuera de rango: flujo normal (recalcula).
  const ref = kept.length === 1 && res.items.length === 1 ? (kept[0]?.promoRef ?? null) : null;
  const ctx = ref ? resolvePromo(ref) : null;
  const only = kept[0]?.item;
  const restored =
    ctx && only && entrega === 'instalacion' && only.productId === ctx.productId && only.color === ctx.color && only.glass === ctx.glass && isPromoWidthOk(ctx, Number(only.width))
      ? ctx
      : null;
  const promoId = restored ? restored.id : null;
  const base: CotizadorState = { ...initialCotizadorState, cart: kept.map((k) => k.item), entrega, zone, promoId };
  const lines = buildOrderItems(base, products);
  lines.forEach((line, i) => {
    const k = kept[i];
    if (!k) return;
    const name = nameOf(line.productId, products);
    if (Math.abs(line.subtotal - k.saved) > 0.005) {
      changes.push({ kind: 'price_changed', name, before: k.saved, after: line.subtotal });
    }
    if (k.promoRef && !promoId && !isPromoActive(k.promoRef)) changes.push({ kind: 'promo_expired', name });
  });

  const fee = entrega === 'instalacion' ? (getZoneFee(zone) ?? 0) : 0;
  return {
    items: kept.map((k) => k.item),
    entrega,
    zone,
    promoId,
    notice: {
      code: res.code,
      createdAt: res.createdAt,
      validUntil: res.validUntil,
      expired: res.expired,
      changes,
      totalBefore: res.saved.total,
      totalAfter: orderTotal(lines, fee),
    },
  };
}
