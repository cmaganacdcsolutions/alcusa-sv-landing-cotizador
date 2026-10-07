-- 0004_promotions_cotizador_color.sql. Forward-only. A promo link now preselects the aluminium colour as well as the glass
-- (site contract: cotizador_params.color, one of natural | blanco | bronce, see src/content/deepLink.ts DEEP_LINK_COLORS).
-- Same shape as cotizador_vidrio (0002): nullable, so existing promos keep working with no colour (no backfill needed).
ALTER TABLE promotions
  ADD COLUMN cotizador_color VARCHAR(20) CHARACTER SET ascii NULL AFTER cotizador_vidrio;
