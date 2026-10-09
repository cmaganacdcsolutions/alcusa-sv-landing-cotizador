// Hornea la miniatura ambiental de PhotoFrame (BUG-1008-01): public/images/fotos/<stem>-amb.webp, una por foto.
//
// Detras de cada foto oficial (fit contain) PhotoFrame muestra la misma imagen difuminada. Antes lo hacia
// `filter: blur(32px) saturate(.6) brightness(1.04)` en vivo (19 capas -> WebKit @DPR3 3-4x mas lento). Ahora el
// desenfoque, la saturacion y el brillo ya vienen en los pixeles de una miniatura minuscula (~40 px de ancho) y el
// CSS (.photo-frame__ambient--baked, filter: none) solo la escala. La URL de la miniatura se deriva de la de la
// foto en src/lib/photo-ambient (bakedAmbientSrc): no hay datos que tocar.
//
// - Autocontenido: cada miniatura sale de <stem>-800.webp (o, si el stem no tiene 800, de su ancho mayor), que ya
//   esta commiteado. Nunca reescribe un webp existente que no sea una miniatura.
// - Idempotente y determinista: mismos webp de entrada + mismos parametros = mismos bytes; solo escribe si cambian.
// - Uso: node scripts/bake-ambient.mjs [dirFotos]   (por defecto public/images/fotos)
//   scripts/convert-fotos.mjs lo invoca al final, asi que las fotos futuras salen con su miniatura.
import sharp from 'sharp';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Mismo sufijo que AMBIENT_SUFFIX de src/lib/photo-ambient/index.ts (el test de fs vigila que coincidan).
const SUFFIX = 'amb';
const PREFERRED_WIDTH = 800;

/**
 * Parametros de la miniatura. `saturation` y `brightness` son los de var(--photo-ambient-saturate) y
 * var(--photo-ambient-brightness) de tokens.css: se hornean aqui y el CSS ya no los aplica. `blur` es la
 * desviacion estandar en px de la MINIATURA (no del marco): el blur en vivo era fijo (32px) y este escala con
 * el marco (marco/40 x 1.2), asi que no hay un valor exacto para todos los tamanos. Calibrado contra el blur
 * en vivo con el CSS real (RMSE por canal sobre las 28 fotos): 4 es el mejor compromiso entre la card
 * de escritorio (232 px, ideal ~5) y la de movil (359 px, ideal ~3). Mas bajo se ve mas definido que el
 * original; mas alto, mas plano.
 */
export const PARAMS = { width: 40, blur: 4, saturation: 0.6, brightness: 1.04, quality: 60 };

/** Matriz de `saturate(s)` de CSS (Filter Effects 1) para recomb: lo mismo que hacia el navegador en sRGB. */
function saturateMatrix(s) {
  return [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  ];
}

/** Miniatura ambiental (Buffer webp) a partir de una foto. */
export async function renderAmbient(photoPath, params = PARAMS) {
  return sharp(photoPath)
    .resize({ width: params.width })
    .blur(params.blur)
    .recomb(saturateMatrix(params.saturation))
    .linear(params.brightness, 0)
    .webp({ quality: params.quality })
    .toBuffer();
}

/** { stem -> anchos disponibles } de las fotos de `dir`, sin contar las miniaturas. */
function photosByStem(dir) {
  const stems = new Map();
  for (const file of readdirSync(dir)) {
    const match = /^(.+)-(\d+)\.webp$/.exec(file); // ultimo -<ancho>.webp: igual que bakedAmbientSrc
    if (!match) continue;
    const widths = stems.get(match[1]) ?? [];
    widths.push(Number(match[2]));
    stems.set(match[1], widths);
  }
  return stems;
}

/** Genera <stem>-amb.webp para cada stem de `dir`. Devuelve { written, unchanged }. */
export async function bakeAmbient(dir, params = PARAMS) {
  let written = 0;
  let unchanged = 0;
  for (const [stem, widths] of [...photosByStem(dir)].sort(([a], [b]) => a.localeCompare(b))) {
    const width = widths.includes(PREFERRED_WIDTH) ? PREFERRED_WIDTH : Math.max(...widths);
    const out = join(dir, `${stem}-${SUFFIX}.webp`);
    const bytes = await renderAmbient(join(dir, `${stem}-${width}.webp`), params);
    if (existsSync(out) && readFileSync(out).equals(bytes)) {
      unchanged += 1;
    } else {
      writeFileSync(out, bytes);
      written += 1;
    }
  }
  return { written, unchanged };
}

// Solo corre al invocarse directo (node scripts/bake-ambient.mjs); convert-fotos.mjs importa bakeAmbient.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] ?? join(fileURLToPath(new URL('..', import.meta.url)), 'public', 'images', 'fotos');
  const { written, unchanged } = await bakeAmbient(dir);
  console.log(`bake-ambient: ${written} escritas, ${unchanged} sin cambios (${dir})`);
}
