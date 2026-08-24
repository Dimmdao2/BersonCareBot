-- BCB-MIGRATION-OWNER: app_seam_email_otp_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.email_auth_enqueue_otp_delivery(uuid,uuid)') IS NULL
-- Auth-code delivery is enqueued atomically by app.email_auth_start_challenge. This former second
-- enqueue door has no production caller and retains obsolete recipient-visible branding.

DROP FUNCTION IF EXISTS app.email_auth_enqueue_otp_delivery(uuid, uuid);
