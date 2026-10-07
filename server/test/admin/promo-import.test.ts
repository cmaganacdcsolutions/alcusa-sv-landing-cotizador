// promos:import: logic (importPromotions) + CLI behaviour (flags, production guard, dry-run). In-memory store + temp dirs only:
// no database, no network, nothing outside os.tmpdir().
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryAdminStore, type StoredPromo } from '../../src/modules/admin/store.ts';
import { ImportError, importPromotions } from '../../src/modules/promotions/import.ts';
import { parseImportArgs, productionRefusal, runImportCli } from '../../src/modules/promotions/import-cli.ts';
import { makeSite, type Site } from './promo-site.ts';

const NOW = (): Date => new Date('2026-10-06T12:00:00Z');

const opts = (s: Site, store: MemoryAdminStore, over: Record<string, unknown> = {}) => ({
  repo: store, sitePublicDir: s.publicDir, imagesDir: s.imagesDir, imageUrlPrefix: '/images/promos', now: NOW, audit: (e: Parameters<MemoryAdminStore['audit']>[0]) => store.audit(e), ...over,
});

describe('importPromotions', () => {
  let s: Site;
  let store: MemoryAdminStore;
  beforeEach(async () => {
    s = await makeSite();
    store = new MemoryAdminStore();
  });

  it('creates the 3 live promos as published, mapping every field the site uses', async () => {
    const r = await importPromotions(s.doc, opts(s, store));
    expect(r.counts).toEqual({ create: 3, update: 0, unchanged: 0, skipped: 0 });
    const all = await store.list();
    expect(all.map((p) => [p.id, p.status, p.sort_order])).toEqual([
      ['promo-puerta-aquaclara', 'published', 0], ['promo-corrediza-nevado', 'published', 1], ['promo-aquafold', 'published', 2],
    ]);
    const aquafold = await store.get('promo-aquafold');
    expect(aquafold).toMatchObject({
      title: 'Modelo Aquafold', price_promo: 279.99, price_before: null, product_slug: 'recta', cotizador_params: { color: 'natural', vidrio: 'aquafold' },
      starts_on: '2026-10-01', ends_on: '2026-10-31', image: '/images/promos/promo-3-900.webp', placeholder: false,
    });
    expect(aquafold?.rules).toContain('*Restricciones aplican');
    expect(aquafold?.image_alt).toContain('Restricciones aplican');
    expect(r.items.map((i) => i.link)).toEqual(['/cotizador?producto=recta&paso=medidas&color=natural&vidrio=claro', '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=nevado', '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=aquafold']);
  });

  it('copies both flyer sizes byte-for-byte into the admin image store', async () => {
    await importPromotions(s.doc, opts(s, store));
    expect(readdirSync(s.imagesDir).sort()).toEqual(['promo-1-600.webp', 'promo-1-900.webp', 'promo-2-600.webp', 'promo-2-900.webp', 'promo-3-600.webp', 'promo-3-900.webp']);
    for (const f of readdirSync(s.imagesDir)) {
      expect(readFileSync(join(s.imagesDir, f)).equals(readFileSync(join(s.publicDir, 'images', 'promos', f)))).toBe(true);
    }
  });

  it('applies the configured image URL prefix (same file names)', async () => {
    await importPromotions(s.doc, opts(s, store, { imageUrlPrefix: '/promo-media/' }));
    expect((await store.get('promo-aquafold'))?.image).toBe('/promo-media/promo-3-900.webp');
  });

  it('is idempotent: a second run changes nothing (no duplicates, no copies, no audit noise)', async () => {
    await importPromotions(s.doc, opts(s, store));
    const before = JSON.stringify(await store.list());
    const auditBefore = store.auditLog.length;
    const r = await importPromotions(s.doc, opts(s, store, { now: () => new Date('2026-10-07T09:00:00Z') }));
    expect(r.counts).toEqual({ create: 0, update: 0, unchanged: 3, skipped: 0 });
    expect(r.imagesToCopy).toBe(0);
    expect((await store.list()).length).toBe(3);
    expect(JSON.stringify(await store.list())).toBe(before);
    expect(store.auditLog.length).toBe(auditBefore);
    expect(store.auditLog.map((a) => [a.actor, a.action])).toEqual([['cli', 'promo.imported'], ['cli', 'promo.imported'], ['cli', 'promo.imported']]);
  });

  it('dry-run reports the plan and writes nothing (store, images, audit)', async () => {
    const r = await importPromotions(s.doc, opts(s, store, { dryRun: true }));
    expect(r.dryRun).toBe(true);
    expect(r.counts.create).toBe(3);
    expect(r.imagesToCopy).toBe(6);
    expect(await store.list()).toEqual([]);
    expect(existsSync(s.imagesDir)).toBe(false);
    expect(store.auditLog).toEqual([]);
  });

  it('converges edited / archived promos back to the file, keeping created_at', async () => {
    await importPromotions(s.doc, opts(s, store));
    const prev = (await store.get('promo-aquafold')) as StoredPromo;
    await store.save({ ...prev, price_promo: 250, status: 'archived' });
    const r = await importPromotions(s.doc, opts(s, store, { now: () => new Date('2026-10-08T00:00:00Z') }));
    expect(r.counts).toMatchObject({ update: 1, unchanged: 2 });
    expect(r.items.find((i) => i.action === 'update')?.changes.sort()).toEqual(['price_promo', 'status']);
    expect(await store.get('promo-aquafold')).toMatchObject({ price_promo: 279.99, status: 'published', created_at: prev.created_at });
  });

  it('re-import adds the colour to a promo stored without it (store created before the colour existed): update of cotizador_params only', async () => {
    await importPromotions(s.doc, opts(s, store));
    const prev = (await store.get('promo-puerta-aquaclara')) as StoredPromo;
    await store.save({ ...prev, cotizador_params: { vidrio: 'claro' } });
    const dry = await importPromotions(s.doc, opts(s, store, { dryRun: true }));
    expect(dry.counts).toMatchObject({ update: 1, unchanged: 2 });
    expect(dry.items.find((i) => i.action === 'update')).toMatchObject({ id: 'promo-puerta-aquaclara', changes: ['cotizador_params'], link: '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=claro' });
    expect((await store.get('promo-puerta-aquaclara'))?.cotizador_params).toEqual({ vidrio: 'claro' }); // dry run wrote nothing
    await importPromotions(s.doc, opts(s, store));
    expect((await store.get('promo-puerta-aquaclara'))?.cotizador_params).toEqual({ color: 'natural', vidrio: 'claro' });
  });

  it('keeps entries with only vidrio / only color / no params working, with the matching link', async () => {
    const [a, b, c] = s.doc.promotions as Array<Record<string, unknown>>;
    const noParams: Record<string, unknown> = { ...c };
    delete noParams['cotizador_params'];
    const doc = { promotions: [{ ...a, cotizador_params: { vidrio: 'claro' } }, { ...b, cotizador_params: { color: 'bronce' } }, noParams] };
    const r = await importPromotions(doc, opts(s, store));
    expect(r.items.map((i) => i.link)).toEqual([
      '/cotizador?producto=recta&paso=medidas&vidrio=claro',
      '/cotizador?producto=recta&paso=medidas&color=bronce',
      '/cotizador?producto=recta',
    ]);
    expect((await store.list()).map((p) => p.cotizador_params)).toEqual([{ vidrio: 'claro' }, { color: 'bronce' }, undefined]);
  });

  it('skips placeholder promos and refuses a file that has only placeholders', async () => {
    const doc = { promotions: [...s.doc.promotions, { ...s.doc.promotions[0], id: 'promo-demo', placeholder: true }] };
    const r = await importPromotions(doc, opts(s, store));
    expect(r.counts).toMatchObject({ create: 3, skipped: 1 });
    expect(await store.get('promo-demo')).toBeNull();
    await expect(importPromotions({ promotions: [{ ...s.doc.promotions[0], placeholder: true }] }, opts(s, new MemoryAdminStore()))).rejects.toThrow(/placeholder/);
  });

  it('is all-or-nothing: one bad promo writes no row, no image, no audit', async () => {
    const doc = { promotions: [s.doc.promotions[0], { ...s.doc.promotions[1], image: '/images/promos/no-existe-900.webp' }] };
    await expect(importPromotions(doc, opts(s, store))).rejects.toBeInstanceOf(ImportError);
    expect(await store.list()).toEqual([]);
    expect(existsSync(s.imagesDir)).toBe(false);
    expect(store.auditLog).toEqual([]);
  });

  it.each([
    ['site validator (unknown slug)', { product_slug: 'nope' }, /catalogo/],
    ['site validator (unknown colour)', { cotizador_params: { color: 'fucsia', vidrio: 'claro' } }, /cotizador_params\.color/],
    ['admin limits (HTML in text)', { title: 'Puerta <b>' }, /HTML/],
    ['path traversal in image', { image: '/images/promos/../../../secret-900.webp' }, /no es una imagen soportada/],
    ['non-webp image name', { image: '/images/promos/promo-1.jpg' }, /no es una imagen soportada/],
    ['non-ascii id', { id: 'promo-ñandú' }, /ASCII/],
  ])('rejects: %s', async (_n, patch, re) => {
    const doc = { promotions: [{ ...s.doc.promotions[0], ...patch }] };
    await expect(importPromotions(doc, opts(s, store))).rejects.toThrow(re);
    expect(await store.list()).toEqual([]);
  });

  it('rejects an image that is not really WebP', async () => {
    writeFileSync(join(s.publicDir, 'images', 'promos', 'promo-1-900.webp'), 'not an image');
    await expect(importPromotions(s.doc, opts(s, store))).rejects.toThrow(/no se pudo leer|WebP/);
  });

  it('respects the 3-active cap against promos already published in those dates', async () => {
    const mk = (id: string): StoredPromo => ({
      id, placeholder: false, title: `Otra ${id}`, description: 'd', image: '/images/promos/otra-900.webp', image_alt: 'alt', price_before: null, price_promo: 100, product_slug: 'recta',
      starts_on: '2026-10-01', ends_on: '2026-10-31', rules: [], status: 'published', sort_order: 0, created_at: NOW().toISOString(), updated_at: NOW().toISOString(),
    });
    for (const id of ['otra-1', 'otra-2', 'otra-3']) await store.save(mk(id));
    await expect(importPromotions(s.doc, opts(s, store))).rejects.toThrow(/ya hay 3 promociones publicadas/);
    expect((await store.list()).length).toBe(3); // untouched
    // archived ones do not count
    await store.save({ ...mk('otra-3'), status: 'archived' });
    await store.save({ ...mk('otra-2'), status: 'archived' });
    await store.save({ ...mk('otra-1'), status: 'archived' });
    await expect(importPromotions(s.doc, opts(s, store))).resolves.toMatchObject({ counts: { create: 3 } });
  });
});

describe('promos:import CLI', () => {
  let s: Site;
  let store: MemoryAdminStore;
  let out: string[];
  let err: string[];
  const io = () => ({ out: (x: string) => void out.push(x), err: (x: string) => void err.push(x) });
  const env = (over: Record<string, string> = {}): NodeJS.ProcessEnv => ({ NODE_ENV: 'development', PROMO_IMAGES_DIR: s.imagesDir, PROMOTIONS_OUT_DIR: join(s.root, 'out'), ...over }) as NodeJS.ProcessEnv;
  beforeEach(async () => {
    s = await makeSite();
    store = new MemoryAdminStore();
    out = [];
    err = [];
  });

  it('parses flags and rejects bad usage', () => {
    expect(parseImportArgs(['x.json', '--dry-run', '--allow-production', '--site-public-dir', 'p'])).toEqual({ file: 'x.json', dryRun: true, publish: false, allowProduction: true, sitePublicDir: 'p' });
    expect(() => parseImportArgs([])).toThrow(/ruta/);
    expect(() => parseImportArgs(['a.json', 'b.json'])).toThrow(/ruta/);
    expect(() => parseImportArgs(['a.json', '--nope'])).toThrow();
  });

  it('refuses NODE_ENV=production unless --allow-production, before touching anything', async () => {
    expect(productionRefusal({ NODE_ENV: 'production' } as NodeJS.ProcessEnv, false)).toMatch(/--allow-production/);
    expect(productionRefusal({ NODE_ENV: 'production' } as NodeJS.ProcessEnv, true)).toBeNull();
    expect(productionRefusal({ NODE_ENV: 'development' } as NodeJS.ProcessEnv, false)).toBeNull();
    const code = await runImportCli([s.json], env({ NODE_ENV: 'production' }), io(), store);
    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/NODE_ENV=production/);
    expect(await store.list()).toEqual([]);
    expect(existsSync(s.imagesDir)).toBe(false);
    const ok = await runImportCli([s.json, '--allow-production'], env({ NODE_ENV: 'production' }), io(), store);
    expect(ok).toBe(0);
    expect((await store.list()).length).toBe(3);
  });

  it('--dry-run prints the plan (create/price/link/image) and writes nothing; --publish is ignored in dry-run', async () => {
    const code = await runImportCli([s.json, '--dry-run', '--publish'], env(), io(), store);
    expect(code).toBe(0);
    const text = out.join('\n');
    expect(text).toContain('DRY-RUN');
    expect(text).toContain('promo-aquafold  [CREARIA]');
    expect(text).toContain('ahora $279.99');
    expect(text).toContain('link: /cotizador?producto=recta&paso=medidas&color=natural&vidrio=aquafold');
    expect(text).toContain('resumen: crear=3 actualizar=0 sin_cambios=0 omitidas=0 imagenes_a_copiar=6');
    expect(await store.list()).toEqual([]);
    expect(existsSync(join(s.root, 'out'))).toBe(false);
  });

  it('real run is idempotent through the CLI and --publish writes promotions.json', async () => {
    expect(await runImportCli([s.json, '--publish'], env(), io(), store)).toBe(0);
    expect(await runImportCli([s.json], env(), io(), store)).toBe(0);
    expect(out.join('\n')).toContain('resumen: crear=0 actualizar=0 sin_cambios=3');
    expect((await store.list()).length).toBe(3);
    const published = JSON.parse(readFileSync(join(s.root, 'out', 'promotions.json'), 'utf8')) as { promotions: unknown[] };
    expect(published.promotions.length).toBe(3);
  });

  it('reports a rejected import with exit 1 and a clean message (no stack, no paths of secrets)', async () => {
    writeFileSync(join(s.publicDir, 'images', 'promos', 'promo-2-900.webp'), 'x');
    const code = await runImportCli([s.json], env(), io(), store);
    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/no se escribio nada/);
    expect(await store.list()).toEqual([]);
  });

  it('fails cleanly on a missing / invalid json file', async () => {
    expect(await runImportCli([join(s.root, 'nada.json')], env(), io(), store)).toBe(1);
    expect(err.join('\n')).toMatch(/nada\.json/);
  });
});
