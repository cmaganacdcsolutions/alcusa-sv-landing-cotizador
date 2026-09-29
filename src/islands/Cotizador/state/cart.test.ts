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

// sf-cot-s7gaps gap 1 — desktop "Editar" on a committed cart item.
describe('cotizadorReducer — sf-cot-s7gaps (EDIT_ITEM)', () => {
  it('loads a committed item into the current slot, records its index, and jumps to Medidas', () => {
    let state: CotizadorState = { ...initialCotizadorState, ...recta110 };
    state = cotizadorReducer(state, { type: 'ADD_TO_CART' }); // cart: [recta]
    state = { ...state, ...cornerNatural };
    state = cotizadorReducer(state, { type: 'ADD_TO_CART' }); // cart: [recta, corner], current: blank
    state = { ...state, productId: 'templado', width: '150' }; // configuring item 3

    const cornerId = state.cart[1].id;
    const next = cotizadorReducer(state, { type: 'EDIT_ITEM', id: cornerId });

    expect(next.step).toBe('medidas');
    expect(next.productId).toBe('l');
    expect(next.color).toBe('natural');
    expect(next.editingItem).toEqual({ id: cornerId, index: 1 });
    // item 3 (templado, in progress) is not lost — committed to the cart.
    expect(next.cart).toHaveLength(2);
    expect(next.cart.some((i) => i.productId === 'templado' && i.width === '150')).toBe(true);
    // the edited corner item is no longer a separate cart row.
    expect(next.cart.some((i) => i.id === cornerId)).toBe(false);
  });

  it('is a no-op for an unknown id', () => {
    const state: CotizadorState = { ...initialCotizadorState, ...recta110 };
    const next = cotizadorReducer(state, { type: 'EDIT_ITEM', id: 'does-not-exist' });
    expect(next).toBe(state);
  });

  it('ADD_TO_CART after an edit reinserts the item at its original index (same id), not at the end', () => {
    let state: CotizadorState = { ...initialCotizadorState, ...recta110 };
    state = cotizadorReducer(state, { type: 'ADD_TO_CART' }); // cart: [recta]
    state = { ...state, ...cornerNatural };
    state = cotizadorReducer(state, { type: 'ADD_TO_CART' }); // cart: [recta, corner]

    const rectaId = state.cart[0].id;
    state = cotizadorReducer(state, { type: 'EDIT_ITEM', id: rectaId }); // cart: [corner], current: recta (index 0)
    state = { ...state, width: '150' }; // edit the measure

    const next = cotizadorReducer(state, { type: 'ADD_TO_CART' });
    expect(next.cart).toHaveLength(2);
    expect(next.cart[0]).toMatchObject({ id: rectaId, productId: 'recta', width: '150' });
    expect(next.cart[1].productId).toBe('l');
    expect(next.editingItem).toBeNull();
  });

  it('REMOVE_ITEM("current") clears a pending edit', () => {
    let state: CotizadorState = { ...initialCotizadorState, ...recta110 };
    state = cotizadorReducer(state, { type: 'ADD_TO_CART' });
    const rectaId = state.cart[0].id;
    state = cotizadorReducer(state, { type: 'EDIT_ITEM', id: rectaId });

    const next = cotizadorReducer(state, { type: 'REMOVE_ITEM', id: 'current' });
    expect(next.editingItem).toBeNull();
  });
});
