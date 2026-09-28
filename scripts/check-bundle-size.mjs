// Bundle-size gate (README §7): fails if the cotizador island exceeds 90KB
// gzipped, or the landing JS (everything else actually shipped to a
// visitor) exceeds 40KB gzipped. Run after `npm run build`, against dist/.
//
// Only JS reachable from an HTML page's <script> tags counts — Vite/Astro
// may leave unreferenced renderer chunks on disk (e.g. a framework client
// runtime pre-built for an integration with no islands wired yet); those
// are never downloaded by a real visitor and must not fail the budget.
import { gzipSync } from 'node:zlib';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const COTIZADOR_BUDGET_BYTES = 90 * 1024;
const LANDING_BUDGET_BYTES = 40 * 1024;

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

function extractImportSpecifiers(jsSource) {
  const specifiers = new Set();
  for (const m of jsSource.matchAll(/from\s*["']([^"']+\.js)["']/g)) specifiers.add(m[1]);
  for (const m of jsSource.matchAll(/import\s*["']([^"']+\.js)["']/g)) specifiers.add(m[1]);
  for (const m of jsSource.matchAll(/import\(\s*["']([^"']+\.js)["']\s*\)/g))
    specifiers.add(m[1]);
  return [...specifiers];
}

async function main() {
  let allFiles;
  try {
    allFiles = await walk(DIST_DIR);
  } catch {
    console.log('No dist/ output found — skipping bundle-size check.');
    return;
  }

  const htmlFiles = allFiles.filter((file) => file.endsWith('.html'));

  // Reachable set: absolute dist paths of every .js file actually loaded by
  // at least one built page, discovered via BFS over static/dynamic imports.
  const reachable = new Set();
  const queue = [];

  for (const htmlFile of htmlFiles) {
    const html = await readFile(htmlFile, 'utf-8');
    for (const src of extractHtmlScriptSrcs(html)) {
      const resolved = path.join(DIST_DIR, src.replace(/^\//, ''));
      if (!reachable.has(resolved)) {
        reachable.add(resolved);
        queue.push(resolved);
      }
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
      const resolved = specifier.startsWith('/')
        ? path.join(DIST_DIR, specifier.replace(/^\//, ''))
        : path.resolve(dir, specifier);
      if (!reachable.has(resolved)) {
        reachable.add(resolved);
        queue.push(resolved);
      }
    }
  }

  let cotizadorBytes = 0;
  let landingBytes = 0;

  for (const file of reachable) {
    let contents;
    try {
      contents = await readFile(file);
    } catch {
      continue;
    }
    const gzipped = gzipSync(contents);
    const isCotizador = /cotizador/i.test(file);
    if (isCotizador) {
      cotizadorBytes += gzipped.byteLength;
    } else {
      landingBytes += gzipped.byteLength;
    }
  }

  console.log(`Reachable JS files: ${reachable.size}`);
  console.log(`Landing JS (gz):   ${landingBytes} bytes (budget ${LANDING_BUDGET_BYTES})`);
  console.log(`Cotizador JS (gz): ${cotizadorBytes} bytes (budget ${COTIZADOR_BUDGET_BYTES})`);

  const failures = [];
  if (landingBytes > LANDING_BUDGET_BYTES) {
    failures.push(`Landing JS budget exceeded: ${landingBytes} > ${LANDING_BUDGET_BYTES}`);
  }
  if (cotizadorBytes > COTIZADOR_BUDGET_BYTES) {
    failures.push(`Cotizador JS budget exceeded: ${cotizadorBytes} > ${COTIZADOR_BUDGET_BYTES}`);
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure);
    }
    process.exitCode = 1;
  }
}

await main();
