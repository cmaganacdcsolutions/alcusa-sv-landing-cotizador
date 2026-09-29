import type { ReactElement } from 'react';
import { CATALOG_PRODUCTS, type CatalogProduct } from '@content/catalog';
import { buildWaLink } from '@integrations/whatsapp/waLink';
import type { CotizadorState } from '../state/cotizadorStore';
import type { QuoteResult } from '../state/quote';
import { buildOrderItems } from '../state/order';
import { IconArrowRight, IconCheck, IconWarningTriangle, IconWhatsApp } from '../icons';
import { IconCardRect, IconShieldCheck, IconTruck } from '../icons-checkout';
import '@styles/cotizador-checkout.css';

export interface Step7ResultadoProps {
  // Unused by the layout; optional so the return-from-Wompi render (fresh page load, no product selected) can mount it.
  product?: CatalogProduct;
  state: CotizadorState;
  quote: QuoteResult;
  zoneFee: number | undefined;
  total: number | null;
  // Retries the mock payment (goes back to Step6Wompi). Not wired by
  // Cotizador.tsx yet (see HANDOFF to sf-cot-shell).
  onRetry?: () => void;
}

const MONTHS_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

function todayEs(): string {
  const d = new Date();
  return `${d.getDate()} ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

// Step 7 — Resultado del pago, matches desktop-07/ios-07/android-07
// "payment-result" boards (STATE A · completado / STATE B · cancelado).
// Mock/local state only: no real Wompi calls, no keys, no network — the
// `outcome` prop is how a caller (or a future S8 gateway callback) picks
// which of the two drawn states to render.
export default function Step7Resultado({
  state,
  quote,
  zoneFee,
  total,
  onRetry,
}: Step7ResultadoProps): ReactElement {
  // Mock-only: set by Step6Wompi via SET_WOMPI_RESULT
  // (src/integrations/wompi/mock.ts). Falls back to "approved" so this step
  // still renders something sensible if reached directly (e.g. mid-dev,
  // before Cotizador.tsx wires the real Step6→Step7 transition — see
  // HANDOFF).
  const outcome: 'success' | 'failure' =
    state.wompiOutcome === 'declined' ? 'failure' : 'success';
  // Real gateway only: the redirect could not be confirmed yet; the webhook is the source of truth.
  const pending = state.wompiOutcome === 'pending';
  const paidPct = state.payAmountPct;
  const orderNumber = state.wompiOrderNumber ?? 'ALC-2026-0001';
  const subtotal = quote.amount ?? 0;
  const transporte = zoneFee ?? 0;
  const grandTotal = total ?? subtotal;
  const anticipo = Math.round(grandTotal * 80) / 100;
  const saldo = grandTotal - anticipo;
  const paidAmount = paidPct === 80 ? anticipo : grandTotal;
  const money = (n: number) => `$${n.toFixed(2)}`;
  const inst = state.entrega === 'instalacion';

  // S7 — every cart item + the current item, one row each (a ventana item's
  // several panes collapse into its own single row here, same as Step4Resumen).
  const lines = buildOrderItems(state, CATALOG_PRODUCTS).map((it) => ({
    name: `${it.name} · ${it.detail}`,
    amount: it.subtotal,
  }));

  const itemCountText = `${lines.length} ${lines.length === 1 ? 'producto' : 'productos'}`;
  const waOk = buildWaLink(
    `Hola ALCUSA, ya pagué ${paidPct === 80 ? 'el anticipo' : 'el total'} de ${money(paidAmount)} de mi pedido ${orderNumber}. Quisiera coordinar la instalación.`,
  );
  const waKo = buildWaLink(
    `Hola ALCUSA, mi pago no se completó. Quisiera enviarles mi cotización de ${money(grandTotal)} (${lines.map((l) => l.name).join(', ')}${transporte > 0 ? ` y transporte${inst && state.zone ? ` a ${state.zone}` : ''}` : ''}).`,
  );

  if (outcome === 'failure') {
    return (
      <section
        aria-labelledby="ko-title"
        style={{ display: 'flex', justifyContent: 'center' }}
      >
        <article className="result-card" data-outcome="failure">
          <header className="result-header">
            <span className="result-icon">
              <IconWarningTriangle size={34} />
            </span>
            <p className="result-eyebrow">PAGO NO COMPLETADO</p>
            <h1 id="ko-title" className="result-title">
              Tu pago no se completó.
            </h1>
            <p className="result-lede">
              Puedes intentarlo de nuevo o enviarnos tu cotización por WhatsApp.
            </p>
            <p className="result-safety">
              <IconShieldCheck />
              No se realizó ningún cargo. Tu cotización sigue guardada.
            </p>
          </header>

          <div className="result-grid">
            <div>
              <p className="result-section-label">TU COTIZACIÓN</p>
              <dl className="result-detail">
                <div className="result-detail__row">
                  <dt>Total de tu cotización</dt>
                  <dd>{money(grandTotal)}</dd>
                </div>
                <div className="result-detail__row">
                  <dt>Monto que intentaste pagar</dt>
                  <dd>
                    {money(paidAmount)} ·{' '}
                    {paidPct === 80 ? 'anticipo 80%' : 'pago total 100%'}
                  </dd>
                </div>
              </dl>
              <p className="result-note">
                {itemCountText}
                {transporte > 0 && inst && state.zone
                  ? ` + transporte a ${state.zone}`
                  : ''}
                .
              </p>
            </div>

            <div>
              <p className="result-section-label">ANTES DE REINTENTAR, REVISA</p>
              <ul className="result-checklist">
                <li>
                  <span className="result-checklist__icon">
                    <IconCardRect size={16} />
                  </span>
                  <span>Que la tarjeta tenga fondos o cupo disponible.</span>
                </li>
                <li>
                  <span className="result-checklist__icon">
                    <IconCardRect size={16} />
                  </span>
                  <span>Que el número, la fecha y el código estén bien escritos.</span>
                </li>
                <li>
                  <span className="result-checklist__icon">
                    <IconWarningTriangle size={16} />
                  </span>
                  <span>Aceptamos crédito y débito, excepto American Express.</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="result-actions">
            <div className="result-actions__row">
              <button type="button" className="btn btn-primary" onClick={onRetry}>
                Reintentar pago
              </button>
              <a href={waKo} className="btn btn-whatsapp">
                <IconWhatsApp />
                Cotizar por WhatsApp
              </a>
            </div>
            <a href="/#inicio" className="result-home-link">
              Volver al inicio
            </a>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="ok-title"
      style={{ display: 'flex', justifyContent: 'center' }}
    >
      <article className="result-card" data-outcome="success">
        <header className="result-header">
          <span className="result-icon">
            <IconCheck size={38} strokeWidth={2.5} />
          </span>
          <p className="result-eyebrow">
            {pending ? 'PAGO EN CONFIRMACIÓN' : 'PAGO APROBADO'}
          </p>
          <h1 id="ok-title" className="result-title">
            {pending ? 'Estamos confirmando su pago' : 'Pago completado'}
          </h1>
          <p className="result-lede">
            {pending ? (
              'Wompi aún no nos confirma el cobro. Le avisaremos por WhatsApp en cuanto lo recibamos.'
            ) : (
              <>
                Recibimos {paidPct === 80 ? 'tu anticipo' : 'tu pago'} de{' '}
                {money(paidAmount)}.
              </>
            )}
          </p>
          <dl className="result-pill">
            <div>
              <dt>N.º de pedido</dt>
              <dd>{orderNumber}</dd>
            </div>
            <div>
              <dt>Fecha</dt>
              <dd>{todayEs()}</dd>
            </div>
            <div>
              <dt>Método</dt>
              <dd>Tarjeta vía Wompi</dd>
            </div>
          </dl>
        </header>

        <div className="result-grid">
          <div>
            <p className="result-section-label">DETALLE DEL PAGO</p>
            <dl className="result-detail">
              {lines.map((l, i) => (
                <div className="result-detail__row" key={i}>
                  <dt>{l.name}</dt>
                  <dd>{money(l.amount)}</dd>
                </div>
              ))}
              {transporte > 0 && (
                <div className="result-detail__row">
                  <dt>Transporte{inst && state.zone ? ` · ${state.zone}` : ''}</dt>
                  <dd>{money(transporte)}</dd>
                </div>
              )}
              <div className="result-detail__row result-detail__row--total">
                <dt>Total</dt>
                <dd>{money(grandTotal)}</dd>
              </div>
              <div className="result-detail__row result-detail__row--paid">
                <dt>
                  <IconCheck size={16} />
                  {paidPct === 80 ? 'Anticipo pagado (80%)' : 'Pago total (100%)'}
                </dt>
                <dd>{money(paidAmount)}</dd>
              </div>
              {paidPct === 80 && (
                <div className="result-detail__row">
                  <dt>Saldo al entregar (20%)</dt>
                  <dd>{money(saldo)}</dd>
                </div>
              )}
            </dl>
          </div>

          <div>
            <p className="result-section-label">PRÓXIMOS PASOS</p>
            <p
              style={{
                margin: '0 0 4px',
                fontSize: '1.0625rem',
                fontWeight: 600,
                color: 'var(--color-ink)',
              }}
            >
              {inst
                ? 'Nos pondremos en contacto para coordinar instalación.'
                : 'Nos pondremos en contacto para coordinar el retiro.'}
            </p>
            <ol className="result-steps">
              <li>
                <span className="result-steps__icon result-steps__icon--wa">
                  <IconWhatsApp size={18} />
                </span>
                <span className="result-steps__body">
                  <span className="result-steps__title">Te escribimos por WhatsApp</span>
                  <span className="result-steps__desc">
                    Confirmamos tu pedido {orderNumber} y resolvemos cualquier duda.
                  </span>
                </span>
              </li>
              <li>
                <span className="result-steps__icon">
                  <IconTruck size={18} />
                </span>
                <span className="result-steps__body">
                  <span className="result-steps__title">
                    {inst
                      ? 'Fabricación e instalación'
                      : 'Fabricación y retiro en tienda'}
                  </span>
                  <span className="result-steps__desc">
                    Acordamos contigo fecha y hora.
                  </span>
                </span>
              </li>
              {paidPct === 80 && (
                <li>
                  <span className="result-steps__icon">
                    <IconCardRect size={18} />
                  </span>
                  <span className="result-steps__body">
                    <span className="result-steps__title">Saldo al entregar</span>
                    <span className="result-steps__desc">
                      Pagas los {money(saldo)} restantes (20%) al recibir tu pedido.
                    </span>
                  </span>
                </li>
              )}
            </ol>
          </div>
        </div>

        <div className="result-actions">
          <div className="result-actions__row">
            <a href="/#inicio" className="btn btn-primary">
              Volver al inicio
              <IconArrowRight />
            </a>
            <a href={waOk} className="btn btn-whatsapp">
              <IconWhatsApp />
              Escribir por WhatsApp
            </a>
          </div>
        </div>
      </article>
    </section>
  );
}
