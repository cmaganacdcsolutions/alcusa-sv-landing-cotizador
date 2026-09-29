import type { WompiMode } from './types';

/**
 * PUBLIC_COTIZADOR_MODE=mock|wompi. Default and fallback is `mock`: unknown or
 * legacy values (e.g. the old `live`) NEVER enable the real gateway. CI and
 * e2e force `mock` (playwright.config.ts, ci.yml).
 */
export function resolveWompiMode(raw: string | undefined): WompiMode {
  return raw === 'wompi' ? 'wompi' : 'mock';
}

export function getWompiMode(): WompiMode {
  return resolveWompiMode(import.meta.env.PUBLIC_COTIZADOR_MODE);
}
