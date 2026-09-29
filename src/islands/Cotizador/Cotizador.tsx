import { useEffect, useMemo, useReducer, useRef, useState, type ReactElement } from 'react';
import '@styles/cotizador.css';
import { CATALOG_PRODUCTS, type ProductId } from '@content/catalog';
import { getZoneFee } from '@engine/pricing';
import { buildWaLink } from '@integrations/whatsapp/waLink';
import {
  cotizadorReducer,
  initialCotizadorState,
  slugToStep,
  STEP_ORDER,
  STEP_SLUGS,
  type CotizadorStep,
} from './state/cotizadorStore';
import { buildLineItem, computeQuote } from './state/quote';
import { IconArrowRight, IconCheck, IconChevronLeft, IconLock, IconWhatsApp } from './icons';
import { IconSpinner } from './icons-checkout';
import Step0Producto from './steps/Step0Producto';
import Step1Medidas from './steps/Step1Medidas';
import Step2Precio from './steps/Step2Precio';
import Step3ZonaEntrega from './steps/Step3ZonaEntrega';
import Step4Resumen from './steps/Step4Resumen';
import Step5FormaPago from './steps/Step5FormaPago';
import Step6Wompi from './steps/Step6Wompi';
import Step7Resultado from './steps/Step7Resultado';

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

// sf-cot-polish: navigation now spans the full 8-step wizard (was clamped to
// the first 6, which made Step6Wompi/Step7Resultado unreachable — next()
// could never advance past 'formaPago'). The mobile 6-dot stepper is a
// separate, narrower list (see MOBILE_STEPPER_STEPS below) — grepping
// ios-0N/android-0N confirms the "Pasos del cotizador" <ol> only appears on
// 03/04/05 (producto, medidas, precio, zonaEntrega, resumen); 06
// (whatsapp-pago/formaPago) and 07 (payment-result/wompi+resultado) render
// no stepper at all on mobile.
const MOBILE_STEPPER_STEPS: readonly CotizadorStep[] = STEP_ORDER.slice(0, 6);
const MOBILE_STEPPER_LAST_VISIBLE_IDX = 4; // 'resumen' — index of the last step that still shows the mobile stepper

// Desktop-only rail (nav) — desktop-0[3-7]-*.dc.html render all 8 STEP_ORDER
// entries with a title + one-line sub-label, unlike the 6-dot mobile
// stepper (ios/android boards never show these sub-labels or steps 7-8 at
// all — verified: no "¿Dudas con tu medida?"/"Paso N de 8"/"TU COTIZACIÓN"
// string anywhere in ios-0N/android-0N).
const RAIL_ITEMS: Record<CotizadorStep, { title: string; sub: string }> = {
  producto: { title: 'Elige tu producto', sub: '6 modelos a tu medida' },
  medidas: { title: 'Medidas y acabado', sub: 'Ancho, alto y vidrio' },
  precio: { title: 'Precio estimado', sub: 'En vivo, sin transporte' },
  zonaEntrega: { title: 'Entrega y zona', sub: 'Instalación o retiro en tienda' },
  resumen: { title: 'Resumen', sub: 'Uno o varios productos' },
  formaPago: { title: 'Forma de pago', sub: 'WhatsApp o pagar ahora' },
  wompi: { title: 'Pago (Wompi)', sub: 'Tarjeta de crédito o débito' },
  resultado: { title: 'Resultado', sub: 'Confirmación de tu pedido' },
};

// Boards repeat the same header block (back link + H1) at the top of every
// ios-0N-cotizador-*.dc.html screen. Steps 0–3 share the generic wizard
// title ("Cotiza tu proyecto") with their own <h3> sub-heading below the
// stepper; from "resumen" on, the H1 IS the step's own title and no
// sub-heading is rendered (ios-05/06 boards have no secondary heading).
const PAGE_TITLES: Record<CotizadorStep, string> = {
  producto: 'Cotiza tu proyecto',
  medidas: 'Cotiza tu proyecto',
  precio: 'Cotiza tu proyecto',
  zonaEntrega: 'Cotiza tu proyecto',
  resumen: 'Resumen de tu cotización',
  formaPago: 'Forma de pago',
  wompi: 'Pago',
  resultado: 'Resultado',
};

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

// Desktop aside item row (kicker "TU COTIZACIÓN" card, boards 03-06).
interface AsideItem {
  name: string;
  detail: string;
  price: string;
}

interface AsideView {
  totalLabel: string;
  totalValue: string;
  note: string;
  items: AsideItem[];
  showDeposit: boolean;
  /**
   * null on resumen/formaPago: desktop-05/06 draw "Enviar por WhatsApp para
   * confirmar"/"Pagar ahora" (resumen) and the Wompi CTA (formaPago) ONLY in
   * this aside, never in the main content column — Step4Resumen/
   * Step5FormaPago own the message/amount logic (per-product WhatsApp text,
   * amount toggle) so they still render their own copy of the same control
   * for the mobile bottom-bar (ios/android boards draw it there instead),
   * then `createPortal` a second, real, identically-wired copy into this
   * card's `.cotizador-aside__ctas` mount point (via the `asideCtaTarget`
   * prop) when running at >=1024px. CSS hides whichever copy doesn't match
   * the current breakpoint (see `.cotizador__mobile-only-ctas` /
   * `.cotizador-aside` display:none rules) so exactly one is ever visible —
   * `getByRole` locators (which only match elements in the accessibility
   * tree, i.e. not display:none) resolve to that one without scoping.
   * On 'wompi' this is instead a static "Creando enlace de pago…" pill
   * (desktop-06's own "ANOTACIÓN · ESTADO DE CARGA" callout) — there's
   * nothing to click while the mock payment is in flight.
   */
  ctas: ReactElement | null;
}

export default function Cotizador(): ReactElement {
  const [state, dispatch] = useReducer(cotizadorReducer, initialCotizadorState);
  const rootRef = useRef<HTMLDivElement>(null);
  // Portal mount for the resumen/formaPago aside CTAs — see the AsideView.ctas
  // comment below and Step4Resumen/Step5FormaPago's `asideCtaTarget` prop.
  const [portalCtaEl, setPortalCtaEl] = useState<HTMLDivElement | null>(null);

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
    goToStep(STEP_ORDER[Math.min(idx + 1, STEP_ORDER.length - 1)]);
  }

  function back(): void {
    const idx = STEP_ORDER.indexOf(state.step);
    goToStep(STEP_ORDER[Math.max(idx - 1, 0)]);
  }

  const quote = useMemo(() => computeQuote(state), [state]);
  const zoneFee = state.entrega === 'instalacion' ? getZoneFee(state.zone) : 0;
  const total = quote.amount !== null ? quote.amount + (zoneFee ?? 0) : null;

  // desktop-07-payment-result.dc.html is the only board (03-07) with no
  // "TU COTIZACIÓN" aside at all — the wizard is done, there's nothing left
  // to summarize mid-flow.
  const showSummaryColumn = !!product && state.step !== 'producto' && state.step !== 'resultado';

  const currentIdx = STEP_ORDER.indexOf(state.step);
  const isFirstStep = currentIdx <= 0;
  // Mobile 6-dot stepper (.step-rail-wrap) only exists through 'resumen' —
  // see MOBILE_STEPPER_STEPS comment above.
  const showMobileStepper = currentIdx <= MOBILE_STEPPER_LAST_VISIBLE_IDX;

  // --- Desktop rail (kicker + "Paso N de 8" + progress bar + 8-item list) ---
  // desktop-07-payment-result.dc.html (the only board covering wompi/
  // resultado) shows "Paso 7 de 8", aria-current on item 7 ("Pago (Wompi)"),
  // AND item 8 ("Resultado") highlighted the same way (bold, accent ring)
  // but without aria-current — i.e. wompi+resultado share rail position 7;
  // resultado never advances the counter or the current pointer.
  const isPaymentPhase = state.step === 'wompi' || state.step === 'resultado';
  const railIdx = STEP_ORDER.indexOf(isPaymentPhase ? 'wompi' : state.step);
  const railStepNumber = railIdx + 1;
  const railProgressPct = (railStepNumber / STEP_ORDER.length) * 100;
  // "¿Dudas con tu medida?" block (desktop rail only, all of boards 03-07) —
  // grep "udas con tu medida": copy + link are identical on every board,
  // href is the bare wa.me number (no ?text=, unlike every other WA CTA on
  // these boards).
  const dudasHref = buildWaLink();

  // --- Desktop aside ("TU COTIZACIÓN") ---
  const lineItem = product ? buildLineItem(state) : null;
  const amountText = quote.requiresQuote ? 'Por WhatsApp' : `$${(quote.amount ?? 0).toFixed(2)}`;
  const totalText = total !== null ? `$${total.toFixed(2)}` : quote.requiresQuote ? 'Por WhatsApp' : 'Por confirmar';
  const zoneKnown = state.entrega === 'retiro' || (state.zone !== '' && getZoneFee(state.zone) !== undefined);
  const depositAmount = total !== null ? Math.round(total * 80) / 100 : 0;
  const balanceAmount = total !== null ? total - depositAmount : 0;
  // Same one-liner "Hola ALCUSA, quiero cotizar: <producto> · <medida>." the
  // boards use for the aside's always-on "Cotizar por WhatsApp" (desktop-03
  // script `waHref`, shared verbatim with the requiresQuote callout's own
  // link) — built from the one real builder (buildWaLink), never a second
  // wa.me literal.
  const quoteWaHref =
    product && lineItem ? buildWaLink(`Hola ALCUSA, quiero cotizar: ${product.name} · ${lineItem.detail}.`) : buildWaLink();

  let aside: AsideView | null = null;
  if (product && lineItem) {
    const baseItem: AsideItem = { name: product.name, detail: lineItem.detail, price: amountText };
    const siguiente = (disabled: boolean): ReactElement => (
      <a
        className="btn btn-primary cotizador-aside__cta"
        href={`#cotizador/${STEP_SLUGS[STEP_ORDER[Math.min(STEP_ORDER.indexOf(state.step) + 1, STEP_ORDER.length - 1)]]}`}
        aria-disabled={disabled || undefined}
        onClick={(event) => {
          event.preventDefault();
          if (!disabled) next();
        }}
      >
        Siguiente
        <IconArrowRight size={20} />
      </a>
    );
    const cotizarWhatsApp = (
      <a className="btn btn-whatsapp-outline cotizador-aside__cta" href={quoteWaHref}>
        <IconWhatsApp size={20} />
        Cotizar por WhatsApp
      </a>
    );

    if (state.step === 'medidas' || state.step === 'precio') {
      aside = {
        totalLabel: 'Estimado sin transporte',
        totalValue: amountText,
        note: quote.requiresQuote
          ? 'Esta medida se cotiza por WhatsApp.'
          : 'El costo final incluye transporte según tu zona.',
        items: [baseItem],
        showDeposit: false,
        ctas: (
          <>
            {siguiente(quote.requiresQuote)}
            {cotizarWhatsApp}
          </>
        ),
      };
    } else if (state.step === 'zonaEntrega') {
      const transporteDetail =
        state.entrega === 'retiro' ? 'Retiro en tienda' : zoneKnown ? state.zone : 'Municipio por confirmar';
      const transportePrice =
        state.entrega === 'retiro' ? 'Sin costo' : zoneKnown ? `$${(zoneFee ?? 0).toFixed(2)}` : 'Por confirmar';
      const note =
        state.entrega === 'retiro'
          ? 'Retiro en tienda · 15% de descuento aplicado.'
          : !zoneKnown
            ? 'Transporte por confirmar según tu municipio.'
            : (zoneFee ?? 0) === 0
              ? 'Transporte incluido en tu zona.'
              : `Incluye transporte a ${state.zone}.`;
      aside = {
        totalLabel: 'Total estimado',
        totalValue: totalText,
        note,
        items: [baseItem, { name: 'Transporte', detail: transporteDetail, price: transportePrice }],
        showDeposit: false,
        ctas: (
          <>
            {siguiente(!zoneKnown)}
            {cotizarWhatsApp}
          </>
        ),
      };
    } else if (state.step === 'resumen' || state.step === 'formaPago' || state.step === 'wompi') {
      const transporteDetail =
        state.entrega === 'retiro' ? 'Retiro en tienda' : zoneKnown ? state.zone : 'Municipio por confirmar';
      const transportePrice =
        state.entrega === 'retiro' ? 'Sin costo' : zoneKnown ? `$${(zoneFee ?? 0).toFixed(2)}` : 'Por confirmar';
      aside = {
        totalLabel: 'Total estimado',
        totalValue: totalText,
        note: 'Incluye transporte, cobrado 1 vez por pedido.',
        items: [baseItem, { name: 'Transporte', detail: transporteDetail, price: transportePrice }],
        showDeposit: total !== null,
        ctas:
          state.step === 'wompi' ? (
            <span className="cotizador-aside__cta cotizador-aside__cta--loading" aria-hidden="true">
              <IconSpinner size={20} />
              Creando enlace de pago…
            </span>
          ) : null, // resumen/formaPago: real CTAs portal in from the step component — see the AsideView.ctas comment above.
      };
    }
  }

  return (
    <div ref={rootRef} className="cotizador" data-testid="cotizador-root" data-hydrated="false">
      <div className="cotizador__header">
        {isFirstStep ? (
          <a href="/#inicio" className="cotizador__back">
            <IconChevronLeft />
            Inicio
          </a>
        ) : (
          <button type="button" className="cotizador__back" onClick={back}>
            <IconChevronLeft />
            {STEP_LABELS[STEP_ORDER[currentIdx - 1]]}
          </button>
        )}
        <h2 id="cotizador-page-title" className="cotizador__page-title">
          {PAGE_TITLES[state.step]}
        </h2>
      </div>

      <div className="cotizador__rail-col" data-mobile-empty={showMobileStepper ? undefined : 'true'}>
        {showMobileStepper && (
          <div className="step-rail-wrap">
            <div className="step-rail__connector" aria-hidden="true" />
            <ol className="step-rail" aria-label="Pasos del cotizador">
              {MOBILE_STEPPER_STEPS.map((step, index) => {
                const itemState = index < currentIdx ? 'done' : index === currentIdx ? 'current' : 'upcoming';
                return (
                  <li
                    key={step}
                    className="step-rail__item"
                    data-state={itemState}
                    aria-current={itemState === 'current' ? 'step' : undefined}
                  >
                    <span className="step-rail__dot">{itemState === 'done' ? <IconCheck /> : index + 1}</span>
                    <span>{STEP_LABELS[step]}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        <nav className="rail-desktop" aria-label="Pasos del cotizador">
          <div className="rail-desktop__intro">
            <p className="rail-desktop__kicker">COTIZADOR EN LÍNEA</p>
            <p className="rail-desktop__paso">
              Paso {railStepNumber} de {STEP_ORDER.length}
            </p>
            <div className="rail-desktop__progress" aria-hidden="true">
              <div className="rail-desktop__progress-fill" style={{ width: `${railProgressPct}%` }} />
            </div>
          </div>
          <ol className="rail-desktop__list">
            {STEP_ORDER.map((step, index) => {
              // 'resultado' (index railIdx+1) shares the "current" look while
              // isPaymentPhase, without aria-current — see the railIdx comment.
              const isExtraCurrent = isPaymentPhase && index === railIdx + 1;
              const itemState = index < railIdx ? 'done' : index === railIdx || isExtraCurrent ? 'current' : 'upcoming';
              const item = RAIL_ITEMS[step];
              return (
                <li
                  key={step}
                  className="rail-desktop__item"
                  data-state={itemState}
                  aria-current={index === railIdx ? 'step' : undefined}
                >
                  {index < STEP_ORDER.length - 1 && <span className="rail-desktop__connector" aria-hidden="true" />}
                  <div className="rail-desktop__row">
                    <span className="rail-desktop__dot">{itemState === 'done' ? <IconCheck /> : index + 1}</span>
                    <span className="rail-desktop__text">
                      <span className="rail-desktop__title">{item.title}</span>
                      <span className="rail-desktop__sub">{item.sub}</span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="rail-desktop__dudas">
            <span className="rail-desktop__dudas-title">¿Dudas con tu medida?</span>
            <a href={dudasHref} className="rail-desktop__dudas-link">
              <IconWhatsApp size={20} />
              Escríbenos por WhatsApp
            </a>
          </div>
        </nav>
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
          <Step1Medidas product={product} state={state} dispatch={dispatch} quote={quote} onNext={next} />
        )}
        {state.step === 'precio' && product && (
          <Step2Precio
            product={product}
            state={state}
            quote={quote}
            onNext={next}
            onEditMedidas={() => goToStep('medidas')}
          />
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
            onNext={next}
          />
        )}
        {state.step === 'resumen' && product && (
          <Step4Resumen
            product={product}
            state={state}
            quote={quote}
            zoneFee={zoneFee}
            total={total}
            onNext={next}
            onEditZone={() => goToStep('zonaEntrega')}
            asideCtaTarget={portalCtaEl}
          />
        )}
        {state.step === 'formaPago' && product && (
          <Step5FormaPago
            product={product}
            state={state}
            quote={quote}
            zoneFee={zoneFee}
            total={total}
            dispatch={dispatch}
            onNext={next}
            asideCtaTarget={portalCtaEl}
          />
        )}
        {state.step === 'wompi' && product && (
          <Step6Wompi state={state} quote={quote} zoneFee={zoneFee} total={total} dispatch={dispatch} onNext={next} />
        )}
        {state.step === 'resultado' && product && (
          <Step7Resultado
            product={product}
            state={state}
            quote={quote}
            zoneFee={zoneFee}
            total={total}
            onRetry={() => goToStep('wompi')}
          />
        )}
      </div>

      {showSummaryColumn && aside && (
        <aside className="cotizador-aside" aria-label="Resumen de tu cotización">
          <div className="cotizador-aside__hero">
            <span className="cotizador-aside__shine" aria-hidden="true" />
            <div className="cotizador-aside__hero-top">
              <span className="cotizador-aside__kicker">TU COTIZACIÓN</span>
              <span className="cotizador-aside__count">1 producto</span>
            </div>
            <span className="cotizador-aside__total-label">{aside.totalLabel}</span>
            <span className="cotizador-aside__total-value" aria-live="polite" data-testid="summary-price-value">
              {aside.totalValue}
            </span>
            <span className="cotizador-aside__note">{aside.note}</span>
          </div>
          <ul className="cotizador-aside__items">
            {aside.items.map((item) => (
              <li key={item.name} className="cotizador-aside__item">
                <span className="cotizador-aside__item-meta">
                  <span className="cotizador-aside__item-name">{item.name}</span>
                  <span className="cotizador-aside__item-detail">{item.detail}</span>
                </span>
                <span className="cotizador-aside__item-price">{item.price}</span>
              </li>
            ))}
          </ul>
          {aside.showDeposit && (
            <div className="cotizador-aside__deposit">
              <div className="cotizador-aside__deposit-row">
                <span>Anticipo 80% hoy</span>
                <span>${depositAmount.toFixed(2)}</span>
              </div>
              <div className="cotizador-aside__deposit-row">
                <span>Saldo 20% al recibir</span>
                <span>${balanceAmount.toFixed(2)}</span>
              </div>
            </div>
          )}
          {aside.ctas && <div className="cotizador-aside__ctas">{aside.ctas}</div>}
          {(state.step === 'resumen' || state.step === 'formaPago') && (
            <div className="cotizador-aside__ctas" ref={setPortalCtaEl} />
          )}
          <p className="cotizador-aside__wompi-note">
            <IconLock size={16} />
            Pago con tarjeta vía Wompi · excepto American Express
          </p>
        </aside>
      )}
    </div>
  );
}
