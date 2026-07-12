#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

: "${SUPERUSER_URL:?FATAL: SUPERUSER_URL is required (superuser connection used only to create dormant LOGIN roles).}"
: "${DATABASE_URL:?FATAL: DATABASE_URL is required and must identify a BYPASSRLS migrator role.}"

export DATABASE_URL
export BOOKING_URL="${BOOKING_URL:-http://localhost:3000}"
export API_ENV_FILE="${API_ENV_FILE:-/nonexistent}"
export WEBAPP_ENV_FILE="${WEBAPP_ENV_FILE:-/nonexistent}"

header() {
  printf '\n===== %s =====\n' "$1"
}

header "Preflight: migrator must have BYPASSRLS"
migrator_bypassrls="$(
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -Atqc \
    "SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user"
)"
if [[ "${migrator_bypassrls}" != "t" ]]; then
  cat >&2 <<'EOF'
FATAL: DATABASE_URL does not authenticate as a role with BYPASSRLS.
This compatibility deploy enables dormant RLS policies but does not apply FORCE. Keep using postgres
or a dedicated BYPASSRLS migrator so migration/backfill assertions are not affected by RLS policy shape.
Never grant BYPASSRLS to the runtime app role.
See “WHY BYPASSRLS” in docs/_TODO/SAAS_FOUNDATION/DEPLOY_667_SEQUENCE.md.
EOF
  exit 1
fi

header "Step 1/4: create dormant app_staff/app_patient roles"
psql "${SUPERUSER_URL}" -X -v ON_ERROR_STOP=1 \
  -f deploy/postgres/p0-5b-role-split-staff-patient.sql

header "Step 2/4: apply doctor/admin account data-fix"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f deploy/postgres/p0-data-fix-doctor-admin-split.sql

header "Step 3/4: run the three-phase migration chain"
bash scripts/migrate-all.sh

header "Step 4/4: consolidate specialist identity"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $specialist_fingerprint$
DECLARE
  v_canonical_name text;
  v_active_duplicates uuid[];
BEGIN
  SELECT full_name INTO v_canonical_name
  FROM public.be_specialists
  WHERE id = '518ea988-9b5e-4ad8-8194-a2d98f43bd7b'::uuid
    AND organization_id = 'a0000000-0000-4000-8000-000000000001'::uuid
    AND is_active IS TRUE;

  IF v_canonical_name IS NULL THEN
    RAISE EXCEPTION 'SPECIALIST FINGERPRINT FAILED: canonical specialist is missing, inactive, or outside the default organization';
  END IF;

  SELECT coalesce(array_agg(id ORDER BY id), ARRAY[]::uuid[])
  INTO v_active_duplicates
  FROM public.be_specialists
  WHERE organization_id = 'a0000000-0000-4000-8000-000000000001'::uuid
    AND full_name = v_canonical_name
    AND is_active IS TRUE
    AND id <> '518ea988-9b5e-4ad8-8194-a2d98f43bd7b'::uuid;

  IF v_active_duplicates IS DISTINCT FROM ARRAY['c9515025-7224-4d9b-86b6-9cb7d26ea503'::uuid]
    AND NOT (
      v_active_duplicates = ARRAY[]::uuid[]
      AND EXISTS (
        SELECT 1 FROM public.be_specialists
        WHERE id = 'c9515025-7224-4d9b-86b6-9cb7d26ea503'::uuid
          AND organization_id = 'a0000000-0000-4000-8000-000000000001'::uuid
          AND full_name = v_canonical_name
          AND is_active IS FALSE
      )
    )
  THEN
    RAISE EXCEPTION 'SPECIALIST FINGERPRINT FAILED: expected active duplicate {c9515025-7224-4d9b-86b6-9cb7d26ea503} or its exact consolidated inactive state, got active set %',
      v_active_duplicates;
  END IF;
END
$specialist_fingerprint$;
SQL
pnpm --dir apps/webapp run consolidate-specialist-identity -- \
  --canonical=518ea988-9b5e-4ad8-8194-a2d98f43bd7b --commit

header "Post-state assertions"
required_drizzle_hash_groups="$(node - <<'NODE'
const crypto = require("node:crypto");
const fs = require("node:fs");
const journal = JSON.parse(fs.readFileSync("apps/webapp/db/drizzle-migrations/meta/_journal.json", "utf8"));
const legacyForceHashes = {
  "0160_p0_8_3_public_direct_org_rls": "3ba410ff4e598d886dd9debe32216c4184828cb99fde0cff45a3d3f61a36b1b5",
  "0161_p0_8_4_public_path_rls": "cbaa2b5de8e42295bbe2b1f0780975f33273e88fff49b90c4e5f9068cb0512f6",
  "0162_p0_8_5_integrator_scoped_rls": "e5c73d0fe841761e213569dfa5ac941d34ac2a7250166636678b68184fa5bff2",
  "0163_p0_8_6_bootstrap_hybrid_rls": "f25b5efd272071741ea71376dbd359e2e286525cb1ff309c5fc83ec903d59c92",
  "0167_p0_8_3_org_enrollments_broadcast_drafts_rls": "a3a400f28d7d75b00d10a6962297ce122a2357f7eb8a8c407a69c08a252f1fce",
  "0168_p0_8_6_system_settings_audit_rls": "e06038d3f71f1b1b96c12e998f6d1f63a99992ce23e15f073ac7e3e73cf1b714",
  "0169_p0_8_b4_core_patient_wall_rls": "76b9c460bf383478ee867bdc7b8ddc847a45b44cae16ab05a8ead6620e3a4401",
  "0170_p0_8_b4_fanout_chain_patient_wall_rls": "055bd40c06521c17adea4ca320586d773d49a769fe50b81884ac279b596f3328",
  "0171_p0_8_b4_core_3_patient_wall_rls": "69dfac3a3cb2d2491bd03a80c47854528950317a9d40347749558e541bd91484",
  "0172_p0_8_b4_core_3_census_patient_wall_rls": "e45390dfed841cff3062cdb60d474b89cb6b236a78fb2518165d498330ecdaed",
  "0173_p0_8_b4_core_3_media_upload_sessions_wall_rls": "b3c1c1c849c1d671dec03c1afbc9c3e4838b3c1cc99377bbdc46179019c41e33",
  "0174_p0_8_b4_core_4_conditional_polymorphic_patient_wall_rls": "5e73432bf245e322ed9e0f808701c09840e3ac3026f5ae7e597763530c56bbe9",
  "0175_p0_8_b4_roles_1_is_staff_wall_rls": "ff3c37cdcd6d0282fec26145b2be9afac4091e722860a5b9d60d8b38847c75de",
};
const required = journal.entries.filter(({ tag }) => {
  const prefix = Number(tag.slice(0, 4));
  return prefix >= 115 && prefix <= 177;
});
const prefixes = required.map(({ tag }) => Number(tag.slice(0, 4)));
if (required.length !== 63 || prefixes.some((prefix, index) => prefix !== 115 + index)) {
  throw new Error("expected exactly one sequential journal tag for every migration 0115..0177");
}
if (!required.some(({ tag }) => tag === "0177_phase4_no_force_rls_compat")) {
  throw new Error("expected 0177_phase4_no_force_rls_compat in required Drizzle hash groups");
}
process.stdout.write(required.map(({ tag }) => {
  const sql = fs.readFileSync(`apps/webapp/db/drizzle-migrations/${tag}.sql`, "utf8");
  return [crypto.createHash("sha256").update(sql).digest("hex"), legacyForceHashes[tag]]
    .filter(Boolean)
    .join("|");
}).join(","));
NODE
)"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -v required_drizzle_hash_groups="${required_drizzle_hash_groups}" <<'SQL'
SELECT set_config('deploy.required_drizzle_hash_groups', :'required_drizzle_hash_groups', false);

DO $assertions$
DECLARE
  v_count bigint;
  v_admin_id uuid;
  v_ledger_column text;
  v_table text;
  v_hash_group text;
  v_hash_group_index integer := 0;
  v_saas_versions text[] := ARRAY[
    '20260707_0001_p0_4_i0_integrator_org_columns_predeclare.sql',
    '20260708_0001_p0_4_i1_integrator_direct_user_org.sql',
    '20260708_0002_p0_4_i2_integrator_identity_path_org.sql',
    '20260708_0003_p0_4_i3_integrator_parent_denorm_org.sql',
    '20260708_0004_p0_4_i4_integrator_mailings_org.sql',
    '20260710_0001_r2_integrator_scoped_org_not_null.sql'
  ];
BEGIN
  SELECT count(*) INTO v_count
  FROM public.platform_users
  WHERE role = 'doctor' AND merged_into_id IS NULL AND is_archived IS FALSE;
  IF v_count <> 1 THEN RAISE EXCEPTION 'ASSERT FAILED: active doctor count = %, expected 1', v_count; END IF;

  SELECT count(*) INTO v_count
  FROM public.platform_users
  WHERE role = 'admin' AND merged_into_id IS NULL AND is_archived IS FALSE;
  IF v_count <> 1 THEN RAISE EXCEPTION 'ASSERT FAILED: active admin count = %, expected 1', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.be_specialists WHERE is_active IS TRUE;
  IF v_count <> 1 THEN RAISE EXCEPTION 'ASSERT FAILED: active specialist count = %, expected 1', v_count; END IF;

  SELECT count(*) INTO v_count
  FROM public.be_specialists s
  WHERE s.id = '518ea988-9b5e-4ad8-8194-a2d98f43bd7b'::uuid
    AND s.is_active IS TRUE
    AND s.organization_id = 'a0000000-0000-4000-8000-000000000001'::uuid
    AND EXISTS (SELECT 1 FROM public.be_appointments a WHERE a.specialist_id = s.id);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ASSERT FAILED: canonical specialist is not active or has no appointments';
  END IF;

  SELECT count(*) INTO v_count FROM drizzle.__drizzle_migrations;
  IF v_count < 178 THEN RAISE EXCEPTION 'ASSERT FAILED: Drizzle migration count = %, expected at least 178', v_count; END IF;

  FOREACH v_hash_group IN ARRAY string_to_array(current_setting('deploy.required_drizzle_hash_groups'), ',') LOOP
    v_hash_group_index := v_hash_group_index + 1;
    SELECT count(*) INTO v_count
    FROM drizzle.__drizzle_migrations
    WHERE hash = ANY (string_to_array(v_hash_group, '|'));
    IF v_count < 1 THEN
      RAISE EXCEPTION 'ASSERT FAILED: applied Drizzle migration hash group % from 0115..0177 is missing', v_hash_group_index;
    END IF;
  END LOOP;
  IF v_hash_group_index <> 63 THEN
    RAISE EXCEPTION 'ASSERT FAILED: Drizzle hash group count = %, expected 63 for 0115..0177', v_hash_group_index;
  END IF;

  SELECT column_name INTO v_ledger_column
  FROM information_schema.columns
  WHERE table_schema = 'integrator' AND table_name = 'schema_migrations'
    AND column_name IN ('version', 'filename')
  ORDER BY CASE column_name WHEN 'version' THEN 0 ELSE 1 END
  LIMIT 1;
  IF v_ledger_column IS NULL THEN RAISE EXCEPTION 'ASSERT FAILED: integrator migration ledger column missing'; END IF;
  EXECUTE format(
    'SELECT count(DISTINCT regexp_replace(%1$I, ''^core:'', '''')) FROM integrator.schema_migrations WHERE regexp_replace(%1$I, ''^core:'', '''') = ANY ($1)',
    v_ledger_column
  ) INTO v_count USING v_saas_versions;
  IF v_count <> 6 THEN RAISE EXCEPTION 'ASSERT FAILED: integrator SaaS migration count = %, expected 6', v_count; END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'contacts', 'content_access_grants', 'user_reminder_rules', 'user_subscriptions',
    'conversations', 'message_drafts', 'user_questions', 'mailings', 'mailing_logs',
    'conversation_messages', 'question_messages', 'user_reminder_occurrences',
    'user_reminder_delivery_logs'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM integrator.%I WHERE organization_id IS NULL', v_table)
      INTO v_count;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'ASSERT FAILED: integrator.% has % NULL organization_id rows', v_table, v_count;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_count FROM public.org_enrollments WHERE organization_id IS NULL;
  IF v_count <> 0 THEN RAISE EXCEPTION 'ASSERT FAILED: org_enrollments with NULL organization_id = %', v_count; END IF;

  SELECT count(*) INTO v_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE (n.nspname, c.relname) IN (
    ('integrator', 'contacts'), ('integrator', 'conversations'),
    ('public', 'org_enrollments'), ('public', 'clinical_visit')
  ) AND c.relrowsecurity IS TRUE AND c.relforcerowsecurity IS FALSE;
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'ASSERT FAILED: representative dormant NO FORCE RLS table count = %, expected 4', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM pg_roles
  WHERE rolname IN ('app_staff', 'app_patient')
    AND rolcanlogin IS TRUE AND rolsuper IS FALSE AND rolbypassrls IS FALSE;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'ASSERT FAILED: app_staff/app_patient must be LOGIN NOSUPERUSER NOBYPASSRLS';
  END IF;

  SELECT id INTO v_admin_id FROM public.platform_users
  WHERE role = 'admin' AND email_normalized = 'dimmdao@gmail.com'
    AND merged_into_id IS NULL AND is_archived IS FALSE;
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'ASSERT FAILED: replacement admin missing'; END IF;

  SELECT count(*) INTO v_count FROM public.be_organization_members
  WHERE platform_user_id = 'b0021a38-fb86-45e9-9aec-d85014e932d4'::uuid;
  IF v_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.be_organization_members
    WHERE platform_user_id = 'b0021a38-fb86-45e9-9aec-d85014e932d4'::uuid
      AND organization_id = 'a0000000-0000-4000-8000-000000000001'::uuid
      AND role = 'doctor' AND specialist_id = '518ea988-9b5e-4ad8-8194-a2d98f43bd7b'::uuid
      AND status = 'active'
  ) THEN RAISE EXCEPTION 'ASSERT FAILED: doctor membership missing, duplicated, or incorrect'; END IF;

  SELECT count(*) INTO v_count FROM public.be_organization_members WHERE platform_user_id = v_admin_id;
  IF v_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.be_organization_members
    WHERE platform_user_id = v_admin_id
      AND organization_id = 'a0000000-0000-4000-8000-000000000001'::uuid
      AND role = 'admin' AND specialist_id IS NULL AND status = 'active'
  ) THEN RAISE EXCEPTION 'ASSERT FAILED: admin membership missing, duplicated, or incorrect'; END IF;
END
$assertions$;

SELECT 'doctor' AS assertion, count(*) AS actual, 1 AS expected
FROM public.platform_users WHERE role = 'doctor' AND merged_into_id IS NULL AND is_archived IS FALSE
UNION ALL
SELECT 'admin', count(*), 1
FROM public.platform_users WHERE role = 'admin' AND merged_into_id IS NULL AND is_archived IS FALSE
UNION ALL SELECT 'active_specialists', count(*), 1 FROM public.be_specialists WHERE is_active IS TRUE
UNION ALL SELECT 'canonical_appointments_minimum', count(*), 1
FROM public.be_appointments WHERE specialist_id = '518ea988-9b5e-4ad8-8194-a2d98f43bd7b'::uuid
UNION ALL SELECT 'drizzle_migrations_minimum', count(*), 178 FROM drizzle.__drizzle_migrations
UNION ALL SELECT 'contacts_null_org', count(*), 0 FROM integrator.contacts WHERE organization_id IS NULL
UNION ALL SELECT 'required_memberships', count(*), 2 FROM public.be_organization_members
WHERE platform_user_id = 'b0021a38-fb86-45e9-9aec-d85014e932d4'::uuid
   OR platform_user_id = (
     SELECT id FROM public.platform_users
     WHERE role = 'admin' AND email_normalized = 'dimmdao@gmail.com'
       AND merged_into_id IS NULL AND is_archived IS FALSE
   );
SQL

printf '\n✅ ALL GREEN (#667 deploy sequence)\n'
