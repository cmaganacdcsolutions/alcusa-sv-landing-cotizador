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
}

export interface QuoteMessageInput {
  items: QuoteMessageItem[];
  transporte: number;
  total: number;
  anticipo: number;
  saldo: number;
  /** No address field exists yet in this slice — stays a visible placeholder. */
  direccion?: string;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function buildQuoteMessage(input: QuoteMessageInput): string {
  const lines = input.items
    .map((item, index) => {
      const discountSuffix = item.descuentoAplicado ? ', descuento aplicado' : '';
      return (
        `${index + 1}. ${item.producto} — ${item.anchoM.toFixed(2)}×${item.altoM.toFixed(2)} m · ` +
        `Color: ${item.color} · Vidrio: ${item.vidrio}${discountSuffix}\n` +
        `   Zona: ${item.zona} · Entrega: ${item.entrega}\n` +
        `   Subtotal: ${money(item.subtotal)}`
      );
    })
    .join('\n');

  return (
    'Hola ALCUSA, quiero confirmar esta cotización:\n\n' +
    `${lines}\n\n` +
    `Transporte: ${money(input.transporte)}\n` +
    `Total estimado: ${money(input.total)}\n` +
    `Anticipo (80%): ${money(input.anticipo)} · Saldo (20% al entregar): ${money(input.saldo)}\n` +
    `Dirección: ${input.direccion ?? '[dirección]'}\n\n` +
    'Por favor confirmen medidas, disponibilidad y forma de pago. ¡Gracias!'
  );
}
