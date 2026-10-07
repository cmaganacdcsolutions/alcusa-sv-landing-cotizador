// Pure helper for the "pagando con tarjeta en linea" line shown from Precio to Resumen.
// No React/window/document imports (same rule as state/payable.ts, unit-tested directly).
//
// Two modes, one amount:
//   applied  the customer already holds the 10% (arrived through `?oferta=online10`, or picked
//            tarjeta in Step5): the line is a real discount and the total is the card total.
//   preview  nothing chosen yet: the same figure is shown as "Pagando con tarjeta en linea: $X (-10%)"
//            so the customer sees what the card saves, WITHOUT it being applied to the total.
// The figure is always computePayable({ payMethod: 'pay' }) so it can never drift from the engine.
import { computePayable, payMethodForDiscount, type ShippingState } from './payable';

/** Single source for every "discount row" label (Step2/3/4/5/7, aside). */
export const ONLINE_DISCOUNT_LABEL = 'Descuento pago con tarjeta en línea (10%)';

/** Steps that can show the preview/applied line before the forma de pago step. */
const OFFER_STEPS = ['precio', 'zonaEntrega', 'resumen'] as const;

export type PayOfferMode = 'applied' | 'preview';

export interface PayOffer {
  mode: PayOfferMode;
  /** 10% of the items subtotal, positive, never over shipping. */
  discount: number;
  /** itemsSubtotal + known shipping - discount: what the customer pays by card. */
  cardTotal: number;
}

export interface BuildPayOfferInput {
  step: string;
  /** state.onlineOffer */
  offer: boolean;
  payMethod: 'wa' | 'pay';
  /** state.payMethodChosen */
  chosen: boolean;
  /** Sum of item subtotals (orderItemsSubtotal / current item amount at precio). */
  itemsSubtotal: number;
  /** null while the delivery is not known yet (precio): treated as no shipping. */
  shipping: ShippingState | null;
  pickup: boolean;
}

export function buildPayOffer(i: BuildPayOfferInput): PayOffer | null {
  if (!(OFFER_STEPS as readonly string[]).includes(i.step)) return null;
  if (i.itemsSubtotal <= 0) return null;
  const payable = computePayable({
    itemsSubtotal: i.itemsSubtotal,
    shipping: i.shipping ?? { kind: 'none' },
    payMethod: 'pay',
    pickup: i.pickup,
  });
  if (!payable.discount.applies) return null;
  const applied = payMethodForDiscount(i.step, i.payMethod, i.chosen, i.offer) === 'pay';
  return { mode: applied ? 'applied' : 'preview', discount: payable.discount.amount, cardTotal: payable.total };
}

/** `?oferta=online10`: the navbar "Compra YA! 10% de descuento" link (src/components/Navbar.astro). */
export const ONLINE_OFFER_PARAM = 'oferta';
export const ONLINE_OFFER_VALUE = 'online10';

/** True when `search` (window.location.search) carries the online-card offer. */
export function hasOnlineOfferParam(search: string): boolean {
  return new URLSearchParams(search).get(ONLINE_OFFER_PARAM) === ONLINE_OFFER_VALUE;
}
