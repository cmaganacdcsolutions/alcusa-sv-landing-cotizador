// Type-level contract test (ADR-013 §2.1). Run by `vitest --typecheck`
// (enabled in vitest.config.ts) and by `npm run typecheck`. If the zod schemas
// and the FE types diverge, `npm run server:test` fails.
import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import type { QuoteLoadResponse } from '../../src/integrations/quotes/types.ts';
import type { QuoteFolioRequest } from '../../src/lib/quote-folio/index.ts';
import { QuoteFolioRequestSchema, QuoteLoadResponseSchema } from '../src/modules/quotes/schemas.ts';

describe('FE <-> server contract', () => {
  it('QuoteFolioRequest matches the zod schema', () => {
    expectTypeOf<z.infer<typeof QuoteFolioRequestSchema>>().toEqualTypeOf<QuoteFolioRequest>();
  });
  it('QuoteLoadResponse matches the zod schema', () => {
    expectTypeOf<z.infer<typeof QuoteLoadResponseSchema>>().toEqualTypeOf<QuoteLoadResponse>();
  });
});
