import type { ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';
import { hasZoneFee, ZONE_NAMES } from '@engine/pricing';
import { buildWaLink } from '@integrations/whatsapp/waLink';
import type { CotizadorState, Entrega } from '../state/cotizadorStore';
import type { QuoteResult } from '../state/quote';
import { IconArrowRight, IconCheck, IconChevronDown, IconWarningCircle } from '../icons';
import { IconStore, IconTruck } from '../icons-checkout';
import '@styles/cotizador-checkout.css';

export interface Step3ZonaEntregaProps {
  product: CatalogProduct;
  state: CotizadorState;
  quote: QuoteResult;
  zoneFee: number | undefined;
  total: number | null;
  onEntregaChange: (entrega: Entrega) => void;
  onZoneChange: (zone: string) => void;
  onNext: () => void;
}

// Step 3 — entrega y zona (T1.3 scope; product-agnostic since S5). Municipio
// combobox with the 23-zone table from engine/pricing/zoneFee.ts.
export default function Step3ZonaEntrega({
  product,
  state,
  quote,
  zoneFee,
  total,
  onEntregaChange,
  onZoneChange,
  onNext,
}: Step3ZonaEntregaProps): ReactElement {
  const inst = state.entrega === 'instalacion';
  const price = quote.amount ?? 0;
  // Only priceStraight ('recta') accepts a `pickup` flag and applies the
  // 15% discount (engine/pricing/straight.ts); corner/tempered/hinged/
  // ventana/jardin have no pickup discount, so their retiro copy must not
  // claim one (S5/S6 tech-debt — see docs/architecture/tech-debt.md).
  const pickupHasDiscount = product.id === 'recta';
  const zoneUnselected = inst && !state.zone;
  const zoneNotFound = inst && !!state.zone && !hasZoneFee(state.zone);
  const canProceed = !zoneUnselected && !zoneNotFound;

  return (
    <section aria-labelledby="step3-heading">
      <h3 id="step3-heading" className="cotizador__section-heading" style={{ marginBottom: 12 }}>
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
            <span className="delivery-option__desc">Transporte según tu municipio</span>
          </span>
          <span className="delivery-option__radio" aria-hidden="true" />
        </button>
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
      </div>

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
        <div className="field" style={{ marginTop: 20 }}>
          <label className="field__label" htmlFor="municipio">
            Municipio de instalación
          </label>
          <div className="select-field-wrap">
            <select
              id="municipio"
              className="select-field"
              value={state.zone}
              aria-describedby="zona-ayuda"
              onChange={(e) => onZoneChange(e.target.value)}
            >
              <option value="">Selecciona tu municipio</option>
              {ZONE_NAMES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
              <option value="otro">Mi municipio no está en la lista</option>
            </select>
            <IconChevronDown />
          </div>
          <span id="zona-ayuda" className="field__helper" data-invalid={zoneUnselected}>
            {zoneUnselected
              ? 'Selecciona la zona de instalación.'
              : zoneNotFound
                ? 'Sin tarifa automática para esta zona.'
                : state.zone
                  ? zoneFee === 0
                    ? 'Transporte incluido en tu zona.'
                    : `Transporte a ${state.zone}: $${(zoneFee ?? 0).toFixed(2)}, una vez por pedido.`
                  : ''}
          </span>
        </div>
      )}

      {zoneNotFound && (
        <div className="callout" role="status" style={{ marginTop: 20 }}>
          <span className="callout__title">
            <IconWarningCircle />
            Tu zona aún no tiene tarifa de transporte automática
          </span>
          <p className="callout__body">Cotiza por WhatsApp y te confirmamos el transporte a tu municipio.</p>
          <a
            href={buildWaLink('Hola ALCUSA, quiero cotizar el transporte a mi municipio.')}
            className="btn btn-whatsapp"
          >
            Cotizar por WhatsApp
          </a>
        </div>
      )}

      {zoneUnselected && (
        <div className="total-placeholder" style={{ marginTop: 20 }}>
          <span className="total-placeholder__title">Total por confirmar</span>
          <p className="total-placeholder__body">Selecciona la zona de instalación.</p>
        </div>
      )}

      {canProceed && (
        <dl className="breakdown" style={{ marginTop: 20 }}>
          <div className="breakdown__row">
            <dt>
              {inst
                ? `${product.name} · con instalación`
                : pickupHasDiscount
                  ? `${product.name} · retiro −15%`
                  : `${product.name} · retiro`}
            </dt>
            <dd>${price.toFixed(2)}</dd>
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
        <button type="button" className="btn btn-primary" disabled={!canProceed} onClick={onNext}>
          Siguiente
          <IconArrowRight />
        </button>
      </div>
    </section>
  );
}
