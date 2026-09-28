// Pricing data from exploratory-report.md §3.1 (STRAIGHT branch, "Puerta de
// baño recta"). Verified against the check-values table in that section.
// Pure data only — consumed by src/engine/pricing/straight.ts.

export type StraightGlassKey = 'claro' | 'nevado' | 'decorado' | 'mallado' | 'duplex';

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
