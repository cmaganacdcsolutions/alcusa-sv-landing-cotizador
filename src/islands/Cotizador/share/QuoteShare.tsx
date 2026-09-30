import type { ReactElement } from 'react';
import type { UseQuoteShare } from './useQuoteShare';
import '@styles/cotizador-share.css';

// Icons are the r07 board paths verbatim (stroke 1.5, round) — not reused from
// ../icons so they match the board pixel for pixel.
const svgProps = {
  viewBox: '0 0 24 24',
  'aria-hidden': true,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function WaIcon(): ReactElement {
  return (
    <svg width="20" height="20" {...svgProps}>
      <path d="M4.5 19.5l1.2-3.6a8 8 0 1 1 2.9 2.6z" />
      <path d="M9.3 8.7c.4 2.6 3.2 5.4 6 6l1.1-1.4-1.8-1-1 .9c-1-.4-2-1.4-2.4-2.4l.9-1-1-1.8z" />
    </svg>
  );
}
function ShareIcon(): ReactElement {
  return (
    <svg width="20" height="20" {...svgProps}>
      <path d="M12 15V4M8 7.5L12 3.5l4 4M6 12H5.5A1.5 1.5 0 0 0 4 13.5v5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-5a1.5 1.5 0 0 0-1.5-1.5H18" />
    </svg>
  );
}
function DownloadIcon({ size }: { size: number }): ReactElement {
  return (
    <svg width={size} height={size} {...svgProps}>
      <path d="M12 4v11M7.5 11L12 15.5 16.5 11M5 19.5h14" />
    </svg>
  );
}

export interface QuoteShareProps {
  share: UseQuoteShare;
  /** Text-only wa.me link (no PDF), last-resort fallback in the G card (ADR-009). */
  textOnlyHref: string;
}

/** Main CTA: states A / B (preparing) / E (ready). */
export function QuoteShareButton({ share }: Pick<QuoteShareProps, 'share'>): ReactElement {
  const busy = share.status === 'preparing';
  const ready = share.status === 'ready';
  return (
    <button
      type="button"
      className={ready ? 'qs-wa qs-wa--ready' : 'qs-wa'}
      data-testid="quote-share-button"
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      aria-label={busy ? 'Preparando tu cotización en PDF' : undefined}
      onClick={(e) => share.press(e.currentTarget)}
    >
      {busy ? (
        <>
          <svg className="qs-spin" {...svgProps} strokeWidth={2.5}>
            {/* TODO token: spinner track rgba(255,255,255,.35) */}
            <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,.35)" />
            <path d="M12 3a9 9 0 0 1 9 9" stroke="#ffffff" />
          </svg>
          <span className="qs-rm">Preparando…</span>
        </>
      ) : ready ? (
        <>
          <ShareIcon />
          Listo: toca para compartir
        </>
      ) : (
        <>
          <WaIcon />
          Enviar por WhatsApp (PDF)
        </>
      )}
    </button>
  );
}

/** D feedback, E helper text, G error. `variant` picks the layout slot; CSS shows one per breakpoint. */
export function QuoteShareNotices({
  share,
  textOnlyHref,
  variant,
}: QuoteShareProps & { variant: 'main' | 'aside' }): ReactElement | null {
  const { status } = share;
  const cls = `qs-notices qs-notices--${variant}`;
  const plat = { 'data-qs-platform': share.platform };
  if (status === 'preparing') {
    return (
      <div className={cls} {...plat}>
        <span role="status" aria-live="polite" className="visually-hidden">
          Preparando tu cotización en PDF
        </span>
      </div>
    );
  }
  if (status === 'ready') {
    return (
      <div className={cls} {...plat}>
        <p className="qs-help" role="status" aria-live="polite">
          Tu cotización en PDF ya está lista. Toca el botón una vez más para elegir WhatsApp.
        </p>
      </div>
    );
  }
  if (status === 'shared') {
    return (
      <div className={cls} {...plat}>
        <div className="qs-card qs-card--info" role="status" aria-live="polite">
          <div className="qs-card__head">
            <svg width="24" height="24" {...svgProps}>
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12.5l3 3 5-6" />
            </svg>
            <p className="qs-card__title">¿Ya lo enviaste? Te respondemos por WhatsApp</p>
          </div>
          <p className="qs-card__text">Si cerraste la hoja sin enviarlo, puedes compartir tu cotización otra vez.</p>
          <button type="button" className="qs-link qs-link--start" onClick={() => share.shareAgain()}>
            Compartir de nuevo
          </button>
        </div>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className={cls} {...plat}>
        <div className="qs-card qs-card--error" role="alert">
          <div className="qs-card__head">
            <svg width="24" height="24" {...svgProps}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5v5.5M12 16.2v.1" />
            </svg>
            <p className="qs-card__title">No pudimos preparar tu PDF</p>
          </div>
          <p className="qs-card__text">
            Tranquilo, tu cotización sigue guardada. Puedes descargarlo y adjuntarlo en el chat de WhatsApp, o intentarlo de
            nuevo.
          </p>
          <button type="button" className="qs-outline" onClick={share.download}>
            <DownloadIcon size={20} />
            Descargar PDF
          </button>
          <button type="button" className="qs-link" onClick={share.retry}>
            Intentar de nuevo
          </button>
          <a className="qs-link" href={textOnlyHref} data-testid="quote-share-text-only">
            Enviar solo el texto por WhatsApp
          </a>
        </div>
      </div>
    );
  }
  return null;
}

/** Desktop toast (state C): persistent, Esc / X closes, focus is never stolen. */
export function QuoteShareToast({ share }: Pick<QuoteShareProps, 'share'>): ReactElement | null {
  if (share.status !== 'downloaded') return null;
  return (
    <div className="qs-toast" role="status" aria-live="polite" data-testid="quote-share-toast">
      <div className="qs-toast__row">
        <DownloadIcon size={28} />
        <p className="qs-toast__msg">Descargamos tu cotización: adjúntala en el chat de WhatsApp que abrimos</p>
        <button type="button" className="qs-toast__x" aria-label="Cerrar aviso" onClick={share.dismissToast}>
          <svg width="20" height="20" {...svgProps}>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="qs-toast__actions">
        <button type="button" className="qs-toast__btn qs-toast__btn--solid" onClick={share.download}>
          Volver a descargar
        </button>
        <a className="qs-toast__btn qs-toast__btn--ghost" href={share.folioWaHref} target="_blank" rel="noopener noreferrer">
          Abrir WhatsApp
        </a>
      </div>
    </div>
  );
}
