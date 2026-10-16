import { describe, expect, it } from 'vitest';
import { priceStraight, priceHinged, priceGarden, priceWindow, priceCorner } from './index';

// Aluminio NEGRO (decision 2026-10-16): en puertas de ducha recta/bisagra se cobra igual que blanco/bronce
// ("puerta pesada"). Jardin y ventanas se cotizan siempre con asesor. En L: negro no se ofrece.
describe('engine/pricing — aluminio negro', () => {
  it('recta: negro = tabla de color (igual que blanco/bronce) en todo vidrio', () => {
    for (const glass of ['claro', 'nevado', 'decorado', 'mallado', 'duplex'] as const) {
      const negro = priceStraight({ widthCm: 110, color: 'negro', glass, pickup: false });
      expect(negro.requiresQuote).toBe(false);
      expect(negro.price).not.toBeNull();
      expect(negro).toEqual(priceStraight({ widthCm: 110, color: 'bronce', glass, pickup: false }));
      expect(negro).toEqual(priceStraight({ widthCm: 110, color: 'blanco', glass, pickup: false }));
    }
  });

  it('recta: negro con retiro en tienda aplica el mismo descuento', () => {
    expect(priceStraight({ widthCm: 110, color: 'negro', glass: 'claro', pickup: true })).toEqual(
      priceStraight({ widthCm: 110, color: 'blanco', glass: 'claro', pickup: true }),
    );
  });

  it('recta: los otros colores siguen con precio (no regresion)', () => {
    expect(priceStraight({ widthCm: 110, color: 'natural', glass: 'claro', pickup: false }).price).toBe(258);
  });

  it('bisagra: negro = tabla de color (igual que blanco/bronce)', () => {
    const negro = priceHinged({ widthCm: 80, color: 'negro', glass: 'nevado', qty: 2 });
    expect(negro.requiresQuote).toBe(false);
    expect(negro.subtotal).not.toBeNull();
    expect(negro).toEqual(priceHinged({ widthCm: 80, color: 'bronce', glass: 'nevado', qty: 2 }));
  });

  it('jardin: negro => asesor', () => {
    expect(priceGarden({ widthM: 1.0, heightM: 2.1, hojas: 1, color: 'negro', glass: 'claro', qty: 1 })).toEqual({
      subtotal: null,
      requiresQuote: true,
    });
  });

  it('ventana francesa: marco negro => asesor', () => {
    const r = priceWindow({ widthM: 1.2, heightM: 1.0, model: 'francesa', frame: 'negro', glass: 'claro', zaranda: false, desmontaje: false, qty: 1 });
    expect(r.requiresQuote).toBe(true);
    expect(r.subtotal).toBeNull();
  });

  it('en L: negro no se ofrece y no se cotiza con precio', () => {
    expect(priceCorner({ color: 'negro', model: 'aquaclara' })).toEqual({ price: null, requiresQuote: true });
  });
});
