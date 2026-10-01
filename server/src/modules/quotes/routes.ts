import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { AppError, envelope } from '../../http/errors.ts';
import { validateCreate } from './create-request.ts';
import { QuoteService, isRateLimited, type QuoteServiceDeps } from './service.ts';

export const QUOTE_CREATE_BODY_LIMIT = 32 * 1024; // ADR-011 §5: <= 32 KB

function noStore(reply: FastifyReply): void {
  void reply.header('cache-control', 'no-store');
}

function sendRateLimited(reply: FastifyReply, retryAfterSec: number, message: string) {
  void reply.header('retry-after', String(retryAfterSec));
  return reply.code(429).send(envelope('rate_limited', message));
}

export function registerQuoteRoutes(app: FastifyInstance, deps: QuoteServiceDeps): QuoteService {
  const service = new QuoteService(deps);

  // B3 part 1 (N1)
  app.post('/api/quote-create', { bodyLimit: QUOTE_CREATE_BODY_LIMIT }, async (req, reply) => {
    noStore(reply);
    const v = validateCreate(req.body);
    if (!v.ok) {
      const e = v.error;
      return reply.code(e.status).send({
        error: { code: e.code, message: e.message, ...(Object.keys(e.fields).length ? { fields: e.fields } : {}) },
      });
    }
    // Honeypot: a human never fills `hp`. Generic 422, nothing persisted, no counters learned.
    if (v.data.honeypot) return reply.code(422).send(envelope('invalid_request', 'Revisa los datos de la cotización.'));
    try {
      const out = await service.create(v.data, req.ip);
      return reply.code(out.status).send(out.body);
    } catch (err) {
      if (isRateLimited(err)) return sendRateLimited(reply, err.retryAfterSec, err.message);
      throw err;
    }
  });

  // B6 (N2)
  app.get<{ Params: { code: string } }>('/api/quotes/:code', async (req, reply) => {
    noStore(reply);
    const started = process.hrtime.bigint();
    const codeHash = createHash('sha256').update(req.params.code).digest('hex').slice(0, 12);
    const logLoad = (result: 'ok' | 'not_found' | 'invalid' | 'rate_limited'): void => {
      req.log.info(
        { event: 'quote_load', result, ipHash: service.ipHash(req.ip).slice(0, 12), codeHash, latencyMs: Number((process.hrtime.bigint() - started) / 1_000_000n) },
        'quote_load',
      );
    };
    try {
      const out = await service.load(req.params.code, req.ip);
      logLoad('ok');
      return reply.code(200).send(out.body);
    } catch (err) {
      if (isRateLimited(err)) {
        logLoad('rate_limited');
        return sendRateLimited(reply, err.retryAfterSec, err.message);
      }
      if (err instanceof AppError) {
        logLoad(err.statusCode === 422 ? 'invalid' : 'not_found');
        return reply.code(err.statusCode).send(envelope(err.code, err.message));
      }
      throw err;
    }
  });

  return service;
}
