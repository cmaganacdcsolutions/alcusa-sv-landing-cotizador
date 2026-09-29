import { useState, type Dispatch, type ReactElement } from 'react';
import type { CatalogProduct } from '@content/catalog';
import { buildWaLink } from '@integrations/whatsapp/waLink';
import { buildQuoteMessage, type QuoteMessageItem } from '@integrations/whatsapp/buildMessage';
import { buildGardenMessageItem, buildWindowMessageItems } from '@integrations/whatsapp/windowGardenMessageItems';
import { COLOR_LABELS, GLASS_LABELS, type CotizadorAction, type CotizadorState } from '../state/cotizadorStore';
import { buildLineItem, type QuoteResult } from '../state/quote';
import { computeGardenQuote, computeWindowQuote } from '../state/quoteWindowGarden';
import { GARDEN_HOJAS_LABELS } from './measures/GardenForm';
import { WINDOW_GLASS_LABELS, WINDOW_MODEL_LABELS } from './measures/WindowForm';
import { IconArrowRight, IconWhatsApp } from '../icons';
import { IconCardRect, IconLock } from '../icons-checkout';
import '@styles/cotizador-checkout.css';

export interface Step5FormaPagoProps {
  product: CatalogProduct;
  state: CotizadorState;
  quote: QuoteResult;
  zoneFee: number | undefined;
  total: number | null;
  // Optional — Cotizador.tsx doesn't pass this yet (see HANDOFF to
  // sf-cot-shell). method/amountPct always work locally either way (mirrors
  // state.payMethod/payAmountPct's initial values); once wired, the choice
  // is also persisted to shared state so Step6/Step7 see it after the step
  // transition instead of just this component's lifetime.
  dispatch?: Dispatch<CotizadorAction>;
  // Optional — advances to the (mock) Wompi step when "Pagar" is clicked.
  onNext?: () => void;
}

// Step 5 — forma de pago, matches desktop-06/ios-06/android-06
// "whatsapp-pago" boards. "Enviar por WhatsApp para confirmar" is the
// primary, working path; "Pagar ahora" (Wompi) is a mock-only local flow —
// no real network/keys (src/integrations/wompi/mock.ts, Step6Wompi resolves
// it).
export default function Step5FormaPago({
  product,
  state,
  quote,
  zoneFee,
  total,
  dispatch,
  onNext,
}: Step5FormaPagoProps): ReactElement {
  const [method, setLocalMethod] = useState<'wa' | 'pay'>(state.payMethod);
  const [amountPct, setLocalAmountPct] = useState<80 | 100>(state.payAmountPct);
  const setMethod = (m: 'wa' | 'pay') => {
    setLocalMethod(m);
    dispatch?.({ type: 'SET_PAY_METHOD', method: m });
  };
  const setAmountPct = (pct: 80 | 100) => {
    setLocalAmountPct(pct);
    dispatch?.({ type: 'SET_PAY_AMOUNT_PCT', pct });
  };
  const item = buildLineItem(state);
  const subtotal = quote.amount ?? 0;
  const transporte = zoneFee ?? 0;
  const grandTotal = total ?? subtotal;
  const anticipo = Math.round(grandTotal * 80) / 100;
  const saldo = grandTotal - anticipo;
  const amountToPay = amountPct === 80 ? anticipo : grandTotal;
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

  const waMsg = buildQuoteMessage({ items, transporte, total: grandTotal, anticipo, saldo });
  const waHref = buildWaLink(waMsg);
  const money = (n: number) => `$${n.toFixed(2)}`;

  return (
    <section aria-labelledby="cotizador-page-title">
      <p style={{ marginTop: 0, color: 'var(--color-ink-muted)' }}>
        Total de tu cotización: <strong style={{ color: 'var(--color-ink)' }}>{money(grandTotal)}</strong> · elige
        cómo quieres confirmar tu pedido.
      </p>

      <div role="radiogroup" aria-label="Forma de pago" className="payment-group">
        <div className="payment-option" data-checked={method === 'wa'}>
          <button
            type="button"
            role="radio"
            aria-checked={method === 'wa'}
            className="payment-option__head"
            onClick={() => setMethod('wa')}
          >
            <span className="payment-option__icon">
              <IconWhatsApp />
            </span>
            <span className="payment-option__body">
              <span className="payment-option__title">Enviar por WhatsApp para confirmar</span>
              <span className="payment-option__desc">
                Un asesor confirma tu pedido y te comparte el enlace de pago.
              </span>
            </span>
            <span className="payment-option__dot" />
          </button>
          {method === 'wa' && (
            <div className="wa-preview">
              <span className="wa-preview__label">MENSAJE QUE SE ENVIARÁ</span>
              <p className="wa-preview__body">{waMsg}</p>
              <p className="wa-preview__hint">
                Se abre WhatsApp con este mensaje listo para enviar. No se cobra nada en este paso.
              </p>
            </div>
          )}
        </div>

        <div className="payment-option" data-checked={method === 'pay'}>
          <button
            type="button"
            role="radio"
            aria-checked={method === 'pay'}
            className="payment-option__head"
            onClick={() => setMethod('pay')}
          >
            <span className="payment-option__icon payment-option__icon--pay">
              <IconCardRect />
            </span>
            <span className="payment-option__body">
              <span className="payment-option__title">
                Pagar ahora <span className="payment-option__badge">Wompi</span>
              </span>
              <span className="payment-option__desc">Con tarjeta, en la página de pago de Wompi.</span>
            </span>
            <span className="payment-option__dot" />
          </button>

          {method === 'pay' && (
            <div role="group" aria-label="Monto a pagar" className="amount-toggle">
              <button
                type="button"
                className="amount-toggle__btn"
                aria-pressed={amountPct === 80}
                onClick={() => setAmountPct(80)}
              >
                <span className="amount-toggle__label">Anticipo 80%</span>
                <span className="amount-toggle__value">{money(anticipo)}</span>
                <span className="amount-toggle__note">Saldo 20% al entregar: {money(saldo)}</span>
              </button>
              <button
                type="button"
                className="amount-toggle__btn"
                aria-pressed={amountPct === 100}
                onClick={() => setAmountPct(100)}
              >
                <span className="amount-toggle__label">Pago total 100%</span>
                <span className="amount-toggle__value">{money(grandTotal)}</span>
                <span className="amount-toggle__note">Sin saldo al entregar</span>
              </button>
            </div>
          )}

          <div className="payment-option__notes">
            <span>
              <IconLock />
              Aceptamos tarjeta de crédito y débito, excepto American Express.
            </span>
          </div>
        </div>
      </div>

      {method === 'wa' ? (
        <div className="bottom-bar" style={{ marginTop: 16 }}>
          <a href={waHref} className="btn btn-whatsapp" style={{ minHeight: 52, width: '100%' }}>
            <IconWhatsApp />
            Enviar por WhatsApp
          </a>
        </div>
      ) : (
        <div className="bottom-bar" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ minHeight: 52, width: '100%' }}
            onClick={onNext}
          >
            <IconCardRect size={20} />
            Pagar {money(amountToPay)} con Wompi
            <IconArrowRight />
          </button>
        </div>
      )}

      <p className="wompi-footnote">
        <IconLock />
        Pago con tarjeta vía Wompi · excepto American Express
      </p>
    </section>
  );
}
