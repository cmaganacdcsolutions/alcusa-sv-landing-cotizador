// Wires config -> store -> services for the admin entry points (server + CLI). Local store only for now.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { PromoService } from '../promotions/service.ts';
import { AuthService } from './auth-service.ts';
import type { AdminRouteDeps } from './routes.ts';
import { MemoryAdminStore } from './store.ts';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ADMIN_PORT: z.coerce.number().int().min(1).max(65535).default(4500),
  HOST: z.string().min(1).default('127.0.0.1'),
  ADMIN_BASE_PATH: z.string().regex(/^\/[A-Za-z0-9._~/-]*[A-Za-z0-9._~-]$/).default('/dev-ops-local'),
  ADMIN_MFA_MODE: z.enum(['off', 'optional', 'required']).default('off'),
  /** 'file' = JSON-file store for local dev. 'mariadb' is reserved: the adapter is not written yet. */
  ADMIN_STORE: z.enum(['file', 'mariadb']).default('file'),
  ADMIN_STORE_FILE: z.string().default('./.local/admin-store.json'),
  PROMOTIONS_OUT_DIR: z.string().default('../public/data'),
  PROMO_IMAGES_DIR: z.string().default('../public/images/promos'),
  PROMO_IMAGE_URL_PREFIX: z.string().default('/images/promos'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});
export type AdminConfig = z.infer<typeof schema>;

export function loadAdminConfig(env: NodeJS.ProcessEnv = process.env): AdminConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid environment (invalid: ${[...new Set(parsed.error.issues.map((i) => String(i.path[0])))].join(', ')})`);
  if (parsed.data.ADMIN_STORE === 'mariadb') throw new Error('ADMIN_STORE=mariadb: adapter not implemented yet (see HANDOFF).');
  return parsed.data;
}

export function createAdminRuntime(cfg: AdminConfig, store?: MemoryAdminStore): { deps: AdminRouteDeps; store: MemoryAdminStore; auth: AuthService; promos: PromoService } {
  let s = store;
  if (!s) {
    const file = resolve(cfg.ADMIN_STORE_FILE);
    mkdirSync(dirname(file), { recursive: true });
    s = new MemoryAdminStore(file);
  }
  const auth = new AuthService({ repo: s, mfaMode: cfg.ADMIN_MFA_MODE });
  const promos = new PromoService({ repo: s, outDir: resolve(cfg.PROMOTIONS_OUT_DIR), audit: (e) => s.audit(e) });
  const deps: AdminRouteDeps = { base: cfg.ADMIN_BASE_PATH, auth, promos, imagesDir: resolve(cfg.PROMO_IMAGES_DIR), imageUrlPrefix: cfg.PROMO_IMAGE_URL_PREFIX };
  return { deps, store: s, auth, promos };
}
