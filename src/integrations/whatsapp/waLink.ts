// Builds the wa.me URL from a message + PUBLIC_WHATSAPP_NUMBER.
// The ONLY place allowed to construct a raw WhatsApp URL (README §4,
// review-gates.md "wa.me appears exactly once in the codebase").
const DEFAULT_WHATSAPP_NUMBER = '50376802410';

function whatsappNumber(): string {
  return import.meta.env.PUBLIC_WHATSAPP_NUMBER || DEFAULT_WHATSAPP_NUMBER;
}

/**
 * Builds a `wa.me` deep link. With no message, opens a blank chat (quick
 * contact icons in the top bar / drawer / footer, per T1.1). With a message,
 * URL-encodes it (ADR-004).
 */
export function buildWaLink(message?: string): string {
  const base = `https://wa.me/${whatsappNumber()}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
