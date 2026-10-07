import type { ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';
import type { CotizadorState } from '../state/cotizadorStore';
import { buildLineItem, outOfRangeCopy, type QuoteResult } from '../state/quote';
import { formatDiscount } from '../state/payable';
import { ONLINE_DISCOUNT_LABEL, type PayOffer } from '../state/payOffer';
import OnlineDiscountPreview from './OnlineDiscountPreview';
import { IconArrowRight, IconWarningTriangle } from '../icons';
import PhotoFrame from '@components/PhotoFrame';
import { estimateImage } from './productImages';
import '@styles/cotizador-medidas.css';
import '@styles/cotizador-address.css';

// Aviso de envio (decision de producto 2026-10-06): el precio se muestra siempre antes del envio.
const SHIPPING_NOTICE = 'Al ingresar tu dirección se agregarán los costos de envío.';

export interface Step2PrecioProps {
  product: CatalogProduct;
  state: CotizadorState;
  quote: QuoteResult;
  /** 10% card offer for this item (no shipping yet): 'applied' = offer link, 'preview' = what the card would cost. */
  payOffer: PayOffer | null;
  onNext: () => void;
  // Jumps back to Step1Medidas — desktop-04/ios-04's "Editar medidas" link.
  onEditMedidas: () => void;
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
// mock's JS, unrelated to the actual selected finish) — see HANDOFF.
// sf-cot-polish item 4 — "Editar medidas" now jumps back to Step1Medidas via
// `onEditMedidas` (Cotizador.tsx owns step navigation).
export default function Step2Precio({ product, state, quote, payOffer, onNext, onEditMedidas }: Step2PrecioProps): ReactElement {
  const { requiresQuote, amount: price } = quote;
  const { detail } = buildLineItem(state);
  // S6 — ventana/jardin: requiresQuote never hard-blocks "Siguiente" (T6.3);
  // Step1's own row/field validation already gated entry into this step.
  const isWindowOrGarden = product.id === 'ventana' || product.id === 'jardin';
  const nextDisabled = isWindowOrGarden ? false : requiresQuote;
  // Offer link: the 10% is already applied (discount row + card total). Otherwise a one-line preview of
  // the card price that leaves the golden "estimado" figures untouched.
  const offerBlock =
    payOffer?.mode === 'applied' ? (
      <div className="estimate-card__offer" data-testid="step2-discount-row">
        <div className="estimate-card__offer-row">
          <span>{ONLINE_DISCOUNT_LABEL}</span>
          <span data-testid="step2-discount-value">{formatDiscount(payOffer.discount)}</span>
        </div>
        <div className="estimate-card__offer-row estimate-card__offer-row--total">
          <span>Con tarjeta, sin transporte</span>
          <span data-testid="step2-card-total">${payOffer.cardTotal.toFixed(2)}</span>
        </div>
      </div>
    ) : (
      <OnlineDiscountPreview offer={payOffer} />
    );
  const barPrice = payOffer?.mode === 'applied' ? payOffer.cardTotal : price;

  return (
    <section aria-labelledby="step2-heading">
      <h3 id="step2-heading" tabIndex={-1} className="cotizador__section-heading" style={{ marginBottom: 12 }}>
        Precio estimado
      </h3>

      {isWindowOrGarden ? (
        <div className="estimate-card">
          <div className="estimate-card__head">
            <PhotoFrame className="estimate-card__preview" src={estimateImage(product.id, state)} alt={product.name} ratio="3/2" ratioLg="1/1" />
            <div className="estimate-card__meta">
              <span className="estimate-card__name">{product.name}</span>
              <span className="estimate-card__detail">{detail}</span>
              <button type="button" className="estimate-card__edit-link" onClick={onEditMedidas}>
                Editar medidas
              </button>
            </div>
          </div>
          <div className="estimate-card__price">
            <span className="estimate-card__label">ESTIMADO SIN TRANSPORTE</span>
            <span className="estimate-card__value" data-testid="step2-price-value">
              {price !== null ? `$${price.toFixed(2)}` : 'Por WhatsApp'}
            </span>
          </div>
          {offerBlock}
          <p className="estimate-card__note">El costo final incluye transporte según tu zona.</p>
          <p className="shipping-notice" data-testid="shipping-notice">
            {SHIPPING_NOTICE}
          </p>
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
            <PhotoFrame className="estimate-card__preview" src={estimateImage(product.id, state)} alt={product.name} ratio="3/2" ratioLg="1/1" />
            <div className="estimate-card__meta">
              <span className="estimate-card__name">{product.name}</span>
              <span className="estimate-card__detail">{detail}</span>
              <button type="button" className="estimate-card__edit-link" onClick={onEditMedidas}>
                Editar medidas
              </button>
            </div>
          </div>
          <div className="estimate-card__price">
            <span className="estimate-card__label">ESTIMADO SIN TRANSPORTE</span>
            <span className="estimate-card__value" data-testid="step2-price-value">
              ${(price ?? 0).toFixed(2)}
            </span>
          </div>
          {offerBlock}
          <p className="estimate-card__note">El costo final incluye transporte según tu zona.</p>
          <p className="shipping-notice" data-testid="shipping-notice">
            {SHIPPING_NOTICE}
          </p>
        </div>
      )}

      <div className="bottom-bar" style={{ marginTop: 24 }}>
        <div className="bottom-bar__price">
          <span className="bottom-bar__price-label">Estimado sin transporte</span>
          <span className="bottom-bar__price-value">{barPrice !== null ? `$${barPrice.toFixed(2)}` : 'Por WhatsApp'}</span>
        </div>
        <button type="button" className="btn btn-primary" disabled={nextDisabled} onClick={onNext}>
          Siguiente
          <IconArrowRight />
        </button>
      </div>
    </section>
  );
}
