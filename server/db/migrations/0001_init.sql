-- 0001_init.sql  (ADR-010 §3 + ADR-012 §2 delta + ADR-011 admin/promos/rate_limits/audit)
--
-- Forward-only DDL. DO NOT EDIT once applied anywhere (the runner aborts on checksum change).
-- Portable: MariaDB 10.11 and 11.4 (no 11.x-only syntax). Only standard-ish types
-- (DECIMAL, DATETIME, VARCHAR+CHECK instead of ENUM). Notes on the few MariaDB-isms:
--   * JSON columns are LONGTEXT aliases in MariaDB (validated by CHECK JSON_VALID), the driver
--     returns them as STRING -> JSON.parse in the repo. Stored text is NOT re-serialized.
--   * Every table declares charset/collation explicitly: 11.4 changed the server default
--     collation to utf8mb4_uca1400_ai_ci, ADR-010 mandates utf8mb4_unicode_ci.
--   * Public codes/ids/hashes use ascii_bin (exact, case-sensitive, smaller indexes).
--   * Timestamps are UTC: CURRENT_TIMESTAMP relies on session time_zone='+00:00' (pool sets it).
-- Runner contract: plain statements, each terminated by a semicolon at end of line, no DELIMITER,
-- no procedural bodies, no semicolon inside string literals or comments. Not transactional (DDL
-- auto-commits), so every CREATE uses IF NOT EXISTS to make a re-run after a partial failure safe.
-- Privileges are NOT here: see ../grants.sql (table-level grants, audit_log append-only).

-- ---------------------------------------------------------------------------
-- schema_migrations (the runner bootstraps this same DDL before the first migration)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  checksum    CHAR(64)    CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  applied_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Admin (ADR-011 §2, ADR-013 §2.4)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username              VARCHAR(40)     NOT NULL,
  password_hash         VARCHAR(255)    NOT NULL,                 -- argon2id, PHC string
  must_change_password  TINYINT(1)      NOT NULL DEFAULT 1,
  totp_secret_enc       VARBINARY(96)   NULL,                     -- AES-256-GCM: iv(12)+tag(16)+ct, key lives in env, never here
  totp_enabled_at       DATETIME        NULL,
  totp_last_step        BIGINT UNSIGNED NULL,                     -- anti-replay
  recovery_codes_hash   JSON            NULL,
  failed_attempts       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until          DATETIME        NULL,
  last_login_at         DATETIME        NULL,
  is_active             TINYINT(1)      NOT NULL DEFAULT 1,
  created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_users_username (username),
  CONSTRAINT ck_admin_users_recovery_json CHECK (recovery_codes_hash IS NULL OR JSON_VALID(recovery_codes_hash)),
  CONSTRAINT ck_admin_users_flags CHECK (must_change_password IN (0,1) AND is_active IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Session id in the cookie is random 256 bits, only its SHA-256 lives here (a stolen DB has no valid sessions).
CREATE TABLE IF NOT EXISTS admin_sessions (
  id_hash          CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  admin_id         BIGINT UNSIGNED NOT NULL,
  csrf_token       CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  stage            VARCHAR(20)     NOT NULL DEFAULT 'password_ok',
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at       DATETIME        NOT NULL,
  ip_hash          CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  user_agent_hash  CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  PRIMARY KEY (id_hash),
  KEY ix_admin_sessions_admin (admin_id),
  KEY ix_admin_sessions_expires (expires_at),
  CONSTRAINT fk_admin_sessions_admin FOREIGN KEY (admin_id) REFERENCES admin_users (id) ON DELETE CASCADE,
  CONSTRAINT ck_admin_sessions_stage CHECK (stage IN ('password_ok','active'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Promotions (ADR-010 §3, ADR-011 §4). The cap of 3 simultaneously-active promos is enforced by
-- the app (GET_LOCK promo_publish + date-overlap count in a transaction), not expressible as CHECK.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promotions (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title          VARCHAR(120)    NOT NULL,
  description    TEXT            NOT NULL,                         -- plain text, no HTML
  price_before   DECIMAL(10,2)   NULL,
  price_promo    DECIMAL(10,2)   NOT NULL,                         -- explicit, never computed
  image_key      VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,  -- key, not a path
  image_alt      VARCHAR(160)    NULL,
  product_slug   VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
  starts_on      DATE            NOT NULL,                         -- El Salvador calendar date (UTC-6)
  ends_on        DATE            NOT NULL,
  status         VARCHAR(20)     NOT NULL DEFAULT 'draft',
  sort_order     INT             NOT NULL DEFAULT 0,
  created_by     BIGINT UNSIGNED NULL,
  updated_by     BIGINT UNSIGNED NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_promotions_active (status, starts_on, ends_on, sort_order),
  KEY ix_promotions_created_by (created_by),
  KEY ix_promotions_updated_by (updated_by),
  CONSTRAINT fk_promotions_created_by FOREIGN KEY (created_by) REFERENCES admin_users (id) ON DELETE SET NULL,
  CONSTRAINT fk_promotions_updated_by FOREIGN KEY (updated_by) REFERENCES admin_users (id) ON DELETE SET NULL,
  CONSTRAINT ck_promotions_status CHECK (status IN ('draft','published','archived')),
  CONSTRAINT ck_promotions_dates CHECK (starts_on <= ends_on),
  CONSTRAINT ck_promotions_price CHECK (price_promo >= 0 AND (price_before IS NULL OR price_promo < price_before)),
  CONSTRAINT ck_promotions_image_alt CHECK (image_key IS NULL OR (image_alt IS NOT NULL AND image_alt <> ''))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The DB does not know rule types, the code does (rule registry). v1 ships 'terms' only.
CREATE TABLE IF NOT EXISTS promotion_rules (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  promotion_id   BIGINT UNSIGNED NOT NULL,
  rule_type      VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  params         JSON            NOT NULL,
  position       INT             NOT NULL DEFAULT 1,
  enabled        TINYINT(1)      NOT NULL DEFAULT 1,
  schema_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_promotion_rules_promo (promotion_id, position),
  CONSTRAINT fk_promotion_rules_promo FOREIGN KEY (promotion_id) REFERENCES promotions (id) ON DELETE CASCADE,
  CONSTRAINT ck_promotion_rules_params CHECK (JSON_VALID(params)),
  CONSTRAINT ck_promotion_rules_enabled CHECK (enabled IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Quotes (ADR-010 §3 + ADR-012 §2: code CHAR(21), idempotency_key, supersedes)
-- PII = customer_name, customer_whatsapp, customer_email, delivery_address, ip_hash (+ consent_*).
-- They are plain columns of quotes (ADR-010 index/anonymization design), the public GET
-- (quote-load) MUST use an explicit column list that omits them. See README "Public-read rule".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotes (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,           -- internal, never exposed
  code                    CHAR(21) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,  -- ALC-YYYYMMDD-XXXXXXXX (7 Crockford + check)
  idempotency_key         CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,  -- UUID
  status                  VARCHAR(20)     NOT NULL DEFAULT 'issued',
  supersedes_quote_id     BIGINT UNSIGNED NULL,                              -- links only, never changes the old quote status
  customer_name           VARCHAR(120)    NULL,                              -- PII, NULL only after anonymization
  customer_whatsapp       VARCHAR(16)     NULL,                              -- PII, E.164: + and up to 15 digits
  customer_email          VARCHAR(160)    NULL,                              -- PII
  consent_at              DATETIME        NOT NULL,
  privacy_notice_version  VARCHAR(20)     NOT NULL,
  delivery_mode           VARCHAR(10)     NOT NULL,
  delivery_zone           VARCHAR(60)     NULL,
  delivery_address        VARCHAR(255)    NULL,                              -- PII, never returned by GET
  subtotal                DECIMAL(10,2)   NOT NULL,
  transport_fee           DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  total                   DECIMAL(10,2)   NOT NULL,
  currency                CHAR(3)         NOT NULL DEFAULT 'USD',
  valid_until             DATE            NOT NULL,
  pricing_source          VARCHAR(20)     NOT NULL DEFAULT 'client',
  client_cart_hash        CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  source                  VARCHAR(20)     NOT NULL DEFAULT 'cotizador',
  ip_hash                 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,  -- HMAC(ip, pepper), NULL after 30 days
  created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  anonymized_at           DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_quotes_code (code),
  UNIQUE KEY uq_quotes_idempotency (idempotency_key),
  KEY ix_quotes_status_created (status, created_at),
  KEY ix_quotes_created (created_at),
  KEY ix_quotes_whatsapp (customer_whatsapp, created_at),
  KEY ix_quotes_name (customer_name(40)),
  KEY ix_quotes_retention (anonymized_at, status, created_at),
  KEY ix_quotes_supersedes (supersedes_quote_id),
  CONSTRAINT fk_quotes_supersedes FOREIGN KEY (supersedes_quote_id) REFERENCES quotes (id) ON DELETE SET NULL,
  CONSTRAINT ck_quotes_code CHECK (code REGEXP '^ALC-[0-9]{8}-[0-9A-HJKMNP-TV-Z]{8}$'),
  CONSTRAINT ck_quotes_idem CHECK (idempotency_key REGEXP '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
  CONSTRAINT ck_quotes_status CHECK (status IN ('issued','awaiting_payment','partially_paid','paid','expired','cancelled','superseded')),
  CONSTRAINT ck_quotes_delivery_mode CHECK (delivery_mode IN ('pickup','delivery')),
  CONSTRAINT ck_quotes_customer CHECK (anonymized_at IS NOT NULL OR (customer_name IS NOT NULL AND customer_whatsapp IS NOT NULL)),
  CONSTRAINT ck_quotes_whatsapp CHECK (customer_whatsapp IS NULL OR customer_whatsapp REGEXP '^[+][1-9][0-9]{7,14}$'),
  CONSTRAINT ck_quotes_money CHECK (subtotal >= 0 AND transport_fee >= 0 AND total >= 0 AND total = subtotal + transport_fee),
  CONSTRAINT ck_quotes_currency CHECK (currency = 'USD'),
  CONSTRAINT ck_quotes_pricing_source CHECK (pricing_source IN ('client','server'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Immutable snapshot of what the customer saw. config = full CartItem without id (ITEM_FIELD_KEYS), at most 4096 BYTES.
CREATE TABLE IF NOT EXISTS quote_items (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  quote_id               BIGINT UNSIGNED NOT NULL,
  position               SMALLINT UNSIGNED NOT NULL,                           -- 1..N
  product_slug           VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  description            VARCHAR(255)    NOT NULL,                             -- display only, the truth is config
  qty                    INT UNSIGNED    NOT NULL,
  unit_price             DECIMAL(10,2)   NOT NULL,                             -- savedUnitPrice
  line_total             DECIMAL(10,2)   NOT NULL,                             -- savedLineTotal
  config                 JSON            NOT NULL,
  config_schema_version  SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  promo_ref              VARCHAR(60)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_quote_items_pos (quote_id, position),
  CONSTRAINT fk_quote_items_quote FOREIGN KEY (quote_id) REFERENCES quotes (id) ON DELETE CASCADE,
  CONSTRAINT ck_quote_items_pos CHECK (position >= 1),
  CONSTRAINT ck_quote_items_qty CHECK (qty >= 1),
  CONSTRAINT ck_quote_items_money CHECK (unit_price >= 0 AND line_total >= 0),
  CONSTRAINT ck_quote_items_config CHECK (JSON_VALID(config) AND LENGTH(config) <= 4096)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Payments (ADR-010 §3, ADR-011 §8). Max 9 attempts per quote keeps code-P<n> at 24 chars.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_intents (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  quote_id         BIGINT UNSIGNED NOT NULL,
  attempt          TINYINT UNSIGNED NOT NULL,                                  -- n in code-P<n>
  reference        VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, -- identificadorEnlaceComercio
  percent          TINYINT UNSIGNED NOT NULL,
  amount           DECIMAL(10,2)   NOT NULL,                                   -- computed server-side from quotes.total
  wompi_link_id    VARCHAR(64)     NULL,
  wompi_link_url   VARCHAR(500)    NULL,
  status           VARCHAR(20)     NOT NULL DEFAULT 'created',
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_intents_reference (reference),
  UNIQUE KEY uq_payment_intents_attempt (quote_id, attempt),
  CONSTRAINT fk_payment_intents_quote FOREIGN KEY (quote_id) REFERENCES quotes (id) ON DELETE RESTRICT,
  CONSTRAINT ck_payment_intents_attempt CHECK (attempt BETWEEN 1 AND 9),
  CONSTRAINT ck_payment_intents_percent CHECK (percent BETWEEN 1 AND 100),
  CONSTRAINT ck_payment_intents_amount CHECK (amount > 0),
  CONSTRAINT ck_payment_intents_status CHECK (status IN ('created','link_failed','paid','failed','expired'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One Wompi transaction event = one row. quote_id / payment_intent_id NULL = unreconciled (kept anyway).
CREATE TABLE IF NOT EXISTS payments (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  wompi_transaction_id  VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,   -- webhook idempotency
  payment_intent_id     BIGINT UNSIGNED NULL,
  quote_id              BIGINT UNSIGNED NULL,
  reference             VARCHAR(64)     NOT NULL,                              -- as received
  amount                DECIMAL(10,2)   NOT NULL,
  result                VARCHAR(40)     NOT NULL,                              -- ResultadoTransaccion
  status                VARCHAR(20)     NOT NULL,
  is_productive         TINYINT(1)      NOT NULL,                              -- EsProductiva
  raw_event             JSON            NOT NULL,                              -- verified payload, no headers
  received_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_wompi_tx (wompi_transaction_id),
  KEY ix_payments_intent (payment_intent_id),
  KEY ix_payments_quote (quote_id),
  KEY ix_payments_status_received (status, received_at),
  KEY ix_payments_received (received_at),
  CONSTRAINT fk_payments_intent FOREIGN KEY (payment_intent_id) REFERENCES payment_intents (id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_quote FOREIGN KEY (quote_id) REFERENCES quotes (id) ON DELETE RESTRICT,
  CONSTRAINT ck_payments_status CHECK (status IN ('approved','failed','amount_mismatch','test','unmatched')),
  CONSTRAINT ck_payments_productive CHECK (is_productive IN (0,1)),
  CONSTRAINT ck_payments_amount CHECK (amount >= 0),
  CONSTRAINT ck_payments_raw CHECK (JSON_VALID(raw_event))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Contacts (ADR-010 §3) - PII, columns nullable only after anonymization
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name           VARCHAR(120)    NULL,
  phone          VARCHAR(20)     NULL,
  email          VARCHAR(160)    NULL,
  message        TEXT            NULL,
  status         VARCHAR(20)     NOT NULL DEFAULT 'new',
  source         VARCHAR(30)     NOT NULL,
  consent_at     DATETIME        NOT NULL,
  ip_hash        CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  dedupe_hash    CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  handled_by     BIGINT UNSIGNED NULL,
  anonymized_at  DATETIME        NULL,
  PRIMARY KEY (id),
  KEY ix_contacts_status_created (status, created_at),
  KEY ix_contacts_created (created_at),
  KEY ix_contacts_dedupe (dedupe_hash, created_at),
  KEY ix_contacts_handled_by (handled_by),
  CONSTRAINT fk_contacts_handled_by FOREIGN KEY (handled_by) REFERENCES admin_users (id) ON DELETE SET NULL,
  CONSTRAINT ck_contacts_status CHECK (status IN ('new','read','answered','spam')),
  CONSTRAINT ck_contacts_content CHECK (anonymized_at IS NOT NULL OR (name IS NOT NULL AND message IS NOT NULL AND (phone IS NOT NULL OR email IS NOT NULL))),
  CONSTRAINT ck_contacts_message_len CHECK (message IS NULL OR CHAR_LENGTH(message) <= 2000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- rate_limits: fixed windows. Hit with INSERT ... ON DUPLICATE KEY UPDATE hits = hits + 1
-- (MySQL/MariaDB idiom, confined to the repo). Bucket keys carry hashes, never raw IP or phone.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket        VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  window_start  DATETIME        NOT NULL,
  hits          INT UNSIGNED    NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start),
  KEY ix_rate_limits_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- audit_log: append-only. alcusa_app gets INSERT, SELECT only (../grants.sql). No FKs on purpose
-- (history must survive deleting its subjects). Never store passwords, TOTP secrets or full contact messages in diff.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_type   VARCHAR(10)     NOT NULL,
  actor_id     BIGINT UNSIGNED NULL,
  action       VARCHAR(60) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  entity_type  VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL,
  entity_id    VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL,
  diff         JSON            NULL,
  ip_hash      CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  PRIMARY KEY (id),
  KEY ix_audit_log_at (at),
  KEY ix_audit_log_entity (entity_type, entity_id, at),
  KEY ix_audit_log_action (action, at),
  KEY ix_audit_log_actor (actor_type, actor_id, at),
  CONSTRAINT ck_audit_log_actor_type CHECK (actor_type IN ('admin','system','cli','public')),
  CONSTRAINT ck_audit_log_diff CHECK (diff IS NULL OR JSON_VALID(diff))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
