import { describe, expect, it } from 'vitest';
import { amountToChargeNow, computePayable, depositOf, formatDiscount, payMethodForDiscount, resolveShipping } from './payable';

describe('state/payable', () => {
  it('resolveShipping: retiro = none, zona mapeada = fee, distrito sin tarifa (otro) = pending', () => {
    expect(resolveShipping('retiro', '')).toEqual({ kind: 'none' });
    expect(resolveShipping('instalacion', 'Soyapango')).toEqual({ kind: 'fee', fee: 40 });
    expect(resolveShipping('instalacion', 'San Salvador')).toEqual({ kind: 'fee', fee: 0 });
    expect(resolveShipping('instalacion', 'otro')).toEqual({ kind: 'pending' });
  });

  it('WhatsApp: total sin descuento (camino sin tarjeta no cambia)', () => {
    const p = computePayable({ itemsSubtotal: 400, shipping: { kind: 'fee', fee: 40 }, payMethod: 'wa', pickup: false });
    expect(p).toMatchObject({ totalBeforeDiscount: 440, total: 440, shippingFee: 40, shippingPending: false });
    expect(p.discount.amount).toBe(0);
  });

  it('metodo desconocido (Resumen sin elegir): sin descuento', () => {
    const p = computePayable({ itemsSubtotal: 400, shipping: { kind: 'fee', fee: 40 }, payMethod: null, pickup: false });
    expect(p.total).toBe(440);
  });

  it('tarjeta con envio: 10% solo de productos, envio intacto', () => {
    const p = computePayable({ itemsSubtotal: 400, shipping: { kind: 'fee', fee: 40 }, payMethod: 'pay', pickup: false });
    expect(p.discount.amount).toBe(40);
    expect(p.total).toBe(400);
    expect(p.totalBeforeDiscount).toBe(440);
  });

  it('tarjeta + retiro: apila sobre el subtotal ya con -15%', () => {
    const p = computePayable({ itemsSubtotal: 237.99, shipping: { kind: 'none' }, payMethod: 'pay', pickup: true });
    expect(p.discount.amount).toBe(23.8);
    expect(p.total).toBe(214.19);
  });

  it('envio por confirmar: no bloquea, suma 0, marca shippingPending y el 10% sigue aplicando a productos', () => {
    const p = computePayable({ itemsSubtotal: 400, shipping: { kind: 'pending' }, payMethod: 'pay', pickup: false });
    expect(p).toMatchObject({ shippingFee: 0, shippingPending: true, total: 360 });
    expect(p.discount.amount).toBe(40);
  });

  it('el anticipo 80% se calcula sobre el total ya descontado', () => {
    const p = computePayable({ itemsSubtotal: 400, shipping: { kind: 'fee', fee: 40 }, payMethod: 'pay', pickup: false });
    expect(depositOf(p.total)).toBe(320);
    expect(amountToChargeNow(p.total, 80)).toBe(320);
    expect(amountToChargeNow(p.total, 100)).toBe(400);
  });

  it('payMethodForDiscount: pasos 0-3 nunca; Resumen solo tras elegir; pago/wompi/resultado siempre', () => {
    for (const s of ['producto', 'medidas', 'precio', 'zonaEntrega']) {
      expect(payMethodForDiscount(s, 'pay', true)).toBeNull();
    }
    expect(payMethodForDiscount('resumen', 'pay', false)).toBeNull();
    expect(payMethodForDiscount('resumen', 'pay', true)).toBe('pay');
    expect(payMethodForDiscount('resumen', 'wa', true)).toBe('wa');
    for (const s of ['formaPago', 'wompi', 'resultado']) {
      expect(payMethodForDiscount(s, 'pay', false)).toBe('pay');
      expect(payMethodForDiscount(s, 'wa', false)).toBe('wa');
    }
  });

  it('payMethodForDiscount con la oferta online: tambien en precio y zonaEntrega, pero solo tras elegir; medidas/producto nunca', () => {
    for (const s of ['precio', 'zonaEntrega']) {
      expect(payMethodForDiscount(s, 'pay', true, true)).toBe('pay');
      expect(payMethodForDiscount(s, 'wa', true, true)).toBe('wa');
      expect(payMethodForDiscount(s, 'pay', false, true)).toBeNull();
      expect(payMethodForDiscount(s, 'pay', true, false)).toBeNull();
      expect(payMethodForDiscount(s, 'pay', true)).toBeNull();
    }
    for (const s of ['producto', 'medidas']) {
      expect(payMethodForDiscount(s, 'pay', true, true)).toBeNull();
    }
    expect(payMethodForDiscount('resumen', 'pay', true, true)).toBe('pay');
    expect(payMethodForDiscount('resumen', 'pay', false, true)).toBeNull();
    expect(payMethodForDiscount('formaPago', 'wa', false, true)).toBe('wa');
  });

  it('formatDiscount usa el signo menos tipografico', () => {
    expect(formatDiscount(40)).toBe('−$40.00');
  });
});
