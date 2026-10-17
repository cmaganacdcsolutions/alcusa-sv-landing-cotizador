import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from './catalog';
import { FACHADAS_PHOTOS, UPCOMING_CATEGORIES, ZARANDA_PRODUCT } from './upcomingCategories';

const PUBLIC = join(process.cwd(), 'public');

describe('upcomingCategories', () => {
  it('orden y slugs contrato con navbar/footer', () => {
    expect(UPCOMING_CATEGORIES.map((c) => [c.slug, c.name])).toEqual([
      ['espejos', 'Espejos'],
      ['zarandas', 'Zarandas'],
      ['fachadas-comerciales', 'Fachadas comerciales'],
    ]);
  });
  it('solo Espejos sigue como placeholder', () => {
    expect(UPCOMING_CATEGORIES.map((c) => c.content.kind)).toEqual(['placeholder', 'product', 'gallery']);
  });
  it('mensajes de WhatsApp por categoria', () => {
    expect(UPCOMING_CATEGORIES.map((c) => c.waMessage)).toEqual([
      'Hola, quiero cotizar espejos.',
      'Hola, quiero cotizar zarandas para ventanas francesas y celosías.',
      'Hola, quiero cotizar una fachada comercial.',
    ]);
  });
  it('Zarandas: datos del cliente tal cual', () => {
    expect(ZARANDA_PRODUCT.title).toBe('Zarandas para ventanas francesas y celosías');
    expect(ZARANDA_PRODUCT.price).toBe('$25.00 por m²');
    expect(ZARANDA_PRODUCT.details).toEqual(['Aluminio negro o blanco', 'Área mínima: 0.80 m²']);
  });
  it('Fachadas: 10 fotos con alt unico y archivo en public', () => {
    expect(FACHADAS_PHOTOS).toHaveLength(10);
    expect(new Set(FACHADAS_PHOTOS.map((p) => p.alt)).size).toBe(10);
    for (const p of [...FACHADAS_PHOTOS, ZARANDA_PRODUCT.photo]) {
      expect(p.alt.length).toBeGreaterThan(10);
      expect(existsSync(join(PUBLIC, p.src)), p.src).toBe(true);
    }
  });
  it('CATEGORIES del cotizador sigue siendo exactamente las 3 con precio', () => {
    expect(CATEGORIES.map((c) => c.slug)).toEqual(['puertas-de-bano', 'puertas-de-jardin', 'ventanas']);
  });
});
