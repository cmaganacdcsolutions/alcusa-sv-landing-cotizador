import { expect, test } from './fixtures';


// R3 (2026-09-30): el grid de catalogo, la galeria, el banner del cotizador y las anclas
// /#modelos /#galeria salieron de la landing. Estos casos se marcan fixme (NO se borran):
// los de catalogo/galeria se re-hospedan en /catalogo (slice R2); los de nav se reescriben
// contra el drawer/footer nuevos. Ver HANDOFF R3.
const R3_MOVED = new Set<string>(["\"Vidrios para puertas de baño\" swatches are visible on mobile", "(e) every catálogo card image renders the same box aspect ratio on desktop", "(f) Acabados finish swatches use real photos; \"Puerta de jardín\" shows the real garden-door photo", "(g) \"Proyectos reales\" header: alignment + kicker typography matches the desktop board", "(h) CotizadorTeaser: WhatsApp CTA + gradient sheen appear on desktop only", "catálogo card CTAs have no text underline in any state", "desktop product-list subtitle is 15px", "galería subtitle includes the swipe hint on mobile only", "kicker/lead/cta computed font sizes match the boards"]);
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => {
  test.fixme(R3_MOVED.has(info.title), 'R3: seccion fuera de la landing; migrar (ver HANDOFF R3)');
});

// sf-landing5 fidelity pass (2026-09-28 user review at iOS width): catálogo
// CTA underline, "Vidrios para puertas de baño" viewcards restored on
// mobile, the "Desliza para ver más." hint, CotizadorTeaser typography, and
// Footer content-parity with the boards. Runs across all 3 projects
// (ios390/android412/desktop1920) unless a test is scoped otherwise.

test.describe('landing5 — catálogo CTA underline', () => {
  test('catálogo card CTAs have no text underline in any state', async ({ page }) => {
    await page.goto('/');
    const cta = page.locator('.catalogo__card-cta').first();
    await expect(cta).toHaveCSS('text-decoration-line', 'none');
    await cta.hover();
    await expect(cta).toHaveCSS('text-decoration-line', 'none');
    await cta.focus();
    await expect(cta).toHaveCSS('text-decoration-line', 'none');
  });
});

test.describe('landing5 — bathroom-door glass viewcards', () => {
  test('"Vidrios para puertas de baño" swatches are visible on mobile', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === 'desktop1920',
      'covered by the desktop-specific fidelity below',
    );
    await page.goto('/');
    const block = page.locator('.catalogo__item--acabados');
    await block.scrollIntoViewIfNeeded();
    await expect(
      block.getByRole('heading', { name: 'Vidrios para puertas de baño' }),
    ).toBeVisible();
    for (const finish of ['Aquaclara', 'Frosted', 'Aquafold']) {
      await expect(block.getByText(finish, { exact: true })).toBeVisible();
    }
    // Mobile has no kicker/lead — only the desktop board draws those.
    await expect(block.getByText('Acabados', { exact: true })).toBeHidden();
    await expect(
      block.getByText('Elige tu vidrio al cotizar tu puerta de baño.'),
    ).toBeHidden();
  });
});

test.describe('landing5 — "Desliza para ver más"', () => {
  test('galería subtitle includes the swipe hint on mobile only', async ({
    page,
  }, testInfo) => {
    const subtitle = page.locator('.galeria__subtitle');
    const hint = page.locator('.galeria__subtitle-hint');
    await page.goto('/');
    // The hint is display:none on desktop, so scroll the always-visible
    // parent paragraph into view instead (a hidden element has no box to
    // scroll to and times out scrollIntoViewIfNeeded).
    await subtitle.scrollIntoViewIfNeeded();
    if (testInfo.project.name === 'desktop1920') {
      await expect(hint).toBeHidden();
    } else {
      await expect(hint).toBeVisible();
      await expect(hint).toHaveText(' Desliza para ver más.');
    }
  });
});

test.describe('landing5 — CotizadorTeaser typography', () => {
  // The h2 ("Conoce tu precio...") is intentionally NOT asserted here: per
  // Foreman (2026-09-28), font-size-h2-mobile/desktop are a project-wide
  // shared-token gap (should be ~30px/56px, board-correct) being fixed
  // centrally across every section, not per component — this component
  // keeps referencing those 2 tokens so it inherits that fix automatically.
  test('kicker/lead/cta computed font sizes match the boards', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    const section = page.locator('#cotizador');
    await section.scrollIntoViewIfNeeded();
    const kicker = section.locator('.cotizador-teaser__kicker');
    const lead = section.locator('.cotizador-teaser__lead');
    const cta = section.locator('.cotizador-teaser__cta');

    if (testInfo.project.name === 'desktop1920') {
      await expect(kicker).toHaveCSS('font-size', '14px');
      await expect(lead).toHaveCSS('font-size', '18px');
      await expect(cta).toHaveCSS('font-size', '17px');
    } else {
      await expect(kicker).toHaveCSS('font-size', '12px');
      await expect(lead).toHaveCSS('font-size', '16px');
      await expect(cta).toHaveCSS('font-size', '16px');
    }
  });

  test('desktop product-list subtitle is 15px', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop1920', 'product list is desktop-only');
    await page.goto('/');
    const subtitle = page.locator('.cotizador-teaser__product-subtitle').first();
    await subtitle.scrollIntoViewIfNeeded();
    await expect(subtitle).toHaveCSS('font-size', '15px');
  });
});

test.describe('landing5 — footer content parity with the boards', () => {
  test('mobile footer: exactly Inicio/Cotizar/Contacto, no NIT/handles/phones/Wompi note', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === 'desktop1920',
      'desktop has the fuller footer; see the next test',
    );
    await page.goto('/');
    const footer = page.locator('.site-footer');
    const navLinks = await footer
      .locator('.site-footer__nav a:visible')
      .allTextContents();
    expect(navLinks.map((t) => t.trim())).toEqual(['Inicio', 'Cotizar', 'Contacto']);

    await expect(footer.getByText('[NIT — confirmar]')).toHaveCount(0);
    await expect(footer.locator('.site-footer__handles')).toBeHidden();
    await expect(footer.locator('.site-footer__phones')).toBeHidden();
    await expect(footer.locator('.site-footer__wompi')).toBeHidden();
    await expect(footer.locator('.site-footer__col-title').first()).toBeHidden();
  });

  test('desktop footer: 5-link nav (R3) + handles + phones + Wompi/AMEX note', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop1920', 'desktop-only assertion');
    await page.goto('/');
    const footer = page.locator('.site-footer');
    const navLinks = await footer
      .locator('.site-footer__nav a:visible')
      .allTextContents();
    expect(navLinks.map((t) => t.trim())).toEqual([
      'Inicio',
      'Catálogo',
      'Cómo funciona',
      'Cotizar',
      'Contacto',
    ]);

    await expect(footer.getByText('@alcusasv · @alcusaes')).toBeVisible();
    await expect(
      footer.getByText('Teléfonos 2278-2460 · 2208-4101 · 2563-7742'),
    ).toBeVisible();
    await expect(
      footer.getByText('Pago con tarjeta vía Wompi · excepto American Express'),
    ).toBeVisible();
    await expect(footer.getByText('[NIT — confirmar]')).toHaveCount(0);
  });
});

// Foreman follow-up (2026-09-28, desktop 1920 review) — (e)-(h) below.
test.describe('landing5 — desktop follow-ups (e)-(h)', () => {
  test('(e) every catálogo card image renders the same box aspect ratio on desktop', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop1920', 'desktop-only assertion');
    await page.goto('/');
    const modelos = page.locator('#modelos');
    await modelos.scrollIntoViewIfNeeded();
    const boxes = await modelos.locator('.catalogo__card-img').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return Math.round(r.height);
      }),
    );
    expect(boxes.length).toBeGreaterThan(0);
    expect(new Set(boxes).size).toBe(1); // every card box is the same fixed height (280px)
    expect(boxes[0]).toBe(280);

    // "Ventana Francesa o Bilbao" now sources the board's real installed-
    // window photo (galeria-04.jpeg), not the hero's vertical close-up.
    const ventanaImg = modelos
      .locator('li', { hasText: 'Ventana Francesa o Bilbao' })
      .locator('img');
    await expect(ventanaImg).toHaveAttribute('src', '/images/galeria-04.jpeg');
  });

  test('(f) Acabados finish swatches use real photos; "Puerta de jardín" shows the real garden-door photo', async ({
    page,
  }) => {
    await page.goto('/');
    const modelos = page.locator('#modelos');
    await modelos.scrollIntoViewIfNeeded();
    const acabados = modelos.locator('.catalogo__item--acabados');
    for (const [name, file] of [
      ['Aquaclara', 'finish-aquaclara.webp'],
      ['Frosted', 'finish-frosted.webp'],
      ['Aquafold', 'finish-aquafold.webp'],
    ] as const) {
      const img = acabados.locator('figure', { hasText: name }).locator('img');
      await expect(img).toHaveAttribute('src', `/images/${file}`);
    }

    // docs/architecture/tech-debt.md: client confirmed usage rights for all
    // board/discovery assets 2026-09-29 (sf-user-0929) — the placeholder
    // tile is gone, the card now renders the real garden-door photo.
    const jardinCard = modelos.locator('li', { hasText: 'Puerta de jardín' });
    await expect(jardinCard.locator('img.catalogo__card-img')).toHaveAttribute(
      'src',
      '/images/catalog-jardin.webp',
    );
    await expect(jardinCard.getByText('Foto próximamente')).toHaveCount(0);
  });

  test('(g) "Proyectos reales" header: alignment + kicker typography matches the desktop board', async ({
    page,
  }, testInfo) => {
    // The h2 font-size is NOT asserted here — per Foreman (2026-09-28),
    // font-size-h2-mobile/desktop are a project-wide shared-token gap fixed
    // centrally, not per section (see CotizadorTeaser's typography test).
    test.skip(testInfo.project.name !== 'desktop1920', 'desktop-only assertion');
    await page.goto('/');
    const galeria = page.locator('#galeria');
    await galeria.scrollIntoViewIfNeeded();
    await expect(galeria.locator('.galeria__kicker')).toHaveCSS('font-size', '14px');
    // title (left) + subtitle/IG caption (right) sit at opposite ends of the
    // row (header has its own right padding, so the caption's right edge is
    // inset from the header box's right edge, not flush with it).
    const headerBox = (await galeria.locator('.galeria__header').boundingBox())!;
    const titleBox = (await galeria.locator('.galeria__title').boundingBox())!;
    const captionBox = (await galeria.locator('.galeria__caption').boundingBox())!;
    expect(titleBox.x).toBeLessThan(captionBox.x);
    expect(captionBox.x + captionBox.width).toBeLessThanOrEqual(
      headerBox.x + headerBox.width + 1,
    );
    expect(captionBox.x + captionBox.width).toBeGreaterThan(
      headerBox.x + headerBox.width - 32,
    );
  });

  test('(h) CotizadorTeaser: WhatsApp CTA + gradient sheen appear on desktop only', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    const section = page.locator('#cotizador');
    await section.scrollIntoViewIfNeeded();
    const waCta = section.locator('.cotizador-teaser__wa-cta');
    const sheen = section.locator('.cotizador-teaser__sheen');
    if (testInfo.project.name === 'desktop1920') {
      await expect(waCta).toBeVisible();
      await expect(waCta).toHaveText(/Cotizar por WhatsApp/);
      await expect(sheen).toBeVisible();
    } else {
      await expect(waCta).toBeHidden();
      await expect(sheen).toBeHidden();
    }
  });
});
