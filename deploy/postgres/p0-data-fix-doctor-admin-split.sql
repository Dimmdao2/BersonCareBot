-- p0-data-fix-doctor-admin-split.sql
-- Pre-migration identity normalization for the owner's OWN accounts. Run ONCE per fresh prod copy,
-- BEFORE the SaaS migrations (deploy-test-saas.sh / deploy-saas-667.sh step 2).
--
-- Owner intent (2026-07-13), anchored on STABLE PHONES (emails historically moved between merged dups,
-- so ID/email fingerprints drift; the phone is the reliable anchor):
--   * DOCTOR  = phone +79643805480  → must be role 'doctor' and own email dimmdao@yandex.ru; its dups
--                consolidated into one canonical (non-merged) row.
--   * OWNER EMAIL = dimmdao@gmail.com → may elevate only through the fresh DB-backed
--                   `admin_emails` policy; it is never persisted as platform_users.role='admin'.
--   * CLIENT  = phone +79189000782 (a same-name 'Дмитрий Берсон' client) → must NOT hold the yandex email.
--
-- Preserves ALL patient rows and appointments — this script NEVER deletes patient/appointment data.
-- IDEMPOTENT: every step is independently safe to re-run; nothing is gated behind a single fragile
-- precondition (the previous version silently skipped the role flip once the email had drifted). Fails
-- LOUDLY on an unexpected shape (un-merged doctor duplicates) instead of guessing.
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
  v_canonical_doctor uuid;
  v_doctor_live int;
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

  -- 2. Free the yandex email from any OTHER LIVE row that is not the canonical doctor (defensive), so the
  --    canonical doctor can own it. Merged (dead) rows keep their historical email harmlessly.
  UPDATE platform_users
  SET email = NULL, email_normalized = NULL, updated_at = now()
  WHERE email_normalized = c_doctor_email
    AND merged_into_id IS NULL
    AND id <> v_canonical_doctor;

  -- 3. THE fix: the canonical doctor must be role 'doctor' and own the yandex email. Unconditional + idempotent.
  UPDATE platform_users
  SET role = 'doctor',
      email = c_doctor_email,
      email_normalized = c_doctor_email,
      updated_at = now()
  WHERE id = v_canonical_doctor
    AND (role <> 'doctor' OR email_normalized IS DISTINCT FROM c_doctor_email);

  -- 4. Do NOT create an admin row for the owner email. Its global-admin elevation is
  -- session-only and re-evaluates the DB-backed `admin_emails` policy on every refresh.

  -- 5. Archive identifier-less admin stubs before staff membership seeding. These rows have no login/channel
  --    credential anchors and must not become active organization admins in 0143.
  UPDATE platform_users pu
  SET is_archived = TRUE,
      updated_at = now()
  WHERE pu.role = 'admin'
    AND pu.merged_into_id IS NULL
    AND pu.is_archived IS FALSE
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

  RAISE NOTICE 'doctor-admin data-fix OK: canonical doctor % = doctor/% ; owner email remains session-only ; archived empty admin stubs = %',
    v_canonical_doctor, c_doctor_email, v_archived_empty_admins;
END $$;

COMMIT;
