import { describe, expect, it } from 'vitest';
import { buildPayOffer, hasOnlineOfferParam, ONLINE_DISCOUNT_LABEL, type BuildPayOfferInput } from './payOffer';

// recta 110 cm Natural/Claro: products $222.00; Soyapango transport $40.00 (never discounted).
const base: BuildPayOfferInput = {
  step: 'precio',
  offer: false,
  payMethod: 'pay',
  chosen: false,
  itemsSubtotal: 222,
  shipping: null,
  pickup: false,
};

describe('state/payOffer — buildPayOffer', () => {
  it('Precio sin oferta: vista previa $199.80 (-$22.20), sin aplicar', () => {
    expect(buildPayOffer(base)).toEqual({ mode: 'preview', discount: 22.2, cardTotal: 199.8 });
  });

  it('Precio con oferta aplicada: mismo monto, modo applied', () => {
    expect(buildPayOffer({ ...base, offer: true, chosen: true })).toEqual({
      mode: 'applied',
      discount: 22.2,
      cardTotal: 199.8,
    });
  });

  it('con la oferta pero sin metodo elegido (restaurado sin el link): vista previa', () => {
    expect(buildPayOffer({ ...base, offer: true, chosen: false })?.mode).toBe('preview');
  });

  it('Zona Soyapango: 10% solo de productos, envio intacto -> $239.80', () => {
    const o = buildPayOffer({
      ...base,
      step: 'zonaEntrega',
      offer: true,
      chosen: true,
      shipping: { kind: 'fee', fee: 40 },
    });
    expect(o).toEqual({ mode: 'applied', discount: 22.2, cardTotal: 239.8 });
  });

  it('Zona Soyapango sin oferta: vista previa $239.80', () => {
    const o = buildPayOffer({ ...base, step: 'zonaEntrega', shipping: { kind: 'fee', fee: 40 } });
    expect(o).toEqual({ mode: 'preview', discount: 22.2, cardTotal: 239.8 });
  });

  it('Zona Santa Ana (envio por confirmar) suma 0: $199.80', () => {
    const o = buildPayOffer({
      ...base,
      step: 'zonaEntrega',
      offer: true,
      chosen: true,
      shipping: { kind: 'pending' },
    });
    expect(o).toEqual({ mode: 'applied', discount: 22.2, cardTotal: 199.8 });
  });

  it('Resumen: aplicada solo tras elegir metodo; sin elegir es vista previa', () => {
    const resumen = { ...base, step: 'resumen', shipping: { kind: 'fee', fee: 40 } } as const;
    expect(buildPayOffer({ ...resumen, chosen: false })?.mode).toBe('preview');
    expect(buildPayOffer({ ...resumen, chosen: true })?.mode).toBe('applied');
    expect(buildPayOffer({ ...resumen, chosen: true, offer: true })?.cardTotal).toBe(239.8);
  });

  it('eligio WhatsApp (payMethod wa): el 10% no aplica, queda la vista previa de la tarjeta', () => {
    const o = buildPayOffer({ ...base, step: 'resumen', offer: true, chosen: true, payMethod: 'wa' });
    expect(o?.mode).toBe('preview');
    expect(o?.cardTotal).toBe(199.8);
  });

  it('retiro apila el 10% sobre el subtotal ya con -15%: 222 x 0.85 = 188.70 -> -18.87 -> 169.83', () => {
    const o = buildPayOffer({
      ...base,
      step: 'zonaEntrega',
      offer: true,
      chosen: true,
      itemsSubtotal: 188.7,
      shipping: { kind: 'none' },
      pickup: true,
    });
    expect(o).toEqual({ mode: 'applied', discount: 18.87, cardTotal: 169.83 });
  });

  it('solo precio, zonaEntrega y resumen; sin subtotal no hay oferta', () => {
    for (const step of ['producto', 'medidas', 'formaPago', 'wompi', 'resultado']) {
      expect(buildPayOffer({ ...base, step, offer: true, chosen: true })).toBeNull();
    }
    expect(buildPayOffer({ ...base, itemsSubtotal: 0 })).toBeNull();
  });

  it('una sola etiqueta para toda fila de descuento', () => {
    expect(ONLINE_DISCOUNT_LABEL).toBe('Descuento pago con tarjeta en línea (10%)');
  });
});

describe('state/payOffer — hasOnlineOfferParam', () => {
  it('solo oferta=online10 exacto activa la oferta', () => {
    expect(hasOnlineOfferParam('?oferta=online10')).toBe(true);
    expect(hasOnlineOfferParam('?producto=recta&paso=medidas&oferta=online10')).toBe(true);
    expect(hasOnlineOfferParam('?oferta=otra')).toBe(false);
    expect(hasOnlineOfferParam('?oferta=ONLINE10')).toBe(false);
    expect(hasOnlineOfferParam('?oferta=')).toBe(false);
    expect(hasOnlineOfferParam('?producto=recta')).toBe(false);
    expect(hasOnlineOfferParam('')).toBe(false);
  });
});
