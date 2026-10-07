// Shared helpers for the MariaDB-backed admin suites. Credentials come from process.env (server/.env via the vitest config).
import { type Connection, createConnection } from 'mysql2/promise';
import { createAppPool } from '../../src/db/pool.ts';
import { MariaDbAdminStore } from '../../src/modules/admin/mariadb-store.ts';

export interface DbEnv {
  host: string;
  port: number;
  database: string;
  appUser: string;
  appPassword: string;
  migrateUser: string;
  migratePassword: string;
}

export function dbEnv(): DbEnv | null {
  const e = process.env;
  const appPassword = e['DB_APP_PASSWORD'];
  const migratePassword = e['DB_MIGRATE_PASSWORD'];
  if (!appPassword || !migratePassword) return null;
  return {
    host: e['DB_HOST'] || '127.0.0.1',
    port: Number(e['DB_PORT'] || 3306),
    database: e['DB_TEST_NAME'] || 'alcusa_test',
    appUser: e['DB_APP_USER'] || 'alcusa_app',
    appPassword,
    migrateUser: e['DB_MIGRATE_USER'] || 'alcusa_migrate',
    migratePassword,
  };
}

export const SKIP_MSG = 'MariaDB env absent (run `npm run db:setup-local`, or set DB_APP_PASSWORD / DB_MIGRATE_PASSWORD): MariaDB suites skipped';

export function openStore(env: DbEnv): MariaDbAdminStore {
  return new MariaDbAdminStore(
    createAppPool({ DB_HOST: env.host, DB_PORT: env.port, DB_APP_USER: env.appUser, DB_APP_PASSWORD: env.appPassword, dbName: env.database }),
  );
}

const migrateConn = (env: DbEnv): Promise<Connection> =>
  createConnection({ host: env.host, port: env.port, user: env.migrateUser, password: env.migratePassword, database: env.database });

/** Wipes the admin tables of the TEST database as the DDL account (the app account cannot delete users/promos/audit). */
export async function resetAdminTables(env: DbEnv): Promise<void> {
  if (!env.database.endsWith('_test')) throw new Error(`refusing to wipe "${env.database}": not a *_test database`);
  const c = await migrateConn(env);
  try {
    await c.query('DELETE FROM audit_log');
    await c.query('DELETE FROM promotion_rules');
    await c.query('DELETE FROM promotions');
    await c.query('DELETE FROM admin_sessions');
    await c.query('DELETE FROM admin_users');
  } finally {
    await c.end();
  }
}

export async function auditActions(env: DbEnv): Promise<string[]> {
  const c = await migrateConn(env);
  try {
    const [rows] = await c.query('SELECT action FROM audit_log ORDER BY id');
    return (rows as Array<{ action: string }>).map((r) => r.action);
  } finally {
    await c.end();
  }
}
