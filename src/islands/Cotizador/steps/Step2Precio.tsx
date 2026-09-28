import type { ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';
import type { StraightPriceResult } from '@engine/pricing';
import { STRAIGHT_WIDTH_MAX_CM, STRAIGHT_WIDTH_MIN_CM } from '@engine/pricing';
import { COLOR_LABELS, type CotizadorState } from '../state/cotizadorStore';

export interface Step2PrecioProps {
  product: CatalogProduct;
  state: CotizadorState;
  priceResult: StraightPriceResult;
  onBack: () => void;
  onNext: () => void;
}

// Step 2 — live price card BEFORE address (T1.2 scope). Copy per
// prototype-spec.md §2.4: "Estimado sin transporte: $X. El costo final
// incluye transporte según tu zona."
export default function Step2Precio({ product, state, priceResult, onBack, onNext }: Step2PrecioProps): ReactElement {
  const { requiresQuote, price } = priceResult;
  // S6 — ventana/jardin: requiresQuote never hard-blocks "Siguiente" (T6.3);
  // Step1's own row/field validation already gated entry into this step.
  const isWindowOrGarden = product.id === 'ventana' || product.id === 'jardin';
  const nextDisabled = isWindowOrGarden ? false : requiresQuote;

  return (
    <section aria-labelledby="step2-heading">
      <button type="button" className="cotizador__back" onClick={onBack}>
        ← Medidas
      </button>
      <h2 id="step2-heading" className="cotizador__title" style={{ fontSize: '1.375rem', margin: '8px 0 16px' }}>
        Precio estimado
      </h2>

      {isWindowOrGarden ? (
        <div className="price-card">
          <p style={{ margin: 0, fontWeight: 700 }}>{product.name}</p>
          <span className="price-card__label">ESTIMADO SIN TRANSPORTE</span>
          <span className="price-card__value" data-testid="step2-price-value">
            {price !== null ? `$${price.toFixed(2)}` : 'Por WhatsApp'}
          </span>
          <p className="price-card__note">El costo final incluye transporte según tu zona.</p>
          {requiresQuote && (
            <p className="price-card__note" style={{ color: 'var(--color-warning)' }}>
              Algunos acabados elegidos requieren cotización personalizada — puedes continuar y confirmarlos por
              WhatsApp.
            </p>
          )}
        </div>
      ) : requiresQuote ? (
        <div className="callout" role="status">
          <span className="callout__title">Cotización personalizada por WhatsApp</span>
          <p className="callout__body">
            El ancho debe ser de {STRAIGHT_WIDTH_MIN_CM} a {STRAIGHT_WIDTH_MAX_CM} cm y la altura de 1.85 m. Para
            otras medidas, consulta con ALCUSA.
          </p>
        </div>
      ) : (
        <div className="price-card">
          <p style={{ margin: 0, fontWeight: 700 }}>
            {product.name} · {COLOR_LABELS[state.color]}
          </p>
          <span className="price-card__label">ESTIMADO SIN TRANSPORTE</span>
          <span className="price-card__value" data-testid="step2-price-value">
            ${(price ?? 0).toFixed(2)}
          </span>
          <p className="price-card__note">El costo final incluye transporte según tu zona.</p>
        </div>
      )}

      <div className="bottom-bar" style={{ marginTop: 24 }}>
        <div className="bottom-bar__price">
          <span className="bottom-bar__price-label">Estimado sin transporte</span>
          <span className="bottom-bar__price-value">{price !== null ? `$${price.toFixed(2)}` : 'Por WhatsApp'}</span>
        </div>
        <button type="button" className="btn btn-primary" disabled={nextDisabled} onClick={onNext}>
          Siguiente
        </button>
      </div>
    </section>
  );
}
