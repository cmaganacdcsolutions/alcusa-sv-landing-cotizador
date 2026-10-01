import { createPool, type Pool } from 'mysql2/promise';
import type { Config } from '../config/index.ts';

export const SESSION_SQL_MODE =
  'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ZERO_DATE,NO_ZERO_IN_DATE,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION';

/** Per-connection session setup (UTC + strict mode). Constant, no interpolation at call sites. */
export const SESSION_SET_SQL = `SET time_zone = '+00:00', sql_mode = '${SESSION_SQL_MODE}'`;

type PoolConfig = Pick<Config, 'DB_HOST' | 'DB_PORT' | 'DB_APP_USER' | 'DB_APP_PASSWORD' | 'dbName'>;

/**
 * App pool (alcusa_app, DML only). ADR-013 §2.3: DECIMAL arrives as string
 * (converted to integer cents at the edge), dates as strings, UTC everywhere.
 * Always use `pool.execute(sql, [params])` (prepared statements).
 */
export function createAppPool(cfg: PoolConfig): Pool {
  const pool = createPool({
    host: cfg.DB_HOST,
    port: cfg.DB_PORT,
    user: cfg.DB_APP_USER,
    password: cfg.DB_APP_PASSWORD,
    database: cfg.dbName,
    charset: 'utf8mb4_unicode_ci',
    timezone: 'Z',
    dateStrings: true,
    decimalNumbers: false,
    connectionLimit: 10,
    connectTimeout: 3000,
    waitForConnections: true,
    queueLimit: 50,
  });
  pool.pool.on('connection', (conn) => {
    conn.query(SESSION_SET_SQL);
  });
  return pool;
}

/** Cheap liveness probe of the database; never throws. */
export async function pingDb(pool: Pool, timeoutMs = 2000): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
