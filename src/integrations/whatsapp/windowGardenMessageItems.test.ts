import { describe, expect, it } from 'vitest';
import { buildGardenMessageItem, buildWindowMessageItems } from './windowGardenMessageItems';

describe('integrations/whatsapp windowGardenMessageItems', () => {
  it('maps priced window rows 1:1, annotating requiresQuote rows instead of dropping them', () => {
    const items = buildWindowMessageItems(
      [
        { id: 'r1', qty: 1, widthM: 1.2, heightM: 1.0, subtotal: 162, requiresQuote: false },
        { id: 'r2', qty: 2, widthM: 1.5, heightM: 1.2, subtotal: null, requiresQuote: true },
      ],
      { modelLabel: 'Francesa', frameLabel: 'Natural', glassLabel: 'Claro', zona: 'Soyapango', entrega: 'con instalación' },
    );

    expect(items).toEqual([
      {
        producto: 'Ventana Francesa',
        anchoM: 1.2,
        altoM: 1.0,
        color: 'Natural',
        vidrio: 'Claro',
        zona: 'Soyapango',
        entrega: 'con instalación',
        subtotal: 162,
      },
      {
        producto: 'Ventana Francesa',
        anchoM: 1.5,
        altoM: 1.2,
        color: 'Natural',
        vidrio: 'Claro (cotización personalizada)',
        zona: 'Soyapango',
        entrega: 'con instalación',
        subtotal: 0,
      },
    ]);
  });

  it('maps a garden line, annotating vidrio when requiresQuote', () => {
    const item = buildGardenMessageItem({
      hojasLabel: '1 hoja',
      widthM: 1.0,
      heightM: 2.1,
      colorLabel: 'Bronce',
      glassLabel: 'Nevado 5 mm',
      subtotal: null,
      requiresQuote: true,
      zona: 'Apopa',
      entrega: 'con instalación',
    });

    expect(item).toEqual({
      producto: 'Puerta de jardín · 1 hoja',
      anchoM: 1.0,
      altoM: 2.1,
      color: 'Bronce',
      vidrio: 'Nevado 5 mm (cotización personalizada)',
      zona: 'Apopa',
      entrega: 'con instalación',
      subtotal: 0,
    });
  });
});
