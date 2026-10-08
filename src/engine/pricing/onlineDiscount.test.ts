import { describe, expect, it } from 'vitest';
import { ONLINE_CARD_DISCOUNT, ONLINE_CARD_PAY_METHOD, computeOnlineCardDiscount } from './onlineDiscount';
import { priceStraight } from './straight';

describe('engine/pricing/onlineDiscount', () => {
  it('config confirmada por el usuario 2026-10-06', () => {
    expect(ONLINE_CARD_DISCOUNT).toEqual({
      rate: 0.1,
      appliesToShipping: false,
      appliesToPromoItems: false,
      stacksWithPickupDiscount: true,
    });
    expect(ONLINE_CARD_PAY_METHOD).toBe('pay');
  });

  it('tarjeta (pay): 10% sobre el subtotal de productos', () => {
    const r = computeOnlineCardDiscount({ payMethod: 'pay', itemsSubtotal: 400 });
    expect(r).toEqual({ applies: true, rate: 0.1, base: 400, amount: 40 });
  });

  it('otro metodo (WhatsApp), metodo aun desconocido: sin descuento', () => {
    for (const payMethod of ['wa', null, undefined] as const) {
      expect(computeOnlineCardDiscount({ payMethod, itemsSubtotal: 400 })).toMatchObject({ applies: false, amount: 0 });
    }
  });

  it('el envio queda fuera de la base', () => {
    const r = computeOnlineCardDiscount({ payMethod: 'pay', itemsSubtotal: 400, shippingFee: 85 });
    expect(r.base).toBe(400);
    expect(r.amount).toBe(40);
  });

  it('producto en promocion (Aquafold $279.99) tambien recibe el 10%, redondeado a centavos', () => {
    // 279.99 * 0.10 = 27.999 -> 28.00
    expect(computeOnlineCardDiscount({ payMethod: 'pay', itemsSubtotal: 279.99 }).amount).toBe(28);
    expect(computeOnlineCardDiscount({ payMethod: 'pay', itemsSubtotal: 279.99, promoItemsSubtotal: 279.99 }).amount).toBe(28);
  });

  it('se acumula con retiro -15%: el 10% se calcula DESPUES del 15%', () => {
    const pickup = priceStraight({ widthCm: 90, color: 'blanco', glass: 'claro', pickup: true });
    const noPickup = priceStraight({ widthCm: 90, color: 'blanco', glass: 'claro', pickup: false });
    expect(pickup.price).not.toBeNull();
    const afterPickup = pickup.price as number;
    expect(afterPickup).toBeLessThan(noPickup.price as number);
    const r = computeOnlineCardDiscount({ payMethod: 'pay', itemsSubtotal: afterPickup, pickup: true });
    expect(r.base).toBe(afterPickup);
    expect(r.amount).toBe(Math.round(afterPickup * 0.1 * 100) / 100);
  });

  it('subtotal 0 (solo items por cotizar): no hay descuento', () => {
    expect(computeOnlineCardDiscount({ payMethod: 'pay', itemsSubtotal: 0 })).toMatchObject({ applies: false, amount: 0 });
  });
});
