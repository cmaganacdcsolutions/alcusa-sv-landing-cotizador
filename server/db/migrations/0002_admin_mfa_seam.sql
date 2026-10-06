-- 0002_admin_mfa_seam.sql (ADR-014 §3.4 + §3.6). Forward-only, applied before any deployment.
-- NOTE: written but NOT yet executed against MariaDB (none available when this slice was built).

-- 2FA seam: the stage state machine gains mfa_pending; users gain mfa_method.
ALTER TABLE admin_sessions DROP CONSTRAINT ck_admin_sessions_stage;
ALTER TABLE admin_sessions ADD CONSTRAINT ck_admin_sessions_stage CHECK (stage IN ('password_ok','mfa_pending','active'));
ALTER TABLE admin_users ADD COLUMN mfa_method VARCHAR(16) NULL AFTER totp_enabled_at;
ALTER TABLE admin_users ADD CONSTRAINT ck_admin_users_mfa_method CHECK (mfa_method IS NULL OR mfa_method = 'totp');

-- Public promotions.json contract (src/content/promotions.ts): string id, cotizador_params.vidrio.
-- The image column keeps the public path of the 900 px variant (image_key stays for ADR-014 §3.5 purge).
ALTER TABLE promotions
  ADD COLUMN public_id        VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER id,
  ADD COLUMN cotizador_vidrio VARCHAR(20) CHARACTER SET ascii NULL AFTER product_slug,
  ADD COLUMN image_path       VARCHAR(255) CHARACTER SET ascii NULL AFTER image_key,
  ADD UNIQUE KEY uq_promotions_public_id (public_id);
