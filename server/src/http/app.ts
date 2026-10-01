import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { Writable } from 'node:stream';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'mysql2/promise';
import type { Config } from '../config/index.ts';
import { pingDb } from '../db/pool.ts';
import { envelope, installErrorHandling } from './errors.ts';

/** pino redact paths (ADR-013 §2.6). Applies to bound objects and request headers. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["wompi_hash"]',
  'res.headers["set-cookie"]',
  'authorization',
  'cookie',
  'wompi_hash',
  'customer',
  'password',
  'totp',
  '*.authorization',
  '*.cookie',
  '*.wompi_hash',
  '*.customer',
  '*.password',
  '*.totp',
];

export interface AppDeps {
  config: Pick<Config, 'LOG_LEVEL' | 'TRUST_PROXY' | 'NODE_ENV' | 'SERVE_STATIC_DIR'>;
  /** Absent in pure unit tests: /health/ready then answers 503. */
  pool?: Pool;
  /** Tests inject a stream to assert on log output. */
  logStream?: Writable;
}

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, pool } = deps;
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
      ...(deps.logStream ? { stream: deps.logStream } : {}),
    },
    trustProxy: config.TRUST_PROXY ? '127.0.0.1' : false,
    bodyLimit: 64 * 1024,
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    },
  });

  const serveStatic = config.NODE_ENV !== 'production' && config.SERVE_STATIC_DIR;
  await app.register(helmet, {
    // Static serving is dev/e2e only: Astro pages use inline scripts, so the
    // API-grade CSP would break them. The real CSP lives in Nginx in prod.
    contentSecurityPolicy: serveStatic ? false : { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  app.addHook('onSend', (req, reply, payload, done) => {
    void reply.header('x-request-id', req.id);
    done(null, payload);
  });

  installErrorHandling(app);

  app.get('/api/health', async (_req, reply) => {
    void reply.header('cache-control', 'no-store');
    return { status: 'ok' };
  });

  app.get('/api/health/ready', async (_req, reply) => {
    void reply.header('cache-control', 'no-store');
    if (pool && (await pingDb(pool))) return { status: 'ok' };
    // No details: never reveal host, user or driver error text.
    return reply.code(503).send(envelope('unavailable', 'Service unavailable'));
  });

  if (serveStatic) {
    await app.register(fastifyStatic, { root: resolve(serveStatic), wildcard: true });
  }

  return app;
}
