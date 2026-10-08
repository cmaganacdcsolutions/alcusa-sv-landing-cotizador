import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORIES, findBySlug, hasVariants } from './catalog';
import { cotizadorHref } from './deepLink';
import {
  CATEGORY_CONTENT,
  ITEM_CONTENT,
  assertCatalogContent,
  contentFor,
  validateCatalogContent,
  type CatalogContent,
} from './catalogContent';
import {
  allCatalogSlugs,
  cardTitle,
  defaultVariant,
  detailTitle,
  gridColsClass,
  advisorSubject,
  categorySlugOf,
  indexChips,
  moreOptionsTitle,
  priceView,
  primaryImage,
  splitSubcategories,
  verLabel,
} from './catalogView';

const PUBLIC = join(process.cwd(), 'public');
const fileExists = (p: string): boolean => existsSync(join(PUBLIC, p));

describe('catalog content vs model (build-time validation)', () => {
  it('has a content entry for every slug and no orphans', () => {
    expect(validateCatalogContent(allCatalogSlugs())).toEqual([]);
  });

  it('every referenced image exists under public/ (no 404 <img>)', () => {
    expect(validateCatalogContent(allCatalogSlugs(), undefined, fileExists)).toEqual([]);
  });

  it('assertCatalogContent throws with the offending slug', () => {
    const bad: Record<string, CatalogContent> = { recta: { images: [], pending: [] } };
    const issues = validateCatalogContent(['recta', 'nuevo'], bad);
    expect(issues.map((i) => i.slug)).toEqual(expect.arrayContaining(['recta', 'nuevo']));
    expect(() => assertCatalogContent(['nuevo'])).toThrow(/nuevo/);
  });

  it('flags contradictions: image + pending:photo, relative src, short alt, orphan', () => {
    const c: Record<string, CatalogContent> = {
      a: { images: [{ src: '/x.jpg', width: 1, height: 1, alt: 'Puerta de prueba' }], pending: ['photo'], description: 'd' },
      b: { images: [{ src: 'x.jpg', width: 1, height: 1, alt: 'ok' }], pending: [], description: 'd' },
      zzz: { images: [], pending: ['photo', 'description'] },
    };
    const problems = validateCatalogContent(['a', 'b'], c).map((i) => `${i.slug}:${i.problem}`);
    expect(problems.some((p) => p.startsWith('a:tiene imagen'))).toBe(true);
    expect(problems.some((p) => p.startsWith('b:src no absoluto'))).toBe(true);
    expect(problems.some((p) => p.startsWith('b:alt vacío'))).toBe(true);
    expect(problems.some((p) => p.startsWith('zzz:contenido huérfano'))).toBe(true);
  });

  it('no content entry references an Alcusa photo (renders live in home-media.ts); unknown slugs fall back to the placeholder', () => {
    for (const slug of ['jardin-1-hoja', 'jardin-2-hojas', 'en-l']) {
      expect(primaryImage(slug)).toBeNull();
      expect(contentFor(slug).pending).toContain('photo');
    }
    const all = JSON.stringify({ ...CATEGORY_CONTENT, ...ITEM_CONTENT });
    expect(all).not.toContain('/images/renders/');
    expect(all).not.toMatch(new RegExp("images/(catalog|card-|hero-|galeria|finish-)"));
    expect(primaryImage('slug-sin-contenido')).toBeNull();
    expect(contentFor('slug-sin-contenido').pending).toContain('photo');
  });

  it('content keys are unique across categories and items', () => {
    const dup = Object.keys(CATEGORY_CONTENT).filter((k) => k in ITEM_CONTENT);
    expect(dup).toEqual([]);
  });
});

describe('catalog view + slug routing', () => {
  it('every category/subcategory slug resolves in the model and is unique (static route params)', () => {
    const subRoutes = CATEGORIES.flatMap((c) => c.subcategories.map((s) => `${c.slug}/${s.slug}`));
    expect(new Set(subRoutes).size).toBe(subRoutes.length);
    for (const c of CATEGORIES) {
      expect(findBySlug(c.slug)).toBe(c);
      for (const s of c.subcategories) expect(findBySlug(s.slug)).toBe(s);
    }
    expect(subRoutes).toContain('puertas-de-bano/en-l');
    expect(subRoutes).toContain('puertas-de-jardin/jardin-1-fijo-3-corredizas');
  });

  it('keeps the client taxonomy order and "Más opciones" split', () => {
    const [bano, jardin, ventanas, abatibles] = CATEGORIES;
    expect(bano?.subcategories.map((s) => s.slug)).toEqual(['templada-10mm', 'recta', 'en-l', 'bisagra', 'templada-10mm-abatible']);
    expect(splitSubcategories(bano!).more.map((s) => s.slug)).toEqual(['templada-10mm-abatible']);
    const { main, more } = splitSubcategories(jardin!);
    expect(main.map((s) => s.slug)).toEqual(['jardin-1-hoja', 'jardin-2-hojas', 'jardin-3-hojas']);
    expect(more.map((s) => s.name)).toEqual(['2 fijas + 2 corredizas', '1 fijo + 3 corredizas']);
    expect(ventanas?.subcategories.map((s) => s.name)).toEqual(['Francesa', 'Bilbao', 'Bilbao con medio punto']);
    expect(splitSubcategories(ventanas!).more.map((s) => s.slug)).toEqual(['ventana-bilbao-medio-punto']);
    expect(abatibles?.slug).toBe('puertas-abatibles');
    expect(splitSubcategories(abatibles!).more).toEqual([]); // todas son tarjetas principales
    expect(abatibles?.subcategories.every((s) => s.advisorOnly)).toBe(true);
  });

  it('board copy: card/detail titles and index chips', () => {
    const bano = CATEGORIES[0]!;
    expect(bano.subcategories.map(cardTitle)).toEqual(['Templada 10 mm', 'Rectas', 'En L', 'De bisagra', 'Abatible templada 10 mm']);
    expect(detailTitle(findBySlug('en-l') as { slug: string; name: string })).toBe('Puerta en L');
    expect(indexChips(bano)).toEqual(['Templada 10 mm', 'Rectas', 'En L', 'De bisagra', 'Más opciones']);
    expect(indexChips(CATEGORIES[1]!)).toEqual(['1 hoja', '2 hojas', '3 hojas', 'Más opciones']);
    expect(verLabel(bano)).toBe('Ver puertas de baño');
    expect(verLabel(CATEGORIES[2]!)).toBe('Ver ventanas');
    expect(moreOptionsTitle('puertas-de-jardin')).toBe('Más opciones para tu jardín');
    expect(moreOptionsTitle('puertas-de-bano')).toBe('Más opciones para tu baño');
    expect(moreOptionsTitle('ventanas')).toBe('Más opciones para tus ventanas');
    expect(categorySlugOf('abatible-oficina-cerrador')).toBe('puertas-abatibles');
    expect(categorySlugOf('l-frosted')).toBe('puertas-de-bano');
    expect(advisorSubject('puertas-de-jardin', '1 fijo + 3 corredizas')).toBe('una puerta de jardín 1 fijo + 3 corredizas');
  });

  it('price view: "desde" from the model, advisor has no price, never a $ for advisor', () => {
    expect(priceView(findBySlug('en-l') as never)).toEqual({ kind: 'from', amount: 444, text: '$444' });
    expect(priceView(findBySlug('jardin-2-fijas-2-corredizas') as never)).toEqual({ kind: 'advisor' });
  });

  it('En L defaults to Aquaclara and each chip deep-links to its own slug', () => {
    const enL = findBySlug('en-l');
    expect(enL && 'subcategories' in enL).toBe(false);
    const sub = CATEGORIES[0]!.subcategories.find((s) => s.slug === 'en-l')!;
    expect(hasVariants(sub)).toBe(true);
    if (hasVariants(sub)) {
      expect(defaultVariant(sub.variants)?.slug).toBe('l-aquaclara');
      expect(sub.variants.map((v) => cotizadorHref(v.slug))).toEqual([
        '/cotizador?producto=l-aquaclara',
        '/cotizador?producto=l-frosted',
        '/cotizador?producto=l-aquafold',
      ]);
    }
  });

  it('grid column class caps at 4', () => {
    expect([1, 2, 3, 4, 7].map(gridColsClass)).toEqual(['cols-1', 'cols-2', 'cols-3', 'cols-4', 'cols-4']);
  });
});
