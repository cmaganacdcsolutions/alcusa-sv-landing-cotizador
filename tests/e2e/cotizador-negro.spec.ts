import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Aluminio NEGRO (decision del usuario 2026-10-08): solo recta, bisagra, jardin x3 y ventana francesa.
// Sin precio oficial: toda seleccion negro se cotiza con asesor (WhatsApp). La foto cambia por color
// (regla vidrio -> color -> portada de src/content/home-media.ts).
const WITH_NEGRO: ReadonlyArray<{ slug: string; group: string }> = [
  { slug: 'recta', group: 'Color del aluminio' },
  { slug: 'bisagra', group: 'Color del aluminio' },
  { slug: 'jardin-1-hoja', group: 'Color' },
  { slug: 'jardin-2-hojas', group: 'Color' },
  { slug: 'jardin-3-hojas', group: 'Color' },
  { slug: 'ventana-francesa', group: 'Color del marco' },
];
const WITHOUT_NEGRO: ReadonlyArray<{ slug: string; group: string | null }> = [
  { slug: 'l-aquaclara', group: 'Color del aluminio' },
  { slug: 'templada-10mm', group: null },
  { slug: 'ventana-bilbao', group: 'Color del marco' },
];

async function openMedidas(page: Page, slug: string): Promise<void> {
  await page.goto(`/cotizador?producto=${slug}&paso=medidas`);
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.locator('#step1-heading')).toBeVisible();
}

test.describe('aluminio negro: cotizador', () => {
  for (const { slug, group } of WITH_NEGRO) {
    test(`${slug}: ofrece Negro y lo cotiza con asesor`, async ({ page }) => {
      await openMedidas(page, slug);
      const negro = page.getByRole('group', { name: group, exact: true }).getByRole('button', { name: 'Negro' });
      await expect(negro).toBeVisible();
      await negro.click();
      await expect(negro).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByText('Cotización personalizada por WhatsApp')).toBeVisible();
      if (slug === 'recta' || slug === 'bisagra') {
        await expect(page.getByText(/El aluminio negro se cotiza con un asesor/)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
      }
    });
  }

  for (const { slug, group } of WITHOUT_NEGRO) {
    test(`${slug}: NO ofrece Negro`, async ({ page }) => {
      await openMedidas(page, slug);
      if (group) await expect(page.getByRole('group', { name: group, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Negro' })).toHaveCount(0);
    });
  }

  test('ventana francesa con Negro: el precio final es "Por WhatsApp"', async ({ page }) => {
    await openMedidas(page, 'ventana-francesa');
    await page.getByRole('group', { name: 'Color del marco', exact: true }).getByRole('button', { name: 'Negro' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click({ force: true });
    await expect(page.locator('#step2-heading')).toBeVisible();
    await expect(page.getByTestId('step2-price-value')).toHaveText('Por WhatsApp');
    await expect(page.getByText('Negro').first()).toBeVisible();
  });
});

// Foto por color en las tarjetas del home (src/content/home-media.ts, byColor.negro).
const NEGRO_PHOTO: Readonly<Record<string, string>> = {
  recta: 'recta-galeria',
  bisagra: 'bisagra-decorado',
  'jardin-1-hoja': 'jardin-1-hoja',
  'jardin-2-hojas': 'jardin-2-hojas',
  'jardin-3-hojas': 'jardin-3-hojas-galeria',
  'ventana-francesa': 'ventana-francesa-negro',
};
const DEFAULT_PHOTO: Readonly<Record<string, string>> = {
  recta: 'recta',
  bisagra: 'bisagra',
  'jardin-1-hoja': 'jardin-1-hoja',
  'jardin-2-hojas': 'jardin-2-hojas',
  'jardin-3-hojas': 'jardin-3-hojas',
  'ventana-francesa': 'ventana-francesa',
};

test.describe('aluminio negro: tarjetas del home', () => {
  for (const slug of Object.keys(NEGRO_PHOTO)) {
    test(`${slug}: Negro cambia la foto y el circulo del selector`, async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('html[data-js]');
      const card = page.locator(`#p-${slug}`);
      await card.scrollIntoViewIfNeeded();
      const img = card.locator('img.photo-frame__img');
      await expect(img).toHaveAttribute('src', `/images/fotos/${DEFAULT_PHOTO[slug]}-800.webp`);
      await card.locator('[data-field="color"] [data-trigger]').click();
      await card.locator('[data-field="color"] .pcard__opt[data-value="negro"]').click();
      await expect(img).toHaveAttribute('src', `/images/fotos/${NEGRO_PHOTO[slug]}-800.webp`);
      await expect(card.locator('[data-field="color"] [data-trigger] [data-sw-chip]')).toHaveAttribute('data-sw', 'color:negro');
    });
  }

  test('Negro no aparece en en-L, templada ni Bilbao', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('html[data-js]');
    for (const slug of ['en-l', 'templada-10mm', 'ventana-bilbao']) {
      await expect(page.locator(`#p-${slug} .pcard__opt[data-value="negro"]`)).toHaveCount(0);
    }
  });
});
