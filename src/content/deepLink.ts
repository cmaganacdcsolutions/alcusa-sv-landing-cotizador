// Pure `?producto=` parser (ADR-008 §3). No `window`: the island passes
// `location.search`. Unknown/invalid slugs resolve to `none` (ignored).
import type { AluminumColor, GardenGlass, StraightGlass, WindowGlass } from '@engine/pricing';
import { resolveDeepLink, type DeepLinkResolution, type QuoterModel } from './catalog';

export const DEEP_LINK_PARAM = 'producto';

export function parseDeepLink(search: string): DeepLinkResolution {
  return resolveDeepLink(new URLSearchParams(search).get(DEEP_LINK_PARAM));
}

/** `?vidrio=` — vidrio preseleccionado (promos). Solo aplica al modelo recta. */
export const GLASS_PARAM = 'vidrio';

export const DEEP_LINK_GLASSES: readonly StraightGlass[] = ['claro', 'nevado', 'decorado', 'mallado', 'duplex', 'aquafold'];

/** Valor valido de vidrio o null (valores desconocidos se ignoran). */
export function toGlassParam(raw: string | null | undefined): StraightGlass | null {
  return DEEP_LINK_GLASSES.find((g) => g === raw) ?? null;
}

export function parseGlassParam(search: string): StraightGlass | null {
  return toGlassParam(new URLSearchParams(search).get(GLASS_PARAM));
}

export function cotizadorHref(slug: string, params: { vidrio?: string } = {}): string {
  const base = `/cotizador?${DEEP_LINK_PARAM}=${encodeURIComponent(slug)}`;
  return params.vidrio ? `${base}&${GLASS_PARAM}=${encodeURIComponent(params.vidrio)}` : base;
}

// ---- Home configurator contract (home-catalogo-completo §6): paso, color, vidrio por modelo ----
export const STEP_PARAM = 'paso';
export const COLOR_PARAM = 'color';

/** `?paso=medidas` fuerza el avance a Medidas aun con un slug legacy (recta, bisagra...). */
export function wantsMedidas(search: string): boolean {
  return new URLSearchParams(search).get(STEP_PARAM) === 'medidas';
}

/** Colores de aluminio aceptados por `?color=` (los modelos que no tienen los 3 filtran despues). */
export const DEEP_LINK_COLORS: readonly AluminumColor[] = ['natural', 'blanco', 'bronce', 'negro'];
const COLORS = DEEP_LINK_COLORS;

/** Valor valido de color o null (valores desconocidos se ignoran). */
export function toColorParam(raw: string | null | undefined): AluminumColor | null {
  return COLORS.find((c) => c === raw) ?? null;
}

const CORNER_COLOR_VALUES: readonly AluminumColor[] = ['natural', 'bronce'];
const GARDEN_GLASS_VALUES: readonly GardenGlass[] = ['claro', 'nevado', 'decorado', 'mallado', 'duplex'];
const HINGED_GLASS_VALUES: readonly StraightGlass[] = ['claro', 'nevado', 'decorado', 'mallado', 'duplex'];
const WINDOW_GLASS_VALUES: readonly WindowGlass[] = ['claro', 'bronce', 'super_gris', 'reflectivo_azul', 'reflectivo_bronce'];

export type DeepLinkOptions =
  | { model: 'recta' | 'bisagra'; color?: AluminumColor; glass?: StraightGlass }
  | { model: 'l'; color?: AluminumColor }
  | { model: 'jardin'; color?: AluminumColor; glass?: GardenGlass }
  | { model: 'ventana'; color?: AluminumColor; glass?: WindowGlass }
  | { model: 'templado' };

const pick = <T extends string>(list: readonly T[], raw: string | null): T | undefined => list.find((v) => v === raw);

/** Opciones `color`/`vidrio` validas para el modelo; lo invalido se ignora (nunca error). */
export function parseDeepLinkOptions(search: string, model: QuoterModel): DeepLinkOptions {
  const q = new URLSearchParams(search);
  const color = q.get(COLOR_PARAM);
  const glass = q.get(GLASS_PARAM);
  switch (model) {
    case 'recta':
      return { model, color: pick(COLORS, color), glass: pick(DEEP_LINK_GLASSES, glass) };
    case 'bisagra':
      return { model, color: pick(COLORS, color), glass: pick(HINGED_GLASS_VALUES, glass) };
    case 'l':
      return { model, color: pick(CORNER_COLOR_VALUES, color) };
    case 'jardin':
      return { model, color: pick(COLORS, color), glass: pick(GARDEN_GLASS_VALUES, glass) };
    case 'ventana':
      return { model, color: pick(COLORS, color), glass: pick(WINDOW_GLASS_VALUES, glass) };
    default:
      return { model: 'templado' };
  }
}
