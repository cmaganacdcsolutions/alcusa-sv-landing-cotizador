import { z } from 'zod';

/** Empty string in an env file means "not set". */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const nodeEnv = z.enum(['development', 'test', 'production']).default('development');

const envSchema = z.object({
  NODE_ENV: nodeEnv,
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().min(1).default('127.0.0.1'),
  TRUST_PROXY: bool.default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: z.string().min(1),
  DB_APP_USER: z.string().min(1),
  DB_APP_PASSWORD: z.string().min(1),
  DB_TEST_NAME: z.string().min(1).default('alcusa_test'),

  ADMIN_BASE_PATH: z
    .string()
    .regex(/^\/[A-Za-z0-9._~/-]*[A-Za-z0-9._~-]$/)
    .default('/dev-ops-local'),
  SECRETS_KEY: optional(z.string().min(1)),
  IP_HASH_PEPPER: optional(z.string().min(1)),

  WOMPI_MODE: z.enum(['mock', 'sandbox', 'live']).default('mock'),
  WOMPI_APP_ID: optional(z.string()),
  WOMPI_API_SECRET: optional(z.string()),
  WOMPI_API_BASE: optional(z.string()),
  WOMPI_AUTH_URL: optional(z.string()),

  PUBLIC_SITE_URL: z.string().default('http://localhost:4321'),
  PROMOTIONS_OUT_DIR: z.string().default('../public/data'),
  UPLOADS_DIR: z.string().default('./.local/uploads'),
  WEBHOOK_SPOOL_DIR: z.string().default('./.local/webhook-spool'),
  SERVE_STATIC_DIR: optional(z.string()),
});

export type Config = z.infer<typeof envSchema> & {
  /** Database the app actually talks to (DB_TEST_NAME when NODE_ENV=test). */
  dbName: string;
};

/** Carries variable NAMES only; values never enter the message. */
export class ConfigError extends Error {
  readonly missing: string[];
  readonly invalid: string[];
  constructor(missing: string[], invalid: string[]) {
    const parts: string[] = [];
    if (missing.length) parts.push(`missing: ${missing.join(', ')}`);
    if (invalid.length) parts.push(`invalid: ${invalid.join(', ')}`);
    super(`Invalid environment (${parts.join('; ')})`);
    this.name = 'ConfigError';
    this.missing = missing;
    this.invalid = invalid;
  }
}

function fail(missing: string[], invalid: string[]): never {
  throw new ConfigError([...new Set(missing)].sort(), [...new Set(invalid)].sort());
}

function failFromZod(error: z.ZodError, env: NodeJS.ProcessEnv): never {
  const missing: string[] = [];
  const invalid: string[] = [];
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '?');
    (env[key] === undefined || env[key] === '' ? missing : invalid).push(key);
  }
  return fail(missing, invalid);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) failFromZod(parsed.error, env);
  const cfg = parsed.data;
  const prod = cfg.NODE_ENV === 'production';
  const missing: string[] = [];
  const invalid: string[] = [];
  if (prod) {
    if (!cfg.SECRETS_KEY) missing.push('SECRETS_KEY');
    if (!cfg.IP_HASH_PEPPER) missing.push('IP_HASH_PEPPER');
    if (cfg.SERVE_STATIC_DIR) invalid.push('SERVE_STATIC_DIR');
  }
  if (cfg.WOMPI_MODE === 'live' && !prod) invalid.push('WOMPI_MODE');
  if (cfg.WOMPI_MODE !== 'mock') {
    for (const k of ['WOMPI_APP_ID', 'WOMPI_API_SECRET', 'WOMPI_API_BASE', 'WOMPI_AUTH_URL'] as const) {
      if (!cfg[k]) missing.push(k);
    }
  }
  if (missing.length || invalid.length) fail(missing, invalid);
  return { ...cfg, dbName: cfg.NODE_ENV === 'test' ? cfg.DB_TEST_NAME : cfg.DB_NAME };
}

const migrateSchema = z.object({
  NODE_ENV: nodeEnv,
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: z.string().min(1),
  DB_TEST_NAME: z.string().min(1).default('alcusa_test'),
  DB_MIGRATE_USER: z.string().min(1),
  DB_MIGRATE_PASSWORD: z.string().min(1),
});

export interface MigrateConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/** Credentials for the DDL user (CLI only; the HTTP app never loads these). */
export function loadMigrateConfig(env: NodeJS.ProcessEnv = process.env): MigrateConfig {
  const parsed = migrateSchema.safeParse(env);
  if (!parsed.success) failFromZod(parsed.error, env);
  const c = parsed.data;
  return {
    nodeEnv: c.NODE_ENV,
    host: c.DB_HOST,
    port: c.DB_PORT,
    database: c.NODE_ENV === 'test' ? c.DB_TEST_NAME : c.DB_NAME,
    user: c.DB_MIGRATE_USER,
    password: c.DB_MIGRATE_PASSWORD,
  };
}
