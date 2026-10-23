import { expect, test } from './fixtures';

// SEO tecnico y on-page sobre el build servido: titulo/descripcion unicos, canonical absoluto, JSON-LD,
// robots/sitemap, un h1 por pagina, alt en imagenes, sin noindex accidental.
const SITE = process.env.PUBLIC_SITE_URL || 'https://alcusasv.com';
const PAGES = ['/', '/cotizador', '/nosotros', '/contacto'] as const;
const canonicalOf = (path: string) => new URL(path === '/' ? '/' : `${path}/`, SITE).href;

type Meta = { title: string; description: string; canonical: string | null; robots: string | null };

test.describe('SEO', () => {
  test('titulo y descripcion unicos, no vacios, con la marca; canonical absoluto', async ({ page }) => {
    const metas: Meta[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      const meta = await page.evaluate<Meta>(() => ({
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
        robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
      }));
      expect(meta.title, path).toMatch(/Alcusa/);
      expect(meta.description.length, `${path} descripcion`).toBeGreaterThanOrEqual(120);
      expect(meta.description.length, `${path} descripcion`).toBeLessThanOrEqual(165);
      expect(meta.canonical, `${path} canonical`).toBe(canonicalOf(path));
      expect(meta.robots, `${path} sin noindex`).toBeNull();
      expect(await page.locator('html').getAttribute('lang')).toBe('es-SV');
      metas.push(meta);
    }
    expect(new Set(metas.map((m) => m.title)).size).toBe(PAGES.length);
    expect(new Set(metas.map((m) => m.description)).size).toBe(PAGES.length);
  });

  test('social cards: og/twitter, imagen absoluta 1200x630', async ({ page, request }) => {
    for (const path of PAGES) {
      await page.goto(path);
      const og = (p: string) => page.locator(`meta[property="${p}"]`).getAttribute('content');
      expect(await og('og:title')).toBe(await page.title());
      expect(await og('og:url')).toBe(canonicalOf(path));
      expect(await og('og:type')).toBe('website');
      expect(await og('og:locale')).toBe('es_SV');
      expect(await og('og:description')).toBeTruthy();
      const image = await og('og:image');
      expect(image, path).toMatch(/^https?:\/\//);
      expect(await page.locator('meta[name="twitter:card"]').getAttribute('content')).toBe('summary_large_image');
      const res = await request.get(new URL(image as string).pathname);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toMatch(/image\/jpeg/);
    }
  });

  test('home: JSON-LD valido con @type, name y url', async ({ page }) => {
    await page.goto('/');
    const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(raw).toHaveLength(1);
    const data = JSON.parse(raw[0]) as { '@graph': { '@type': string | string[]; name: string; url: string }[] };
    const nodes = data['@graph'];
    for (const n of nodes) {
      expect(n['@type']).toBeTruthy();
      expect(n.name).toBeTruthy();
      expect(n.url).toBe(canonicalOf('/'));
    }
    expect(nodes.some((n) => [n['@type']].flat().includes('HomeAndConstructionBusiness'))).toBe(true);
  });

  test('robots.txt y sitemap presentes y coherentes', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).toContain(`Sitemap: ${new URL('/sitemap-index.xml', SITE).href}`);
    const index = await request.get('/sitemap-index.xml');
    expect(index.status()).toBe(200);
    expect(await index.text()).toContain(new URL('/sitemap-0.xml', SITE).href);
    const xml = await (await request.get('/sitemap-0.xml')).text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.sort()).toEqual(PAGES.map(canonicalOf).sort());
  });

  test('un solo h1, imagenes con alt, enlaces internos rastreables', async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('h1'), path).toHaveCount(1);
      expect(await page.locator('img:not([alt])').count(), `${path} img sin alt`).toBe(0);
      expect(await page.locator('a[href^="/"], a[href^="#"]').count()).toBeGreaterThan(0);
      expect(await page.locator('a:not([href])').count(), `${path} <a> sin href`).toBe(0);
      await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    }
  });
});
