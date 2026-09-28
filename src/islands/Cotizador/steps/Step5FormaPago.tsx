import { useState, type ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';
import { buildWaLink } from '@integrations/whatsapp/waLink';
import { buildQuoteMessage, type QuoteMessageItem } from '@integrations/whatsapp/buildMessage';
import { buildGardenMessageItem, buildWindowMessageItems } from '@integrations/whatsapp/windowGardenMessageItems';
import { COLOR_LABELS, GLASS_LABELS, type CotizadorState } from '../state/cotizadorStore';
import { buildLineItem, type QuoteResult } from '../state/quote';
import { computeGardenQuote, computeWindowQuote } from '../state/quoteWindowGarden';
import { GARDEN_HOJAS_LABELS } from './measures/GardenForm';
import { WINDOW_GLASS_LABELS, WINDOW_MODEL_LABELS } from './measures/WindowForm';

export interface Step5FormaPagoProps {
  product: CatalogProduct;
  state: CotizadorState;
  quote: QuoteResult;
  zoneFee: number | undefined;
  total: number | null;
  onBack: () => void;
}

// Step 5 — forma de pago (T1.3 scope; generalized to corner/tempered/hinged
// in S5). "Enviar por WhatsApp para confirmar" is the primary, working path
// this slice; "Pagar ahora" (Wompi) is a visible but disabled stub — wired
// in S8.
export default function Step5FormaPago({ product, state, quote, zoneFee, total, onBack }: Step5FormaPagoProps): ReactElement {
  const [method, setMethod] = useState<'wa' | 'pay'>('wa');
  const item = buildLineItem(state);
  const subtotal = quote.amount ?? 0;
  const transporte = zoneFee ?? 0;
  const grandTotal = total ?? subtotal;
  const anticipo = Math.round(grandTotal * 80) / 100;
  const saldo = grandTotal - anticipo;
  const entregaLabel: 'con instalación' | 'retiro en tienda' =
    state.entrega === 'instalacion' ? 'con instalación' : 'retiro en tienda';
  const zona = state.entrega === 'instalacion' ? state.zone : '—';

  // S6 — ventana/jardin build their own item lines (repeatable rows for
  // ventana, single line for jardin); every other product keeps its original
  // single item from state/quote.ts's buildLineItem.
  let items: QuoteMessageItem[];
  if (product.id === 'ventana') {
    const windowQuote = computeWindowQuote(state);
    items = buildWindowMessageItems(windowQuote.rows, {
      modelLabel: WINDOW_MODEL_LABELS[state.windowModel],
      frameLabel: COLOR_LABELS[state.windowFrame],
      glassLabel: WINDOW_GLASS_LABELS[state.windowGlass],
      zona,
      entrega: entregaLabel,
    });
  } else if (product.id === 'jardin') {
    const gardenQuote = computeGardenQuote(state);
    items = [
      buildGardenMessageItem({
        hojasLabel: GARDEN_HOJAS_LABELS[state.gardenHojas],
        widthM: gardenQuote.widthM,
        heightM: gardenQuote.heightM,
        colorLabel: COLOR_LABELS[state.gardenColor],
        glassLabel: GLASS_LABELS[state.gardenGlass],
        subtotal: gardenQuote.subtotal,
        requiresQuote: gardenQuote.requiresQuote,
        zona,
        entrega: entregaLabel,
      }),
    ];
  } else {
    items = [
      {
        producto: product.name,
        anchoM: item.anchoM,
        altoM: item.altoM,
        color: item.color,
        vidrio: item.vidrio,
        cantidad: item.cantidad,
        zona,
        entrega: entregaLabel,
        subtotal,
      },
    ];
  }

  const waHref = buildWaLink(buildQuoteMessage({ items, transporte, total: grandTotal, anticipo, saldo }));

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
