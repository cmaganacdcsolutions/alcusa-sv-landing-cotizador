import { readFile } from 'node:fs/promises';
import type { Connection } from 'mysql2/promise';
import { runScript } from './migrator.ts';
import { DB_DIR } from './paths.ts';

export interface GrantOptions {
  database: string;
  appUser: string;
  hosts?: string[];
}

/**
 * Runs server/db/grants.sql (table-level privileges for the app account) once
 * per account host. Values are bound with `SET @x = ?`, never concatenated.
 */
export async function applyGrants(conn: Connection, opts: GrantOptions): Promise<void> {
  const sql = await readFile(`${DB_DIR}/grants.sql`, 'utf8');
  for (const host of opts.hosts ?? ['127.0.0.1', 'localhost']) {
    await conn.execute('SET @alcusa_db = ?', [opts.database]);
    await conn.execute('SET @alcusa_app_user = ?', [opts.appUser]);
    await conn.execute('SET @alcusa_app_host = ?', [host]);
    await runScript(conn, sql);
  }
}
