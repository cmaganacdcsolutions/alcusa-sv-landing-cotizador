import type { ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';
import type { CotizadorState } from '../state/cotizadorStore';
import { buildLineItem, outOfRangeCopy, type QuoteResult } from '../state/quote';
import { IconArrowRight, IconWarningTriangle } from '../icons';
import { PRODUCT_IMAGES } from './productImages';
import '@styles/cotizador-medidas.css';

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
//
// sf-cot-medidas gap #3 — the estimate card was restyled to match
// desktop-04/ios-04's "Precio estimado" section 1:1 (product thumbnail +
// name/detail row, ESTIMADO SIN TRANSPORTE label, 40px price, note) via the
// new `.estimate-card` family in cotizador-medidas.css. It intentionally
// reuses `product.name` (real selection) rather than the board's static demo
// text ("Puerta recta · Aquaclara" is prototype flavor text hardcoded in the
// mock's JS, unrelated to the actual selected finish) — see HANDOFF. The
// board's "Editar medidas" link is NOT implemented: it needs a step-jump
// callback this component isn't given (Cotizador.tsx/shell owns step
// navigation) — flagged in HANDOFF for sf-cot-shell.
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
        <div className="estimate-card">
          <div className="estimate-card__head">
            <img src={PRODUCT_IMAGES[product.id]} alt="" className="estimate-card__image" width={72} height={72} />
            <div className="estimate-card__meta">
              <span className="estimate-card__name">{product.name}</span>
              <span className="estimate-card__detail">{detail}</span>
            </div>
          </div>
          <div className="estimate-card__price">
            <span className="estimate-card__label">ESTIMADO SIN TRANSPORTE</span>
            <span className="estimate-card__value" data-testid="step2-price-value">
              {price !== null ? `$${price.toFixed(2)}` : 'Por WhatsApp'}
            </span>
          </div>
          <p className="estimate-card__note">El costo final incluye transporte según tu zona.</p>
          {requiresQuote && (
            <p className="estimate-card__note" style={{ color: 'var(--color-warning)' }}>
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
        <div className="estimate-card">
          <div className="estimate-card__head">
            <img src={PRODUCT_IMAGES[product.id]} alt="" className="estimate-card__image" width={72} height={72} />
            <div className="estimate-card__meta">
              <span className="estimate-card__name">{product.name}</span>
              <span className="estimate-card__detail">{detail}</span>
            </div>
          </div>
          <div className="estimate-card__price">
            <span className="estimate-card__label">ESTIMADO SIN TRANSPORTE</span>
            <span className="estimate-card__value" data-testid="step2-price-value">
              ${(price ?? 0).toFixed(2)}
            </span>
          </div>
          <p className="estimate-card__note">El costo final incluye transporte según tu zona.</p>
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
