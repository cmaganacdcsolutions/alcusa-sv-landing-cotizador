import { expect, test } from './fixtures';

// image-frame-rule.md ("Foto completa"): every main (non-aria-hidden) photo is shown whole,
// centered: object-fit contain, object-position 50% 50%. Kept apart: the aria-hidden ambient
// layer (cover + blur), logos, and glass swatches (textures).
// Las paginas /catalogo/** ya no existen (redirigen al inicio, ver catalogo-redirects.spec.ts): el catalogo es el inicio.
const ROUTES = ['/', '/cotizador'];

for (const route of ROUTES) {
  test(`foto completa: ${route} usa object-fit contain y centrado`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    const bad = await page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll('img').forEach((img) => {
        if (img.closest('[aria-hidden="true"]') || img.getAttribute('aria-hidden') === 'true') return;
        if (img.getAttribute('alt') === '' || /logo|finish-|swatch|glass/i.test(img.src + img.className)) return;
        if (img.closest('header, footer, nav, [class*="drawer"]')) return;
        const cs = getComputedStyle(img);
        // Renders de estudio (visual-brutal / image-frame-rule 2026-10-06): 4:3 exacto, cover, sin capa blur.
        if (img.src.includes('/images/renders/')) {
          if (cs.objectFit !== 'cover' || cs.objectPosition !== '50% 50%') out.push(`${img.src} ${cs.objectFit} ${cs.objectPosition}`);
          return;
        }
        if (cs.objectFit !== 'contain' || cs.objectPosition !== '50% 50%') {
          out.push(`${img.src} ${cs.objectFit} ${cs.objectPosition}`);
        }
      });
      return out;
    });
    expect(bad).toEqual([]);
  });
}

// BUG-1008-01 (rendimiento): la capa ambiental de las fotos oficiales no puede llevar blur() en vivo.
// 19 capas con blur(32px) volvian WebKit @DPR3 (ios390) 3-4x mas lento: 9 timeouts en home y paso 0 del
// cotizador. Las fotos de /images/fotos/<stem>-<ancho>.webp usan la miniatura horneada <stem>-amb.webp
// (el desenfoque ya viene en los pixeles). Los flyers de promos usan la misma convencion
// (/images/promos/<stem>-900.webp -> <stem>-amb.webp): cero blur en vivo en el sitio publico.
for (const route of ROUTES) {
  test(`foto completa: ${route} la capa ambiental usa la miniatura horneada, sin blur en vivo`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    if (route === '/cotizador') await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    const report = await page.evaluate(() => {
      const bad: string[] = [];
      let photos = 0;
      let flyers = 0;
      document.querySelectorAll<HTMLElement>('.photo-frame').forEach((frame) => {
        const main = frame.querySelector<HTMLImageElement>('.photo-frame__img');
        const ambient = frame.querySelector<HTMLImageElement>('.photo-frame__ambient');
        if (!main || !ambient) return;
        const mainPath = new URL(main.src, location.href).pathname;
        const ambientPath = new URL(ambient.src, location.href).pathname;
        const filter = getComputedStyle(ambient).filter;
        if (mainPath.includes('/images/fotos/')) {
          photos += 1;
          const expected = mainPath.replace(/-\d+\.webp$/, '-amb.webp');
          if (ambientPath !== expected) bad.push(`src ${ambientPath} != ${expected}`);
          if (/blur/i.test(filter)) bad.push(`blur en vivo (${filter}) en ${ambientPath}`);
          if (ambient.hasAttribute('srcset')) bad.push(`srcset en la ambiental ${ambientPath}`);
          // Una miniatura que ya termino de cargar y quedo en 0x0 es una imagen rota (404).
          if (ambient.complete && ambient.naturalWidth === 0) bad.push(`miniatura rota ${ambientPath}`);
        } else if (mainPath.includes('/images/promos/') || mainPath.includes('/media/promos/')) {
          // Flyers: misma miniatura horneada (<stem>-900.webp -> <stem>-amb.webp), sin blur en vivo.
          flyers += 1;
          const expected = mainPath.replace(/-\d+\.webp$/, '-amb.webp');
          if (ambientPath !== expected) bad.push(`flyer src ${ambientPath} != ${expected}`);
          if (/blur/i.test(filter)) bad.push(`blur en vivo (${filter}) en el flyer ${ambientPath}`);
          if (ambient.hasAttribute('srcset')) bad.push(`srcset en la ambiental del flyer ${ambientPath}`);
          if (ambient.complete && ambient.naturalWidth === 0) bad.push(`miniatura de flyer rota ${ambientPath}`);
        }
      });
      return { bad, photos, flyers };
    });
    expect(report.bad).toEqual([]);
    expect(report.photos).toBeGreaterThan(0);
    if (route === '/') expect(report.flyers).toBeGreaterThan(0);
  });
}

// BUG-1008-01: al cambiar de variante en el inicio, setPhoto (catalogHome.client.ts) mueve tambien la capa
// ambiental a la miniatura de la foto nueva, sin blur en vivo y sin width/height/srcset.
test('foto completa: / al cambiar de color la ambiental sigue a la foto (miniatura horneada)', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('html[data-js]');
  const card = page.locator('#p-ventana-francesa');
  await card.scrollIntoViewIfNeeded();
  const ambient = card.locator('img.photo-frame__ambient');
  await expect(ambient).toHaveAttribute('src', '/images/fotos/ventana-francesa-amb.webp');
  await card.locator('[data-field="color"] [data-trigger]').click();
  await card.locator('[data-field="color"] .pcard__opt[data-value="negro"]').click();
  await expect(card.locator('img.photo-frame__img')).toHaveAttribute('src', '/images/fotos/ventana-francesa-negro-800.webp');
  await expect(ambient).toHaveAttribute('src', '/images/fotos/ventana-francesa-negro-amb.webp');
  await expect(ambient).toHaveClass(/photo-frame__ambient--baked/);
  await expect(ambient).not.toHaveAttribute('width');
  await expect(ambient).not.toHaveAttribute('srcset');
  expect(await ambient.evaluate((el) => getComputedStyle(el).filter)).not.toMatch(/blur/i);
});

// Flyer sin miniatura (subido desde el admin sin hornear, 404 o URL fuera de convencion): el fondo es el color solido
// de token (--photo-ambient-fallback), nunca el blur en vivo.
test('foto completa: / flyer sin miniatura (404) => fondo solido de token, sin blur', async ({ page }) => {
  await page.route('**/images/promos/*-amb.webp', (route) => route.fulfill({ status: 404 }));
  await page.goto('/');
  const ambient = page.locator('.promo-card__photo img.photo-frame__ambient').first();
  await expect(ambient).toHaveCount(1);
  const css = await ambient.evaluate((el) => {
    const cs = getComputedStyle(el);
    const probe = document.createElement('div');
    probe.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--photo-ambient-fallback');
    document.body.append(probe);
    const token = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { filter: cs.filter, bg: cs.backgroundColor, token };
  });
  expect(css.filter).not.toMatch(/blur/i);
  expect(css.bg).toBe(css.token);
  expect(css.token).not.toBe('rgba(0, 0, 0, 0)');
});
