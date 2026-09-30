// R4 — orchestrates customer dialog (R07.1) -> folio -> PDF -> delivery (ios/android/desktop-r07).
// Nothing is requested on mount: the folio is issued only after the dialog validates (ADR-011 §5).
// States: idle (A) | preparing (B) | shared (D) | ready (E) | error (G) | downloaded (desktop toast C).
// F (AbortError) is silent and lands back on idle with focus on the button.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildQuotePdf, prefetchQuotePdf } from '../../../lib/quote-pdf';
import {
  createQuoteFolioProvider,
  QuoteFolioApiError,
  readLoadedFromCode,
  type QuoteFolio,
  type QuoteFolioProvider,
} from '../../../lib/quote-folio';
import { MSG, saveStoredCustomer, type CustomerData } from '../../../lib/quote-customer';
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
export type CartShareInput = Omit<QuoteDocumentInput, 'folio' | 'issuedAt' | 'customer'>;
export type ShareIntent = 'share' | 'download';

interface Prepared {
  folio: string;
  file: File;
  waHref: string;
}
interface Issued {
  hash: string;
  folio: QuoteFolio;
  customer: CustomerData;
  promise?: Promise<Prepared>;
  prepared?: Prepared;
}

/** Field errors the dialog shows after a 422 (invalid_customer / consent_required) or the H5 state. */
export type SubmitResult =
  | { ok: true }
  | { ok: false; fields: { name?: string; whatsapp?: string; consent?: string }; server: boolean };

export interface UseQuoteShare {
  status: QuoteShareStatus;
  /** wa.me href that carries the folio; undefined until the folio resolves. */
  folioWaHref: string | undefined;
  /** 'android' switches the touch targets from 44 to 48 (android-r07). */
  platform: 'android' | 'other';
  /** R07.1 customer dialog (H / E). */
  dialogOpen: boolean;
  /** Pass the pressed button so focus can return to it after a cancel (F / dialog). */
  press: (from?: HTMLElement | null) => void;
  shareAgain: () => void;
  retry: () => void;
  /** Opens the dialog first when no folio exists for this cart yet. */
  download: (from?: HTMLElement | null) => void;
  dismissToast: () => void;
  submitCustomer: (c: CustomerData) => Promise<SubmitResult>;
  cancelDialog: () => void;
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

function fieldErrors(err: QuoteFolioApiError): { name?: string; whatsapp?: string; consent?: string } {
  const f = err.fields;
  const out: { name?: string; whatsapp?: string; consent?: string } = {};
  const n = f['customer.name'];
  if (n) out.name = n === 'required' ? MSG.nameRequired : n === 'too_short' ? MSG.nameShort : n === 'too_long' ? MSG.nameLong : MSG.nameChars;
  const w = f['customer.whatsapp'];
  if (w) out.whatsapp = w === 'required' ? MSG.waRequired : MSG.waInvalid;
  if (f.consent) out.consent = MSG.consent;
  return out;
}

export function useQuoteShare(input: CartShareInput, provider?: QuoteFolioProvider): UseQuoteShare {
  const hash = cartHash(input);
  const inputRef = useRef(input);
  inputRef.current = input;
  const hashRef = useRef(hash);
  hashRef.current = hash;
  const providerRef = useRef<QuoteFolioProvider>(provider ?? createQuoteFolioProvider());
  const issuedRef = useRef<Issued | null>(null);
  /** Same key is reused while cart + customer are unchanged (retry after H5 is idempotent); new key otherwise. */
  const attemptRef = useRef<{ sig: string; key: string } | null>(null);
  /** Last canonical (server) folio, linked as supersedesCode when the cart/data change. */
  const lastServerCode = useRef<string | undefined>(undefined);
  const intentRef = useRef<ShareIntent>('share');
  const pressedRef = useRef<HTMLElement | null>(null);
  const [status, setStatus] = useState<QuoteShareStatus>('idle');
  const [folioWaHref, setFolioWaHref] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const platform = useMemo<'android' | 'other'>(
    () => (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) ? 'android' : 'other'),
    [],
  );

  /** Builds the PDF + chat text once the folio exists (never before). */
  const prepareFile = useCallback((issued: Issued): Promise<Prepared> => {
    if (issued.promise) return issued.promise;
    const cur = inputRef.current;
    const promise = (async (): Promise<Prepared> => {
      const doc = toQuoteDocument({ ...cur, folio: issued.folio.code, issuedAt: new Date(), customer: issued.customer });
      const file = await buildQuotePdf(doc);
      const waHref = quoteWaHref({
        folio: issued.folio.code,
        items: doc.items.map((i) => ({ name: i.name, variant: i.variant, measures: i.measures, price: i.price })),
        transport: cur.transport,
        total: cur.total,
      });
      return { folio: issued.folio.code, file, waHref };
    })();
    issued.promise = promise;
    promise.then(
      (p) => {
        issued.prepared = p;
        if (issuedRef.current === issued) setFolioWaHref(p.waHref);
      },
      () => {
        issued.promise = undefined; // retry rebuilds
      },
    );
    return promise;
  }, []);

  // Resumen mount: warm the PDF chunk only. No folio request until the dialog is submitted.
  useEffect(() => {
    prefetchQuotePdf();
  }, []);
  useEffect(() => {
    setStatus('idle'); // cart changed: D/E/toast no longer apply
    setFolioWaHref(undefined);
    setDialogOpen(false);
  }, [hash]);

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

  const currentIssued = (): Issued | null => (issuedRef.current?.hash === hashRef.current ? issuedRef.current : null);

  const runShareFlow = useCallback((): void => {
    const issued = currentIssued();
    if (!issued) return setDialogOpen(true);
    if (issued.prepared) {
      void deliver(issued.prepared); // synchronous up to navigator.share: keeps transient activation
      return;
    }
    setStatus('preparing');
    prepareFile(issued).then(deliver, () => setStatus('error'));
  }, [deliver, prepareFile]);

  const runDownloadFlow = useCallback((): void => {
    const issued = currentIssued();
    if (!issued) return setDialogOpen(true);
    if (issued.prepared) return saveFile(issued.prepared.file);
    setStatus('preparing');
    prepareFile(issued).then(
      (p) => {
        saveFile(p.file);
        setStatus('downloaded');
      },
      () => setStatus('error'),
    );
  }, [prepareFile]);

  const press = useCallback((from?: HTMLElement | null): void => {
    if (status === 'preparing') return;
    pressedRef.current = from ?? null;
    intentRef.current = 'share';
    runShareFlow();
  }, [runShareFlow, status]);

  const download = useCallback((from?: HTMLElement | null): void => {
    if (status === 'preparing') return;
    if (from) pressedRef.current = from;
    intentRef.current = 'download';
    runDownloadFlow();
  }, [runDownloadFlow, status]);

  const retry = useCallback((): void => {
    const issued = currentIssued();
    if (issued) issued.promise = undefined;
    setStatus('idle');
    intentRef.current = 'share';
    runShareFlow();
  }, [runShareFlow]);

  const cancelDialog = useCallback((): void => {
    setDialogOpen(false);
    window.setTimeout(() => pressedRef.current?.focus(), 0);
  }, []);

  const submitCustomer = useCallback(async (customer: CustomerData): Promise<SubmitResult> => {
    const cur = inputRef.current;
    const sig = `${hashRef.current}|${customer.name}|${customer.whatsapp}`;
    if (attemptRef.current?.sig !== sig) attemptRef.current = { sig, key: crypto.randomUUID() };
    const supersedes = lastServerCode.current ?? readLoadedFromCode();
    let folio: QuoteFolio;
    try {
      folio = await providerRef.current.issue(toFolioRequest(cur, customer, attemptRef.current.key, supersedes));
    } catch (err) {
      if (err instanceof QuoteFolioApiError) {
        const fields = fieldErrors(err);
        return { ok: false, fields, server: Object.keys(fields).length === 0 };
      }
      return { ok: false, fields: {}, server: true };
    }
    saveStoredCustomer(customer);
    if (folio.source === 'server') lastServerCode.current = folio.code;
    issuedRef.current = { hash: hashRef.current, folio, customer };
    setDialogOpen(false);
    window.setTimeout(() => pressedRef.current?.focus(), 0);
    if (intentRef.current === 'download') runDownloadFlow();
    else runShareFlow();
    return { ok: true };
  }, [runDownloadFlow, runShareFlow]);

  const dismissToast = useCallback((): void => setStatus((s) => (s === 'downloaded' ? 'idle' : s)), []);

  useEffect(() => {
    if (status !== 'downloaded') return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') dismissToast();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [status, dismissToast]);

  return { status, folioWaHref, platform, dialogOpen, press, shareAgain: runShareFlow, retry, download, dismissToast, submitCustomer, cancelDialog };
}
