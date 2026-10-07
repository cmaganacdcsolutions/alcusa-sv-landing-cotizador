-- 0003_promotions_alt_300.sql. Forward-only. The admin form allows image alt text up to 300 characters
-- (validateAdminLimits) while 0001 sized the column at 160: widen it so a valid promo never fails to persist.
-- (Promo archive needs no DDL: ck_promotions_status already allows 'archived'.)
-- The Productos migration (price_from DECIMAL(10,2) NULL + show_price TINYINT(1), board A11) comes later as its own file.
ALTER TABLE promotions MODIFY COLUMN image_alt VARCHAR(300) NULL;
