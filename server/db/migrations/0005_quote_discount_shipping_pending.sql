-- 0005_quote_discount_shipping_pending.sql (renumbered from 0002: admin-v1 owns 0002-0004)
--
-- Business rules confirmed by the client owner on 2026-10-06:
--   1. 10% online-card discount (code online_card_10) over the item subtotals (never over shipping).
--   2. "Shipping pending": the distrito has no automatic fee, transport_fee = 0 and Alcusa confirms by WhatsApp.
-- A quote now satisfies  total = subtotal - discount_amount + transport_fee  (was: subtotal + transport_fee).
--
-- expand step (db/README rule 2): new columns are NULL / DEFAULT 0 and the relaxed CHECK still accepts every row
-- the previous release writes (discount_amount defaults to 0), so migrate-then-deploy and rollback-by-symlink are both safe.
-- Guarded (IF [NOT] EXISTS) because DDL auto-commits and a partial run must be re-runnable. MariaDB 10.11 / 11.4.
-- No data is dropped or rewritten. Rollback (only if no discounted quote exists yet):
--   ALTER TABLE quotes DROP CONSTRAINT IF EXISTS ck_quotes_discount
--   ALTER TABLE quotes DROP CONSTRAINT IF EXISTS ck_quotes_money
--   ALTER TABLE quotes ADD CONSTRAINT ck_quotes_money CHECK (subtotal >= 0 AND transport_fee >= 0 AND total >= 0 AND total = subtotal + transport_fee)
--   ALTER TABLE quotes DROP COLUMN IF EXISTS shipping_pending, DROP COLUMN IF EXISTS discount_amount, DROP COLUMN IF EXISTS discount_code
-- The public GET /api/quotes/{code} column list is NOT changed (db/README "Public-read rule").

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS discount_code VARCHAR(30) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER transport_fee;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER discount_code;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS shipping_pending TINYINT(1) NOT NULL DEFAULT 0 AFTER discount_amount;
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS ck_quotes_money;
ALTER TABLE quotes ADD CONSTRAINT ck_quotes_money CHECK (subtotal >= 0 AND transport_fee >= 0 AND total >= 0 AND discount_amount >= 0 AND discount_amount <= subtotal AND total = subtotal - discount_amount + transport_fee);
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS ck_quotes_discount;
ALTER TABLE quotes ADD CONSTRAINT ck_quotes_discount CHECK ((discount_code IS NULL AND discount_amount = 0) OR (discount_code IS NOT NULL AND discount_amount > 0));
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS ck_quotes_shipping_pending;
ALTER TABLE quotes ADD CONSTRAINT ck_quotes_shipping_pending CHECK (shipping_pending IN (0, 1) AND (shipping_pending = 0 OR transport_fee = 0));
