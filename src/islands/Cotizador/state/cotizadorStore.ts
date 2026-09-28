// Reducer + hash/history slug map for the cotizador wizard (ADR-005).
// Pure — the hash/history side effects themselves live in Cotizador.tsx
// (islands are the only layer allowed to touch window/history).
import type { AluminumColor, GardenColor, GardenGlass, GardenHojas, StraightGlass, WindowGlass, WindowModel } from '@engine/pricing';
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

// S6 — one repeatable "ventana" row (cantidad/ancho/alto only; modelo, color,
// vidrio, zaranda, desmontaje are shared across rows per prototype-spec.md
// §2.2). Values are kept as raw strings for editing, parsed in
// state/quoteWindowGarden.ts.
export interface WindowRowState {
  id: string;
  qty: string;
  widthM: string;
  heightM: string;
}

export type GardenHeightOption = '2.10' | '2.40' | 'otra';

export interface CotizadorState {
  step: CotizadorStep;
  productId: ProductId | null;
  width: string;
  color: AluminumColor;
  glass: StraightGlass;
  entrega: Entrega;
  zone: string;
  // --- S6: ventana (Francesa/Bilbao) ---
  windowModel: WindowModel;
  windowFrame: AluminumColor;
  windowGlass: WindowGlass;
  windowZaranda: boolean;
  windowDesmontaje: boolean;
  windowRows: WindowRowState[];
  // --- S6: jardín (puerta de jardín) ---
  gardenHojas: GardenHojas;
  gardenWidth: string;
  gardenHeightOption: GardenHeightOption;
  gardenHeightOtra: string;
  gardenColor: GardenColor;
  gardenGlass: GardenGlass;
  gardenQty: string;
}

export const initialCotizadorState: CotizadorState = {
  step: 'producto',
  productId: null,
  width: '110',
  color: 'natural',
  glass: 'claro',
  entrega: 'instalacion',
  zone: '',
  // --- S6: ventana ---
  windowModel: 'francesa',
  windowFrame: 'blanco',
  windowGlass: 'claro',
  windowZaranda: false,
  windowDesmontaje: false,
  windowRows: [{ id: 'row-1', qty: '1', widthM: '1.20', heightM: '1.00' }],
  // --- S6: jardín ---
  gardenHojas: 1,
  gardenWidth: '1.00',
  gardenHeightOption: '2.10',
  gardenHeightOtra: '',
  gardenColor: 'blanco',
  gardenGlass: 'claro',
  gardenQty: '1',
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
  // --- S6: ventana ---
  | { type: 'SET_WINDOW_MODEL'; model: WindowModel }
  | { type: 'SET_WINDOW_FRAME'; frame: AluminumColor }
  | { type: 'SET_WINDOW_GLASS'; glass: WindowGlass }
  | { type: 'SET_WINDOW_ZARANDA'; value: boolean }
  | { type: 'SET_WINDOW_DESMONTAJE'; value: boolean }
  | { type: 'ADD_WINDOW_ROW' }
  | { type: 'REMOVE_WINDOW_ROW'; id: string }
  | { type: 'SET_WINDOW_ROW'; id: string; field: 'qty' | 'widthM' | 'heightM'; value: string }
  // --- S6: jardín ---
  | { type: 'SET_GARDEN_HOJAS'; hojas: GardenHojas }
  | { type: 'SET_GARDEN_WIDTH'; value: string }
  | { type: 'SET_GARDEN_HEIGHT_OPTION'; value: GardenHeightOption }
  | { type: 'SET_GARDEN_HEIGHT_OTRA'; value: string }
  | { type: 'SET_GARDEN_COLOR'; color: GardenColor }
  | { type: 'SET_GARDEN_GLASS'; glass: GardenGlass }
  | { type: 'SET_GARDEN_QTY'; value: string };

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
    // --- S6: ventana ---
    case 'SET_WINDOW_MODEL':
      return { ...state, windowModel: action.model };
    case 'SET_WINDOW_FRAME':
      return { ...state, windowFrame: action.frame };
    case 'SET_WINDOW_GLASS':
      return { ...state, windowGlass: action.glass };
    case 'SET_WINDOW_ZARANDA':
      return { ...state, windowZaranda: action.value };
    case 'SET_WINDOW_DESMONTAJE':
      return { ...state, windowDesmontaje: action.value };
    case 'ADD_WINDOW_ROW':
      return {
        ...state,
        windowRows: [
          ...state.windowRows,
          { id: `row-${state.windowRows.length}-${Date.now()}`, qty: '1', widthM: '1.20', heightM: '1.00' },
        ],
      };
    case 'REMOVE_WINDOW_ROW':
      return {
        ...state,
        windowRows: state.windowRows.length > 1 ? state.windowRows.filter((r) => r.id !== action.id) : state.windowRows,
      };
    case 'SET_WINDOW_ROW':
      return {
        ...state,
        windowRows: state.windowRows.map((r) => (r.id === action.id ? { ...r, [action.field]: action.value } : r)),
      };
    // --- S6: jardín ---
    case 'SET_GARDEN_HOJAS':
      return { ...state, gardenHojas: action.hojas };
    case 'SET_GARDEN_WIDTH':
      return { ...state, gardenWidth: action.value };
    case 'SET_GARDEN_HEIGHT_OPTION':
      return { ...state, gardenHeightOption: action.value };
    case 'SET_GARDEN_HEIGHT_OTRA':
      return { ...state, gardenHeightOtra: action.value };
    case 'SET_GARDEN_COLOR':
      return { ...state, gardenColor: action.color };
    case 'SET_GARDEN_GLASS':
      return { ...state, gardenGlass: action.glass };
    case 'SET_GARDEN_QTY':
      return { ...state, gardenQty: action.value };
    default:
      return state;
  }
}
