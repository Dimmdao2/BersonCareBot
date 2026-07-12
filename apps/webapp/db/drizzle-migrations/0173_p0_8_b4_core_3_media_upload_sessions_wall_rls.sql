-- 0173: B4-core-3 audit correction (docs/_TODO/SAAS_FOUNDATION/LOG.md, taskdb #658).
-- The independent audit of the B4-core-3 census found EXACTLY ONE more patient-owned SCOPED table
-- still org-only: public.media_upload_sessions. It had been (wrongly) excluded from the patient
-- wall as "dual-role keyed by usage_purpose" — but that column lives on public.media_files, NOT on
-- media_upload_sessions. media_upload_sessions.owner_user_id is a plain NOT NULL FK to
-- platform_users(id) (apps/webapp/migrations/067_media_folders_and_multipart.sql), the direct
-- per-patient owner of the multipart upload session. Under enforcement, patient A would otherwise
-- see patient B's upload sessions (owner_user_id / media_id / s3_key / status) — a PHI/ownership
-- leak. Same P0.8.3 (public., direct_org_column) family and same fail-closed staff-or-patient shape
-- as 0169/0172; the staff-actor bypass covers the case where the uploader is a staff member (org
-- library upload), so legitimate staff access is unaffected.
--
-- Target (1), P0.8.3 (public., direct_org_column):
--   public.media_upload_sessions -> owner_user_id = app.patient_user_id (uuid)
--
-- The block below is the EXACT generated output of (same policy name as 0160/0172):
--   node docs/_TODO/SAAS_FOUNDATION/scripts/p0-8-3-policy-targets.mjs --sql
-- filtered to this one table (now declares a patientColumn).
--
-- Idempotent: ENABLE RLS is a no-op if already set; DROP POLICY IF EXISTS +
-- CREATE POLICY replaces the prior (org-only) policy of the same name in place.
--
-- Rollback (ops): DROP POLICY IF EXISTS + re-CREATE the plain org-only predicate for this table/
-- policy name (git show <prev commit>, or re-run p0-8-3-policy-targets.mjs --sql from a commit
-- before this correction). No column/table drop, no data change; safe to revert at any time.
--
-- Dormant in prod today: the app DB role still has BYPASSRLS (P0.5/B5 not flipped). Proven via the
-- extended real-policy smoke (smoke-r2-real-policy-isolation.mjs), scratch DB only.

ALTER TABLE "public"."media_upload_sessions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."media_upload_sessions";
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."media_upload_sessions" FOR ALL USING (((NULLIF(current_setting('app.org', true), '') IS NULL OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid) AND (NULLIF(current_setting('app.actor', true), '') = 'staff' OR (NULLIF(current_setting('app.patient_user_id', true), '') IS NOT NULL AND "owner_user_id" = NULLIF(current_setting('app.patient_user_id', true), '')::uuid)))) WITH CHECK (((NULLIF(current_setting('app.org', true), '') IS NULL OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid) AND (NULLIF(current_setting('app.actor', true), '') = 'staff' OR (NULLIF(current_setting('app.patient_user_id', true), '') IS NOT NULL AND "owner_user_id" = NULLIF(current_setting('app.patient_user_id', true), '')::uuid))));
