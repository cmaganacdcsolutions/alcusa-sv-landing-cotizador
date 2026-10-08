import type { Dispatch, ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';
import { STRAIGHT_WIDTH_MAX_CM, STRAIGHT_WIDTH_MIN_CM } from '@engine/pricing';
import {
  COLOR_LABELS,
  GLASS_LABELS,
  parseWidthCm,
  type CotizadorAction,
  type CotizadorState,
} from '../../state/cotizadorStore';
import type { QuoteResult } from '../../state/quote';
import { IconArrowRight, IconWarningTriangle } from '../../icons';
import { ColorSwatch, GlassSwatch } from './glassSwatches';
import { STRAIGHT_COLORS, STRAIGHT_GLASSES } from './finishOptions';
import { promoWidthRuleCopy } from '@content/promoContext';
import { lookupPromo } from '../../state/promoRegistry';

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
  // Contexto promo: producto, color, vidrio y alto fijos; solo el ancho se edita y se valida al rango de la promo.
  const promo = lookupPromo(state.promoId);

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
            ? promo
              ? `${promoWidthRuleCopy(promo)}. Medida actual: ${Number.isNaN(widthCm) ? '—' : `${widthCm} cm`}`
              : `Medida fuera de rango: ${Number.isNaN(widthCm) ? '—' : `${widthCm} cm`}`
            : `Medida reconocida: ${widthCm} cm (${(widthCm / 100).toFixed(2)} m)`}
        </span>
      </div>

      {promo ? (
        <dl className="breakdown" data-testid="promo-locked" style={{ marginTop: 20 }}>
          <div className="breakdown__row">
            <dt>Color del aluminio</dt>
            <dd>{COLOR_LABELS[promo.color]}</dd>
          </div>
          <div className="breakdown__row">
            <dt>Tipo de vidrio</dt>
            <dd>{GLASS_LABELS[promo.glass]}</dd>
          </div>
          <div className="breakdown__row">
            <dt>Altura</dt>
            <dd>{promo.altoM.toFixed(2)} m</dd>
          </div>
        </dl>
      ) : (
        <>
      <div className="field" style={{ marginTop: 20 }}>
        <span className="field__label">Color del aluminio</span>
        <div className="chip-row" role="group" aria-label="Color del aluminio">
          {STRAIGHT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="chip"
              aria-pressed={state.color === c}
              onClick={() => dispatch({ type: 'SET_COLOR', color: c })}
            >
              <ColorSwatch color={c} />
              {COLOR_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 20 }}>
        <span className="field__label">Tipo de vidrio</span>
        <div className="glass-grid" role="group" aria-label="Tipo de vidrio">
          {STRAIGHT_GLASSES.map((g) => (
            <button
              key={g}
              type="button"
              className="glass-chip"
              aria-pressed={state.glass === g}
              onClick={() => dispatch({ type: 'SET_GLASS', glass: g })}
            >
              <GlassSwatch glass={g} />
              {GLASS_LABELS[g]}
            </button>
          ))}
        </div>
        {state.glass === 'aquafold' && (
          <span className="field__helper" id="aquafold-ayuda">
            Aquafold: vidrio personalizado con diseño de círculos.
          </span>
        )}
      </div>

        </>
      )}

      {invalid && (
        <div className="callout" role="status" style={{ marginTop: 20 }}>
          <span className="callout__title">
            <IconWarningTriangle />
            Cotización personalizada por WhatsApp
          </span>
          <p className="callout__body">
            {promo
              ? `${promoWidthRuleCopy(promo)}. Para otras medidas, usa “Cotizar otro modelo sin promoción”.`
              : state.glass === 'aquafold'
                ? 'El vidrio Aquafold se cotiza con un asesor. Escríbenos por WhatsApp para darte el precio.'
                : `El ancho debe ser de ${STRAIGHT_WIDTH_MIN_CM} a ${STRAIGHT_WIDTH_MAX_CM} cm y la altura de 1.85 m. Para otras medidas, consulta con ALCUSA.`}
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
