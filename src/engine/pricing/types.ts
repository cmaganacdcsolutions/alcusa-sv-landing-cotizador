// Shared pricing types. Pure types only, zero runtime code.
export type Currency = 'USD';

export interface Money {
  amount: number;
  currency: Currency;
}

// STRAIGHT ("Puerta de baño recta") — Slice 1 scope. Other products (corner,
// tempered, hinged, windows, garden) land in Slice 2 in the same shape.
export type AluminumColor = 'natural' | 'blanco' | 'bronce';
export type BaseGlass = 'claro' | 'nevado' | 'decorado' | 'mallado' | 'duplex';
/** Recta adds the promo "Aquafold" glass (flyer oficial, $279.99). */
export type StraightGlass = BaseGlass | 'aquafold';

export interface StraightPriceInput {
  widthCm: number;
  color: AluminumColor;
  glass: StraightGlass;
  pickup: boolean;
}

export interface StraightPriceResult {
  /** null when requiresQuote is true — out of the priceable width range. */
  price: number | null;
  /** true when transport is not needed (retiro en tienda). */
  transportIncluded: boolean;
  requiresQuote: boolean;
}

// CORNER ("Cabina en L") — Slice 2. Fixed 0.80x0.80x1.85, no width input.
// UI glass-model labels are Aquaclara/Frosted/Aquafold (exploratory-report.md
// §3.1 formula pseudocode calls these claro/nevado/decorado respectively).
export type CornerModel = 'aquaclara' | 'frosted' | 'aquafold';

export interface CornerPriceInput {
  color: AluminumColor;
  model: CornerModel;
}

export interface CornerPriceResult {
  /** Pre-zone-fee price; null when requiresQuote is true (blanco not offered). */
  price: number | null;
  requiresQuote: boolean;
}

// TEMPERED ("Templado 10 mm") — Slice 2. Fixed alto 2.00m, no color/glass pickers.
export interface TemperedPriceInput {
  widthCm: number;
}

export interface TemperedPriceResult {
  /** Pre-zone-fee price; null when requiresQuote is true — out of range. */
  price: number | null;
  requiresQuote: boolean;
}

// HINGED ("Puerta con bisagra") — Slice 2. Subtotal excludes transport; S7
// adds transport once per order (docs/product/slices/S2-pricing-engine.md T2.3).
export interface HingedFixedPanel {
  widthM: number;
  heightM: number;
}

export interface HingedPriceInput {
  widthCm: number;
  color: AluminumColor;
  glass: StraightGlass;
  qty: number;
  fixedPanel?: HingedFixedPanel;
}

export interface HingedPriceResult {
  /** Product-cost subtotal (qty applied), excludes transport. Null when requiresQuote. */
  subtotal: number | null;
  requiresQuote: boolean;
}

// WINDOWS ("Ventana Francesa o Bilbao") — Slice 2. Subtotal excludes transport.
export type WindowModel = 'francesa' | 'bilbao';
export type WindowGlass = 'claro' | 'bronce' | 'super_gris' | 'reflectivo_azul' | 'reflectivo_bronce';

export interface WindowPriceInput {
  widthM: number;
  heightM: number;
  model: WindowModel;
  /** Frame color. Natural frame is offered in the UI but never priced (requiresQuote). */
  frame: AluminumColor;
  glass: WindowGlass;
  zaranda: boolean;
  desmontaje: boolean;
  qty: number;
}

export interface WindowPriceResult {
  /** Product-cost subtotal (qty applied), excludes transport. Null when requiresQuote. */
  subtotal: number | null;
  requiresQuote: boolean;
}

// GARDEN ("Puerta de jardín") — Slice 2. Subtotal excludes transport.
export type GardenHojas = 1 | 2 | 3 | 'custom';
export type GardenColor = 'natural' | 'blanco' | 'bronce';
export type GardenGlass = StraightGlass;

export interface GardenPriceInput {
  widthM: number;
  heightM: number;
  /** 1/2/3 hojas selects a promo tier; 'custom' is "A la medida" (always priced by m², see q16). */
  hojas: GardenHojas;
  color: GardenColor;
  glass: GardenGlass;
  qty: number;
}

export interface GardenPriceResult {
  /** Product-cost subtotal (qty applied), excludes transport. Null when requiresQuote. */
  subtotal: number | null;
  requiresQuote: boolean;
}
