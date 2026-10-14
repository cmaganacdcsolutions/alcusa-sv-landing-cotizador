import { describe, expect, it } from 'vitest';
import { CATEGORIES } from './catalog';
import { UPCOMING_CATEGORIES } from './upcomingCategories';

describe('upcomingCategories', () => {
  it('orden y slugs contrato con navbar/footer', () => {
    expect(UPCOMING_CATEGORIES.map((c) => c.slug)).toEqual(['espejos', 'zarandas', 'fachadas-comerciales']);
  });
  it('mensajes de WhatsApp por categoria', () => {
    expect(UPCOMING_CATEGORIES.map((c) => c.waMessage)).toEqual([
      'Hola, quiero cotizar espejos.',
      'Hola, quiero cotizar zarandas.',
      'Hola, quiero cotizar fachadas comerciales.',
    ]);
  });
  it('CATEGORIES del cotizador sigue siendo exactamente las 3 con precio', () => {
    expect(CATEGORIES.map((c) => c.slug)).toEqual(['puertas-de-bano', 'puertas-de-jardin', 'ventanas']);
  });
});
