import { useState, type ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';
import type { StraightPriceResult } from '@engine/pricing';
import { buildWaLink } from '@integrations/whatsapp/waLink';
import { buildQuoteMessage } from '@integrations/whatsapp/buildMessage';
import { COLOR_LABELS, GLASS_LABELS, parseWidthCm, type CotizadorState } from '../state/cotizadorStore';

export interface Step5FormaPagoProps {
  product: CatalogProduct;
  state: CotizadorState;
  priceResult: StraightPriceResult;
  zoneFee: number | undefined;
  total: number | null;
  onBack: () => void;
}

// Step 5 — forma de pago (T1.3 scope). "Enviar por WhatsApp para confirmar"
// is the primary, working path this slice; "Pagar ahora" (Wompi) is a
// visible but disabled stub — wired in S8.
export default function Step5FormaPago({ product, state, priceResult, zoneFee, total, onBack }: Step5FormaPagoProps): ReactElement {
  const [method, setMethod] = useState<'wa' | 'pay'>('wa');
  const widthCm = parseWidthCm(state.width);
  const subtotal = priceResult.price ?? 0;
  const transporte = zoneFee ?? 0;
  const grandTotal = total ?? subtotal;
  const anticipo = Math.round(grandTotal * 80) / 100;
  const saldo = grandTotal - anticipo;
  const entregaLabel = state.entrega === 'instalacion' ? 'con instalación' : 'retiro en tienda';

  const waHref = buildWaLink(
    buildQuoteMessage({
      items: [
        {
          producto: product.name,
          anchoM: widthCm / 100,
          altoM: 1.85,
          color: COLOR_LABELS[state.color],
          vidrio: GLASS_LABELS[state.glass],
          zona: state.entrega === 'instalacion' ? state.zone : '—',
          entrega: entregaLabel,
          subtotal,
        },
      ],
      transporte,
      total: grandTotal,
      anticipo,
      saldo,
    }),
  );

  return (
    <section aria-labelledby="step5-heading">
      <button type="button" className="cotizador__back" onClick={onBack}>
        ← Resumen
      </button>
      <h2 id="step5-heading" className="cotizador__title" style={{ fontSize: '1.375rem', margin: '8px 0 4px' }}>
        Forma de pago
      </h2>
      <p style={{ marginTop: 0, color: 'var(--color-ink-muted)' }}>
        Total de tu cotización: <strong style={{ color: 'var(--color-ink)' }}>${grandTotal.toFixed(2)}</strong>
      </p>

      <div role="radiogroup" aria-label="Forma de pago" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          type="button"
          role="radio"
          aria-checked={method === 'wa'}
          className="payment-option"
          onClick={() => setMethod('wa')}
        >
          <span className="payment-option__icon">WA</span>
          <span className="payment-option__body">
            <span className="payment-option__title">Enviar por WhatsApp para confirmar</span>
            <span className="payment-option__desc">Un asesor confirma tu pedido y te comparte el enlace de pago.</span>
          </span>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={false}
          className="payment-option"
          disabled
          aria-disabled="true"
          title="Disponible próximamente"
        >
          <span className="payment-option__icon payment-option__icon--pay">$</span>
          <span className="payment-option__body">
            <span className="payment-option__title">Pagar ahora</span>
            <span className="payment-option__desc">Con tarjeta, en la página de pago de Wompi (próximamente).</span>
          </span>
        </button>
      </div>

      <p style={{ fontSize: 14, color: 'var(--color-ink-muted)' }}>
        Aceptamos tarjeta de crédito y débito, excepto American Express.
      </p>

      <div style={{ marginTop: 16 }}>
        {method === 'wa' && (
          <a href={waHref} className="btn btn-whatsapp" style={{ minHeight: 52, width: '100%' }}>
            Enviar por WhatsApp
          </a>
        )}
      </div>
    </section>
  );
}
