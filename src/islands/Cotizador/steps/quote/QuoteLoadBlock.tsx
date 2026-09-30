import { useEffect, useRef, useState, type ReactElement } from 'react';
import { formatQuoteCode, groupQuoteInput, normalizeQuoteCode } from '@integrations/quotes/code';
import { getQuoteClient, QuoteLoadFailure, type QuoteClient } from '@integrations/quotes';
import { buildWaLink } from '@integrations/whatsapp/waLink';
import { IconWhatsApp } from '../../icons';
import { applyLoadedQuote, type AppliedQuote } from '../../state/loadQuote';
import {
  IconQuoteAlert,
  IconQuoteClock,
  IconQuoteChevron,
  IconQuoteDoc,
  IconQuoteOffline,
  IconQuoteSearch,
  IconQuoteSpinner,
  IconQuoteTriangle,
} from './QuoteIcons';
import { QUOTE_COPY as C } from './quoteCopy';

/** sessionStorage: folio del que viene el carrito (luego viaja como `supersedesCode`). Sin datos de cliente. */
export const LOADED_FROM_KEY = 'alcusa-cotizador-loaded-from';

type Problem = 'incomplete' | 'check' | 'contingency' | 'not_found' | 'rate_limited' | 'offline' | 'server';
type Phase = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; problem: Problem };

export interface QuoteLoadBlockProps {
  /** Hay productos en la cotizacion actual: pedir confirmacion antes de reemplazar. */
  hasItems: boolean;
  /** Folio de `?folio=`: abre el bloque y dispara la carga una vez. */
  autoFolio?: string | null;
  onLoad: (applied: AppliedQuote) => void;
  /** "Empezar una nueva": limpia el campo y vuelve al estado vacio. */
  client?: QuoteClient;
}

export default function QuoteLoadBlock({ hasItems, autoFolio = null, onLoad, client }: QuoteLoadBlockProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [pending, setPending] = useState<AppliedQuote | null>(null);
  const [retryLeft, setRetryLeft] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoRan = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const rowRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const parsed = normalizeQuoteCode(value);
  const valid = parsed.ok;
  const loading = phase.kind === 'loading';
  const limited = retryLeft > 0;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only media read
    if (window.matchMedia('(min-width: 768px)').matches) setOpen(true);
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (retryLeft <= 0) return undefined;
    const t = setTimeout(() => setRetryLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [retryLeft]);

  // Foco inicial en "Cancelar"; Esc = Cancelar (board estado 9).
  useEffect(() => {
    if (!pending) return undefined;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPending(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  const run = async (raw: string): Promise<void> => {
    const n = normalizeQuoteCode(raw);
    if (!n.ok) {
      setPhase({ kind: 'error', problem: n.reason });
      return;
    }
    setPhase({ kind: 'loading' });
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const res = await (client ?? getQuoteClient()).getQuote(n.code, { signal: ctl.signal });
      const applied = applyLoadedQuote(res);
      if (applied.items.length === 0) {
        setPhase({ kind: 'error', problem: 'not_found' });
        return;
      }
      setPhase({ kind: 'idle' });
      if (hasItems) setPending(applied);
      else commit(applied);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const code = err instanceof QuoteLoadFailure ? err.code : 'server_error';
      if (code === 'rate_limited') setRetryLeft((err as QuoteLoadFailure).retryAfterSec ?? 0);
      const problem: Problem =
        code === 'invalid_code' ? 'check' : code === 'server_error' ? 'server' : (code as Problem);
      setPhase({ kind: 'error', problem });
    }
  };

  const commit = (applied: AppliedQuote): void => {
    try {
      window.sessionStorage.setItem(LOADED_FROM_KEY, applied.notice.code);
    } catch {
      // modo privado: solo se pierde el supersedesCode.
    }
    setPending(null);
    onLoad(applied);
  };

  useEffect(() => {
    if (!autoFolio || autoRan.current) return;
    autoRan.current = true;
    const grouped = groupQuoteInput(autoFolio);
    setValue(grouped);
    setOpen(true);
    void run(grouped);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una sola vez
  }, [autoFolio]);

  const problem = phase.kind === 'error' ? phase.problem : null;
  const inputError =
    problem === 'incomplete' || problem === 'check' || problem === 'not_found' || problem === 'offline' || problem === 'server';
  const liveText =
    loading
      ? C.loadingLive
      : problem === 'incomplete'
        ? C.incomplete
        : problem === 'check'
          ? C.check
          : problem === 'not_found'
            ? C.notFound
            : problem === 'offline'
              ? C.offline
              : problem === 'server'
                ? C.server
                : '';
  const warn =
    problem === 'contingency' ? C.contingency : problem === 'rate_limited' ? (limited ? C.retryIn(Math.ceil(retryLeft / 60)) : C.rateLimited) : null;
  const waHref = buildWaLink();
  const waLink = (
    <a className="bt bs bs--wa" href={waHref} target="_blank" rel="noopener noreferrer">
      <IconWhatsApp size={20} />
      {C.whatsapp}
    </a>
  );

  const onBlur = (): void => {
    if (!value || loading) return;
    if (!valid) setPhase({ kind: 'error', problem: parsed.ok ? 'incomplete' : parsed.reason });
  };

  return (
    <div className="qload">
      {!open && (
        <button ref={rowRef} type="button" className="qr" aria-expanded="false" aria-controls="qc-panel" onClick={() => setOpen(true)}>
          <span className="qi"><IconQuoteDoc /></span>
          <span className="qt">{C.title}</span>
          <span className="qr__chev"><IconQuoteChevron /></span>
        </button>
      )}
      <section className="qc" id="qc-panel" aria-labelledby="qc-t" aria-busy={loading || undefined} hidden={!open}>
        <button type="button" className="qh" aria-expanded={open} aria-controls="qc-body" onClick={() => { setOpen(false); rowRef.current?.focus(); }}>
          <span className="qi"><IconQuoteDoc /></span>
          <span className="qt" id="qc-t">{C.title}</span>
          <span className="qh__chev"><IconQuoteChevron up /></span>
        </button>
        <div id="qc-body" className="qc__body">
          <p className="qhp" id="qc-help">{C.help}</p>
          <form
            className="qrow"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid && !loading && !limited) void run(value);
            }}
            noValidate
          >
            <div className="qfield">
              <label className="ql" htmlFor="qc-in">{C.label}</label>
              <input
                id="qc-in"
                ref={inputRef}
                className={`qin${inputError ? ' e' : ''}${problem === 'contingency' ? ' w' : ''}`}
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder={C.placeholder}
                value={value}
                disabled={loading || limited}
                aria-describedby="qc-help qc-live"
                aria-invalid={inputError || undefined}
                onChange={(e) => {
                  setValue(groupQuoteInput(e.target.value));
                  if (phase.kind === 'error' && !limited) setPhase({ kind: 'idle' });
                }}
                onFocus={() => inputRef.current?.scrollIntoView({ block: 'center' })}
                onBlur={onBlur}
              />
              <div id="qc-live" aria-live="polite">
                {liveText && (
                  <p className={`qm${loading ? ' qm--info' : ''}${problem === 'offline' || problem === 'server' ? '' : ''}`}>
                    {!loading && (problem === 'not_found' ? <IconQuoteSearch /> : problem === 'offline' ? <IconQuoteOffline /> : <IconQuoteAlert />)}
                    <span>{liveText}</span>
                  </p>
                )}
                {warn && (
                  <div className="qw">
                    {problem === 'rate_limited' ? <IconQuoteClock /> : <IconQuoteAlert />}
                    <span>{warn}</span>
                  </div>
                )}
              </div>
            </div>
            {problem === 'offline' || problem === 'server' ? (
              <div className="qbtns">
                <button type="submit" className="bt bp" disabled={!valid}>{C.retry}</button>
                <button type="button" className="bt bs" onClick={() => { setValue(''); setPhase({ kind: 'idle' }); inputRef.current?.focus(); }}>
                  {C.startNew}
                </button>
              </div>
            ) : (
              <div className="qbtns">
                {problem === 'contingency' && waLink}
                <button type="submit" className={`bt ${valid && !loading && !limited ? 'bp' : 'bd'}`} disabled={!valid || loading || limited}>
                  {loading && <IconQuoteSpinner />}
                  {loading ? C.loadingCta : C.cta}
                </button>
                {problem === 'not_found' && waLink}
              </div>
            )}
          </form>
        </div>
      </section>
      {pending && (
        <div className="qscrim">
          <div
            className="qdlg"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="qc-cf"
          >
            <span className="qi qi--warn"><IconQuoteTriangle size={22} strokeWidth={2} /></span>
            <p id="qc-cf" className="qdlg__text">{C.confirmText}</p>
            <div className="qdlg__btns">
              <button type="button" className="bt bs" ref={cancelRef} onClick={() => setPending(null)}>{C.cancel}</button>
              <button type="button" className="bt bp" onClick={() => commit(pending)}>{C.replace}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { formatQuoteCode };
