// onlineDiscount — pure pricing module. No React/Astro/window/document/fetch imports.
// Descuento de 10% por comprar desde la web pagando con tarjeta (Wompi).
// Regla CONFIRMADA por el usuario el 2026-10-06: "El 10% se aplica al comprar desde la
// web con tarjeta." Los defaults tambien fueron confirmados por el usuario (2026-10-06).

/** Forma de pago del Paso 5: 'wa' = confirmar por WhatsApp, 'pay' = tarjeta en linea (Wompi). */
export type PayMethod = 'wa' | 'pay';

/** La unica forma de pago que recibe el descuento (tarjeta en linea / Wompi). */
export const ONLINE_CARD_PAY_METHOD: PayMethod = 'pay';

// confirmado por el usuario 2026-10-06
export const ONLINE_CARD_DISCOUNT = {
  rate: 0.1,
  /** El envio nunca se descuenta. */
  appliesToShipping: false,
  /**
   * Cambio (2026-10-08, decision del usuario): "cada promocion tiene su propio reglaje". Una cotizacion
   * en contexto promo (`?promo=<id>`) NO recibe el 10% con tarjeta: solo la promo. El flujo normal y
   * `?oferta=online10` siguen igual. Ver `promo` en OnlineCardDiscountInput.
   */
  appliesToPromoItems: false,
  /** Se acumula con el -15% de retiro en tienda (el 10% se calcula DESPUES de ese -15%). */
  stacksWithPickupDiscount: true,
} as const;

export interface OnlineCardDiscountInput {
  payMethod: PayMethod | null | undefined;
  /** Suma de subtotales de producto. Ya incluye el -15% de retiro (lo aplica el motor por item). */
  itemsSubtotal: number;
  /** Envio conocido; 0/undefined si es retiro o "por confirmar". */
  shippingFee?: number;
  /** Parte de itemsSubtotal que viene de productos en promocion (solo se usa si la config los excluye). */
  promoItemsSubtotal?: number;
  /** true = la cotizacion esta en contexto promo: el 10% NO aplica (ni preview ni linea aplicada). */
  promo?: boolean;
  /** true si la entrega es retiro en tienda (solo se usa si la config no permite acumular). */
  pickup?: boolean;
}

export interface OnlineCardDiscountResult {
  applies: boolean;
  rate: number;
  /** Base sobre la que se calculo el porcentaje. */
  base: number;
  /** Monto a descontar, positivo, redondeado a centavos como el resto del motor. */
  amount: number;
}

// Mismo redondeo a centavos que engine/pricing/{straight,corner,garden}.ts.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const NONE: OnlineCardDiscountResult = { applies: false, rate: 0, base: 0, amount: 0 };

export function computeOnlineCardDiscount(input: OnlineCardDiscountInput): OnlineCardDiscountResult {
  const cfg = ONLINE_CARD_DISCOUNT;
  if (input.payMethod !== ONLINE_CARD_PAY_METHOD) return NONE;
  if (input.promo && !cfg.appliesToPromoItems) return NONE;
  if (input.pickup && !cfg.stacksWithPickupDiscount) return NONE;

  let base = input.itemsSubtotal;
  if (cfg.appliesToShipping) base += input.shippingFee ?? 0;
  base = round2(Math.max(0, base));

  const amount = round2(base * cfg.rate);
  if (amount <= 0) return NONE;
  return { applies: true, rate: cfg.rate, base, amount };
}
