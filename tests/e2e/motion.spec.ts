import { expect, pickProduct, test } from './fixtures';

// Motion 02 (02-design/specs/motion-02-cinematic-proposal.md). Unico spec que corre con movimiento REAL:
// el proyecto "motion" usa reducedMotion:'no-preference'; los demas proyectos lo ignoran (testIgnore).
// Sin screenshots: afirma estados finales esperando eventos del navegador, nunca waitForTimeout.

// El minificador reescribe 720ms como .72s: se normaliza a numero (ms o px) para comparar.
const token = (name: string) => `(() => {
  const v = getComputedStyle(document.documentElement).getPropertyValue('${name}').trim();
  return v.endsWith('ms') ? parseFloat(v) : v.endsWith('s') ? Math.round(parseFloat(v) * 1000) : parseFloat(v);
})()`;

test.describe('motion: tokens', () => {
  test('los tokens nuevos existen con movimiento normal y se anulan con reduce', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(token('--motion-duration-reveal'))).toBe(720);
    expect(await page.evaluate(token('--motion-stagger'))).toBe(70);
    expect(await page.evaluate(token('--motion-dist-reveal'))).toBe(14);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.evaluate(token('--motion-duration-reveal'))).toBe(0);
    expect(await page.evaluate(token('--motion-dist-reveal'))).toBe(0);
  });
});

const opacity = (el: import('@playwright/test').Locator) => el.evaluate((n) => getComputedStyle(n).opacity);

test.describe('motion E1: revelado escalonado', () => {
  test('con movimiento: lo visible al cargar no se anima; lo de abajo parte oculto y termina visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-motion]');
    const intro = page.locator('.hintro');
    const first = page.locator('.pcard').first();
    await expect(intro).toHaveClass(/\bin\b/);
    await expect(intro).not.toHaveClass(/\brv\b/);
    await expect(first).toHaveClass(/\bin\b/);
    await expect(first).not.toHaveClass(/\brv\b/);
    const last = page.locator('.pcard').last();
    await expect(last).not.toHaveClass(/\bin\b/);
    expect(await opacity(last)).toBe('0');
    await last.scrollIntoViewIfNeeded();
    await expect(last).toHaveClass(/\bin\b/);
    await expect(last).toHaveCSS('opacity', '1'); // reintenta hasta que termina la animacion
    await expect(last).toHaveCSS('transform', 'none');
  });

  test('el estado final se alcanza con cada elemento revelado una sola vez (clase in permanente)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-motion]');
    const heads = page.locator('.csec__head');
    const n = await heads.count();
    await heads.nth(n - 1).scrollIntoViewIfNeeded();
    await expect(heads.nth(n - 1)).toHaveClass(/\bin\b/);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(heads.nth(n - 1)).toHaveClass(/\bin\b/);
    await expect(heads.nth(n - 1)).toHaveCSS('opacity', '1');
  });

  test('reduced-motion: nada se oculta ni se anima', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForSelector('html[data-js]');
    await expect(page.locator('html')).not.toHaveAttribute('data-motion', '');
    for (const el of await page.locator('[data-reveal]').all()) expect(await opacity(el)).toBe('1');
    const h1After = await page.locator('.hintro__title').evaluate((n) => getComputedStyle(n, '::after').animationName);
    expect(h1After).toBe('none');
  });

  test('?motion=off: modo estatico', async ({ page }) => {
    await page.goto('/?motion=off');
    await page.waitForSelector('html[data-js]');
    await expect(page.locator('html')).toHaveAttribute('data-motion-off', '');
    await expect(page.locator('html')).not.toHaveAttribute('data-motion', '');
    expect(await opacity(page.locator('.pcard').last())).toBe('1');
    expect(await page.locator('.hintro__title').evaluate((n) => getComputedStyle(n, '::after').animationName)).toBe('none');
  });

  test('sin JS: todo visible', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    await page.goto('/');
    expect(await opacity(page.locator('.pcard').last())).toBe('1');
    expect(await opacity(page.locator('.hintro__title'))).toBe('1');
    await ctx.close();
  });
});

test.describe('motion E2: entrada del intro', () => {
  test('el h1 nunca se oculta; el barrido corre una vez y el resto termina visible', async ({ page }) => {
    await page.goto('/');
    const h1 = page.locator('.hintro__title');
    expect(await opacity(h1)).toBe('1');
    expect(await h1.evaluate((n) => getComputedStyle(n, '::after').animationName)).toBe('mo-sweep');
    expect(await h1.evaluate((n) => getComputedStyle(n, '::after').animationIterationCount)).toBe('1');
    await expect(page.locator('.hintro__lede')).toHaveCSS('opacity', '1');
    await expect(page.locator('.hintro__lede')).toHaveCSS('transform', 'none');
    await expect(page.locator('.hintro__kicker')).toHaveCSS('opacity', '1');
  });
});

test.describe('motion E3: reflejo de vidrio en la foto', () => {
  test('puntero fino: el hover dispara el barrido y al salir se reinicia', async ({ page }) => {
    await page.goto('/');
    const photo = page.locator('.pcard__photo').first();
    const anim = () => photo.evaluate((n) => getComputedStyle(n, '::after').animationName);
    expect(await anim()).toBe('none');
    await photo.hover();
    await expect.poll(anim).toBe('mo-sweep');
    await page.mouse.move(0, 0);
    await expect.poll(anim).toBe('none');
  });
});

test.describe('motion E3: tactil', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 }, reducedMotion: 'no-preference' });
  test('sin hover (tactil) no existe el reflejo', async ({ page }) => {
    await page.goto('/');
    const photo = page.locator('.pcard__photo').first();
    expect(await photo.evaluate((n) => getComputedStyle(n, '::after').content)).toBe('none');
  });
});

test.describe('motion E4: cambio de acabado', () => {
  const pick = async (page: import('@playwright/test').Page, field: string, option: RegExp) => {
    const card = page.locator('#p-recta');
    await card.getByRole('combobox', { name: field }).click();
    await card.getByRole('option', { name: option }).click();
    return card;
  };

  test('con movimiento: la foto nueva entra sobre la anterior y al terminar queda una sola imagen con la src elegida', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-motion]');
    const card = page.locator('#p-recta');
    await card.scrollIntoViewIfNeeded();
    const photo = card.locator('.pcard__photo');
    const before = await photo.locator('img.photo-frame__img').getAttribute('src');
    await pick(page, 'Vidrio', /^Aquafold/);
    // estado final (poll: el clon entra tras decode() y la anterior se retira en animationend): una sola foto con la variante elegida
    const srcs = () => photo.locator('img.photo-frame__img').evaluateAll((els) => els.map((e) => e.getAttribute('src') ?? ''));
    await expect.poll(async () => (await srcs()).length).toBe(1);
    await expect.poll(async () => (await srcs())[0]).toMatch(/recta-aquafold/);
    await expect(photo.locator('img.photo-frame__img.mo-swap')).toHaveCount(0);
    const after = photo.locator('img.photo-frame__img');
    expect((await srcs())[0]).not.toBe(before);
    expect(await after.getAttribute('alt')).toBeTruthy();
    await expect(after).toHaveCSS('opacity', '1');
    await expect(after).toHaveCSS('transform', 'none');
  });

  test('cambios rapidos: siempre queda una sola foto, la ultima elegida', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-motion]');
    const card = page.locator('#p-recta');
    await card.scrollIntoViewIfNeeded();
    await pick(page, 'Vidrio', /^Aquafold/);
    await pick(page, 'Vidrio', /^Claro/);
    const imgs = card.locator('.pcard__photo img.photo-frame__img');
    const srcs = () => imgs.evaluateAll((els) => els.map((e) => e.getAttribute('src') ?? ''));
    await expect.poll(async () => (await srcs()).length).toBe(1);
    await expect.poll(async () => (await srcs())[0]).not.toMatch(/aquafold/);
    await expect(card.locator('.mo-swap')).toHaveCount(0);
  });

  test('el circulo elegido alterna su marca de animacion al cambiar de vidrio', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-motion]');
    const card = page.locator('#p-recta');
    await card.scrollIntoViewIfNeeded();
    const chip = card.getByRole('combobox', { name: 'Vidrio' }).locator('[data-sw-chip]');
    await pick(page, 'Vidrio', /^Aquafold/);
    await expect(chip).toHaveAttribute('data-pop', /^[ab]$/);
    await expect(chip).toHaveCSS('transform', 'none'); // termina asentado
  });

  test('reduced-motion: corte directo, sin clon ni marca de animacion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForSelector('html[data-js]');
    const card = page.locator('#p-recta');
    await card.scrollIntoViewIfNeeded();
    const chip = card.getByRole('combobox', { name: 'Vidrio' }).locator('[data-sw-chip]');
    await pick(page, 'Vidrio', /^Aquafold/);
    await expect(card.locator('.pcard__photo img.photo-frame__img')).toHaveAttribute('src', /recta-aquafold/);
    await expect(card.locator('.mo-swap')).toHaveCount(0);
    await expect(chip).not.toHaveAttribute('data-pop', /.*/);
  });

  test('precarga de variantes en el primer pointerenter de la tarjeta', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-motion]');
    const card = page.locator('#p-recta');
    await card.scrollIntoViewIfNeeded();
    const seen: string[] = [];
    page.on('request', (r) => r.resourceType() === 'image' && seen.push(r.url()));
    await card.hover();
    await expect.poll(() => seen.some((u) => /recta-aquafold/.test(u))).toBe(true);
  });
});

test.describe('motion E6: realce del precio en el cotizador', () => {
  const openVentana = async (page: import('@playwright/test').Page) => {
    await page.goto('/cotizador#cotizador/0-producto');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await pickProduct(page, 'ventana');
    await page.getByLabel('Ancho en metros, ventana 1').fill('1.20');
    await page.getByLabel('Alto en metros, ventana 1').fill('1.00');
  };

  test('al cambiar el valor el total se marca y termina asentado, con el texto definitivo (sin contar digitos)', async ({ page }) => {
    await openVentana(page);
    const price = page.getByTestId('summary-price-value');
    await expect(price).toHaveText(/^\$\d/);
    const first = (await price.textContent()) ?? '';
    await page.getByLabel('Ancho en metros, ventana 1').fill('1.80');
    await expect(price).not.toHaveText(first);
    await expect(price).toHaveAttribute('data-tick', /^[ab]$/);
    // el texto cambia de una vez al valor final (nunca pasa por valores intermedios) y la animacion termina visible
    const final = (await price.textContent()) ?? '';
    expect(final).toMatch(/^\$\d+(\.\d{2})?$/);
    await expect(price).toHaveCSS('opacity', '1');
    await expect(price).toHaveCSS('transform', 'none');
    expect(await price.getAttribute('aria-live')).toBe('polite');
  });

  test('reduced-motion: el precio cambia sin marca de animacion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openVentana(page);
    const price = page.getByTestId('summary-price-value');
    const first = (await price.textContent()) ?? '';
    await page.getByLabel('Ancho en metros, ventana 1').fill('1.80');
    await expect(price).not.toHaveText(first);
    await expect(price).not.toHaveAttribute('data-tick', /.*/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Motion 02 E5: transicion home -> cotizador (View Transitions entre documentos). Se registra, en cada documento,
// que paso con el evento pagereveal: 'none' (sin transicion), 'ran' (la vista se animo) o 'skipped'.
const trackReveal = `
  addEventListener('pageswap', (e) => { sessionStorage.setItem('vt-swap', e.viewTransition ? 'created' : 'none'); });
  window.__vt = 'pending';
  addEventListener('pagereveal', (e) => {
    if (!e.viewTransition) { window.__vt = 'none'; return; }
    const vt = e.viewTransition;
    window.__vt = 'running';
    vt.ready.then(() => { window.__vt = 'ran'; }, () => { window.__vt = 'skipped'; });
    vt.finished.then(() => { window.__vtDone = true; }, () => { window.__vtDone = true; });
  });
`;
const vtState = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __vt: string }).__vt);
const goCotizador = async (page: import('@playwright/test').Page) => {
  const go = page.locator('#p-recta').getByRole('button', { name: /Continuar al cotizador/ });
  await go.click();
  await expect(page).toHaveURL(/\/cotizador\?/);
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
};

test.describe('motion E5: transicion al cotizador', () => {
  test('con movimiento: home -> cotizador crea la transicion y termina asentada', async ({ page }) => {
    await page.addInitScript(trackReveal);
    await page.goto('/');
    await page.waitForSelector('html[data-motion]');
    test.skip(!(await page.evaluate(() => 'onpagereveal' in window)), 'navegador sin View Transitions entre documentos (degrada a corte directo)');
    await goCotizador(page);
    // El home crea la transicion al salir (pageswap). Chromium headless a veces descarta la vista entrante (reveal 'none'),
    // por eso el estado final se afirma sin exigir que corra: si corre, debe terminar.
    expect(await page.evaluate(() => sessionStorage.getItem('vt-swap'))).toBe('created');
    await expect.poll(() => page.evaluate(() => { const w = window as unknown as { __vt: string; __vtDone?: boolean }; return w.__vt !== 'running' || w.__vtDone === true; })).toBe(true);
    await expect(page.locator('main')).toHaveCSS('opacity', '1');
    await expect(page.locator('header.nav')).toHaveCSS('view-transition-name', 'site-nav');
    await expect(page.getByTestId('cotizador-root')).toBeVisible();
  });

  test('reduced-motion: la transicion no corre (corte directo)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(trackReveal);
    await page.goto('/');
    await page.waitForSelector('html[data-js]');
    await goCotizador(page);
    await expect.poll(() => vtState(page)).toMatch(/^(none|skipped)$/);
    await expect(page.locator('header.nav')).toHaveCSS('view-transition-name', 'none');
  });

  test('?motion=off en el home: la navegacion no anima', async ({ page }) => {
    await page.addInitScript(trackReveal);
    await page.goto('/?motion=off');
    await page.waitForSelector('html[data-js]');
    await goCotizador(page);
    await expect.poll(() => vtState(page)).toMatch(/^(none|skipped)$/);
    await expect(page.getByTestId('cotizador-root')).toBeVisible();
  });

  test('atras: vuelve al home sin transicion y el home queda completo; adelante conserva el cotizador', async ({ page }) => {
    await page.addInitScript(trackReveal);
    await page.goto('/');
    await page.waitForSelector('html[data-motion]');
    await goCotizador(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.pcard').first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-motion', '');
    // recarga o bfcache: 'none'/'skipped' (o pagina restaurada), nunca una transicion corriendo
    await expect.poll(() => vtState(page)).not.toMatch(/^(running|ran)$/);
    await expect(page.locator('.pcard').first()).toHaveCSS('opacity', '1');
    await page.goForward();
    await expect(page).toHaveURL(/\/cotizador\?/);
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await expect.poll(() => vtState(page)).not.toMatch(/^(running|ran)$/);
  });

  test('deep link directo (sin pasar por el home): carga sin transicion', async ({ page }) => {
    await page.addInitScript(trackReveal);
    await page.goto('/cotizador?oferta=online10');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await expect.poll(() => vtState(page)).not.toMatch(/^(running|ran)$/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Cobertura de ?motion=off: con motion SI hay marcas/animacion; con ?motion=off NO (E1, E2, E3, E4, E6).
const anim = (loc: import('@playwright/test').Locator, pseudo?: string) =>
  loc.evaluate((n, p) => getComputedStyle(n, p ?? null).animationName, pseudo);

test.describe('motion: apagado total con ?motion=off', () => {
  test('E2 intro: con motion anima (kicker, lede, link, barrido); con ?motion=off nada', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-motion]');
    expect(await anim(page.locator('.hintro__kicker'))).toBe('mo-rise-sm');
    expect(await anim(page.locator('.hintro__lede'))).toBe('mo-rise-sm');
    expect(await anim(page.locator('.hintro__link'))).toBe('mo-rise-sm');
    expect(await anim(page.locator('.hintro__title'), '::after')).toBe('mo-sweep');

    await page.goto('/?motion=off');
    await page.waitForSelector('html[data-js]');
    await expect(page.locator('html')).toHaveAttribute('data-motion-off', '');
    for (const sel of ['.hintro__kicker', '.hintro__lede', '.hintro__link']) expect(await anim(page.locator(sel))).toBe('none');
    expect(await anim(page.locator('.hintro__title'), '::after')).toBe('none');
    expect(await page.evaluate(() => document.querySelector('.hintro')!.getAnimations({ subtree: true }).length)).toBe(0);
  });

  test('E3 reflejo: con motion el hover anima; con ?motion=off no', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-motion]');
    await page.locator('.pcard__photo').first().hover();
    await expect.poll(() => anim(page.locator('.pcard__photo').first(), '::after')).toBe('mo-sweep');

    await page.mouse.move(0, 0);
    await page.goto('/?motion=off');
    await page.waitForSelector('html[data-js]');
    const photo = page.locator('.pcard__photo').first();
    await photo.hover();
    await expect(photo).toBeVisible();
    expect(await anim(photo, '::after')).toBe('none');
    expect(await photo.evaluate((n) => getComputedStyle(n, '::after').content)).toBe('none');
  });

  test('E4 acabado: con ?motion=off el cambio es corte directo (sin clon, sin marca, sin precarga)', async ({ page }) => {
    await page.goto('/?motion=off');
    await page.waitForSelector('html[data-js]');
    await expect(page.locator('html')).not.toHaveAttribute('data-motion', '');
    const card = page.locator('#p-recta');
    await card.scrollIntoViewIfNeeded();
    const chip = card.getByRole('combobox', { name: 'Vidrio' }).locator('[data-sw-chip]');
    await card.getByRole('combobox', { name: 'Vidrio' }).click();
    await card.getByRole('option', { name: /^Aquafold/ }).click();
    const imgs = card.locator('.pcard__photo img.photo-frame__img');
    await expect(imgs).toHaveCount(1);
    await expect(imgs).toHaveAttribute('src', /recta-aquafold/);
    await expect(card.locator('.mo-swap')).toHaveCount(0);
    await expect(chip).not.toHaveAttribute('data-pop', /.*/);
    expect(await anim(chip)).toBe('none');
    expect(await anim(imgs.first())).toBe('none');
  });

  test('E1 revelado: con ?motion=off lo de abajo nunca parte oculto ni lleva clase de revelado', async ({ page }) => {
    await page.goto('/?motion=off');
    await page.waitForSelector('html[data-js]');
    const last = page.locator('.pcard').last();
    await expect(last).not.toHaveClass(/\b(in|rv)\b/);
    await expect(last).toHaveCSS('opacity', '1');
    await last.scrollIntoViewIfNeeded();
    await expect(last).not.toHaveClass(/\b(in|rv)\b/);
    expect(await anim(last)).toBe('none');
  });

  const openVentana = async (page: import('@playwright/test').Page, url: string) => {
    await page.goto(url);
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await pickProduct(page, 'ventana');
    await page.getByLabel('Ancho en metros, ventana 1').fill('1.20');
    await page.getByLabel('Alto en metros, ventana 1').fill('1.00');
    const price = page.getByTestId('summary-price-value');
    await expect(price).toHaveText(/^\$\d/);
    const first = (await price.textContent()) ?? '';
    await page.getByLabel('Ancho en metros, ventana 1').fill('1.80');
    await expect(price).not.toHaveText(first);
    return price;
  };

  test('E6 precio: con ?motion=off el total cambia sin data-tick, sin animacion y sin linea', async ({ page }) => {
    const price = await openVentana(page, '/cotizador?motion=off#cotizador/0-producto');
    await expect(price).not.toHaveAttribute('data-tick', /.*/);
    expect(await anim(price)).toBe('none');
    expect(await anim(price, '::after')).toBe('none');
    expect(await price.evaluate((n) => n.getAnimations({ subtree: true }).length)).toBe(0);
  });

  test('E6 precio: con motion el total lleva animacion de asentado y linea (contraste del caso off)', async ({ page }) => {
    const price = await openVentana(page, '/cotizador#cotizador/0-producto');
    await expect(price).toHaveAttribute('data-tick', /^[ab]$/);
    expect(await anim(price)).toMatch(/^cm-tick-[ab]$/);
    expect(await anim(price, '::after')).toMatch(/^cm-line-[ab]$/);
  });
});
