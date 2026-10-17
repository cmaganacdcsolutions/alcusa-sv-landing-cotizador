// garden — pure pricing module for "Puerta de jardín". No
// React/Astro/window/document/fetch imports.
//
// Decision 2026-10-16 (client): las puertas de jardin se cotizan SOLO con asesor — "solo con las puertas
// de ducha se puede dar una cotizacion certera". `priceGarden` nunca devuelve precio; el cotizador sigue
// recogiendo la configuracion y termina en el flujo asesor/WhatsApp (requiresQuote). Las tablas de
// pricingTables (GARDEN_*) se conservan como referencia.
import type { GardenPriceInput, GardenPriceResult } from './types';

export function priceGarden(input: GardenPriceInput): GardenPriceResult {
  void input; // asesor-only: la configuracion no cambia el resultado
  return { subtotal: null, requiresQuote: true };
}
