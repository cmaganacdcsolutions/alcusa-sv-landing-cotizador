// Pure "what does the customer pay" aggregator: products + shipping (fee | none | pending)
// minus the 10% online-card discount. No React/window/document imports — unit-tested
// directly, same rule as state/order.ts and state/quote.ts.
//
// Order of operations (confirmed by the user 2026-10-06):
//   items (engine already applied the retiro -15% per item)
//   -> online card 10% over the items subtotal (never over shipping)
//   -> + shipping when known; "por confirmar" shipping adds 0 and sets shippingPending.
// The 80/100 deposit is ALWAYS computed on `total` (the discounted amount).
import { computeOnlineCardDiscount, getZoneFee, type OnlineCardDiscountResult, type PayMethod } from '@engine/pricing';

export type ShippingState =
  | { kind: 'none' } // retiro en tienda: sin transporte
  | { kind: 'fee'; fee: number } // zona con tarifa automatica
  | { kind: 'pending' }; // distrito sin tarifa ('otro'): se confirma por WhatsApp, NO bloquea el flujo

/**
 * Envio de una entrega. Con instalacion SOLO llamar con la direccion completa
 * (zone '' tambien resolveria a 'pending'): el caller decide antes si ya hay direccion.
 */
export function resolveShipping(entrega: 'instalacion' | 'retiro', zone: string): ShippingState {
  if (entrega === 'retiro') return { kind: 'none' };
  const fee = getZoneFee(zone);
  return fee === undefined ? { kind: 'pending' } : { kind: 'fee', fee };
}

export interface PayableInput {
  /** Sum of item subtotals (orderItemsSubtotal). Already includes the retiro -15%. */
  itemsSubtotal: number;
  shipping: ShippingState;
  /** null/undefined = metodo aun no conocido -> sin descuento. */
  payMethod: PayMethod | null | undefined;
  pickup: boolean;
  /** Contexto promo: sin 10% con tarjeta. */
  promo?: boolean;
  promoItemsSubtotal?: number;
}

export interface Payable {
  itemsSubtotal: number;
  /** 0 when shipping is none or pending. */
  shippingFee: number;
  shippingPending: boolean;
  discount: OnlineCardDiscountResult;
  /** products + known shipping, before the card discount. */
  totalBeforeDiscount: number;
  /** What the customer pays: totalBeforeDiscount - discount.amount. */
  total: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computePayable(i: PayableInput): Payable {
  const shippingFee = i.shipping.kind === 'fee' ? i.shipping.fee : 0;
  const discount = computeOnlineCardDiscount({
    payMethod: i.payMethod,
    itemsSubtotal: i.itemsSubtotal,
    shippingFee,
    pickup: i.pickup,
    ...(i.promo ? { promo: true } : {}),
    ...(i.promoItemsSubtotal !== undefined ? { promoItemsSubtotal: i.promoItemsSubtotal } : {}),
  });
  const totalBeforeDiscount = round2(i.itemsSubtotal + shippingFee);
  return {
    itemsSubtotal: i.itemsSubtotal,
    shippingFee,
    shippingPending: i.shipping.kind === 'pending',
    discount,
    totalBeforeDiscount,
    total: round2(totalBeforeDiscount - discount.amount),
  };
}

/** 80% deposit exactly like Step4/5/6/7 and the aside compute it today (Math.round(total*80)/100). */
export function depositOf(total: number): number {
  return Math.round(total * 80) / 100;
}

/** Amount charged now: 80% deposit or the whole (discounted) total. */
export function amountToChargeNow(total: number, pct: 80 | 100): number {
  return pct === 80 ? depositOf(total) : total;
}

/**
 * Which pay method counts for the 10% online-card discount at a given wizard step.
 * Steps 0-3 never show it; Resumen only after the customer actually picked a method in
 * Step5 (payMethod defaults to 'pay', which must not leak a discount before the choice);
 * forma de pago / Wompi / resultado always use the current method.
 * `offer` (arrived through `?oferta=online10`, APPLY_ONLINE_OFFER already marked the method as
 * chosen): the discount is ALSO applied at precio and zonaEntrega, the steps that show a total.
 */
export function payMethodForDiscount(
  step: string,
  payMethod: PayMethod,
  chosen: boolean,
  offer = false,
): PayMethod | null {
  if (step === 'formaPago' || step === 'wompi' || step === 'resultado') return payMethod;
  if (step === 'resumen' && chosen) return payMethod;
  if (offer && chosen && (step === 'precio' || step === 'zonaEntrega')) return payMethod;
  return null;
}

/** "−$12.34" for money rows (typographic minus, same char the cotizador uses for "−15%"). */
export function formatDiscount(amount: number): string {
  return `−$${amount.toFixed(2)}`;
}
