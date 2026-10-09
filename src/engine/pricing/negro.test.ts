import { describe, expect, it } from 'vitest';
import { priceStraight, priceHinged, priceGarden, priceWindow, priceCorner } from './index';

// Aluminio NEGRO (decision 2026-10-08): no hay precio oficial; toda seleccion negro se cotiza con asesor.
describe('engine/pricing — aluminio negro => requiresQuote', () => {
  it('recta: negro en toda medida y vidrio', () => {
    for (const glass of ['claro', 'nevado', 'decorado', 'mallado', 'duplex'] as const) {
      expect(priceStraight({ widthCm: 110, color: 'negro', glass, pickup: false })).toEqual({
        price: null,
        transportIncluded: false,
        requiresQuote: true,
      });
    }
  });

  it('recta: los otros colores siguen con precio (no regresion)', () => {
    expect(priceStraight({ widthCm: 110, color: 'natural', glass: 'claro', pickup: false }).price).toBe(258);
  });

  it('bisagra: negro => asesor', () => {
    expect(priceHinged({ widthCm: 80, color: 'negro', glass: 'nevado', qty: 1 })).toEqual({
      subtotal: null,
      requiresQuote: true,
    });
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
