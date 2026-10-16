// windows — pure pricing module for "Ventana Francesa o Bilbao". No
// React/Astro/window/document/fetch imports.
//
// Decision 2026-10-16 (client): las ventanas se cotizan SOLO con asesor — "solo con las puertas de
// ducha se puede dar una cotizacion certera". `priceWindow` nunca devuelve precio; el cotizador sigue
// recogiendo la configuracion y termina en el flujo asesor/WhatsApp (requiresQuote). Las tarifas de
// pricingTables (WINDOW_RATE, etc.) se conservan como referencia por si el cliente reabre el tema.
import { WINDOW_ZARANDA_MIN_AREA_M2, WINDOW_ZARANDA_RATE_PER_M2 } from '@content/pricingTables';
import type { WindowPriceInput, WindowPriceResult } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Zaranda add-on per window: max(area, 0.80 m2) * $25. Invalid measures => 0. Not used for a price while ventanas are asesor-only. */
export function windowZarandaCost(widthM: number, heightM: number): number {
  const area = widthM * heightM;
  if (!Number.isFinite(area) || area <= 0) return 0;
  return round2(Math.max(area, WINDOW_ZARANDA_MIN_AREA_M2) * WINDOW_ZARANDA_RATE_PER_M2);
}

export function priceWindow(input: WindowPriceInput): WindowPriceResult {
  void input; // asesor-only: la configuracion no cambia el resultado
  return { subtotal: null, requiresQuote: true };
}
