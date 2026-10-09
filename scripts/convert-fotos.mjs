// Convierte el portafolio oficial de Alcusa (06-assets/images/extracted/portafolio-web) a
// public/images/fotos/<nombre>-{800,<ancho nativo>}.webp. Sin upscale. Uso: node scripts/convert-fotos.mjs <dirOrigen>
// Al final hornea <nombre>-amb.webp (miniatura ambiental de PhotoFrame, BUG-1008-01) via scripts/bake-ambient.mjs:
// una foto nueva sale siempre con su miniatura (el test de fs de src/lib/photo-ambient falla si falta).
import sharp from 'sharp';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bakeAmbient } from './bake-ambient.mjs';

const NAMES = {
  1: 'ventana-francesa-negro', 2: 'jardin-1-fijo-3-corredizas', 3: 'jardin-1-fijo-3-corredizas-galeria',
  4: 'jardin-3-hojas-galeria', 5: 'jardin-3-hojas', 6: 'jardin-2-hojas-galeria', 7: 'jardin-1-hoja',
  8: 'ventana-bilbao', 9: 'bisagra', 10: 'recta', 11: 'bisagra-galeria', 12: 'jardin-2-fijas-2-corredizas',
  13: 'en-l', 14: 'abatible-interior-exterior', 15: 'bisagra-decorado', 16: 'ventana-bilbao-medio-punto',
  17: 'jardin-2-hojas', 18: 'ventana-francesa', 19: 'en-l-aquafold', 20: 'abatible-oficina-vidrio-fijo',
  21: 'recta-galeria', 22: 'recta-aquafold', 23: 'en-l-galeria', 24: 'abatible-oficina-cerrador',
  25: 'recta-nevado', 26: 'en-l-frosted', 27: 'templada-10mm', 28: 'templada-10mm-abatible',
};
const src = process.argv[2];
const out = join(process.cwd(), 'public', 'images', 'fotos');
mkdirSync(out, { recursive: true });
const files = readdirSync(src).filter((f) => /^portafolio-\d+\.(jpg|png)$/.test(f));
const table = {};
for (const f of files) {
  const n = Number(f.match(/\d+/)[0]);
  const name = NAMES[n];
  const { width, height } = await sharp(join(src, f)).metadata();
  const widths = [...new Set([...(width > 800 ? [800] : []), width])];
  if (n === 12) widths.unshift(480);
  for (const w of widths) {
    await sharp(join(src, f)).resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toFile(join(out, `${name}-${w}.webp`));
  }
  table[name] = { n, native: [width, height] };
}
console.log(JSON.stringify(table));
// stderr: stdout sigue siendo solo la tabla JSON.
console.error('bake-ambient:', JSON.stringify(await bakeAmbient(out)));
