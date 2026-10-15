import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { colorToken } from '../support/tokens';

// Cromo del sitio (pedido 2026-10-06): fondo azul noche continuo en TODAS las paginas, navbar y footer sobre noche,
// sin banner "Compra YA!" en el navbar (quitado 2026-10-14), sin telefono en el navbar, titulos con degradado (+ respaldos).

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

test.describe('navbar sin banner "Compra YA!" (quitado 2026-10-14)', () => {
  for (const width of [390, 1920]) {
    test(`sin "Compra YA"/"10%"/oferta=online10 y sin desborde horizontal a ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const nav = page.locator('header[data-nav]');
      await expect(nav.locator('a[data-nav-deal], .nav__deal')).toHaveCount(0);
      await expect(nav).not.toContainText(/Compra YA|10\s*%|en línea/i);
      await expect(nav.locator('a[href*="oferta=online10"]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  }

  test('menu Catalogo: 7 items en orden con sus anclas', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const items = page.locator('header[data-nav] .nav__menu-link');
    await expect(items).toHaveText([
      'Puertas de baño',
      'Puertas de jardín',
      'Ventanas',
      'Espejos',
      'Zarandas',
      'Fachadas comerciales',
      'Ver todo el catálogo',
    ]);
    await expect(items).toHaveCount(7);
    const hrefs = await items.evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs).toEqual([
      '/#puertas-de-bano',
      '/#puertas-de-jardin',
      '/#ventanas',
      '/#espejos',
      '/#zarandas',
      '/#fachadas-comerciales',
      '/#catalogo',
    ]);
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
      for (const required of ['logo', 'contacto', 'whatsapp', 'cotizar']) expect(names).toContain(required);
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
    for (const n of ['2278-2460', '2563-7742', '2208-4101']) {
      const tel = `tel:+503${n.replace('-', '')}`;
      await expect(page.locator(`footer a[href="${tel}"]`)).toHaveCount(1);
      await expect(page.locator(`footer a[href="${tel}"]`)).toHaveText(n);
      await expect(page.locator(`main a[href="${tel}"]`).first()).toBeAttached();
    }
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
    await page.emulateMedia({ reducedMotion: 'no-preference' }); // el e2e corre con 'reduce' (transition 0.001ms): la lectura sincrona de fill en forced-colors queda a medio transicionar (BUG-1009-02)
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
    await expect(page.getByRole('heading', { level: 2, name: 'Quiénes somos' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Misión' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Valores' })).toBeVisible();
    // ComoFunciona.astro renderiza <section id="proceso" class="proceso">; tambien se descarta un #como-funciona.
    await expect(page.locator('#proceso, .proceso, #como-funciona')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /c[oó]mo funciona|cotiza paso a paso/i })).toHaveCount(0);
    // En el inicio sigue estando.
    await page.goto('/');
    await expect(page.locator('section#proceso')).toHaveCount(1);
  });

  // Contenido oficial de Alcusa (2026-10-14): textual, sin placeholders, con las 2 fotos del taller y sin noindex.
  test('/nosotros: contenido oficial (valores, mision, vision, lema), fotos del taller, sin pendiente ni noindex', async ({ page }) => {
    await page.goto('/nosotros');
    await expect(page.locator('main')).not.toContainText(/pendiente/i);
    await expect(page.locator('main')).toContainText('Más de 39 años transformando espacios con calidad, confianza e innovación.');
    const titles = ['Calidad', 'Compromiso', 'Innovación', 'Responsabilidad', 'Honestidad', 'Trabajo en equipo', 'Orientación al cliente'];
    await expect(page.locator('#valores .nos__vt')).toHaveText(titles);
    await expect(page.locator('#mision p.nos__p')).toHaveCount(2);
    await expect(page.locator('#vision p.nos__p')).toHaveCount(2);
    await expect(page.locator('#mision')).toContainText('Brindar soluciones innovadoras, funcionales y de alta calidad');
    await expect(page.locator('#mision')).toContainText('respaldada por más de 39 años de trayectoria');
    await expect(page.locator('#vision')).toContainText('Ser la empresa líder y referente en El Salvador');
    await expect(page.locator('#vision')).toContainText('llevando las soluciones de ALCUSA a más hogares, empresas y proyectos');
    await expect(page.locator('#historia')).toContainText('Aluminios Cuscatlán, S.A. de C.V.');
    await expect(page.locator('head meta[name="robots"]')).toHaveCount(0);
    const photos = page.locator('main .nos__photo img');
    await expect(photos).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const img = photos.nth(i);
      await img.scrollIntoViewIfNeeded();
      await expect(img).toHaveAttribute('alt', /\S/);
      await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
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
      const tabs = ['puertas-de-bano', 'puertas-de-jardin', 'ventanas', 'espejos', 'zarandas', 'fachadas-comerciales'];
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
      await page.emulateMedia({ reducedMotion: 'no-preference' }); // el e2e corre con 'reduce' por defecto (motion 02): aqui se mide el hover real
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
    // La regla global de movimiento reducido fija transition-duration: 0.001ms (1e-6 s); con 'transition: none' en cada
    // boton no queda propiedad animada. Se exige < 1 ms, nunca los 160 ms del hover normal.
    for (const sel of ['.ctabs__link', '.hintro__link', '.proceso__help-btn', '.site-footer__whatsapp']) {
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

test.describe('footer: sin pagos, acordeon Productos y telefonos', () => {
  const PRODUCTOS: Array<[string, string]> = [
    ['Puertas de baño', '/#puertas-de-bano'],
    ['Puertas de jardín', '/#puertas-de-jardin'],
    ['Ventanas', '/#ventanas'],
    ['Espejos', '/#espejos'],
    ['Zarandas', '/#zarandas'],
    ['Fachadas comerciales', '/#fachadas-comerciales'],
  ];

  test('sin "Formas de pago", Wompi ni textos pendientes', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer.site-footer');
    await expect(footer).not.toContainText(/Formas de pago|Wompi|pendiente|\[contenido/i);
  });

  test('"Productos" abierto por defecto con los 6 enlaces en orden; colapsa/expande con Enter y Espacio', async ({ page }) => {
    await page.goto('/');
    const acc = page.locator('footer details.site-footer__acc');
    const summary = acc.locator('summary');
    await expect(acc).toHaveAttribute('open', '');
    await expect(summary).toHaveText('Productos');
    const links = acc.locator('a');
    await expect(links).toHaveText(PRODUCTOS.map(([l]) => l));
    expect(await links.evaluateAll((els) => els.map((e) => e.getAttribute('href')))).toEqual(PRODUCTOS.map(([, h]) => h));
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(acc).not.toHaveAttribute('open', '');
    await page.keyboard.press('Space');
    await expect(acc).toHaveAttribute('open', '');
    await page.keyboard.press('Enter');
    await expect(acc).not.toHaveAttribute('open', '');
  });

  test('sin desborde horizontal a 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/', '/contacto']) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), path).toBe(true);
    }
  });

  test('/contacto lista los 3 telefonos fijos y el celular/WhatsApp', async ({ page }) => {
    await page.goto('/contacto');
    const info = page.getByTestId('contacto-info-list');
    for (const n of ['2278-2460', '2563-7742', '2208-4101']) {
      await expect(info.getByRole('link', { name: n, exact: true })).toHaveAttribute('href', `tel:+503${n.replace('-', '')}`);
    }
    await expect(info).toContainText('Celular / WhatsApp');
    await expect(info).toContainText('7680-2410');
  });
});
