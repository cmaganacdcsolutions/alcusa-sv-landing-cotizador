import type { FastifyError, FastifyInstance } from 'fastify';

/** ADR-003 envelope: every non-2xx body is exactly this. */
export interface ErrorEnvelope {
  error: { code: string; message: string };
}

export function envelope(code: string, message: string): ErrorEnvelope {
  return { error: { code, message } };
}

/** Throw from services/handlers to produce a specific 4xx envelope. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const CLIENT_CODES: Record<number, string> = {
  400: 'invalid_request',
  404: 'not_found',
  405: 'method_not_allowed',
  413: 'payload_too_large',
  415: 'invalid_request',
  422: 'invalid_request',
  429: 'rate_limited',
};

export function installErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((_req, reply) => {
    void reply.code(404).send(envelope('not_found', 'Not found'));
  });

  app.setErrorHandler((err: FastifyError | AppError, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send(envelope(err.code, err.message));
    }
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    if (status >= 400 && status < 500) {
      const code = CLIENT_CODES[status] ?? 'invalid_request';
      return reply.code(status).send(envelope(code, 'Invalid request'));
    }
    // 5xx: log with stack (server-side only), never leak to the client.
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send(envelope('server_error', 'Internal server error'));
  });
}
