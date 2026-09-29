import type { Dispatch, ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';
import type { AluminumColor, CornerModel } from '@engine/pricing';
import {
  CORNER_MODEL_LABELS,
  COLOR_LABELS,
  type CotizadorAction,
  type CotizadorState,
} from '../../state/cotizadorStore';
import type { QuoteResult } from '../../state/quote';
import { IconArrowRight, IconWarningTriangle } from '../../icons';

// Corner (only Natural/Bronce — no Blanco option rendered at all, T5.1 AC).
const COLORS: { id: AluminumColor; dot: string }[] = [
  { id: 'natural', dot: '#c9ced6' },
  { id: 'bronce', dot: '#7a5a3a' },
];

const MODELS: CornerModel[] = ['aquaclara', 'frosted', 'aquafold'];

export interface CornerFormProps {
  product: CatalogProduct;
  state: CotizadorState;
  dispatch: Dispatch<CotizadorAction>;
  quote: QuoteResult;
  onNext: () => void;
}

// "l" (Cabina en L) measures form — fixed 0.80x0.80x1.85m, no width input
// (T5.1 scope).
export default function CornerForm({ product, state, dispatch, quote, onNext }: CornerFormProps): ReactElement {
  const invalid = quote.requiresQuote;

  return (
    <section aria-labelledby="step1-heading">
      <h3 id="step1-heading" className="cotizador__section-heading" style={{ marginBottom: 2 }}>
        Medidas y acabado
      </h3>
      <p style={{ marginTop: 0, color: 'var(--color-ink-muted)' }}>
        {product.name} · {product.altoText}
      </p>

      <div className="field">
        <span className="field__label">Modelo</span>
        <div className="chip-row" role="group" aria-label="Modelo">
          {MODELS.map((m) => (
            <button
              key={m}
              type="button"
              className="chip"
              aria-pressed={state.cornerModel === m}
              onClick={() => dispatch({ type: 'SET_CORNER_MODEL', model: m })}
            >
              {CORNER_MODEL_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 20 }}>
        <span className="field__label">Color del aluminio</span>
        <div className="chip-row" role="group" aria-label="Color del aluminio">
          {COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="chip"
              aria-pressed={state.color === c.id}
              onClick={() => dispatch({ type: 'SET_COLOR', color: c.id })}
            >
              <span className="chip__dot" style={{ background: c.dot }} />
              {COLOR_LABELS[c.id]}
            </button>
          ))}
        </div>
      </div>

      {invalid && (
        <div className="callout" role="status" style={{ marginTop: 20 }}>
          <span className="callout__title">
            <IconWarningTriangle />
            Cotización personalizada por WhatsApp
          </span>
          <p className="callout__body">Para este acabado, consulta con ALCUSA.</p>
        </div>
      )}

      <div className="bottom-bar" style={{ marginTop: 24 }}>
        <div className="bottom-bar__price" />
        <button type="button" className="btn btn-primary" disabled={invalid} onClick={onNext}>
          Siguiente
          <IconArrowRight />
        </button>
      </div>
    </section>
  );
}
