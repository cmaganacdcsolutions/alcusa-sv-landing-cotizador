import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { colorToken } from '../support/tokens';

// Cromo del sitio (pedido 2026-10-06): fondo azul noche continuo en TODAS las paginas, navbar y footer sobre noche,
// CTA ambar "Compra YA!" en el navbar, sin telefono en el navbar, titulos con degradado (+ respaldos).

const DEAL_NAME = 'Compra YA! 10% de descuento al hacer tu compra en línea';
const DEAL_HREF = '/cotizador?oferta=online10'; // la oferta llega ya aplicada al cotizador
const NIGHT = 'rgb(10, 26, 51)'; // --color-surface-dark
const NIGHT_RAISED = 'rgb(15, 37, 72)'; // --color-surface-dark-raised
const PAGE_BOTTOM = 'rgb(7, 19, 38)'; // --color-page-bottom
const WHITE = 'rgb(255, 255, 255)';
const ACCENT_ON_DARK = '--color-accent-on-dark'; // token: se resuelve a rgb() en cada test (no se fija el hex)
const WA_HOVER = 'rgb(6, 96, 60)'; // --color-whatsapp-strong-hover
const HOVER_DUR_S = 0.16; // --hover-dur

interface Box {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

async function navBoxes(page: Page): Promise<Box[]> {
  return page.evaluate(() => {
    const pick: Array<[string, string]> = [
      ['logo', '.nav__logo'],
      ['deal', '.nav__deal'],
      ['catalogo', '[data-nav-link="catalogo"]'],
      ['chev', '[data-nav-chev]'],
      ['promociones', '[data-nav-link="promociones"]'],
      ['nosotros', '[data-nav-link="nosotros"]'],
      ['contacto', '[data-nav-link="contacto"]'],
      ['whatsapp', '.nav__wa'],
      ['cotizar', '.nav__cta'],
    ];
    const out: Box[] = [];
    for (const [name, sel] of pick) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      out.push({ name, x: r.x, y: r.y, w: r.width, h: r.height });
    }
    return out;
  });
}

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

test.describe('navbar sobre azul noche', () => {
  test('fondo noche, texto blanco y aro de foco claro', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('header.nav');
    await expect(nav).toHaveCSS('background-color', NIGHT);
    await expect(page.locator('.nav__brand')).toHaveCSS('color', WHITE);
    const link = page.locator('.nav__link').first();
    await expect(link).toHaveCSS('color', WHITE);
    await page.keyboard.press('Tab'); // modalidad teclado (el aro es :focus-visible)
    await link.focus();
    await expect(link).toBeFocused();
    expect(await link.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
    const ring = await link.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring).toContain('rgb(255, 255, 255)');
  });

  test('en /cotizador (variante compacta) tambien es noche', async ({ page }) => {
    await page.goto('/cotizador');
    await expect(page.locator('header.nav')).toHaveCSS('background-color', NIGHT);
    await expect(page.locator('.nav__back')).toHaveCSS('color', WHITE);
  });
});

test.describe('CTA "Compra YA!" del navbar', () => {
  for (const width of [390, 1440]) {
    test(`visible, enlaza a /cotizador?oferta=online10, nombre accesible completo y sin desborde a ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const deal = page.locator('a[data-nav-deal]');
      await expect(deal).toBeVisible();
      await expect(deal).toHaveAttribute('href', DEAL_HREF);
      await expect(page.locator('.nav__cta')).toHaveAttribute('href', '/cotizador'); // el boton Cotizar no lleva la oferta
      await expect(deal).toHaveAccessibleName(DEAL_NAME);
      await expect(page.getByRole('link', { name: DEAL_NAME })).toBeVisible();
      // Acento ambar con tinta noche (AAA 9.5:1).
      await expect(deal).toHaveCSS('background-color', 'rgb(255, 176, 32)');
      await expect(deal).toHaveCSS('color', NIGHT);
      const box = await deal.boundingBox();
      expect(box).not.toBeNull();
      if (!box) return;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
      expect(noOverflow).toBe(true);
      // Responsivo: chip corto en movil; texto completo (todo visible) en escritorio ancho.
      const visibleParts = await page.evaluate(() => {
        const w = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().width ?? 0;
        return { x1: w('.nav__deal-x1'), x2: w('.nav__deal-x2') };
      });
      if (width === 390) {
        expect(visibleParts.x1).toBeLessThanOrEqual(1);
        expect(visibleParts.x2).toBeLessThanOrEqual(1);
      } else {
        expect(visibleParts.x1).toBeGreaterThan(20);
        expect(visibleParts.x2).toBeGreaterThan(20);
      }
    });
  }

  test('el item de promo llega al cotizador', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[data-nav-deal]').click();
    // El cotizador puede consumir y limpiar ?oferta=online10 de la URL; lo que se exige aqui es llegar a /cotizador.
    await expect(page).toHaveURL(/\/cotizador\/?(\?.*)?$/);
  });
});

test.describe('navbar sin telefono y sin superposiciones', () => {
  for (const width of [390, 1024, 1280, 1440]) {
    test(`a ${width}px: no hay enlace tel: y los items no se solapan`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.locator('header.nav a[href^="tel:"]')).toHaveCount(0);
      const boxes = await navBoxes(page);
      const names = boxes.map((b) => b.name);
      for (const required of ['logo', 'deal', 'contacto', 'whatsapp', 'cotizar']) expect(names).toContain(required);
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          if (!a || !b) continue;
          // El chevron del menu Catalogo se superpone 10 px sobre el padding del enlace a proposito (diseno vigente).
          if (new Set([a.name, b.name]).size === 2 && [a.name, b.name].sort().join() === 'catalogo,chev') continue;
          expect(overlaps(a, b), `${a.name} se solapa con ${b.name}`).toBe(false);
        }
      }
      // Ningun item sobresale del borde derecho del viewport salvo el scroller movil (<1024).
      if (width >= 1024) {
        for (const b of boxes) expect(b.x + b.w, `${b.name} fuera del viewport`).toBeLessThanOrEqual(width);
      }
    });
  }

  test('el telefono sigue en el footer y en /contacto', async ({ page }) => {
    await page.goto('/contacto');
    await expect(page.locator('footer a[href="tel:+50322782460"]')).toHaveCount(1);
    await expect(page.locator('main a[href^="tel:"]').first()).toBeAttached();
  });
});

test.describe('titulos con degradado', () => {
  test('h1 del inicio: background-clip:text, relleno transparente y degradado blanco -> acento', async ({ page }) => {
    await page.goto('/');
    const h1 = page.locator('.hintro__title');
    const cs = await h1.evaluate((el) => {
      const s = getComputedStyle(el);
      return { clip: s.backgroundClip, img: s.backgroundImage, fill: s.getPropertyValue('-webkit-text-fill-color'), color: s.color };
    });
    expect(cs.clip).toBe('text');
    expect(cs.img).toContain('linear-gradient');
    expect(cs.img).toContain('rgb(255, 255, 255)');
    expect(cs.img).toContain(await colorToken(page, ACCENT_ON_DARK));
    expect(cs.fill).toBe('rgba(0, 0, 0, 0)');
    // Respaldo solido claro (si el recorte no existe).
    expect(cs.color).toBe(WHITE);
  });

  test('los titulos de seccion comparten el degradado (catalogo, proceso, promos/confianza/info)', async ({ page }) => {
    await page.goto('/');
    for (const sel of ['.csec__title', '.proceso__title', '.proceso__step-title', '.confianza__title', '.info__title']) {
      const el = page.locator(sel).first();
      await expect(el, sel).toHaveCSS('background-clip', 'text');
      const img = await el.evaluate((n) => getComputedStyle(n).backgroundImage);
      expect(img, sel).toContain('linear-gradient');
    }
  });

  test('clase reutilizable .title-gradient', async ({ page }) => {
    await page.goto('/cotizador');
    const res = await page.evaluate(() => {
      const h = document.createElement('h1');
      h.className = 'title-gradient';
      h.textContent = 'Titulo de prueba';
      document.body.appendChild(h);
      const s = getComputedStyle(h);
      return { clip: s.backgroundClip, img: s.backgroundImage, fill: s.getPropertyValue('-webkit-text-fill-color') };
    });
    expect(res.clip).toBe('text');
    expect(res.img).toContain('linear-gradient');
    expect(res.fill).toBe('rgba(0, 0, 0, 0)');
  });

  test('respaldos: @supports sin background-clip y forced-colors', async ({ page }) => {
    await page.goto('/');
    const rules = await page.evaluate(() => {
      const found = { supportsNot: false, forced: false };
      const walk = (list: CSSRuleList): void => {
        for (const r of Array.from(list)) {
          if (r instanceof CSSSupportsRule && /not/.test(r.conditionText) && /background-clip/.test(r.conditionText)) found.supportsNot = true;
          if (r instanceof CSSMediaRule && /forced-colors/.test(r.conditionText)) found.forced = true;
          if ('cssRules' in r) walk((r as CSSGroupingRule).cssRules);
        }
      };
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          walk(sheet.cssRules);
        } catch {
          /* hoja de otro origen */
        }
      }
      return found;
    });
    expect(rules.supportsNot).toBe(true);
    expect(rules.forced).toBe(true);
    await page.emulateMedia({ forcedColors: 'active' });
    const h1 = page.locator('.hintro__title');
    await expect(h1).toHaveCSS('background-image', 'none');
    const fill = await h1.evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-text-fill-color'));
    expect(fill).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('seleccion legible: texto oscuro sobre azul claro', async ({ page }) => {
    await page.goto('/');
    const sel = await page.locator('.hintro__title').evaluate((el) => {
      const s = getComputedStyle(el, '::selection');
      return { bg: s.backgroundColor, fill: s.getPropertyValue('-webkit-text-fill-color'), color: s.color };
    });
    expect(sel.bg).toBe(await colorToken(page, ACCENT_ON_DARK));
    expect([sel.fill, sel.color]).toContain(NIGHT);
  });
});

// El recorrido del fondo (diagonal anclada al viewport) se verifica en bg-diagonal.spec.ts.
test.describe('fondo continuo en todo el sitio', () => {
  for (const path of ['/', '/cotizador', '/contacto', '/nosotros']) {
    test(`${path}: degradado azul noche en el body, texto base claro y sin hueco bajo el contenido`, async ({ page }) => {
      await page.goto(path);
      const body = await page.evaluate(() => {
        const s = getComputedStyle(document.body);
        return { img: s.backgroundImage, color: s.backgroundColor, text: s.color, repeat: s.backgroundRepeat, h: document.body.getBoundingClientRect().height, vh: window.innerHeight };
      });
      expect(body.img).toContain('linear-gradient');
      expect(body.color).toBe(PAGE_BOTTOM);
      expect(body.text).toBe(WHITE);
      expect(body.repeat).toBe('no-repeat');
      expect(body.h).toBeGreaterThanOrEqual(body.vh - 1);
      await expect(page.locator('html')).toHaveCSS('background-color', PAGE_BOTTOM);
    });
  }
});

test.describe('/nosotros y Visitanos sobre noche', () => {
  test('/nosotros: titulos con degradado y tarjetas en superficie noche elevada', async ({ page }) => {
    await page.goto('/nosotros');
    await expect(page.locator('.nos__h1')).toHaveCSS('background-clip', 'text');
    await expect(page.locator('.nos__h2').first()).toHaveCSS('background-clip', 'text');
    await expect(page.locator('.nos__card').first()).toHaveCSS('background-color', NIGHT_RAISED);
    await expect(page.locator('.nos__btn')).toHaveCSS('color', NIGHT);
  });

  // Pedido del usuario: /nosotros cuenta la historia, los valores y la mision de Alcusa; "Como funciona" vive solo en el inicio.
  test('/nosotros: historia, mision y valores; sin la seccion "Como funciona" (esa va en el inicio)', async ({ page }) => {
    await page.goto('/nosotros');
    for (const id of ['historia', 'mision', 'valores']) await expect(page.locator(`main #${id}`), id).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 2, name: 'Nuestra historia' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Misión' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Valores' })).toBeVisible();
    // ComoFunciona.astro renderiza <section id="proceso" class="proceso">; tambien se descarta un #como-funciona.
    await expect(page.locator('#proceso, .proceso, #como-funciona')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /c[oó]mo funciona|cotiza paso a paso/i })).toHaveCount(0);
    // En el inicio sigue estando.
    await page.goto('/');
    await expect(page.locator('section#proceso')).toHaveCount(1);
  });

  // Horario confirmado por Alcusa: Visitanos ya no lleva el placeholder "[contenido Alcusa — pendiente]".
  // Visitanos se monta hoy solo en /contacto; en / se valida igual si algun dia aparece (#visitanos).
  for (const path of ['/', '/contacto']) {
    test(`${path}: #visitanos muestra el horario real y ningun "pendiente"`, async ({ page }) => {
      await page.goto(path);
      const visit = page.locator('#visitanos');
      const count = await visit.count();
      if (path === '/contacto') expect(count).toBe(1);
      expect(count).toBeLessThanOrEqual(1);
      if (count === 0) return;
      await expect(visit.locator('.visit__hours span')).toHaveText([
        'Lunes a viernes: 7:30 a. m. – 5:00 p. m.',
        'Sábados: 7:00 a. m. – 12:00 m.',
        'Domingos: cerrado',
      ]);
      await expect(visit).not.toContainText(/pendiente/i);
    });
  }

  test('/contacto: la seccion Visitanos va en superficie noche con titulo degradado', async ({ page }) => {
    await page.goto('/contacto');
    await expect(page.locator('.visit__inner')).toHaveCSS('background-color', NIGHT_RAISED);
    await expect(page.locator('.visit__title')).toHaveCSS('background-clip', 'text');
    await expect(page.locator('.visit__kicker')).toHaveCSS('color', await colorToken(page, ACCENT_ON_DARK));
  });

  test('footer sobre noche, texto claro', async ({ page }) => {
    await page.goto('/nosotros');
    const footer = page.locator('footer.site-footer');
    await expect(footer).toHaveCSS('color', 'rgb(201, 211, 227)');
    await expect(footer.locator('.site-footer__head').first()).toHaveCSS('color', WHITE);
  });
});

test.describe('pestanas de categoria', () => {
  for (const width of [390, 1440]) {
    test(`a ${width}px: tras el clic el boton queda resaltado al instante y al terminar el scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const tabs = ['ventanas', 'puertas-de-jardin', 'puertas-de-bano'];
      for (const id of tabs) {
        await page.locator(`[data-tab="${id}"]`).click();
        await expect(page.locator(`[data-tab="${id}"]`)).toHaveAttribute('aria-current', 'true');
        await page.waitForTimeout(1600); // scroll suave + pausa del observador
        for (const other of tabs) {
          const link = page.locator(`[data-tab="${other}"]`);
          if (other === id) await expect(link).toHaveAttribute('aria-current', 'true');
          else await expect(link).not.toHaveAttribute('aria-current', 'true');
        }
        const top = await page.locator(`#${id}`).evaluate((el) => el.getBoundingClientRect().top);
        expect(top).toBeLessThan(200);
        expect(top).toBeGreaterThan(-5);
      }
    });
  }
});

// El hover solo existe con puntero fino (@media (hover:hover) and (pointer:fine)). Los proyectos moviles emulan puntero
// grueso sin importar el ancho: ahi se afirma lo contrario (sin hover pegajoso) en vez de saltar la prueba.
const hasFineHover = (page: Page): Promise<boolean> => page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches);

const durations = (page: Page, sel: string): Promise<number[]> =>
  page
    .locator(sel)
    .first()
    .evaluate((el) => getComputedStyle(el).transitionDuration.split(',').map((d) => parseFloat(d)));

test.describe('hover de botones (como el navbar: color/relleno, sin movimiento)', () => {
  test('1440: la pestana cambia de fondo con puntero fino (tactil: no); el CTA ambar cambia; sin transform', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const fine = await hasFineHover(page);
    const tab = page.locator('.ctabs__link:not([aria-current="true"])').first();
    const before = await tab.evaluate((el) => getComputedStyle(el).backgroundColor);
    await tab.hover();
    if (fine) {
      await expect(tab).toHaveCSS('background-color', NIGHT_RAISED);
      expect(before).not.toBe(NIGHT_RAISED);
    } else {
      await expect(tab).toHaveCSS('background-color', before);
    }
    await expect(tab).toHaveCSS('transform', 'none');
    const deal = page.locator('a[data-nav-deal]');
    await deal.hover();
    await expect(deal).toHaveCSS('background-color', 'rgb(255, 194, 71)');
    await expect(deal).toHaveCSS('transform', 'none');
  });

  // `hover`: un color rgb() literal o el nombre de un token (`--...`), que se resuelve en el navegador.
  const REST: Array<{ path: string; sel: string; hover: string }> = [
    { path: '/', sel: '.hintro__link', hover: NIGHT_RAISED },
    { path: '/', sel: '.proceso__help-btn', hover: WA_HOVER },
    { path: '/nosotros', sel: '.nos__btn', hover: ACCENT_ON_DARK },
    { path: '/nosotros', sel: '.site-footer__whatsapp', hover: WA_HOVER },
    { path: '/nosotros', sel: '.site-footer__nav a', hover: NIGHT_RAISED },
    { path: '/contacto', sel: '.visit__list a', hover: NIGHT },
  ];
  for (const c of REST) {
    test(`${c.path} ${c.sel}: relleno suave con puntero fino, sin transform ni sombra nueva`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(c.path);
      const fine = await hasFineHover(page);
      const el = page.locator(c.sel).first();
      const before = await el.evaluate((n) => ({ bg: getComputedStyle(n).backgroundColor, shadow: getComputedStyle(n).boxShadow }));
      await el.hover();
      if (fine) {
        await expect(el).toHaveCSS('background-color', c.hover.startsWith('--') ? await colorToken(page, c.hover as `--${string}`) : c.hover);
        expect((await durations(page, c.sel)).every((d) => d === HOVER_DUR_S)).toBe(true);
      } else {
        await expect(el).toHaveCSS('background-color', before.bg);
      }
      await expect(el).toHaveCSS('transform', 'none');
      await expect(el).toHaveCSS('box-shadow', before.shadow);
    });
  }

  test('con movimiento reducido no hay transform ni transicion (en el navbar y en el resto del area)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const deal = page.locator('a[data-nav-deal]');
    await deal.hover();
    await expect(deal).toHaveCSS('transform', 'none');
    // La regla global de movimiento reducido fija transition-duration: 0.001ms (1e-6 s); con 'transition: none' en cada
    // boton no queda propiedad animada. Se exige < 1 ms, nunca los 160 ms del hover normal.
    for (const sel of ['a[data-nav-deal]', '.ctabs__link', '.hintro__link', '.proceso__help-btn', '.site-footer__whatsapp']) {
      const ds = await durations(page, sel);
      expect(
        ds.every((d) => d < 0.001),
        `${sel}: ${ds.join(',')}`,
      ).toBe(true);
    }
  });
});

test.describe('contraste AA sobre noche (enlaces sin clase y texto base)', () => {
  for (const path of ['/', '/nosotros', '/contacto']) {
    test(`${path}: axe color-contrast sin violaciones`, async ({ page }) => {
      await page.goto(path);
      await page.addStyleTag({ content: '* { animation: none !important; transition: none !important; }' });
      const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      const summary = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')} :: ${n.failureSummary?.split('\n')[1] ?? ''}`));
      expect(summary).toEqual([]);
    });
  }
});
