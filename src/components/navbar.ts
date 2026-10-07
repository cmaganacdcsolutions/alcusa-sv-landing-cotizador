// Comportamiento del navbar fijo (spec navbar-fijo-estructura-inco §5, §7, §8, §10).
// Sin listener de scroll: estado scrolled por sentinela (IntersectionObserver).
// Reemplaza el script de Drawer.astro: scrollToHash + "mismo path sin hash => tope".

const KBD_FIELDS = 'input:not([type=radio]):not([type=checkbox]):not([type=button]):not([type=submit]):not([type=range]), textarea, select';
const MOBILE_MQ = '(max-width: 1023.98px)';
const SPY_SECTIONS: Record<string, string> = {
  catalogo: 'catalogo',
  ventanas: 'catalogo',
  'puertas-de-jardin': 'catalogo',
  'puertas-de-bano': 'catalogo',
  promociones: 'promociones',
};

function reduceMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function scrollToHash(hash: string): void {
  const target = document.getElementById(decodeURIComponent(hash.slice(1)));
  if (target) {
    target.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
  } else {
    window.location.hash = hash;
  }
}

function initScrolled(nav: HTMLElement): void {
  const sentinel = document.querySelector('[data-nav-sentinel]');
  if (!sentinel || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(
    ([entry]) => {
      nav.dataset.scrolled = entry.isIntersecting ? 'false' : 'true';
    },
    { threshold: 0 },
  ).observe(sentinel);
}

function initKeyboard(nav: HTMLElement): void {
  const mobile = window.matchMedia(MOBILE_MQ);
  let timer: number | undefined;
  const set = (hidden: boolean) => {
    nav.dataset.kbd = hidden ? 'true' : 'false';
    if (hidden) document.documentElement.style.setProperty('--nav-offset', '0px');
    else document.documentElement.style.removeProperty('--nav-offset');
  };
  document.addEventListener('focusin', (e) => {
    if (!mobile.matches) return;
    const el = e.target as Element | null;
    if (!el?.matches?.(KBD_FIELDS)) return;
    window.clearTimeout(timer);
    set(true);
  });
  document.addEventListener('focusout', (e) => {
    const el = e.target as Element | null;
    if (!el?.matches?.(KBD_FIELDS)) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const active = document.activeElement;
      if (active?.matches?.(KBD_FIELDS) && mobile.matches) return;
      set(false);
    }, 150);
  });
}

function initScrollSpy(nav: HTMLElement): void {
  if (window.location.pathname !== '/' || !('IntersectionObserver' in window)) return;
  const links = new Map<string, HTMLAnchorElement>();
  nav.querySelectorAll<HTMLAnchorElement>('[data-nav-link]').forEach((a) => links.set(a.dataset.navLink ?? '', a));
  const sections = Object.keys(SPY_SECTIONS)
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => !!el);
  const visible = new Set<HTMLElement>();
  let current: string | null = null;
  const apply = () => {
    const first = sections.find((s) => visible.has(s));
    const key = first ? SPY_SECTIONS[first.id] : null;
    if (key === current) return;
    current = key;
    links.forEach((a, id) => {
      if (id === key) a.setAttribute('aria-current', 'true');
      else if (a.getAttribute('aria-current') === 'true') a.removeAttribute('aria-current');
    });
    const active = key ? links.get(key) : null;
    const scroller = nav.querySelector<HTMLElement>('.nav__list');
    if (active && scroller && scroller.scrollWidth > scroller.clientWidth) {
      const left = active.offsetLeft - (scroller.clientWidth - active.offsetWidth) / 2;
      scroller.scrollTo({ left, behavior: reduceMotion() ? 'auto' : 'smooth' });
    }
  };
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => (e.isIntersecting ? visible.add(e.target as HTMLElement) : visible.delete(e.target as HTMLElement)));
      apply();
    },
    { rootMargin: '-128px 0px -55% 0px' },
  );
  sections.forEach((s) => io.observe(s));
}

function initDropdown(nav: HTMLElement): void {
  const chev = nav.querySelector<HTMLButtonElement>('[data-nav-chev]');
  const menu = nav.querySelector<HTMLElement>('[data-nav-menu]');
  if (!chev || !menu) return;
  const item = chev.closest<HTMLElement>('.nav__item');
  const items = () => Array.from(menu.querySelectorAll<HTMLAnchorElement>('a'));
  let hoverTimer: number | undefined;
  const isOpen = () => chev.getAttribute('aria-expanded') === 'true';
  const open = (focusFirst = false) => {
    chev.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
    if (focusFirst) items()[0]?.focus();
  };
  const close = (returnFocus = false) => {
    chev.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
    if (returnFocus) chev.focus();
  };
  chev.addEventListener('click', () => (isOpen() ? close() : open()));
  chev.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      open(true);
    }
  });
  menu.addEventListener('keydown', (e) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    }
  });
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  item?.addEventListener('pointerenter', () => {
    if (!finePointer.matches) return;
    window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => open(), 120);
  });
  item?.addEventListener('pointerleave', () => {
    if (!finePointer.matches) return;
    window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => close(), 120);
  });
  item?.addEventListener('focusout', (e) => {
    if (!item.contains(e.relatedTarget as Node | null)) close();
  });
  document.addEventListener('click', (e) => {
    if (isOpen() && !item?.contains(e.target as Node)) close();
  });
  menu.addEventListener('click', () => close());
}

function initLinks(): void {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!link) return;
    if (link.target && link.target !== '_self') return;
    if (link.origin !== window.location.origin || link.pathname !== window.location.pathname) return;
    if (link.hash) {
      if (!document.getElementById(decodeURIComponent(link.hash.slice(1)))) return;
      event.preventDefault();
      window.history.replaceState(null, '', link.hash);
      scrollToHash(link.hash);
      return;
    }
    if (link.search) return;
    event.preventDefault();
    window.scrollTo({ top: 0, left: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
  });
}

function init(): void {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  if (!nav) return;
  initScrolled(nav);
  initKeyboard(nav);
  initLinks();
  if (nav.dataset.variant === 'full') {
    initScrollSpy(nav);
    initDropdown(nav);
  }
}

init();
