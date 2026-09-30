import type { Page } from '@playwright/test';
import { expect, pickProduct, test } from './fixtures';

// R4 — "Enviar por WhatsApp (PDF)". Never opens a real wa.me: window.open is
// stubbed and only hrefs / call records are asserted (ADR-006).

type ShareMode = 'none' | 'ok' | 'abort' | 'notallowed';

interface Probe {
  shareCalls: { name: string; type: string; hasTitle: boolean }[];
  opened: string[];
}
declare global {
  interface Window {
    __probe: Probe;
  }
}

async function stubShare(page: Page, mode: ShareMode): Promise<void> {
  await page.addInitScript((m: ShareMode) => {
    const probe: Probe = { shareCalls: [], opened: [] };
    window.__probe = probe;
    window.open = ((url?: string | URL) => {
      probe.opened.push(String(url));
      return null;
    }) as typeof window.open;
    if (m === 'none') {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
      return;
    }
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: ShareData) => {
        const f = data.files?.[0];
        probe.shareCalls.push({ name: f?.name ?? '', type: f?.type ?? '', hasTitle: Boolean(data.title) });
        if (m === 'abort') return Promise.reject(new DOMException('cancelled', 'AbortError'));
        if (m === 'notallowed' && probe.shareCalls.length === 1) return Promise.reject(new DOMException('gesture', 'NotAllowedError'));
        return Promise.resolve();
      },
    });
  }, mode);
}

async function gotoResumen(page: Page): Promise<void> {
  await page.goto('/cotizador');
  await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
  await pickProduct(page, 'recta');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.locator('#municipio').selectOption('Soyapango');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Resumen de tu cotización' })).toBeVisible();
}

const shareButton = (page: Page) => page.getByTestId('quote-share-button').locator('visible=true');
const shown = (page: Page, text: string) => page.getByText(text).locator('visible=true');
/** R07.1: the trigger opens the customer dialog first; fill it and submit. */
async function shareAndSubmit(page: Page): Promise<void> {
  await shareButton(page).click();
  const dlg = page.getByRole('dialog', { name: 'Tus datos para la cotización' });
  await dlg.getByLabel('Nombre').fill('María López');
  await dlg.getByLabel('WhatsApp').fill('71234567');
  await dlg.getByRole('checkbox').check();
  await dlg.getByRole('button', { name: 'Generar mi cotización' }).click();
}

const probe = (page: Page): Promise<Probe> => page.evaluate(() => window.__probe);

test.describe('quote share — desktop (always download + wa.me tab)', () => {
  test.beforeEach(({ isMobile }) => test.skip(isMobile, 'desktop-only'));

  test('downloads the PDF, opens wa.me (stubbed) and shows the persistent toast; Esc closes it', async ({ page }) => {
    await stubShare(page, 'ok'); // share exists but must NOT be used on desktop
    await gotoResumen(page);
    await expect(shareButton(page)).toHaveText('Enviar por WhatsApp (PDF)');

    const download = page.waitForEvent('download');
    await shareAndSubmit(page);
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^Cotizacion-ALC-\d{8}-U[0-9A-Z]{7}\.pdf$/);

    const toast = page.getByTestId('quote-share-toast');
    await expect(toast).toBeVisible();
    await expect(toast.getByRole('button', { name: 'Volver a descargar' })).toBeVisible();
    const href = await toast.getByRole('link', { name: 'Abrir WhatsApp' }).getAttribute('href');
    expect(href).toMatch(/^https:\/\/wa\.me\/50376802410\?text=/);
    const text = decodeURIComponent(href!.split('?text=')[1]);
    expect(text).toContain('Hola, ALCUSA. Quiero confirmar mi cotización.');
    expect(text).toMatch(/N\.º ALC-\d{8}-U/);
    expect(text).toContain('Adjunto el PDF de mi cotización.');

    const p = await probe(page);
    expect(p.shareCalls).toHaveLength(0);
    expect(p.opened).toEqual([href]);

    await page.waitForTimeout(600); // persistent: no auto-close
    await expect(toast).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(toast).toHaveCount(0);
  });

  test('"Volver a descargar" downloads again', async ({ page }) => {
    await stubShare(page, 'none');
    await gotoResumen(page);
    await shareAndSubmit(page);
    const again = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Volver a descargar' }).click();
    expect((await again).suggestedFilename()).toMatch(/\.pdf$/);
  });
});

test.describe('quote share — mobile (Web Share with files)', () => {
  test.beforeEach(({ isMobile }) => test.skip(!isMobile, 'mobile-only'));

  test('canShare true -> navigator.share is called with the PDF; D card appears', async ({ page }) => {
    await stubShare(page, 'ok');
    await gotoResumen(page);
    await shareAndSubmit(page);
    await expect(shown(page, '¿Ya lo enviaste? Te respondemos por WhatsApp')).toBeVisible();
    const p = await probe(page);
    expect(p.shareCalls).toHaveLength(1);
    expect(p.shareCalls[0]).toMatchObject({ type: 'application/pdf', hasTitle: true });
    expect(p.shareCalls[0]!.name).toMatch(/^Cotizacion-ALC-\d{8}-U/);
    expect(p.opened).toHaveLength(0);
  });

  test('AbortError -> silent: no download, no new tab, no card, back to A with focus', async ({ page }) => {
    await stubShare(page, 'abort');
    await gotoResumen(page);
    let downloaded = false;
    page.on('download', () => (downloaded = true));
    await shareAndSubmit(page);
    await expect.poll(async () => (await probe(page)).shareCalls.length).toBe(1);
    await expect(shareButton(page)).toHaveText('Enviar por WhatsApp (PDF)');
    await expect(shareButton(page)).toBeFocused();
    await expect(shown(page, '¿Ya lo enviaste?')).toHaveCount(0);
    await expect(page.getByRole('alert').locator('visible=true')).toHaveCount(0);
    await page.waitForTimeout(400);
    expect(downloaded).toBe(false);
    expect((await probe(page)).opened).toHaveLength(0);
  });

  test('NotAllowedError -> E "Listo: toca para compartir", second tap shares', async ({ page }) => {
    await stubShare(page, 'notallowed');
    await gotoResumen(page);
    await shareAndSubmit(page);
    await expect(shareButton(page)).toHaveText('Listo: toca para compartir');
    await shareButton(page).click();
    await expect(shown(page, '¿Ya lo enviaste?')).toBeVisible();
    expect((await probe(page)).shareCalls).toHaveLength(2);
  });
});
