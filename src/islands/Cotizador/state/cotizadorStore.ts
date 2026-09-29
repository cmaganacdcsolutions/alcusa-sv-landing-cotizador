// Reducer + hash/history slug map for the cotizador wizard (ADR-005).
// Pure — the hash/history side effects themselves live in Cotizador.tsx
// (islands are the only layer allowed to touch window/history).
import type { AluminumColor, CornerModel, GardenColor, GardenGlass, GardenHojas, StraightGlass, WindowGlass, WindowModel } from '@engine/pricing';
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
  // corner ("l" — Cabina en L, S5 T5.1): fixed 0.80x0.80x1.85m, no width input.
  cornerModel: CornerModel;
  // tempered ("templado", S5 T5.2): reuses `width` (120-200cm); no extra fields.
  // hinged ("bisagra", S5 T5.3): qty + optional paño fijo. Reuses `width` (40-90cm),
  // `color` and `glass`.
  hingedQty: string;
  hingedFixedPanelEnabled: boolean;
  hingedFixedPanelWidthM: string;
  hingedFixedPanelHeightM: string;
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
  // --- sf-cot-checkout: Step5 forma de pago selection ---
  payMethod: 'wa' | 'pay';
  payAmountPct: 80 | 100;
  // --- sf-cot-checkout: mock Wompi result (Step6Wompi → Step7Resultado) ---
  // Set by SET_WOMPI_RESULT once src/integrations/wompi/mock.ts "resolves" a
  // mock payment attempt; null until then. No real gateway data lands here
  // until the live integration slice.
  wompiOutcome: 'approved' | 'declined' | null;
  wompiOrderNumber: string | null;
  // --- S7: multi-item cart ---
  // Committed items from a previous "+ Agregar otro producto" loop. The
  // fields ABOVE (productId..gardenQty) always describe the "current" item
  // being edited through steps 1-3; zone/entrega/pay/wompi fields are
  // order-level (shared, charged/decided once) and never snapshotted here.
  cart: CartItem[];
}

// --- S7: cart item snapshot helpers ---
// The subset of CotizadorState that is "per item" (product + its own
// measures/finish/qty). Keeping this as a single source of keys means
// snapshot/apply/reset can never drift out of sync with the state shape.
export const ITEM_FIELD_KEYS = [
  'productId',
  'width',
  'color',
  'glass',
  'cornerModel',
  'hingedQty',
  'hingedFixedPanelEnabled',
  'hingedFixedPanelWidthM',
  'hingedFixedPanelHeightM',
  'windowModel',
  'windowFrame',
  'windowGlass',
  'windowZaranda',
  'windowDesmontaje',
  'windowRows',
  'gardenHojas',
  'gardenWidth',
  'gardenHeightOption',
  'gardenHeightOtra',
  'gardenColor',
  'gardenGlass',
  'gardenQty',
] as const;

export type ItemFieldKey = (typeof ITEM_FIELD_KEYS)[number];
export type CartItemFields = Pick<CotizadorState, ItemFieldKey>;

export interface CartItem extends Omit<CartItemFields, 'productId'> {
  id: string;
  productId: ProductId;
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
  payMethod: 'pay',
  payAmountPct: 80,
  wompiOutcome: null,
  wompiOrderNumber: null,
  cart: [],
};

// The initial values of just the "per item" fields — used to reset the
// current item back to a blank slate on ADD_TO_CART/REMOVE_ITEM without
// touching order-level fields (zone/entrega/pay/wompi/cart).
const INITIAL_ITEM_FIELDS: CartItemFields = ITEM_FIELD_KEYS.reduce((acc, key) => {
  (acc as Record<string, unknown>)[key] = initialCotizadorState[key];
  return acc;
}, {} as CartItemFields);

/** Snapshots the current item's fields into a standalone, addressable cart entry. */
export function snapshotCartItem(state: CotizadorState, id: string): CartItem {
  const fields = ITEM_FIELD_KEYS.reduce((acc, key) => {
    (acc as Record<string, unknown>)[key] = state[key];
    return acc;
  }, {} as CartItemFields);
  return { ...fields, id, productId: state.productId as ProductId };
}

/** Loads a cart item's fields back onto the "current item" slot of state. */
export function applyCartItem(state: CotizadorState, item: CartItem): CotizadorState {
  const fields = ITEM_FIELD_KEYS.reduce((acc, key) => {
    (acc as Record<string, unknown>)[key] = item[key];
    return acc;
  }, {} as CartItemFields);
  return { ...state, ...fields };
}

/** Resets the current item to a blank slate and sends the wizard back to step 0. */
function resetCurrentItem(state: CotizadorState): CotizadorState {
  return { ...state, ...INITIAL_ITEM_FIELDS, step: 'producto' };
}

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
  | { type: 'PRESELECT_PRODUCT'; productId: ProductId }
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
  | { type: 'SET_GARDEN_QTY'; value: string }
  // --- sf-cot-checkout: Step5 forma de pago + mock Wompi result ---
  | { type: 'SET_PAY_METHOD'; method: 'wa' | 'pay' }
  | { type: 'SET_PAY_AMOUNT_PCT'; pct: 80 | 100 }
  | { type: 'SET_WOMPI_RESULT'; outcome: 'approved' | 'declined'; orderNumber: string }
  // --- S7: multi-item cart ---
  // Commits the current item into `cart` and resets step 0 with a fresh
  // item (the "+ Agregar otro producto" loop, prototype-spec.md §2.1 step 4).
  | { type: 'ADD_TO_CART' }
  // Removes one line from the combined cart+current view. `id: 'current'`
  // removes the item being edited right now: if the cart still holds other
  // items, the most recently committed one is promoted back into the
  // "current" slot (still editable via steps 1-3); if the cart is empty,
  // this was the last item — falls back to step 0 (prototype-spec.md §2.1).
  | { type: 'REMOVE_ITEM'; id: string };

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
    // --- sf-cot-checkout: Step5 forma de pago + mock Wompi result ---
    case 'SET_PAY_METHOD':
      return { ...state, payMethod: action.method };
    case 'SET_PAY_AMOUNT_PCT':
      return { ...state, payAmountPct: action.pct };
    case 'SET_WOMPI_RESULT':
      return { ...state, wompiOutcome: action.outcome, wompiOrderNumber: action.orderNumber };
    // --- S7: multi-item cart ---
    case 'ADD_TO_CART': {
      if (!state.productId) return state;
      const item = snapshotCartItem(state, `item-${state.cart.length}-${Date.now()}`);
      return resetCurrentItem({ ...state, cart: [...state.cart, item] });
    }
    case 'REMOVE_ITEM': {
      if (action.id === 'current') {
        if (state.cart.length === 0) return resetCurrentItem(state);
        const promoted = state.cart[state.cart.length - 1];
        return applyCartItem({ ...state, cart: state.cart.slice(0, -1) }, promoted);
      }
      return { ...state, cart: state.cart.filter((i) => i.id !== action.id) };
    }
    default:
      return state;
  }
}
