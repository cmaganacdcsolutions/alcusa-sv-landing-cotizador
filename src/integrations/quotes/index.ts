// Seleccion del adaptador: PUBLIC_QUOTE_API = mock | http.
// Defecto: mock en dev/test, http en builds de produccion (import.meta.env.PROD).
import type { QuoteClient } from './types';
import { createHttpQuoteClient } from './httpClient';
import { createMockQuoteClient } from './mockClient';

export type QuoteApiMode = 'mock' | 'http';

export function resolveQuoteApiMode(raw: string | undefined, isProd: boolean): QuoteApiMode {
  if (raw === 'mock' || raw === 'http') return raw;
  return isProd ? 'http' : 'mock';
}

export function createQuoteClient(mode: QuoteApiMode): QuoteClient {
  return mode === 'http' ? createHttpQuoteClient() : createMockQuoteClient();
}

export function getQuoteClient(): QuoteClient {
  return createQuoteClient(resolveQuoteApiMode(import.meta.env.PUBLIC_QUOTE_API, import.meta.env.PROD));
}
export * from './types';
