import type { ReactElement } from 'react';
import { GARDEN_PROMO_BANDS } from '@content/pricingTables';
import type { GardenColor, GardenGlass } from '@engine/pricing';
import { GLASS_LABELS, COLOR_LABELS, type CotizadorAction, type CotizadorState, type GardenHeightOption } from '../../state/cotizadorStore';
import { computeGardenQuote } from '../../state/quoteWindowGarden';
import { IconArrowRight, IconWarningTriangle } from '../../icons';
import { GlassSwatch } from './glassSwatches';

const HOJAS: (1 | 2 | 3 | 'custom')[] = [1, 2, 3, 'custom'];
export const GARDEN_HOJAS_LABELS: Record<1 | 2 | 3 | 'custom', string> = {
  1: '1 hoja',
  2: '2 hojas',
  3: '3 hojas',
  custom: 'A la medida',
};

const HEIGHT_OPTIONS: GardenHeightOption[] = ['2.10', '2.40', 'otra'];
const HEIGHT_LABELS: Record<GardenHeightOption, string> = { '2.10': '2.10 m', '2.40': '2.40 m', otra: 'Otra' };

const COLORS: GardenColor[] = ['blanco', 'bronce', 'natural'];
const GLASSES: GardenGlass[] = ['claro', 'nevado', 'decorado', 'mallado', 'duplex'];

function widthRangeHint(hojas: 1 | 2 | 3 | 'custom'): string | null {
  if (hojas === 'custom') return null;
  const band = GARDEN_PROMO_BANDS[hojas];
  return `Ancho de referencia: ${band.minWidthM.toFixed(2)}–${band.maxWidthM.toFixed(2)} m`;
}

export interface GardenFormProps {
  state: CotizadorState;
  dispatch: (action: CotizadorAction) => void;
  onNext: () => void;
}

// New file (S6, T6.2) — "Puerta de jardín". Only Blanco/Claro are priced;
// any other color/vidrio is labeled requiresQuote at selection time and,
// per T6.3, never hard-blocks "Siguiente" — only invalid measurements do.
export default function GardenForm({ state, dispatch, onNext }: GardenFormProps): ReactElement {
  const quote = computeGardenQuote(state);
  const widthNum = parseFloat(state.gardenWidth.replace(',', '.'));
  const otraNum = parseFloat(state.gardenHeightOtra.replace(',', '.'));
  const qtyNum = parseFloat(state.gardenQty);
  const heightValid = state.gardenHeightOption !== 'otra' || (Number.isFinite(otraNum) && otraNum > 0);
  const allValid =
    Number.isFinite(widthNum) && widthNum > 0 && heightValid && Number.isFinite(qtyNum) && qtyNum >= 1 && qtyNum <= 50;
  const colorRequiresQuote = state.gardenColor !== 'blanco';
  const glassRequiresQuote = state.gardenGlass !== 'claro';

  return (
    <section aria-labelledby="step1-heading">
      <h3 id="step1-heading" className="cotizador__section-heading" style={{ marginBottom: 2 }}>
        Medidas y acabado
      </h3>
      <p style={{ marginTop: 0, color: 'var(--color-ink-muted)' }}>Puerta de jardín</p>

      <div className="field">
        <span className="field__label">Modelo</span>
        <div className="chip-row" role="group" aria-label="Modelo">
          {HOJAS.map((h) => (
            <button
              key={h}
              type="button"
              className="chip"
              aria-pressed={state.gardenHojas === h}
              onClick={() => dispatch({ type: 'SET_GARDEN_HOJAS', hojas: h })}
            >
              {GARDEN_HOJAS_LABELS[h]}
            </button>
          ))}
        </div>
        {widthRangeHint(state.gardenHojas) && (
          <span className="field__helper">{widthRangeHint(state.gardenHojas)}</span>
        )}
      </div>

      <div className="field" style={{ marginTop: 20 }}>
        <label className="field__label" htmlFor="jardin-ancho">
          Ancho exacto de tu espacio
        </label>
        <div className="field__input-wrap">
          <input
            id="jardin-ancho"
            type="text"
            inputMode="decimal"
            className="field__input"
            value={state.gardenWidth}
            onChange={(e) => dispatch({ type: 'SET_GARDEN_WIDTH', value: e.target.value })}
          />
          <span className="field__unit">m</span>
        </div>
      </div>

      <div className="field" style={{ marginTop: 20 }}>
        <span className="field__label">Alto</span>
        <div className="chip-row" role="group" aria-label="Alto">
          {HEIGHT_OPTIONS.map((h) => (
            <button
              key={h}
              type="button"
              className="chip"
              aria-pressed={state.gardenHeightOption === h}
              onClick={() => dispatch({ type: 'SET_GARDEN_HEIGHT_OPTION', value: h })}
            >
              {HEIGHT_LABELS[h]}
            </button>
          ))}
        </div>
        {state.gardenHeightOption === 'otra' && (
          <div className="field__input-wrap" style={{ marginTop: 8 }}>
            <input
              type="text"
              inputMode="decimal"
              className="field__input"
              aria-label="Alto en metros (Otra)"
              value={state.gardenHeightOtra}
              onChange={(e) => dispatch({ type: 'SET_GARDEN_HEIGHT_OTRA', value: e.target.value })}
            />
            <span className="field__unit">m</span>
          </div>
        )}
      </div>

      <div className="field" style={{ marginTop: 20 }}>
        <span className="field__label">Color</span>
        <div className="chip-row" role="group" aria-label="Color">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="chip"
              aria-pressed={state.gardenColor === c}
              onClick={() => dispatch({ type: 'SET_GARDEN_COLOR', color: c })}
            >
              {COLOR_LABELS[c]}
              {c !== 'blanco' && <span className="chip__badge">Cotización personalizada</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 20 }}>
        <span className="field__label">Tipo de vidrio</span>
        <div className="glass-grid" role="group" aria-label="Tipo de vidrio">
          {GLASSES.map((g) => (
            <button
              key={g}
              type="button"
              className="glass-chip"
              aria-pressed={state.gardenGlass === g}
              onClick={() => dispatch({ type: 'SET_GARDEN_GLASS', glass: g })}
            >
              <GlassSwatch glass={g} />
              {GLASS_LABELS[g]}
              {g !== 'claro' && <span className="chip__badge">Cotización personalizada</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 20 }}>
        <label className="field__label" htmlFor="jardin-cantidad">
          Cantidad
        </label>
        <input
          id="jardin-cantidad"
          type="text"
          inputMode="numeric"
          className="field__input"
          style={{ paddingRight: 16, maxWidth: 120 }}
          value={state.gardenQty}
          onChange={(e) => dispatch({ type: 'SET_GARDEN_QTY', value: e.target.value })}
        />
        <span className="field__helper">Ingresa una cantidad entre 1 y 50.</span>
      </div>

      {(colorRequiresQuote || glassRequiresQuote) && (
        <div className="callout" role="status" style={{ marginTop: 20 }}>
          <span className="callout__title">
            <IconWarningTriangle />
            Cotización personalizada por WhatsApp
          </span>
          <p className="callout__body">
            Solo Blanco/Claro tienen precio automático; otros acabados se cotizan a la medida. Puedes seguir y
            confirmar por WhatsApp.
          </p>
        </div>
      )}

      <div className="bottom-bar" style={{ marginTop: 24 }}>
        <div className="bottom-bar__price">
          <span className="bottom-bar__price-label">Estimado sin transporte</span>
          <span className="bottom-bar__price-value">
            {quote.subtotal !== null ? `$${quote.subtotal.toFixed(2)}` : 'Por WhatsApp'}
          </span>
        </div>
        <button type="button" className="btn btn-primary" disabled={!allValid} onClick={onNext}>
          Siguiente
          <IconArrowRight />
        </button>
      </div>
    </section>
  );
}
