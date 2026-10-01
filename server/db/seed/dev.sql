-- seed/dev.sql  (LOCAL/DEV ONLY. The db:seed wrapper must refuse to run when NODE_ENV=production.)
--
-- Idempotent: removes its own rows (fixed ids 9001-9099 / fixed folios) and re-inserts them.
-- Needs DELETE on quotes/promotions/contacts, so run it with the alcusa_migrate account (the app
-- account deliberately cannot delete quotes). Tests must NOT depend on this file (they use builders).
-- No real PII: obviously fake names, +503 7000-000x numbers. No session variables are used, so the
-- statements can run one by one on any connection. Plain statements, each ends with a semicolon at
-- end of line, no semicolons inside strings or comments.
--
-- Folios were computed with the exact algorithm of src/integrations/quotes/code.ts (makeQuoteCode):
--   check = ALPHABET[(sum v_i*(i+1)) mod 31] over the 7 random chars, ALPHABET = Crockford (no I L O U).
--   ADR vector K7QM3X9 -> ALC-20260930-K7QM3X90 verified with the same script.
--   ALC-20260930-D3VK7QMR  (random D3VK7QM)   ALC-20261001-H8T2NWB4  (H8T2NWB)   ALC-20260901-R5C9XJ4F  (R5C9XJ4)

-- ---------------------------------------------------------------------------
-- cleanup of previous seed runs
-- ---------------------------------------------------------------------------
DELETE FROM quotes WHERE code IN ('ALC-20260930-D3VK7QMR', 'ALC-20261001-H8T2NWB4', 'ALC-20260901-R5C9XJ4F');
DELETE FROM promotions WHERE id BETWEEN 9001 AND 9099;
DELETE FROM contacts WHERE id BETWEEN 9001 AND 9099;

-- ---------------------------------------------------------------------------
-- promotions: 3 published (the cap) with a window around today, 1 draft, 1 archived
-- ---------------------------------------------------------------------------
INSERT INTO promotions (id, title, description, price_before, price_promo, image_key, image_alt, product_slug, starts_on, ends_on, status, sort_order) VALUES
(9001, 'Puerta de baño recta', 'Vidrio claro y perfil a tu elección, fabricada a tu medida.', 260.00, 222.00, NULL, 'Puerta de baño recta corrediza con vidrio claro', 'recta', DATE_SUB(CURDATE(), INTERVAL 7 DAY), DATE_ADD(CURDATE(), INTERVAL 30 DAY), 'published', 1),
(9002, 'Ventana Francesa', 'Luz natural y ventilación con perfil negro de aluminio.', 127.00, 108.00, NULL, 'Ventanas francesas con perfil negro', 'ventana-francesa', DATE_SUB(CURDATE(), INTERVAL 7 DAY), DATE_ADD(CURDATE(), INTERVAL 30 DAY), 'published', 2),
(9003, 'Puerta de jardín 3 hojas', 'Corrediza, para conectar tu casa con el jardín.', 482.00, 410.00, NULL, 'Puerta de jardín corrediza de tres hojas', 'jardin-3-hojas', DATE_SUB(CURDATE(), INTERVAL 7 DAY), DATE_ADD(CURDATE(), INTERVAL 45 DAY), 'published', 3),
(9004, 'Borrador: promo de fin de año', 'Texto de prueba, aún sin publicar.', NULL, 199.00, NULL, NULL, 'recta', DATE_ADD(CURDATE(), INTERVAL 60 DAY), DATE_ADD(CURDATE(), INTERVAL 90 DAY), 'draft', 4),
(9005, 'Archivada: promo del mes pasado', 'Promoción vencida y archivada.', 300.00, 250.00, NULL, 'Promo archivada de prueba', 'recta', DATE_SUB(CURDATE(), INTERVAL 60 DAY), DATE_SUB(CURDATE(), INTERVAL 30 DAY), 'archived', 5);

INSERT INTO promotion_rules (promotion_id, rule_type, params, position, enabled, schema_version) VALUES
(9001, 'terms', '{"text":"Válida hasta agotar existencias. No acumulable con otras promociones."}', 1, 1, 1);

-- ---------------------------------------------------------------------------
-- quotes (customer data is fake)
-- A: delivery, 2 items, valid.  B: pickup, 1 item with promo_ref, valid.  C: delivery, expired.
-- ---------------------------------------------------------------------------
INSERT INTO quotes (code, idempotency_key, status, supersedes_quote_id, customer_name, customer_whatsapp, customer_email, consent_at, privacy_notice_version, delivery_mode, delivery_zone, delivery_address, subtotal, transport_fee, total, currency, valid_until, pricing_source, client_cart_hash, source, created_at) VALUES
('ALC-20260930-D3VK7QMR', '00000000-0000-4000-8000-000000000001', 'issued', NULL, 'Cliente de Prueba Uno', '+50370000001', NULL, '2026-09-30 15:10:00', '2026-09-30', 'delivery', 'San Salvador', 'Calle Falsa 123, Colonia de Prueba', 438.00, 25.00, 463.00, 'USD', '2026-10-15', 'client', SHA2('seed-quote-a', 256), 'cotizador', '2026-09-30 15:10:00'),
('ALC-20261001-H8T2NWB4', '00000000-0000-4000-8000-000000000002', 'issued', NULL, 'Cliente de Prueba Dos', '+50370000002', 'prueba.dos@example.invalid', '2026-10-01 09:30:00', '2026-09-30', 'pickup', NULL, NULL, 410.00, 0.00, 410.00, 'USD', '2026-10-16', 'client', SHA2('seed-quote-b', 256), 'cotizador', '2026-10-01 09:30:00'),
('ALC-20260901-R5C9XJ4F', '00000000-0000-4000-8000-000000000003', 'issued', NULL, 'Cliente de Prueba Tres', '+50370000003', NULL, '2026-09-01 10:00:00', '2026-09-30', 'delivery', 'Santa Tecla', 'Avenida Inventada 45, Residencial Ficticia', 444.00, 30.00, 474.00, 'USD', '2026-09-16', 'client', SHA2('seed-quote-c', 256), 'cotizador', '2026-09-01 10:00:00');

-- config = full CartItem without id: all 22 ITEM_FIELD_KEYS (src/islands/Cotizador/state/cotizadorStore.ts)
INSERT INTO quote_items (quote_id, position, product_slug, description, qty, unit_price, line_total, config, config_schema_version, promo_ref)
SELECT q.id, 1, 'recta', 'Puerta de baño recta 110 cm, natural, vidrio claro', 1, 222.00, 222.00,
'{"productId":"recta","width":"110","color":"natural","glass":"claro","cornerModel":"aquaclara","hingedQty":"1","hingedFixedPanelEnabled":false,"hingedFixedPanelWidthM":"","hingedFixedPanelHeightM":"","windowModel":"francesa","windowFrame":"blanco","windowGlass":"claro","windowZaranda":false,"windowDesmontaje":false,"windowRows":[{"id":"row-1","qty":"1","widthM":"1.20","heightM":"1.00"}],"gardenHojas":1,"gardenWidth":"1.00","gardenHeightOption":"2.10","gardenHeightOtra":"","gardenColor":"blanco","gardenGlass":"claro","gardenQty":"1"}',
1, NULL FROM quotes q WHERE q.code = 'ALC-20260930-D3VK7QMR';

INSERT INTO quote_items (quote_id, position, product_slug, description, qty, unit_price, line_total, config, config_schema_version, promo_ref)
SELECT q.id, 2, 'ventana-francesa', 'Ventana francesa 1.20 x 1.00 m, perfil blanco', 2, 108.00, 216.00,
'{"productId":"ventana","width":"110","color":"natural","glass":"claro","cornerModel":"aquaclara","hingedQty":"1","hingedFixedPanelEnabled":false,"hingedFixedPanelWidthM":"","hingedFixedPanelHeightM":"","windowModel":"francesa","windowFrame":"blanco","windowGlass":"claro","windowZaranda":false,"windowDesmontaje":false,"windowRows":[{"id":"row-1","qty":"2","widthM":"1.20","heightM":"1.00"}],"gardenHojas":1,"gardenWidth":"1.00","gardenHeightOption":"2.10","gardenHeightOtra":"","gardenColor":"blanco","gardenGlass":"claro","gardenQty":"1"}',
1, NULL FROM quotes q WHERE q.code = 'ALC-20260930-D3VK7QMR';

INSERT INTO quote_items (quote_id, position, product_slug, description, qty, unit_price, line_total, config, config_schema_version, promo_ref)
SELECT q.id, 1, 'jardin-3-hojas', 'Puerta de jardín 3 hojas 3.00 m, blanco, vidrio claro', 1, 410.00, 410.00,
'{"productId":"jardin","width":"110","color":"natural","glass":"claro","cornerModel":"aquaclara","hingedQty":"1","hingedFixedPanelEnabled":false,"hingedFixedPanelWidthM":"","hingedFixedPanelHeightM":"","windowModel":"francesa","windowFrame":"blanco","windowGlass":"claro","windowZaranda":false,"windowDesmontaje":false,"windowRows":[{"id":"row-1","qty":"1","widthM":"1.20","heightM":"1.00"}],"gardenHojas":3,"gardenWidth":"3.00","gardenHeightOption":"2.10","gardenHeightOtra":"","gardenColor":"blanco","gardenGlass":"claro","gardenQty":"1"}',
1, '9003' FROM quotes q WHERE q.code = 'ALC-20261001-H8T2NWB4';

INSERT INTO quote_items (quote_id, position, product_slug, description, qty, unit_price, line_total, config, config_schema_version, promo_ref)
SELECT q.id, 1, 'recta', 'Puerta de baño recta 110 cm, natural, vidrio claro (x2)', 2, 222.00, 444.00,
'{"productId":"recta","width":"110","color":"natural","glass":"claro","cornerModel":"aquaclara","hingedQty":"1","hingedFixedPanelEnabled":false,"hingedFixedPanelWidthM":"","hingedFixedPanelHeightM":"","windowModel":"francesa","windowFrame":"blanco","windowGlass":"claro","windowZaranda":false,"windowDesmontaje":false,"windowRows":[{"id":"row-1","qty":"1","widthM":"1.20","heightM":"1.00"}],"gardenHojas":1,"gardenWidth":"1.00","gardenHeightOption":"2.10","gardenHeightOtra":"","gardenColor":"blanco","gardenGlass":"claro","gardenQty":"1"}',
1, NULL FROM quotes q WHERE q.code = 'ALC-20260901-R5C9XJ4F';

-- ---------------------------------------------------------------------------
-- one fake contact so the admin list is not empty
-- ---------------------------------------------------------------------------
INSERT INTO contacts (id, name, phone, email, message, status, source, consent_at, dedupe_hash, created_at) VALUES
(9001, 'Contacto de Prueba', '+50370000009', NULL, 'Mensaje de prueba para el listado del admin.', 'new', 'landing', '2026-09-30 12:00:00', SHA2('seed-contact-1', 256), '2026-09-30 12:00:00');
