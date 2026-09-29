import { describe, expect, it } from 'vitest';
import { cotizadorReducer, initialCotizadorState, type CotizadorState } from './cotizadorStore';

// S7 — "+ Agregar otro producto" loop (T7.1) + "Quitar" (T7.3). Check-values
// reuse the recta 110cm/corner Aquaclara figures already verified in
// quote.test.ts ($222 / $444 pre-zone).
const recta110: Partial<CotizadorState> = { productId: 'recta', width: '110', color: 'natural', glass: 'claro' };
const cornerNatural: Partial<CotizadorState> = { productId: 'l', color: 'natural', cornerModel: 'aquaclara' };

describe('cotizadorReducer — S7 cart (ADD_TO_CART)', () => {
  it('commits the current item into cart and resets the current item + step 0', () => {
    const state: CotizadorState = { ...initialCotizadorState, ...recta110, step: 'resumen' };
    const next = cotizadorReducer(state, { type: 'ADD_TO_CART' });

    expect(next.cart).toHaveLength(1);
    expect(next.cart[0]).toMatchObject({ productId: 'recta', width: '110', color: 'natural', glass: 'claro' });
    expect(next.productId).toBeNull();
    expect(next.width).toBe(initialCotizadorState.width);
    expect(next.step).toBe('producto');
  });

  it('never touches order-level fields (zone/entrega/pay) already chosen', () => {
    const state: CotizadorState = {
      ...initialCotizadorState,
      ...recta110,
      zone: 'Soyapango',
      entrega: 'instalacion',
      payAmountPct: 100,
    };
    const next = cotizadorReducer(state, { type: 'ADD_TO_CART' });
    expect(next.zone).toBe('Soyapango');
    expect(next.entrega).toBe('instalacion');
    expect(next.payAmountPct).toBe(100);
  });

  it('is a no-op without a selected product', () => {
    const next = cotizadorReducer(initialCotizadorState, { type: 'ADD_TO_CART' });
    expect(next).toBe(initialCotizadorState);
  });

  it('each committed item gets its own stable, unique id', () => {
    let state: CotizadorState = { ...initialCotizadorState, ...recta110 };
    state = cotizadorReducer(state, { type: 'ADD_TO_CART' });
    state = { ...state, ...cornerNatural };
    state = cotizadorReducer(state, { type: 'ADD_TO_CART' });
    expect(state.cart).toHaveLength(2);
    expect(state.cart[0].id).not.toBe(state.cart[1].id);
  });
});

describe('cotizadorReducer — S7 cart (REMOVE_ITEM)', () => {
  it('id "current": promotes the most recently committed cart item back into the current slot', () => {
    let state: CotizadorState = { ...initialCotizadorState, ...recta110 };
    state = cotizadorReducer(state, { type: 'ADD_TO_CART' }); // cart: [recta], current: blank
    state = { ...state, ...cornerNatural }; // configuring item 2 (corner)

    const next = cotizadorReducer(state, { type: 'REMOVE_ITEM', id: 'current' });
    expect(next.cart).toHaveLength(0);
    expect(next.productId).toBe('recta');
    expect(next.width).toBe('110');
  });

  it('id "current": falls back to step 0 (Producto) when the cart is empty too — "removing the last one"', () => {
    const state: CotizadorState = { ...initialCotizadorState, ...recta110, step: 'resumen' };
    const next = cotizadorReducer(state, { type: 'REMOVE_ITEM', id: 'current' });
    expect(next.productId).toBeNull();
    expect(next.step).toBe('producto');
    expect(next.cart).toHaveLength(0);
  });

  it('a committed item id: removes only that line, current item + the rest of the cart stay intact', () => {
    let state: CotizadorState = { ...initialCotizadorState, ...recta110 };
    state = cotizadorReducer(state, { type: 'ADD_TO_CART' }); // cart: [recta]
    state = { ...state, ...cornerNatural };
    state = cotizadorReducer(state, { type: 'ADD_TO_CART' }); // cart: [recta, corner], current: blank
    state = { ...state, productId: 'templado', width: '150' }; // configuring item 3

    const rectaId = state.cart[0].id;
    const next = cotizadorReducer(state, { type: 'REMOVE_ITEM', id: rectaId });
    expect(next.cart).toHaveLength(1);
    expect(next.cart[0].productId).toBe('l');
    expect(next.productId).toBe('templado'); // current item untouched
  });
});
