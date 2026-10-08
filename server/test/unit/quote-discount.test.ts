// Pure rules of the online-card discount + "shipping pending" on POST /api/quote-create (rules of 2026-10-06).
// Cart from feRequest(): items 222 + 216 = 438.00 -> expected discount 43.80.
import { describe, expect, it } from 'vitest';
import { discountMatches, expectedDiscountCents } from '../../src/modules/quotes/discount.ts';
import { validateCreate } from '../../src/modules/quotes/create-request.ts';
import { feRequest } from '../fe-request.ts';

const base = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ ...feRequest(), ...over });
const bad = (body: unknown) => {
  const r = validateCreate(body);
  if (r.ok) throw new Error('expected a rejection');
  return r.error;
};
const good = (body: unknown) => {
  const r = validateCreate(body);
  if (!r.ok) throw new Error('expected ok, got ' + JSON.stringify(r.error));
  return r.data;
};

describe('discount.ts', () => {
  it('expected discount is round(10% of the subtotal) in cents', () => {
    expect(expectedDiscountCents(43800)).toBe(4380);
    expect(expectedDiscountCents(114850)).toBe(11485);
    expect(expectedDiscountCents(123455)).toBe(12346);
  });
  it('tolerates +-1 cent and rejects zero / negative / 2 cents off', () => {
    expect(discountMatches(4380, 43800)).toBe(true);
    expect(discountMatches(4381, 43800)).toBe(true);
    expect(discountMatches(4379, 43800)).toBe(true);
    expect(discountMatches(4382, 43800)).toBe(false);
    expect(discountMatches(0, 0)).toBe(false);
    expect(discountMatches(-4380, 43800)).toBe(false);
  });
});

describe('validateCreate: requests WITHOUT discount behave exactly as before', () => {
  it('no discount / no shippingPending: ok, zero discount, not pending', () => {
    const d = good(base());
    expect(d).toMatchObject({ discountCode: null, discountCents: 0, shippingPending: false, subtotalCents: 43800, transportCents: 2500, totalCents: 46300 });
  });
  it('explicit null / false are read as absent', () => {
    expect(good(base({ discount: null, shippingPending: false }))).toMatchObject({ discountCode: null, discountCents: 0, shippingPending: false });
  });
  it('total != subtotal + transport still -> invalid_request / total', () => {
    expect(bad(base({ total: 400 }))).toMatchObject({ status: 422, code: 'invalid_request', fields: { total: 'invalid' } });
  });
  it('the cart hash of a request without discount is unchanged by the new fields (idempotent replay of old quotes)', () => {
    const k = '11111111-1111-4111-8111-111111111111';
    const a = good(base({ idempotencyKey: k })).cartHash;
    const b = good(base({ idempotencyKey: k, discount: null, shippingPending: false })).cartHash;
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('validateCreate: valid discount', () => {
  const withDiscount = (over: Record<string, unknown> = {}) =>
    base({ discount: { code: 'online_card_10', amount: 43.8 }, transportFee: 25, total: 419.2, ...over });

  it('accepts code online_card_10 with 10% of the items and total = subtotal - discount + transport', () => {
    expect(good(withDiscount())).toMatchObject({ discountCode: 'online_card_10', discountCents: 4380, shippingPending: false, subtotalCents: 43800, transportCents: 2500, totalCents: 41920 });
  });
  it('accepts +-0.01 on the amount when the total is consistent with it', () => {
    expect(good(withDiscount({ discount: { code: 'online_card_10', amount: 43.81 }, total: 419.19 })).discountCents).toBe(4381);
    expect(good(withDiscount({ discount: { code: 'online_card_10', amount: 43.79 }, total: 419.21 })).discountCents).toBe(4379);
  });
  it('the discount changes the cart hash (same key + discounted cart -> 409 upstream)', () => {
    const k = '22222222-2222-4222-8222-222222222222';
    expect(good(base({ idempotencyKey: k })).cartHash).not.toBe(good(withDiscount({ idempotencyKey: k })).cartHash);
  });
  it('pickup + discount is fine (items already carry the retiro -15%)', () => {
    const d = good(withDiscount({ delivery: { mode: 'pickup' }, transportFee: 0, total: 394.2 }));
    expect(d).toMatchObject({ deliveryMode: 'pickup', discountCents: 4380, totalCents: 39420 });
  });
});

describe('validateCreate: wrong discount -> 422 invalid_discount (distinct from invalid_request)', () => {
  const cases: [string, Record<string, unknown>, Record<string, string>][] = [
    ['unknown code', { discount: { code: 'promo_x', amount: 43.8 }, total: 419.2 }, { 'discount.code': 'invalid' }],
    ['code is case sensitive', { discount: { code: 'ONLINE_CARD_10', amount: 43.8 }, total: 419.2 }, { 'discount.code': 'invalid' }],
    ['amount too high', { discount: { code: 'online_card_10', amount: 100 }, total: 363 }, { 'discount.amount': 'invalid' }],
    ['amount 2 cents off', { discount: { code: 'online_card_10', amount: 43.82 }, total: 419.18 }, { 'discount.amount': 'invalid' }],
    ['amount zero', { discount: { code: 'online_card_10', amount: 0 }, total: 463 }, { 'discount.amount': 'invalid' }],
    ['amount negative', { discount: { code: 'online_card_10', amount: -43.8 }, total: 506.8 }, { 'discount.amount': 'invalid' }],
    ['amount with 3 decimals', { discount: { code: 'online_card_10', amount: 43.801 }, total: 419.2 }, { 'discount.amount': 'invalid' }],
    ['amount as string', { discount: { code: 'online_card_10', amount: '43.80' }, total: 419.2 }, { 'discount.amount': 'invalid' }],
    ['missing amount', { discount: { code: 'online_card_10' }, total: 419.2 }, { 'discount.amount': 'required' }],
    ['missing code', { discount: { amount: 43.8 }, total: 419.2 }, { 'discount.code': 'required' }],
    ['not an object', { discount: 'online_card_10', total: 419.2 }, { discount: 'invalid' }],
  ];
  it.each(cases)('%s', (_name, over, fields) => {
    expect(bad(base({ transportFee: 25, ...over }))).toMatchObject({ status: 422, code: 'invalid_discount', fields });
  });

  it('valid discount but the total does not add up -> invalid_request / total (not invalid_discount)', () => {
    expect(bad(base({ discount: { code: 'online_card_10', amount: 43.8 }, transportFee: 25, total: 463 }))).toMatchObject({
      status: 422,
      code: 'invalid_request',
      fields: { total: 'invalid' },
    });
  });
  it('total discounted twice -> invalid_request / total', () => {
    expect(bad(base({ discount: { code: 'online_card_10', amount: 43.8 }, transportFee: 25, total: 375.4 }))).toMatchObject({ code: 'invalid_request', fields: { total: 'invalid' } });
  });
  it('the error body never echoes the submitted code or amount', () => {
    const e = bad(base({ discount: { code: 'promo_secret', amount: 43.8 }, total: 419.2 }));
    expect(JSON.stringify(e)).not.toMatch(/promo_secret|43\.8/);
  });
});

describe('validateCreate: shippingPending', () => {
  const pending = (over: Record<string, unknown> = {}) =>
    base({ shippingPending: true, transportFee: 0, total: 438, delivery: { mode: 'delivery', zone: 'otro' }, ...over });

  it('accepts shippingPending with transportFee 0', () => {
    expect(good(pending())).toMatchObject({ shippingPending: true, transportCents: 0, totalCents: 43800 });
  });
  it('accepts shippingPending together with the discount (the pay-by-card case)', () => {
    expect(good(pending({ discount: { code: 'online_card_10', amount: 43.8 }, total: 394.2 }))).toMatchObject({ shippingPending: true, discountCents: 4380, totalCents: 39420 });
  });
  it('shippingPending with a transport fee -> invalid_request / transportFee', () => {
    expect(bad(pending({ transportFee: 25, total: 463 }))).toMatchObject({ code: 'invalid_request', fields: { transportFee: 'invalid' } });
  });
  it('shippingPending with pickup is incoherent -> invalid_request / shippingPending', () => {
    expect(bad(pending({ delivery: { mode: 'pickup' } }))).toMatchObject({ code: 'invalid_request', fields: { shippingPending: 'invalid' } });
  });
  it('shippingPending non-boolean -> invalid_request', () => {
    expect(bad(pending({ shippingPending: 'yes' }))).toMatchObject({ code: 'invalid_request', fields: { shippingPending: 'invalid' } });
  });
  it('shippingPending changes the cart hash', () => {
    const k = '33333333-3333-4333-8333-333333333333';
    const off = good(base({ idempotencyKey: k, transportFee: 0, total: 438, delivery: { mode: 'delivery', zone: 'otro' } })).cartHash;
    expect(good(pending({ idempotencyKey: k })).cartHash).not.toBe(off);
  });
});

describe('validateCreate: promo context (?promo=<id>) has no online-card discount', () => {
  it('rejects the 10% discount when promoId is present -> 422 discount.code', () => {
    const e = bad(base({ promoId: 'promo-aquafold', discount: { code: 'online_card_10', amount: 43.8 }, transportFee: 25, total: 419.2 }));
    expect(e).toMatchObject({ status: 422, fields: { 'discount.code': 'invalid' } });
  });
  it('accepts a promo order without discount at full price', () => {
    expect(good(base({ promoId: 'promo-aquafold' }))).toMatchObject({ discountCode: null, discountCents: 0, subtotalCents: 43800, totalCents: 46300 });
  });
  it('promoId null behaves as absent (normal discount still accepted)', () => {
    expect(good(base({ promoId: null, discount: { code: 'online_card_10', amount: 43.8 }, transportFee: 25, total: 419.2 })).discountCents).toBe(4380);
  });
});
