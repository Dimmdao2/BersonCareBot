-- TEMPORARY LOCAL MIGRATION NUMBER 0373
--
-- RECONCILES-MIGRATION-HASH: 0369_auth_email_otp_enqueue_hardening_local
--
-- 0369 originally did `DROP` of the vulnerable 5-arg overload then bare `CREATE FUNCTION` for the
-- 1-arg form. After temporary-number renumbers / partial DEV applies, the 1-arg body can already
-- exist while the current file hash is absent from `drizzle.__drizzle_migrations`. Re-running the
-- unedited 0369 then fails closed with SQLSTATE 42723 (duplicate function), and drizzle's
-- created_at watermark can strand later migrations. 0369 now DROP IF EXISTS the 1-arg form first
-- (hash change). This forward marks the edited source as reconciled for ledgers that still carry
-- the pre-edit hash (e.g. TEST after 0369 was applied under the old bytes).
--
-- No schema delta beyond that contract: 0370 already replaced the 1-arg enqueue with the
-- ownership-token signature on environments that passed the full chain.

SELECT 1;
