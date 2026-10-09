// Mejora progresiva del catalogo del inicio (spec home-catalogo-completo §5). Sin React.
// Sin JS: el <form method="get"> ya lleva al cotizador con las opciones (un <select> nativo por opcion).
// Con JS: al cambiar un select se actualiza su circulo de color/vidrio, la nota "Cotizacion personalizada"
// y la foto (escalera de variantes). El enlace al cotizador lo arma el propio formulario al enviarse.
import { PRODUCT_CONFIGS, type Choices } from '@content/catalogHome';
import { defaultFinishOf, pickVariant } from '@content/home-media';
import { ambientThumbSrc } from '../../lib/photo-ambient';

document.documentElement.setAttribute('data-js', '');

type Field = HTMLSelectElement | HTMLInputElement;

/** Motion 02: motion.client.ts pone html[data-motion] solo con no-preference, sin ?motion=off y con IntersectionObserver. */
const motionOn = (): boolean => document.documentElement.hasAttribute('data-motion');

function readChoices(form: HTMLFormElement): Choices {
  const out: Choices = {};
  form.querySelectorAll<Field>('select[data-group], input[type=hidden][data-group]').forEach((el) => {
    const g = el.dataset.group as keyof Choices | undefined;
    if (g) out[g] = el.value;
  });
  return out;
}

/** Refleja el valor del <select> (fuente de verdad) en su circulo, nota y combobox. */
function syncFields(form: HTMLFormElement): void {
  form.querySelectorAll<HTMLSelectElement>('select[data-group]').forEach((select) => {
    const option = select.selectedOptions[0];
    if (!option) return;
    const field = select.closest<HTMLElement>('.pcard__field');
    const sw = option.dataset.sw;
    if (sw) {
      field?.querySelectorAll<HTMLElement>('[data-sw-chip]').forEach((chip) => {
        // Motion 02 E4: el circulo elegido se asienta (a/b alternan para reiniciar la animacion sin reflow).
        if (motionOn() && chip.getAttribute('data-sw') !== sw) chip.dataset.pop = chip.dataset.pop === 'a' ? 'b' : 'a';
        chip.setAttribute('data-sw', sw);
      });
    }
    const note = field?.querySelector<HTMLElement>('[data-note]');
    if (note) note.hidden = !option.hasAttribute('data-custom');
    // Combobox: texto del boton y aria-selected de la lista.
    const text = field?.querySelector<HTMLElement>('[data-value-text]');
    const options = [...(field?.querySelectorAll<HTMLElement>('.pcard__opt') ?? [])];
    const chosen = options.find((o) => o.dataset.value === select.value);
    if (text && chosen) text.textContent = chosen.dataset.text ?? chosen.textContent;
    options.forEach((o) => o.setAttribute('aria-selected', o === chosen ? 'true' : 'false'));
  });
}

/**
 * Combobox select-only (WAI-ARIA APG): el foco se queda en el boton y la opcion activa se anuncia con
 * aria-activedescendant. Escribe en el <select> nativo y dispara `change` (el formulario hace el resto).
 */
function initCombo(field: HTMLElement): void {
  const select = field.querySelector<HTMLSelectElement>('select[data-group]');
  const trigger = field.querySelector<HTMLButtonElement>('[data-trigger]');
  const list = field.querySelector<HTMLElement>('[data-list]');
  if (!select || !trigger || !list) return;
  const options = [...list.querySelectorAll<HTMLElement>('.pcard__opt')];
  let active = 0;
  let typed = '';
  let typedTimer = 0;
  const isOpen = (): boolean => trigger.getAttribute('aria-expanded') === 'true';
  const selectedIndex = (): number => Math.max(0, options.findIndex((o) => o.dataset.value === select.value));

  const setActive = (i: number): void => {
    active = Math.min(options.length - 1, Math.max(0, i));
    options.forEach((o, n) => (n === active ? o.setAttribute('data-active', '') : o.removeAttribute('data-active')));
    trigger.setAttribute('aria-activedescendant', options[active].id);
    options[active].scrollIntoView({ block: 'nearest' });
  };
  // Abre hacia arriba si abajo no cabe (y arriba si); si aun asi se sale, desplaza la pagina lo justo.
  const place = (): void => {
    list.removeAttribute('data-placement');
    const t = trigger.getBoundingClientRect();
    const h = list.getBoundingClientRect().height;
    const below = window.innerHeight - t.bottom - 8;
    const above = t.top - 72; // 72 = navbar fijo
    if (h > below && above > below) list.setAttribute('data-placement', 'top');
    const r = list.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 8) window.scrollBy({ top: r.bottom - window.innerHeight + 12 });
    else if (r.top < 72) window.scrollBy({ top: r.top - 80 });
  };
  const open = (index = selectedIndex()): void => {
    if (isOpen()) {
      setActive(index);
      return;
    }
    list.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    setActive(index);
    place();
  };
  const close = (): void => {
    if (!isOpen()) return;
    list.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    options.forEach((o) => o.removeAttribute('data-active'));
  };
  const commit = (i: number): void => {
    const value = options[i]?.dataset.value;
    if (value !== undefined && value !== select.value) {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
  const typeahead = (key: string): void => {
    window.clearTimeout(typedTimer);
    typed += key.toLowerCase();
    typedTimer = window.setTimeout(() => {
      typed = '';
    }, 600);
    // Una letra repetida avanza a la siguiente coincidencia; varias letras refinan desde la actual.
    const from = isOpen() ? active : selectedIndex();
    const shift = typed.length > 1 ? 0 : 1;
    const hit = options.map((_o, n) => (n + from + shift) % options.length).find((n) => (options[n].dataset.text ?? '').toLowerCase().startsWith(typed));
    if (hit !== undefined) open(hit);
  };
  const isChar = (e: KeyboardEvent): boolean => e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;

  trigger.addEventListener('click', () => {
    trigger.focus(); // Safari no enfoca los botones al hacer clic: sin foco no hay teclado (Esc, flechas)
    if (isOpen()) close();
    else open();
  });
  trigger.addEventListener('blur', () => close());
  trigger.addEventListener('keydown', (e) => {
    const k = e.key;
    if (!isOpen()) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') {
        e.preventDefault();
        open();
      } else if (k === 'Home' || k === 'End') {
        e.preventDefault();
        open(k === 'Home' ? 0 : options.length - 1);
      } else if (isChar(e)) {
        e.preventDefault();
        typeahead(k);
      }
      return;
    }
    const step = (to: number): void => {
      e.preventDefault();
      setActive(to);
    };
    if (k === 'ArrowDown') step(active + 1);
    else if (k === 'ArrowUp' && !e.altKey) step(active - 1);
    else if (k === 'Home') step(0);
    else if (k === 'End') step(options.length - 1);
    else if (k === 'PageDown') step(active + 10);
    else if (k === 'PageUp') step(active - 10);
    else if (k === 'Enter' || k === ' ' || (k === 'ArrowUp' && e.altKey)) {
      e.preventDefault();
      commit(active);
      close();
    } else if (k === 'Escape') {
      e.preventDefault();
      close();
    } else if (k === 'Tab') {
      commit(active); // Tab selecciona la opcion activa y cierra; el foco sigue su camino
      close();
    } else if (isChar(e)) {
      e.preventDefault();
      typeahead(k);
    }
  });
  // La lista no roba el foco: el boton lo conserva.
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('.pcard__opt');
    if (!li) return;
    commit(options.indexOf(li));
    close();
    trigger.focus();
  });
  list.addEventListener('pointermove', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('.pcard__opt');
    if (li && e.pointerType === 'mouse' && options.indexOf(li) !== active) setActive(options.indexOf(li));
  });
  // Esc cierra aunque el foco no este en el boton.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      close();
      trigger.focus();
    }
  });
  // Toque/clic fuera de este combobox lo cierra (iOS no desenfoca el boton al tocar fuera).
  document.addEventListener('pointerdown', (e) => {
    if (isOpen() && !field.contains(e.target as Node)) close();
  });
  // La etiqueta visible lleva al combobox (el <select> oculto no recibe el clic).
  field.querySelector<HTMLElement>('[data-label]')?.addEventListener('click', (e) => {
    e.preventDefault();
    trigger.focus();
  });
}

interface VariantImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

// Motion 02 E4: cambio de acabado en curso por tarjeta (la foto nueva se asienta sobre la anterior).
const settling = new WeakMap<HTMLElement, () => void>();

/** Foto principal con transicion: la nueva entra encima (opacity/scale) y la anterior se retira al terminar. */
function settleImage(img: HTMLImageElement, image: VariantImage, card: HTMLElement): void {
  const next = img.cloneNode() as HTMLImageElement;
  next.removeAttribute('srcset');
  next.removeAttribute('fetchpriority');
  next.loading = 'eager';
  next.width = image.width;
  next.height = image.height;
  next.alt = image.alt;
  next.src = image.src;
  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    settling.delete(card);
    next.classList.remove('mo-swap');
    img.remove();
  };
  next.addEventListener('animationend', finish, { once: true });
  settling.set(card, finish);
  // decode() antes de insertar: la entrada nunca arranca con la foto a medio cargar. Si falla, corte directo.
  next
    .decode()
    .then(() => {
      if (done) return;
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      next.classList.add('mo-swap');
      img.after(next);
    })
    .catch(() => {
      if (done) return;
      img.src = image.src;
      img.width = image.width;
      img.height = image.height;
      img.alt = image.alt;
      done = true;
      settling.delete(card);
    });
}

function setPhoto(card: HTMLElement, image: VariantImage): void {
  // Capa ambiental: la miniatura horneada de la foto (sin blur en vivo, BUG-1008-01). Sin miniatura
  // derivable, la capa queda sin imagen y se ve el color solido de token.
  settling.get(card)?.(); // cambio rapido: cierra la transicion anterior de inmediato (queda una sola foto)
  const baked = ambientThumbSrc(image.src);
  card.querySelectorAll<HTMLImageElement>('.photo-frame img').forEach((img) => {
    const isAmbient = img.classList.contains('photo-frame__ambient');
    const target = isAmbient ? baked : image.src;
    if (img.getAttribute('src') === (target ?? null)) return;
    if (!isAmbient && motionOn() && !img.classList.contains('photo-frame__img--cover') && !img.hasAttribute('aria-hidden')) {
      settleImage(img, image, card);
      return;
    }
    img.removeAttribute('srcset');
    if (isAmbient) {
      if (target) img.src = target;
      else img.removeAttribute('src');
      img.classList.toggle('photo-frame__ambient--baked', Boolean(baked));
      return; // la ambiental no lleva width/height: el CSS la dimensiona al 120% del marco.
    }
    img.src = image.src;
    img.width = image.width;
    img.height = image.height;
    if (!img.getAttribute('aria-hidden')) img.alt = image.alt;
  });
}

/** Motion 02 E4: al primer pointerenter/focusin de la tarjeta se precargan sus variantes (la entrada nunca espera la red). */
function preloadVariants(card: HTMLElement, variants: Record<string, VariantImage>): void {
  let warmed = false;
  const warm = (): void => {
    if (warmed || !motionOn()) return;
    warmed = true;
    Object.values(variants).forEach((v) => {
      const pre = new Image();
      pre.decoding = 'async';
      pre.src = v.src;
    });
  };
  card.addEventListener('pointerenter', warm, { once: true });
  card.addEventListener('focusin', warm, { once: true });
}

function initForm(form: HTMLFormElement): void {
  const config = PRODUCT_CONFIGS[form.dataset.config ?? ''];
  if (!config) return;
  const card = form.closest<HTMLElement>('.pcard');
  const variants: Record<string, VariantImage> = form.dataset.variants ? JSON.parse(form.dataset.variants) : {};
  const cover: VariantImage | undefined = form.dataset.cover ? JSON.parse(form.dataset.cover) : undefined;
  const defaultFinish = defaultFinishOf(config);
  if (card && Object.keys(variants).length > 0) preloadVariants(card, variants);
  const refresh = (): void => {
    const choices = readChoices(form);
    syncFields(form);
    // Escalera (la misma pura que usa el servidor): variante exacta (color + vidrio|acabado) -> mismo color con el
    // vidrio/acabado por defecto del producto -> portada.
    const image = card && Object.keys(variants).length > 0 ? (pickVariant(variants, choices, defaultFinish) ?? cover) : undefined;
    if (card && image) setPhoto(card, image);
  };
  form.addEventListener('change', () => refresh());
  // bfcache / Atras / recarga: los select nativos conservan la seleccion; resincroniza.
  window.addEventListener('pageshow', () => refresh());
  refresh();
}

function initTabs(): void {
  const tabs = document.querySelector<HTMLElement>('[data-ctabs]');
  if (!tabs || !('IntersectionObserver' in window)) return;
  const links = new Map<string, HTMLAnchorElement>();
  tabs.querySelectorAll<HTMLAnchorElement>('[data-tab]').forEach((a) => links.set(a.dataset.tab ?? '', a));
  const visible = new Set<string>();
  const firstId = [...links.keys()][0];
  const list = tabs.querySelector<HTMLElement>('.ctabs__list');
  // La lista centra con justify-content:center: si desborda (390 px) el borde izquierdo queda inalcanzable
  // ("Ventanas" cortada). Con desborde se alinea al inicio y se parte de scrollLeft = 0.
  const fitList = (): void => {
    if (!list) return;
    list.style.justifyContent = '';
    if (list.scrollWidth > list.clientWidth + 1) list.style.justifyContent = 'flex-start';
    if (!document.querySelector('.ctabs__link[aria-current="true"]')) list.scrollLeft = 0;
  };
  fitList();
  window.addEventListener('resize', fitList);
  const setActive = (active: string | null): void => {
    links.forEach((a, id) => (id === active ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
  };
  const lastVisible = (): string | null => [...links.keys()].filter((id) => visible.has(id)).pop() ?? null;
  // Arriba de la primera seccion (portada) queda activa la primera pestana; mas abajo del catalogo, ninguna.
  const current = (): string | null => {
    const id = lastVisible();
    if (id) return id;
    const first = firstId ? document.getElementById(firstId) : null;
    return first && first.getBoundingClientRect().top > 0 ? firstId : null;
  };
  let locked = false;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id)));
      // Gana la ULTIMA seccion visible en la franja: al aterrizar por un clic, la seccion anterior aun roza el borde
      // superior de la franja (isIntersecting con area 0) y con .find() ganaba ella: el boton nuevo no se encendia.
      if (locked) return; // scroll por clic en curso: no parpadear por las secciones intermedias
      setActive(current());
    },
    { rootMargin: '-128px 0px -55% 0px' },
  );
  links.forEach((_a, id) => {
    const s = document.getElementById(id);
    if (s) io.observe(s);
  });
  setActive(current());
  // Anclas: foco al encabezado de la seccion.
  tabs.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('[data-tab]');
    const h = a && document.getElementById(`${a.dataset.tab}-t`);
    // Resaltado inmediato al hacer clic (el observador lo confirma al terminar el scroll).
    if (a) {
      setActive(a.dataset.tab ?? null);
      // Pausa el observador hasta que termine el scroll suave (scrollend; con respaldo por tiempo).
      locked = true;
      let timer = 0;
      const unlock = (): void => {
        window.clearTimeout(timer);
        window.removeEventListener('scrollend', unlock);
        locked = false;
        setActive(a.dataset.tab ?? current());
      };
      window.addEventListener('scrollend', unlock, { once: true });
      timer = window.setTimeout(unlock, 1200);
    }
    if (h) window.setTimeout(() => h.focus({ preventScroll: true }), 0);
  });
}

document.querySelectorAll<HTMLFormElement>('form[data-config]').forEach(initForm);
document.querySelectorAll<HTMLElement>('.pcard__field').forEach(initCombo);
initTabs();
