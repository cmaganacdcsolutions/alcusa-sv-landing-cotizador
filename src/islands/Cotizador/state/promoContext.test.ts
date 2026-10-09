import { describe, expect, it } from 'vitest';
import raw from '@content/promotions.json';
import { parsePromotions, PromotionsDataError } from '@content/promotionsParser';
import { isPromoWidthOk, promoWidthRuleCopy, resolvePromoContext } from '@content/promoContext';
import { computeOnlineCardDiscount } from '@engine/pricing/onlineDiscount';
import { cotizadorReducer, initialCotizadorState } from './cotizadorStore';
import { computeQuote } from './quote';
import { parseWizardSnapshot, snapshotFromState } from './persist';
import { lookupActivePromo } from './promoRegistry';

const PROMOS = parsePromotions(raw);
const TODAY = PROMOS.map((p) => p.desde).sort().at(-1) ?? '2026-10-08';
const ctx = (id: string) => {
  const c = resolvePromoContext(id, PROMOS, TODAY);
  if (!c) throw new Error(`promo ${id} no resuelve`);
  return c;
};
const enter = (id: string, width?: string) => {
  const s = cotizadorReducer(initialCotizadorState, { type: 'ENTER_PROMO', promo: ctx(id) });
  return width ? { ...s, width } : s;
};

describe('promoContext — resolvePromoContext', () => {
  it('las 3 promos del seed resuelven con su reglaje', () => {
    expect(ctx('promo-puerta-aquaclara')).toMatchObject({ price: 222, widthMinCm: 100, widthMaxCm: 120, altoM: 1.85, glass: 'claro' });
    expect(ctx('promo-corrediza-nevado')).toMatchObject({ price: 260, widthMinCm: 90, widthMaxCm: 120, glass: 'nevado' });
    expect(ctx('promo-aquafold')).toMatchObject({ price: 279.99, widthMinCm: 100, widthMaxCm: 120, glass: 'aquafold' });
  });
  it('id inexistente, vacio o nulo => null', () => {
    expect(resolvePromoContext('nope', PROMOS, TODAY)).toBeNull();
    expect(resolvePromoContext('', PROMOS, TODAY)).toBeNull();
    expect(resolvePromoContext(null, PROMOS, TODAY)).toBeNull();
  });
  it('promo vencida o aun no vigente => null', () => {
    expect(resolvePromoContext('promo-aquafold', PROMOS, '2099-01-01')).toBeNull();
    expect(resolvePromoContext('promo-aquafold', PROMOS, '2000-01-01')).toBeNull();
  });
  it('el registro del navegador ignora id invalido', () => {
    expect(lookupActivePromo('nope')).toBeNull();
  });
  it('copy y rango de ancho', () => {
    const n = ctx('promo-corrediza-nevado');
    expect(promoWidthRuleCopy(n)).toContain('0.90');
    expect(promoWidthRuleCopy(n)).toContain('1.20');
    expect(isPromoWidthOk(n, 90)).toBe(true);
    expect(isPromoWidthOk(n, 120)).toBe(true);
    expect(isPromoWidthOk(n, 89)).toBe(false);
    expect(isPromoWidthOk(n, 121)).toBe(false);
    expect(isPromoWidthOk(n, Number.NaN)).toBe(false);
  });
});

describe('promoContext — parser quote_rules', () => {
  const base = {
    id: 'p1', title: 'T', description: 'D', image: '/i.jpg', image_alt: 'a', price_before: 300, price_promo: 200,
    product_slug: 'recta', starts_on: '2026-09-01', ends_on: '2026-10-31',
  };
  const parse = (qr: unknown) => parsePromotions({ promotions: [{ ...base, quote_rules: qr }] });
  it('acepta reglas validas', () => {
    expect(parse({ width_min_cm: 90, width_max_cm: 120, alto_m: 1.85 })[0].quoteRules).toEqual({ widthMinCm: 90, widthMaxCm: 120, altoM: 1.85 });
  });
  it('rechaza min > max, faltantes y no objeto', () => {
    expect(() => parse({ width_min_cm: 130, width_max_cm: 120, alto_m: 1.85 })).toThrow(PromotionsDataError);
    expect(() => parse({ width_min_cm: 90, alto_m: 1.85 })).toThrow(PromotionsDataError);
    expect(() => parse('x')).toThrow(PromotionsDataError);
  });
});

describe('promoContext — computeQuote y reducer', () => {
  it('precio plano de la promo dentro del rango (sin envio: lo suma la zona)', () => {
    expect(computeQuote(enter('promo-puerta-aquaclara', '110'))).toEqual({ amount: 222, requiresQuote: false });
    expect(computeQuote(enter('promo-corrediza-nevado', '90'))).toEqual({ amount: 260, requiresQuote: false });
    expect(computeQuote(enter('promo-aquafold', '120'))).toEqual({ amount: 279.99, requiresQuote: false });
  });
  it('fuera de rango => requiresQuote', () => {
    expect(computeQuote(enter('promo-puerta-aquaclara', '99')).requiresQuote).toBe(true);
    expect(computeQuote(enter('promo-corrediza-nevado', '89')).requiresQuote).toBe(true);
    expect(computeQuote(enter('promo-corrediza-nevado', '121')).requiresQuote).toBe(true);
    expect(computeQuote(enter('promo-aquafold', '121')).requiresQuote).toBe(true);
  });
  it('sin promo: Aquafold recta va a asesor y claro usa tabla regular', () => {
    const base = { ...initialCotizadorState, productId: 'recta' as const, color: 'natural' as const, width: '110' };
    expect(computeQuote({ ...base, glass: 'aquafold' }).requiresQuote).toBe(true);
    expect(computeQuote({ ...base, glass: 'claro' })).toEqual({ amount: 258, requiresQuote: false });
  });
  it('ENTER_PROMO fija config, apaga oferta y vacia carrito; EXIT_PROMO vuelve a normal', () => {
    const s = cotizadorReducer({ ...initialCotizadorState, onlineOffer: true }, { type: 'ENTER_PROMO', promo: ctx('promo-corrediza-nevado') });
    expect(s).toMatchObject({ promoId: 'promo-corrediza-nevado', productId: 'recta', color: 'natural', glass: 'nevado', onlineOffer: false, cart: [] });
    expect(s.step).toBe('medidas');
    const w = enter('promo-corrediza-nevado');
    expect(isPromoWidthOk(ctx('promo-corrediza-nevado'), Number(w.width))).toBe(true);
    expect(cotizadorReducer(s, { type: 'SET_ENTREGA', entrega: 'retiro' }).entrega).toBe('instalacion');
    expect(cotizadorReducer(s, { type: 'EXIT_PROMO' })).toEqual(initialCotizadorState);
    expect(cotizadorReducer(initialCotizadorState, { type: 'RESTORE_PROMO', promoId: 'x' }).promoId).toBe('x');
  });
  it('10% con tarjeta: NONE en promo, aplica en flujo normal', () => {
    expect(computeOnlineCardDiscount({ payMethod: 'pay', itemsSubtotal: 222, promo: true }).applies).toBe(false);
    expect(computeOnlineCardDiscount({ payMethod: 'pay', itemsSubtotal: 258, promo: false })).toMatchObject({ applies: true, amount: 25.8 });
  });
});

describe('promoContext — persist', () => {
  it('promoId hace round-trip en el snapshot', () => {
    const s = { ...enter('promo-aquafold', '110'), step: 'zonaEntrega' as const };
    const snap = snapshotFromState(s);
    expect(snap?.promoId).toBe('promo-aquafold');
    expect(parseWizardSnapshot(JSON.parse(JSON.stringify(snap)))?.promoId).toBe('promo-aquafold');
  });
  it('estado normal guarda promoId null', () => {
    const snap = snapshotFromState({ ...initialCotizadorState, productId: 'recta', step: 'medidas' });
    expect(snap?.promoId).toBeNull();
  });
});

describe('RECOVER_WORK — cotizacion en curso apartada al entrar por ?promo=', () => {
  it('ENTER_PROMO vacia el carrito (por eso el cotizador lo aparta antes) y RECOVER_WORK lo devuelve sin contexto promo', () => {
    const item = { id: 'x1' } as unknown as (typeof initialCotizadorState)['cart'][number];
    const work = { ...initialCotizadorState, cart: [item], width: '130' };
    const inPromo = cotizadorReducer(work, { type: 'ENTER_PROMO', promo: ctx('promo-corrediza-nevado') });
    expect(inPromo.cart).toEqual([]);
    const snap = snapshotFromState({ ...work, step: 'medidas', productId: 'recta' });
    expect(snap).not.toBeNull();
    const recovered = cotizadorReducer(inPromo, { type: 'RECOVER_WORK', cart: [item], fields: null });
    expect(recovered.cart).toEqual([item]);
    expect(recovered.promoId).toBeNull();
    const { v: _v, ...fields } = snap as NonNullable<typeof snap>;
    void _v;
    const withFields = cotizadorReducer(inPromo, { type: 'RECOVER_WORK', cart: [item], fields });
    expect(withFields).toMatchObject({ promoId: null, width: '130', productId: 'recta', step: 'medidas' });
  });
});
