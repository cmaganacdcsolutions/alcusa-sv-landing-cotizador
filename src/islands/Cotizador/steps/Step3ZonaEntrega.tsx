import { useState, type ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';
import {
  firstInvalidField,
  isAddressComplete,
  validateAddress,
  type AddressField,
  type GeoPoint,
} from '../../../lib/delivery-address';
import AddressFields, { ADDRESS_INPUT_ID } from './AddressFields';
import { getZoneFee } from '@engine/pricing/zoneFee';
import { zoneDisplayName } from '@content/deliveryZones';
import type { CotizadorState, Entrega } from '../state/cotizadorStore';
import type { QuoteResult } from '../state/quote';
import { orderItemsSubtotal, type OrderLineItem } from '../state/order';
import { IconArrowRight, IconCheck, IconStore, IconTruck } from '../icons';
import '@styles/cotizador-entrega-resumen.css';

export interface Step3ZonaEntregaProps {
  product: CatalogProduct;
  state: CotizadorState;
  quote: QuoteResult;
  // sf-cot-s7gaps gap 2 — the whole order (cart + current item), same list
  // Step4Resumen/state/order.ts build; used only to roll the breakdown's
  // first row up into "N productos" + the order subtotal when there are
  // 2+ items, so this card stays consistent with Resumen/orderTotal
  // instead of showing just the current item's price.
  items: OrderLineItem[];
  zoneFee: number | undefined;
  total: number | null;
  onEntregaChange: (entrega: Entrega) => void;
  onAddressChange: (field: AddressField, value: string) => void;
  onGeoChange: (geo: GeoPoint | null) => void;
  onNext: () => void;
}

// Step 3 — entrega y zona (T1.3 scope; product-agnostic since S5). Municipio
// combobox with the 23-zone table from engine/pricing/zoneFee.ts.
export default function Step3ZonaEntrega({
  product,
  state,
  quote,
  items,
  zoneFee,
  total,
  onEntregaChange,
  onAddressChange,
  onGeoChange,
  onNext,
}: Step3ZonaEntregaProps): ReactElement {
  const [attempted, setAttempted] = useState(false);
  const [liveMsg, setLiveMsg] = useState('');
  const inst = state.entrega === 'instalacion';
  // Contexto promo: las promos son "Instaladas"; no se ofrece retiro en tienda.
  const promoCtx = state.promoId !== null;
  const price = quote.amount ?? 0;
  // Only priceStraight ('recta') accepts a `pickup` flag and applies the
  // 15% discount (engine/pricing/straight.ts); corner/tempered/hinged/
  // ventana/jardin have no pickup discount, so their retiro copy must not
  // claim one (S5/S6 tech-debt — see docs/architecture/tech-debt.md).
  const pickupHasDiscount = product.id === 'recta';
  // El total con envio solo aparece con la direccion completa (o cotizacion cargada por folio).
  const addressComplete = !inst || state.addressFromQuote || isAddressComplete(state.address);
  const zoneUnselected = inst && !addressComplete;
  // La zona elegida muestra su linea de envio de inmediato; el TOTAL espera a la direccion completa.
  const zoneChosen = inst && !state.addressFromQuote && state.zone !== '';
  const chosenFee = getZoneFee(state.zone);
  const canProceed = !zoneUnselected;
  const zoneFeeNote = inst && (addressComplete || zoneChosen) && state.zone
      ? (chosenFee ?? zoneFee) === 0
        ? 'Envío incluido en tu zona.'
        : `Envío a ${zoneDisplayName(state.zone)}: $${(chosenFee ?? zoneFee ?? 0).toFixed(2)}, una vez por pedido.`
      : '';

  function handleNext(): void {
    if (inst && !addressComplete) {
      setAttempted(true);
      const errors = validateAddress(state.address);
      const first = firstInvalidField(errors);
      if (first) {
        setLiveMsg(`Falta completar tu dirección: ${errors[first] ?? ''}`);
        document.getElementById(ADDRESS_INPUT_ID[first])?.focus();
      }
      return;
    }
    onNext();
  }
  // sf-cot-s7gaps gap 2 — 2+ items: roll the first breakdown row up into
  // "N productos" + the order subtotal instead of just this item's price,
  // consistent with Resumen/orderTotal (this step is order-phase now, see
  // Cotizador.tsx isOrderPhase).
  const multiItem = items.length > 1;
  const itemsSubtotal = orderItemsSubtotal(items);
  const entregaSuffix = inst ? ' · con instalación' : pickupHasDiscount ? ' · retiro −15%' : ' · retiro';
  const productLabel = multiItem
    ? `${items.length} productos${entregaSuffix}`
    : inst
      ? `${product.name} · con instalación`
      : pickupHasDiscount
        ? `${product.name} · retiro −15%`
        : `${product.name} · retiro`;
  const productPriceText = multiItem ? `$${itemsSubtotal.toFixed(2)}` : `$${price.toFixed(2)}`;

  return (
    <section aria-labelledby="step3-heading">
      <h3 id="step3-heading" tabIndex={-1} className="cotizador__section-heading" style={{ marginBottom: 12 }}>
        Entrega y zona
      </h3>

      <div role="group" aria-label="Tipo de entrega" className="delivery-group">
        <button
          type="button"
          className="delivery-option"
          aria-pressed={inst}
          onClick={() => onEntregaChange('instalacion')}
        >
          <span className="delivery-option__check">{inst && <IconCheck size={16} strokeWidth={2} />}</span>
          <span className="delivery-option__icon">
            <IconTruck />
          </span>
          <span className="delivery-option__body">
            <span className="delivery-option__title">Con instalación</span>
            <span className="delivery-option__desc">Envío según tu dirección</span>
          </span>
          <span className="delivery-option__radio" aria-hidden="true" />
        </button>
        {!promoCtx && (
        <button
          type="button"
          className="delivery-option"
          aria-pressed={!inst}
          onClick={() => onEntregaChange('retiro')}
        >
          <span className="delivery-option__check">{!inst && <IconCheck size={16} strokeWidth={2} />}</span>
          <span className="delivery-option__icon">
            <IconStore />
          </span>
          <span className="delivery-option__body">
            <span className="delivery-option__title">
              {pickupHasDiscount ? 'Retiro en tienda −15%' : 'Retiro en tienda'}
            </span>
            <span className="delivery-option__desc">Sin costo de transporte</span>
          </span>
          <span className="delivery-option__radio" aria-hidden="true" />
        </button>
        )}
      </div>
      {promoCtx && (
        <p className="delivery-note__body" data-testid="promo-install-note" style={{ marginTop: 8 }}>
          Esta promoción incluye instalación.
        </p>
      )}

      {!inst && (
        <div className="delivery-note" style={{ marginTop: 8 }}>
          <IconStore size={22} />
          <div>
            <p className="delivery-note__title" style={{ margin: 0 }}>
              Retiro en tienda
            </p>
            <p className="delivery-note__body">
              {pickupHasDiscount
                ? 'Aplicamos 15% de descuento al producto. Sin costo de transporte.'
                : 'Sin costo de transporte.'}
            </p>
          </div>
        </div>
      )}

      {inst && (
        <AddressFields
          address={state.address}
          showAllErrors={attempted}
          onChange={onAddressChange}
          onGeoChange={onGeoChange}
        />
      )}
      {inst && zoneFeeNote && (
        <p className="field__helper" id="zona-ayuda" style={{ marginTop: 12 }}>
          {zoneFeeNote}
        </p>
      )}
      <p className="visually-hidden" role="status" aria-live="polite">
        {liveMsg}
      </p>

      {zoneUnselected && (
        <div className="total-placeholder" style={{ marginTop: 20 }}>
          <span className="total-placeholder__title">Total por confirmar</span>
          <p className="total-placeholder__body">
            {zoneChosen
              ? 'Completa tu dirección para ver el total.'
              : 'Completa tu dirección para ver el costo de envío y el total.'}
          </p>
        </div>
      )}

      {canProceed && (
        <dl className="breakdown" style={{ marginTop: 20 }}>
          <div className="breakdown__row">
            <dt>{productLabel}</dt>
            <dd>{productPriceText}</dd>
          </div>
          <div className="breakdown__row">
            <dt>{inst ? `Transporte · ${state.zone}` : 'Transporte'}</dt>
            <dd>{inst ? `$${(zoneFee ?? 0).toFixed(2)}` : 'Sin costo'}</dd>
          </div>
          <div className="breakdown__row breakdown__row--total">
            <dt>Total estimado</dt>
            <dd data-testid="zona-total-value">${(total ?? price).toFixed(2)}</dd>
          </div>
          <div className="breakdown__row">
            <dt>Anticipo 80% · Saldo 20% al entregar</dt>
            <dd>
              ${(Math.round((total ?? price) * 80) / 100).toFixed(2)} · $
              {((total ?? price) - Math.round((total ?? price) * 80) / 100).toFixed(2)}
            </dd>
          </div>
        </dl>
      )}

      <div className="bottom-bar" style={{ marginTop: 24 }}>
        <div className="bottom-bar__price">
          <span className="bottom-bar__price-label">Total estimado</span>
          <span className="bottom-bar__price-value">{canProceed ? `$${(total ?? price).toFixed(2)}` : 'Por confirmar'}</span>
        </div>
        <button type="button" className="btn btn-primary" onClick={handleNext}>
          Siguiente
          <IconArrowRight />
        </button>
      </div>
    </section>
  );
}
