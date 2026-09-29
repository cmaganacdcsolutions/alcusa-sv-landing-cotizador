import { useEffect, useRef, type Dispatch, type ReactElement } from 'react';
import { mockCreateWompiPayment } from '@integrations/wompi/mock';
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
export default function Step6Wompi({ state, quote, total, dispatch, onNext }: Step6WompiProps): ReactElement {
  const started = useRef(false);
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
    const forceOutcome = forced === 'declined' ? 'declined' : forced === 'approved' ? 'approved' : undefined;

    const t = window.setTimeout(() => {
      void mockCreateWompiPayment(amount, { forceOutcome }).then((result) => {
        dispatch({ type: 'SET_WOMPI_RESULT', outcome: result.outcome, orderNumber: result.orderNumber });
        onNext?.();
      });
    }, 1200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mock timer fires once per mount only
  }, []);

  return (
    <section aria-labelledby="cotizador-page-title" data-testid="Step6Wompi">
      <div className="wompi-redirect" role="status">
        <span className="wompi-redirect__icon">
          <IconSpinner size={28} />
        </span>
        <p className="wompi-redirect__title">Creando enlace de pago…</p>
        <p className="wompi-redirect__body">
          Te llevaremos a la página de pago segura de Wompi en un momento. No se ha realizado ningún cargo todavía.
        </p>
      </div>
    </section>
  );
}
