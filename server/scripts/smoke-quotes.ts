// End-to-end smoke: POST a realistic FE-shaped QuoteFolioRequest, GET it back by folio, check the round trip.
//   npm run dev        (another shell: API on :3001, local DB)
//   npm run smoke:quotes            # BASE_URL defaults to http://127.0.0.1:3001
// Writes one quote (and counts against the per-IP / per-WhatsApp rate limits) in whatever DB the server uses.
import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { normalizeQuoteCode } from '../../src/integrations/quotes/code.ts';
import type { QuoteLoadResponse } from '../../src/integrations/quotes/types.ts';
import { feRequest } from '../test/fe-request.ts';

const base = process.env['BASE_URL'] ?? 'http://127.0.0.1:3001';
const say = (m: string): void => void process.stdout.write(`${m}\n`);

async function main(): Promise<void> {
  const req = feRequest();
  const post = (): Promise<Response> =>
    fetch(`${base}/api/quote-create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...req, hp: '' }), // the FE adds the honeypot exactly like this
    });

  const created = await post();
  strictEqual(created.status, 201, `POST expected 201, got ${created.status}`);
  strictEqual(created.headers.get('cache-control'), 'no-store');
  const folio = (await created.json()) as { code: string; validUntil: string; total: number };
  const norm = normalizeQuoteCode(folio.code);
  ok(norm.ok && norm.code === folio.code, 'folio is canonical per code.ts');
  strictEqual(folio.total, req.total);
  say(`POST 201 ${folio.code} validUntil=${folio.validUntil}`);

  const replay = await post();
  strictEqual(replay.status, 200, 'same idempotencyKey => 200');
  deepStrictEqual(await replay.json(), folio);
  say('POST replay 200 same folio');

  const loaded = await fetch(`${base}/api/quotes/${folio.code}`);
  strictEqual(loaded.status, 200, `GET expected 200, got ${loaded.status}`);
  const q = (await loaded.json()) as QuoteLoadResponse;
  strictEqual(q.code, folio.code);
  strictEqual(q.validUntil, folio.validUntil);
  strictEqual(q.expired, false);
  strictEqual(q.saved.total, req.total);
  strictEqual(q.saved.transportFee, req.transportFee);
  deepStrictEqual(
    q.items.map((i) => ({ slug: i.productSlug, qty: i.qty, unit: i.savedUnitPrice, line: i.savedLineTotal, config: i.config })),
    req.items.map((i) => ({ slug: i.productSlug, qty: i.qty, unit: i.unitPrice, line: i.lineTotal, config: i.config })),
  );
  ok(!JSON.stringify(q).includes(req.customer.name), 'no PII in GET');
  say('GET 200 round trip equal (config deep-equals), no PII');

  const missing = await fetch(`${base}/api/quotes/ALC-20200101-ZZZZZZZZ`);
  strictEqual(missing.status, 422);
  say('GET invalid format 422');
  say('SMOKE OK');
}

main().catch((err: unknown) => {
  process.stderr.write(`SMOKE FAILED: ${err instanceof Error ? err.message : 'unknown'}\n`);
  process.exit(1);
});
