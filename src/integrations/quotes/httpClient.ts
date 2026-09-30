// Adaptador real (B6, aun no desplegado). GET /api/quotes/{code}, sin cookies,
// sin cache (ADR-012 §3/§4). Mapea cada status documentado a QuoteLoadFailure.
import { QuoteLoadFailure, type QuoteClient, type QuoteLoadResponse } from './types';

export const QUOTES_API_PATH = '/api/quotes';

export function createHttpQuoteClient(baseUrl: string = '', fetchImpl: typeof fetch = fetch): QuoteClient {
  return {
    async getQuote(code, opts) {
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}${QUOTES_API_PATH}/${encodeURIComponent(code)}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'omit',
          cache: 'no-store',
          signal: opts?.signal,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        throw new QuoteLoadFailure('offline');
      }
      if (res.ok) {
        try {
          return (await res.json()) as QuoteLoadResponse;
        } catch {
          throw new QuoteLoadFailure('server_error');
        }
      }
      if (res.status === 404) throw new QuoteLoadFailure('not_found');
      if (res.status === 422) throw new QuoteLoadFailure('invalid_code');
      if (res.status === 429) {
        const retry = Number(res.headers.get('Retry-After'));
        throw new QuoteLoadFailure('rate_limited', Number.isFinite(retry) && retry > 0 ? retry : undefined);
      }
      throw new QuoteLoadFailure('server_error');
    },
  };
}
