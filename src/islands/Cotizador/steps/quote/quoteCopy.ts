// Copy ADR-012 §6 VERBATIM (es-SV, usted/tu segun el ADR). Unica fuente.
import type { QuoteChange } from '../../state/loadQuote';

export const QUOTE_COPY = {
  title: '¿Ya tienes una cotización?',
  help: 'Ingresa tu código para cargarla. Lo encuentras en tu PDF o en el mensaje de WhatsApp.',
  label: 'Código de tu cotización',
  placeholder: 'ALC-20260930-K7QM-3X9T',
  cta: 'Cargar cotización',
  loadingCta: 'Cargando…',
  loadingLive: 'Buscando tu cotización…',
  incomplete: 'El código está incompleto. Debe verse así: ALC-20260930-K7QM-3X9T',
  check: 'Revisa el código: parece que hay un carácter equivocado.',
  contingency: 'Esta cotización se generó sin conexión y no quedó guardada. Escríbenos por WhatsApp y te ayudamos.',
  whatsapp: 'Escribir por WhatsApp',
  notFound: 'No encontramos una cotización con ese código. Revisa que esté completo o escríbenos por WhatsApp.',
  rateLimited: 'Hiciste demasiados intentos. Espera unos minutos y vuelve a probar.',
  offline: 'No pudimos consultar tu cotización. Revisa tu conexión e inténtalo de nuevo.',
  server: 'Estamos teniendo un problema de nuestro lado. Inténtalo en unos minutos o escríbenos por WhatsApp.',
  retry: 'Reintentar',
  startNew: 'Empezar una nueva',
  confirmText: 'Ya tienes productos en tu cotización actual. Si cargas la anterior, se reemplazarán.',
  replace: 'Reemplazar',
  cancel: 'Cancelar',
  noticeTitle: 'Actualizamos tu cotización',
  noticeButton: 'Entendido',
  updatedTag: 'Precios actualizados',
  retryIn: (n: number): string => `Vuelve a intentarlo en ${n} min.`,
  loaded: (code: string): string => `Cotización ${code} cargada. Puedes revisarla y editarla.`,
  changedSince: (date: string): string => `Algunos precios cambiaron desde el ${date}. Revisa el detalle antes de continuar.`,
  expiredOn: (date: string): string => `Esta cotización venció el ${date}. Cargamos tus productos con los precios de hoy.`,
  totals: (before: string, after: string): string => `Total anterior ${before} · Total actual ${after}`,
  change: (c: QuoteChange, money: (n: number) => string): string => {
    switch (c.kind) {
      case 'price_changed':
        return `${c.name}: antes ${money(c.before)}, ahora ${money(c.after)}.`;
      case 'promo_expired':
        return `${c.name}: la promoción ya no está vigente.`;
      case 'discontinued':
        return `${c.name}: ya no está disponible y se quitó de tu cotización.`;
      case 'unsupported':
        return `${c.name}: cambió una de sus opciones y hay que configurarlo de nuevo.`;
    }
  },
} as const;

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '2026-09-12' -> '12 de septiembre de 2026' (sin husos: parte la cadena). */
export function formatDateEs(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

/** Whole dollars as `$912`, cents as `$912.50`. */
export function formatMoney(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}
