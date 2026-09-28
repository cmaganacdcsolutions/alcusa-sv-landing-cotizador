import type { ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';
import {
  STRAIGHT_WIDTH_MAX_CM,
  STRAIGHT_WIDTH_MIN_CM,
  type AluminumColor,
  type StraightGlass,
  type StraightPriceResult,
} from '@engine/pricing';
import { COLOR_LABELS, GLASS_LABELS, parseWidthCm, type CotizadorState } from '../state/cotizadorStore';

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

export interface Step1MedidasProps {
  product: CatalogProduct;
  width: CotizadorState['width'];
  color: AluminumColor;
  glass: StraightGlass;
  priceResult: StraightPriceResult;
  onWidthChange: (value: string) => void;
  onColorChange: (color: AluminumColor) => void;
  onGlassChange: (glass: StraightGlass) => void;
  onBack: () => void;
  onNext: () => void;
}

// Step 1 — medidas y acabado for "recta" (T1.2 scope). Entrega toggle is
// deferred to Step 3 (T1.3).
export default function Step1Medidas({
  product,
  width,
  color,
  glass,
  priceResult,
  onWidthChange,
  onColorChange,
  onGlassChange,
  onBack,
  onNext,
}: Step1MedidasProps): ReactElement {
  const widthCm = parseWidthCm(width);
  const invalid = priceResult.requiresQuote;

  return (
    <section aria-labelledby="step1-heading">
      <button type="button" className="cotizador__back" onClick={onBack}>
        ← Producto
      </button>
      <h2 id="step1-heading" className="cotizador__title" style={{ fontSize: '1.375rem', margin: '8px 0 16px' }}>
        Medidas y acabado
      </h2>
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
            value={width}
            data-invalid={invalid}
            aria-describedby="ancho-ayuda"
            className="field__input"
            onChange={(e) => onWidthChange(e.target.value)}
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
        <div className="chip-row">
          {COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="chip"
              aria-pressed={color === c.id}
              onClick={() => onColorChange(c.id)}
            >
              <span className="chip__dot" style={{ background: c.dot }} />
              {COLOR_LABELS[c.id]}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginTop: 20 }}>
        <span className="field__label">Tipo de vidrio</span>
        <div className="glass-grid">
          {GLASSES.map((g) => (
            <button
              key={g.id}
              type="button"
              className="glass-chip"
              aria-pressed={glass === g.id}
              onClick={() => onGlassChange(g.id)}
            >
              <span className="glass-chip__swatch" />
              {GLASS_LABELS[g.id]}
            </button>
          ))}
        </div>
      </div>

      {invalid && (
        <div className="callout" role="status" style={{ marginTop: 20 }}>
          <span className="callout__title">Cotización personalizada por WhatsApp</span>
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
        </button>
      </div>
    </section>
  );
}
