-- grants.sql  (idempotent, run AFTER migrations, as alcusa_migrate or root, once per app account host)
--
-- Table-level least privilege for the application account. Table grants cannot be issued before the
-- tables exist and a db-level DML grant cannot be carved down, hence this file. RE-RUN IT after any
-- migration that adds a table (and add the new table to the list below in the same PR).
--
-- Input session variables (set on the same connection, the wrapper binds them as parameters):
--   @alcusa_db         e.g. 'alcusa_dev' or 'alcusa_test'
--   @alcusa_app_user   e.g. 'alcusa_app'
--   @alcusa_app_host   e.g. '127.0.0.1' (run again for 'localhost')
-- Manual: run the three SET statements, then SOURCE grants.sql, in ONE mariadb session (see README).
--
-- Policy (deliberately tighter than "DML on everything", relax a line here if a slice needs it):
--   audit_log        SELECT, INSERT                 append-only, no UPDATE/DELETE ever for the app
--   quotes, payments, payment_intents  SELECT, INSERT, UPDATE   (never deleted by hand, ADR-010 §2)
--   quote_items      SELECT, INSERT                 immutable snapshot
--   admin_users      SELECT, INSERT, UPDATE         (deactivate, never delete)
--   promotions       SELECT, INSERT, UPDATE         (archive, never delete)
--   promotion_rules, contacts, admin_sessions, rate_limits  SELECT, INSERT, UPDATE, DELETE
--   schema_migrations SELECT                        (health/readiness only)
-- Retention purges of quotes/payments/audit_log run with the maintenance account (alcusa_migrate), not the app.
-- Tests that TRUNCATE tables must connect as alcusa_migrate.
-- Plain statements, each ending with a semicolon at end of line. Needs MariaDB EXECUTE IMMEDIATE.

EXECUTE IMMEDIATE IF(@alcusa_db IS NULL OR @alcusa_app_user IS NULL OR @alcusa_app_host IS NULL, 'SELECT 1 FROM alcusa_grants_error_set_alcusa_db_app_user_app_host', 'DO 0');
SET @g_db  = CONCAT('`', REPLACE(@alcusa_db, '`', '``'), '`');
SET @g_acc = CONCAT(QUOTE(@alcusa_app_user), '@', QUOTE(@alcusa_app_host));

EXECUTE IMMEDIATE CONCAT('GRANT SELECT, INSERT ON ', @g_db, '.audit_log TO ', @g_acc);
EXECUTE IMMEDIATE CONCAT('GRANT SELECT, INSERT ON ', @g_db, '.quote_items TO ', @g_acc);
EXECUTE IMMEDIATE CONCAT('GRANT SELECT ON ', @g_db, '.schema_migrations TO ', @g_acc);
EXECUTE IMMEDIATE CONCAT('GRANT SELECT, INSERT, UPDATE ON ', @g_db, '.quotes TO ', @g_acc);
EXECUTE IMMEDIATE CONCAT('GRANT SELECT, INSERT, UPDATE ON ', @g_db, '.payment_intents TO ', @g_acc);
EXECUTE IMMEDIATE CONCAT('GRANT SELECT, INSERT, UPDATE ON ', @g_db, '.payments TO ', @g_acc);
EXECUTE IMMEDIATE CONCAT('GRANT SELECT, INSERT, UPDATE ON ', @g_db, '.admin_users TO ', @g_acc);
EXECUTE IMMEDIATE CONCAT('GRANT SELECT, INSERT, UPDATE ON ', @g_db, '.promotions TO ', @g_acc);
EXECUTE IMMEDIATE CONCAT('GRANT SELECT, INSERT, UPDATE, DELETE ON ', @g_db, '.promotion_rules TO ', @g_acc);
EXECUTE IMMEDIATE CONCAT('GRANT SELECT, INSERT, UPDATE, DELETE ON ', @g_db, '.contacts TO ', @g_acc);
EXECUTE IMMEDIATE CONCAT('GRANT SELECT, INSERT, UPDATE, DELETE ON ', @g_db, '.admin_sessions TO ', @g_acc);
EXECUTE IMMEDIATE CONCAT('GRANT SELECT, INSERT, UPDATE, DELETE ON ', @g_db, '.rate_limits TO ', @g_acc);
