import type { ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';
import { buildWaLink } from '@integrations/whatsapp/waLink';
import { buildQuoteMessage } from '@integrations/whatsapp/buildMessage';
import type { CotizadorState } from '../state/cotizadorStore';
import { buildLineItem, type QuoteResult } from '../state/quote';

export interface Step4ResumenProps {
  product: CatalogProduct;
  state: CotizadorState;
  quote: QuoteResult;
  zoneFee: number | undefined;
  total: number | null;
  onBack: () => void;
  onNext: () => void;
}

// Step 4 — single-item summary card (T1.3 scope; generalized to
// corner/tempered/hinged in S5). "+ Agregar otro producto" is visible but
// disabled/stub this slice — wired to the multi-item cart in S7. The
// primary WhatsApp handoff lives here too, matching ios-05.
export default function Step4Resumen({ product, state, quote, zoneFee, total, onBack, onNext }: Step4ResumenProps): ReactElement {
  const item = buildLineItem(state);
  const subtotal = quote.amount ?? 0;
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
          anchoM: item.anchoM,
          altoM: item.altoM,
          color: item.color,
          vidrio: item.vidrio,
          cantidad: item.cantidad,
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
    <section aria-labelledby="step4-heading">
      <button type="button" className="cotizador__back" onClick={onBack}>
        ← Entrega
      </button>
      <h2 id="step4-heading" className="cotizador__title" style={{ fontSize: '1.375rem', margin: '8px 0 16px' }}>
        Resumen de tu cotización
      </h2>

      <div className="summary-card">
        <article className="summary-item">
          <div className="summary-item__meta">
            <span className="summary-item__name">{product.name}</span>
            <span className="summary-item__detail">{item.detail}</span>
            <span className="summary-item__detail">
              {entregaLabel === 'con instalación' ? `Con instalación · ${state.zone}` : 'Retiro en tienda'}
            </span>
            <span className="summary-item__price">${subtotal.toFixed(2)}</span>
          </div>
        </article>

        <button type="button" className="summary-add" disabled aria-disabled="true">
          + Agregar otro producto
        </button>

        <dl className="breakdown" style={{ marginTop: 8 }}>
          <div className="breakdown__row">
            <dt>Subtotal productos</dt>
            <dd>${subtotal.toFixed(2)}</dd>
          </div>
          <div className="breakdown__row">
            <dt>Transporte{state.entrega === 'instalacion' ? ` · ${state.zone}` : ''}</dt>
            <dd>${transporte.toFixed(2)}</dd>
          </div>
          <div className="breakdown__row breakdown__row--total">
            <dt>Total</dt>
            <dd data-testid="resumen-total-value">${grandTotal.toFixed(2)}</dd>
          </div>
          <div className="breakdown__row">
            <dt>Anticipo (80%)</dt>
            <dd>${anticipo.toFixed(2)}</dd>
          </div>
          <div className="breakdown__row">
            <dt>Saldo (20%, al entregar)</dt>
            <dd>${saldo.toFixed(2)}</dd>
          </div>
          <div className="breakdown__row">
            <dt>Entrega estimada</dt>
            <dd>8–10 días hábiles</dd>
          </div>
        </dl>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        <a href={waHref} className="btn btn-whatsapp" style={{ minHeight: 52 }}>
          Enviar por WhatsApp para confirmar
        </a>
        <button type="button" className="btn btn-primary" onClick={onNext}>
          Pagar ahora
        </button>
      </div>
    </section>
  );
}
