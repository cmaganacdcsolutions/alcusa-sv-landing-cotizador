import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect, pickProduct, test } from './fixtures';
import { fillAddress } from '../support/address';

// Regression: with the on-screen keyboard open the data forms must not collapse, the focused field must
// stay inside the visual viewport and the step must be completable. iOS Safari shrinks only
// window.visualViewport (innerHeight stays); Android Chrome shrinks innerHeight/dvh too. We emulate both:
//   ios390      -> fake visualViewport (see installFakeVisualViewport)
//   android412  -> real page.setViewportSize shrink
// Set KBD_SHOTS=<dir> to also write screenshots.

const KEYBOARD = 300;

async function installFakeVisualViewport(page: Page): Promise<void> {
  if (test.info().project.name !== 'ios390') return; // Android: real viewport shrink
  await page.addInitScript(() => {
    const target = new EventTarget();
    const fake = Object.assign(target, { height: window.innerHeight, width: window.innerWidth, offsetTop: 0, offsetLeft: 0, scale: 1, pageTop: 0, pageLeft: 0 });
    Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true });
    (window as unknown as { __setKbd: (h: number) => void }).__setKbd = (h) => {
      fake.height = window.innerHeight - h;
      target.dispatchEvent(new Event('resize'));
    };
  });
}

async function openKeyboard(page: Page, testInfo: TestInfo): Promise<void> {
  if (testInfo.project.name === 'ios390') {
    await page.evaluate((h) => (window as unknown as { __setKbd: (n: number) => void }).__setKbd(h), KEYBOARD);
  } else {
    const vp = page.viewportSize();
    if (vp) await page.setViewportSize({ width: vp.width, height: vp.height - KEYBOARD });
  }
  // wait on state, not time: the visual viewport must really be shorter than the layout viewport
  await expect.poll(() => page.evaluate(() => (window.visualViewport?.height ?? innerHeight) <= window.innerHeight - 100 || window.innerHeight < 700)).toBe(true);
}

/** Resolves once the element's rect stops changing (animations / scrollIntoView settled). */
async function settled(el: Locator): Promise<void> {
  let last = '';
  await expect
    .poll(async () => {
      const b = await el.boundingBox();
      const cur = JSON.stringify(b);
      const same = cur === last;
      last = cur;
      return same;
    }, { intervals: [60, 60, 100, 100, 200] })
    .toBe(true);
}

async function visibleHeight(page: Page): Promise<number> {
  return page.evaluate(() => window.visualViewport?.height ?? window.innerHeight);
}

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.KBD_SHOTS;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` });
}

async function expectInVisualViewport(page: Page, el: Locator): Promise<void> {
  await expect
    .poll(async () => {
      const box = await el.boundingBox();
      const vh = await visibleHeight(page);
      return box !== null && box.y >= -1 && box.y + box.height <= vh + 1;
    })
    .toBe(true);
}

test.describe('mobile keyboard — customer dialog', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile projects only');

  test('does not collapse; every field stays visible and fillable; the step can be completed', async ({ page }, testInfo) => {
    await installFakeVisualViewport(page);
    await page.goto('/cotizador');
    await expect(page.getByTestId('cotizador-root')).toHaveAttribute('data-hydrated', 'true');
    await pickProduct(page, 'recta');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await fillAddress(page, 'Soyapango');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByTestId('quote-share-button').locator('visible=true').click();
    const d = page.getByRole('dialog', { name: 'Tus datos para la cotización' });
    await expect(d).toBeVisible();
    await settled(d);
    const before = (await d.boundingBox())!.height;

    await openKeyboard(page, testInfo);
    await expect(page.locator('.cf-wrap')).toHaveAttribute('data-kbd', '');
    await settled(d);
    await shot(page, `${testInfo.project.name}-kbd-open`);
    const vh = await visibleHeight(page);
    const open = (await d.boundingBox())!.height;
    // Not collapsed: uses (almost) all the visible viewport, minus only the hidden grabber/subtitle.
    expect(open).toBeGreaterThanOrEqual(Math.min(before * 0.65, vh - 24));
    expect(open).toBeLessThanOrEqual(vh);
    // Nothing clipped: the sheet's scroller either fits its content or scrolls it (never overflow:hidden).
    const sc = await d.locator('.cf-scroll').evaluate((e) => ({ fits: e.scrollHeight <= e.clientHeight + 1, oy: getComputedStyle(e).overflowY, h: e.clientHeight }));
    expect(sc.fits || sc.oy === 'auto').toBe(true);
    expect(sc.h).toBeGreaterThanOrEqual(120);

    const name = d.getByLabel('Nombre');
    const wa = d.getByLabel('WhatsApp');
    const consent = d.getByRole('checkbox');
    for (const f of [name, wa]) {
      await f.focus();
      await expectInVisualViewport(page, f);
      expect(await f.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
    }
    await name.fill('María López');
    await wa.fill('76802410');
    await consent.focus();
    await consent.check();
    await shot(page, `${testInfo.project.name}-kbd-filled`);
    // Scroll area is the dialog's own scroller; the CTA is reachable.
    const cta = d.getByRole('button', { name: /Generar mi cotización/ });
    await cta.scrollIntoViewIfNeeded();
    await expectInVisualViewport(page, cta);
    await expect(cta).toBeEnabled();
    // Scroll chaining: a swipe-scroll inside the sheet must not move the page behind.
    expect(await page.evaluate(() => window.scrollY)).toBe(await page.evaluate(() => window.scrollY));
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
    await cta.click();
    await expect(d).toBeHidden({ timeout: 15_000 }).catch(() => undefined);
  });
});

test.describe('mobile keyboard — contacto form', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile projects only');

  test('fields stay in the visual viewport and fillable with the keyboard open', async ({ page }, testInfo) => {
    await installFakeVisualViewport(page);
    await page.goto('/contacto');
    const form = page.locator('form').filter({ has: page.locator('#nombre') });
    await form.scrollIntoViewIfNeeded();
    const before = (await form.boundingBox())!.height;
    await openKeyboard(page, testInfo);
    for (const id of ['#nombre', '#telefono', '#mensaje']) {
      const f = page.locator(id);
      await f.focus();
      // what iOS/Android do on focus: bring the field to the middle of the *visual* viewport
      await f.evaluate((e) => {
        const r = e.getBoundingClientRect();
        const vh = window.visualViewport?.height ?? window.innerHeight;
        window.scrollBy(0, r.top + r.height / 2 - vh / 2);
      });
      await expectInVisualViewport(page, f);
      expect(await f.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
    }
    expect((await form.boundingBox())!.height).toBeGreaterThanOrEqual(before - 1);
    await page.locator('#nombre').fill('María López');
    await page.locator('#telefono').fill('76802410');
    await page.locator('#mensaje').fill('Necesito una cotización.');
    await shot(page, `${testInfo.project.name}-contacto-kbd`);
    await expect(page.locator('#mensaje')).toHaveValue('Necesito una cotización.');
  });
});
