import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDocument, publishPromotions, PublishError } from '../../src/modules/promotions/publish.ts';
import { COLORS, GLASSES, PRODUCT_SLUGS, type PromoRecord, validatePromo, validatePromotions } from '../../src/modules/promotions/schema.ts';

const good: PromoRecord = {
  id: 'promo-x', placeholder: false, title: 'Puerta Aquaclara', description: 'Descripcion', image: '/images/promos/promo-1-900.webp',
  image_alt: 'alt', price_before: null, price_promo: 222, product_slug: 'recta', cotizador_params: { vidrio: 'claro' },
  starts_on: '2026-10-01', ends_on: '2026-10-31', rules: ['Instalada'],
};
const bad = (patch: Partial<Record<keyof PromoRecord, unknown>>): string[] => validatePromotions({ promotions: [{ ...good, ...patch }] });

describe('promo schema validator (same rules as the site loader)', () => {
  it('accepts the current contract, with or without price_before', () => {
    expect(validatePromotions({ promotions: [good] })).toEqual([]);
    const noBefore: Partial<PromoRecord> = { ...good };
    delete noBefore.price_before;
    expect(validatePromotions({ promotions: [noBefore] })).toEqual([]);
  });
  it.each([
    [{ title: '' }, 'title'], [{ image: ' ' }, 'image'], [{ price_promo: 0 }, 'price_promo'], [{ price_promo: '5' }, 'price_promo'],
    [{ price_before: 100, price_promo: 100 }, 'menor'], [{ price_before: -1 }, 'price_before'], [{ starts_on: '2026-02-30' }, 'starts_on'],
    [{ starts_on: '2026-11-01' }, 'posterior'], [{ product_slug: 'nope' }, 'catalogo'], [{ cotizador_params: { vidrio: 'rojo' } }, 'vidrio'],
    [{ cotizador_params: 5 }, 'objeto'], [{ rules: [1] }, 'rules'],
    [{ cotizador_params: { color: 'fucsia' } }, 'color'], [{ cotizador_params: { color: 7 } }, 'color'], [{ cotizador_params: { color: '', vidrio: 'claro' } }, 'color'],
  ])('rejects %j', (patch, needle) => {
    expect(bad(patch as never).join(' ')).toContain(needle);
  });
  it('accepts cotizador_params with colour (natural/blanco/bronce), with or without vidrio', () => {
    for (const color of COLORS) {
      expect(bad({ cotizador_params: { color, vidrio: 'claro' } })).toEqual([]);
      expect(bad({ cotizador_params: { color } })).toEqual([]);
    }
    expect(bad({ cotizador_params: {} })).toEqual([]);
  });
  it('rejects duplicate ids and a missing array', () => {
    expect(validatePromotions({ promotions: [good, good] }).join()).toContain('duplicado');
    expect(validatePromotions({})).toEqual(['falta el arreglo "promotions"']);
  });
  it('admin limits: no HTML, bounded rules', () => {
    expect(validatePromo({ ...good, title: '<b>x</b>' }).join()).toContain('HTML');
    expect(validatePromo({ ...good, rules: Array(7).fill('r') }).join()).toContain('Máximo');
  });
  it('closed lists match the site (catalog.ts slugs, deepLink.ts glasses)', () => {
    const cat = readFileSync(join(__dirname, '../../../src/content/catalog.ts'), 'utf8');
    for (const s of PRODUCT_SLUGS) expect(cat).toContain(`slug: '${s}'`);
    const dl = readFileSync(join(__dirname, '../../../src/content/deepLink.ts'), 'utf8');
    // `vidrio` deep-link params exist only once the assets-oficiales branch is merged; check then.
    if (dl.includes('DEEP_LINK_GLASSES')) for (const g of GLASSES) expect(dl).toContain(`'${g}'`);
    if (dl.includes('DEEP_LINK_COLORS')) for (const c of COLORS) expect(dl).toContain(`'${c}'`);
  });
});

describe('published cotizador_params keeps the colour', () => {
  it('writes color then vidrio (stable order) and drops nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'promos-'));
    const file = await publishPromotions([{ ...good, cotizador_params: { vidrio: 'nevado', color: 'bronce' } }], dir, new Date('2026-10-06T00:00:00Z'));
    const doc = JSON.parse(readFileSync(file, 'utf8')) as { promotions: Array<{ cotizador_params: Record<string, string> }> };
    expect(Object.entries(doc.promotions[0]?.cotizador_params ?? {})).toEqual([['color', 'bronce'], ['vidrio', 'nevado']]);
  });
  it('colour alone is published; no finishes publishes no cotizador_params at all', () => {
    const noParams: PromoRecord = { ...good, id: 'c' };
    delete noParams.cotizador_params;
    const [a, b, c] = buildDocument([
      { ...good, cotizador_params: { color: 'natural' } }, { ...good, id: 'b', cotizador_params: {} }, noParams,
    ], new Date('2026-10-06T00:00:00Z')).promotions;
    expect(a?.cotizador_params).toEqual({ color: 'natural' });
    expect(b).not.toHaveProperty('cotizador_params');
    expect(c).not.toHaveProperty('cotizador_params');
  });
});

describe('atomic publish', () => {
  it('writes valid JSON via temp + rename, leaving no temp files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'promos-'));
    const file = await publishPromotions([good], dir, new Date('2026-10-06T00:00:00Z'));
    const doc = JSON.parse(readFileSync(file, 'utf8')) as { promotions: PromoRecord[]; generated_at: string };
    expect(doc.promotions[0]).toMatchObject({ id: 'promo-x', price_before: null, cotizador_params: { vidrio: 'claro' }, placeholder: false });
    expect(readdirSync(dir)).toEqual(['promotions.json']);
  });
  it('an invalid set throws and leaves the previous file untouched', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'promos-'));
    writeFileSync(join(dir, 'promotions.json'), 'PREVIOUS');
    await expect(publishPromotions([{ ...good, product_slug: 'nope' }], dir)).rejects.toBeInstanceOf(PublishError);
    expect(readFileSync(join(dir, 'promotions.json'), 'utf8')).toBe('PREVIOUS');
    expect(readdirSync(dir)).toEqual(['promotions.json']);
  });
  it('a failing rename cleans the temp file and keeps the old one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'promos-'));
    // target path is a directory => rename onto it fails
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(dir, 'promotions.json'));
    await expect(publishPromotions([good], dir)).rejects.toThrow();
    expect(readdirSync(dir)).toEqual(['promotions.json']);
    expect(existsSync(join(dir, 'promotions.json'))).toBe(true);
  });
});
