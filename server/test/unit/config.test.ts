import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, loadMigrateConfig } from '../../src/config/index.ts';

const base = {
  DB_HOST: '127.0.0.1',
  DB_NAME: 'alcusa_dev',
  DB_APP_USER: 'alcusa_app',
  DB_APP_PASSWORD: 'super-secret-value-123',
};

describe('loadConfig', () => {
  it('applies defaults and coerces types', () => {
    const c = loadConfig(base);
    expect(c.PORT).toBe(3001);
    expect(c.HOST).toBe('127.0.0.1');
    expect(c.TRUST_PROXY).toBe(false);
    expect(c.WOMPI_MODE).toBe('mock');
    expect(c.dbName).toBe('alcusa_dev');
  });

  it('uses DB_TEST_NAME when NODE_ENV=test', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'test' }).dbName).toBe('alcusa_test');
  });

  it('treats empty strings as unset', () => {
    expect(loadConfig({ ...base, SERVE_STATIC_DIR: '', SECRETS_KEY: '' }).SERVE_STATIC_DIR).toBeUndefined();
  });

  it('lists missing variable NAMES only, never values', () => {
    try {
      loadConfig({ DB_HOST: '127.0.0.1', DB_APP_PASSWORD: 'super-secret-value-123' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const err = e as ConfigError;
      expect(err.missing).toEqual(['DB_APP_USER', 'DB_NAME']);
      expect(err.message).toContain('DB_APP_USER, DB_NAME');
      expect(err.message).not.toContain('super-secret-value-123');
      expect(err.message).not.toContain('127.0.0.1');
    }
  });

  it('reports invalid values by name without echoing them', () => {
    expect(() => loadConfig({ ...base, PORT: 'not-a-number' })).toThrowError(/invalid: PORT/);
    expect(() => loadConfig({ ...base, PORT: 'not-a-number' })).not.toThrowError(/not-a-number/);
  });

  it('requires SECRETS_KEY and IP_HASH_PEPPER in production and forbids SERVE_STATIC_DIR', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', SERVE_STATIC_DIR: '../dist' })).toThrowError(
      /missing: IP_HASH_PEPPER, SECRETS_KEY; invalid: SERVE_STATIC_DIR/,
    );
  });

  it('WOMPI_MODE=live needs production; sandbox/live need the Wompi vars', () => {
    expect(() => loadConfig({ ...base, WOMPI_MODE: 'live' })).toThrowError(/WOMPI_MODE/);
    expect(() => loadConfig({ ...base, WOMPI_MODE: 'sandbox' })).toThrowError(/WOMPI_API_SECRET/);
    const ok = loadConfig({
      ...base,
      WOMPI_MODE: 'sandbox',
      WOMPI_APP_ID: 'a',
      WOMPI_API_SECRET: 'b',
      WOMPI_API_BASE: 'https://x.test',
      WOMPI_AUTH_URL: 'https://y.test',
    });
    expect(ok.WOMPI_MODE).toBe('sandbox');
  });
});

describe('loadMigrateConfig', () => {
  it('needs the DDL credentials', () => {
    expect(() => loadMigrateConfig({ DB_HOST: 'h', DB_NAME: 'n' })).toThrowError(/DB_MIGRATE_PASSWORD, DB_MIGRATE_USER/);
  });
});
