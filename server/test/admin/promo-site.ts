// Shared helper for the promos:import suites: a fake site checkout in os.tmpdir() (never touches the real worktrees).
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

export const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'site-promotions.json');

export interface SiteDoc {
  generated_at?: string;
  promotions: Array<Record<string, unknown>>;
}

export interface Site {
  root: string;
  json: string;
  publicDir: string;
  imagesDir: string;
  doc: SiteDoc;
}

/** src/content/promotions.json (copy of the real site file) + public/images/promos/promo-N-{600,900}.webp (generated, distinct bytes). */
export async function makeSite(): Promise<Site> {
  const root = mkdtempSync(join(tmpdir(), 'promo-import-'));
  const publicDir = join(root, 'public');
  const dir = join(publicDir, 'images', 'promos');
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(root, 'src', 'content'), { recursive: true });
  for (const [n, rgb] of [[1, { r: 200, g: 30, b: 30 }], [2, { r: 30, g: 200, b: 30 }], [3, { r: 30, g: 30, b: 200 }]] as const) {
    for (const w of [600, 900]) {
      writeFileSync(join(dir, `promo-${n}-${w}.webp`), await sharp({ create: { width: w, height: w, channels: 3, background: rgb } }).webp().toBuffer());
    }
  }
  const json = join(root, 'src', 'content', 'promotions.json');
  writeFileSync(json, readFileSync(FIXTURE));
  return { root, json, publicDir, imagesDir: join(root, 'admin-images'), doc: JSON.parse(readFileSync(FIXTURE, 'utf8')) as SiteDoc };
}
