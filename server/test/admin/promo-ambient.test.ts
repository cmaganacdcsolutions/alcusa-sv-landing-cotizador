// Miniatura ambiental de los flyers (BUG-1008-01): mismos parametros que scripts/bake-ambient.mjs del sitio y
// convencion <stem>-<ancho>.webp -> <stem>-amb.webp en el directorio de imagenes (subida del admin e import).
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { MemoryAdminStore } from '../../src/modules/admin/store.ts';
import { AMBIENT_PARAMS, ensureAmbient, renderAmbient } from '../../src/modules/promotions/ambient.ts';
import { ingestPromoImage } from '../../src/modules/promotions/images.ts';
import { importPromotions } from '../../src/modules/promotions/import.ts';
import { makeSite } from './promo-site.ts';

const SITE_SCRIPT = join(import.meta.dirname, '..', '..', '..', 'scripts', 'bake-ambient.mjs');
const tmp = (): string => mkdtempSync(join(tmpdir(), 'promo-amb-'));
const photo = (): Promise<Buffer> =>
  sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 180, g: 40, b: 60 } } })
    .composite([{ input: { create: { width: 400, height: 300, channels: 3, background: { r: 20, g: 200, b: 220 } } }, left: 100, top: 100 }])
    .png().toBuffer();

describe('miniatura ambiental de flyers', () => {
  it('usa los mismos parametros y produce los mismos bytes que scripts/bake-ambient.mjs', async () => {
    const site = (await import(pathToFileURL(SITE_SCRIPT).href)) as { PARAMS: Record<string, number>; renderAmbient: (p: string) => Promise<Buffer> };
    expect(AMBIENT_PARAMS).toEqual(site.PARAMS);
    const dir = tmp();
    try {
      const src = join(dir, 'flyer.webp');
      await sharp(await photo()).webp().toFile(src);
      expect((await renderAmbient(src)).equals(await site.renderAmbient(src))).toBe(true);
    } finally {
      // Windows: el sharp del script del sitio puede seguir reteniendo el archivo; es un tmp, no importa.
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* tmp */ }
    }
  });

  it('subir un flyer genera <key>-amb.webp junto a -600 y -900 (webp chico, 40 px)', async () => {
    const dir = tmp();
    try {
      const r = await ingestPromoImage(await photo(), dir, '/images/promos');
      const key = r.publicPath.split('/').pop()!.replace('-900.webp', '');
      expect(readdirSync(dir).sort()).toEqual([`${key}-600.webp`, `${key}-900.webp`, `${key}-amb.webp`]);
      const meta = await sharp(readFileSync(join(dir, `${key}-amb.webp`))).metadata();
      expect([meta.format, meta.width]).toEqual(['webp', 40]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('importar genera -amb aun si el 900 ya estaba copiado, y es idempotente; ensureAmbient sin 900 no escribe', async () => {
    const s = await makeSite();
    const store = new MemoryAdminStore();
    const o = { repo: store, sitePublicDir: s.publicDir, imagesDir: s.imagesDir, imageUrlPrefix: '/images/promos', now: () => new Date('2026-10-06T12:00:00Z') };
    await importPromotions(s.doc, o);
    const amb = join(s.imagesDir, 'promo-1-amb.webp');
    expect(existsSync(amb)).toBe(true);
    rmSync(amb);
    await importPromotions(s.doc, o); // 900 sin cambios, falta la miniatura
    expect(existsSync(amb)).toBe(true);
    expect(await ensureAmbient(s.imagesDir, 'promo-1')).toBe(false); // ya al dia
    expect(await ensureAmbient(s.imagesDir, 'promo-inexistente')).toBe(false);
    expect(existsSync(join(s.imagesDir, 'promo-inexistente-amb.webp'))).toBe(false);
  });
});
