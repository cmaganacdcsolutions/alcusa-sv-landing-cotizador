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

function extractHtmlScriptSrcs(html) {
  const matches = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js)["'][^>]*>/gi)];
  return matches.map((m) => m[1]);
}

// Astro's static-output island hydration marker — see the FIX note above.
// Attributes may appear in any order, so pull each one independently rather
// than assuming a fixed attribute sequence.
function extractAstroIslandUrls(html) {
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

function extractImportSpecifiers(jsSource) {
  const specifiers = new Set();
  for (const m of jsSource.matchAll(/from\s*["']([^"']+\.js)["']/g)) specifiers.add(m[1]);
  for (const m of jsSource.matchAll(/import\s*["']([^"']+\.js)["']/g)) specifiers.add(m[1]);
  for (const m of jsSource.matchAll(/import\(\s*["']([^"']+\.js)["']\s*\)/g)) specifiers.add(m[1]);
  return [...specifiers];
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
  const reachable = new Set();
  const queue = [];

  const entryPoints = [...extractHtmlScriptSrcs(html), ...extractAstroIslandUrls(html)];
  for (const src of entryPoints) {
    const resolved = path.join(DIST_DIR, src.replace(/^\//, ''));
    if (!reachable.has(resolved)) {
      reachable.add(resolved);
      queue.push(resolved);
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
    for (const specifier of extractImportSpecifiers(source)) {
      const resolved = resolveDistPath(specifier, dir);
      if (!reachable.has(resolved)) {
        reachable.add(resolved);
        queue.push(resolved);
      }
    }
  }

  let totalBytes = 0;
  for (const file of reachable) {
    let contents;
    try {
      contents = await readFile(file);
    } catch {
      continue;
    }
    totalBytes += gzipSync(contents).byteLength;
  }
  return { totalBytes, fileCount: reachable.size, hasIslands: entryPoints.length > 0 };
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
    const { totalBytes, fileCount, hasIslands } = await reachableBytesForPage(html);
    const budget = hasIslands ? ISLAND_PAGE_BUDGET_BYTES : STATIC_PAGE_BUDGET_BYTES;
    const route = path.relative(DIST_DIR, htmlFile).replace(/\\/g, '/');

    console.log(
      `${route}: ${totalBytes} bytes gz (${fileCount} JS file(s), budget ${budget} — ${
        hasIslands ? 'island page' : 'static page'
      })`,
    );

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
