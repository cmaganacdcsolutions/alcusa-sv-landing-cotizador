// Round-trip guarantee: site promotions.json -> promos:import -> admin store -> publish = the same promotions.json
// (same promos, prices, links, images), semantically. Publishing from the admin must not silently change the live site.
// Runs on the in-memory store and, when credentials exist, on MariaDB (DB_TEST_NAME only, via db-env.ts). The last
// block re-checks against the REAL site file of the sibling worktree when it is present (skipped otherwise).
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { AdminStore, StoredPromo } from '../../src/modules/admin/store.ts';
import { MemoryAdminStore } from '../../src/modules/admin/store.ts';
import { importPromotions } from '../../src/modules/promotions/import.ts';
import { validatePromotions } from '../../src/modules/promotions/schema.ts';
import { type PromoInput, PromoService } from '../../src/modules/promotions/service.ts';
import { dbEnv, openStore, resetAdminTables, SKIP_MSG } from './db-env.ts';
import { makeSite, type Site, type SiteDoc } from './promo-site.ts';

const NOW = (): Date => new Date('2026-10-06T12:00:00Z');

/** Semantic form of a promotions.json: ignores generated_at and treats an absent price_before as null (the loader does the same). */
function semantic(doc: SiteDoc): unknown {
  return doc.promotions.map((p) => ({ ...p, price_before: p['price_before'] ?? null, cotizador_params: p['cotizador_params'] ?? null }));
}

const inputOf = (p: StoredPromo): PromoInput => ({
  title: p.title, description: p.description, image: p.image, image_alt: p.image_alt, price_before: p.price_before, price_promo: p.price_promo,
  product_slug: p.product_slug, color: p.cotizador_params?.color ?? null, vidrio: p.cotizador_params?.vidrio ?? null, starts_on: p.starts_on, ends_on: p.ends_on, rules: p.rules,
});

function roundTrip(name: string, make: () => Promise<{ store: AdminStore; reset: () => Promise<void> }>): void {
  describe(`round trip: ${name}`, () => {
    let s: Site;
    let store: AdminStore;
    let out: string;
    let svc: PromoService;
    const published = (): SiteDoc => JSON.parse(readFileSync(join(out, 'promotions.json'), 'utf8')) as SiteDoc;

    beforeEach(async () => {
      const m = await make();
      await m.reset();
      store = m.store;
      s = await makeSite();
      out = mkdtempSync(join(tmpdir(), 'promo-out-'));
      svc = new PromoService({ repo: store, outDir: out, audit: (e) => store.audit(e), now: NOW });
      await importPromotions(s.doc, { repo: store, sitePublicDir: s.publicDir, imagesDir: s.imagesDir, imageUrlPrefix: '/images/promos', now: NOW, audit: (e) => store.audit(e) });
    });

    it('publishing right after the import yields the site file, semantically equal', async () => {
      await svc.republish();
      const doc = published();
      expect(validatePromotions(doc)).toEqual([]);
      expect(doc.promotions.length).toBe(3);
      expect(semantic(doc)).toEqual(semantic(s.doc));
      // spelled out for the reader: prices, links (product + colour + glass) and image URLs
      expect(doc.promotions.map((p) => [p['id'], p['price_promo'], p['product_slug'], (p['cotizador_params'] as { color: string; vidrio: string }).color, (p['cotizador_params'] as { color: string; vidrio: string }).vidrio, p['image']])).toEqual([
        ['promo-puerta-aquaclara', 222, 'recta', 'natural', 'claro', '/images/promos/promo-1-900.webp'],
        ['promo-corrediza-nevado', 290, 'recta', 'natural', 'nevado', '/images/promos/promo-2-900.webp'],
        ['promo-aquafold', 279.99, 'recta', 'natural', 'aquafold', '/images/promos/promo-3-900.webp'],
      ]);
    });

    it('every published image URL resolves to a flyer present in the admin image store (900 and 600 px)', async () => {
      await svc.republish();
      const files = readdirSync(s.imagesDir);
      for (const p of published().promotions) {
        const f = String(p['image']).split('/').pop() as string;
        expect(files).toContain(f);
        expect(files).toContain(f.replace('-900.', '-600.'));
      }
    });

    it('ordinary admin operations keep the file equal: unpublish+publish, saving the form unchanged, re-importing', async () => {
      expect((await svc.setStatus('carlos', 'promo-aquafold', false)).ok).toBe(true);
      expect(published().promotions.length).toBe(2); // not vacuous: the file does react to the admin
      expect((await svc.setStatus('carlos', 'promo-aquafold', true)).ok).toBe(true);
      expect(semantic(published())).toEqual(semantic(s.doc));

      for (const p of await svc.list()) {
        const res = await svc.update('carlos', p.id, inputOf(p));
        expect(res.ok, JSON.stringify(res)).toBe(true);
      }
      expect(semantic(published())).toEqual(semantic(s.doc));

      await importPromotions(s.doc, { repo: store, sitePublicDir: s.publicDir, imagesDir: s.imagesDir, imageUrlPrefix: '/images/promos', now: NOW });
      await svc.republish();
      expect(semantic(published())).toEqual(semantic(s.doc));
      expect((await svc.list()).length).toBe(3);
    });

    it('the colour is never dropped by the admin: form without colour keeps it, form with colour changes/clears it, republish keeps it', async () => {
      const cpOf = (id: string): unknown => published().promotions.find((p) => p['id'] === id)?.['cotizador_params'];
      const prev = (await svc.get('promo-corrediza-nevado')) as StoredPromo;
      expect(prev.cotizador_params).toEqual({ color: 'natural', vidrio: 'nevado' });

      // a caller that does not know the colour (undefined) must not erase it
      const noColor = inputOf(prev);
      delete noColor.color;
      expect((await svc.update('carlos', prev.id, { ...noColor, title: 'Titulo editado' })).ok).toBe(true);
      expect(cpOf(prev.id)).toEqual({ color: 'natural', vidrio: 'nevado' });

      // the form always sends the colour: a new value replaces it, "Ninguno" (null) clears it, vidrio is independent
      expect((await svc.update('carlos', prev.id, { ...inputOf(prev), color: 'bronce' })).ok).toBe(true);
      expect(cpOf(prev.id)).toEqual({ color: 'bronce', vidrio: 'nevado' });
      expect((await svc.update('carlos', prev.id, { ...inputOf(prev), color: null })).ok).toBe(true);
      expect(cpOf(prev.id)).toEqual({ vidrio: 'nevado' });
      expect((await svc.update('carlos', prev.id, { ...inputOf(prev), color: 'natural' })).ok).toBe(true);
      await svc.republish();
      expect(cpOf(prev.id)).toEqual({ color: 'natural', vidrio: 'nevado' });
      expect(cpOf('promo-aquafold')).toEqual({ color: 'natural', vidrio: 'aquafold' });
    });

    it('rejects an unknown colour through the service (nothing is saved or published)', async () => {
      const prev = (await svc.get('promo-aquafold')) as StoredPromo;
      const res = await svc.update('carlos', prev.id, { ...inputOf(prev), color: 'fucsia' });
      expect(res.ok).toBe(false);
      expect(JSON.stringify(res)).toContain('color');
      expect((await svc.get(prev.id))?.cotizador_params).toEqual({ color: 'natural', vidrio: 'aquafold' });
    });

    it('archiving removes only that promo from the published file', async () => {
      await svc.archive('carlos', 'promo-corrediza-nevado');
      expect(published().promotions.map((p) => p['id'])).toEqual(['promo-puerta-aquaclara', 'promo-aquafold']);
    });
  });
}

roundTrip('memory store', () => Promise.resolve({ store: new MemoryAdminStore(), reset: () => Promise.resolve() }));

const env = dbEnv();
if (env) {
  const stores: Array<{ close: () => Promise<void> }> = [];
  roundTrip('MariaDB (test database)', () => {
    const store = openStore(env);
    stores.push(store);
    return Promise.resolve({ store, reset: () => resetAdminTables(env) });
  });
  afterAll(async () => {
    await resetAdminTables(env);
    await Promise.all(stores.map((x) => x.close()));
  });
} else {
  describe('round trip: MariaDB', () => {
    it.skip(SKIP_MSG, () => undefined);
  });
}

// Canary against the real thing: the live site file of the sibling worktree (not present in CI => skipped).
const REAL_JSON = join(import.meta.dirname, '..', '..', '..', '..', 'assets-oficiales', 'src', 'content', 'promotions.json');
describe.skipIf(!existsSync(REAL_JSON))('round trip: the real site promotions.json (assets-oficiales)', () => {
  it('import + publish reproduces it exactly (semantically)', async () => {
    const doc = JSON.parse(readFileSync(REAL_JSON, 'utf8')) as SiteDoc;
    const store = new MemoryAdminStore();
    const out = mkdtempSync(join(tmpdir(), 'promo-out-'));
    const imagesDir = mkdtempSync(join(tmpdir(), 'promo-img-'));
    await importPromotions(doc, { repo: store, sitePublicDir: join(REAL_JSON, '..', '..', '..', 'public'), imagesDir, imageUrlPrefix: '/images/promos', now: NOW });
    await new PromoService({ repo: store, outDir: out, audit: (e) => store.audit(e), now: NOW }).republish();
    const back = JSON.parse(readFileSync(join(out, 'promotions.json'), 'utf8')) as SiteDoc;
    expect(semantic(back)).toEqual(semantic(doc));
  });
});
