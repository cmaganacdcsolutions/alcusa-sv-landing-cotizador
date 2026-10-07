import { expect, test } from './fixtures';

// Las paginas /catalogo/** se eliminaron: cada URL vieja aterriza en su ancla del inicio.
const CASES: readonly (readonly [from: string, hash: string])[] = [
  ['/catalogo', '#catalogo'],
  ['/catalogo/ventanas', '#ventanas'],
  ['/catalogo/puertas-de-jardin', '#puertas-de-jardin'],
  ['/catalogo/puertas-de-bano', '#puertas-de-bano'],
  ['/catalogo/puertas-de-bano/templada-10mm', '#p-templada-10mm'],
  ['/catalogo/puertas-de-bano/recta', '#p-recta'],
  ['/catalogo/puertas-de-bano/en-l', '#p-en-l'],
  ['/catalogo/puertas-de-bano/bisagra', '#p-bisagra'],
  ['/catalogo/puertas-de-jardin/jardin-1-hoja', '#p-jardin-1-hoja'],
  ['/catalogo/puertas-de-jardin/jardin-2-hojas', '#p-jardin-2-hojas'],
  ['/catalogo/puertas-de-jardin/jardin-3-hojas', '#p-jardin-3-hojas'],
  ['/catalogo/ventanas/ventana-francesa', '#p-ventana-francesa'],
  ['/catalogo/ventanas/ventana-bilbao', '#p-ventana-bilbao'],
  // Combos de asesor: tienen tarjeta en "Más opciones para tu jardín".
  ['/catalogo/puertas-de-jardin/jardin-2-fijas-2-corredizas', '#p-jardin-2-fijas-2-corredizas'],
  ['/catalogo/puertas-de-jardin/jardin-1-fijo-3-corredizas', '#p-jardin-1-fijo-3-corredizas'],
];

test.describe('redirects de las paginas de catalogo eliminadas', () => {
  for (const [from, hash] of CASES) {
    test(`${from} -> /${hash}`, async ({ page }) => {
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`^[^#]*/${hash}$`));
    });
  }
});
