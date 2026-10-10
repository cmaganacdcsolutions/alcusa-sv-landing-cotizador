// Bundle-size gate (README §7, ADR-001, tech-debt.md "bundle gate" fix):
// fails if any page's real downloaded JS exceeds its per-page budget.
// Run after `npm run build`, against dist/.
//
// Only JS actually fetched by a real visitor of a given page counts — Vite/
// Astro may leave unreferenced renderer chunks on disk (e.g. a framework
// client runtime pre-built for an integration with no islands wired yet on
// SOME page); those never download for that page and must not count there.
//
// FIX (2026-09-28, sf-landing slice): the previous version only looked for
// `<script src="...">` tags. Astro's static-output hydration runtime never
// emits those for islands — it renders a `<astro-island component-url="..."
// renderer-url="...">` custom element instead, and an inline (no-src)
// bootstrap script dynamically `import()`s those URLs at hydration time. The
// old regex found zero `<script src>` tags on every page, so both budgets
// always reported 0 bytes and the gate could never fail. This version reads
// `component-url` / `renderer-url` off every `<astro-island>` too, and
// measures each BUILT PAGE independently (not one number lumped across the
// whole site), since the page split (S5) means different routes now ship
// very different JS.
import { gzipSync } from 'node:zlib';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { extractAstroIslandUrls, extractDynamicImports, extractHtmlScriptSrcs, extractStaticImports } from './bundle-imports.mjs';

// 2026-10-10 (decision del usuario): el gate mide el JS de ARRANQUE, no el total del sitio.
// Cuentan solo dependencias estaticas: <script src>, <link rel=modulepreload>, component-url/
// renderer-url de <astro-island>, `from "x.js"` e `import "x.js"`. Los `import("x.js")` dinamicos
// (chunks diferidos, p.ej. los pasos del cotizador) NO cuentan contra el presupuesto; se informan
// aparte por pagina como "deferred" (solo informativo, nunca falla). Los presupuestos no cambiaron.

const DIST_DIR = path.resolve(process.cwd(), 'dist');

// Any page with at least one hydrated island (client:load/visible/idle/...)
// pays the fixed cost of a framework renderer chunk (React + hydrate glue —
// ~65KB gz on its own here) on top of its component code. That fixed cost
// makes a strict "landing" budget unreachable for ANY island page, so island
// pages get their own, larger budget — same number the cotizador previously
// used alone; it now applies to every page that hydrates a client island
// (currently /cotizador and /contacto), not just the cotizador route by
// name. Pages with zero islands (currently just the landing, "/") keep the
// strict ADR-001 budget.
const STATIC_PAGE_BUDGET_BYTES = 40 * 1024;
const ISLAND_PAGE_BUDGET_BYTES = 90 * 1024;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(fullPath) : [fullPath];
    }),
  );
  return files.flat();
}

function resolveDistPath(specifier, fromDir) {
  return specifier.startsWith('/') ? path.join(DIST_DIR, specifier.replace(/^\//, '')) : path.resolve(fromDir, specifier);
}

// Reachable-set BFS scoped to ONE html file's entry points (script srcs +
// astro-island component/renderer URLs), so each page is measured against
// only the JS it actually loads — not every JS chunk built anywhere on the
// site (that was the other half of the original bug: even had it found
// entry points, a single site-wide total can't tell "landing is too big"
// apart from "cotizador is too big").
async function reachableBytesForPage(html) {
  const entryPoints = [...extractHtmlScriptSrcs(html), ...extractAstroIslandUrls(html)];

  // BFS sobre las aristas elegidas por `extract`, desde `seeds`, sin repetir `skip`.
  async function walkGraph(seeds, extract, skip = new Set()) {
    const reachable = new Set();
    const queue = [];
    for (const f of seeds) {
      if (!reachable.has(f) && !skip.has(f)) {
        reachable.add(f);
        queue.push(f);
      }
    }
    while (queue.length > 0) {
      const current = queue.pop();
      let source;
      try {
        source = await readFile(current, 'utf-8');
      } catch {
        continue;
      }
      const dir = path.dirname(current);
      for (const specifier of extract(source)) {
        const resolved = resolveDistPath(specifier, dir);
        if (!reachable.has(resolved) && !skip.has(resolved)) {
          reachable.add(resolved);
          queue.push(resolved);
        }
      }
    }
    return reachable;
  }

  async function gzBytes(files) {
    let total = 0;
    for (const file of files) {
      try {
        total += gzipSync(await readFile(file)).byteLength;
      } catch {
        continue;
      }
    }
    return total;
  }

  const seeds = entryPoints.map((src) => path.join(DIST_DIR, src.replace(/^\//, '')));
  const startup = await walkGraph(seeds, extractStaticImports);
  // Diferido (informativo): todo lo alcanzable por import() desde el arranque, ya sin lo estatico.
  const dynamicSeeds = [];
  for (const file of startup) {
    try {
      const src = await readFile(file, 'utf-8');
      for (const spec of extractDynamicImports(src)) dynamicSeeds.push(resolveDistPath(spec, path.dirname(file)));
    } catch {
      continue;
    }
  }
  const deferred = await walkGraph(dynamicSeeds, (src) => [...extractStaticImports(src), ...extractDynamicImports(src)], startup);

  return {
    totalBytes: await gzBytes(startup),
    fileCount: startup.size,
    deferredBytes: await gzBytes(deferred),
    deferredCount: deferred.size,
    hasIslands: entryPoints.length > 0,
  };
}

async function main() {
  let allFiles;
  try {
    allFiles = await walk(DIST_DIR);
  } catch {
    console.log('No dist/ output found — skipping bundle-size check.');
    return;
  }

  const htmlFiles = allFiles.filter((file) => file.endsWith('.html')).sort();
  const failures = [];

  for (const htmlFile of htmlFiles) {
    const html = await readFile(htmlFile, 'utf-8');
    const { totalBytes, fileCount, deferredBytes, deferredCount, hasIslands } = await reachableBytesForPage(html);
    const budget = hasIslands ? ISLAND_PAGE_BUDGET_BYTES : STATIC_PAGE_BUDGET_BYTES;
    const route = path.relative(DIST_DIR, htmlFile).replace(/\\/g, '/');

    console.log(
      `${route}: ${totalBytes} bytes gz (${fileCount} JS file(s), budget ${budget} — ${
        hasIslands ? 'island page' : 'static page'
      })`,
    );

    if (deferredCount > 0) {
      console.log(`  deferred (informativo, no cuenta): ${deferredBytes} bytes gz (${deferredCount} JS file(s))`);
    }

    if (totalBytes > budget) {
      failures.push(`${route}: JS budget exceeded — ${totalBytes} > ${budget} bytes gz`);
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure);
    }
    process.exitCode = 1;
  }
}

await main();
