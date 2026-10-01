-- setup-local.sql  (LOCAL DEV ONLY. Run as MariaDB root, idempotent.)
--
-- Creates databases alcusa_dev / alcusa_test and the two accounts, for 127.0.0.1 and localhost:
--   alcusa_migrate : ALL (DDL) on both DBs, WITH GRANT OPTION (so it can also run grants.sql)
--   alcusa_app     : no db-level privileges here. Table-level DML is granted by grants.sql AFTER
--                    the migrations ran (tables must exist, audit_log is INSERT/SELECT only).
--
-- NO PASSWORDS IN THIS FILE. The caller sets two session variables on the SAME connection
-- before running it (the db:setup-local wrapper does this with a bound parameter, e.g.
-- `SET @alcusa_app_password = ?`, never by string concatenation into the file):
--   @alcusa_app_password       (>= 16 chars)
--   @alcusa_migrate_password   (>= 16 chars)
-- The wrapper takes them from env DB_APP_PASSWORD / DB_MIGRATE_PASSWORD.
-- Manual: run the two SET statements, then SOURCE setup-local.sql, in ONE mariadb session (see README).
--
-- Uses MariaDB EXECUTE IMMEDIATE (>= 10.2.3). Local-only script, so this is fine, production
-- accounts are created by the infra runbook, not by this file.
-- Each statement ends with a semicolon at end of line. No compound statements, no DELIMITER.

-- Fail loudly (and without echoing the value) if a password variable is missing or too short.
EXECUTE IMMEDIATE IF(@alcusa_app_password IS NULL OR CHAR_LENGTH(@alcusa_app_password) < 16, 'SELECT 1 FROM alcusa_setup_error_app_password_missing_or_shorter_than_16', 'DO 0');
EXECUTE IMMEDIATE IF(@alcusa_migrate_password IS NULL OR CHAR_LENGTH(@alcusa_migrate_password) < 16, 'SELECT 1 FROM alcusa_setup_error_migrate_password_missing_or_shorter_than_16', 'DO 0');

CREATE DATABASE IF NOT EXISTS alcusa_dev  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS alcusa_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER DATABASE alcusa_dev  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER DATABASE alcusa_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Accounts (CREATE IF NOT EXISTS, then ALTER USER so a re-run sets the password to the given one).
EXECUTE IMMEDIATE CONCAT('CREATE USER IF NOT EXISTS ''alcusa_migrate''@''127.0.0.1'' IDENTIFIED BY ', QUOTE(@alcusa_migrate_password));
EXECUTE IMMEDIATE CONCAT('CREATE USER IF NOT EXISTS ''alcusa_migrate''@''localhost'' IDENTIFIED BY ', QUOTE(@alcusa_migrate_password));
EXECUTE IMMEDIATE CONCAT('CREATE USER IF NOT EXISTS ''alcusa_app''@''127.0.0.1'' IDENTIFIED BY ', QUOTE(@alcusa_app_password));
EXECUTE IMMEDIATE CONCAT('CREATE USER IF NOT EXISTS ''alcusa_app''@''localhost'' IDENTIFIED BY ', QUOTE(@alcusa_app_password));
EXECUTE IMMEDIATE CONCAT('ALTER USER ''alcusa_migrate''@''127.0.0.1'' IDENTIFIED BY ', QUOTE(@alcusa_migrate_password));
EXECUTE IMMEDIATE CONCAT('ALTER USER ''alcusa_migrate''@''localhost'' IDENTIFIED BY ', QUOTE(@alcusa_migrate_password));
EXECUTE IMMEDIATE CONCAT('ALTER USER ''alcusa_app''@''127.0.0.1'' IDENTIFIED BY ', QUOTE(@alcusa_app_password));
EXECUTE IMMEDIATE CONCAT('ALTER USER ''alcusa_app''@''localhost'' IDENTIFIED BY ', QUOTE(@alcusa_app_password));

-- Migrate account: full rights on the two project DBs only (no *.*), can delegate table grants.
GRANT ALL PRIVILEGES ON alcusa_dev.*  TO 'alcusa_migrate'@'127.0.0.1' WITH GRANT OPTION;
GRANT ALL PRIVILEGES ON alcusa_dev.*  TO 'alcusa_migrate'@'localhost' WITH GRANT OPTION;
GRANT ALL PRIVILEGES ON alcusa_test.* TO 'alcusa_migrate'@'127.0.0.1' WITH GRANT OPTION;
GRANT ALL PRIVILEGES ON alcusa_test.* TO 'alcusa_migrate'@'localhost' WITH GRANT OPTION;

-- Safety net: alcusa_app must have NO database-level grant. Table-level grants come from grants.sql.
-- (Nothing to revoke on a fresh account. If you ever granted db-level rights to alcusa_app by hand,
--  REVOKE ALL PRIVILEGES ON alcusa_dev.* FROM that account and re-run grants.sql.)

FLUSH PRIVILEGES;
