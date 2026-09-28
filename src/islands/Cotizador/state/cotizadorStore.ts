// Reducer + hash/history slug map for the cotizador wizard (ADR-005).
// Pure — the hash/history side effects themselves live in Cotizador.tsx
// (islands are the only layer allowed to touch window/history).
import type { AluminumColor, CornerModel, StraightGlass } from '@engine/pricing';
import type { ProductId } from '@content/catalog';

export type CotizadorStep =
  | 'producto'
  | 'medidas'
  | 'precio'
  | 'zonaEntrega'
  | 'resumen'
  | 'formaPago'
  | 'wompi'
  | 'resultado';

// Slice 1 implements the first 6 steps end to end; wompi/resultado are S8.
export const STEP_ORDER: readonly CotizadorStep[] = [
  'producto',
  'medidas',
  'precio',
  'zonaEntrega',
  'resumen',
  'formaPago',
  'wompi',
  'resultado',
];

export const STEP_SLUGS: Readonly<Record<CotizadorStep, string>> = {
  producto: '0-producto',
  medidas: '1-medidas',
  precio: '2-precio',
  zonaEntrega: '3-zona-entrega',
  resumen: '4-resumen',
  formaPago: '5-forma-pago',
  wompi: '6-pago',
  resultado: '7-resultado',
};

export function slugToStep(slug: string): CotizadorStep | null {
  const entry = (Object.entries(STEP_SLUGS) as [CotizadorStep, string][]).find(([, s]) => s === slug);
  return entry ? entry[0] : null;
}

export type Entrega = 'instalacion' | 'retiro';

export const COLOR_LABELS: Readonly<Record<AluminumColor, string>> = {
  natural: 'Natural',
  blanco: 'Blanco',
  bronce: 'Bronce',
};

export const GLASS_LABELS: Readonly<Record<StraightGlass, string>> = {
  claro: 'Claro 5 mm',
  nevado: 'Nevado 5 mm',
  decorado: 'Decorado',
  mallado: 'Mallado',
  duplex: 'Dúplex',
};

export const CORNER_MODEL_LABELS: Readonly<Record<CornerModel, string>> = {
  aquaclara: 'Aquaclara',
  frosted: 'Frosted',
  aquafold: 'Aquafold',
};

export interface CotizadorState {
  step: CotizadorStep;
  productId: ProductId | null;
  width: string;
  color: AluminumColor;
  glass: StraightGlass;
  entrega: Entrega;
  zone: string;
  // corner ("l" — Cabina en L, S5 T5.1): fixed 0.80x0.80x1.85m, no width input.
  cornerModel: CornerModel;
  // tempered ("templado", S5 T5.2): reuses `width` (120-200cm); no extra fields.
  // hinged ("bisagra", S5 T5.3): qty + optional paño fijo. Reuses `width` (40-90cm),
  // `color` and `glass`.
  hingedQty: string;
  hingedFixedPanelEnabled: boolean;
  hingedFixedPanelWidthM: string;
  hingedFixedPanelHeightM: string;
}

export const initialCotizadorState: CotizadorState = {
  step: 'producto',
  productId: null,
  width: '110',
  color: 'natural',
  glass: 'claro',
  entrega: 'instalacion',
  zone: '',
  cornerModel: 'aquaclara',
  hingedQty: '1',
  hingedFixedPanelEnabled: false,
  hingedFixedPanelWidthM: '',
  hingedFixedPanelHeightM: '',
};

export type CotizadorAction =
  | { type: 'SELECT_PRODUCT'; productId: ProductId }
  | { type: 'SET_WIDTH'; value: string }
  | { type: 'SET_COLOR'; color: AluminumColor }
  | { type: 'SET_GLASS'; glass: StraightGlass }
  | { type: 'SET_ENTREGA'; entrega: Entrega }
  | { type: 'SET_ZONE'; zone: string }
  | { type: 'GOTO_STEP'; step: CotizadorStep }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'SET_CORNER_MODEL'; model: CornerModel }
  | { type: 'SET_HINGED_QTY'; value: string }
  | { type: 'TOGGLE_HINGED_FIXED_PANEL'; enabled: boolean }
  | { type: 'SET_HINGED_FIXED_PANEL_WIDTH'; value: string }
  | { type: 'SET_HINGED_FIXED_PANEL_HEIGHT'; value: string }
  // Preselects a product without navigating away from the current step —
  // used by the `?producto=<id>` query-param contract (S5), so a catalog
  // CTA can deep-link into `/cotizador` with the card already highlighted.
  | { type: 'PRESELECT_PRODUCT'; productId: ProductId };

/** Accepts meters ("1.10") or centimeters ("110"): values < 10 are ×100. */
export function parseWidthCm(raw: string): number {
  const value = parseFloat(raw.replace(',', '.'));
  if (Number.isNaN(value)) return NaN;
  return value < 10 ? Math.round(value * 100) : value;
}

export function cotizadorReducer(state: CotizadorState, action: CotizadorAction): CotizadorState {
  switch (action.type) {
    case 'SELECT_PRODUCT':
      return { ...state, productId: action.productId, step: 'medidas' };
    case 'SET_WIDTH':
      return { ...state, width: action.value };
    case 'SET_COLOR':
      return { ...state, color: action.color };
    case 'SET_GLASS':
      return { ...state, glass: action.glass };
    case 'SET_ENTREGA':
      return { ...state, entrega: action.entrega };
    case 'SET_ZONE':
      return { ...state, zone: action.zone };
    case 'GOTO_STEP':
      return { ...state, step: action.step };
    case 'NEXT': {
      const idx = STEP_ORDER.indexOf(state.step);
      const next = STEP_ORDER[Math.min(idx + 1, STEP_ORDER.length - 1)];
      return { ...state, step: next };
    }
    case 'BACK': {
      const idx = STEP_ORDER.indexOf(state.step);
      const prev = STEP_ORDER[Math.max(idx - 1, 0)];
      return { ...state, step: prev };
    }
    // --- corner (S5 T5.1) ---
    case 'SET_CORNER_MODEL':
      return { ...state, cornerModel: action.model };
    // --- tempered (S5 T5.2) --- (no dedicated action; reuses SET_WIDTH)
    // --- hinged (S5 T5.3) ---
    case 'SET_HINGED_QTY':
      return { ...state, hingedQty: action.value };
    case 'TOGGLE_HINGED_FIXED_PANEL':
      return { ...state, hingedFixedPanelEnabled: action.enabled };
    case 'SET_HINGED_FIXED_PANEL_WIDTH':
      return { ...state, hingedFixedPanelWidthM: action.value };
    case 'SET_HINGED_FIXED_PANEL_HEIGHT':
      return { ...state, hingedFixedPanelHeightM: action.value };
    case 'PRESELECT_PRODUCT':
      return { ...state, productId: action.productId };
    default:
      return state;
  }
}
