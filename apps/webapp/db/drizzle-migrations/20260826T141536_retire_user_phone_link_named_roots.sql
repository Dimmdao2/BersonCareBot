-- BCB-MIGRATION-OWNER: app_seam_phone_binding_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.integrator_bind_bootstrap_channel_phone(text,text,text,uuid)') IS NULL
-- Identity cleanup (owner, 23.08.2026 — «бот подтверждает телефон, но не создаёт учётную запись»):
-- integrator's `user.phone.link` action and this named root are fully retired. Webapp already owns
-- the confirmed-phone write end-to-end (`completePhoneMessengerBindFromIntegrator` /
-- `confirmPhoneAuth`); this root's own write was a no-op duplicate of a value already canonical by
-- the time it ran (see `executeAction.ts`'s D25 comments), and its removal returns integrator no
-- capability to write contact/merge state under any other name.
DROP FUNCTION IF EXISTS app.integrator_bind_bootstrap_channel_phone(text, text, text, uuid);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_integrator_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.read_integrator_auth_channel_setting(text)') IS NULL
-- Orphaned together with `user.phone.link` above: this narrow read-gate had exactly one caller —
-- `writePort.ts`'s `user.phone.link` case — and no other route, cron or worker reads it.
DROP FUNCTION IF EXISTS app.read_integrator_auth_channel_setting(text);
