import type { ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';
import type { CotizadorState } from '../state/cotizadorStore';
import { buildLineItem, outOfRangeCopy, type QuoteResult } from '../state/quote';
import { IconArrowRight, IconWarningTriangle } from '../icons';

export interface Step2PrecioProps {
  product: CatalogProduct;
  state: CotizadorState;
  quote: QuoteResult;
  onNext: () => void;
}

// Step 2 — live price card BEFORE address (T1.2 scope; generalized to
// corner/tempered/hinged in S5 via the state/quote.ts dispatcher). Copy per
// prototype-spec.md §2.4: "Estimado sin transporte: $X. El costo final
// incluye transporte según tu zona."
export default function Step2Precio({ product, state, quote, onNext }: Step2PrecioProps): ReactElement {
  const { requiresQuote, amount: price } = quote;
  const { detail } = buildLineItem(state);
  // S6 — ventana/jardin: requiresQuote never hard-blocks "Siguiente" (T6.3);
  // Step1's own row/field validation already gated entry into this step.
  const isWindowOrGarden = product.id === 'ventana' || product.id === 'jardin';
  const nextDisabled = isWindowOrGarden ? false : requiresQuote;

  return (
    <section aria-labelledby="step2-heading">
      <h3 id="step2-heading" className="cotizador__section-heading" style={{ marginBottom: 12 }}>
        Precio estimado
      </h3>

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
          <span className="callout__title">
            <IconWarningTriangle />
            Cotización personalizada por WhatsApp
          </span>
          <p className="callout__body">{outOfRangeCopy(state.productId)}</p>
        </div>
      ) : (
        <div className="price-card">
          <p style={{ margin: 0, fontWeight: 700 }}>{product.name}</p>
          <p style={{ margin: '2px 0 0', color: 'var(--color-ink-muted)', fontSize: 14 }}>{detail}</p>
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
          <IconArrowRight />
        </button>
      </div>
    </section>
  );
}
