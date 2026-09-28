import type { Dispatch, ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';
import { TEMPERED_WIDTH_MAX_CM, TEMPERED_WIDTH_MIN_CM } from '@engine/pricing';
import { parseWidthCm, type CotizadorAction, type CotizadorState } from '../../state/cotizadorStore';
import type { QuoteResult } from '../../state/quote';

export interface TemperedFormProps {
  product: CatalogProduct;
  state: CotizadorState;
  dispatch: Dispatch<CotizadorAction>;
  quote: QuoteResult;
  onBack: () => void;
  onNext: () => void;
}

// "templado" (Templado 10 mm) measures form — ancho 120-200cm, alto fijo
// 2.00m, vidrio templado 10mm only, no color/glass picker (T5.2 scope).
export default function TemperedForm({ product, state, dispatch, quote, onBack, onNext }: TemperedFormProps): ReactElement {
  const widthCm = parseWidthCm(state.width);
  const invalid = quote.requiresQuote;

  return (
    <section aria-labelledby="step1-heading">
      <button type="button" className="cotizador__back" onClick={onBack}>
        ← Producto
      </button>
      <h2 id="step1-heading" className="cotizador__title" style={{ fontSize: '1.375rem', margin: '8px 0 16px' }}>
        Medidas y acabado
      </h2>
      <p style={{ marginTop: 0, color: 'var(--color-ink-muted)' }}>
        {product.name} · Vidrio templado 10 mm · {product.altoText}
      </p>

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

      {invalid && (
        <div className="callout" role="status" style={{ marginTop: 20 }}>
          <span className="callout__title">Cotización personalizada por WhatsApp</span>
          <p className="callout__body">
            El ancho debe ser de {TEMPERED_WIDTH_MIN_CM} a {TEMPERED_WIDTH_MAX_CM} cm y la altura de 2.00 m. Para
            otras medidas, consulta con ALCUSA.
          </p>
        </div>
      )}

      <div className="bottom-bar" style={{ marginTop: 24 }}>
        <div className="bottom-bar__price" />
        <button type="button" className="btn btn-primary" disabled={invalid} onClick={onNext}>
          Siguiente
        </button>
      </div>
    </section>
  );
}
