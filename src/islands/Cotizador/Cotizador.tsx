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
import '@styles/cotizador-banner.css';
import '@styles/cotizador-motion.css';
import { CATALOG_PRODUCTS } from '@content/catalog';
import { parseDeepLink, parseDeepLinkOptions, wantsMedidas } from '@content/deepLink';
import { getZoneFee } from '@engine/pricing';
import { isAddressComplete } from '../../lib/delivery-address';
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
import { buildOrderItems, depositOf, orderTotal as computeOrderTotal } from './state/order';
import {
  IconArrowRight,
  IconCheck,
  IconChevronLeft,
  IconWhatsApp,
} from './icons';
import Step0Producto from './steps/Step0Producto';
import { PROMO_PARAM } from '@content/promotionsParser';
import { PROMO_BANNER_PREFIX, PROMO_EXIT_LABEL, promoIdFromSearch } from '@content/promoContext';
import { clearStash, hasWork, readStash, writeStash, type WorkStash } from './state/stash';
import { hydratePromoRegistry, lookupActivePromo, lookupPromo } from './state/promoRegistry';
import { usePriceTick } from './usePriceTick';
import { LazyStep, usePreloadLaterSteps, Step1Medidas, Step2Precio, Step3ZonaEntrega, Step4Resumen } from './steps/lazySteps';

const STEP_LABELS: Record<CotizadorStep, string> = {
  producto: 'Producto',
  medidas: 'Medidas',
  precio: 'Precio',
  zonaEntrega: 'Entrega',
  resumen: 'Resumen',
};

// El cotizador termina en el Resumen: 5 pasos (recorte de alcance 2026-10-13, sin pagos en la web).
const MOBILE_STEPPER_STEPS: readonly CotizadorStep[] = STEP_ORDER;
const MOBILE_STEPPER_LAST_VISIBLE_IDX = 4; // 'resumen' — index of the last step that still shows the mobile stepper

// Desktop-only rail (nav): every STEP_ORDER entry with a title + one-line sub-label, unlike the
// mobile stepper (ios/android never show these sub-labels).
const RAIL_ITEMS: Record<CotizadorStep, { title: string; sub: string }> = {
  producto: { title: 'Elige tu producto', sub: 'Categoría, tipo y acabado' },
  medidas: { title: 'Medidas y acabado', sub: 'Ancho, alto y vidrio' },
  precio: { title: 'Precio estimado', sub: 'En vivo, sin transporte' },
  zonaEntrega: { title: 'Entrega y zona', sub: 'Instalación o retiro en tienda' },
  resumen: { title: 'Resumen', sub: 'Uno o varios productos' },
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
};

// sf-cot-mobile item 4 — the id of the heading each step should scroll/focus
// into view on transition. Steps 0-3 own a per-step <h3> (step0-heading …
// step3-heading, each already `tabIndex={-1}` for programmatic focus);
// resumen renders no sub-heading of their own (see
// the PAGE_TITLES comment above) so the shared page <h2> is the target.
const HEADING_ID: Record<CotizadorStep, string> = {
  producto: 'step0-heading',
  medidas: 'step1-heading',
  precio: 'step2-heading',
  zonaEntrega: 'step3-heading',
  resumen: 'cotizador-page-title',
};

function stepFromHash(hash: string): CotizadorStep | null {
  // Strip a fragment query.
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
  /**
   * null on resumen: desktop draws the CTAs (PDF quote / WhatsApp advisor) ONLY in
   * this aside, never in the main content column — Step4Resumen owns the
   * message logic (per-product WhatsApp text, PDF share) so it still renders their own copy of the same control
   * for the mobile bottom-bar (ios/android boards draw it there instead),
   * then `createPortal` a second, real, identically-wired copy into this
   * card's `.cotizador-aside__ctas` mount point (via the `asideCtaTarget`
   * prop) when running at >=1024px. CSS hides whichever copy doesn't match
   * the current breakpoint (see `.cotizador__mobile-only-ctas` /
   * `.cotizador-aside` display:none rules) so exactly one is ever visible —
   * `getByRole` locators (which only match elements in the accessibility
   * tree, i.e. not display:none) resolve to that one without scoping.
   */
  ctas: ReactElement | null;
}

// S7 — sessionStorage persistence for the cart under its own key: a reload
// mid-flow shouldn't lose already-committed items. The rest of the wizard
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
  usePreloadLaterSteps();
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
  // Portal mount for the resumen aside CTAs — see the AsideView.ctas
  // comment below and Step4Resumen's `asideCtaTarget` prop.
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

  // ADR-014 add.2: el registro de promos se hidrata desde /api/promotions.json antes del efecto de arranque
  // si la entrada depende de una promo (?promo= o snapshot); si no, en segundo plano.
  const [registryReady, setRegistryReady] = useState(false);
  useEffect(() => {
    const needsPromo =
      promoIdFromSearch(window.location.search) !== null ||
      (readWizardSnapshot()?.promoId ?? null) !== null;
    const hydrating = hydratePromoRegistry();
    if (!needsPromo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only read of location/storage (no SSR access)
      setRegistryReady(true);
      return;
    }
    let live = true;
    void hydrating.then(() => {
      if (live) setRegistryReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const initialHash = window.location.hash;
    if (!registryReady) return;
    const initial = stepFromHash(initialHash);
    if (initial) dispatch({ type: 'GOTO_STEP', step: initial });

    // `?oferta=online10` (link viejo del navbar): ya no existe la oferta; se abre el cotizador normal y se limpia el parametro.
    if (new URLSearchParams(window.location.search).has('oferta')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('oferta');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
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
    // eligible; a fresh deep-link arrival and a folio return win instead.
    const storedSnapshot = readWizardSnapshot();
    // Contexto de la URL de entrada: `?promo=<id>` vigente y con reglaje, o normal. Un snapshot solo se
    // restaura si su contexto coincide (promo A != promo B != normal): si no, flujo fresco.
    const urlPromo = lookupActivePromo(promoIdFromSearch(window.location.search));
    const restoring =
      storedSnapshot !== null &&
      (storedSnapshot.promoId ?? null) === (urlPromo?.id ?? null) &&
      shouldRestoreWizard({
        hasFolio: !!folio,
        search: window.location.search,
        hashStep: initial,
        navigation: readNavigationType(),
      });
    // Trabajo en curso de OTRO contexto + entrada fresca por `?promo=`: no se pierde, se aparta (stash) y se avisa.
    if (urlPromo && !folio && !restoring) {
      const work = { cart: loadPersistedCart(), snapshot: storedSnapshot };
      if (hasWork(work.cart, work.snapshot)) {
        // Re-ejecucion del efecto (StrictMode): el snapshot ya pudo limpiarse; no pisar un stash completo.
        if (work.snapshot || !readStash()) writeStash(work);
        setStashed(readStash());
      }
    }
    if (storedSnapshot && restoring) {
      const fields = restoreFields(storedSnapshot, initial);
      dispatch({ type: 'RESTORE_WIZARD', fields });
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#cotizador/${STEP_SLUGS[fields.step]}`,
      );
    } else {
      clearWizardSnapshot(); // stale or unusable: never leak it into a fresh flow
    }

    // Entrada por promo (fresca): bloquea el wizard al reglaje de la promo. Con restore el snapshot ya trae el
    // mismo contexto. Un id invalido/vencido se ignora y se limpia de la URL (flujo normal).
    if (urlPromo && !folio && !restoring) dispatch({ type: 'ENTER_PROMO', promo: urlPromo });
    if (!urlPromo && promoIdFromSearch(window.location.search)) {
      const url = new URL(window.location.href);
      url.searchParams.delete(PROMO_PARAM);
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }

    // A restored wizard skips the priced preset (it would reset the product).
    {
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
  }, [registryReady]);

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
    const scrollToHeading = (heading: HTMLElement): void => {
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
    };
    // El paso puede ser un chunk diferido que aun no monta su titulo: se espera a que aparezca.
    const found = document.getElementById(headingId);
    if (found) {
      scrollToHeading(found);
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    const waiting = new MutationObserver(() => {
      const el = document.getElementById(headingId);
      if (!el) return;
      waiting.disconnect();
      scrollToHeading(el);
    });
    waiting.observe(root, { childList: true, subtree: true });
    return () => waiting.disconnect();
  }, [state.step]);

  // sf-cot-mobile item 1 — .bottom-bar's real rendered height (it differs per
  // step and now needs to be exact since the bar is `position: fixed` on
  // mobile, see cotizador.css), measured live instead of the old worst-case
  // 136px magic number. Overridden as an inline custom property (wins the
  // cascade over the :root fallback in cotizador.css, which still covers the
  // instant before this effect's first run). Steps with no bottom bar at all
  // (producto) get 0 — no bar to clear.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Los pasos 1-7 son chunks diferidos: al cambiar de paso la barra puede aun no existir.
    // Se mide al aparecer (MutationObserver) y se vuelve a medir si cambia de tamano.
    let resize: ResizeObserver | null = null;
    let measured: HTMLElement | null = null;
    const measure = () => {
      const bar = root.querySelector<HTMLElement>('.bottom-bar');
      if (bar === measured) return;
      resize?.disconnect();
      measured = bar;
      if (!bar) {
        root.style.setProperty('--cotizador-bottom-bar-height', '0px');
        return;
      }
      const update = () =>
        root.style.setProperty('--cotizador-bottom-bar-height', `${bar.getBoundingClientRect().height}px`);
      update();
      resize = new ResizeObserver(update);
      resize.observe(bar);
    };
    measure();
    const mutations = new MutationObserver(measure);
    mutations.observe(root, { childList: true, subtree: true });
    return () => {
      mutations.disconnect();
      resize?.disconnect();
    };
  }, [state.step]);

  const product = useMemo(
    () => CATALOG_PRODUCTS.find((p) => p.id === state.productId) ?? null,
    [state.productId],
  );

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
  // item promo y reinicia el wizard en normal: precios regulares).
  function recoverStash(): void {
    if (!stashed) return;
    const fields = stashed.snapshot ? restoreFields(stashed.snapshot, null) : null;
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
  // (T7.2) regardless of item count. This is what Resumen must
  // show as "the total".
  // sf-cot-s7gaps gap 2 — 'zonaEntrega' is included here too: when it's
  // reopened via Resumen's "Cambiar" with 2+ items already in the cart, its
  // breakdown must total the whole order, not just the current item.
  const orderItems = useMemo(() => buildOrderItems(state, CATALOG_PRODUCTS), [state]);
  const isOrderPhase =
    state.step === 'zonaEntrega' ||
    state.step === 'resumen';
  const orderTotalValue =
    orderItems.length > 0 ? computeOrderTotal(orderItems, zoneFee ?? 0) : null;
  // Sin direccion completa no se muestra un total con envio: "Por confirmar".
  const total = isOrderPhase ? (addressOk ? orderTotalValue : null) : singleItemTotal;

  const showSummaryColumn = !!product && state.step !== 'producto';

  const currentIdx = STEP_ORDER.indexOf(state.step);
  const isFirstStep = currentIdx <= (promo ? 1 : 0);
  // Mobile stepper (.step-rail-wrap) spans every step (the last one is 'resumen').
  const showMobileStepper = currentIdx <= MOBILE_STEPPER_LAST_VISIBLE_IDX;

  // --- Desktop rail (kicker + "Paso N de M" + progress bar + item list) ---
  const railIdx = STEP_ORDER.indexOf(state.step);
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
  // "Conocida" = retiro, o zona de cobertura elegida con direccion completa.
  const zoneKnown =
    state.entrega === 'retiro' || (addressOk && state.zone !== '' && getZoneFee(state.zone) !== undefined);
  const transporteDetail =
    state.entrega === 'retiro'
      ? 'Retiro en tienda'
      : zoneKnown
        ? state.zone
        : 'Zona por confirmar';
  const transportePrice =
    state.entrega === 'retiro'
      ? 'Sin costo'
      : zoneKnown
        ? `$${(zoneFee ?? 0).toFixed(2)}`
        : 'Por confirmar';
  const depositAmount = total !== null ? depositOf(total) : 0;
  const balanceAmount = total !== null ? Math.round((total - depositAmount) * 100) / 100 : 0;
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
      const note =
        state.entrega === 'retiro'
          ? 'Retiro en tienda · 15% de descuento aplicado.'
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
        ],
        showDeposit: false,
        ctas: (
          <>
            {siguiente(!zoneKnown)}
            {cotizarWhatsApp}
          </>
        ),
      };
    } else if (state.step === 'resumen') {
      aside = {
        totalLabel: 'Total estimado',
        totalValue: totalText,
        note: 'Incluye transporte, cobrado 1 vez por pedido.',
        // S7 — every cart+current item, one row each, then the single
        // order-level transport row (never one row per item — T7.2).
        items: [
          ...orderItems.map((it) => ({
            name: it.name,
            detail: it.detail,
            price: it.requiresQuote ? 'Por WhatsApp' : `$${it.subtotal.toFixed(2)}`,
          })),
          { name: 'Transporte', detail: transporteDetail, price: transportePrice },
        ],
        showDeposit: total !== null,
        ctas: null, // resumen: the real CTAs portal in from Step4Resumen — see the AsideView.ctas comment above.
      };
    }
  }

  const priceRef = usePriceTick(aside?.totalValue ?? ''); // motion 02 E6: realce del total al cambiar

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
              const itemState =
                index < railIdx
                  ? 'done'
                  : index === railIdx
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
        {promo && (
          <div className="cotizador-banner" data-testid="promo-banner" data-state="info" role="status">
            <p className="cotizador-banner__text">
              <strong>{`${PROMO_BANNER_PREFIX} ${promo.title}`}</strong>
              {` · $${promo.price.toFixed(promo.price % 1 === 0 ? 0 : 2)} instalada en San Salvador y Santa Tecla (otras zonas suman su envío).`}
            </p>
            <button type="button" className="btn btn-secondary" data-testid="promo-exit" onClick={exitPromo}>
              {PROMO_EXIT_LABEL}
            </button>
          </div>
        )}
        {stashed && (
          <div className="cotizador-banner" data-testid="stash-banner" data-state="info" role="status">
            <p className="cotizador-banner__text">
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
          <LazyStep>
            <Step1Medidas
              product={product}
              state={state}
              dispatch={dispatch}
              quote={quote}
              onNext={next}
            />
          </LazyStep>
        )}
        {state.step === 'precio' && product && (
          <LazyStep>
            <Step2Precio
              product={product}
              state={state}
              quote={quote}
              onNext={next}
              onEditMedidas={() => goToStep('medidas')}
            />
          </LazyStep>
        )}
        {state.step === 'zonaEntrega' && product && (
          <LazyStep>
            <Step3ZonaEntrega
              product={product}
              state={state}
              quote={quote}
              items={orderItems}
              zoneFee={zoneFee}
              total={total}
              onEntregaChange={(entrega) => dispatch({ type: 'SET_ENTREGA', entrega })}
              onAddressChange={(field, value) => dispatch({ type: 'SET_ADDRESS_FIELD', field, value })}
              onGeoChange={(geo) => dispatch({ type: 'SET_ADDRESS_GEO', geo })}
              onNext={next}
            />
          </LazyStep>
        )}
        {state.step === 'resumen' && product && (
          <LazyStep>
            <Step4Resumen
              product={product}
              state={state}
              items={orderItems}
              zoneFee={zoneFee}
              total={total}
              onEditZone={() => goToStep('zonaEntrega')}
              onAddAnother={addToCart}
              onRemoveItem={removeItem}
              onEditItem={editItem}
              onDismissQuoteNotice={() => dispatch({ type: 'DISMISS_QUOTE_NOTICE' })}
              asideCtaTarget={portalCtaEl}
            />
          </LazyStep>
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
              ref={priceRef}
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
          {aside.showDeposit && (
            <div className="cotizador-aside__deposit">
              <div className="cotizador-aside__deposit-row">
                <span>Anticipo 80%</span>
                <span>${depositAmount.toFixed(2)}</span>
              </div>
              <div className="cotizador-aside__deposit-row">
                <span>Saldo 20% contra entrega</span>
                <span>${balanceAmount.toFixed(2)}</span>
              </div>
            </div>
          )}
          {aside.ctas && <div className="cotizador-aside__ctas">{aside.ctas}</div>}
          {state.step === 'resumen' && (
            <div className="cotizador-aside__ctas" ref={setPortalCtaEl} />
          )}
        </aside>
      )}
    </div>
  );
}
