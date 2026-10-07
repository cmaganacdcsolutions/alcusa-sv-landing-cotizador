import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { colorToken } from '../support/tokens';

// Pulido del inicio (2026-10-06): dropdowns con icono (combobox select-only APG) en las tarjetas,
// "Promociones del mes" compactas, y "Antes de comprar" / "Confianza" en tarjetas azul noche.

const ready = async (page: Page): Promise<void> => {
  await page.goto('/');
  await page.waitForSelector('html[data-js]');
};
const combo = (card: Locator, field: string | RegExp): Locator => card.getByRole('combobox', { name: field });
const chip = (trigger: Locator): Promise<string | null> => trigger.locator('[data-sw-chip]').getAttribute('data-sw');

test.describe('tarjetas: dropdowns con icono', () => {
  test('cada lista muestra un circulo y el nombre en TODAS sus opciones; la elegida lleva aria-selected y check', async ({ page }) => {
    test.setTimeout(150_000); // 9 tarjetas x hasta 2 listas x 5-6 opciones; WebKit tactil es lento
    await ready(page);
    const cards = page.locator('.pcard:has(form[data-config])');
    for (let i = 0; i < (await cards.count()); i++) {
      const card = cards.nth(i);
      await card.scrollIntoViewIfNeeded();
      const triggers = card.getByRole('combobox');
      for (let t = 0; t < (await triggers.count()); t++) {
        const trigger = triggers.nth(t);
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await trigger.click();
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        const options = trigger.locator('xpath=..').getByRole('listbox').getByRole('option');
        expect(await options.count()).toBeGreaterThanOrEqual(2);
        for (let o = 0; o < (await options.count()); o++) {
          const opt = options.nth(o);
          await expect(opt.locator('.pcard__sw')).toBeVisible();
          await expect(opt.locator('.pcard__sw')).toHaveAttribute('data-sw', /^(color|glass):/);
          expect(((await opt.innerText()) ?? '').trim().length).toBeGreaterThan(2);
          expect((await opt.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
        await expect(card.getByRole('option', { selected: true })).toHaveCount(1);
        await page.keyboard.press('Escape');
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      }
    }
  });

  test('con el mouse: el circulo del boton, la foto y el deep link siguen la eleccion', async ({ page }) => {
    await ready(page);
    const card = page.locator('#p-recta');
    await card.scrollIntoViewIfNeeded();
    await combo(card, 'Color').click();
    await card.getByRole('option', { name: /^Bronce/ }).click();
    await combo(card, 'Vidrio').click();
    await card.getByRole('option', { name: /^Nevado/ }).click();
    expect(await chip(combo(card, 'Color'))).toBe('color:bronce');
    expect(await chip(combo(card, 'Vidrio'))).toBe('glass:nevado');
    await expect(combo(card, 'Color')).toContainText('Bronce');
    await expect(card.locator('img.photo-frame__img')).toHaveAttribute('src', '/images/renders/recta-bronce-nevado-800.webp');
    await card.getByRole('button', { name: /Continuar al cotizador/ }).click();
    await expect(page).toHaveURL(/\/cotizador\?producto=recta&paso=medidas&color=bronce&vidrio=nevado$/);
  });

  test('con el teclado: flechas + Enter eligen, Esc cierra y devuelve el foco, el deep link se actualiza', async ({ page }) => {
    await ready(page);
    const card = page.locator('#p-ventana-bilbao');
    await card.scrollIntoViewIfNeeded();
    const vidrio = combo(card, 'Vidrio');
    await vidrio.focus();
    await page.keyboard.press('ArrowDown');
    await expect(vidrio).toHaveAttribute('aria-expanded', 'true');
    await expect(vidrio).toHaveAttribute('aria-activedescendant', /-o-claro$/);
    await page.keyboard.press('ArrowDown');
    await expect(vidrio).toHaveAttribute('aria-activedescendant', /-o-bronce$/);
    await page.keyboard.press('Enter');
    await expect(vidrio).toHaveAttribute('aria-expanded', 'false');
    await expect(vidrio).toBeFocused();
    expect(await chip(vidrio)).toBe('glass:bronce');
    // Esc cierra sin cambiar y conserva el foco en el boton.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.press('Escape');
    await expect(vidrio).toHaveAttribute('aria-expanded', 'false');
    await expect(vidrio).toBeFocused();
    expect(await chip(vidrio)).toBe('glass:bronce');
    // Escribir la inicial salta a la opcion.
    await page.keyboard.type('s');
    await page.keyboard.press('Enter');
    expect(await chip(vidrio)).toBe('glass:super_gris');
    await card.getByRole('button', { name: /Continuar al cotizador/ }).click();
    await expect(page).toHaveURL(/producto=ventana-bilbao&paso=medidas&color=blanco&vidrio=super_gris$/);
  });

  test('En L: el acabado viaja como producto y su circulo es el vidrio gemelo', async ({ page }) => {
    await ready(page);
    const card = page.locator('#p-en-l');
    await card.scrollIntoViewIfNeeded();
    await combo(card, 'Acabado').click();
    await card.getByRole('option', { name: /^Frosted/ }).click();
    expect(await chip(combo(card, 'Acabado'))).toBe('glass:nevado');
    await card.getByRole('button', { name: /Continuar al cotizador/ }).click();
    await expect(page).toHaveURL(/producto=l-frosted&paso=medidas&color=natural$/);
  });

  test('axe sin violaciones serias con la lista abierta', async ({ page }) => {
    await ready(page);
    const card = page.locator('#p-recta');
    await card.scrollIntoViewIfNeeded();
    await combo(card, 'Vidrio').click();
    const results = await new AxeBuilder({ page }).include('#p-recta').analyze();
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });

  test('el boton Continuar es una pastilla de una linea, compacta (44px) y el hover no eleva ni pone sombra', async ({ page }) => {
    await ready(page);
    const btn = page.locator('#p-recta').getByRole('button', { name: /Continuar al cotizador/ });
    await btn.scrollIntoViewIfNeeded();
    const b = (await btn.boundingBox())!;
    expect(Math.round(b.height)).toBe(44);
    await expect(btn).toHaveCSS('border-top-left-radius', '9999px');
    await expect(btn).toHaveCSS('white-space', 'nowrap');
    await expect(btn).toHaveCSS('box-shadow', 'none');
  });
});

// Productos con opciones (todos menos templada-10mm): CADA combinacion color x vidrio (en-l: color x acabado) tiene su
// propio render y la tarjeta lo muestra (variante exacta; la escalera a vidrio por defecto/portada es solo respaldo).
type Variant = { src: string };
async function swapMatrix(page: Page, slug: string, how: 'mouse' | 'keyboard'): Promise<void> {
  await ready(page);
  const card = page.locator(`#p-${slug}`);
  await card.scrollIntoViewIfNeeded();
  const variants = JSON.parse((await card.locator('form').getAttribute('data-variants'))!) as Record<string, Variant>;
  const values = (field: string): Promise<string[]> =>
    card.locator(`[data-field="${field}"] .pcard__opt`).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.value!));
  const colors = await values('color');
  // El vidrio vive en "vidrio"; la cabina en L lo elige en "acabado" (valores `l-aquaclara`...).
  const finishField = (await card.locator('[data-field="vidrio"]').count()) > 0 ? 'vidrio' : 'acabado';
  const glasses = await values(finishField);
  const pick = async (field: string, value: string, list: string[]): Promise<void> => {
    const trigger = card.locator(`[data-field="${field}"] [data-trigger]`);
    if (how === 'mouse') {
      await trigger.click();
      await card.locator(`[data-field="${field}"] .pcard__opt[data-value="${value}"]`).click();
    } else {
      await trigger.focus();
      await page.keyboard.press('Home');
      for (let i = 0; i < list.indexOf(value); i++) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    }
  };
  const seen = new Set<string>();
  for (const c of colors) {
    for (const g of glasses) {
      await pick('color', c, colors);
      await pick(finishField, g, glasses);
      const exact = variants[`${c}-${g}`];
      expect(exact, `${slug}: falta la variante ${c}-${g}`).toBeDefined();
      await expect(card.locator('img.photo-frame__img'), `${slug} ${c} + ${g}`).toHaveAttribute('src', exact!.src);
      seen.add(exact!.src);
    }
  }
  // Una imagen distinta por combinacion.
  expect(seen.size).toBe(colors.length * glasses.length);
}

test.describe('tarjetas: el render cambia con cada combinacion', () => {
  for (const slug of ['recta', 'jardin-2-hojas', 'ventana-francesa', 'en-l']) {
    for (const how of ['mouse', 'keyboard'] as const) {
      test(`${slug}: todas las combinaciones color x vidrio/acabado (${how})`, async ({ page }) => {
        test.setTimeout(150_000); // 15-18 combinaciones x 2 listas; WebKit tactil es lento
        await swapMatrix(page, slug, how);
      });
    }
  }
  test('los demas productos con opciones tambien cambian de render con el color y el circulo del boton refleja la eleccion', async ({ page }) => {
    await ready(page);
    for (const slug of ['ventana-bilbao', 'jardin-1-hoja', 'jardin-3-hojas', 'bisagra']) {
      const card = page.locator(`#p-${slug}`);
      await card.scrollIntoViewIfNeeded();
      const before = await card.locator('img.photo-frame__img').getAttribute('src');
      await combo(card, /Color|Marco/).click();
      await card.getByRole('option').nth(1).click();
      await expect(card.locator('img.photo-frame__img')).not.toHaveAttribute('src', before!);
      await expect(card.locator('img.photo-frame__img')).toHaveAttribute('src', new RegExp(`/images/renders/${slug}-(blanco|bronce|natural)-[a-z-]+-800\\.webp$`));
      expect(await chip(combo(card, /Color|Marco/))).toMatch(/^color:/);
    }
  });

  test('templada 10 mm (sin opciones) conserva su portada', async ({ page }) => {
    await ready(page);
    const card = page.locator('#p-templada-10mm');
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByRole('combobox')).toHaveCount(0);
    await expect(card.locator('img.photo-frame__img')).toHaveAttribute('src', '/images/renders/templada-10mm-800.webp');
  });
});

test.describe('tarjetas: vidrio solo y acabado en una linea', () => {
  test('cambiar SOLO el vidrio cambia el render (recta natural: claro <-> nevado; jardin-2-hojas blanco)', async ({ page }) => {
    await ready(page);
    for (const [slug, color] of [['recta', 'natural'], ['jardin-2-hojas', 'blanco']] as const) {
      const card = page.locator(`#p-${slug}`);
      await card.scrollIntoViewIfNeeded();
      const img = card.locator('img.photo-frame__img');
      await expect(img).toHaveAttribute('src', `/images/renders/${slug}-${color}-claro-800.webp`);
      await combo(card, 'Vidrio').click();
      await card.getByRole('option', { name: /^Nevado/ }).click();
      await expect(img).toHaveAttribute('src', `/images/renders/${slug}-${color}-nevado-800.webp`);
      await combo(card, 'Vidrio').click();
      await card.getByRole('option', { name: /^Claro/ }).click();
      await expect(img).toHaveAttribute('src', `/images/renders/${slug}-${color}-claro-800.webp`);
    }
  });

  test('cada vidrio tiene su propio render (decorado y aquafold ya no caen al claro)', async ({ page }) => {
    await ready(page);
    const card = page.locator('#p-recta');
    await card.scrollIntoViewIfNeeded();
    await combo(card, 'Vidrio').click();
    await card.getByRole('option', { name: /^Decorado/ }).click();
    await expect(card.locator('img.photo-frame__img')).toHaveAttribute('src', '/images/renders/recta-natural-decorado-800.webp');
    await combo(card, 'Vidrio').click();
    await card.getByRole('option', { name: /^Aquafold/ }).click();
    await expect(card.locator('img.photo-frame__img')).toHaveAttribute('src', '/images/renders/recta-natural-aquafold-800.webp');
  });

  for (const w of [360, 768, 1440]) {
    test(`@${w} Acabado: etiqueta y valor en una sola linea (En L, con cada acabado)`, async ({ page }, testInfo) => {
      test.skip(w === 1440 && testInfo.project.name !== 'desktop1920', 'escritorio: solo en el proyecto de escritorio');
      await page.setViewportSize({ width: w, height: 900 });
      await ready(page);
      const card = page.locator('#p-en-l');
      await card.scrollIntoViewIfNeeded();
      const label = card.locator('[data-field="acabado"] .pcard__label');
      const value = card.locator('[data-field="acabado"] [data-value-text]');
      for (const name of [/^Aquaclara/, /^Frosted/, /^Aquafold/]) {
        await combo(card, 'Acabado').click();
        await card.getByRole('option', { name }).click();
        expect((await label.boundingBox())!.height, 'etiqueta').toBeLessThanOrEqual(20);
        expect((await value.boundingBox())!.height, 'valor').toBeLessThanOrEqual(22);
        await expect(label).toHaveCSS('white-space', 'nowrap');
        expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      }
    });
  }
});

test.describe('pestanas de categoria (390)', () => {
  test('al cargar: scrollLeft = 0, la primera pestana visible por completo y activa', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page);
    const list = page.locator('.ctabs__list');
    expect(await list.evaluate((el) => el.scrollLeft)).toBe(0);
    const first = page.locator('.ctabs__link').first();
    const [fb, lb] = [(await first.boundingBox())!, (await list.boundingBox())!];
    expect(fb.x).toBeGreaterThanOrEqual(lb.x - 0.5);
    await expect(first).toHaveAttribute('aria-current', 'true');
  });
});

test.describe('tarjetas: sin JS', () => {
  test.use({ javaScriptEnabled: false });
  test('el <select> nativo es lo que se ve y el formulario GET lleva al cotizador', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('#p-recta');
    await expect(card.locator('select').first()).toBeVisible();
    await expect(card.locator('[data-trigger]').first()).toBeHidden();
    await card.locator('select[name="color"]').selectOption('blanco');
    await card.getByRole('button', { name: /Continuar al cotizador/ }).click();
    await expect(page).toHaveURL(/\/cotizador\?producto=recta&paso=medidas&color=blanco&vidrio=claro$/);
  });
});

test.describe('promociones compactas', () => {
  // [ancho, minimo del marco del flyer, maximo del marco del flyer]: el flyer 9:16 se ve completo (contain) y legible.
  for (const [w, minFlyer, maxFlyer] of [
    [390, 330, 360],
    [1024, 296, 330],
    [1440, 340, 380],
  ] as const) {
    test(`@${w} el flyer se ve completo y legible, la tarjeta es compacta y no desborda`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('/');
      const cards = page.locator('#promociones .promo-card');
      await expect(cards).toHaveCount(3);
      for (let i = 0; i < 3; i++) {
        const b = (await cards.nth(i).boundingBox())!;
        expect(b.width, `ancho tarjeta ${i}`).toBeLessThanOrEqual(w === 390 ? 360 : 400);
        expect(b.height, `alto tarjeta ${i}`).toBeLessThanOrEqual(900);
      }
      const frame = (await cards.first().locator('.photo-frame').boundingBox())!;
      expect(frame.width).toBeGreaterThanOrEqual(minFlyer);
      expect(frame.width).toBeLessThanOrEqual(maxFlyer);
      expect(Math.abs(frame.width / frame.height - 4 / 5)).toBeLessThan(0.01);
      await expect(cards.first().locator('.photo-frame__img')).toHaveCSS('object-fit', 'contain');
      if (w === 390) expect(Math.round(100 * (await cards.first().boundingBox())!.width / w)).toBeGreaterThanOrEqual(85);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      if (w >= 1024) {
        const [a, c] = [(await cards.nth(0).boundingBox())!, (await cards.nth(2).boundingBox())!];
        expect(Math.abs(a.y - c.y)).toBeLessThan(1);
      }
      const cta = cards.first().locator('[data-promo-cta]');
      expect(Math.round((await cta.boundingBox())!.height)).toBe(44);
      await expect(cta).toHaveAttribute('href', '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=claro');
    });
  }
  test('el enlace de la promo Aquafold lleva producto, paso Medidas, color natural y vidrio aquafold', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#promociones [data-promo-cta]').nth(2)).toHaveAttribute('href', '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=aquafold');
  });
});

test.describe('Antes de comprar y Confianza: tarjetas azul noche', () => {
  test('tarjetas azul noche (raised), borde fino claro, icono azul claro y contraste AA', async ({ page }) => {
    await page.goto('/');
    for (const [sel, item, icon] of [
      ['#info', '.info__item', '.info__icon'],
      ['#confianza', '.confianza__item', '.confianza__icon'],
    ] as const) {
      const section = page.locator(sel);
      await section.scrollIntoViewIfNeeded();
      const first = section.locator(item).first();
      await expect(first).toHaveCSS('background-color', 'rgb(15, 37, 72)');
      await expect(first).toHaveCSS('border-top-color', 'rgba(255, 255, 255, 0.14)');
      await expect(section.locator(icon).first()).toHaveCSS('color', await colorToken(page, '--color-accent-on-dark'));
      await expect(section.locator('h2')).toHaveClass(/title-gradient/);
    }
    const results = await new AxeBuilder({ page }).include('#info').include('#confianza').include('#promociones').withRules(['color-contrast']).analyze();
    expect(results.violations).toEqual([]);
  });
});
