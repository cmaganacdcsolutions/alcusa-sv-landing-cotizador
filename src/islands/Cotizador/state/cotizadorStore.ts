// Reducer + hash/history slug map for the cotizador wizard (ADR-005).
// Pure — the hash/history side effects themselves live in Cotizador.tsx
// (islands are the only layer allowed to touch window/history).
import type { AluminumColor, StraightGlass } from '@engine/pricing';
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

export interface CotizadorState {
  step: CotizadorStep;
  productId: ProductId | null;
  width: string;
  color: AluminumColor;
  glass: StraightGlass;
  entrega: Entrega;
  zone: string;
}

export const initialCotizadorState: CotizadorState = {
  step: 'producto',
  productId: null,
  width: '110',
  color: 'natural',
  glass: 'claro',
  entrega: 'instalacion',
  zone: '',
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
  | { type: 'BACK' };

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
    default:
      return state;
  }
}
