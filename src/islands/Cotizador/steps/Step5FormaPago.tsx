import { useEffect, useState, type Dispatch, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { CATALOG_PRODUCTS } from '@content/catalog';
import { buildWaLink } from '@integrations/whatsapp/waLink';
import { formatAddressForMessage, isAddressComplete } from '../../../lib/delivery-address';
import { buildQuoteMessage } from '@integrations/whatsapp/buildMessage';
import type { CotizadorAction, CotizadorState } from '../state/cotizadorStore';
import type { QuoteResult } from '../state/quote';
import { buildOrderMessageItems } from '../state/order';
import { computePayable, depositOf, formatDiscount } from '../state/payable';
import { ONLINE_DISCOUNT_LABEL } from '../state/payOffer';
import { IconArrowRight, IconWhatsApp } from '../icons';
import { IconCardRect, IconLock } from '../icons-checkout';
import '@styles/cotizador-checkout.css';

export interface Step5FormaPagoProps {
  state: CotizadorState;
  quote: QuoteResult;
  zoneFee: number | undefined;
  total: number | null;
  /** Sum of item subtotals (before shipping and before the card discount). */
  itemsSubtotal: number;
  /** Distrito sin tarifa: envio "por confirmar" (suma 0, se avisa en pantalla y en el mensaje). */
  shippingPending: boolean;
  // Optional — Cotizador.tsx doesn't pass this yet (see HANDOFF to
  // sf-cot-shell). method/amountPct always work locally either way (mirrors
  // state.payMethod/payAmountPct's initial values); once wired, the choice
  // is also persisted to shared state so Step6/Step7 see it after the step
  // transition instead of just this component's lifetime.
  dispatch?: Dispatch<CotizadorAction>;
  // Optional — advances to the (mock) Wompi step when "Pagar" is clicked.
  onNext?: () => void;
  // sf-cot-polish item 3 — desktop-06 draws the active CTA (WhatsApp or
  // Wompi, whichever `method` is selected) ONLY in the "TU COTIZACIÓN"
  // aside; ios-06/android-06 draw it ONLY in the mobile bottom bar (aside is
  // hidden below 1024px). Same portal pattern as Step4Resumen.
  asideCtaTarget?: HTMLElement | null;
}

// Step 5 — forma de pago, matches desktop-06/ios-06/android-06
// "whatsapp-pago" boards. "Enviar por WhatsApp para confirmar" is the
// primary, working path; "Pagar ahora" (Wompi) is a mock-only local flow —
// no real network/keys (src/integrations/wompi/mock.ts, Step6Wompi resolves
// it).
export default function Step5FormaPago({
  state,
  quote,
  zoneFee,
  total,
  itemsSubtotal,
  shippingPending,
  dispatch,
  onNext,
  asideCtaTarget,
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
  // Reaching the step counts as choosing the default method: Resumen/aside then agree with it.
  useEffect(() => {
    dispatch?.({ type: 'SET_PAY_METHOD', method: state.payMethod });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: persists the initial selection
  }, []);
  const subtotal = quote.amount ?? 0;
  const transporte = zoneFee ?? 0;
  // 10% online-card discount only for the Wompi option (local `method`); WhatsApp keeps the plain total.
  const payable = computePayable({
    itemsSubtotal,
    shipping: shippingPending ? { kind: 'pending' } : { kind: 'fee', fee: transporte },
    payMethod: method,
    pickup: state.entrega === 'retiro',
    promo: !!state.promoId,
  });
  const discountAmount = payable.discount.applies ? payable.discount.amount : 0;
  const grandTotal = total === null ? subtotal : payable.total;
  const anticipo = depositOf(grandTotal);
  const saldo = Math.round((grandTotal - anticipo) * 100) / 100;
  const amountToPay = amountPct === 80 ? anticipo : grandTotal;
  // WhatsApp path: never discounted.
  const waTotal = payable.totalBeforeDiscount;
  const waAnticipo = depositOf(waTotal);
  const waSaldo = Math.round((waTotal - waAnticipo) * 100) / 100;
  const entregaLabel: 'con instalación' | 'retiro en tienda' =
    state.entrega === 'instalacion' ? 'con instalación' : 'retiro en tienda';
  const zona = state.entrega === 'instalacion' ? state.zone : '—';

  // S7 — every cart item + the current item, one WhatsApp line each
  // (ventana items still expand to one line per pane — see state/order.ts).
  const items = buildOrderMessageItems(state, CATALOG_PRODUCTS, { zona, entrega: entregaLabel });

  const direccion =
    state.entrega === 'instalacion' && isAddressComplete(state.address) ? formatAddressForMessage(state.address) : '';
  const waMsg = buildQuoteMessage({
    items,
    transporte,
    total: waTotal,
    anticipo: waAnticipo,
    saldo: waSaldo,
    ...(shippingPending ? { shippingPending: true } : {}),
    ...(direccion ? { direccion } : {}),
  });
  const waHref = buildWaLink(waMsg);
  const money = (n: number) => `$${n.toFixed(2)}`;

  const waCta = (
    <a href={waHref} className="btn btn-whatsapp" style={{ width: '100%' }}>
      <IconWhatsApp />
      Enviar por WhatsApp
    </a>
  );
  const payCta = (
    <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={onNext}>
      <IconCardRect size={20} />
      Pagar {money(amountToPay)} con Wompi
      <IconArrowRight />
    </button>
  );

  return (
    <section aria-labelledby="cotizador-page-title">
      <p style={{ marginTop: 0, color: 'var(--color-ink-muted)' }}>
        Total de tu cotización:{' '}
        <strong style={{ color: 'var(--color-ink)' }} data-testid="formapago-total-value">
          {money(grandTotal)}
        </strong>{' '}
        · elige cómo quieres confirmar tu pedido.
      </p>
      {discountAmount > 0 && (
        <dl className="breakdown" data-testid="formapago-discount" style={{ marginTop: 0, marginBottom: 16 }}>
          <div className="breakdown__row">
            <dt>Productos{transporte > 0 ? ' + transporte' : ''}</dt>
            <dd>{money(payable.totalBeforeDiscount)}</dd>
          </div>
          <div className="breakdown__row">
            <dt>{ONLINE_DISCOUNT_LABEL}</dt>
            <dd data-testid="formapago-discount-value">{formatDiscount(discountAmount)}</dd>
          </div>
        </dl>
      )}
      {method === 'wa' && state.onlineOffer && (
        <p className="online-discount-wa-note" data-testid="formapago-offer-wa-note">
          {`El 10% solo aplica pagando con tarjeta en línea. Por WhatsApp el total es ${money(waTotal)}.`}
        </p>
      )}
      {shippingPending && (
        <p className="field__helper" data-testid="formapago-envio-pendiente" style={{ marginTop: 0 }}>
          Envío por confirmar: te lo confirmamos por WhatsApp y se suma al saldo.
        </p>
      )}

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
              <span className="payment-option__desc" data-testid="pay-discount-hint">
                <strong>10% de descuento pagando con tarjeta aquí</strong>
              </span>
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
        <div className="bottom-bar cotizador__mobile-only-ctas" style={{ marginTop: 16 }}>
          {waCta}
        </div>
      ) : (
        <div className="bottom-bar cotizador__mobile-only-ctas" style={{ marginTop: 16 }}>
          {payCta}
        </div>
      )}
      {asideCtaTarget && createPortal(method === 'wa' ? waCta : payCta, asideCtaTarget)}

      <p className="wompi-footnote">
        <IconLock />
        Pago con tarjeta vía Wompi · excepto American Express
      </p>
    </section>
  );
}
