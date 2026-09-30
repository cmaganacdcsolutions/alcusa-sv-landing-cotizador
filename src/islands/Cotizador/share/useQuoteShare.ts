// R4 — orchestrates folio + PDF prewarm + delivery (ios/android/desktop-r07).
// States: idle (A) | preparing (B) | shared (D) | ready (E) | error (G) | downloaded (desktop toast C).
// F (AbortError) is silent and lands back on idle with focus on the button.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildQuotePdf, prefetchQuotePdf } from '../../../lib/quote-pdf';
import { createQuoteFolioProvider, type QuoteFolioProvider } from '../../../lib/quote-folio';
import {
  buildQuoteShareText,
  chooseDelivery,
  quoteShareTitle,
  quoteWaHref,
  runShare,
  type ShareNavigator,
} from '../../../lib/quote-share';
import { cartHash, toFolioRequest, toQuoteDocument, type QuoteDocumentInput } from '../state/quoteDocument';

export type QuoteShareStatus = 'idle' | 'preparing' | 'shared' | 'ready' | 'error' | 'downloaded';
export type CartShareInput = Omit<QuoteDocumentInput, 'folio' | 'issuedAt'>;

interface Prepared {
  folio: string;
  file: File;
  waHref: string;
}
interface CacheEntry {
  hash: string;
  promise: Promise<Prepared>;
  prepared?: Prepared;
}

export interface UseQuoteShare {
  status: QuoteShareStatus;
  /** wa.me href that carries the folio; undefined until the folio resolves. */
  folioWaHref: string | undefined;
  /** 'android' switches the touch targets from 44 to 48 (android-r07). */
  platform: 'android' | 'other';
  /** Pass the pressed button so focus can return to it after a silent cancel (F). */
  press: (from?: HTMLElement | null) => void;
  shareAgain: () => void;
  retry: () => void;
  download: () => void;
  dismissToast: () => void;
}

const isCoarse = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

function saveFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function useQuoteShare(input: CartShareInput, provider?: QuoteFolioProvider): UseQuoteShare {
  const hash = cartHash(input);
  const inputRef = useRef(input);
  inputRef.current = input;
  const providerRef = useRef<QuoteFolioProvider>(provider ?? createQuoteFolioProvider());
  const cache = useRef<CacheEntry | null>(null);
  const pressedRef = useRef<HTMLElement | null>(null);
  const [status, setStatus] = useState<QuoteShareStatus>('idle');
  const [folioWaHref, setFolioWaHref] = useState<string | undefined>(undefined);
  const platform = useMemo<'android' | 'other'>(
    () => (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) ? 'android' : 'other'),
    [],
  );

  const prepare = useCallback((h: string): CacheEntry => {
    if (cache.current?.hash === h) return cache.current;
    const cur = inputRef.current;
    const entry: CacheEntry = {
      hash: h,
      promise: (async (): Promise<Prepared> => {
        const folio = await providerRef.current.issue(toFolioRequest(cur, h));
        const doc = toQuoteDocument({ ...cur, folio: folio.code, issuedAt: new Date() });
        const file = await buildQuotePdf(doc);
        const waHref = quoteWaHref({
          folio: folio.code,
          items: doc.items.map((i) => ({ name: i.name, variant: i.variant, measures: i.measures, price: i.price })),
          transport: cur.transport,
          total: cur.total,
        });
        return { folio: folio.code, file, waHref };
      })(),
    };
    cache.current = entry;
    entry.promise.then(
      (p) => {
        entry.prepared = p;
        if (cache.current === entry) setFolioWaHref(p.waHref);
      },
      () => {
        if (cache.current === entry) cache.current = null; // retry rebuilds
      },
    );
    return entry;
  }, []);

  // Resumen mount: warm the chunk; per cart: request folio + prewarm the File.
  useEffect(() => {
    prefetchQuotePdf();
  }, []);
  useEffect(() => {
    setStatus('idle'); // cart changed: D/E/toast no longer apply
    setFolioWaHref(undefined);
    if (input.items.length > 0) prepare(hash);
  }, [hash, prepare, input.items.length]);

  const deliver = useCallback(async (p: Prepared): Promise<void> => {
    const nav = navigator as unknown as ShareNavigator;
    if (chooseDelivery(nav, p.file, isCoarse()) === 'share') {
      const out = await runShare(nav, p.file, quoteShareTitle(p.folio), buildQuoteShareText(p.folio, inputRef.current.total));
      if (out === 'shared') return setStatus('shared');
      if (out === 'cancelled') {
        setStatus('idle');
        return void window.setTimeout(() => pressedRef.current?.focus(), 0);
      }
      if (out === 'needs-second-tap') return setStatus('ready');
    }
    // Desktop (or share unavailable/failed): always download + wa.me in a new tab (ADR-009).
    saveFile(p.file);
    window.open(p.waHref, '_blank', 'noopener');
    setStatus('downloaded');
  }, []);

  const run = useCallback((): void => {
    const entry = prepare(hash);
    if (entry.prepared) {
      void deliver(entry.prepared); // synchronous up to navigator.share: keeps transient activation
      return;
    }
    setStatus('preparing');
    entry.promise.then(deliver, () => setStatus('error'));
  }, [deliver, hash, prepare]);

  const press = useCallback((from?: HTMLElement | null): void => {
    if (status === 'preparing') return;
    pressedRef.current = from ?? null;
    run();
  }, [run, status]);

  const retry = useCallback((): void => {
    cache.current = null;
    setStatus('idle');
    run();
  }, [run]);

  const download = useCallback((): void => {
    const entry = prepare(hash);
    if (entry.prepared) return saveFile(entry.prepared.file);
    setStatus('preparing');
    entry.promise.then(
      (p) => {
        saveFile(p.file);
        setStatus('downloaded');
      },
      () => setStatus('error'),
    );
  }, [hash, prepare]);

  const dismissToast = useCallback((): void => setStatus((s) => (s === 'downloaded' ? 'idle' : s)), []);

  useEffect(() => {
    if (status !== 'downloaded') return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') dismissToast();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [status, dismissToast]);

  return { status, folioWaHref, platform, press, shareAgain: run, retry, download, dismissToast };
}
