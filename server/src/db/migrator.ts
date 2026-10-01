import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createConnection, type Connection, type RowDataPacket } from 'mysql2/promise';
import type { MigrateConfig } from '../config/index.ts';
import { SESSION_SET_SQL } from './pool.ts';
import { splitSqlStatements } from './sql-split.ts';

/** ADR-010 §5 / ADR-013 §2.3 runner. Forward-only, ordered, checksummed, locked. */

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

const FILE_RE = /^(\d{4})_[a-z0-9_]+\.sql$/;
const LOCK_NAME = 'alcusa_migrate';
const LOCK_TIMEOUT_S = 30;

/** Identical to the DDL at the top of 0001_init.sql (IF NOT EXISTS on both sides). */
const bootstrapSql = (table: string): string => `CREATE TABLE IF NOT EXISTS \`${table}\` (
  version     VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  checksum    CHAR(64)    CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  applied_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

export interface MigrationFile {
  version: string;
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrateResult {
  applied: string[];
  alreadyApplied: string[];
}

export interface MigrateOptions {
  dir: string;
  /** Bookkeeping table; tests use another name to stay clear of the real one. */
  table?: string;
  log?: (msg: string) => void;
}

/** CRLF -> LF so a Windows checkout (autocrlf) hashes the same as Linux. */
export const normalizeSql = (raw: string): string => raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
export const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export async function loadMigrationFiles(dir: string): Promise<MigrationFile[]> {
  const names = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const files: MigrationFile[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const m = FILE_RE.exec(name);
    if (!m?.[1]) throw new MigrationError(`Bad migration file name: ${name} (expected NNNN_description.sql)`);
    if (seen.has(m[1])) throw new MigrationError(`Duplicate migration number ${m[1]}`);
    seen.add(m[1]);
    const sql = normalizeSql(await readFile(join(dir, name), 'utf8'));
    files.push({ version: m[1], name, sql, checksum: sha256(sql) });
  }
  return files;
}

export async function connectMigrate(cfg: MigrateConfig): Promise<Connection> {
  const conn = await createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    charset: 'utf8mb4_unicode_ci',
    timezone: 'Z',
    dateStrings: true,
    connectTimeout: 5000,
  });
  await conn.query(SESSION_SET_SQL);
  return conn;
}

/** Runs each statement of a script on `conn` (no prepared statements: DDL). */
export async function runScript(conn: Connection, script: string): Promise<void> {
  for (const stmt of splitSqlStatements(normalizeSql(script))) {
    await conn.query(stmt);
  }
}

export async function runMigrations(conn: Connection, opts: MigrateOptions): Promise<MigrateResult> {
  const table = opts.table ?? 'schema_migrations';
  if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new MigrationError('Invalid bookkeeping table name');
  const log = opts.log ?? (() => undefined);
  const files = await loadMigrationFiles(opts.dir);

  const [lockRows] = await conn.query<RowDataPacket[]>(
    'SELECT GET_LOCK(?, ?) AS got',
    [LOCK_NAME, LOCK_TIMEOUT_S],
  );
  if (lockRows[0]?.['got'] !== 1) throw new MigrationError('Could not obtain migration lock (another run in progress?)');

  try {
    await conn.query(bootstrapSql(table));
    // `table` is validated against /^[a-z_][a-z0-9_]*$/ above (identifiers cannot be bound).
    const [rows] = await conn.query<RowDataPacket[]>(
      // eslint-disable-next-line no-restricted-syntax
      `SELECT version, checksum FROM \`${table}\` ORDER BY version`,
    );
    const done = new Map(rows.map((r) => [r['version'] as string, r['checksum'] as string]));

    // Integrity first: nothing runs if an applied migration changed or vanished.
    const byVersion = new Map(files.map((f) => [f.version, f]));
    for (const [version, checksum] of done) {
      const file = byVersion.get(version);
      if (!file) throw new MigrationError(`Applied migration ${version} has no file on disk`);
      if (file.checksum !== checksum) {
        throw new MigrationError(`Checksum mismatch for applied migration ${file.name}: file was edited after being applied`);
      }
    }

    const result: MigrateResult = { applied: [], alreadyApplied: [] };
    for (const file of files) {
      if (done.has(file.version)) {
        result.alreadyApplied.push(file.name);
        continue;
      }
      log(`applying ${file.name}`);
      try {
        await runScript(conn, file.sql);
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'unknown error';
        throw new MigrationError(`Migration ${file.name} failed: ${reason}`);
      }
      // Recorded only after success; DDL is not transactional, so migrations
      // use IF NOT EXISTS and a re-run after a partial failure is safe.
      // eslint-disable-next-line no-restricted-syntax
      await conn.query(`INSERT INTO \`${table}\` (version, checksum) VALUES (?, ?)`, [file.version, file.checksum]);
      result.applied.push(file.name);
    }
    return result;
  } finally {
    await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => undefined);
  }
}
