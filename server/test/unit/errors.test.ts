import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/http/app.ts';
import { AppError } from '../../src/http/errors.ts';

const config = { LOG_LEVEL: 'silent', TRUST_PROXY: false, NODE_ENV: 'test', SERVE_STATIC_DIR: undefined } as const;
let app: FastifyInstance;
afterEach(async () => {
  await app.close();
});

describe('error envelope', () => {
  it('unknown route -> 404 {error:{code,message}}', async () => {
    app = await buildApp({ config });
    const res = await app.inject('/api/nope');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
  });

  it('AppError keeps its status and code', async () => {
    app = await buildApp({ config });
    app.get('/t', () => {
      throw new AppError(409, 'idempotency_conflict', 'conflict');
    });
    const res = await app.inject('/t');
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: { code: 'idempotency_conflict', message: 'conflict' } });
  });

  it('malformed JSON -> 400 invalid_request', async () => {
    app = await buildApp({ config });
    app.post('/t', () => ({}));
    const res = await app.inject({ method: 'POST', url: '/t', headers: { 'content-type': 'application/json' }, payload: '{bad' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_request');
  });

  it('oversized body -> 413 payload_too_large', async () => {
    app = await buildApp({ config });
    app.post('/t', () => ({}));
    const res = await app.inject({ method: 'POST', url: '/t', payload: { a: 'x'.repeat(70_000) } });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('payload_too_large');
  });

  it('unexpected error -> 500 server_error without leaking the message or stack', async () => {
    app = await buildApp({ config });
    app.get('/t', () => {
      throw new Error('mysql://user:pw@host exploded');
    });
    const res = await app.inject('/t');
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('mysql');
    expect(res.json()).toEqual({ error: { code: 'server_error', message: 'Internal server error' } });
  });

  it('sets helmet headers and echoes a request id', async () => {
    app = await buildApp({ config });
    const res = await app.inject({ url: '/api/health', headers: { 'x-request-id': 'req-abc-12345' } });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-request-id']).toBe('req-abc-12345');
    const generated = await app.inject('/api/health');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('health', () => {
  it('GET /api/health -> 200 {status:ok} without touching the DB', async () => {
    app = await buildApp({ config });
    const res = await app.inject('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
