// Wires config -> store -> services for the admin entry points (server + CLI). ADMIN_STORE=file|mariadb.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { PromoService } from '../promotions/service.ts';
import { AuthService } from './auth-service.ts';
import type { AdminRouteDeps } from './routes.ts';
import { createAppPool } from '../../db/pool.ts';
import { MariaDbAdminStore } from './mariadb-store.ts';
import { type AdminStore, MemoryAdminStore } from './store.ts';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ADMIN_PORT: z.coerce.number().int().min(1).max(65535).default(4500),
  HOST: z.string().min(1).default('127.0.0.1'),
  ADMIN_BASE_PATH: z.string().regex(/^\/[A-Za-z0-9._~/-]*[A-Za-z0-9._~-]$/).default('/dev-ops-local'),
  ADMIN_MFA_MODE: z.enum(['off', 'optional', 'required']).default('off'),
  /** 'file' = JSON-file store for local dev (no DB). 'mariadb' = MariaDbAdminStore (needs the DB_* vars below). */
  ADMIN_STORE: z.enum(['file', 'mariadb']).default('file'),
  ADMIN_STORE_FILE: z.string().default('./.local/admin-store.json'),
  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: z.string().min(1).default('alcusa_dev'),
  DB_TEST_NAME: z.string().min(1).default('alcusa_test'),
  DB_APP_USER: z.string().min(1).default('alcusa_app'),
  DB_APP_PASSWORD: z.string().optional(),
  PROMOTIONS_OUT_DIR: z.string().default('../public/data'),
  PROMO_IMAGES_DIR: z.string().default('../public/images/promos'),
  PROMO_IMAGE_URL_PREFIX: z.string().default('/images/promos'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});
export type AdminConfig = z.infer<typeof schema>;

export function loadAdminConfig(env: NodeJS.ProcessEnv = process.env): AdminConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid environment (invalid: ${[...new Set(parsed.error.issues.map((i) => String(i.path[0])))].join(', ')})`);
  if (parsed.data.ADMIN_STORE === 'mariadb' && !parsed.data.DB_APP_PASSWORD) throw new Error('Invalid environment (invalid: DB_APP_PASSWORD)');
  return parsed.data;
}

export interface AdminRuntime {
  deps: AdminRouteDeps;
  store: AdminStore;
  auth: AuthService;
  promos: PromoService;
  /** Releases DB connections (no-op for the file/memory store). */
  close: () => Promise<void>;
}

export function createAdminRuntime(cfg: AdminConfig, store?: AdminStore): AdminRuntime {
  let s = store;
  let close = (): Promise<void> => Promise.resolve();
  if (!s) {
    if (cfg.ADMIN_STORE === 'mariadb') {
      const db = new MariaDbAdminStore(
        createAppPool({
          DB_HOST: cfg.DB_HOST,
          DB_PORT: cfg.DB_PORT,
          DB_APP_USER: cfg.DB_APP_USER,
          DB_APP_PASSWORD: cfg.DB_APP_PASSWORD ?? '',
          dbName: cfg.NODE_ENV === 'test' ? cfg.DB_TEST_NAME : cfg.DB_NAME,
        }),
      );
      s = db;
      close = () => db.close();
    } else {
      const file = resolve(cfg.ADMIN_STORE_FILE);
      mkdirSync(dirname(file), { recursive: true });
      s = new MemoryAdminStore(file);
    }
  }
  const repo = s;
  const auth = new AuthService({ repo, mfaMode: cfg.ADMIN_MFA_MODE });
  const promos = new PromoService({ repo, outDir: resolve(cfg.PROMOTIONS_OUT_DIR), audit: (e) => repo.audit(e) });
  const deps: AdminRouteDeps = { base: cfg.ADMIN_BASE_PATH, auth, promos, imagesDir: resolve(cfg.PROMO_IMAGES_DIR), imageUrlPrefix: cfg.PROMO_IMAGE_URL_PREFIX };
  return { deps, store: repo, auth, promos, close };
}
