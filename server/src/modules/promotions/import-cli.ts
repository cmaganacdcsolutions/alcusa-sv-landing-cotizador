// Logic behind `npm run promos:import` (entry point: src/cli/import-promos.ts). Kept importable so the flags, the
// production guard and the report are unit-tested without spawning a process.
import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createAdminRuntime, loadAdminConfig } from '../admin/runtime.ts';
import type { AdminStore } from '../admin/store.ts';
import { ImportError, type ImportReport, importPromotions } from './import.ts';

export const USAGE = `Uso: npm run promos:import -- <ruta/a/promotions.json> [--dry-run] [--publish] [--site-public-dir <dir>] [--allow-production]

  --dry-run            valida y muestra que haria; no escribe nada (ni tienda, ni imagenes, ni auditoria)
  --publish            ademas regenera promotions.json (PROMOTIONS_OUT_DIR) al terminar
  --site-public-dir    carpeta public/ del sitio donde viven las imagenes (por defecto <json>/../../public)
  --allow-production   necesario si NODE_ENV=production (por defecto se rehusa)`;

export interface ImportCliArgs {
  file: string;
  dryRun: boolean;
  publish: boolean;
  allowProduction: boolean;
  sitePublicDir: string | undefined;
}

export function parseImportArgs(argv: string[]): ImportCliArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      publish: { type: 'boolean', default: false },
      'allow-production': { type: 'boolean', default: false },
      'site-public-dir': { type: 'string' },
    },
  });
  const [file, ...extra] = positionals;
  if (!file || extra.length) throw new Error('Falta la ruta a promotions.json (una sola).');
  return { file, dryRun: values['dry-run'], publish: values.publish, allowProduction: values['allow-production'], sitePublicDir: values['site-public-dir'] };
}

/** NODE_ENV=production needs the explicit flag (the import rewrites live content; run it deliberately). */
export function productionRefusal(env: NodeJS.ProcessEnv, allowProduction: boolean): string | null {
  return env['NODE_ENV'] === 'production' && !allowProduction
    ? 'promos:import se rehusa a correr con NODE_ENV=production. Si es intencional (p. ej. en el VPS) agrega --allow-production.'
    : null;
}

const money = (n: number): string => `$${n.toFixed(2)}`;

export function formatReport(r: ImportReport, ctx: { store: string; database: string | null; imagesDir: string; imageUrlPrefix: string; source: string }): string {
  const L: string[] = [];
  L.push(`promos:import${r.dryRun ? ' (DRY-RUN: no se escribe nada)' : ''}`);
  L.push(`  tienda: ${ctx.store}${ctx.database ? ` (base ${ctx.database})` : ''}`);
  L.push(`  origen: ${ctx.source}`);
  L.push(`  imagenes: ${ctx.imagesDir}  (url ${ctx.imageUrlPrefix}/...)`);
  for (const it of r.items) {
    const label = { create: r.dryRun ? 'CREARIA' : 'CREADA', update: r.dryRun ? 'ACTUALIZARIA' : 'ACTUALIZADA', unchanged: 'SIN CAMBIOS', skipped: 'OMITIDA' }[it.action];
    L.push(`- ${it.id}  [${label}]${it.changes.length ? ` (${it.changes.join(', ')})` : ''}`);
    if (it.action === 'skipped') continue;
    L.push(`    "${it.title}"  ${it.price_before === null ? 'precio especial' : `antes ${money(it.price_before)}`}  ahora ${money(it.price_promo)}  vigencia ${it.starts_on} .. ${it.ends_on}`);
    L.push(`    link: ${it.link}   imagen: ${it.image}${it.images.length ? `  [${it.images.map((i) => `${i.file}:${i.action === 'copy' ? (r.dryRun ? 'copiaria' : 'copiada') : 'igual'}`).join(', ')}]` : ''}`);
  }
  const c = r.counts;
  L.push(`resumen: crear=${c.create} actualizar=${c.update} sin_cambios=${c.unchanged} omitidas=${c.skipped} imagenes_a_copiar=${r.imagesToCopy}`);
  return L.join('\n');
}

export interface CliIo {
  out: (s: string) => void;
  err: (s: string) => void;
}

/** Returns the process exit code. `store` is injectable for tests; otherwise ADMIN_STORE decides (file | mariadb). */
export async function runImportCli(argv: string[], env: NodeJS.ProcessEnv, io: CliIo, store?: AdminStore): Promise<number> {
  let args: ImportCliArgs;
  try {
    args = parseImportArgs(argv);
  } catch (e) {
    io.err(`${e instanceof Error ? e.message : 'argumentos invalidos'}\n${USAGE}`);
    return 2;
  }
  const refusal = productionRefusal(env, args.allowProduction);
  if (refusal) {
    io.err(refusal);
    return 1;
  }
  let rt: ReturnType<typeof createAdminRuntime> | undefined;
  try {
    const cfg = loadAdminConfig(env);
    const file = resolve(args.file);
    let doc: unknown;
    try {
      doc = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      io.err(`No se pudo leer ${basename(file)} como JSON (ruta o contenido invalido).`);
      return 1;
    }
    rt = createAdminRuntime(cfg, store);
    const imagesDir = resolve(cfg.PROMO_IMAGES_DIR);
    const report = await importPromotions(doc, {
      repo: rt.store,
      sitePublicDir: resolve(args.sitePublicDir ?? resolve(dirname(file), '..', '..', 'public')),
      imagesDir,
      imageUrlPrefix: cfg.PROMO_IMAGE_URL_PREFIX,
      dryRun: args.dryRun,
      audit: (e) => rt?.store.audit(e) ?? Promise.resolve(),
    });
    io.out(
      formatReport(report, {
        store: cfg.ADMIN_STORE,
        database: cfg.ADMIN_STORE === 'mariadb' ? (cfg.NODE_ENV === 'test' ? cfg.DB_TEST_NAME : cfg.DB_NAME) : null,
        imagesDir,
        imageUrlPrefix: cfg.PROMO_IMAGE_URL_PREFIX,
        source: basename(file),
      }),
    );
    if (args.publish) {
      if (args.dryRun) io.out(`  (--publish: con --dry-run no se regenera ${resolve(cfg.PROMOTIONS_OUT_DIR)})`);
      else io.out(`promotions.json regenerado en ${await rt.promos.republish()}`);
    }
    return 0;
  } catch (e) {
    if (e instanceof ImportError) io.err(`Importacion rechazada (no se escribio nada):\n${e.problems.map((p) => `  - ${p}`).join('\n')}`);
    else io.err(`promos:import fallo: ${e instanceof Error ? e.message : 'error desconocido'}`);
    return 1;
  } finally {
    await rt?.close();
  }
}
