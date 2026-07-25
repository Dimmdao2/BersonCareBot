-- p0-data-fix-doctor-admin-split.sql
-- Pre-migration identity normalization for the owner's OWN accounts. Run ONCE per fresh prod copy,
-- BEFORE the SaaS migrations (deploy-test-saas.sh / deploy-saas-667.sh step 2).
--
-- Owner intent (2026-07-13, CORRECTED 2026-07-25), anchored on STABLE PHONES for the doctor (emails
-- historically moved between merged dups, so ID/email fingerprints drift; the phone is the reliable
-- anchor) and on the STABLE EMAIL for the global admin:
--   * DOCTOR       = phone +79643805480  → role 'doctor', owns email dimmdao@yandex.ru; its dups
--                    consolidated into one canonical (non-merged) row.
--   * GLOBAL ADMIN = email dimmdao@gmail.com → a clean dedicated account, HARD-SET role='admin' in the
--                    database (owner 2026-07-25). This is a real persisted global admin, NOT a
--                    session-only `admin_emails` elevation. The app already reads role='admin' as
--                    adminMode=true (apps/webapp/src/modules/auth/service.ts:102), so the hard role is
--                    the single source of truth. `admin_emails` may stay as a harmless redundant belt.
--   * CLIENT       = phone +79189000782 (a same-name 'Дмитрий Берсон' client) → must hold NO email
--                    (neither yandex nor gmail).
--
-- Preserves ALL patient rows and appointments — this script NEVER deletes patient/appointment data.
-- IDEMPOTENT: every step is independently safe to re-run. Fails LOUDLY on an unexpected shape
-- (un-merged doctor duplicates, or more than one live row holding the gmail admin email) instead of guessing.
--
-- NOTE (owner, 2026-07-13): on prod NO new doctors/admins can legitimately appear — the owner only logs
-- in with existing credentials (two desktop browsers + phone PWA). Un-merged duplicates ⇒ a real
-- account-duplication bug to investigate, so this script stops rather than papering over it.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  c_doctor_phone constant text := '+79643805480';
  c_client_phone constant text := '+79189000782';
  c_doctor_email constant text := 'dimmdao@yandex.ru';
  c_admin_email  constant text := 'dimmdao@gmail.com';
  v_canonical_doctor uuid;
  v_global_admin uuid;
  v_doctor_live int;
  v_admin_live int;
  v_archived_empty_admins int;
BEGIN
  -- 0. Exactly ONE live (non-merged) row must carry the doctor phone. If prod ever grows un-merged
  --    duplicates on this phone, STOP: they must be merged via the platform-user merge port first.
  SELECT count(*) INTO v_doctor_live
  FROM platform_users
  WHERE phone_normalized = c_doctor_phone AND merged_into_id IS NULL;
  IF v_doctor_live <> 1 THEN
    RAISE EXCEPTION 'doctor-admin data-fix: expected exactly 1 live row on %, found % (merge duplicates first)',
      c_doctor_phone, v_doctor_live;
  END IF;

  SELECT id INTO v_canonical_doctor
  FROM platform_users
  WHERE phone_normalized = c_doctor_phone AND merged_into_id IS NULL;

  -- 1. Free the yandex email from the same-name CLIENT if it still holds it. Idempotent.
  UPDATE platform_users
  SET email = NULL, email_normalized = NULL, updated_at = now()
  WHERE phone_normalized = c_client_phone
    AND merged_into_id IS NULL
    AND email_normalized = c_doctor_email;

  -- 1b. The same-name CLIENT must hold NO email at all — strip the gmail admin email too if it drifted there.
  UPDATE platform_users
  SET email = NULL, email_normalized = NULL, updated_at = now()
  WHERE phone_normalized = c_client_phone
    AND merged_into_id IS NULL
    AND email_normalized = c_admin_email;

  -- 2. Free the yandex email from any OTHER LIVE row that is not the canonical doctor (defensive), so the
  --    canonical doctor can own it. Merged (dead) rows keep their historical email harmlessly.
  UPDATE platform_users
  SET email = NULL, email_normalized = NULL, updated_at = now()
  WHERE email_normalized = c_doctor_email
    AND merged_into_id IS NULL
    AND id <> v_canonical_doctor;

  -- 3. THE doctor fix: the canonical doctor must be role 'doctor' and own the yandex email. Unconditional + idempotent.
  UPDATE platform_users
  SET role = 'doctor',
      email = c_doctor_email,
      email_normalized = c_doctor_email,
      updated_at = now()
  WHERE id = v_canonical_doctor
    AND (role <> 'doctor' OR email_normalized IS DISTINCT FROM c_doctor_email);

  -- 4. THE admin fix (owner 2026-07-25): the account holding the gmail email is the GLOBAL ADMIN and must
  --    be HARD-SET role='admin' in the database — a real persisted global admin, not a session-only
  --    `admin_emails` elevation. Exactly one live row may hold this email; STOP otherwise (a duplicate is a
  --    real account-duplication bug to investigate, not something to guess through).
  SELECT count(*) INTO v_admin_live
  FROM platform_users
  WHERE email_normalized = c_admin_email AND merged_into_id IS NULL;
  IF v_admin_live <> 1 THEN
    RAISE EXCEPTION 'doctor-admin data-fix: expected exactly 1 live row on admin email %, found % (merge/split duplicates first)',
      c_admin_email, v_admin_live;
  END IF;

  SELECT id INTO v_global_admin
  FROM platform_users
  WHERE email_normalized = c_admin_email AND merged_into_id IS NULL;

  -- The global admin must be a DEDICATED account, never the same row as the doctor.
  IF v_global_admin = v_canonical_doctor THEN
    RAISE EXCEPTION 'doctor-admin data-fix: gmail admin email % resolves to the doctor row % — they must be separate accounts',
      c_admin_email, v_canonical_doctor;
  END IF;

  UPDATE platform_users
  SET role = 'admin',
      is_archived = FALSE,
      updated_at = now()
  WHERE id = v_global_admin
    AND (role <> 'admin' OR is_archived IS DISTINCT FROM FALSE);

  -- 5. Archive identifier-less admin stubs before staff membership seeding. These rows have no login/channel
  --    credential anchors and must not become active organization admins in 0143. (The real global admin
  --    from step 4 carries an email, so it is never caught here.)
  UPDATE platform_users pu
  SET is_archived = TRUE,
      updated_at = now()
  WHERE pu.role = 'admin'
    AND pu.merged_into_id IS NULL
    AND pu.is_archived IS FALSE
    AND pu.id <> v_global_admin
    AND pu.email_normalized IS NULL
    AND pu.phone_normalized IS NULL
    AND pu.integrator_user_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM user_channel_bindings b WHERE b.user_id = pu.id)
    AND NOT EXISTS (SELECT 1 FROM user_oauth_bindings b WHERE b.user_id = pu.id)
    AND NOT EXISTS (SELECT 1 FROM user_password_credentials c WHERE c.user_id = pu.id)
    AND NOT EXISTS (SELECT 1 FROM user_pins p WHERE p.user_id = pu.id)
    AND NOT EXISTS (SELECT 1 FROM login_tokens t WHERE t.user_id = pu.id);
  GET DIAGNOSTICS v_archived_empty_admins = ROW_COUNT;

  -- 6. Post-conditions — fail loudly if the target shape was not reached.
  IF NOT EXISTS (
    SELECT 1 FROM platform_users
    WHERE id = v_canonical_doctor AND role = 'doctor' AND email_normalized = c_doctor_email
  ) THEN
    RAISE EXCEPTION 'doctor-admin data-fix: canonical doctor % not normalized to doctor/%',
      v_canonical_doctor, c_doctor_email;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM platform_users
    WHERE id = v_global_admin AND role = 'admin' AND email_normalized = c_admin_email AND is_archived = FALSE
  ) THEN
    RAISE EXCEPTION 'doctor-admin data-fix: global admin % not normalized to admin/% (live)',
      v_global_admin, c_admin_email;
  END IF;

  RAISE NOTICE 'doctor-admin data-fix OK: doctor % = doctor/% ; global admin % = admin/% (hard role) ; archived empty admin stubs = %',
    v_canonical_doctor, c_doctor_email, v_global_admin, c_admin_email, v_archived_empty_admins;
END $$;

COMMIT;
