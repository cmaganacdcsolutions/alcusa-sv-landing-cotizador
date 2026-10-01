import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadMigrateConfig } from '../../src/config/index.ts';
import { connectMigrate, MigrationError, runMigrations } from '../../src/db/migrator.ts';
import { MIGRATIONS_DIR } from '../../src/db/paths.ts';

const TABLE = 'schema_migrations_fx';
const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'migrations-ok');
const cfg = () => loadMigrateConfig({ ...process.env, NODE_ENV: 'test' });
let conn: Connection;
let work: string;

async function cleanup(): Promise<void> {
  await conn.query('DROP TABLE IF EXISTS fx_a, fx_b, schema_migrations_fx');
}
async function versions(): Promise<string[]> {
  const [rows] = await conn.query<RowDataPacket[]>('SELECT version FROM schema_migrations_fx ORDER BY version');
  return rows.map((r) => r['version'] as string);
}

beforeAll(async () => {
  conn = await connectMigrate(cfg());
  await cleanup();
});
afterAll(async () => {
  await cleanup();
  await conn.end();
});
beforeEach(async () => {
  await cleanup();
  work = await mkdtemp(join(tmpdir(), 'alcusa-mig-'));
  await cp(FIXTURES, work, { recursive: true });
});

describe('migration runner (fixtures, alcusa_test)', () => {
  it('applies in order, records checksums, and is idempotent', async () => {
    const first = await runMigrations(conn, { dir: work, table: TABLE });
    expect(first.applied).toEqual(['0001_fx_first.sql', '0002_fx_second.sql']);
    const [rows] = await conn.query<RowDataPacket[]>('SELECT version, checksum FROM schema_migrations_fx ORDER BY version');
    expect(rows.map((r) => r['version'])).toEqual(['0001', '0002']);
    expect(rows[0]?.['checksum']).toMatch(/^[0-9a-f]{64}$/);
    const [data] = await conn.query<RowDataPacket[]>('SELECT note FROM fx_a WHERE id = 1');
    expect(data[0]?.['note']).toBe('a;b');

    const second = await runMigrations(conn, { dir: work, table: TABLE });
    expect(second.applied).toEqual([]);
    expect(second.alreadyApplied).toHaveLength(2);
  });

  it('aborts when an applied migration was edited, applying nothing new', async () => {
    await runMigrations(conn, { dir: work, table: TABLE });
    const file = join(work, '0001_fx_first.sql');
    await writeFile(file, `${await readFile(file, 'utf8')}-- tampered\n`);
    await writeFile(join(work, '0003_fx_third.sql'), 'SELECT 1;\n');
    await expect(runMigrations(conn, { dir: work, table: TABLE })).rejects.toThrowError(/Checksum mismatch/);
    expect(await versions()).toEqual(['0001', '0002']);
  });

  it('CRLF checkouts hash the same as LF', async () => {
    await runMigrations(conn, { dir: work, table: TABLE });
    const file = join(work, '0002_fx_second.sql');
    await writeFile(file, (await readFile(file, 'utf8')).replace(/\n/g, '\r\n'));
    expect((await runMigrations(conn, { dir: work, table: TABLE })).applied).toEqual([]);
  });

  it('aborts when an applied migration file disappears; rejects bad file names', async () => {
    await runMigrations(conn, { dir: work, table: TABLE });
    await rm(join(work, '0002_fx_second.sql'));
    await expect(runMigrations(conn, { dir: work, table: TABLE })).rejects.toThrowError(/no file on disk/);
    await writeFile(join(work, 'bad name.sql'), 'SELECT 1;');
    await expect(runMigrations(conn, { dir: work, table: TABLE })).rejects.toBeInstanceOf(MigrationError);
  });

  it('does not record a migration that failed', async () => {
    await runMigrations(conn, { dir: work, table: TABLE });
    await writeFile(join(work, '0003_fx_broken.sql'), 'CREATE TABLE fx_a (nope;\n');
    await expect(runMigrations(conn, { dir: work, table: TABLE })).rejects.toThrowError(/0003_fx_broken.sql failed/);
    expect(await versions()).toEqual(['0001', '0002']);
  });

  it('waits for the GET_LOCK held by another session', async () => {
    const other = await connectMigrate(cfg());
    try {
      await other.query("SELECT GET_LOCK('alcusa_migrate', 0)");
      setTimeout(() => void other.query("SELECT RELEASE_LOCK('alcusa_migrate')"), 400);
      const t0 = Date.now();
      const res = await runMigrations(conn, { dir: work, table: TABLE });
      expect(Date.now() - t0).toBeGreaterThanOrEqual(300);
      expect(res.applied).toHaveLength(2);
    } finally {
      await other.end();
    }
  });
});

describe('real migrations on alcusa_test', () => {
  it('a second run (after globalSetup) applies nothing', async () => {
    const res = await runMigrations(conn, { dir: MIGRATIONS_DIR });
    expect(res.applied).toEqual([]);
    expect(res.alreadyApplied.length).toBeGreaterThan(0);
  });
});
