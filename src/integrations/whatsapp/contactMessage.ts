// Builds the WhatsApp message for the #contacto webform (T9.2). A separate
// template from buildQuoteMessage.ts (§2.6, cotizador) — shares only the
// URL-encoding helper in waLink.ts, never constructs a wa.me URL directly
// (ADR-004; review-gates.md "wa.me appears exactly once, in waLink.ts").
// Ported 1:1 from the approved board's reference logic
// (ios-08-contacto-webform.dc.html renderVals()).
export interface ContactMessageInput {
  nombre: string;
  telefono: string;
  producto: string;
  mensaje: string;
}

/** Strips everything but digits, e.g. "7680-2410" -> "76802410". */
export function telefonoDigits(telefono: string): string {
  return telefono.replace(/\D/g, '');
}

/** True only once the user has typed something that isn't exactly 8 digits. */
export function isTelefonoError(telefono: string): boolean {
  return telefono.length > 0 && telefonoDigits(telefono).length !== 8;
}

/** Nombre present + a structurally valid 8-digit phone. */
export function isContactFormReady(nombre: string, telefono: string): boolean {
  return nombre.trim().length > 0 && telefonoDigits(telefono).length === 8;
}

export function buildContactMessage({ nombre, telefono, producto, mensaje }: ContactMessageInput): string {
  const productoText = producto || 'Otro';
  return (
    `Hola ALCUSA, soy ${nombre.trim()} (${telefono.trim()}). ` + `Me interesa: ${productoText}. ${mensaje.trim()}`
  );
}
