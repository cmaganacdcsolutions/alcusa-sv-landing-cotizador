import { useEffect, useRef, type ReactElement } from 'react';
import type { QuoteLoadNotice } from '../../state/loadQuote';
import { formatQuoteCode } from '@integrations/quotes/code';
import { IconQuoteCheckCircle, IconQuoteRefresh, IconQuoteTriangle } from './QuoteIcons';
import { QUOTE_COPY as C, formatDateEs, formatMoney } from './quoteCopy';

export interface QuoteChangeNoticeProps {
  notice: QuoteLoadNotice;
  onDismiss: () => void;
}

const TOAST_MS = 6000;

// ADR-012 §6 estados 4A (toast, sin cambios), 4B (aviso persistente) y 6
// (vencida). Se monta en Resumen; "Entendido" lo cierra.
export default function QuoteChangeNotice({ notice, onDismiss }: QuoteChangeNoticeProps): ReactElement | null {
  const paused = useRef(false);
  const plain = notice.changes.length === 0 && !notice.expired;

  useEffect(() => {
    if (!plain) return undefined;
    const t = setInterval(() => {
      if (!paused.current) {
        clearInterval(t);
        onDismiss();
      }
    }, TOAST_MS);
    return () => clearInterval(t);
  }, [plain, onDismiss]);

  if (plain) {
    return (
      <div
        className="qtoast"
        role="status"
        onFocus={() => { paused.current = true; }}
        onBlur={() => { paused.current = false; }}
        onPointerDown={() => { paused.current = true; }}
      >
        <IconQuoteCheckCircle />
        <span>{C.loaded(formatQuoteCode(notice.code))}</span>
      </div>
    );
  }

  return (
    <section className="qc qnotice" aria-labelledby="qc-chg" data-testid="quote-notice">
      {notice.expired && (
        <div className="qw" role="status">
          <IconQuoteTriangle size={18} />
          <span>{C.expiredOn(formatDateEs(notice.validUntil))}</span>
        </div>
      )}
      {notice.changes.length > 0 && (
        <>
          <div className="qnotice__head">
            <span className="qi qi--warn"><IconQuoteTriangle /></span>
            <h3 id="qc-chg" className="qnotice__title">{C.noticeTitle}</h3>
          </div>
          <p className="qhp">{C.changedSince(formatDateEs(notice.createdAt))}</p>
          <ul className="qnotice__list">
            {notice.changes.map((c, i) => (
              <li key={`${c.kind}-${i}`}>{C.change(c, formatMoney)}</li>
            ))}
          </ul>
          <p className="qnotice__totals">{C.totals(formatMoney(notice.totalBefore), formatMoney(notice.totalAfter))}</p>
        </>
      )}
      {notice.expired && (
        <div className="qnotice__total">
          <span className="qnotice__amount">{formatMoney(notice.totalAfter)}</span>
          <span className="qtag"><IconQuoteRefresh />{C.updatedTag}</span>
        </div>
      )}
      <button type="button" className="bt bp qnotice__ok" onClick={onDismiss}>{C.noticeButton}</button>
    </section>
  );
}
