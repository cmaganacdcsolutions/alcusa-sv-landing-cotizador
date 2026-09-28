// Pure pricing dispatcher for the cotizador wizard (S5). Maps the current
// wizard state to the right engine/pricing function for the selected
// product and normalizes the result shape (engine functions disagree on
// `price` vs `subtotal` naming) so Step2Precio/Step3ZonaEntrega/
// Step4Resumen/Step5FormaPago can consume a single type regardless of
// product. No React/Astro/window/document imports — unit-tested directly.
import type { ProductId } from '@content/catalog';
import {
  HINGED_WIDTH_MAX_CM,
  HINGED_WIDTH_MIN_CM,
  STRAIGHT_WIDTH_MAX_CM,
  STRAIGHT_WIDTH_MIN_CM,
  TEMPERED_WIDTH_MAX_CM,
  TEMPERED_WIDTH_MIN_CM,
} from '@engine/pricing';
import { priceCorner, priceHinged, priceStraight, priceTempered } from '@engine/pricing';
import {
  COLOR_LABELS,
  CORNER_MODEL_LABELS,
  GLASS_LABELS,
  parseWidthCm,
  type CotizadorState,
} from './cotizadorStore';

export interface QuoteResult {
  /** Unified amount: `price` for straight/corner/tempered, `subtotal` for hinged. */
  amount: number | null;
  requiresQuote: boolean;
}

const NO_QUOTE: QuoteResult = { amount: null, requiresQuote: false };

/** Parses the hinged quantity field ("1".."50"); NaN outside/blank input. */
export function parseHingedQty(raw: string): number {
  if (!/^-?\d+$/.test(raw.trim())) return NaN;
  return parseInt(raw, 10);
}

export function computeQuote(state: CotizadorState): QuoteResult {
  const widthCm = parseWidthCm(state.width);

  switch (state.productId) {
    case 'recta': {
      const r = priceStraight({ widthCm, color: state.color, glass: state.glass, pickup: state.entrega === 'retiro' });
      return { amount: r.price, requiresQuote: r.requiresQuote };
    }
    case 'l': {
      const r = priceCorner({ color: state.color, model: state.cornerModel });
      return { amount: r.price, requiresQuote: r.requiresQuote };
    }
    case 'templado': {
      const r = priceTempered({ widthCm });
      return { amount: r.price, requiresQuote: r.requiresQuote };
    }
    case 'bisagra': {
      const qty = parseHingedQty(state.hingedQty);
      const fixedPanel = state.hingedFixedPanelEnabled
        ? {
            widthM: parseFloat(state.hingedFixedPanelWidthM.replace(',', '.')) || 0,
            heightM: parseFloat(state.hingedFixedPanelHeightM.replace(',', '.')) || 0,
          }
        : undefined;
      const r = priceHinged({ widthCm, color: state.color, glass: state.glass, qty, fixedPanel });
      return { amount: r.subtotal, requiresQuote: r.requiresQuote };
    }
    // 'jardin' / 'ventana' (S6) and null (no product yet) — not priceable here.
    default:
      return NO_QUOTE;
  }
}

/**
 * Defensive-only copy for the (normally unreachable — step 1 already blocks
 * "Siguiente") case where a later step still renders the requiresQuote
 * callout, e.g. a direct hash jump to `#cotizador/2-precio`.
 */
export function outOfRangeCopy(productId: ProductId | null): string {
  switch (productId) {
    case 'templado':
      return `El ancho debe ser de ${TEMPERED_WIDTH_MIN_CM} a ${TEMPERED_WIDTH_MAX_CM} cm y la altura de 2.00 m. Para otras medidas, consulta con ALCUSA.`;
    case 'bisagra':
      return `El ancho debe ser de ${HINGED_WIDTH_MIN_CM} a ${HINGED_WIDTH_MAX_CM} cm y la altura de 1.85 m, con cantidad de 1 a 50. Para otras medidas, consulta con ALCUSA.`;
    case 'l':
      return 'Para este acabado, consulta con ALCUSA.';
    default:
      return `El ancho debe ser de ${STRAIGHT_WIDTH_MIN_CM} a ${STRAIGHT_WIDTH_MAX_CM} cm y la altura de 1.85 m. Para otras medidas, consulta con ALCUSA.`;
  }
}

export interface LineItemView {
  /** One-line "medida · color · vidrio [· cantidad]" summary for the resumen/precio cards. */
  detail: string;
  anchoM: number;
  altoM: number;
  color: string;
  vidrio: string;
  /** Only set (and only shown) for hinged, where qty > 1 changes the subtotal. */
  cantidad?: number;
}

/**
 * Builds the display + WhatsApp-message fields for the single selected item.
 * Corner has no glass/vidrio field in the engine — its model (Aquaclara/
 * Frosted/Aquafold) fills the "vidrio" slot, the closest analog in the
 * shared QuoteMessageItem shape (S5 decision, see HANDOFF).
 */
export function buildLineItem(state: CotizadorState): LineItemView {
  const widthCm = parseWidthCm(state.width);
  const widthM = widthCm / 100;

  switch (state.productId) {
    case 'l':
      return {
        detail: `0.80 × 0.80 × 1.85 m · ${CORNER_MODEL_LABELS[state.cornerModel]} · ${COLOR_LABELS[state.color]}`,
        anchoM: 0.8,
        altoM: 1.85,
        color: COLOR_LABELS[state.color],
        vidrio: CORNER_MODEL_LABELS[state.cornerModel],
      };
    case 'templado':
      return {
        detail: `${widthM.toFixed(2)} × 2.00 m · Templado 10 mm`,
        anchoM: widthM,
        altoM: 2.0,
        color: '—',
        vidrio: 'Templado 10 mm',
      };
    case 'bisagra': {
      const qty = parseHingedQty(state.hingedQty);
      const qtySuffix = Number.isFinite(qty) && qty > 1 ? ` · Cant. ${qty}` : '';
      return {
        detail: `${widthM.toFixed(2)} × 1.85 m · ${COLOR_LABELS[state.color]} · ${GLASS_LABELS[state.glass]}${qtySuffix}`,
        anchoM: widthM,
        altoM: 1.85,
        color: COLOR_LABELS[state.color],
        vidrio: GLASS_LABELS[state.glass],
        cantidad: qty,
      };
    }
    // 'recta' and any not-yet-priced product fall back to the S1 shape.
    default:
      return {
        detail: `${widthM.toFixed(2)} × 1.85 m · ${COLOR_LABELS[state.color]} · ${GLASS_LABELS[state.glass]}`,
        anchoM: widthM,
        altoM: 1.85,
        color: COLOR_LABELS[state.color],
        vidrio: GLASS_LABELS[state.glass],
      };
  }
}
