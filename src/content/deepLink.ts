// Pure `?producto=` parser (ADR-008 §3). No `window`: the island passes
// `location.search`. Unknown/invalid slugs resolve to `none` (ignored).
import { resolveDeepLink, type DeepLinkResolution } from './catalog';

export const DEEP_LINK_PARAM = 'producto';

export function parseDeepLink(search: string): DeepLinkResolution {
  return resolveDeepLink(new URLSearchParams(search).get(DEEP_LINK_PARAM));
}

export function cotizadorHref(slug: string): string {
  return `/cotizador?${DEEP_LINK_PARAM}=${encodeURIComponent(slug)}`;
}
