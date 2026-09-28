import type { ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';
import { hasZoneFee, ZONE_NAMES } from '@engine/pricing';
import { buildWaLink } from '@integrations/whatsapp/waLink';
import type { CotizadorState, Entrega } from '../state/cotizadorStore';
import type { QuoteResult } from '../state/quote';

export interface Step3ZonaEntregaProps {
  product: CatalogProduct;
  state: CotizadorState;
  quote: QuoteResult;
  zoneFee: number | undefined;
  total: number | null;
  onEntregaChange: (entrega: Entrega) => void;
  onZoneChange: (zone: string) => void;
  onBack: () => void;
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
  onBack,
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
      <button type="button" className="cotizador__back" onClick={onBack}>
        ← Precio
      </button>
      <h2 id="step3-heading" className="cotizador__title" style={{ fontSize: '1.375rem', margin: '8px 0 16px' }}>
        Entrega y zona
      </h2>

      <div role="group" aria-label="Tipo de entrega" className="toggle-group">
        <button
          type="button"
          className="toggle-group__btn"
          aria-pressed={inst}
          onClick={() => onEntregaChange('instalacion')}
        >
          Con instalación
        </button>
        <button
          type="button"
          className="toggle-group__btn"
          aria-pressed={!inst}
          onClick={() => onEntregaChange('retiro')}
        >
          {pickupHasDiscount ? 'Retiro en tienda −15%' : 'Retiro en tienda'}
        </button>
      </div>

      {inst && (
        <div className="field" style={{ marginTop: 20 }}>
          <label className="field__label" htmlFor="municipio">
            Municipio de instalación
          </label>
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
          <span className="callout__title">Tu zona aún no tiene tarifa de transporte automática</span>
          <p className="callout__body">Cotiza por WhatsApp y te confirmamos el transporte a tu municipio.</p>
          <a
            href={buildWaLink('Hola ALCUSA, quiero cotizar el transporte a mi municipio.')}
            className="btn btn-whatsapp"
          >
            Cotizar por WhatsApp
          </a>
        </div>
      )}

      {canProceed && !zoneUnselected && (
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
        </button>
      </div>
    </section>
  );
}
