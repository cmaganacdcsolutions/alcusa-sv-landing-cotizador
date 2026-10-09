import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import '@styles/cotizador.css';
import '@styles/cotizador-discount.css';
import { CATALOG_PRODUCTS } from '@content/catalog';
import { parseDeepLink, parseDeepLinkOptions, wantsMedidas } from '@content/deepLink';
import { getZoneFee } from '@engine/pricing';
import { isAddressComplete, parseStoredAddress } from '../../lib/delivery-address';
import { buildWaLink } from '@integrations/whatsapp/waLink';
import { buildAdvisorMessage } from '@integrations/whatsapp/buildMessage';
import {
  cotizadorReducer,
  initialCotizadorState,
  slugToStep,
  STEP_ORDER,
  STEP_SLUGS,
  type CotizadorState,
  type CotizadorStep,
} from './state/cotizadorStore';
import {
  clearWizardSnapshot,
  persistWizardState,
  readNavigationType,
  readWizardSnapshot,
  restoreFields,
  shouldRestoreWizard,
} from './state/persist';
import { buildLineItem, computeQuote } from './state/quote';
import { buildOrderItems, orderItemsSubtotal, orderTotal as computeOrderTotal } from './state/order';
import {
  computePayable,
  depositOf,
  formatDiscount,
  payMethodForDiscount,
  resolveShipping,
  type Payable,
  type ShippingState,
} from './state/payable';
import {
  buildPayOffer,
  hasOnlineOfferParam,
  ONLINE_DISCOUNT_LABEL,
  ONLINE_OFFER_BANNER_TEXT,
  type PayOffer,
} from './state/payOffer';
import OnlineDiscountPreview from './steps/OnlineDiscountPreview';
import {
  IconArrowRight,
  IconCheck,
  IconChevronLeft,
  IconLock,
  IconWhatsApp,
} from './icons';
import { IconCardRect, IconSpinner } from './icons-checkout';
import Step0Producto from './steps/Step0Producto';
import Step1Medidas from './steps/Step1Medidas';
import { PROMO_PARAM } from '@content/promotionsParser';
import { PROMO_BANNER_PREFIX, PROMO_EXIT_LABEL, promoIdFromSearch } from '@content/promoContext';
import { clearStash, hasWork, readStash, writeStash, type WorkStash } from './state/stash';
import { lookupActivePromo, lookupPromo } from './state/promoRegistry';
import Step2Precio from './steps/Step2Precio';
import Step3ZonaEntrega from './steps/Step3ZonaEntrega';
import Step4Resumen from './steps/Step4Resumen';
import Step5FormaPago from './steps/Step5FormaPago';
import Step6Wompi from './steps/Step6Wompi';
import { loadPendingPayment, parseWompiReturn } from '@integrations/wompi/client';
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
  producto: { title: 'Elige tu producto', sub: 'Categoría, tipo y acabado' },
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

// sf-cot-mobile item 4 — the id of the heading each step should scroll/focus
// into view on transition. Steps 0-3 own a per-step <h3> (step0-heading …
// step3-heading, each already `tabIndex={-1}` for programmatic focus);
// resumen/formaPago/wompi/resultado render no sub-heading of their own (see
// the PAGE_TITLES comment above) so the shared page <h2> is the target.
const HEADING_ID: Record<CotizadorStep, string> = {
  producto: 'step0-heading',
  medidas: 'step1-heading',
  precio: 'step2-heading',
  zonaEntrega: 'step3-heading',
  resumen: 'cotizador-page-title',
  formaPago: 'cotizador-page-title',
  wompi: 'cotizador-page-title',
  resultado: 'cotizador-page-title',
};

function stepFromHash(hash: string): CotizadorStep | null {
  // Strip a fragment query (`#cotizador/7-resultado?pago=...` from the Wompi return).
  const raw = hash.replace(/^#/, '').split('?')[0] ?? '';
  const [section, slug] = raw.split('/');
  if (section !== 'cotizador' || !slug) return null;
  return slugToStep(slug);
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
  /** 'Pagando con tarjeta en línea: $X (−10%)' line (only rendered in preview mode). */
  previewOffer?: PayOffer | null;
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

// S7 — sessionStorage persistence for the cart under its own key: a reload
// mid-checkout shouldn't lose already-committed items. The rest of the wizard
// (step, current item, delivery) is a separate snapshot, see state/persist.ts.
// Guarded for the Astro build's server-side render pass (no `window` there)
// and for private-mode/quota errors (try/catch, silently drops the cart).
const CART_STORAGE_KEY = 'alcusa-cotizador-cart';
const FOLIO_PARAM = 'folio';

function loadPersistedCart(): CotizadorState['cart'] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CotizadorState['cart']) : [];
  } catch {
    return [];
  }
}

export default function Cotizador(): ReactElement {
  const [state, dispatch] = useReducer(
    cotizadorReducer,
    initialCotizadorState,
    (init) => ({
      ...init,
      cart: loadPersistedCart(),
    }),
  );
  const rootRef = useRef<HTMLDivElement>(null);

  // Persists `cart` on every change, under its own key (the wizard snapshot
  // below deliberately does not duplicate it).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart));
    } catch {
      // private mode / quota — the cart just won't survive a reload.
    }
  }, [state.cart]);
  // Wizard snapshot (state/persist.ts): written on every state change AFTER the
  // mount effect below has decided whether to restore the stored one. Effects of
  // the first commit run before the dispatches of the mount effect land, so an
  // ungated write would overwrite the stored snapshot with the empty initial
  // state. `bootStateRef` also keeps an untouched first state (and a StrictMode
  // effect re-run) from ever writing.
  const persistReadyRef = useRef(false);
  const bootStateRef = useRef(state);
  // useLayoutEffect (not useEffect): the write must land synchronously in the
  // commit that paints the new state. As a passive effect it could still be
  // pending when a reload happened right after the UI showed the geo check,
  // losing `address.geo`.
  useLayoutEffect(() => {
    if (!persistReadyRef.current || state === bootStateRef.current) return;
    persistWizardState(state);
  }, [state]);
  // Portal mount for the resumen/formaPago aside CTAs — see the AsideView.ctas
  // comment below and Step4Resumen/Step5FormaPago's `asideCtaTarget` prop.
  const [portalCtaEl, setPortalCtaEl] = useState<HTMLDivElement | null>(null);
  // Step 0 (selector): the desktop resumen aside is owned by Step0Producto
  // (it holds the category/type/finish state); it portals its body in here.
  const [selAsideEl, setSelAsideEl] = useState<HTMLElement | null>(null);
  // advisorOnly deep link: name of the product to quote with an advisor.
  const [advisorProduct, setAdvisorProduct] = useState<string | null>(null);
  // Opciones (color/vidrio) que llegaron preseleccionadas desde los configuradores del inicio.
  const [homeOptionsNotice, setHomeOptionsNotice] = useState(false);
  // F4 (ADR-012): folio from the `?folio=` deep link (read once, URL cleaned).
  const [folioParam, setFolioParam] = useState<string | null>(null);
  // Cotizacion en curso apartada al entrar por `?promo=` (aviso no bloqueante "Recuperarla").
  const [stashed, setStashed] = useState<WorkStash | null>(null);

  useEffect(() => {
    const initialHash = window.location.hash;
    const initial = stepFromHash(initialHash);
    if (initial) dispatch({ type: 'GOTO_STEP', step: initial });

    // Return from Wompi (real gateway): api/wompi-return already verified
    // the redirect hash server-side and encoded the result in the fragment.
    // Restore what the redirect wiped, show the result, then tidy the URL.
    const wompiReturn = parseWompiReturn(initialHash);
    if (wompiReturn) {
      const pendingPayment = loadPendingPayment();
      if (pendingPayment) {
        dispatch({ type: 'SET_ZONE', zone: pendingPayment.zone });
        dispatch({ type: 'RESTORE_ADDRESS', address: parseStoredAddress(pendingPayment.address) });
        dispatch({ type: 'SET_ENTREGA', entrega: pendingPayment.entrega });
        dispatch({ type: 'SET_PAY_AMOUNT_PCT', pct: pendingPayment.pct });
        dispatch({ type: 'RESTORE_PROMO', promoId: pendingPayment.promoId ?? null });
      }
      const outcome =
        wompiReturn.pago === 'aprobado'
          ? 'approved'
          : wompiReturn.pago === 'rechazado'
            ? 'declined'
            : 'pending';
      dispatch({
        type: 'SET_WOMPI_RESULT',
        outcome,
        orderNumber: wompiReturn.ref ?? pendingPayment?.reference ?? 'ALC-2026-0001',
      });
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#cotizador/${STEP_SLUGS.resultado}`,
      );
    }

    // ADR-012 §5: `?folio=` is processed once and removed from the URL.
    const folio = new URLSearchParams(window.location.search).get(FOLIO_PARAM);
    if (folio) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only read of location.search (no SSR access)
      setFolioParam(folio);
      const url = new URL(window.location.href);
      url.searchParams.delete(FOLIO_PARAM);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }

    // A page reload (or a mobile tab reload around the geolocation permission
    // prompt) used to wipe everything but the cart, then bounce to step 0 because
    // the hash still named a later step. Restore the stored wizard snapshot when
    // eligible; a fresh deep-link arrival and a Wompi/folio return win instead.
    const storedSnapshot = readWizardSnapshot();
    const offerParam = hasOnlineOfferParam(window.location.search);
    // Contexto de la URL de entrada: `?promo=<id>` vigente y con reglaje, o normal. Un snapshot solo se
    // restaura si su contexto coincide (promo A != promo B != normal): si no, flujo fresco.
    const urlPromo = lookupActivePromo(promoIdFromSearch(window.location.search));
    const restoring =
      storedSnapshot !== null &&
      (storedSnapshot.promoId ?? null) === (urlPromo?.id ?? null) &&
      shouldRestoreWizard({
        wompiReturn: wompiReturn !== null,
        hasFolio: !!folio,
        search: window.location.search,
        hashStep: initial,
        navigation: readNavigationType(),
      });
    // Trabajo en curso de OTRO contexto + entrada fresca por `?promo=`: no se pierde, se aparta (stash) y se avisa.
    if (urlPromo && !wompiReturn && !folio && !restoring) {
      const work = { cart: loadPersistedCart(), snapshot: storedSnapshot };
      if (hasWork(work.cart, work.snapshot)) {
        // Re-ejecucion del efecto (StrictMode): el snapshot ya pudo limpiarse; no pisar un stash completo.
        if (work.snapshot || !readStash()) writeStash(work);
        setStashed(readStash());
      }
    }
    if (storedSnapshot && restoring) {
      const fields = restoreFields(storedSnapshot, initial, offerParam);
      dispatch({ type: 'RESTORE_WIZARD', fields });
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#cotizador/${STEP_SLUGS[fields.step]}`,
      );
    } else {
      clearWizardSnapshot(); // stale or unusable: never leak it into a fresh flow
    }

    // `?oferta=online10` (navbar "Compra YA! 10% de descuento"): the 10% online-card discount is
    // APPLIED from the first screen. Deliberately outside the `!wompiReturn` / `!restoring` block
    // below and AFTER RESTORE_WIZARD, so a reload with the param (the URL keeps it) re-applies the
    // offer on top of the restored wizard, and a priced deep link combined with it keeps both.
    // The offer (and its banner) exist ONLY with the param: restoreFields never turns it on from a snapshot.
    // Si llegan ambos params gana la promo (sin 10% con tarjeta en contexto promo).
    if (offerParam && !urlPromo) dispatch({ type: 'APPLY_ONLINE_OFFER' });
    // Entrada por promo (fresca): bloquea el wizard al reglaje de la promo. Con restore el snapshot ya trae el
    // mismo contexto. Un id invalido/vencido se ignora y se limpia de la URL (flujo normal).
    if (urlPromo && !wompiReturn && !folio && !restoring) dispatch({ type: 'ENTER_PROMO', promo: urlPromo });
    if (!urlPromo && promoIdFromSearch(window.location.search)) {
      const url = new URL(window.location.href);
      url.searchParams.delete(PROMO_PARAM);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }

    // Post-Wompi restoration wins: the deep link must not override it. A
    // restored wizard also skips the priced preset (it would reset the product).
    if (!wompiReturn) {
      // ADR-008 §3: `?producto=<slug>` (leaf, variant or legacy alias). Invalid
      // slugs are ignored; advisorOnly slugs never enter the wizard.
      const deepLink = parseDeepLink(window.location.search);
      if (deepLink.kind === 'priced' && !restoring && !urlPromo) {
        const { preset, quoterModel } = deepLink;
        if (preset.cornerFinish) dispatch({ type: 'SET_CORNER_MODEL', model: preset.cornerFinish });
        if (preset.gardenHojas) dispatch({ type: 'SET_GARDEN_HOJAS', hojas: preset.gardenHojas });
        if (preset.windowType) dispatch({ type: 'SET_WINDOW_MODEL', model: preset.windowType });
        // Legacy ids and an explicit `#cotizador/<step>` hash only preselect;
        // a canonical slug jumps to Medidas.
        // `?paso=medidas` (configuradores del inicio) avanza a Medidas incluso con slugs legacy.
        const toMedidas = wantsMedidas(window.location.search);
        dispatch({
          type: (deepLink.advance || toMedidas) && !initial ? 'SELECT_PRODUCT' : 'PRESELECT_PRODUCT',
          productId: quoterModel,
        });
        // `?color=`/`?vidrio=` (inicio y promos): por modelo; lo invalido se ignora.
        const opts = parseDeepLinkOptions(window.location.search, quoterModel);
        let applied = false;
        switch (opts.model) {
          case 'recta':
          case 'bisagra':
            if (opts.color) dispatch({ type: 'SET_COLOR', color: opts.color });
            if (opts.glass) dispatch({ type: 'SET_GLASS', glass: opts.glass });
            applied = !!(opts.color || opts.glass);
            break;
          case 'l':
            if (opts.color) dispatch({ type: 'SET_COLOR', color: opts.color });
            applied = !!opts.color;
            break;
          case 'jardin':
            if (opts.color) dispatch({ type: 'SET_GARDEN_COLOR', color: opts.color });
            if (opts.glass) dispatch({ type: 'SET_GARDEN_GLASS', glass: opts.glass });
            applied = !!(opts.color || opts.glass);
            break;
          case 'ventana':
            if (opts.color) dispatch({ type: 'SET_WINDOW_FRAME', frame: opts.color });
            if (opts.glass) dispatch({ type: 'SET_WINDOW_GLASS', glass: opts.glass });
            applied = !!(opts.color || opts.glass);
            break;
          default:
            break;
        }
        if (applied && toMedidas) setHomeOptionsNotice(true);
      } else if (deepLink.kind === 'advisor') {
        setAdvisorProduct(deepLink.name);
      }
    }

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
    persistReadyRef.current = true;

    return () => {
      window.removeEventListener('hashchange', syncFromHash);
      window.removeEventListener('popstate', syncFromHash);
    };
  }, []);

  // sf-cot-mobile item 4 — every step transition (Siguiente, back, rail
  // click, Editar links, product pick — all funnel through GOTO_STEP/
  // goToStep) scrolls the window so the new step's heading lands just below
  // the sticky site TopBar (mobile: also below the sticky .cotizador__header
  // stacked under it), instead of leaving the user wherever the previous,
  // now-unmounted step happened to be scrolled to. Skips the very first
  // render so it never fights the ADR-005 initial-hash scrollIntoView above.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const headingId = HEADING_ID[state.step];
    const heading = document.getElementById(headingId);
    if (!heading) return;
    const topBar = document.querySelector('.top-bar');
    const header = rootRef.current?.querySelector('.cotizador__header');
    const isMobile = window.innerWidth < 1024;
    const topBarHeight = topBar?.getBoundingClientRect().height ?? 0;
    const headerStackHeight =
      isMobile && headingId !== 'cotizador-page-title'
        ? (header?.getBoundingClientRect().height ?? 0)
        : 0;
    const offset = topBarHeight + headerStackHeight + (isMobile ? 0 : 24);
    const targetY = Math.max(
      window.scrollY + heading.getBoundingClientRect().top - offset,
      0,
    );
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: targetY, behavior: reduceMotion ? 'auto' : 'smooth' });
    heading.focus({ preventScroll: true });
  }, [state.step]);

  // sf-cot-mobile item 1 — .bottom-bar's real rendered height (it differs per
  // step and now needs to be exact since the bar is `position: fixed` on
  // mobile, see cotizador.css), measured live instead of the old worst-case
  // 136px magic number. Overridden as an inline custom property (wins the
  // cascade over the :root fallback in cotizador.css, which still covers the
  // instant before this effect's first run). Steps with no bottom bar at all
  // (producto, wompi, resultado) get 0 — no bar to clear.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const bar = root.querySelector<HTMLElement>('.bottom-bar');
    if (!bar) {
      root.style.setProperty('--cotizador-bottom-bar-height', '0px');
      return;
    }
    const update = () =>
      root.style.setProperty(
        '--cotizador-bottom-bar-height',
        `${bar.getBoundingClientRect().height}px`,
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [state.step]);

  const product = useMemo(
    () => CATALOG_PRODUCTS.find((p) => p.id === state.productId) ?? null,
    [state.productId],
  );

  // ADR-005: a mid-wizard state with no product selected falls back to step 0
  // instead of rendering a broken step.
  useEffect(() => {
    // Exception: the result step reached from the Wompi return (fresh page load).
    if (
      state.step !== 'producto' &&
      !product &&
      !(state.step === 'resultado' && state.wompiOutcome !== null)
    ) {
      dispatch({ type: 'GOTO_STEP', step: 'producto' });
    }
  }, [state.step, state.wompiOutcome, product]);

  function goToStep(step: CotizadorStep): void {
    dispatch({ type: 'GOTO_STEP', step });
    window.history.pushState(null, '', `#cotizador/${STEP_SLUGS[step]}`);
  }

  // S7 — the zone/entrega step is order-level: once it's actually been
  // decided (a zone picked, or "retiro" chosen), "Siguiente"/back skip it
  // for every later item so the loop goes straight precio <-> resumen.
  // Deliberately NOT keyed off `cart.length` alone — the cart has its own
  // sessionStorage key and survives a fresh arrival, while zone/entrega/address
  // only come back with a restored wizard snapshot (state/persist.ts: reload or
  // an explicit step hash), so a fresh arrival with a leftover cart must still
  // ask for the zone once. The
  // zone stays changeable any time via Resumen's "Cambiar" link
  // (onEditZone → goToStep('zonaEntrega')).
  // Con instalacion, el envio solo se da por decidido con la direccion completa
  // (o una cotizacion cargada por folio, cuyo total guardado ya trae transporte).
  const addressOk =
    state.entrega === 'retiro' || state.addressFromQuote || isAddressComplete(state.address);
  const zoneDecided = state.entrega === 'retiro' || (addressOk && state.zone !== '');

  function next(): void {
    const idx = STEP_ORDER.indexOf(state.step);
    let target = STEP_ORDER[Math.min(idx + 1, STEP_ORDER.length - 1)];
    if (target === 'zonaEntrega' && zoneDecided) {
      target = STEP_ORDER[Math.min(idx + 2, STEP_ORDER.length - 1)];
    }
    goToStep(target);
  }

  function back(): void {
    const idx = STEP_ORDER.indexOf(state.step);
    let target = STEP_ORDER[Math.max(idx - 1, 0)];
    if (target === 'zonaEntrega' && zoneDecided) {
      target = STEP_ORDER[Math.max(idx - 2, 0)];
    }
    goToStep(target);
  }

  // S7 — "+ Agregar otro producto": commits the current item into `cart`
  // and the reducer resets step 0 with a fresh item (prototype-spec.md
  // §2.1 step 4). Mirrors goToStep's pushState so the URL/back button stay
  // in sync with the step the reducer just landed on.
  function addToCart(): void {
    dispatch({ type: 'ADD_TO_CART' });
    window.history.pushState(null, '', `#cotizador/${STEP_SLUGS.producto}`);
  }

  // "Cotizar otro modelo sin promoción": sale del contexto promo (quita `?promo=` de la URL, descarta el
  // item promo y reinicia el wizard en normal: precios regulares y 10% con tarjeta).
  // Promo completada (resultado): el trabajo apartado ya no se ofrece.
  useEffect(() => {
    if (state.step === 'resultado') {
      clearStash();
    }
  }, [state.step]);

  function recoverStash(): void {
    if (!stashed) return;
    const fields = stashed.snapshot ? restoreFields(stashed.snapshot, null, false) : null;
    dispatch({ type: 'RECOVER_WORK', cart: stashed.cart, fields });
    clearStash();
    clearWizardSnapshot();
    setStashed(null);
    const url = new URL(window.location.href);
    url.searchParams.delete(PROMO_PARAM);
    window.history.replaceState(null, '', `${url.pathname}${url.search}#cotizador/${STEP_SLUGS[fields?.step ?? 'producto']}`);
  }

  function discardStash(): void {
    clearStash();
    setStashed(null);
  }

  function exitPromo(): void {
    dispatch({ type: 'EXIT_PROMO' });
    clearWizardSnapshot();
    const url = new URL(window.location.href);
    url.searchParams.delete(PROMO_PARAM);
    window.history.replaceState(null, '', `${url.pathname}${url.search}#cotizador/${STEP_SLUGS.producto}`);
  }

  // S7 — "Quitar": `id: 'current'` removes the in-progress item (promoting
  // the last committed cart item back into it, or falling back to step 0
  // if the cart is empty too); any other id removes that committed item.
  function removeItem(id: string): void {
    // Contexto promo: quitar el item de la promo = salir de la promo (la cotizacion es solo ese item).
    if (state.promoId) {
      exitPromo();
      return;
    }
    dispatch({ type: 'REMOVE_ITEM', id });
  }

  // sf-cot-s7gaps gap 1 — desktop-only "Editar" on a Resumen row: loads a
  // committed cart item into the editable slot and jumps to Medidas.
  // `id: 'current'` is already the item being edited — no cart action
  // needed, just navigate there.
  function editItem(id: string): void {
    if (id === 'current') {
      goToStep('medidas');
      return;
    }
    dispatch({ type: 'EDIT_ITEM', id });
    window.history.pushState(null, '', `#cotizador/${STEP_SLUGS.medidas}`);
  }

  const quote = useMemo(() => computeQuote(state), [state]);
  const promo = useMemo(() => lookupPromo(state.promoId), [state.promoId]);
  // Contexto promo: el paso 0 (elegir producto) no existe; el wizard arranca en Medidas.
  useEffect(() => {
    if (promo && state.step === 'producto') dispatch({ type: 'GOTO_STEP', step: 'medidas' });
  }, [promo, state.step]);
  const zoneFee =
    state.entrega === 'instalacion' ? (addressOk ? getZoneFee(state.zone) : undefined) : 0;
  // Single-current-item total — what steps 0-2 show ("Estimado sin
  // transporte" / the live per-item price) before there's an order-level
  // total to speak of. zonaEntrega (step 3) is order-phase (see
  // isOrderPhase below, sf-cot-s7gaps gap 2): even the first time through,
  // orderItems already equals [current] there, so orderTotalValue and
  // singleItemTotal agree when the cart is still empty.
  const singleItemTotal = quote.amount !== null ? quote.amount + (zoneFee ?? 0) : null;

  // S7 — the whole order: every committed cart item + the current item (if
  // any), one subtotal each, transport (zoneFee) added exactly ONCE
  // (T7.2) regardless of item count. This is what Resumen/Forma de
  // pago/Wompi/Resultado must show as "the total" — see HANDOFF to S8.
  // sf-cot-s7gaps gap 2 — 'zonaEntrega' is included here too: when it's
  // reopened via Resumen's "Cambiar" with 2+ items already in the cart, its
  // breakdown must total the whole order, not just the current item.
  const orderItems = useMemo(() => buildOrderItems(state, CATALOG_PRODUCTS), [state]);
  const isOrderPhase =
    state.step === 'zonaEntrega' ||
    state.step === 'resumen' ||
    state.step === 'formaPago' ||
    state.step === 'wompi' ||
    state.step === 'resultado';
  const orderTotalValue =
    orderItems.length > 0 ? computeOrderTotal(orderItems, zoneFee ?? 0) : null;
  // Envio de la entrega: retiro = none, zona con tarifa = fee, distrito sin tarifa ('otro') = pending
  // ("Envío por confirmar": nunca bloquea). Solo se resuelve con la direccion completa.
  const shipping: ShippingState | null = addressOk ? resolveShipping(state.entrega, state.zone) : null;
  // Descuento 10% pagando con tarjeta en linea: pasos 0-3 nunca; Resumen solo tras elegir metodo
  // en el Paso 5; pago/Wompi/resultado usan state.payMethod (ver payMethodForDiscount).
  const payable: Payable | null =
    isOrderPhase && shipping && orderItems.length > 0
      ? computePayable({
          itemsSubtotal: orderItemsSubtotal(orderItems),
          shipping,
          payMethod: payMethodForDiscount(state.step, state.payMethod, state.payMethodChosen, state.onlineOffer),
          pickup: state.entrega === 'retiro',
          promo: !!state.promoId,
        })
      : null;
  // 10% card line for Precio -> Resumen: 'applied' (offer link / card chosen) or 'preview' ("Pagando
  // con tarjeta en línea: $X (−10%)", golden totals untouched). Precio prices the current item with no
  // shipping yet (same figure the aside shows there); zona/resumen use the whole order and its shipping.
  const payOffer = buildPayOffer({
    step: state.step,
    offer: state.onlineOffer,
    payMethod: state.payMethod,
    chosen: state.payMethodChosen,
    itemsSubtotal: state.step === 'precio' ? (quote.amount ?? 0) : orderItemsSubtotal(orderItems),
    shipping: state.step === 'precio' ? null : shipping,
    pickup: state.entrega === 'retiro',
    promo: !!state.promoId,
  });
  // The offer is "live" (banner copy) while card is the chosen method; picking WhatsApp in Step5 drops it.
  const offerApplied = state.onlineOffer && state.payMethodChosen && state.payMethod === 'pay';
  // Banner only when the offer is active (entered through the navbar "Compra YA!" / `?oferta=online10`).
  const showOfferBanner = state.onlineOffer && !state.promoId && state.step !== 'wompi' && state.step !== 'resultado';
  const onlineDiscount = payable?.discount.applies ? payable.discount.amount : 0;
  const shippingPending = payable?.shippingPending ?? false;
  // Sin direccion completa no se muestra un total con envio: "Por confirmar".
  // Sin descuento payable.total === orderTotalValue (mismos productos + envio, mismo redondeo).
  const total = isOrderPhase ? (addressOk ? (payable?.total ?? orderTotalValue) : null) : singleItemTotal;

  // desktop-07-payment-result.dc.html is the only board (03-07) with no
  // "TU COTIZACIÓN" aside at all — the wizard is done, there's nothing left
  // to summarize mid-flow.
  const showSummaryColumn =
    !!product && state.step !== 'producto' && state.step !== 'resultado';

  const currentIdx = STEP_ORDER.indexOf(state.step);
  const isFirstStep = currentIdx <= (promo ? 1 : 0);
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
  const amountText = quote.requiresQuote
    ? 'Por WhatsApp'
    : `$${(quote.amount ?? 0).toFixed(2)}`;
  const totalText =
    total !== null
      ? `$${total.toFixed(2)}`
      : quote.requiresQuote
        ? 'Por WhatsApp'
        : 'Por confirmar';
  // "Conocida" = retiro, zona con tarifa o distrito sin tarifa con direccion completa ("Envío por confirmar"
  // ya no bloquea: el flujo sigue y el envio se confirma por WhatsApp).
  const zoneKnown =
    state.entrega === 'retiro' ||
    (addressOk && state.zone !== '' && getZoneFee(state.zone) !== undefined) ||
    (addressOk && shipping?.kind === 'pending');
  const shippingPendingNow = state.entrega === 'instalacion' && shipping?.kind === 'pending';
  const transporteDetail =
    state.entrega === 'retiro'
      ? 'Retiro en tienda'
      : shippingPendingNow
        ? 'Te lo confirmamos por WhatsApp'
        : zoneKnown
          ? state.zone
          : 'Zona por confirmar';
  const transportePrice =
    state.entrega === 'retiro'
      ? 'Sin costo'
      : shippingPendingNow
        ? 'Por confirmar'
        : zoneKnown
          ? `$${(zoneFee ?? 0).toFixed(2)}`
          : 'Por confirmar';
  const discountRow = (amount: number): AsideItem[] =>
    amount > 0
      ? [{ name: ONLINE_DISCOUNT_LABEL, detail: 'Solo productos, no incluye envío', price: formatDiscount(amount) }]
      : [];
  const discountItem = discountRow(onlineDiscount);
  const depositAmount = total !== null ? depositOf(total) : 0;
  const balanceAmount = total !== null ? total - depositAmount : 0;
  // Same one-liner "Hola ALCUSA, quiero cotizar: <producto> · <medida>." the
  // boards use for the aside's always-on "Cotizar por WhatsApp" (desktop-03
  // script `waHref`, shared verbatim with the requiresQuote callout's own
  // link) — built from the one real builder (buildWaLink), never a second
  // wa.me literal.
  const quoteWaHref =
    product && lineItem
      ? buildWaLink(`Hola ALCUSA, quiero cotizar: ${product.name} · ${lineItem.detail}.`)
      : buildWaLink();

  let aside: AsideView | null = null;
  if (product && lineItem) {
    const baseItem: AsideItem = {
      name: product.name,
      detail: lineItem.detail,
      price: amountText,
    };
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
      // Offer link: Precio already shows the card price (discount row + discounted total).
      const precioOffer = state.step === 'precio' && payOffer?.mode === 'applied' ? payOffer : null;
      aside = {
        totalLabel: 'Estimado sin transporte',
        totalValue: precioOffer ? `$${precioOffer.cardTotal.toFixed(2)}` : amountText,
        note: quote.requiresQuote
          ? 'Esta medida se cotiza por WhatsApp.'
          : 'El costo final incluye transporte según tu zona.',
        items: [baseItem, ...discountRow(precioOffer?.discount ?? 0)],
        showDeposit: false,
        previewOffer: state.step === 'precio' ? payOffer : null,
        ctas: (
          <>
            {siguiente(quote.requiresQuote)}
            {cotizarWhatsApp}
          </>
        ),
      };
    } else if (state.step === 'zonaEntrega') {
      const note =
        state.entrega === 'retiro'
          ? 'Retiro en tienda · 15% de descuento aplicado.'
          : shippingPendingNow
            ? 'Envío por confirmar: te lo confirmamos por WhatsApp.'
            : !zoneKnown
              ? 'Transporte por confirmar según tu zona.'
              : (zoneFee ?? 0) === 0
                ? 'Transporte incluido en tu zona.'
                : `Incluye transporte a ${state.zone}.`;
      aside = {
        totalLabel: 'Total estimado',
        totalValue: totalText,
        note,
        items: [
          baseItem,
          { name: 'Transporte', detail: transporteDetail, price: transportePrice },
          ...discountItem,
        ],
        showDeposit: false,
        previewOffer: total !== null ? payOffer : null,
        ctas: (
          <>
            {siguiente(!zoneKnown)}
            {cotizarWhatsApp}
          </>
        ),
      };
    } else if (
      state.step === 'resumen' ||
      state.step === 'formaPago' ||
      state.step === 'wompi'
    ) {
      aside = {
        totalLabel: 'Total estimado',
        totalValue: totalText,
        note: shippingPendingNow
          ? 'Envío por confirmar: te lo confirmamos por WhatsApp.'
          : 'Incluye transporte, cobrado 1 vez por pedido.',
        // S7 — every cart+current item, one row each, then the single
        // order-level transport row (never one row per item — T7.2).
        items: [
          ...orderItems.map((it) => ({
            name: it.name,
            detail: it.detail,
            price: it.requiresQuote ? 'Por WhatsApp' : `$${it.subtotal.toFixed(2)}`,
          })),
          { name: 'Transporte', detail: transporteDetail, price: transportePrice },
          ...discountItem,
        ],
        showDeposit: total !== null,
        previewOffer: payOffer,
        ctas:
          state.step === 'wompi' ? (
            <span
              className="cotizador-aside__cta cotizador-aside__cta--loading"
              aria-hidden="true"
            >
              <IconSpinner size={20} />
              Creando enlace de pago…
            </span>
          ) : null, // resumen/formaPago: real CTAs portal in from the step component — see the AsideView.ctas comment above.
      };
    }
  }

  return (
    <div ref={rootRef} className="cotizador" data-testid="cotizador-root" data-hydrated="false">
      {advisorProduct ? (
        <div className="cotizador__advisor" role="status" data-testid="advisor-notice">
          <p>
            <strong>{advisorProduct}</strong>: esta combinación la cotiza un asesor.
          </p>
          <a href={buildWaLink(buildAdvisorMessage(advisorProduct))} target="_blank" rel="noopener noreferrer">
            Cotiza con asesor
          </a>
        </div>
      ) : null}
      {homeOptionsNotice && state.step !== 'producto' ? (
        <p className="cotizador__home-notice" role="status" data-testid="home-options-notice">
          Opciones elegidas en el inicio. Puedes cambiarlas.
        </p>
      ) : null}
      <div className="cotizador__header">
        {isFirstStep ? (
          <a href="/#inicio" className="cotizador__back">
            <IconChevronLeft />
            Inicio
          </a>
        ) : (
          <button type="button" className="cotizador__back" onClick={back}>
            <IconChevronLeft />
            {
              STEP_LABELS[
                // S7 — mirrors back()'s zonaEntrega skip so the label always
                // names the step the click will actually land on.
                STEP_ORDER[currentIdx - 1] === 'zonaEntrega' && zoneDecided
                  ? STEP_ORDER[Math.max(currentIdx - 2, 0)]
                  : STEP_ORDER[currentIdx - 1]
              ]
            }
          </button>
        )}
        <h2 id="cotizador-page-title" tabIndex={-1} className="cotizador__page-title title-gradient">
          {PAGE_TITLES[state.step]}
        </h2>
      </div>

      <div
        className="cotizador__rail-col"
        data-mobile-empty={showMobileStepper ? undefined : 'true'}
      >
        {showMobileStepper && (
          <div className="step-rail-wrap">
            <div className="step-rail__connector" aria-hidden="true" />
            <ol className="step-rail" aria-label="Pasos del cotizador">
              {MOBILE_STEPPER_STEPS.map((step, index) => {
                const itemState =
                  index < currentIdx
                    ? 'done'
                    : index === currentIdx
                      ? 'current'
                      : 'upcoming';
                return (
                  <li
                    key={step}
                    className="step-rail__item"
                    data-state={itemState}
                    aria-current={itemState === 'current' ? 'step' : undefined}
                  >
                    <span className="step-rail__dot">
                      {itemState === 'done' ? <IconCheck /> : index + 1}
                    </span>
                    <span className="step-rail__label">{STEP_LABELS[step]}</span>
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
              <div
                className="rail-desktop__progress-fill"
                style={{ width: `${railProgressPct}%` }}
              />
            </div>
          </div>
          <ol className="rail-desktop__list">
            {STEP_ORDER.map((step, index) => {
              // 'resultado' (index railIdx+1) shares the "current" look while
              // isPaymentPhase, without aria-current — see the railIdx comment.
              const isExtraCurrent = isPaymentPhase && index === railIdx + 1;
              const itemState =
                index < railIdx
                  ? 'done'
                  : index === railIdx || isExtraCurrent
                    ? 'current'
                    : 'upcoming';
              const item = RAIL_ITEMS[step];
              return (
                <li
                  key={step}
                  className="rail-desktop__item"
                  data-state={itemState}
                  aria-current={index === railIdx ? 'step' : undefined}
                >
                  {index < STEP_ORDER.length - 1 && (
                    <span className="rail-desktop__connector" aria-hidden="true" />
                  )}
                  <div className="rail-desktop__row">
                    <span className="rail-desktop__dot">
                      {itemState === 'done' ? <IconCheck /> : index + 1}
                    </span>
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
        {showOfferBanner && (
          <div
            className="online-discount-banner"
            data-testid="online-discount-banner"
            data-state={offerApplied ? 'applied' : 'info'}
            role="status"
          >
            <IconCardRect size={22} className="online-discount-banner__icon" />
            <p className="online-discount-banner__text">
              <strong>{ONLINE_OFFER_BANNER_TEXT}</strong>
            </p>
          </div>
        )}
        {promo && state.step !== 'resultado' && (
          <div className="online-discount-banner" data-testid="promo-banner" data-state="info" role="status">
            <p className="online-discount-banner__text">
              <strong>{`${PROMO_BANNER_PREFIX} ${promo.title}`}</strong>
              {` · $${promo.price.toFixed(promo.price % 1 === 0 ? 0 : 2)} instalada en San Salvador y Santa Tecla (otras zonas suman su envío).`}
            </p>
            <button type="button" className="btn btn-secondary" data-testid="promo-exit" onClick={exitPromo}>
              {PROMO_EXIT_LABEL}
            </button>
          </div>
        )}
        {stashed && state.step !== 'resultado' && (
          <div className="online-discount-banner" data-testid="stash-banner" data-state="info" role="status">
            <p className="online-discount-banner__text">
              <strong>Tienes una cotización en curso</strong>
              {' · La guardamos aparte para que no la pierdas.'}
            </p>
            <button type="button" className="btn btn-secondary" data-testid="stash-recover" onClick={recoverStash}>
              Recuperarla
            </button>
            <button type="button" className="btn btn-secondary" data-testid="stash-discard" onClick={discardStash}>
              Descartar
            </button>
          </div>
        )}
        {state.step === 'producto' && !promo && (
          <Step0Producto
            asideTarget={selAsideEl}
            selectedId={state.productId}
            current={{ cornerFinish: state.cornerModel, gardenHojas: state.gardenHojas === 'custom' ? undefined : state.gardenHojas, windowType: state.windowModel }}
            quoteLoad={{
              hasItems: state.cart.length > 0,
              autoFolio: folioParam,
              onLoad: (applied) => {
                dispatch({ type: 'LOAD_QUOTE', items: applied.items, entrega: applied.entrega, zone: applied.zone, notice: applied.notice, promoId: applied.promoId });
                if (applied.promoId) {
                  // Cotizacion de promo vigente: la URL refleja el contexto (un reload no lo pierde).
                  const url = new URL(window.location.href);
                  url.searchParams.set(PROMO_PARAM, applied.promoId);
                  window.history.pushState(null, '', `${url.pathname}${url.search}#cotizador/${STEP_SLUGS.resumen}`);
                } else {
                  window.history.pushState(null, '', `#cotizador/${STEP_SLUGS.resumen}`);
                }
              },
            }}
            onSelect={(productId, preset) => {
              if (preset.cornerFinish) dispatch({ type: 'SET_CORNER_MODEL', model: preset.cornerFinish });
              if (preset.gardenHojas) dispatch({ type: 'SET_GARDEN_HOJAS', hojas: preset.gardenHojas });
              if (preset.windowType) dispatch({ type: 'SET_WINDOW_MODEL', model: preset.windowType });
              dispatch({ type: 'SELECT_PRODUCT', productId });
              window.history.pushState(null, '', `#cotizador/${STEP_SLUGS.medidas}`);
            }}
          />
        )}
        {state.step === 'medidas' && product && (
          <Step1Medidas
            product={product}
            state={state}
            dispatch={dispatch}
            quote={quote}
            onNext={next}
          />
        )}
        {state.step === 'precio' && product && (
          <Step2Precio
            product={product}
            state={state}
            quote={quote}
            payOffer={payOffer}
            onNext={next}
            onEditMedidas={() => goToStep('medidas')}
          />
        )}
        {state.step === 'zonaEntrega' && product && (
          <Step3ZonaEntrega
            product={product}
            state={state}
            quote={quote}
            items={orderItems}
            zoneFee={zoneFee}
            total={total}
            payOffer={payOffer}
            shippingPending={shippingPendingNow}
            onEntregaChange={(entrega) => dispatch({ type: 'SET_ENTREGA', entrega })}
            onAddressChange={(field, value) => dispatch({ type: 'SET_ADDRESS_FIELD', field, value })}
            onGeoChange={(geo) => dispatch({ type: 'SET_ADDRESS_GEO', geo })}
            onNext={next}
          />
        )}
        {state.step === 'resumen' && product && (
          <Step4Resumen
            product={product}
            state={state}
            items={orderItems}
            zoneFee={zoneFee}
            total={total}
            onlineDiscount={onlineDiscount}
            payOffer={payOffer}
            shippingPending={shippingPending}
            onNext={next}
            onEditZone={() => goToStep('zonaEntrega')}
            onAddAnother={addToCart}
            onRemoveItem={removeItem}
            onEditItem={editItem}
            onDismissQuoteNotice={() => dispatch({ type: 'DISMISS_QUOTE_NOTICE' })}
            asideCtaTarget={portalCtaEl}
          />
        )}
        {state.step === 'formaPago' && product && (
          <Step5FormaPago
            state={state}
            quote={quote}
            zoneFee={zoneFee}
            total={total}
            itemsSubtotal={orderItemsSubtotal(orderItems)}
            shippingPending={shippingPending}
            dispatch={dispatch}
            onNext={next}
            asideCtaTarget={portalCtaEl}
          />
        )}
        {state.step === 'wompi' && product && (
          <Step6Wompi
            state={state}
            quote={quote}
            zoneFee={zoneFee}
            total={total}
            onlineDiscount={onlineDiscount}
            shippingPending={shippingPending}
            dispatch={dispatch}
            onNext={next}
          />
        )}
        {state.step === 'resultado' && (product || state.wompiOutcome !== null) && (
          <Step7Resultado
            product={product ?? undefined}
            state={state}
            quote={quote}
            zoneFee={zoneFee}
            total={total}
            onlineDiscount={onlineDiscount}
            shippingPending={shippingPending}
            onRetry={() => goToStep('wompi')}
          />
        )}
      </div>

      {state.step === 'producto' && (
        <aside
          ref={setSelAsideEl}
          className="cotizador-aside cotizador__summary-col cotizador-aside--sel"
          aria-label="Resumen de tu cotización"
        />
      )}

      {showSummaryColumn && aside && (
        <aside
          className="cotizador-aside cotizador__summary-col"
          aria-label="Resumen de tu cotización"
        >
          <div className="cotizador-aside__hero">
            <span className="cotizador-aside__shine" aria-hidden="true" />
            <div className="cotizador-aside__hero-top">
              <span className="cotizador-aside__kicker">TU COTIZACIÓN</span>
              <span className="cotizador-aside__count">
                {orderItems.length} {orderItems.length === 1 ? 'producto' : 'productos'}
              </span>
            </div>
            <span className="cotizador-aside__total-label">{aside.totalLabel}</span>
            <span
              className="cotizador-aside__total-value"
              aria-live="polite"
              data-testid="summary-price-value"
            >
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
          <OnlineDiscountPreview offer={aside.previewOffer ?? null} testId="aside-online-discount-preview" />
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
