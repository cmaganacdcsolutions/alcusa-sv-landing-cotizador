// Builds the WhatsApp deep-link message text from cart state. Template per
// prototype-spec.md §2.6 (cotizador). Pure function — snapshot-tested
// against the literal template (ADR-004/006). §2.9 (contact form) lands
// alongside the contact webform slice.
export interface QuoteMessageItem {
  producto: string;
  anchoM: number;
  altoM: number;
  color: string;
  vidrio: string;
  descuentoAplicado?: boolean;
  zona: string;
  entrega: 'con instalación' | 'retiro en tienda';
  subtotal: number;
  /** S5 (hinged, cart-aware qty 1-50): shown only when > 1, keeps the S1 template byte-for-byte for qty-1 items. */
  cantidad?: number;
}

export interface QuoteMessageInput {
  items: QuoteMessageItem[];
  transporte: number;
  total: number;
  anticipo: number;
  saldo: number;
  /** No address field exists yet in this slice — stays a visible placeholder. */
  direccion?: string;
  /** Distrito sin tarifa automatica: el envio no esta incluido en `total` y se confirma por WhatsApp. */
  shippingPending?: boolean;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function buildQuoteMessage(input: QuoteMessageInput): string {
  const lines = input.items
    .map((item, index) => {
      const discountSuffix = item.descuentoAplicado ? ', descuento aplicado' : '';
      const cantidadSuffix = item.cantidad && item.cantidad > 1 ? ` · Cantidad: ${item.cantidad}` : '';
      return (
        `${index + 1}. ${item.producto} — ${item.anchoM.toFixed(2)}×${item.altoM.toFixed(2)} m · ` +
        `Color: ${item.color} · Vidrio: ${item.vidrio}${discountSuffix}${cantidadSuffix}\n` +
        `   Zona: ${item.zona} · Entrega: ${item.entrega}\n` +
        `   Subtotal: ${money(item.subtotal)}`
      );
    })
    .join('\n');

  return (
    'Hola ALCUSA, quiero confirmar esta cotización:\n\n' +
    `${lines}\n\n` +
    (input.shippingPending
      ? 'Transporte: Envío por confirmar\n' + `Total estimado: ${money(input.total)} (más envío por confirmar)\n`
      : `Transporte: ${money(input.transporte)}\n` + `Total estimado: ${money(input.total)}\n`) +
    `Anticipo (80%): ${money(input.anticipo)} · Saldo (20% al entregar): ${money(input.saldo)}\n` +
    `Dirección: ${input.direccion ?? '[dirección]'}\n\n` +
    'Por favor confirmen medidas, disponibilidad y forma de pago. ¡Gracias!'
  );
}

/**
 * Prefilled message for advisorOnly catalog leaves (ADR-008 §3). Carries no
 * price on purpose: these combinations are quoted by an advisor.
 */
export function buildAdvisorMessage(productName: string): string {
  return `Hola ALCUSA, me interesa cotizar: ${productName}. ¿Me pueden asesorar con medidas y precio?`;
}

/**
 * Catalog (boards r05/r06) copy for advisorOnly items: "Hola, quiero cotizar X".
 * Kept apart from buildAdvisorMessage, which the cotizador island shares.
 */
export function buildCatalogAdvisorMessage(productName: string): string {
  return `Hola, quiero cotizar ${productName}`;
}
