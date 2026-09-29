import type { Dispatch, ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';
import {
  HINGED_QTY_MAX,
  HINGED_QTY_MIN,
  HINGED_WIDTH_MAX_CM,
  HINGED_WIDTH_MIN_CM,
  isHingedQtyInRange,
  isHingedWidthInRange,
  type AluminumColor,
  type StraightGlass,
} from '@engine/pricing';
import {
  COLOR_LABELS,
  GLASS_LABELS,
  parseWidthCm,
  type CotizadorAction,
  type CotizadorState,
} from '../../state/cotizadorStore';
import { parseHingedQty, type QuoteResult } from '../../state/quote';
import { IconArrowRight, IconWarningTriangle } from '../../icons';
import { GlassSwatch } from './glassSwatches';

const COLORS: { id: AluminumColor; dot: string }[] = [
  { id: 'natural', dot: '#c9ced6' },
  { id: 'blanco', dot: '#ffffff' },
  { id: 'bronce', dot: '#7a5a3a' },
];

const GLASSES: { id: StraightGlass }[] = [
  { id: 'nevado' },
  { id: 'claro' },
  { id: 'decorado' },
  { id: 'mallado' },
  { id: 'duplex' },
];

export interface HingedFormProps {
  product: CatalogProduct;
  state: CotizadorState;
  dispatch: Dispatch<CotizadorAction>;
  quote: QuoteResult;
  onNext: () => void;
}

// "bisagra" (Puerta con bisagra) measures form — ancho 40-90cm, alto fijo
// 1.85m, cantidad 1-50, color, vidrio, optional paño fijo (T5.3 scope).
export default function HingedForm({ product, state, dispatch, quote, onNext }: HingedFormProps): ReactElement {
  const widthCm = parseWidthCm(state.width);
  const qty = parseHingedQty(state.hingedQty);
  const widthInvalid = !isHingedWidthInRange(widthCm);
  const qtyInvalid = !isHingedQtyInRange(qty);
  const invalid = quote.requiresQuote;

  return (
    <section aria-labelledby="step1-heading">
      <h3 id="step1-heading" className="cotizador__section-heading" style={{ marginBottom: 2 }}>
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
            data-invalid={widthInvalid}
            aria-describedby="ancho-ayuda"
            className="field__input"
            onChange={(e) => dispatch({ type: 'SET_WIDTH', value: e.target.value })}
          />
          <span className="field__unit">cm</span>
        </div>
        <span id="ancho-ayuda" className="field__helper" data-invalid={widthInvalid}>
          {widthInvalid
            ? `Medida fuera de rango: ${Number.isNaN(widthCm) ? '—' : `${widthCm} cm`}`
            : `Medida reconocida: ${widthCm} cm (${(widthCm / 100).toFixed(2)} m)`}
        </span>
      </div>

      <div className="field" style={{ marginTop: 20 }}>
        <label className="field__label" htmlFor="cantidad">
          Cantidad
        </label>
        <div className="field__input-wrap">
          <input
            id="cantidad"
            type="text"
            inputMode="numeric"
            value={state.hingedQty}
            data-invalid={qtyInvalid}
            aria-describedby="cantidad-ayuda"
            className="field__input"
            onChange={(e) => dispatch({ type: 'SET_HINGED_QTY', value: e.target.value })}
          />
        </div>
        <span id="cantidad-ayuda" className="field__helper" data-invalid={qtyInvalid}>
          {qtyInvalid
            ? `Ingresa una cantidad entre ${HINGED_QTY_MIN} y ${HINGED_QTY_MAX}.`
            : `${qty} unidad${qty === 1 ? '' : 'es'}`}
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

      <div className="field" style={{ marginTop: 20 }}>
        <div role="group" aria-label="Paño fijo" className="toggle-group">
          <button
            type="button"
            className="toggle-group__btn"
            aria-pressed={!state.hingedFixedPanelEnabled}
            onClick={() => dispatch({ type: 'TOGGLE_HINGED_FIXED_PANEL', enabled: false })}
          >
            Sin paño fijo
          </button>
          <button
            type="button"
            className="toggle-group__btn"
            aria-pressed={state.hingedFixedPanelEnabled}
            onClick={() => dispatch({ type: 'TOGGLE_HINGED_FIXED_PANEL', enabled: true })}
          >
            + Paño fijo
          </button>
        </div>

        {state.hingedFixedPanelEnabled && (
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label className="field__label" htmlFor="fijo-ancho">
                Ancho del paño
              </label>
              <div className="field__input-wrap">
                <input
                  id="fijo-ancho"
                  type="text"
                  inputMode="decimal"
                  value={state.hingedFixedPanelWidthM}
                  className="field__input"
                  onChange={(e) => dispatch({ type: 'SET_HINGED_FIXED_PANEL_WIDTH', value: e.target.value })}
                />
                <span className="field__unit">m</span>
              </div>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label className="field__label" htmlFor="fijo-alto">
                Alto del paño
              </label>
              <div className="field__input-wrap">
                <input
                  id="fijo-alto"
                  type="text"
                  inputMode="decimal"
                  value={state.hingedFixedPanelHeightM}
                  className="field__input"
                  onChange={(e) => dispatch({ type: 'SET_HINGED_FIXED_PANEL_HEIGHT', value: e.target.value })}
                />
                <span className="field__unit">m</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {widthInvalid && (
        <div className="callout" role="status" style={{ marginTop: 20 }}>
          <span className="callout__title">
            <IconWarningTriangle />
            Cotización personalizada por WhatsApp
          </span>
          <p className="callout__body">
            El ancho debe ser de {HINGED_WIDTH_MIN_CM} a {HINGED_WIDTH_MAX_CM} cm y la altura de 1.85 m. Para otras
            medidas, consulta con ALCUSA.
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
