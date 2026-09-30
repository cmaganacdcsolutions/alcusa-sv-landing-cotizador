// Geometry of pdf-r08 (pt, measured from the TOP-LEFT like the board).
// Every constant is the redline value (E01..E73); render.ts flips Y.
export const PAGE = { w: 595.28, h: 841.89 } as const;
export const M = { left: 36, right: 559.5, width: 523.5 } as const;
export const BAND_H = 6;
export const LOGO = { x: 36, top: 30, size: 42 } as const;
export const HEADER = { nameX: 87, nameBase: 57.3, titleBase: 52.2, folioBase: 73.65, ruleY: 84 } as const;
export const META = { top: 96, h: 48, dateX: 48, validX: 225, labelBase: 113.7, valueBase: 129.15 } as const;
export const CUSTOMER = {
  kickerBase: 170.7,
  boxTop: 180,
  boxH: 60,
  xs: [48, 247.5, 420],
  labelBase: 197.7,
  valueBase: 213.15,
  maxNameW: 184.5,
} as const;
export const TABLE = {
  kickerBase: 266.7,
  headTop: 276,
  headH: 27,
  headBase: 292.2,
  firstRow: 303,
  rowH: 54,
  rowBase: 30.15,
  lineH: 15,
  xName: 45,
  xVariant: 240,
  xMeasures: 352.5,
  xQtyHead: 452.25,
  xQtyCenter: 465,
  xPriceRight: 550.5,
  nameMaxW: 187.5,
  variantMaxW: 105,
  measuresMaxW: 95,
  contHeadTop: 108,
} as const;
/** Tail block: board coordinates are relative to boardTop = 429. */
export const TAIL = {
  boardTop: 429,
  gap: 18,
  schemeW: 277.5,
  schemeH: 99,
  trackW: 253.5,
  trackH: 7.5,
  ivaGap: 18,
  ivaH: 39,
  contactBoxH: 90,
  contactTopNoIva: 141,
} as const;
export const FOOTER = { ruleY: 788.25, base: 807.45, limit: 780 } as const;
export const COLORS = {
  ink: [0x10, 0x21, 0x3d],
  muted: [0x44, 0x50, 0x68],
  primary: [0x07, 0x3b, 0x92],
  tint: [0xea, 0xf2, 0xff],
  soft: [0xf6, 0xf3, 0xed],
  border: [0xdf, 0xe6, 0xef],
  track: [0xcf, 0xd8, 0xe5],
  white: [255, 255, 255],
} as const;
