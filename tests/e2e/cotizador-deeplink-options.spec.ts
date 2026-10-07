import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Contrato de los configuradores del inicio: ?producto=<slug>&paso=medidas&color=<c>&vidrio=<v>.
// Las opciones llegan preseleccionadas en Medidas; el enlace de promos sigue funcionando.
const MEDIDAS = 'Medidas y acabado';
const NOTICE = 'Opciones elegidas en el inicio. Puedes cambiarlas.';

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/cotizador?${query}`);
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.getByRole('heading', { name: MEDIDAS })).toBeVisible();
}

const pressed = (page: Page, group: string, name: string | RegExp) =>
  page.getByRole('group', { name: group, exact: true }).getByRole('button', { name });

test.describe('cotizador — deep link desde el inicio (color + vidrio por modelo)', () => {
  test('recta: color y vidrio preseleccionados + aviso', async ({ page }) => {
    await open(page, 'producto=recta&paso=medidas&color=bronce&vidrio=nevado');
    await expect(pressed(page, 'Color del aluminio', 'Bronce')).toHaveAttribute('aria-pressed', 'true');
    await expect(pressed(page, 'Tipo de vidrio', /^Nevado/)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('home-options-notice')).toHaveText(NOTICE);
    await expect(page.getByTestId('home-options-notice')).toHaveAttribute('role', 'status');
  });

  test('bisagra: color y vidrio preseleccionados', async ({ page }) => {
    await open(page, 'producto=bisagra&paso=medidas&color=blanco&vidrio=duplex');
    await expect(pressed(page, 'Color del aluminio', 'Blanco')).toHaveAttribute('aria-pressed', 'true');
    await expect(pressed(page, 'Tipo de vidrio', /^Dúplex/)).toHaveAttribute('aria-pressed', 'true');
  });

  test('en L: color preseleccionado', async ({ page }) => {
    await open(page, 'producto=l&paso=medidas&color=bronce');
    await expect(pressed(page, 'Color del aluminio', 'Bronce')).toHaveAttribute('aria-pressed', 'true');
  });

  test('jardin: color y vidrio preseleccionados', async ({ page }) => {
    await open(page, 'producto=jardin&paso=medidas&color=natural&vidrio=nevado');
    await expect(pressed(page, 'Color', 'Natural')).toHaveAttribute('aria-pressed', 'true');
    await expect(pressed(page, 'Tipo de vidrio', /^Nevado/)).toHaveAttribute('aria-pressed', 'true');
  });

  test('ventana: marco y vidrio preseleccionados', async ({ page }) => {
    await open(page, 'producto=ventana&paso=medidas&color=bronce&vidrio=super_gris');
    await expect(pressed(page, 'Color del marco', 'Bronce')).toHaveAttribute('aria-pressed', 'true');
    await expect(pressed(page, 'Tipo de vidrio', /gris/i)).toHaveAttribute('aria-pressed', 'true');
  });

  test('valores invalidos se ignoran sin error y sin aviso', async ({ page }) => {
    await open(page, 'producto=recta&paso=medidas&color=fucsia&vidrio=oro');
    await expect(page.getByTestId('home-options-notice')).toHaveCount(0);
    await expect(pressed(page, 'Color del aluminio', 'Natural')).toHaveAttribute('aria-pressed', 'true');
  });

  test('enlace de promo ?producto=recta&vidrio=aquafold sigue funcionando (sin aviso del inicio)', async ({ page }) => {
    // Slug legacy sin ?paso: preselecciona en el paso 0 (contrato previo); al avanzar el vidrio ya viene elegido.
    await page.goto('/cotizador?producto=recta&vidrio=aquafold');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: MEDIDAS })).toBeVisible();
    await expect(pressed(page, 'Tipo de vidrio', 'Aquafold')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('home-options-notice')).toHaveCount(0);
  });
});
