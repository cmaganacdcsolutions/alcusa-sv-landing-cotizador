// Registro de promos para el navegador (isla): las del build (promotions.json), validadas con el mismo
// parser. Fecha: `__PROMOS_TODAY__` (solo e2e/smoke) o hoy en El Salvador.
import raw from '@content/promotions.json';
import { parsePromotions, todayInSV } from '@content/promotionsParser';
import { resolvePromoContext, toPromoContext, type PromoContext } from '@content/promoContext';

const PROMOS = parsePromotions(raw);
const frozen = typeof __PROMOS_TODAY__ === 'string' && __PROMOS_TODAY__ !== '' ? __PROMOS_TODAY__ : null;

/** Promo vigente por id (null = id invalido/vencido -> contexto normal). */
export function lookupActivePromo(id: string | null): PromoContext | null {
  return resolvePromoContext(id, PROMOS, frozen ?? todayInSV());
}

/** Promo por id sin mirar vigencia (restaurar un snapshot/retorno de Wompi con la promo con que se pago). */
export function lookupPromo(id: string | null): PromoContext | null {
  const p = id ? PROMOS.find((x) => x.id === id) : undefined;
  return p ? toPromoContext(p) : null;
}
