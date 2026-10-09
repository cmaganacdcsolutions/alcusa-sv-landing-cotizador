// Registro de promos para el navegador (isla). ADR-014 addendum 2: el build (promotions.json) es la SEMILLA y
// el respaldo; `hydratePromoRegistry()` la reemplaza con /api/promotions.json (lo que publica el panel admin),
// validado con el mismo parser que el home. Fecha: `__PROMOS_TODAY__` (solo e2e/smoke) o hoy en El Salvador.
import raw from '@content/promotions.json';
import {
  PROMOTIONS_ENDPOINT,
  isSafePromoImage,
  parsePromotions,
  selectActivePromotions,
  todayInSV,
  type Promotion,
} from '@content/promotionsParser';
import { resolvePromoContext, toPromoContext, type PromoContext } from '@content/promoContext';

export const HYDRATE_TIMEOUT_MS = 2500;

export type PromoRegistrySource = 'build' | 'runtime';

const SEED: readonly Promotion[] = parsePromotions(raw);
const frozen = typeof __PROMOS_TODAY__ === 'string' && __PROMOS_TODAY__ !== '' ? __PROMOS_TODAY__ : null;
const today = (): string => frozen ?? todayInSV();

// `active` = vigentes hoy, max. 3 (misma regla que el home); `published` = todo el JSON (para snapshots).
let active: readonly Promotion[] = SEED;
let published: readonly Promotion[] = SEED;
let source: PromoRegistrySource = 'build';
let pending: Promise<PromoRegistrySource> | null = null;

/** De donde salen las promos hoy: la semilla del build o el JSON publicado. */
export function getPromoRegistrySource(): PromoRegistrySource {
  return source;
}

async function fetchPublished(fetcher: typeof fetch): Promise<readonly Promotion[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HYDRATE_TIMEOUT_MS);
  try {
    const res = await fetcher(PROMOTIONS_ENDPOINT, { cache: 'no-cache', signal: ctrl.signal });
    if (!res.ok) return null;
    const parsed = parsePromotions((await res.json()) as unknown);
    return parsed.every((p) => isSafePromoImage(p.image)) ? parsed : null;
  } catch {
    return null; // red, timeout, cuerpo vacio o JSON invalido: se conserva la semilla
  } finally {
    clearTimeout(timer);
  }
}

/** Un solo fetch por carga (memoizado). Nunca rechaza: ante cualquier falla queda `'build'`. */
export function hydratePromoRegistry(fetcher: typeof fetch = fetch): Promise<PromoRegistrySource> {
  pending ??= fetchPublished(fetcher).then((list) => {
    if (list) {
      published = list;
      active = selectActivePromotions(list, today());
      source = 'runtime';
    }
    return source;
  });
  return pending;
}

/** Solo tests: vuelve a la semilla y olvida la hidratacion. */
export function resetPromoRegistry(): void {
  active = SEED;
  published = SEED;
  source = 'build';
  pending = null;
}

/** Promo vigente por id (null = id invalido/vencido -> contexto normal). */
export function lookupActivePromo(id: string | null): PromoContext | null {
  return resolvePromoContext(id, active, today());
}

/**
 * Promo por id sin mirar vigencia (restaurar un snapshot/retorno de Wompi). Busca primero en el JSON publicado
 * (el precio editado manda) y despues en la semilla del build. Archivada y fuera de la semilla = null.
 */
export function lookupPromo(id: string | null): PromoContext | null {
  if (!id) return null;
  const p = published.find((x) => x.id === id) ?? SEED.find((x) => x.id === id);
  return p ? toPromoContext(p) : null;
}
