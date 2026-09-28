import { useEffect, useMemo, useReducer, type ReactElement } from 'react';
import '@styles/cotizador.css';
import { CATALOG_PRODUCTS } from '@content/catalog';
import { getZoneFee, priceStraight } from '@engine/pricing';
import {
  cotizadorReducer,
  initialCotizadorState,
  parseWidthCm,
  slugToStep,
  STEP_ORDER,
  STEP_SLUGS,
  type CotizadorStep,
} from './state/cotizadorStore';
import { computeGardenQuote, computeWindowQuote } from './state/quoteWindowGarden';
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

export default function Cotizador(): ReactElement {
  const [state, dispatch] = useReducer(cotizadorReducer, initialCotizadorState);

  useEffect(() => {
    const initialHash = window.location.hash;
    const initial = stepFromHash(initialHash);
    if (initial) dispatch({ type: 'GOTO_STEP', step: initial });
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

  const widthCm = parseWidthCm(state.width);
  const pickup = state.entrega === 'retiro';
  const straightPriceResult = useMemo(
    () => priceStraight({ widthCm, color: state.color, glass: state.glass, pickup }),
    [widthCm, state.color, state.glass, pickup],
  );
  // S6 — ventana/jardin are normalized into the same {price, requiresQuote}
  // shape straight already used, so Step2/3/4/5 (untouched) keep working
  // as-is; only Step1 (repeatable-rows UI) and Step4 (WhatsApp item lines)
  // need their own product-specific branches.
  const windowQuote = useMemo(() => computeWindowQuote(state), [state]);
  const gardenQuote = useMemo(() => computeGardenQuote(state), [state]);
  const priceResult = useMemo(() => {
    if (state.productId === 'ventana') {
      return { price: windowQuote.subtotal, transportIncluded: false, requiresQuote: windowQuote.requiresQuote };
    }
    if (state.productId === 'jardin') {
      return { price: gardenQuote.subtotal, transportIncluded: false, requiresQuote: gardenQuote.requiresQuote };
    }
    return straightPriceResult;
  }, [state.productId, windowQuote, gardenQuote, straightPriceResult]);
  const zoneFee = state.entrega === 'instalacion' ? getZoneFee(state.zone) : 0;
  const total = priceResult.price !== null ? priceResult.price + (zoneFee ?? 0) : null;

  const showSummaryColumn = !!product && state.step !== 'producto';

  return (
    <div className="cotizador" data-testid="cotizador-root">
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
          <Step1Medidas
            product={product}
            width={state.width}
            color={state.color}
            glass={state.glass}
            priceResult={priceResult}
            onWidthChange={(value) => dispatch({ type: 'SET_WIDTH', value })}
            onColorChange={(color) => dispatch({ type: 'SET_COLOR', color })}
            onGlassChange={(glass) => dispatch({ type: 'SET_GLASS', glass })}
            onBack={back}
            onNext={next}
            cotizadorState={state}
            dispatch={dispatch}
          />
        )}
        {state.step === 'precio' && product && (
          <Step2Precio product={product} state={state} priceResult={priceResult} onBack={back} onNext={next} />
        )}
        {state.step === 'zonaEntrega' && product && (
          <Step3ZonaEntrega
            state={state}
            priceResult={priceResult}
            zoneFee={zoneFee}
            total={total}
            onEntregaChange={(entrega) => dispatch({ type: 'SET_ENTREGA', entrega })}
            onZoneChange={(zone) => dispatch({ type: 'SET_ZONE', zone })}
            onBack={back}
            onNext={next}
          />
        )}
        {state.step === 'resumen' && product && (
          <Step4Resumen
            product={product}
            state={state}
            priceResult={priceResult}
            zoneFee={zoneFee}
            total={total}
            onBack={back}
            onNext={next}
          />
        )}
        {state.step === 'formaPago' && product && (
          <Step5FormaPago
            product={product}
            state={state}
            priceResult={priceResult}
            zoneFee={zoneFee}
            total={total}
            onBack={back}
          />
        )}
      </div>

      {showSummaryColumn && (
        <aside className="cotizador__summary-col price-card" aria-label="Resumen de precio">
          <span className="price-card__label">ESTIMADO SIN TRANSPORTE</span>
          <span className="price-card__value" data-testid="summary-price-value">
            {priceResult.requiresQuote ? 'Por WhatsApp' : `$${(priceResult.price ?? 0).toFixed(2)}`}
          </span>
          {total !== null && (
            <p className="price-card__note">Total con transporte: ${total.toFixed(2)}</p>
          )}
        </aside>
      )}
    </div>
  );
}
