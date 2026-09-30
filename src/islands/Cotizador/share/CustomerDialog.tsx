import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import {
  clearStoredCustomer,
  consentStillValid,
  formatWhatsappInput,
  loadStoredCustomer,
  MSG,
  PRIVACY_NOTICE_URL,
  validateName,
  validateWhatsapp,
} from '../../../lib/quote-customer';
import type { UseQuoteShare } from './useQuoteShare';
import '@styles/cotizador-customer.css';

// R07.1 — "Tus datos para la cotización". ios/android-r07 estado H (hoja inferior) y
// desktop-r07 estado E (modal centrado >= 1024): un solo DOM, CSS decide.

const svgProps = {
  viewBox: '0 0 24 24',
  'aria-hidden': true,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function ErrorIcon(): ReactElement {
  return (
    <svg width="16" height="16" {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.2v.1" />
    </svg>
  );
}

type Phase = 'form' | 'sending' | 'server';
interface Errors {
  name: string;
  whatsapp: string;
  consent: string;
}
const NO_ERRORS: Errors = { name: '', whatsapp: '', consent: '' };
const FOCUSABLE = 'input:not([readonly]), button:not([tabindex="-1"]), a[href]:not([tabindex="-1"])';

export interface CustomerDialogProps {
  share: Pick<UseQuoteShare, 'dialogOpen' | 'platform' | 'submitCustomer' | 'cancelDialog'>;
}

export function CustomerDialog({ share }: CustomerDialogProps): ReactElement | null {
  if (!share.dialogOpen || typeof document === 'undefined') return null;
  return createPortal(<DialogBody share={share} />, document.body);
}

function DialogBody({ share }: CustomerDialogProps): ReactElement {
  const uid = useId();
  const id = (s: string): string => `${uid}-${s}`;
  const [initial] = useState(() => loadStoredCustomer());
  const remembered = initial !== null;
  const [name, setName] = useState(initial?.name ?? '');
  const [wa, setWa] = useState(initial ? formatWhatsappInput(initial.whatsapp) : '');
  const [consent, setConsent] = useState(initial ? consentStillValid(initial) : false);
  const [hasStored, setHasStored] = useState(remembered);
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);
  const [phase, setPhase] = useState<Phase>('form');
  const [announce, setAnnounce] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const waRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const busy = phase === 'sending';

  // Initial focus: Nombre (empty / errors) or the CTA (remembered data).
  useEffect(() => {
    const ready = remembered && validateName(initial.name).ok && validateWhatsapp(initial.whatsapp.replace('+503', '')).ok && consentStillValid(initial);
    (ready ? ctaRef.current : nameRef.current)?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [remembered, initial]);

  // Keyboard open: the sheet follows the visual viewport so the CTA is never covered.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = wrapRef.current;
    if (!vv || !el) return;
    const sync = (): void => {
      if (window.innerHeight - vv.height > 80) {
        // on-screen keyboard: follow the visual viewport
        el.style.setProperty('--cf-top', `${vv.offsetTop}px`);
        el.style.setProperty('--cf-h', `${vv.height}px`);
      } else {
        el.style.removeProperty('--cf-top');
        el.style.removeProperty('--cf-h');
      }
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, []);

  const cancel = useCallback((): void => {
    if (!busy) share.cancelDialog();
  }, [busy, share]);

  // Esc = cancel; Tab is trapped inside the dialog (modal).
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        return cancel();
      }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (n) => n.offsetParent !== null || n === document.activeElement,
      );
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (!dialogRef.current?.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [cancel]);

  const fieldError = (k: 'name' | 'whatsapp', v: string): string => {
    const r = k === 'name' ? validateName(v) : validateWhatsapp(v);
    return r.ok ? '' : r.error;
  };

  const onName = (e: ChangeEvent<HTMLInputElement>): void => {
    const v = e.target.value;
    setName(v);
    if (errors.name) setErrors((p) => ({ ...p, name: fieldError('name', v) }));
    if (phase === 'server') setPhase('form');
  };
  const onWa = (e: ChangeEvent<HTMLInputElement>): void => {
    const v = formatWhatsappInput(e.target.value);
    setWa(v);
    if (errors.whatsapp) setErrors((p) => ({ ...p, whatsapp: fieldError('whatsapp', v) }));
    if (phase === 'server') setPhase('form');
  };
  const onConsent = (e: ChangeEvent<HTMLInputElement>): void => {
    setConsent(e.target.checked);
    if (e.target.checked) setErrors((p) => ({ ...p, consent: '' }));
  };

  const focusFirstInvalid = (er: Errors): void => {
    if (er.name) nameRef.current?.focus();
    else if (er.whatsapp) waRef.current?.focus();
    else if (er.consent) consentRef.current?.focus();
  };

  const submit = async (): Promise<void> => {
    if (busy) return;
    const n = validateName(name);
    const w = validateWhatsapp(wa);
    const er: Errors = {
      name: n.ok ? '' : n.error,
      whatsapp: w.ok ? '' : w.error,
      consent: consent ? '' : MSG.consent,
    };
    setErrors(er);
    if (!n.ok || !w.ok || !consent) {
      setPhase('form');
      return focusFirstInvalid(er);
    }
    setPhase('sending');
    const res = await share.submitCustomer({ name: n.value, whatsapp: w.value.e164 });
    if (res.ok) return;
    const server: Errors = {
      name: res.fields.name ?? '',
      whatsapp: res.fields.whatsapp ?? '',
      consent: res.fields.consent ?? '',
    };
    setErrors(server);
    setPhase(res.server ? 'server' : 'form');
    window.setTimeout(() => (res.server ? ctaRef.current : undefined)?.focus(), 0);
    if (!res.server) focusFirstInvalid(server);
  };

  const erase = (): void => {
    clearStoredCustomer();
    setName('');
    setWa('');
    setConsent(false);
    setErrors(NO_ERRORS);
    setHasStored(false);
    setAnnounce('Datos borrados');
    nameRef.current?.focus();
  };

  const externalNotice = !PRIVACY_NOTICE_URL.startsWith('#');

  return (
    <div
      ref={wrapRef}
      className="cf-wrap"
      data-cf-platform={share.platform}
      data-testid="customer-dialog-wrap"
    >
      <div className="cf-scrim" data-testid="customer-dialog-scrim" onClick={cancel} aria-hidden="true" />
      <div
        ref={dialogRef}
        className="cf-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id('t')}
        aria-busy={busy || undefined}
        data-testid="customer-dialog"
      >
        <div className="cf-grabber" aria-hidden="true" />
        <div className="cf-title">
          <h2 id={id('t')}>Tus datos para la cotización</h2>
          <p className="cf-sub">Son obligatorios y aparecerán en tu PDF.</p>
          <button type="button" className="cf-x" aria-label="Cerrar" aria-disabled={busy || undefined} onClick={cancel}>
            <svg width="20" height="20" {...svgProps}>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="cf-scroll">
          <div className="cf-fields">
            <div className="cf-field">
              <label htmlFor={id('n')}>Nombre</label>
              <div className="cf-input" data-error={errors.name ? '' : undefined} data-busy={busy ? '' : undefined}>
                <input
                  ref={nameRef}
                  id={id('n')}
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Ej. María López"
                  required
                  aria-required="true"
                  aria-invalid={errors.name ? 'true' : undefined}
                  aria-describedby={errors.name ? id('ne') : id('nh')}
                  readOnly={busy}
                  aria-readonly={busy || undefined}
                  value={name}
                  onChange={onName}
                  onBlur={() => name && setErrors((p) => ({ ...p, name: fieldError('name', name) }))}
                />
              </div>
              {errors.name ? (
                <p className="cf-err" id={id('ne')} aria-live="polite">
                  <ErrorIcon />
                  {errors.name}
                </p>
              ) : (
                <p className="cf-hint" id={id('nh')}>
                  Entre 2 y 80 caracteres.
                </p>
              )}
            </div>
            <div className="cf-field">
              <label htmlFor={id('w')}>WhatsApp</label>
              <div className="cf-input" data-error={errors.whatsapp ? '' : undefined} data-busy={busy ? '' : undefined}>
                <span className="cf-prefix">+503</span>
                <input
                  ref={waRef}
                  id={id('w')}
                  name="whatsapp"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="7123-4567"
                  required
                  aria-required="true"
                  aria-invalid={errors.whatsapp ? 'true' : undefined}
                  aria-describedby={errors.whatsapp ? id('we') : id('wh')}
                  readOnly={busy}
                  aria-readonly={busy || undefined}
                  value={wa}
                  onChange={onWa}
                  onBlur={() => wa && setErrors((p) => ({ ...p, whatsapp: fieldError('whatsapp', wa) }))}
                />
              </div>
              {errors.whatsapp ? (
                <p className="cf-err" id={id('we')} aria-live="polite">
                  <ErrorIcon />
                  {errors.whatsapp}
                </p>
              ) : (
                <p className="cf-hint" id={id('wh')}>
                  Celular de El Salvador · 8 dígitos
                </p>
              )}
            </div>
          </div>
          {hasStored && !busy ? (
            <div className="cf-note">
              <span>Usamos los datos que escribiste en esta visita.</span>
              <span>Tu autorización sigue marcada solo en esta pestaña.</span>
              <button type="button" className="cf-link" onClick={erase}>
                Borrar mis datos
              </button>
            </div>
          ) : null}
          <div className="cf-consent" data-error={errors.consent ? '' : undefined} data-busy={busy ? '' : undefined}>
            <span className="cf-box">
              <input
                ref={consentRef}
                className="cf-cbi"
                id={id('c')}
                name="consent"
                type="checkbox"
                required
                aria-required="true"
                aria-invalid={errors.consent ? 'true' : 'false'}
                aria-describedby={errors.consent ? id('ce') : undefined}
                aria-disabled={busy || undefined}
                tabIndex={busy ? -1 : undefined}
                checked={consent}
                onChange={busy ? undefined : onConsent}
              />
              <span className="cf-cbv" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
            </span>
            <label className="cf-ct" htmlFor={id('c')}>
              Acepto que ALCUSA use mis datos solo para darle seguimiento a esta cotización.{' '}
              <a
                href={PRIVACY_NOTICE_URL}
                tabIndex={busy ? -1 : undefined}
                {...(externalNotice ? { target: '_blank', rel: 'noopener' } : {})}
                onClick={(e) => (externalNotice ? undefined : e.preventDefault())}
              >
                Aviso de privacidad
              </a>
            </label>
          </div>
          {errors.consent ? (
            <p className="cf-err cf-err--consent" id={id('ce')} aria-live="polite">
              <ErrorIcon />
              {errors.consent}
            </p>
          ) : null}
          {phase === 'server' ? (
            <div className="cf-server" role="alert">
              <div className="cf-server__head">
                <svg width="24" height="24" {...svgProps}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7.5v5.5M12 16.2v.1" />
                </svg>
                <p>No pudimos guardar tus datos</p>
              </div>
              <p>Revisa tu conexión e inténtalo de nuevo. Lo que escribiste sigue aquí.</p>
            </div>
          ) : null}
        </div>
        <div className="cf-actions">
          <button
            ref={ctaRef}
            type="button"
            className="cf-cta"
            aria-busy={busy || undefined}
            aria-disabled={busy || undefined}
            aria-label={busy ? 'Preparando tu cotización en PDF' : undefined}
            onClick={() => void submit()}
          >
            {busy ? (
              <>
                <svg className="cf-spin" {...svgProps} strokeWidth={2.5}>
                  <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,.35)" />
                  <path d="M12 3a9 9 0 0 1 9 9" stroke="#ffffff" />
                </svg>
                <span className="cf-rm">Preparando…</span>
              </>
            ) : phase === 'server' ? (
              'Intentar de nuevo'
            ) : (
              'Generar mi cotización'
            )}
          </button>
          <button type="button" className="cf-link cf-cancel" aria-disabled={busy || undefined} onClick={cancel}>
            Cancelar
          </button>
        </div>
        <span className="visually-hidden" role="status" aria-live="polite">
          {busy ? 'Preparando tu cotización en PDF' : announce}
        </span>
      </div>
    </div>
  );
}
