import type {
  AluminumColor,
  CornerModel,
  GardenColor,
  GardenGlass,
  StraightGlass,
  WindowGlass,
} from '@engine/pricing';

// Single source of truth for which finish options each model's measures step
// offers. The forms render from these lists, the swatches are keyed by the same
// ids (glassSwatches.tsx) and the e2e matrix (tests/e2e/cotizador-combinaciones)
// iterates them, so a new option is rendered AND covered automatically.
export const STRAIGHT_COLORS: readonly AluminumColor[] = ['natural', 'blanco', 'bronce'];
export const STRAIGHT_GLASSES: readonly StraightGlass[] = ['claro', 'nevado', 'decorado', 'aquafold', 'mallado', 'duplex'];

// Corner: only Natural/Bronce (no Blanco option rendered at all, T5.1 AC).
export const CORNER_COLORS: readonly AluminumColor[] = ['natural', 'bronce'];
export const CORNER_MODELS: readonly CornerModel[] = ['aquaclara', 'frosted', 'aquafold'];

export const HINGED_COLORS: readonly AluminumColor[] = ['natural', 'blanco', 'bronce'];
export const HINGED_GLASSES: readonly StraightGlass[] = ['nevado', 'claro', 'decorado', 'mallado', 'duplex'];

export const GARDEN_COLORS: readonly GardenColor[] = ['blanco', 'bronce', 'natural'];
export const GARDEN_GLASSES: readonly GardenGlass[] = ['claro', 'nevado', 'decorado', 'mallado', 'duplex'];

export const WINDOW_FRAMES: readonly AluminumColor[] = ['blanco', 'bronce', 'natural'];
export const WINDOW_GLASSES: readonly WindowGlass[] = ['claro', 'bronce', 'super_gris', 'reflectivo_azul', 'reflectivo_bronce'];
