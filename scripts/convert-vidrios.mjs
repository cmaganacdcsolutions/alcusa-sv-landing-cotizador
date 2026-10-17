// Recortes de textura de vidrio -> public/images/vidrios/glass-<clave>-{64,128}.webp (swatches 2026-10-17).
// Fuente (solo lectura): 06-assets/images/vidrios/. Uso: node scripts/convert-vidrios.mjs <dirOrigen>
// Cada caja {left, top, size} es un cuadrado sobre el vidrio (sin marco, manija ni pared).
// Se exporta a 64px (1x del swatch mas grande) y 128px (2x); objetivo <= 4 KB por archivo.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CROPS = {
  mallado: { file: 'mallado-claro-6mm.jpeg', left: 470, top: 250, size: 150 },
  nevado: { file: 'promo-nevado-instalada.png', left: 98, top: 200, size: 100 },
  aquafold: { file: 'promo-aquafold-instalada.png', left: 70, top: 200, size: 340 },
};
const src = process.argv[2];
const out = join(process.cwd(), 'public', 'images', 'vidrios');
mkdirSync(out, { recursive: true });
for (const [key, c] of Object.entries(CROPS)) {
  for (const px of [64, 128]) {
    const info = await sharp(join(src, c.file))
      .extract({ left: c.left, top: c.top, width: c.size, height: c.size })
      .resize(px, px, { kernel: 'lanczos3' })
      .modulate({ brightness: 1.15, saturation: 0.7 }) // los originales salen oscuros/oliva por la luz del cuarto
      .webp({ quality: 80, effort: 6 })
      .toFile(join(out, `glass-${key}-${px}.webp`));
    console.log(key, px, info.size);
  }
}
