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
