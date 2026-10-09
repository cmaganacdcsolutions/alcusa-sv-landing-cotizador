import type { Page } from '@playwright/test';
import { fillAddress } from '../support/address';
import { expect, pickProduct, test } from './fixtures';

test.use({ blockQuotePdf: true });

// Pendiente 1009 (item 1): una cotizacion EN CURSO no se pierde en silencio al entrar por `?promo=`.
// Se aparta (stash), el link de la promo gana, y el aviso no bloqueante ofrece "Recuperarla".
const PROMO_URL = '/cotizador?producto=recta&paso=medidas&color=natural&vidrio=nevado&promo=promo-corrediza-nevado';

async function hydrated(page: Page): Promise<void> {
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
}

async function buildNormalCart(page: Page): Promise<void> {
  await page.goto('/cotizador');
  await hydrated(page);
  await pickProduct(page, 'recta');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await fillAddress(page, 'Soyapango');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.locator('.summary-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Agregar otro producto' }).click();
  await expect(page.getByRole('heading', { name: 'Elige tu producto' })).toBeVisible();
}

test.describe('cotizador - cotizacion en curso vs ?promo=', () => {
  test('carrito normal + ?promo: la promo gana, aparece el aviso y "Recuperarla" devuelve el carrito', async ({ page }) => {
    await buildNormalCart(page);
    await page.goto(PROMO_URL);
    await hydrated(page);
    await expect(page.getByTestId('promo-banner')).toBeVisible();
    await expect(page.getByTestId('promo-locked')).toContainText('Nevado 5 mm');
    await expect(page.getByTestId('stash-banner')).toBeVisible();

    await page.getByTestId('stash-recover').click();
    await expect(page.getByTestId('stash-banner')).toHaveCount(0);
    await expect(page.getByTestId('promo-banner')).toHaveCount(0);
    await expect(page).not.toHaveURL(/promo=/);
    await expect(page.getByRole('heading', { name: 'Elige tu producto' })).toBeVisible();
    // El item del carrito sigue ahi: en el aside/resumen hay 1 item comprometido.
    await page.getByRole('button', { name: 'Siguiente' }).count();
    const cart = await page.evaluate(() => window.sessionStorage.getItem('alcusa-cotizador-cart'));
    expect(JSON.parse(cart ?? '[]')).toHaveLength(1);
    expect(await page.evaluate(() => window.sessionStorage.getItem('alcusa-cotizador-stash'))).toBeNull();
  });

  test('descartar limpia el stash y deja solo la promo', async ({ page }) => {
    await buildNormalCart(page);
    await page.goto(PROMO_URL);
    await hydrated(page);
    await page.getByTestId('stash-discard').click();
    await expect(page.getByTestId('stash-banner')).toHaveCount(0);
    await expect(page.getByTestId('promo-banner')).toBeVisible();
    expect(await page.evaluate(() => window.sessionStorage.getItem('alcusa-cotizador-stash'))).toBeNull();
  });

  test('misma promo: el snapshot se restaura sin aviso', async ({ page }) => {
    await page.goto(PROMO_URL);
    await hydrated(page);
    await page.locator('#ancho').fill('110');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByTestId('step2-price-value')).toBeVisible();
    await page.reload();
    await hydrated(page);
    await expect(page.getByTestId('promo-banner')).toBeVisible();
    await expect(page.getByTestId('step2-price-value')).toBeVisible();
    await expect(page.getByTestId('stash-banner')).toHaveCount(0);
  });
});
