import type { Dispatch, ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';
import { STRAIGHT_WIDTH_MAX_CM, STRAIGHT_WIDTH_MIN_CM, type AluminumColor, type StraightGlass } from '@engine/pricing';
import {
  COLOR_LABELS,
  GLASS_LABELS,
  parseWidthCm,
  type CotizadorAction,
  type CotizadorState,
} from '../../state/cotizadorStore';
import type { QuoteResult } from '../../state/quote';
import { IconArrowRight, IconWarningTriangle } from '../../icons';
import { GlassSwatch } from './glassSwatches';

const COLORS: { id: AluminumColor; dot: string }[] = [
  { id: 'natural', dot: '#c9ced6' },
  { id: 'blanco', dot: '#ffffff' },
  { id: 'bronce', dot: '#7a5a3a' },
];

const GLASSES: { id: StraightGlass }[] = [
  { id: 'claro' },
  { id: 'nevado' },
  { id: 'decorado' },
  { id: 'mallado' },
  { id: 'duplex' },
];

export interface StraightFormProps {
  product: CatalogProduct;
  state: CotizadorState;
  dispatch: Dispatch<CotizadorAction>;
  quote: QuoteResult;
  onNext: () => void;
}

// "recta" measures form (S1 T1.2 scope), moved verbatim under the S5
// steps/measures/<Name>Form dispatcher — behavior is unchanged.
export default function StraightForm({ product, state, dispatch, quote, onNext }: StraightFormProps): ReactElement {
  const widthCm = parseWidthCm(state.width);
  const invalid = quote.requiresQuote;

  return (
    <section aria-labelledby="step1-heading">
      <h3 id="step1-heading" tabIndex={-1} className="cotizador__section-heading" style={{ marginBottom: 2 }}>
        Medidas y acabado
      </h3>
      <p style={{ marginTop: 0, color: 'var(--color-ink-muted)' }}>{product.name}</p>

      <div className="field">
        <label className="field__label" htmlFor="ancho">
          Ancho exacto de tu espacio
        </label>
        <div className="field__input-wrap">
          <input
            id="ancho"
            type="text"
            inputMode="decimal"
            value={state.width}
            data-invalid={invalid}
            aria-describedby="ancho-ayuda"
            className="field__input"
            onChange={(e) => dispatch({ type: 'SET_WIDTH', value: e.target.value })}
          />
          <span className="field__unit">cm</span>
        </div>
        <span id="ancho-ayuda" className="field__helper" data-invalid={invalid}>
          {invalid
            ? `Medida fuera de rango: ${Number.isNaN(widthCm) ? '—' : `${widthCm} cm`}`
            : `Medida reconocida: ${widthCm} cm (${(widthCm / 100).toFixed(2)} m)`}
        </span>
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

      <div className="field" style={{ marginTop: 20 }}>
        <span className="field__label">Tipo de vidrio</span>
        <div className="glass-grid" role="group" aria-label="Tipo de vidrio">
          {GLASSES.map((g) => (
            <button
              key={g.id}
              type="button"
              className="glass-chip"
              aria-pressed={state.glass === g.id}
              onClick={() => dispatch({ type: 'SET_GLASS', glass: g.id })}
            >
              <GlassSwatch glass={g.id} />
              {GLASS_LABELS[g.id]}
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
          <p className="callout__body">
            El ancho debe ser de {STRAIGHT_WIDTH_MIN_CM} a {STRAIGHT_WIDTH_MAX_CM} cm y la altura de 1.85 m. Para
            otras medidas, consulta con ALCUSA.
          </p>
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
