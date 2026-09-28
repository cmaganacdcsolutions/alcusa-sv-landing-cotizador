import type { ReactElement } from 'react';
import type { AluminumColor, WindowGlass, WindowModel } from '@engine/pricing';
import { COLOR_LABELS, type CotizadorAction, type CotizadorState } from '../../state/cotizadorStore';
import { computeWindowQuote } from '../../state/quoteWindowGarden';
import { IconArrowRight, IconWarningTriangle } from '../../icons';

const MODELS: WindowModel[] = ['francesa', 'bilbao'];
export const WINDOW_MODEL_LABELS: Record<WindowModel, string> = { francesa: 'Francesa', bilbao: 'Bilbao' };

const FRAMES: AluminumColor[] = ['blanco', 'bronce', 'natural'];
const GLASSES: WindowGlass[] = ['claro', 'bronce', 'super_gris', 'reflectivo_azul', 'reflectivo_bronce'];
export const WINDOW_GLASS_LABELS: Record<WindowGlass, string> = {
  claro: 'Claro',
  bronce: 'Bronce 5 mm',
  super_gris: 'Súper gris',
  reflectivo_azul: 'Reflectivo azul',
  reflectivo_bronce: 'Reflectivo bronce',
};

function isRowValid(qty: string, widthM: string, heightM: string): boolean {
  const q = parseFloat(qty);
  const w = parseFloat(widthM.replace(',', '.'));
  const h = parseFloat(heightM.replace(',', '.'));
  return Number.isFinite(q) && q >= 1 && q <= 50 && Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0;
}

export interface WindowFormProps {
  state: CotizadorState;
  dispatch: (action: CotizadorAction) => void;
  onNext: () => void;
}

// New file (S6, T6.1) — "Ventana Francesa/Bilbao", repeatable rows
// (cantidad/ancho/alto), shared modelo/color/vidrio/extras. Natural frame and
// Reflectivo bronce glass are labeled requiresQuote AT SELECTION TIME
// (prototype-spec.md §2.3) and never hard-block "Siguiente" (T6.3) — only
// missing/invalid row measurements do.
export default function WindowForm({ state, dispatch, onNext }: WindowFormProps): ReactElement {
  const quote = computeWindowQuote(state);
  const allRowsValid = state.windowRows.every((r) => isRowValid(r.qty, r.widthM, r.heightM));
  const frameRequiresQuote = state.windowFrame === 'natural';
  const glassRequiresQuote = state.windowGlass === 'reflectivo_bronce';

  return (
    <section aria-labelledby="step1-heading">
      <h3 id="step1-heading" className="cotizador__section-heading" style={{ marginBottom: 2 }}>
        Medidas y acabado
      </h3>
      <p style={{ marginTop: 0, color: 'var(--color-ink-muted)' }}>Ventana Francesa o Bilbao</p>

      <div className="field">
        <span className="field__label">Modelo</span>
        <div className="chip-row">
          {MODELS.map((m) => (
            <button
              key={m}
              type="button"
              className="chip"
              aria-pressed={state.windowModel === m}
              onClick={() => dispatch({ type: 'SET_WINDOW_MODEL', model: m })}
            >
              {WINDOW_MODEL_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 20 }}>
        <span className="field__label">Ventanas</span>
        <div className="window-rows">
          {state.windowRows.map((row, index) => (
            <div className="window-row" key={row.id}>
              <span className="window-row__index">#{index + 1}</span>
              <label className="window-row__field">
                <span>Cant.</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="window-row__input"
                  aria-label={`Cantidad, ventana ${index + 1}`}
                  value={row.qty}
                  onChange={(e) => dispatch({ type: 'SET_WINDOW_ROW', id: row.id, field: 'qty', value: e.target.value })}
                />
              </label>
              <label className="window-row__field">
                <span>Ancho (m)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="window-row__input"
                  aria-label={`Ancho en metros, ventana ${index + 1}`}
                  value={row.widthM}
                  onChange={(e) =>
                    dispatch({ type: 'SET_WINDOW_ROW', id: row.id, field: 'widthM', value: e.target.value })
                  }
                />
              </label>
              <label className="window-row__field">
                <span>Alto (m)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  className="window-row__input"
                  aria-label={`Alto en metros, ventana ${index + 1}`}
                  value={row.heightM}
                  onChange={(e) =>
                    dispatch({ type: 'SET_WINDOW_ROW', id: row.id, field: 'heightM', value: e.target.value })
                  }
                />
              </label>
              {state.windowRows.length > 1 && (
                <button
                  type="button"
                  className="window-row__remove"
                  aria-label={`Quitar ventana ${index + 1}`}
                  onClick={() => dispatch({ type: 'REMOVE_WINDOW_ROW', id: row.id })}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="row-add-btn" onClick={() => dispatch({ type: 'ADD_WINDOW_ROW' })}>
          + Agregar otra ventana
        </button>
      </div>

      <div className="field" style={{ marginTop: 20 }}>
        <span className="field__label">Color del marco</span>
        <div className="chip-row">
          {FRAMES.map((f) => (
            <button
              key={f}
              type="button"
              className="chip"
              aria-pressed={state.windowFrame === f}
              onClick={() => dispatch({ type: 'SET_WINDOW_FRAME', frame: f })}
            >
              {COLOR_LABELS[f]}
              {f === 'natural' && <span className="chip__badge">Cotización personalizada</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 20 }}>
        <span className="field__label">Tipo de vidrio</span>
        <div className="chip-row">
          {GLASSES.map((g) => (
            <button
              key={g}
              type="button"
              className="chip"
              aria-pressed={state.windowGlass === g}
              onClick={() => dispatch({ type: 'SET_WINDOW_GLASS', glass: g })}
            >
              {WINDOW_GLASS_LABELS[g]}
              {g === 'reflectivo_bronce' && <span className="chip__badge">Cotización personalizada</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 20 }}>
        <span className="field__label">Extras</span>
        <label className="extras-row">
          <input
            type="checkbox"
            checked={state.windowZaranda}
            onChange={(e) => dispatch({ type: 'SET_WINDOW_ZARANDA', value: e.target.checked })}
          />
          Zaranda (+$30/m²)
        </label>
        <label className="extras-row">
          <input
            type="radio"
            name="desmontaje"
            checked={state.windowDesmontaje}
            onChange={() => dispatch({ type: 'SET_WINDOW_DESMONTAJE', value: !state.windowDesmontaje })}
          />
          Desmontaje (+$25)
        </label>
      </div>

      {(frameRequiresQuote || glassRequiresQuote) && (
        <div className="callout" role="status" style={{ marginTop: 20 }}>
          <span className="callout__title">
            <IconWarningTriangle />
            Cotización personalizada por WhatsApp
          </span>
          <p className="callout__body">
            {frameRequiresQuote && glassRequiresQuote
              ? 'El marco Natural y el vidrio Reflectivo bronce se cotizan a la medida.'
              : frameRequiresQuote
                ? 'El marco Natural se cotiza a la medida.'
                : 'El vidrio Reflectivo bronce se cotiza a la medida.'}{' '}
            Puedes seguir y confirmar por WhatsApp.
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
        <button type="button" className="btn btn-primary" disabled={!allRowsValid} onClick={onNext}>
          Siguiente
          <IconArrowRight />
        </button>
      </div>
    </section>
  );
}
