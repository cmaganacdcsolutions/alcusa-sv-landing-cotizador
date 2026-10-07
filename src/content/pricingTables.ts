// Pricing data from exploratory-report.md §3.1 (STRAIGHT branch, "Puerta de
// baño recta"). Verified against the check-values table in that section.
// Pure data only — consumed by src/engine/pricing/straight.ts.

export type StraightGlassKey = 'claro' | 'nevado' | 'decorado' | 'mallado' | 'duplex';

/** Flyer oficial: Modelo Aquafold, aluminio natural, ancho 1.00-1.20 m. */
export const AQUAFOLD_PROMO_PRICE = 279.99;
export const AQUAFOLD_PROMO_MIN_CM = 100;
export const AQUAFOLD_PROMO_MAX_CM = 120;

export const STRAIGHT_PROMO: Record<'claro' | 'nevado' | 'decorado', number> = {
  claro: 222,
  nevado: 290,
  decorado: 325,
};

export type StraightGlassPriceRow = Record<StraightGlassKey, number>;

// Table N — aluminio natural (USD, alto 1.85 m). Keyed by width tier in meters.
export const STRAIGHT_TABLE_NATURAL: Record<string, StraightGlassPriceRow> = {
  '1.0': { nevado: 279, claro: 242, decorado: 317, mallado: 308, duplex: 371 },
  '1.1': { nevado: 297, claro: 258, decorado: 333, mallado: 321, duplex: 388 },
  '1.2': { nevado: 320, claro: 278, decorado: 353, mallado: 337, duplex: 407 },
  '1.3': { nevado: 340, claro: 296, decorado: 371, mallado: 384, duplex: 426 },
  '1.4': { nevado: 362, claro: 314, decorado: 389, mallado: 400, duplex: 442 },
  '1.5': { nevado: 378, claro: 328, decorado: 403, mallado: 414, duplex: 462 },
  '1.6': { nevado: 394, claro: 342, decorado: 442, mallado: 430, duplex: 476 },
  '1.7': { nevado: 413, claro: 359, decorado: 459, mallado: 447, duplex: 499 },
  '1.8': { nevado: 433, claro: 377, decorado: 477, mallado: 464, duplex: 511 },
  '1.9': { nevado: 450, claro: 391, decorado: 541, mallado: 482, duplex: 536 },
  '2.0': { nevado: 468, claro: 407, decorado: 557, mallado: 495, duplex: 554 },
};

// Table C — aluminio blanco / bronce (USD, alto 1.85 m). Keyed by width tier.
export const STRAIGHT_TABLE_COLOR: Record<string, StraightGlassPriceRow> = {
  '1.0': { nevado: 363, claro: 316, decorado: 391, mallado: 396, duplex: 467 },
  '1.1': { nevado: 382, claro: 332, decorado: 407, mallado: 414, duplex: 486 },
  '1.2': { nevado: 402, claro: 350, decorado: 425, mallado: 431, duplex: 500 },
  '1.3': { nevado: 420, claro: 366, decorado: 441, mallado: 451, duplex: 517 },
  '1.4': { nevado: 442, claro: 384, decorado: 459, mallado: 468, duplex: 533 },
  '1.5': { nevado: 460, claro: 400, decorado: 475, mallado: 485, duplex: 549 },
  '1.6': { nevado: 480, claro: 418, decorado: 518, mallado: 504, duplex: 564 },
  '1.7': { nevado: 502, claro: 437, decorado: 537, mallado: 523, duplex: 583 },
  '1.8': { nevado: 521, claro: 453, decorado: 553, mallado: 540, duplex: 614 },
  '1.9': { nevado: 543, claro: 472, decorado: 622, mallado: 560, duplex: 614 },
  '2.0': { nevado: 561, claro: 488, decorado: 638, mallado: 577, duplex: 629 },
};

// --- Slice 2: corner, tempered, hinged, windows, garden ------------------
// All from exploratory-report.md §3.1-3.4, cross-checked with the "Verified
// UI outputs" table. Values below are pre-zone-fee (zone fee added by the
// caller / order-level per S2-pricing-engine.md T2.3).

// CORNER ("Cabina en L"), fixed 0.80x0.80x1.85. Natural base; bronce = x1.10;
// blanco not offered (§3.1: "L Natural Aquaclara/Frosted/Aquafold $484/$620/$690"
// and "L Bronce … $528.40/$678/$755", both zone-fee-inclusive in the source
// table — subtract the +$40 Soyapango zone fee used throughout that table to
// get these pre-zone bases).
export const CORNER_BASE: Record<'aquaclara' | 'frosted' | 'aquafold', number> = {
  aquaclara: 444,
  frosted: 580,
  aquafold: 650,
};
export const CORNER_BRONCE_MULTIPLIER = 1.1;

// TEMPERED ("Templado 10 mm"): price = (widthCm/100) x 2 x 280.
export const TEMPERED_RATE_PER_METER = 2 * 280;

// HINGED ("Puerta con bisagra"), cols: nevado, claro, decorado, mallado, dúplex.
// Keyed by width tier in cm (40-90, step 10). Source: §3.2.
export const HINGED_TABLE_NATURAL: Record<string, StraightGlassPriceRow> = {
  '40': { nevado: 292, claro: 253, decorado: 328, mallado: 328, duplex: 321 },
  '50': { nevado: 300, claro: 260, decorado: 335, mallado: 333, duplex: 327 },
  '60': { nevado: 305, claro: 265, decorado: 340, mallado: 338, duplex: 330 },
  '70': { nevado: 311, claro: 270, decorado: 345, mallado: 343, duplex: 339 },
  '80': { nevado: 323, claro: 281, decorado: 356, mallado: 355, duplex: 350 },
  '90': { nevado: 329, claro: 286, decorado: 361, mallado: 368, duplex: 359 },
};

// blanco / bronce. NOTE: 40cm decorado = 449 is the source's own value; the
// report flags it as a likely transcription error vs 355 at 50cm (open
// question q17, client-questions.md #17). Encoded as-is — see hinged.ts.
export const HINGED_TABLE_COLOR: Record<string, StraightGlassPriceRow> = {
  '40': { nevado: 316, claro: 274, decorado: 449, mallado: 358, duplex: 362 },
  '50': { nevado: 322, claro: 280, decorado: 355, mallado: 355, duplex: 381 },
  '60': { nevado: 330, claro: 287, decorado: 362, mallado: 383, duplex: 400 },
  '70': { nevado: 336, claro: 291, decorado: 366, mallado: 395, duplex: 419 },
  '80': { nevado: 342, claro: 297, decorado: 372, mallado: 408, duplex: 438 },
  '90': { nevado: 350, claro: 304, decorado: 379, mallado: 420, duplex: 457 },
};
export const HINGED_FIXED_PANEL_RATE = 140;
export const HINGED_FIXED_PANEL_MIN_M2 = 0.8;

// WINDOWS ("Ventana Francesa o Bilbao"). Source: §3.3.
export const WINDOW_RATE: Record<'francesa' | 'bilbao', number> = {
  francesa: 135,
  bilbao: 192,
};
export const WINDOW_MIN_AREA_M2 = 0.8;
export const WINDOW_ZARANDA_RATE_PER_M2 = 30;
export const WINDOW_DESMONTAJE_FLAT = 25;
export const WINDOW_GLASS_FACTOR_CLEAR = 1.0;
export const WINDOW_GLASS_FACTOR_OTHER = 1.1;

// GARDEN ("Puerta de jardín"). Source: §3.4.
export const GARDEN_RATE_PER_M2 = 190;
export const GARDEN_PROMO_HEIGHTS_M = [2.1, 2.4] as const;
export const GARDEN_PROMO_BANDS: Record<1 | 2 | 3, { minWidthM: number; maxWidthM: number; price: number }> = {
  1: { minWidthM: 0.8, maxWidthM: 1.25, price: 410 },
  2: { minWidthM: 1.3, maxWidthM: 2.5, price: 819 },
  3: { minWidthM: 2.5, maxWidthM: 3.5, price: 1229 },
};
