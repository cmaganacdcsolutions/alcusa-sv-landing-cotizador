// Seleccion del adaptador: PUBLIC_QUOTE_API = mock | http.
// Defecto: mock SIEMPRE (dev, test y produccion) mientras no exista el backend B3/B6 desplegado:
// un build de prod sin PUBLIC_QUOTE_API jamas debe quedar en http por omision (bug 2026-10-22: todo folio
// salia como contingencia y "Cargar cotizacion" fallaba). http solo con PUBLIC_QUOTE_API=http explicito.
import type { QuoteClient } from './types';
import { createHttpQuoteClient } from './httpClient';
import { createMockQuoteClient } from './mockClient';

export type QuoteApiMode = 'mock' | 'http';

export function resolveQuoteApiMode(raw: string | undefined): QuoteApiMode {
  return raw === 'http' ? 'http' : 'mock';
}

export function createQuoteClient(mode: QuoteApiMode): QuoteClient {
  return mode === 'http' ? createHttpQuoteClient() : createMockQuoteClient();
}

export function getQuoteClient(): QuoteClient {
  return createQuoteClient(resolveQuoteApiMode(import.meta.env.PUBLIC_QUOTE_API));
}
export * from './types';
