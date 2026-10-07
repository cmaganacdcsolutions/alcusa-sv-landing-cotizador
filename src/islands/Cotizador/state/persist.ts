// Persistencia del wizard del cotizador en sessionStorage (reload a mitad del flujo).
//
// Modulo puro: sin React ni acceso directo a `window` salvo los helpers de
// storage/navegacion (todos con try/catch: la pagina debe funcionar con el
// storage bloqueado). El carrito vive en su propia llave (`alcusa-cotizador-cart`,
// ver Cotizador.tsx) y NO se duplica aqui.
//
// PII: la direccion de entrega queda en sessionStorage (ambito de pestana, se
// borra al cerrarla), igual que el pago pendiente de Wompi
// (`@integrations/wompi/client`).
//
// Para persistir un campo nuevo (como se hizo con `onlineOffer`): agregarlo a
// WIZARD_ORDER_KEYS/CotizadorState (cotizadorStore.ts), un guard en
// `guardWizardFields` y su caso en persist.test.ts. El reducer no cambia.
import type {
  AluminumColor,
  CornerModel,
  GardenColor,
  GardenGlass,
  GardenHojas,
  StraightGlass,
  WindowGlass,
  WindowModel,
} from '@engine/pricing';
import type { ProductId } from '@content/catalog';
import { parseStoredAddress } from '../../../lib/delivery-address';
import {
  ITEM_FIELD_KEYS,
  WIZARD_ORDER_KEYS,
  type CotizadorState,
  type CotizadorStep,
  type Entrega,
  type GardenHeightOption,
  type WindowRowState,
  type WizardFields,
} from './cotizadorStore';

export const WIZARD_STORAGE_KEY = 'alcusa-cotizador-wizard';
export const WIZARD_SNAPSHOT_VERSION = 1;

/** Lo que se guarda: version + los campos del wizard (ver WIZARD_ORDER_KEYS e ITEM_FIELD_KEYS). */
export type WizardSnapshot = { v: typeof WIZARD_SNAPSHOT_VERSION } & WizardFields;

/** Subconjunto de `Storage` que usamos (permite un fake en los tests de node). */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

const MAX_SNAPSHOT_CHARS = 20_000;
const MAX_FIELD_CHARS = 64;
const MAX_ZONE_CHARS = 120;
const MAX_WINDOW_ROWS = 30;
const MAX_EDIT_INDEX = 1_000;

// `Record<Union, true>` fuerza (en compilacion) a mantener estas tablas al dia con los tipos del motor.
const STEPS: Record<CotizadorStep, true> = {
  producto: true,
  medidas: true,
  precio: true,
  zonaEntrega: true,
  resumen: true,
  formaPago: true,
  wompi: true,
  resultado: true,
};
const ENTREGAS: Record<Entrega, true> = { instalacion: true, retiro: true };
const PRODUCT_IDS: Record<ProductId, true> = { recta: true, l: true, templado: true, bisagra: true, jardin: true, ventana: true };
const ALUMINUM_COLORS: Record<AluminumColor, true> = { natural: true, blanco: true, bronce: true };
const GARDEN_COLORS: Record<GardenColor, true> = { natural: true, blanco: true, bronce: true };
const STRAIGHT_GLASSES: Record<StraightGlass, true> = {
  claro: true,
  nevado: true,
  decorado: true,
  aquafold: true,
  mallado: true,
  duplex: true,
};
const GARDEN_GLASSES: Record<GardenGlass, true> = STRAIGHT_GLASSES;
const CORNER_MODELS: Record<CornerModel, true> = { aquaclara: true, frosted: true, aquafold: true };
const WINDOW_MODELS: Record<WindowModel, true> = { francesa: true, bilbao: true };
const WINDOW_GLASSES: Record<WindowGlass, true> = {
  claro: true,
  bronce: true,
  super_gris: true,
  reflectivo_azul: true,
  reflectivo_bronce: true,
};
const GARDEN_HEIGHT_OPTIONS: Record<GardenHeightOption, true> = { '2.10': true, '2.40': true, otra: true };

function oneOf<T extends string>(table: Record<T, true>): (v: unknown) => v is T {
  return (v): v is T => typeof v === 'string' && Object.prototype.hasOwnProperty.call(table, v);
}

const isStep = oneOf(STEPS);
const isEntrega = oneOf(ENTREGAS);
const isProductId = oneOf(PRODUCT_IDS);
const isAluminumColor = oneOf(ALUMINUM_COLORS);
const isGardenColor = oneOf(GARDEN_COLORS);
const isStraightGlass = oneOf(STRAIGHT_GLASSES);
const isGardenGlass = oneOf(GARDEN_GLASSES);
const isCornerModel = oneOf(CORNER_MODELS);
const isWindowModel = oneOf(WINDOW_MODELS);
const isWindowGlass = oneOf(WINDOW_GLASSES);
const isGardenHeightOption = oneOf(GARDEN_HEIGHT_OPTIONS);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
const isShortString = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_FIELD_CHARS;
const isGardenHojas = (v: unknown): v is GardenHojas => v === 1 || v === 2 || v === 3 || v === 'custom';

function isWindowRow(v: unknown): v is WindowRowState {
  return (
    isRecord(v) && isShortString(v.id) && isShortString(v.qty) && isShortString(v.widthM) && isShortString(v.heightM)
  );
}
function isWindowRows(v: unknown): v is WindowRowState[] {
  return Array.isArray(v) && v.length >= 1 && v.length <= MAX_WINDOW_ROWS && v.every(isWindowRow);
}

function isEditingItem(v: unknown): v is NonNullable<CotizadorState['editingItem']> {
  return (
    isRecord(v) &&
    isShortString(v.id) &&
    typeof v.index === 'number' &&
    Number.isInteger(v.index) &&
    v.index >= 0 &&
    v.index <= MAX_EDIT_INDEX
  );
}

/**
 * Valida cada campo de `o` y arma los campos del wizard, o `null` si ALGUNO no cuadra
 * (se rechaza el snapshot completo: mejor un wizard limpio que uno a medias).
 */
function guardWizardFields(o: Record<string, unknown>): WizardFields | null {
  // La direccion (incluido `geo`) se valida con el mismo parser tolerante que usa el retorno de Wompi.
  if (!isRecord(o.address)) return null;
  if (!isStep(o.step) || !isEntrega(o.entrega)) return null;
  if (typeof o.zone !== 'string' || o.zone.length > MAX_ZONE_CHARS) return null;
  if (!isBoolean(o.addressFromQuote)) return null;
  if (o.editingItem !== null && !isEditingItem(o.editingItem)) return null;

  const productId = o.productId;
  if (productId !== null && !isProductId(productId)) return null;
  // Un paso intermedio sin producto es un estado roto (la app lo rebotaria a "producto").
  if (o.step !== 'producto' && productId === null) return null;

  if (!isShortString(o.width) || !isAluminumColor(o.color) || !isStraightGlass(o.glass)) return null;
  if (!isCornerModel(o.cornerModel)) return null;
  if (!isShortString(o.hingedQty) || !isBoolean(o.hingedFixedPanelEnabled)) return null;
  if (!isShortString(o.hingedFixedPanelWidthM) || !isShortString(o.hingedFixedPanelHeightM)) return null;
  if (!isWindowModel(o.windowModel) || !isAluminumColor(o.windowFrame) || !isWindowGlass(o.windowGlass)) return null;
  if (!isBoolean(o.windowZaranda) || !isBoolean(o.windowDesmontaje) || !isWindowRows(o.windowRows)) return null;
  if (!isGardenHojas(o.gardenHojas) || !isShortString(o.gardenWidth) || !isGardenHeightOption(o.gardenHeightOption)) return null;
  if (!isShortString(o.gardenHeightOtra) || !isGardenColor(o.gardenColor) || !isGardenGlass(o.gardenGlass)) return null;
  if (!isShortString(o.gardenQty)) return null;
  // Oferta 10% en linea (`?oferta=online10`). Un snapshot viejo sin el campo se descarta (aceptado).
  if (!isBoolean(o.onlineOffer)) return null;

  return {
    step: o.step,
    entrega: o.entrega,
    zone: o.zone,
    address: parseStoredAddress(o.address),
    addressFromQuote: o.addressFromQuote,
    editingItem: o.editingItem,
    onlineOffer: o.onlineOffer,
    productId,
    width: o.width,
    color: o.color,
    glass: o.glass,
    cornerModel: o.cornerModel,
    hingedQty: o.hingedQty,
    hingedFixedPanelEnabled: o.hingedFixedPanelEnabled,
    hingedFixedPanelWidthM: o.hingedFixedPanelWidthM,
    hingedFixedPanelHeightM: o.hingedFixedPanelHeightM,
    windowModel: o.windowModel,
    windowFrame: o.windowFrame,
    windowGlass: o.windowGlass,
    windowZaranda: o.windowZaranda,
    windowDesmontaje: o.windowDesmontaje,
    windowRows: o.windowRows.map((r) => ({ id: r.id, qty: r.qty, widthM: r.widthM, heightM: r.heightM })),
    gardenHojas: o.gardenHojas,
    gardenWidth: o.gardenWidth,
    gardenHeightOption: o.gardenHeightOption,
    gardenHeightOtra: o.gardenHeightOtra,
    gardenColor: o.gardenColor,
    gardenGlass: o.gardenGlass,
    gardenQty: o.gardenQty,
  };
}

/** Valida un valor desconocido (ya parseado de JSON) y devuelve el snapshot, o `null` si no es confiable. */
export function parseWizardSnapshot(raw: unknown): WizardSnapshot | null {
  if (!isRecord(raw) || raw.v !== WIZARD_SNAPSHOT_VERSION) return null;
  const fields = guardWizardFields(raw);
  return fields ? { v: WIZARD_SNAPSHOT_VERSION, ...fields } : null;
}

// ---------------------------------------------------------------------------
// State <-> snapshot
// ---------------------------------------------------------------------------

/** Paso a guardar: nunca `wompi` (pago en vuelo) ni un `resultado` que no se pueda reanudar. */
function clampStep(step: CotizadorStep): CotizadorStep {
  return step === 'wompi' || step === 'resultado' ? 'formaPago' : step;
}

function isPristine(state: CotizadorState): boolean {
  const a = state.address;
  return (
    state.step === 'producto' &&
    state.productId === null &&
    state.entrega === 'instalacion' &&
    !state.addressFromQuote &&
    state.zone === '' &&
    state.editingItem === null &&
    !state.onlineOffer &&
    !a.departamentoId &&
    !a.municipioId &&
    !a.distritoId &&
    !a.colonia &&
    !a.calle &&
    !a.referencia &&
    !a.telefono &&
    !a.geo
  );
}

/**
 * Snapshot a guardar para `state`, o `null` cuando hay que BORRAR el guardado:
 * - pago aprobado o pendiente (flujo terminado);
 * - estado virgen (nada que recuperar);
 * - estado que no pasaria la validacion de lectura (paso intermedio sin producto).
 * Un pago rechazado deja el snapshot en `formaPago` para reintentar.
 */
export function snapshotFromState(state: CotizadorState): WizardSnapshot | null {
  if (state.step === 'resultado' && (state.wompiOutcome === 'approved' || state.wompiOutcome === 'pending')) return null;
  if (isPristine(state)) return null;
  const fields = {} as Record<string, unknown>;
  for (const key of ITEM_FIELD_KEYS) fields[key] = state[key];
  for (const key of WIZARD_ORDER_KEYS) fields[key] = state[key];
  fields.step = clampStep(state.step);
  // Round-trip por el guard: lo que se escribe es exactamente lo que se podra leer.
  return parseWizardSnapshot({ v: WIZARD_SNAPSHOT_VERSION, ...fields });
}

// ---------------------------------------------------------------------------
// Storage (todo con try/catch: storage bloqueado = el wizard funciona sin persistir)
// ---------------------------------------------------------------------------

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null; // SecurityError al tocar `sessionStorage` (cookies/storage bloqueados)
  }
}

export function readWizardSnapshot(storage: StorageLike | null = defaultStorage()): WizardSnapshot | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(WIZARD_STORAGE_KEY);
    if (!raw || raw.length > MAX_SNAPSHOT_CHARS) return null;
    return parseWizardSnapshot(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeWizardSnapshot(snapshot: WizardSnapshot, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // modo privado / cuota: simplemente no sobrevive al reload.
  }
}

export function clearWizardSnapshot(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(WIZARD_STORAGE_KEY);
  } catch {
    // nada que hacer
  }
}

/** Persiste (o borra) segun `snapshotFromState`. */
export function persistWizardState(state: CotizadorState, storage: StorageLike | null = defaultStorage()): void {
  const snapshot = snapshotFromState(state);
  if (snapshot) writeWizardSnapshot(snapshot, storage);
  else clearWizardSnapshot(storage);
}

// ---------------------------------------------------------------------------
// Elegibilidad de la restauracion
// ---------------------------------------------------------------------------

/** Parametros del deep link (`?producto=` de catalogo/inicio/promos y `?oferta=`). */
export const DEEP_LINK_PARAMS = ['producto', 'paso', 'color', 'vidrio', 'oferta'] as const;

export function hasDeepLinkParams(search: string): boolean {
  const params = new URLSearchParams(search);
  return DEEP_LINK_PARAMS.some((p) => params.has(p));
}

export type NavigationKind = 'navigate' | 'reload' | 'back_forward' | 'prerender' | 'unknown';

/** Tipo de navegacion de la carga actual (Navigation Timing 2, con fallback al API legacy). */
export function readNavigationType(): NavigationKind {
  try {
    if (typeof performance === 'undefined') return 'unknown';
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (entry) return entry.type;
    // Fallback for browsers without Navigation Timing 2.
    const legacy = performance.navigation?.type;
    if (legacy === 1) return 'reload';
    if (legacy === 2) return 'back_forward';
    if (legacy === 0) return 'navigate';
  } catch {
    // sin informacion
  }
  return 'unknown';
}

export interface RestoreContext {
  /** Retorno de Wompi (hash `#cotizador/...pago=`): restaura su propio pago pendiente. */
  wompiReturn: boolean;
  /** `?folio=`: carga una cotizacion guardada. */
  hasFolio: boolean;
  /** `window.location.search`. */
  search: string;
  /** Paso resuelto desde `#cotizador/<slug>`, o `null`. */
  hashStep: CotizadorStep | null;
  navigation: NavigationKind;
}

/**
 * Decide si se restaura el snapshot al montar:
 * - nunca en un retorno de Wompi ni con `?folio=`;
 * - con parametros de deep link gana el deep link en una llegada nueva; solo un reload / atras
 *   (la misma pagina, ya en curso) restaura;
 * - sin deep link: si el hash resuelve a un paso, o es reload / atras.
 */
export function shouldRestoreWizard(ctx: RestoreContext): boolean {
  if (ctx.wompiReturn || ctx.hasFolio) return false;
  const revisit = ctx.navigation === 'reload' || ctx.navigation === 'back_forward';
  if (hasDeepLinkParams(ctx.search)) return revisit;
  return ctx.hashStep !== null || revisit;
}

/**
 * Paso con el que arranca un wizard restaurado: el del hash si lo hay, si no el del snapshot.
 * `wompi`/`resultado` se llevan a `formaPago` (un hash viejo no puede reabrir un pago ni un resultado vacio).
 */
export function restoredStep(hashStep: CotizadorStep | null, snapshot: WizardSnapshot): CotizadorStep {
  return clampStep(hashStep ?? snapshot.step);
}

/** Campos para `RESTORE_WIZARD`: el snapshot sin `v`, con el paso ya resuelto (`restoredStep`). */
export function restoreFields(snapshot: WizardSnapshot, hashStep: CotizadorStep | null): WizardFields {
  const { v: version, ...fields } = snapshot;
  void version; // el numero de version no es parte del estado
  return { ...fields, step: restoredStep(hashStep, snapshot) };
}
