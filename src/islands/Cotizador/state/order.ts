// S7 — pure "whole order" aggregator: combines committed `cart` items with
// the in-progress "current" item into one list for the Resumen card, the
// desktop aside, and the WhatsApp/Wompi payloads. No React/window/document
// imports — unit-tested directly, same rule as state/quote.ts.
//
// Money rule (prototype-spec.md §2.4/§2.5, T7.2): transport (zoneFee) is an
// ORDER-level fee, computed once from the single shared zone/entrega — it is
// never part of an item's own subtotal here and must be added exactly once
// by the caller (see orderTotal below), regardless of how many items exist.
import type { CatalogProduct, ProductId } from '@content/catalog';
import { applyCartItem, type CotizadorState } from './cotizadorStore';
import { buildLineItem, computeQuote } from './quote';
import { computeGardenQuote, computeWindowQuote } from './quoteWindowGarden';
import { GARDEN_HOJAS_LABELS, WINDOW_GLASS_LABELS, WINDOW_MODEL_LABELS } from './labels';
import { COLOR_LABELS, GLASS_LABELS } from './cotizadorStore';
import { buildGardenMessageItem, buildWindowMessageItems } from '@integrations/whatsapp/windowGardenMessageItems';
import type { QuoteMessageItem } from '@integrations/whatsapp/buildMessage';

export interface OrderLineItem {
  /** `'current'` for the in-progress item being edited through steps 1-3; the cart item's own id otherwise. */
  id: string;
  productId: ProductId;
  name: string;
  detail: string;
  subtotal: number;
  requiresQuote: boolean;
}

/** Builds the full "one row per item" list — cart items first, current item last (if any product is selected). */
export function buildOrderItems(state: CotizadorState, products: readonly CatalogProduct[]): OrderLineItem[] {
  const nameOf = (id: ProductId): string => products.find((p) => p.id === id)?.name ?? id;

  const toLine = (itemState: CotizadorState, id: string, productId: ProductId): OrderLineItem => {
    const quote = computeQuote(itemState);
    const line = buildLineItem(itemState);
    return {
      id,
      productId,
      name: nameOf(productId),
      detail: line.detail,
      subtotal: quote.amount ?? 0,
      requiresQuote: quote.requiresQuote,
    };
  };

  const fromCart = state.cart.map((item) => toLine(applyCartItem(state, item), item.id, item.productId));

  if (!state.productId) return fromCart;
  return [...fromCart, toLine(state, 'current', state.productId)];
}

/** Sum of every priced item's subtotal (requiresQuote items contribute $0, never null-poisoned). */
export function orderItemsSubtotal(items: readonly OrderLineItem[]): number {
  return Math.round(items.reduce((sum, i) => sum + i.subtotal, 0) * 100) / 100;
}

/** Total = sum of item subtotals + transport, added exactly once (T7.2). */
export function orderTotal(items: readonly OrderLineItem[], zoneFee: number): number {
  return Math.round((orderItemsSubtotal(items) + zoneFee) * 100) / 100;
}

export type EntregaLabel = 'con instalación' | 'retiro en tienda';

/** One QuoteMessageItem per item — ventana items still expand to one row per
 * repeatable pane (existing S6 WhatsApp granularity), everything else is one row. */
export function buildOrderMessageItems(
  state: CotizadorState,
  products: readonly CatalogProduct[],
  ctx: { zona: string; entrega: EntregaLabel },
): QuoteMessageItem[] {
  const nameOf = (id: ProductId): string => products.find((p) => p.id === id)?.name ?? id;

  const toMessageItems = (itemState: CotizadorState): QuoteMessageItem[] => {
    switch (itemState.productId) {
      case 'ventana': {
        const q = computeWindowQuote(itemState);
        return buildWindowMessageItems(q.rows, {
          modelLabel: WINDOW_MODEL_LABELS[itemState.windowModel],
          frameLabel: COLOR_LABELS[itemState.windowFrame],
          glassLabel: WINDOW_GLASS_LABELS[itemState.windowGlass],
          zona: ctx.zona,
          entrega: ctx.entrega,
        });
      }
      case 'jardin': {
        const q = computeGardenQuote(itemState);
        return [
          buildGardenMessageItem({
            hojasLabel: GARDEN_HOJAS_LABELS[itemState.gardenHojas],
            widthM: q.widthM,
            heightM: q.heightM,
            colorLabel: COLOR_LABELS[itemState.gardenColor],
            glassLabel: GLASS_LABELS[itemState.gardenGlass],
            subtotal: q.subtotal,
            requiresQuote: q.requiresQuote,
            zona: ctx.zona,
            entrega: ctx.entrega,
          }),
        ];
      }
      case null:
        return [];
      default: {
        const line = buildLineItem(itemState);
        const quote = computeQuote(itemState);
        return [
          {
            producto: nameOf(itemState.productId),
            anchoM: line.anchoM,
            altoM: line.altoM,
            color: line.color,
            vidrio: line.vidrio,
            cantidad: line.cantidad,
            zona: ctx.zona,
            entrega: ctx.entrega,
            subtotal: quote.amount ?? 0,
          },
        ];
      }
    }
  };

  const itemStates = [
    ...state.cart.map((item) => applyCartItem(state, item)),
    ...(state.productId ? [state] : []),
  ];
  return itemStates.flatMap(toMessageItems);
}
