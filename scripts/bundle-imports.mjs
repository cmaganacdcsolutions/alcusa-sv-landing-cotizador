// Extractores de dependencias JS del gate de bundle (scripts/check-bundle-size.mjs).
// Estaticas = se descargan al arrancar la pagina; dinamicas = import("...") bajo demanda.

/** Dependencias estaticas de un modulo: `from "x.js"` e `import "x.js"`. NO incluye `import("x.js")`. */
export function extractStaticImports(jsSource) {
  const specifiers = new Set();
  for (const m of jsSource.matchAll(/from\s*["']([^"']+\.js)["']/g)) specifiers.add(m[1]);
  for (const m of jsSource.matchAll(/import\s*["']([^"']+\.js)["']/g)) specifiers.add(m[1]);
  return [...specifiers];
}

/** Dependencias dinamicas de un modulo: `import("x.js")`. */
export function extractDynamicImports(jsSource) {
  const specifiers = new Set();
  for (const m of jsSource.matchAll(/import\(\s*["']([^"']+\.js)["']\s*\)/g)) specifiers.add(m[1]);
  return [...specifiers];
}

/** Entradas del HTML que se descargan al arrancar: <script src> y <link rel=modulepreload href>. */
export function extractHtmlScriptSrcs(html) {
  const out = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js)["'][^>]*>/gi)].map((m) => m[1]);
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel=["']modulepreload["']/i.test(m[0])) continue;
    const href = m[0].match(/href=["']([^"']+\.js)["']/i);
    if (href) out.push(href[1]);
  }
  return out;
}

/** Islas Astro: component-url y renderer-url. */
export function extractAstroIslandUrls(html) {
  const urls = [];
  for (const islandMatch of html.matchAll(/<astro-island\b[^>]*>/gi)) {
    const tag = islandMatch[0];
    for (const attr of ['component-url', 'renderer-url']) {
      const attrMatch = tag.match(new RegExp(`${attr}=["']([^"']+)["']`));
      if (attrMatch) urls.push(attrMatch[1]);
    }
  }
  return urls;
}

/**
 * Chunks diferidos que Vite lista en `__vite__mapDeps` (array `m.f=["_astro/X.js", ...]`) para
 * `__vitePreload(()=>import(...), __vite__mapDeps([i...]))`. Rutas relativas a la raiz de dist;
 * se devuelven con "/" inicial. Sirve solo para el informe "deferred": NO afecta el arranque.
 */
export function extractViteMapDeps(jsSource) {
  const out = new Set();
  for (const arr of jsSource.matchAll(/\.f\s*=\s*\[([^\]]*)\]/g)) {
    for (const s of arr[1].matchAll(/["'`]([^"'`]+\.js)["'`]/g)) out.add(s[1].startsWith('/') ? s[1] : `/${s[1]}`);
  }
  return [...out];
}

const STATIC_PAGE_BUDGET_BYTES = 40 * 1024;
const ISLAND_PAGE_BUDGET_BYTES = 90 * 1024;
// /cotizador: React ~70 KB fijos + cotizador de 7 pasos (nucleo ~44 KB) con pasos ya diferidos.
// Decision del usuario 2026-10-10: presupuesto propio de 120 KiB.
const COTIZADOR_BUDGET_BYTES = 120 * 1024;

/** Presupuesto (bytes gz de arranque) por ruta HTML construida (p.ej. "cotizador/index.html"). */
export function budgetForRoute(route, hasIslands) {
  if (/^cotizador\/(index\.html)?$/.test(route) || route === 'cotizador.html') return COTIZADOR_BUDGET_BYTES;
  return hasIslands ? ISLAND_PAGE_BUDGET_BYTES : STATIC_PAGE_BUDGET_BYTES;
}
