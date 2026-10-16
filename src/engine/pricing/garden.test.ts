import { describe, expect, it } from 'vitest';
import { priceGarden } from './garden';

// Decision 2026-10-16 (client): puertas de jardin se cotizan SOLO con asesor
// ("solo con las puertas de ducha se puede dar una cotizacion certera"). Nunca hay precio online.
describe('engine/pricing/garden — priceGarden (solo asesor)', () => {
  const quote = { subtotal: null, requiresQuote: true };

  it.each([
    ['1 hoja 2.10 (antes promo $410)', { widthM: 1.0, heightM: 2.1, hojas: 1 as const }],
    ['2 hojas 2.10 (antes promo $819)', { widthM: 2.0, heightM: 2.1, hojas: 2 as const }],
    ['3 hojas 2.40 (antes promo $1,229)', { widthM: 3.0, heightM: 2.4, hojas: 3 as const }],
    ['a la medida (antes por m2)', { widthM: 3.0, heightM: 2.6, hojas: 'custom' as const }],
  ])('%s => sin precio, requiresQuote', (_name, dims) => {
    expect(priceGarden({ ...dims, color: 'blanco', glass: 'claro', qty: 1 })).toEqual(quote);
  });

  it('otros colores/vidrios y cantidades tambien => asesor', () => {
    expect(priceGarden({ widthM: 1.0, heightM: 2.1, hojas: 1, color: 'negro', glass: 'claro', qty: 1 })).toEqual(quote);
    expect(priceGarden({ widthM: 1.0, heightM: 2.1, hojas: 1, color: 'blanco', glass: 'nevado', qty: 4 })).toEqual(quote);
  });
});
