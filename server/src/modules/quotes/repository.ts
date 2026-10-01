// Quotes persistence. Parameterized SQL only. The public read selects an explicit,
// PII-free column list (db/README "Public-read rule"); never SELECT *.
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { ValidCreate } from './create-request.ts';
import { centsToDecimal } from './money.ts';

export interface InsertContext {
  code: string;
  validUntil: string;
  /** UTC `YYYY-MM-DD HH:MM:SS` */
  consentAt: string;
  ipHash: string;
  supersedesQuoteId: number | null;
}

export interface ExistingQuote {
  code: string;
  validUntil: string;
  total: string;
  cartHash: string | null;
}

export async function findByIdempotencyKey(pool: Pool, key: string): Promise<ExistingQuote | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT code, valid_until, total, client_cart_hash FROM quotes WHERE idempotency_key = ?',
    [key],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    code: String(r['code']),
    validUntil: String(r['valid_until']),
    total: String(r['total']),
    cartHash: r['client_cart_hash'] === null ? null : String(r['client_cart_hash']),
  };
}

export async function findIdByCode(pool: Pool, code: string): Promise<number | null> {
  const [rows] = await pool.execute<RowDataPacket[]>('SELECT id FROM quotes WHERE code = ?', [code]);
  return rows[0] ? Number(rows[0]['id']) : null;
}

/** Quote + items in ONE transaction; rolls back on any failure and rethrows. */
export async function insertQuote(pool: Pool, d: ValidCreate, c: InsertContext): Promise<void> {
  const conn: PoolConnection = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.execute<ResultSetHeader>(
      `INSERT INTO quotes (code, idempotency_key, status, supersedes_quote_id, customer_name, customer_whatsapp, customer_email,
         consent_at, privacy_notice_version, delivery_mode, delivery_zone, delivery_address, subtotal, transport_fee, total,
         currency, valid_until, pricing_source, client_cart_hash, source, ip_hash)
       VALUES (?, ?, 'issued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, 'client', ?, 'cotizador', ?)`,
      [
        c.code,
        d.idempotencyKey,
        c.supersedesQuoteId,
        d.customerName,
        d.customerWhatsapp,
        d.customerEmail,
        c.consentAt,
        d.privacyNoticeVersion,
        d.deliveryMode,
        d.deliveryZone,
        d.deliveryAddress,
        centsToDecimal(d.subtotalCents),
        centsToDecimal(d.transportCents),
        centsToDecimal(d.totalCents),
        c.validUntil,
        d.cartHash,
        c.ipHash,
      ],
    );
    for (const it of d.items) {
      await conn.execute(
        `INSERT INTO quote_items (quote_id, position, product_slug, description, qty, unit_price, line_total, config, config_schema_version, promo_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          res.insertId,
          it.position,
          it.productSlug,
          it.description,
          it.qty,
          centsToDecimal(it.unitCents),
          centsToDecimal(it.lineCents),
          it.configJson,
          it.configSchemaVersion,
          it.promoRef,
        ],
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => undefined);
    throw err;
  } finally {
    conn.release();
  }
}

export interface PublicQuoteRow {
  code: string;
  createdAt: string;
  validUntil: string;
  deliveryMode: 'pickup' | 'delivery';
  deliveryZone: string | null;
  subtotal: string;
  transportFee: string;
  total: string;
  currency: string;
  items: {
    position: number;
    productSlug: string;
    description: string;
    qty: number;
    unitPrice: string;
    lineTotal: string;
    promoRef: string | null;
    configSchemaVersion: number;
    config: unknown;
  }[];
}

/** Single query for found / not found / cancelled (same path for all, ADR-012 §4). */
export const PUBLIC_QUOTE_SQL = `SELECT q.code, q.created_at, q.valid_until, q.delivery_mode, q.delivery_zone, q.subtotal, q.transport_fee, q.total, q.currency,
       i.position, i.product_slug, i.description, i.qty, i.unit_price, i.line_total, i.promo_ref, i.config_schema_version, i.config
  FROM quotes q
  LEFT JOIN quote_items i ON i.quote_id = q.id
 WHERE q.code = ? AND q.status <> 'cancelled'
 ORDER BY i.position ASC`;

export async function findPublicByCode(pool: Pool, code: string): Promise<PublicQuoteRow | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(PUBLIC_QUOTE_SQL, [code]);
  const first = rows[0];
  if (!first) return null;
  return {
    code: String(first['code']),
    createdAt: String(first['created_at']),
    validUntil: String(first['valid_until']),
    deliveryMode: first['delivery_mode'] as 'pickup' | 'delivery',
    deliveryZone: first['delivery_zone'] === null ? null : String(first['delivery_zone']),
    subtotal: String(first['subtotal']),
    transportFee: String(first['transport_fee']),
    total: String(first['total']),
    currency: String(first['currency']),
    items: rows
      .filter((r) => r['position'] !== null)
      .map((r) => ({
        position: Number(r['position']),
        productSlug: String(r['product_slug']),
        description: String(r['description']),
        qty: Number(r['qty']),
        unitPrice: String(r['unit_price']),
        lineTotal: String(r['line_total']),
        promoRef: r['promo_ref'] === null ? null : String(r['promo_ref']),
        configSchemaVersion: Number(r['config_schema_version']),
        config: r['config'],
      })),
  };
}
