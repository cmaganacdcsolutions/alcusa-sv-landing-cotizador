import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/http/app.ts';

let app: FastifyInstance;
afterEach(async () => {
  await app.close();
});

describe('logging', () => {
  it('emits JSON lines with request id and redacts sensitive fields', async () => {
    const lines: string[] = [];
    const logStream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    app = await buildApp({
      config: { LOG_LEVEL: 'info', TRUST_PROXY: false, NODE_ENV: 'test', SERVE_STATIC_DIR: undefined },
      logStream,
    });
    app.get('/t', (req) => {
      req.log.info(
        {
          customer: { name: 'Ana', whatsapp: '7000-0000' },
          password: 'hunter2',
          wompi_hash: 'abc',
          nested: { cookie: 'sid=1', totp: '123456' },
        },
        'probe',
      );
      return {};
    });
    await app.inject({
      url: '/t',
      headers: { cookie: 'sid=SECRETCOOKIE', authorization: 'Bearer SECRETTOKEN', 'x-request-id': 'req-log-12345' },
    });

    const out = lines.join('');
    for (const secret of ['Ana', '7000-0000', 'hunter2', 'SECRETCOOKIE', 'SECRETTOKEN', '123456', 'sid=1']) {
      expect(out).not.toContain(secret);
    }
    const parsed = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    const probe = parsed.find((l) => l['msg'] === 'probe');
    expect(probe?.['reqId']).toBe('req-log-12345');
    expect(probe?.['customer']).toBe('[Redacted]');
    expect(probe?.['password']).toBe('[Redacted]');
  });
});
