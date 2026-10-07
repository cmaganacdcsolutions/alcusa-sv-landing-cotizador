// Promociones del mes (R3). Fuente de build: src/content/promotions.json, que sigue el contrato publico de
// ADR-011 §4 (`/api/promotions.json` que publica el panel admin). El parser/validador vive en
// promotionsParser.ts (sin `node:fs`, apto para el navegador); este modulo solo agrega la lectura del JSON
// y los ganchos de build, y re-exporta todo para no cambiar los imports existentes (`@content/promotions`).
// El HTML horneado en build es el respaldo (SEO, sin JS, falla del fetch); el navegador lo refresca con
// components/promotionsRuntime.ts.
import { readFileSync } from 'node:fs';
import raw from './promotions.json';
import { parsePromotions, selectActivePromotions, todayInSV, type Promotion } from './promotionsParser';

export * from './promotionsParser';

/**
 * Ganchos SOLO de build para e2e (scripts/build-e2e-fixtures.mjs): permiten construir la
 * landing con un JSON de fixture y una fecha congelada, para que las pruebas no dependan
 * de la vigencia del seed. En produccion no se definen y no tienen efecto.
 */
const FIXTURE_FILE = process.env.ALCUSA_PROMOS_FILE;
const FROZEN_TODAY = process.env.ALCUSA_PROMOS_TODAY;
const source: unknown = FIXTURE_FILE ? JSON.parse(readFileSync(FIXTURE_FILE, 'utf8')) : raw;

/** Todas las promos del archivo (validadas; lanza en build si el JSON es invalido). */
export const PROMOTIONS: readonly Promotion[] = parsePromotions(source);

/** Promos vigentes hoy (SV), maximo MAX_PROMOS. Vacio = la seccion queda oculta (el navegador puede llenarla). */
export function getActivePromotions(now: Date = new Date()): Promotion[] {
  return selectActivePromotions(PROMOTIONS, FROZEN_TODAY ?? todayInSV(now));
}
