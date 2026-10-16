// Convierte las fotos oficiales de Zarandas y Fachadas (06-assets/images/{zarandas,fachadas}) a
// public/images/fotos/<nombre>-<ancho>.webp (ancho = min(800, nativo), sin upscale; sharp aplica EXIF con rotate()) y hornea
// <nombre>-amb.webp con scripts/bake-ambient.mjs. Uso: node scripts/convert-categorias.mjs <dir 06-assets/images>
import sharp from 'sharp';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bakeAmbient } from './bake-ambient.mjs';

const SETS = [
  ['zarandas', /^zaranda-aluminio-negro\.png$/, (f) => f.replace(/\.png$/, '')],
  ['fachadas', /^fachada-\d+\.(png|jpeg)$/, (f) => f.replace(/\.(png|jpeg)$/, '')],
];
const src = process.argv[2];
const out = join(process.cwd(), 'public', 'images', 'fotos');
mkdirSync(out, { recursive: true });
const table = {};
for (const [dir, re, stem] of SETS) {
  for (const f of readdirSync(join(src, dir)).filter((n) => re.test(n))) {
    const input = join(src, dir, f);
    const { width, height, orientation } = await sharp(input).metadata();
    const swap = orientation && orientation >= 5;
    const w0 = swap ? height : width;
    // Una sola variante (<= 800 px): la foto se muestra a <= ~400 px CSS (2x = 800), sin lightbox que pida el ancho nativo.
    const widths = [Math.min(800, w0)];
    for (const w of widths) {
      await sharp(input).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toFile(join(out, `${stem(f)}-${w}.webp`));
    }
    table[stem(f)] = { widths, native: swap ? [height, width] : [width, height] };
  }
}
console.log(JSON.stringify(table));
console.error('bake-ambient:', JSON.stringify(await bakeAmbient(out)));
