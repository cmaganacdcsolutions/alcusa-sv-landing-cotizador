import { useEffect, useRef, useState, type Dispatch, type ReactElement } from 'react';
import { CATALOG_PRODUCTS } from '@content/catalog';
import {
  createWompiPaymentLink,
  savePendingPayment,
  WompiClientError,
} from '@integrations/wompi/client';
import { getWompiMode } from '@integrations/wompi/config';
import { mockCreateWompiPayment } from '@integrations/wompi/mock';
import { buildOrderItems } from '../state/order';
import type { CotizadorAction, CotizadorState } from '../state/cotizadorStore';
import type { QuoteResult } from '../state/quote';
import { IconSpinner } from '../icons-checkout';
import '@styles/cotizador-checkout.css';

export interface Step6WompiProps {
  state: CotizadorState;
  quote: QuoteResult;
  zoneFee: number | undefined;
  total: number | null;
  dispatch: Dispatch<CotizadorAction>;
  // Optional — advances to Resultado once the mock payment resolves. Not
  // wired by Cotizador.tsx yet (see HANDOFF to sf-cot-shell).
  onNext?: () => void;
}

// Step 6 — Wompi redirect placeholder. No board draws a distinct
// full-screen "Wompi" step (desktop-06 only annotates the button's loading
// state before it opens Wompi's own hosted page in a new tab); this is a
// minimal, styled mock — no real Wompi calls, no keys, no network.
// PUBLIC_COTIZADOR_MODE=mock (the only supported mode until a later slice
// wires the live gateway) resolves through src/integrations/wompi/mock.ts;
// the result is dispatched into shared state (SET_WOMPI_RESULT) so
// Step7Resultado can render the matching success/failure board state.
// `zoneFee` isn't read here — `total` already includes it — but stays in
// the prop signature to match every other step's (product-agnostic) shape.
export default function Step6Wompi({
  state,
  quote,
  total,
  dispatch,
  onNext,
}: Step6WompiProps): ReactElement {
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const subtotal = quote.amount ?? 0;
  const grandTotal = total ?? subtotal;
  const anticipo = Math.round(grandTotal * 80) / 100;
  const amount = state.payAmountPct === 80 ? anticipo : grandTotal;

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // Test-only determinism hook (mirrors the `?producto=` contract): e2e
    // specs force the declined branch with `?wompiOutcome=declined`.
    const forced = new URLSearchParams(window.location.search).get('wompiOutcome');
    const forceOutcome =
      forced === 'declined' ? 'declined' : forced === 'approved' ? 'approved' : undefined;

    // PUBLIC_COTIZADOR_MODE=wompi: ask OUR server for a hosted payment link
    // (it derives the 80/100 amount itself) and send the browser there. The
    // wizard state does not survive the redirect, so keep a small snapshot.
    if (getWompiMode() === 'wompi' && !forceOutcome) {
      const pct = state.payAmountPct === 80 ? 80 : 100;
      const items = buildOrderItems(state, CATALOG_PRODUCTS).map((it) => ({
        name: `${it.name} · ${it.detail}`,
        subtotal: it.subtotal,
      }));
      void createWompiPaymentLink({ pct, total: grandTotal, items })
        .then((link) => {
          savePendingPayment({
            reference: link.reference,
            pct,
            zone: state.zone,
            entrega: state.entrega,
          });
          window.location.assign(link.urlEnlace);
        })
        .catch((e: unknown) => {
          setError(
            e instanceof WompiClientError
              ? e.message
              : 'No pudimos iniciar el pago. Intente de nuevo o escríbanos por WhatsApp.',
          );
        });
      return;
    }

    const t = window.setTimeout(() => {
      void mockCreateWompiPayment(amount, { forceOutcome }).then((result) => {
        dispatch({
          type: 'SET_WOMPI_RESULT',
          outcome: result.outcome,
          orderNumber: result.orderNumber,
        });
        onNext?.();
      });
    }, 1200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mock timer fires once per mount only
  }, []);

  if (error) {
    return (
      <section aria-labelledby="cotizador-page-title" data-testid="Step6Wompi">
        <div className="wompi-redirect" role="alert">
          <p className="wompi-redirect__title">No se pudo iniciar el pago</p>
          <p className="wompi-redirect__body">{error} No se ha realizado ningún cargo.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => dispatch({ type: 'GOTO_STEP', step: 'formaPago' })}
          >
            Volver
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="cotizador-page-title" data-testid="Step6Wompi">
      <div className="wompi-redirect" role="status">
        <span className="wompi-redirect__icon">
          <IconSpinner size={28} />
        </span>
        <p className="wompi-redirect__title">Creando enlace de pago…</p>
        <p className="wompi-redirect__body">
          Te llevaremos a la página de pago segura de Wompi en un momento. No se ha
          realizado ningún cargo todavía.
        </p>
      </div>
    </section>
  );
}
