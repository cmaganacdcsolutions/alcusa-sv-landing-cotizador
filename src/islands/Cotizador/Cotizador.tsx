import { useEffect, useMemo, useReducer, useRef, type ReactElement } from 'react';
import '@styles/cotizador.css';
import { CATALOG_PRODUCTS, type ProductId } from '@content/catalog';
import { getZoneFee } from '@engine/pricing';
import {
  cotizadorReducer,
  initialCotizadorState,
  slugToStep,
  STEP_ORDER,
  STEP_SLUGS,
  type CotizadorStep,
} from './state/cotizadorStore';
import { computeQuote } from './state/quote';
import Step0Producto from './steps/Step0Producto';
import Step1Medidas from './steps/Step1Medidas';
import Step2Precio from './steps/Step2Precio';
import Step3ZonaEntrega from './steps/Step3ZonaEntrega';
import Step4Resumen from './steps/Step4Resumen';
import Step5FormaPago from './steps/Step5FormaPago';

const STEP_LABELS: Record<CotizadorStep, string> = {
  producto: 'Producto',
  medidas: 'Medidas',
  precio: 'Precio',
  zonaEntrega: 'Entrega',
  resumen: 'Resumen',
  formaPago: 'Pago',
  wompi: 'Wompi',
  resultado: 'Resultado',
};

const VISIBLE_STEPS: readonly CotizadorStep[] = STEP_ORDER.slice(0, 6);

function stepFromHash(hash: string): CotizadorStep | null {
  const raw = hash.replace(/^#/, '');
  const [section, slug] = raw.split('/');
  if (section !== 'cotizador' || !slug) return null;
  return slugToStep(slug);
}

function isCatalogProductId(value: string | null): value is ProductId {
  return !!value && CATALOG_PRODUCTS.some((p) => p.id === value);
}

// Reads the S5 `?producto=<id>` preselect contract (catalog CTAs link to
// `/cotizador?producto=<id>`, per the Foreman's page-split correction).
function productIdFromSearch(search: string): ProductId | null {
  const raw = new URLSearchParams(search).get('producto');
  return isCatalogProductId(raw) ? raw : null;
}

export default function Cotizador(): ReactElement {
  const [state, dispatch] = useReducer(cotizadorReducer, initialCotizadorState);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initialHash = window.location.hash;
    const initial = stepFromHash(initialHash);
    if (initial) dispatch({ type: 'GOTO_STEP', step: initial });

    const preselectId = productIdFromSearch(window.location.search);
    if (preselectId) dispatch({ type: 'PRESELECT_PRODUCT', productId: preselectId });

    // ADR-005: browsers won't auto-scroll a compound "#cotizador/<slug>"
    // fragment, so the island scrolls itself into view on mount.
    if (initialHash.startsWith('#cotizador/')) {
      document.getElementById('cotizador')?.scrollIntoView({ block: 'start' });
    }

    const syncFromHash = () => {
      const step = stepFromHash(window.location.hash);
      if (step) dispatch({ type: 'GOTO_STEP', step });
    };
    window.addEventListener('hashchange', syncFromHash);
    window.addEventListener('popstate', syncFromHash);

    // android412 flake fix: flips a plain DOM attribute (not React state —
    // test-only, same pattern as src/islands/ContactForm.tsx) once this
    // client:load island has actually mounted/hydrated, so e2e specs can
    // wait for it instead of racing the pre-hydration static HTML.
    rootRef.current?.setAttribute('data-hydrated', 'true');

    return () => {
      window.removeEventListener('hashchange', syncFromHash);
      window.removeEventListener('popstate', syncFromHash);
    };
  }, []);

  const product = useMemo(() => CATALOG_PRODUCTS.find((p) => p.id === state.productId) ?? null, [state.productId]);

  // ADR-005: a mid-wizard state with no product selected falls back to step 0
  // instead of rendering a broken step.
  useEffect(() => {
    if (state.step !== 'producto' && !product) {
      dispatch({ type: 'GOTO_STEP', step: 'producto' });
    }
  }, [state.step, product]);

  function goToStep(step: CotizadorStep): void {
    dispatch({ type: 'GOTO_STEP', step });
    window.history.pushState(null, '', `#cotizador/${STEP_SLUGS[step]}`);
  }

  function next(): void {
    const idx = STEP_ORDER.indexOf(state.step);
    goToStep(STEP_ORDER[Math.min(idx + 1, VISIBLE_STEPS.length - 1)]);
  }

  function back(): void {
    const idx = STEP_ORDER.indexOf(state.step);
    goToStep(STEP_ORDER[Math.max(idx - 1, 0)]);
  }

  const quote = useMemo(() => computeQuote(state), [state]);
  const zoneFee = state.entrega === 'instalacion' ? getZoneFee(state.zone) : 0;
  const total = quote.amount !== null ? quote.amount + (zoneFee ?? 0) : null;

  const showSummaryColumn = !!product && state.step !== 'producto';

  return (
    <div ref={rootRef} className="cotizador" data-testid="cotizador-root" data-hydrated="false">
      <div className="cotizador__rail-col">
        <ol className="step-rail" aria-label="Pasos del cotizador">
          {VISIBLE_STEPS.map((step, index) => {
            const currentIdx = VISIBLE_STEPS.indexOf(state.step);
            const itemState = index < currentIdx ? 'done' : index === currentIdx ? 'current' : 'upcoming';
            return (
              <li
                key={step}
                className="step-rail__item"
                data-state={itemState}
                aria-current={itemState === 'current' ? 'step' : undefined}
              >
                <span className="step-rail__dot">{itemState === 'done' ? '✓' : index + 1}</span>
                <span>{STEP_LABELS[step]}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="cotizador__form-col">
        {state.step === 'producto' && (
          <Step0Producto
            selectedId={state.productId}
            onSelect={(productId) => {
              dispatch({ type: 'SELECT_PRODUCT', productId });
              window.history.pushState(null, '', `#cotizador/${STEP_SLUGS.medidas}`);
            }}
          />
        )}
        {state.step === 'medidas' && product && (
          <Step1Medidas product={product} state={state} dispatch={dispatch} quote={quote} onBack={back} onNext={next} />
        )}
        {state.step === 'precio' && product && (
          <Step2Precio product={product} state={state} quote={quote} onBack={back} onNext={next} />
        )}
        {state.step === 'zonaEntrega' && product && (
          <Step3ZonaEntrega
            product={product}
            state={state}
            quote={quote}
            zoneFee={zoneFee}
            total={total}
            onEntregaChange={(entrega) => dispatch({ type: 'SET_ENTREGA', entrega })}
            onZoneChange={(zone) => dispatch({ type: 'SET_ZONE', zone })}
            onBack={back}
            onNext={next}
          />
        )}
        {state.step === 'resumen' && product && (
          <Step4Resumen product={product} state={state} quote={quote} zoneFee={zoneFee} total={total} onBack={back} onNext={next} />
        )}
        {state.step === 'formaPago' && product && (
          <Step5FormaPago product={product} state={state} quote={quote} zoneFee={zoneFee} total={total} onBack={back} />
        )}
      </div>

      {showSummaryColumn && (
        <aside className="cotizador__summary-col price-card" aria-label="Resumen de precio">
          <span className="price-card__label">ESTIMADO SIN TRANSPORTE</span>
          <span className="price-card__value" data-testid="summary-price-value">
            {quote.requiresQuote ? 'Por WhatsApp' : `$${(quote.amount ?? 0).toFixed(2)}`}
          </span>
          {total !== null && (
            <p className="price-card__note">Total con transporte: ${total.toFixed(2)}</p>
          )}
        </aside>
      )}
    </div>
  );
}
