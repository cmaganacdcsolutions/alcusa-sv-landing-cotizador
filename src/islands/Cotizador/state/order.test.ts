import { describe, expect, it } from 'vitest';
import { CATALOG_PRODUCTS } from '@content/catalog';
import { cotizadorReducer, initialCotizadorState, type CotizadorState } from './cotizadorStore';
import { buildOrderItems, orderItemsSubtotal, orderTotal } from './order';

// S7/T7.2 — order-level transport: charged exactly ONCE per order, added on
// top of the summed item subtotals, never per item/qty. Check-values reuse
// the recta 110cm ($222) / corner Aquaclara natural ($444) figures already
// verified pre-zone in quote.test.ts.
describe('state/order — T7.2 order-level transport + totals', () => {
  it('transport is added exactly once, not once per item', () => {
    let state: CotizadorState = {
      ...initialCotizadorState,
      productId: 'recta',
      width: '110',
      color: 'natural',
      glass: 'claro',
      entrega: 'instalacion',
      zone: 'Soyapango',
    };
    state = cotizadorReducer(state, { type: 'ADD_TO_CART' }); // recta $222 committed
    state = { ...state, productId: 'l', color: 'natural', cornerModel: 'aquaclara' }; // corner $444 current

    const items = buildOrderItems(state, CATALOG_PRODUCTS);
    expect(items).toHaveLength(2);
    expect(orderItemsSubtotal(items)).toBe(666); // 222 + 444
    expect(orderTotal(items, 40)).toBe(706); // + transport ONCE (not 40 x 2)
  });

  it('a single item whose own pricing already opted out of delivery (retiro) is not double-charged transport', () => {
    const state: CotizadorState = {
      ...initialCotizadorState,
      productId: 'recta',
      width: '110',
      color: 'natural',
      glass: 'claro',
      entrega: 'retiro',
    };
    const items = buildOrderItems(state, CATALOG_PRODUCTS);
    expect(items).toHaveLength(1);
    // Cotizador.tsx computes zoneFee=0 whenever entrega==='retiro' — no
    // second transport line stacked on top of the already-discounted item.
    expect(orderTotal(items, 0)).toBe(items[0].subtotal);
  });

  it('each item keeps its own subtotal + requiresQuote flag independently (T7.1)', () => {
    let state: CotizadorState = { ...initialCotizadorState, productId: 'l', color: 'blanco' }; // corner Blanco has no price table -> requiresQuote
    state = cotizadorReducer(state, { type: 'ADD_TO_CART' });
    state = { ...state, productId: 'recta', width: '110', color: 'natural', glass: 'claro' };

    const items = buildOrderItems(state, CATALOG_PRODUCTS);
    expect(items[0].requiresQuote).toBe(true);
    expect(items[0].subtotal).toBe(0); // never null-poisons the sum
    expect(items[1].requiresQuote).toBe(false);
    expect(items[1].subtotal).toBe(222);
    expect(orderItemsSubtotal(items)).toBe(222);
  });

  it('an empty order (no cart, no current product) has no items and no total', () => {
    const items = buildOrderItems(initialCotizadorState, CATALOG_PRODUCTS);
    expect(items).toHaveLength(0);
    expect(orderItemsSubtotal(items)).toBe(0);
  });
});
