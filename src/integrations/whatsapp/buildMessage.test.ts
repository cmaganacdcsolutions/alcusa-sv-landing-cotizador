import { describe, expect, it } from 'vitest';
import { buildQuoteMessage } from './buildMessage';

// Snapshot test against the literal template in prototype-spec.md §2.6,
// using the S1 acceptance-criteria fixture: recta 110cm/Natural/Claro,
// zona Soyapango, con instalación (total $262.00 = 222 + 40).
describe('integrations/whatsapp buildMessage', () => {
  it('matches the literal §2.6 template for the recta AC fixture', () => {
    const message = buildQuoteMessage({
      items: [
        {
          producto: 'Puerta de baño recta',
          anchoM: 1.1,
          altoM: 1.85,
          color: 'Natural',
          vidrio: 'Claro 5 mm',
          zona: 'Soyapango',
          entrega: 'con instalación',
          subtotal: 222,
        },
      ],
      transporte: 40,
      total: 262,
      anticipo: 209.6,
      saldo: 52.4,
    });

    expect(message).toBe(
      'Hola ALCUSA, quiero confirmar esta cotización:\n\n' +
        '1. Puerta de baño recta — 1.10×1.85 m · Color: Natural · Vidrio: Claro 5 mm\n' +
        '   Zona: Soyapango · Entrega: con instalación\n' +
        '   Subtotal: $222.00\n\n' +
        'Transporte: $40.00\n' +
        'Total estimado: $262.00\n' +
        'Anticipo (80%): $209.60 · Saldo (20% al entregar): $52.40\n' +
        'Dirección: [dirección]\n\n' +
        'Por favor confirmen medidas, disponibilidad y forma de pago. ¡Gracias!',
    );
  });

  it('starts with the mandated greeting and supports multiple items', () => {
    const message = buildQuoteMessage({
      items: [
        {
          producto: 'Puerta de baño recta',
          anchoM: 1.1,
          altoM: 1.85,
          color: 'Natural',
          vidrio: 'Claro 5 mm',
          zona: 'Soyapango',
          entrega: 'retiro en tienda',
          subtotal: 188.7,
        },
        {
          producto: 'Puerta de baño recta',
          anchoM: 1.25,
          altoM: 1.85,
          color: 'Blanco',
          vidrio: 'Claro 5 mm',
          zona: 'Soyapango',
          entrega: 'con instalación',
          subtotal: 366,
        },
      ],
      transporte: 40,
      total: 594.7,
      anticipo: 475.76,
      saldo: 118.94,
    });

    expect(message.startsWith('Hola ALCUSA, quiero confirmar esta cotización:')).toBe(true);
    expect(message).toContain('1. Puerta de baño recta — 1.10×1.85 m');
    expect(message).toContain('2. Puerta de baño recta — 1.25×1.85 m');
    expect(message).toContain('Dirección: [dirección]');
  });

  // S5 (hinged, cart-aware qty 1-50): `cantidad` is opt-in and only shown when > 1,
  // so the S1 fixture above stays byte-for-byte unchanged for qty-1 items.
  it('appends "· Cantidad: N" only when cantidad > 1 (hinged qty, S5)', () => {
    const withoutQty = buildQuoteMessage({
      items: [
        {
          producto: 'Puerta con bisagra',
          anchoM: 0.7,
          altoM: 1.85,
          color: 'Natural',
          vidrio: 'Claro 5 mm',
          zona: '—',
          entrega: 'retiro en tienda',
          subtotal: 270,
          cantidad: 1,
        },
      ],
      transporte: 0,
      total: 270,
      anticipo: 216,
      saldo: 54,
    });
    expect(withoutQty).toContain('Color: Natural · Vidrio: Claro 5 mm\n');
    expect(withoutQty).not.toContain('Cantidad:');

    const withQty = buildQuoteMessage({
      items: [
        {
          producto: 'Puerta con bisagra',
          anchoM: 0.65,
          altoM: 1.85,
          color: 'Natural',
          vidrio: 'Nevado 5 mm',
          zona: '—',
          entrega: 'retiro en tienda',
          subtotal: 622,
          cantidad: 2,
        },
      ],
      transporte: 0,
      total: 622,
      anticipo: 497.6,
      saldo: 124.4,
    });
    expect(withQty).toContain('Color: Natural · Vidrio: Nevado 5 mm · Cantidad: 2\n');
  });
});
