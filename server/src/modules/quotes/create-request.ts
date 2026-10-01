// POST /api/quote-create: input validation (ADR-011 §5 final contract).
// Layer 1 = zod shape (types, lengths). Layer 2 = business rules in plain code
// (normalization, 2-decimal money, sums in cents, 4 KB config). Both produce the
// same `fields` map of the ADR-003 envelope.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { normalizeQuoteCode } from './folio.ts';
import { isMoney, toCents } from './money.ts';
import { normalizeEmail, normalizeName, normalizeWhatsapp } from './normalize.ts';

export const MAX_ITEMS = 30;
export const MAX_QTY = 999;
export const CONFIG_MAX_BYTES = 4096;

export type FieldIssue = 'required' | 'invalid' | 'too_short' | 'too_long';
export type CreateErrorCode = 'invalid_request' | 'invalid_customer' | 'consent_required' | 'payload_too_large';

const Item = z.object({
  productSlug: z.string().regex(/^[a-z0-9-]{1,80}$/u),
  description: z.string().min(1).max(255),
  qty: z.number().int().min(1).max(MAX_QTY),
  unitPrice: z.number(),
  lineTotal: z.number(),
  config: z.record(z.string(), z.unknown()),
  configSchemaVersion: z.number().int().min(1).max(65535),
  promoRef: z.string().min(1).max(60).nullable(),
});

/** Transport shape of the body (the FE type plus the `hp` honeypot). */
export const QuoteCreateShape = z.object({
  idempotencyKey: z.uuid(),
  supersedesCode: z.string().max(80).optional(),
  customer: z.object({ name: z.string(), whatsapp: z.string(), email: z.string().optional() }),
  delivery: z.object({
    mode: z.enum(['pickup', 'delivery']),
    zone: z.string().max(60).optional(),
    address: z.string().max(255).optional(),
  }),
  items: z.array(Item).min(1).max(MAX_ITEMS),
  transportFee: z.number(),
  total: z.number(),
  // Checked after the other rules so the error priority is deterministic (see pickCode).
  consent: z.boolean().optional(),
  privacyNoticeVersion: z.string().regex(/^[A-Za-z0-9._-]{1,20}$/u),
  hp: z.string().max(200).optional(),
});

export interface ValidItem {
  position: number;
  productSlug: string;
  description: string;
  qty: number;
  unitCents: number;
  lineCents: number;
  /** JSON.stringify of the received config (the bytes we store and measured). */
  configJson: string;
  configSchemaVersion: number;
  promoRef: string | null;
}

export interface ValidCreate {
  idempotencyKey: string;
  supersedesCode: string | null;
  customerName: string;
  customerWhatsapp: string;
  customerEmail: string | null;
  deliveryMode: 'pickup' | 'delivery';
  deliveryZone: string | null;
  deliveryAddress: string | null;
  items: ValidItem[];
  subtotalCents: number;
  transportCents: number;
  totalCents: number;
  privacyNoticeVersion: string;
  honeypot: boolean;
  /** sha256 of the canonical normalized payload (idempotency conflict detection). */
  cartHash: string;
}

export interface CreateRejection {
  status: 413 | 422;
  code: CreateErrorCode;
  message: string;
  fields: Record<string, FieldIssue>;
}

const MESSAGES: Record<CreateErrorCode, string> = {
  invalid_request: 'Revisa los datos de la cotización.',
  invalid_customer: 'Revisa tus datos de contacto.',
  consent_required: 'Falta el consentimiento.',
  payload_too_large: 'Cotización demasiado grande.',
};

function reject(code: CreateErrorCode, fields: Record<string, FieldIssue>): CreateRejection {
  return { status: code === 'payload_too_large' ? 413 : 422, code, message: MESSAGES[code], fields };
}

/** invalid_request wins over invalid_customer, which wins over consent_required. */
function pickCode(fields: Record<string, FieldIssue>): CreateErrorCode {
  const keys = Object.keys(fields);
  if (keys.some((k) => k !== 'consent' && !k.startsWith('customer.'))) return 'invalid_request';
  if (keys.some((k) => k.startsWith('customer.'))) return 'invalid_customer';
  return 'consent_required';
}

function valueAt(root: unknown, path: PropertyKey[]): unknown {
  let cur = root;
  for (const p of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<PropertyKey, unknown>)[p];
  }
  return cur;
}

function zodFields(issues: z.core.$ZodIssue[], body: unknown): Record<string, FieldIssue> {
  const fields: Record<string, FieldIssue> = {};
  for (const iss of issues) {
    const key = iss.path.length ? iss.path.map(String).join('.') : 'body';
    let kind: FieldIssue = 'invalid';
    if (valueAt(body, iss.path) === undefined) kind = 'required';
    else if (iss.code === 'too_small') kind = 'too_short';
    else if (iss.code === 'too_big') kind = 'too_long';
    if (key === 'consent') kind = 'required';
    fields[key] ??= kind;
  }
  return fields;
}

/** Deterministic JSON (sorted keys) for hashing. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

export function validateCreate(body: unknown): { ok: true; data: ValidCreate } | { ok: false; error: CreateRejection } {
  const parsed = QuoteCreateShape.safeParse(body);
  if (!parsed.success) {
    const fields = zodFields(parsed.error.issues, body);
    return { ok: false, error: reject(pickCode(fields), fields) };
  }
  const b = parsed.data;
  const fields: Record<string, FieldIssue> = {};
  if (b.consent !== true) fields['consent'] = 'required';

  const name = normalizeName(b.customer.name);
  if (!name.ok) fields['customer.name'] = name.issue;
  const whatsapp = normalizeWhatsapp(b.customer.whatsapp);
  if (whatsapp === null) fields['customer.whatsapp'] = b.customer.whatsapp.trim() === '' ? 'required' : 'invalid';
  let email: string | null = null;
  if (b.customer.email !== undefined && b.customer.email.trim() !== '') {
    email = normalizeEmail(b.customer.email);
    if (email === null) fields['customer.email'] = 'invalid';
  }

  let supersedes: string | null = null;
  if (b.supersedesCode !== undefined && b.supersedesCode !== '') {
    const n = normalizeQuoteCode(b.supersedesCode);
    if (n.ok) supersedes = n.code;
    else fields['supersedesCode'] = 'invalid';
  }

  if (!isMoney(b.transportFee)) fields['transportFee'] = 'invalid';
  if (!isMoney(b.total)) fields['total'] = 'invalid';

  let subtotal = 0;
  let oversize = false;
  const items: ValidItem[] = b.items.map((it, i) => {
    const unitOk = isMoney(it.unitPrice);
    const lineOk = isMoney(it.lineTotal);
    if (!unitOk) fields[`items.${i}.unitPrice`] = 'invalid';
    if (!lineOk) fields[`items.${i}.lineTotal`] = 'invalid';
    const unitCents = unitOk ? toCents(it.unitPrice) : 0;
    const lineCents = lineOk ? toCents(it.lineTotal) : 0;
    if (unitOk && lineOk && unitCents * it.qty !== lineCents) fields[`items.${i}.lineTotal`] = 'invalid';
    subtotal += lineCents;
    const configJson = JSON.stringify(it.config);
    if (Buffer.byteLength(configJson, 'utf8') > CONFIG_MAX_BYTES) oversize = true;
    return {
      position: i + 1,
      productSlug: it.productSlug,
      description: it.description,
      qty: it.qty,
      unitCents,
      lineCents,
      configJson,
      configSchemaVersion: it.configSchemaVersion,
      promoRef: it.promoRef,
    };
  });

  const transportCents = fields['transportFee'] ? 0 : toCents(b.transportFee);
  const totalCents = fields['total'] ? 0 : toCents(b.total);
  const itemFieldBad = Object.keys(fields).some((k) => k.startsWith('items.'));
  if (!fields['total'] && !itemFieldBad && subtotal + transportCents !== totalCents) fields['total'] = 'invalid';

  if (Object.keys(fields).length) return { ok: false, error: reject(pickCode(fields), fields) };
  if (oversize) return { ok: false, error: reject('payload_too_large', {}) };

  const delivery = b.delivery.mode === 'delivery';
  const hash = createHash('sha256')
    .update(
      stableStringify({
        supersedesCode: supersedes,
        customer: [(name as { value: string }).value, whatsapp, email],
        delivery: [b.delivery.mode, delivery ? b.delivery.zone ?? null : null, delivery ? b.delivery.address ?? null : null],
        items: items.map((it) => ({ ...it, config: JSON.parse(it.configJson) as unknown, configJson: undefined })),
        transportCents,
        totalCents,
        privacyNoticeVersion: b.privacyNoticeVersion,
      }),
    )
    .digest('hex');
  return {
    ok: true,
    data: {
      idempotencyKey: b.idempotencyKey.toLowerCase(),
      supersedesCode: supersedes,
      customerName: (name as { value: string }).value,
      customerWhatsapp: whatsapp as string,
      customerEmail: email,
      deliveryMode: b.delivery.mode,
      deliveryZone: delivery ? b.delivery.zone?.trim() || null : null,
      deliveryAddress: delivery ? b.delivery.address?.trim() || null : null,
      items,
      subtotalCents: subtotal,
      transportCents,
      totalCents,
      privacyNoticeVersion: b.privacyNoticeVersion,
      honeypot: (b.hp ?? '') !== '',
      cartHash: hash,
    },
  };
}
