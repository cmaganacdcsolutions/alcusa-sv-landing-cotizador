// Public boundary of the quote PDF. pdf-lib is only ever imported through the
// dynamic import below, so it stays out of the initial /cotizador JS.
import { QUOTE_COMPANY } from './config';
import { quoteFileName } from './format';
import type { QuoteDocument, QuotePdfAssets } from './types';

export { QUOTE_COMPANY, pendingCompanyData } from './config';
export { formatUsd, formatDateSv, quoteFileName } from './format';
export type { QuoteDocument, QuoteDocumentItem, QuotePdfAssets } from './types';

async function fetchBytes(url: string): Promise<Uint8Array | undefined> {
  try {
    const r = await fetch(url);
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : undefined;
  } catch {
    return undefined;
  }
}

/** Same-origin fonts + logo (ADR-009 §1). Missing fonts => Helvetica fallback inside the renderer. */
export function loadBrowserAssets(): Promise<QuotePdfAssets> {
  // Cached for the session: fonts/logo are fetched once, only at PDF time, never in the page bundle.
  assetsPromise ??= fetchAssets().then((a) => {
    if (!a.fonts || !a.logoPng) assetsPromise = undefined; // do not cache a partial/failed load
    return a;
  });
  return assetsPromise;
}

let assetsPromise: Promise<QuotePdfAssets> | undefined;

async function fetchAssets(): Promise<QuotePdfAssets> {
  const u = QUOTE_COMPANY.fontUrls;
  const [fraunces600, manrope400, manrope700, logoPng] = await Promise.all([
    fetchBytes(u.fraunces600),
    fetchBytes(u.manrope400),
    fetchBytes(u.manrope700),
    fetchBytes(QUOTE_COMPANY.logoUrl),
  ]);
  return {
    ...(fraunces600 && manrope400 && manrope700 ? { fonts: { fraunces600, manrope400, manrope700 } } : {}),
    ...(logoPng ? { logoPng } : {}),
  };
}

/** Warm the lazy chunk when Resumen mounts (no PDF build). */
export function prefetchQuotePdf(): void {
  void import('./render');
}

export async function buildQuotePdf(doc: QuoteDocument, assets?: QuotePdfAssets): Promise<File> {
  const { renderQuotePdf } = await import('./render');
  const bytes = await renderQuotePdf(doc, assets ?? (await loadBrowserAssets()));
  return new File([bytes as BlobPart], quoteFileName(doc.folio), { type: 'application/pdf' });
}
