-- Owner ruling 2026-07-25: the global admin (dimmdao@gmail.com) is a HARD, persisted
-- platform_users.role='admin' — a real dedicated global-admin account — NOT a session-only
-- `admin_emails` elevation. The app maps role='admin' -> adminMode=true
-- (apps/webapp/src/modules/auth/service.ts:102), so the persisted role is the single source of truth.
--
-- History note: this migration slot (idx 233) previously DEMOTED the gmail admin to 'client' under the
-- old session-only design ("0233_demote_legacy_email_admin_artifact"). That design was reversed by the
-- owner. This migration was never applied on prod (prod is still pre-SaaS), and TEST is rebuilt from a
-- fresh prod dump, so the slot is safely repurposed to ASSERT the corrected canon instead of yanking the
-- role back and forth with a later migration.
--
-- SAFETY: the staff membership seed (0143) is doctor-only (`WHERE role = 'doctor'`), so a persisted
-- global admin is NEVER seeded into an organization — it stays a pure platform operator with no clinic
-- membership. Idempotent; targets exactly the one live, non-merged gmail account and never the doctor
-- row (anchored away from the doctor phone +79643805480).
UPDATE public.platform_users AS platform_user
SET role = 'admin',
    is_archived = FALSE,
    updated_at = now()
WHERE platform_user.email_normalized = 'dimmdao@gmail.com'
  AND platform_user.merged_into_id IS NULL
  AND platform_user.phone_normalized IS DISTINCT FROM '+79643805480'
  AND (platform_user.role IS DISTINCT FROM 'admin' OR platform_user.is_archived IS DISTINCT FROM FALSE);
