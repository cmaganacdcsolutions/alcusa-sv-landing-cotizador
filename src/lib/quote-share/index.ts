import { buildWaLink } from '../../integrations/whatsapp/waLink';
import { formatUsd } from '../quote-pdf/format';

/** Message budget from ADR-009 §5: encoded text must stay <= 1,800 chars. */
export const WA_ENCODED_BUDGET = 1800;

export interface ShareMessageItem {
  name: string;
  variant: string;
  measures: string;
  price: number;
}

export interface ShareMessageInput {
  folio: string;
  items: ShareMessageItem[];
  transport: number;
  total: number;
}

/** Text of the wa.me chat (desktop-r07 state C miniature, 1:1). */
export function buildQuoteShareMessage(input: ShareMessageInput): string {
  const head = ['Hola, ALCUSA. Quiero confirmar mi cotización.', `N.º ${input.folio}`];
  const tail = [`Transporte: ${formatUsd(input.transport).replace('.00', '')}`, `Total: ${formatUsd(input.total).replace('.00', '')}`, 'Adjunto el PDF de mi cotización.'];
  const money = (n: number): string => formatUsd(n).replace('.00', '');
  const lines = input.items.map((it, i) => `${i + 1}. ${it.name} · ${[it.variant, it.measures && `${it.measures} cm`].filter(Boolean).join(' · ')} — ${money(it.price)}`);
  const full = [...head, ...lines, ...tail].join('\n');
  if (encodeURIComponent(full).length <= WA_ENCODED_BUDGET) return full;
  // ADR-009 §5 degradation: never cut mid-item.
  return [...head, `${input.items.length} productos (ver PDF)`, ...tail].join('\n');
}

/** Short text for the Web Share path (the PDF carries the detail). */
export function buildQuoteShareText(folio: string, total: number): string {
  return `Cotización ALCUSA N.º ${folio} · Total ${formatUsd(total).replace('.00', '')}`;
}

export const quoteShareTitle = (folio: string): string => `Cotización ALCUSA ${folio}`;

export function quoteWaHref(input: ShareMessageInput): string {
  return buildWaLink(buildQuoteShareMessage(input));
}

export interface ShareNavigator {
  canShare?: (data: { files: File[] }) => boolean;
  share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
}

/** User decision 2026-09-29: share only on coarse-pointer devices that can share files. */
export function chooseDelivery(nav: ShareNavigator, file: File, coarsePointer: boolean): 'share' | 'fallback' {
  return coarsePointer && typeof nav.canShare === 'function' && typeof nav.share === 'function' && nav.canShare({ files: [file] })
    ? 'share'
    : 'fallback';
}

export type ShareOutcome = 'shared' | 'cancelled' | 'needs-second-tap' | 'fallback';

/** Runs navigator.share and maps errors per r07: Abort=F, NotAllowed=E, other=fallback (G handled by caller). */
export async function runShare(nav: ShareNavigator, file: File, title: string, text: string): Promise<ShareOutcome> {
  try {
    await nav.share!({ files: [file], title, text });
    return 'shared';
  } catch (err) {
    const name = err instanceof DOMException || err instanceof Error ? err.name : '';
    if (name === 'AbortError') return 'cancelled';
    if (name === 'NotAllowedError') return 'needs-second-tap';
    return 'fallback';
  }
}
