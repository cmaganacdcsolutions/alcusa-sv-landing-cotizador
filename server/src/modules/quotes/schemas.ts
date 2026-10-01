// Contract schemas (ADR-013 §2.1: one source per contract, zod at the border).
// N0 ships the SHAPES only, matching the FE types 1:1 (checked by
// test/contract.test-d.ts). N1 (quote-create) and N2 (quotes/{code}) own the
// business refinements (limits, normalization, 4 KB config cap) on top of these.
import { z } from 'zod';

const money = z.number().min(0);

export const QuoteFolioItemSchema = z.object({
  productSlug: z.string().min(1),
  description: z.string(),
  qty: z.number().int().min(1),
  unitPrice: money,
  lineTotal: money,
  config: z.record(z.string(), z.unknown()),
  configSchemaVersion: z.number().int(),
  promoRef: z.string().nullable(),
});

export const QuoteFolioRequestSchema = z.object({
  idempotencyKey: z.uuid(),
  supersedesCode: z.string().optional(),
  customer: z.object({ name: z.string(), whatsapp: z.string(), email: z.string().optional() }),
  delivery: z.object({
    mode: z.enum(['pickup', 'delivery']),
    zone: z.string().optional(),
    address: z.string().optional(),
  }),
  items: z.array(QuoteFolioItemSchema),
  transportFee: money,
  total: money,
  consent: z.literal(true),
  privacyNoticeVersion: z.string(),
});

export const QuoteLoadItemSchema = z.object({
  position: z.number().int(),
  productSlug: z.string(),
  description: z.string(),
  qty: z.number().int(),
  savedUnitPrice: z.number(),
  savedLineTotal: z.number(),
  promoRef: z.string().nullable(),
  configSchemaVersion: z.number().int(),
  config: z.record(z.string(), z.unknown()),
});

export const QuoteLoadResponseSchema = z.object({
  code: z.string(),
  createdAt: z.string(),
  validUntil: z.string(),
  expired: z.boolean(),
  currency: z.literal('USD'),
  delivery: z.object({ mode: z.enum(['pickup', 'delivery']), zone: z.string().nullable() }),
  items: z.array(QuoteLoadItemSchema),
  saved: z.object({ subtotal: z.number(), transportFee: z.number(), total: z.number() }),
});
