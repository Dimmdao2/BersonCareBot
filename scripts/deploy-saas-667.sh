#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

: "${DATABASE_URL:?FATAL: DATABASE_URL is required and must identify the runtime owner/migrator role.}"

export DATABASE_URL
export BOOKING_URL="${BOOKING_URL:-http://localhost:3000}"
export API_ENV_FILE="${API_ENV_FILE:-/nonexistent}"
export WEBAPP_ENV_FILE="${WEBAPP_ENV_FILE:-/nonexistent}"
P2_B_OWNER_ROLE="${P2_B_OWNER_ROLE:-app_owner}"
P2_B_STAFF_ROLE="app_staff"
P2_B_PATIENT_ROLE="app_patient"
SUPERUSER_SUDO_POSTGRES="${SUPERUSER_SUDO_POSTGRES:-0}"
p2_b_psql_file=""

if [[ "${SUPERUSER_SUDO_POSTGRES}" != "0" && "${SUPERUSER_SUDO_POSTGRES}" != "1" ]]; then
  printf 'FATAL: SUPERUSER_SUDO_POSTGRES must be 0 or 1, got %q\n' "${SUPERUSER_SUDO_POSTGRES}" >&2
  exit 1
fi
if [[ "${SUPERUSER_SUDO_POSTGRES}" == "1" && -n "${SUPERUSER_URL:-}" ]]; then
  printf 'FATAL: SUPERUSER_URL and SUPERUSER_SUDO_POSTGRES=1 are mutually exclusive.\n' >&2
  exit 1
fi
if [[ "${SUPERUSER_SUDO_POSTGRES}" == "0" && -z "${SUPERUSER_URL:-}" ]]; then
  printf 'FATAL: SUPERUSER_URL is required unless SUPERUSER_SUDO_POSTGRES=1 is explicit.\n' >&2
  exit 1
fi

header() {
  printf '\n===== %s =====\n' "$1"
}

validate_role_name() {
  local label="$1"
  local value="$2"
  if [[ ! "${value}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    printf 'FATAL: %s must be a simple PostgreSQL identifier, got %q\n' "${label}" "${value}" >&2
    exit 1
  fi
}

superuser_psql_target() {
  if [[ "${SUPERUSER_SUDO_POSTGRES}" == "1" ]]; then
    sudo -n -u postgres env -i PATH="${PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}" psql -d "${migrator_database}" "$@"
  else
    psql "${SUPERUSER_URL}" "$@"
  fi
}

run_superuser_psql() {
  superuser_psql_target "$@"
}

run_superuser_psql_file() {
  local sql_path="$1"
  shift
  if [[ ! -r "${sql_path}" ]]; then
    printf 'FATAL: SQL file is not readable by current shell user: %s\n' "${sql_path}" >&2
    exit 1
  fi
  run_superuser_psql "$@" < "${sql_path}"
}

revoke_migrator_elevation() {
  superuser_psql_target -X -v ON_ERROR_STOP=1 \
    -v p2_b_owner_role="${P2_B_OWNER_ROLE}" \
    -v p2_b_migrator_role="${migrator_role}" <<'SQL'
SELECT format('ALTER ROLE %I NOBYPASSRLS', :'p2_b_migrator_role')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'p2_b_migrator_role')
\gexec

SELECT format('REVOKE %I FROM %I', owner_role.rolname, member_role.rolname)
FROM pg_roles owner_role
JOIN pg_roles member_role ON member_role.rolname = :'p2_b_migrator_role'
WHERE owner_role.rolname = :'p2_b_owner_role'
  AND EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    WHERE membership.roleid = owner_role.oid
      AND membership.member = member_role.oid
  )
\gexec
SQL
}

cleanup_on_exit() {
  local exit_code=$?
  set +e
  if [[ -n "${p2_b_psql_file:-}" ]]; then
    rm -f "${p2_b_psql_file}"
  fi
  if [[ -n "${migrator_role:-}" ]]; then
    if ! revoke_migrator_elevation >/dev/null 2>&1; then
      printf '\n🔴 FATAL: superuser cleanup failed for migrator role %q (is the selected superuser transport reachable?).\n' "${migrator_role}" >&2
      printf 'The runtime owner role may STILL hold BYPASSRLS and %q membership. Revoke MANUALLY via a superuser:\n' "${P2_B_OWNER_ROLE}" >&2
      printf '  ALTER ROLE %q NOBYPASSRLS; REVOKE %q FROM %q;\n' "${migrator_role}" "${P2_B_OWNER_ROLE}" "${migrator_role}" >&2
      if [[ "${exit_code}" -eq 0 ]]; then exit_code=1; fi
    fi
  fi
  exit "${exit_code}"
}

header "Preflight: migrator must own representative production tables"
migrator_role="$(
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -Atqc \
    "SELECT current_user"
)"
migrator_database="$(
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -Atqc \
    "SELECT current_database()"
)"
superuser_database="$(
  superuser_psql_target -X -v ON_ERROR_STOP=1 -Atqc \
    "SELECT current_database()"
)"
superuser_is_superuser="$(
  superuser_psql_target -X -v ON_ERROR_STOP=1 -Atqc \
    "SELECT rolsuper FROM pg_roles WHERE rolname = current_user"
)"
migrator_table_owner="$(
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -Atqc \
    "SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'be_patient_packages'"
)"
validate_role_name "P2_B_OWNER_ROLE" "${P2_B_OWNER_ROLE}"
validate_role_name "migrator role" "${migrator_role}"
trap cleanup_on_exit EXIT INT TERM HUP
if [[ "${superuser_is_superuser}" != "t" ]]; then
  cat >&2 <<'EOF'
FATAL: SUPERUSER_URL must authenticate as a PostgreSQL superuser.
The deploy temporarily grants BYPASSRLS and app_owner membership to the runtime owner role, then revokes both.
EOF
  exit 1
fi
if [[ -z "${migrator_table_owner}" || "${migrator_table_owner}" != "${migrator_role}" ]]; then
  cat >&2 <<'EOF'
FATAL: DATABASE_URL must authenticate as the runtime table-owner role.
Migration 0140 uses ALTER SEQUENCE ... OWNED BY and migrations 0160..0175 perform owner-only RLS DDL,
so the migration chain must run as the owner of public.be_patient_packages.
EOF
  printf 'current_user: %s\n' "${migrator_role}" >&2
  printf 'public.be_patient_packages tableowner: %s\n' "${migrator_table_owner:-<missing>}" >&2
  exit 1
fi
if [[ "${superuser_database}" != "${migrator_database}" ]]; then
  cat >&2 <<EOF
FATAL: SUPERUSER_URL and DATABASE_URL must point to the same target database.
SUPERUSER_URL database: ${superuser_database}
DATABASE_URL database: ${migrator_database}
EOF
  exit 1
fi

header "Step 1/6: prepare dormant roles, pgcrypto schema, and temporary migrator elevation"
run_superuser_psql_file deploy/postgres/p0-5b-role-split-staff-patient.sql \
  -X -v ON_ERROR_STOP=1
superuser_psql_target -X -v ON_ERROR_STOP=1 \
  -v p2_b_owner_role="${P2_B_OWNER_ROLE}" \
  -v p2_b_migrator_role="${migrator_role}" <<'SQL'
SELECT format('CREATE ROLE %I NOLOGIN BYPASSRLS', :'p2_b_owner_role')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'p2_b_owner_role')
\gexec

ALTER ROLE :"p2_b_owner_role" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;

SELECT format('GRANT %I TO %I', :'p2_b_owner_role', :'p2_b_migrator_role')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'p2_b_migrator_role')
\gexec

CREATE SCHEMA IF NOT EXISTS app_ext;

DO $pgcrypto_schema$
DECLARE
  v_pgcrypto_schema text;
  v_conflicting_functions text[];
BEGIN
  SELECT n.nspname
  INTO v_pgcrypto_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgcrypto';

  IF v_pgcrypto_schema IS NULL THEN
    CREATE EXTENSION pgcrypto WITH SCHEMA app_ext;
  ELSIF v_pgcrypto_schema <> 'app_ext' THEN
    SELECT array_agg(
      format('%I.%I(%s)', source_namespace.nspname, source_proc.proname, pg_get_function_identity_arguments(source_proc.oid))
      ORDER BY source_namespace.nspname, source_proc.proname, source_proc.oid
    )
    INTO v_conflicting_functions
    FROM pg_depend dependency
    JOIN pg_extension ext ON ext.oid = dependency.refobjid
    JOIN pg_proc source_proc ON source_proc.oid = dependency.objid
    JOIN pg_namespace source_namespace ON source_namespace.oid = source_proc.pronamespace
    JOIN pg_proc target_proc ON target_proc.pronamespace = 'app_ext'::regnamespace
      AND target_proc.proname = source_proc.proname
      AND target_proc.proargtypes = source_proc.proargtypes
    WHERE ext.extname = 'pgcrypto'
      AND dependency.classid = 'pg_proc'::regclass
      AND dependency.deptype = 'e';

    IF coalesce(array_length(v_conflicting_functions, 1), 0) > 0 THEN
      RAISE EXCEPTION 'pgcrypto_app_ext_conflicting_functions: %', array_to_string(v_conflicting_functions, ', ');
    END IF;

    ALTER EXTENSION pgcrypto SET SCHEMA app_ext;
  END IF;

  SELECT n.nspname
  INTO v_pgcrypto_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgcrypto';

  IF v_pgcrypto_schema <> 'app_ext' THEN
    RAISE EXCEPTION 'pgcrypto_must_be_installed_in_app_ext';
  END IF;
END
$pgcrypto_schema$;

GRANT USAGE ON SCHEMA app_ext TO :"p2_b_owner_role";

SELECT format('ALTER ROLE %I BYPASSRLS', :'p2_b_migrator_role')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'p2_b_migrator_role')
\gexec
SQL

header "Step 2/6: apply doctor/admin account data-fix"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f deploy/postgres/p0-data-fix-doctor-admin-split.sql

header "Step 3/6: run the three-phase migration chain"
bash scripts/migrate-all.sh

header "Step 3b/6: build C4D media owner index online"
run_superuser_psql_file deploy/postgres/c4d-platform-lfk-media-owner-online-index.sql \
  -X -v ON_ERROR_STOP=1

header "Step 4/6: normalize app schema ownership after migrations"
superuser_psql_target -X -v ON_ERROR_STOP=1 \
  -v p2_b_owner_role="${P2_B_OWNER_ROLE}" <<'SQL'
SELECT format('ALTER SCHEMA app OWNER TO %I', :'p2_b_owner_role')
WHERE EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app')
\gexec

SELECT format('ALTER FUNCTION app.is_staff() OWNER TO %I', :'p2_b_owner_role')
WHERE to_regprocedure('app.is_staff()') IS NOT NULL
\gexec
SQL

header "Step 5/6: install protected DB principal context"
p2_b_signing_secret="${P2_B_SIGNING_SECRET:-${DB_PRINCIPAL_SIGNING_SECRET:-}}"
if [[ -z "${p2_b_signing_secret}" ]]; then
  p2_b_signing_secret="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"
fi
if (( ${#p2_b_signing_secret} < 32 )); then
  printf 'FATAL: P2_B_SIGNING_SECRET/DB_PRINCIPAL_SIGNING_SECRET must be at least 32 characters when provided.\n' >&2
  exit 1
fi
if [[ "${p2_b_signing_secret}" =~ [[:space:]\\] ]]; then
  printf 'FATAL: P2_B_SIGNING_SECRET/DB_PRINCIPAL_SIGNING_SECRET must not contain whitespace or backslashes.\n' >&2
  exit 1
fi
p2_b_psql_file="$(mktemp)"
chmod 600 "${p2_b_psql_file}"
{
  printf '\\set p2_b_owner_role %s\n' "${P2_B_OWNER_ROLE}"
  printf '\\set p2_b_staff_role %s\n' "${P2_B_STAFF_ROLE}"
  printf '\\set p2_b_patient_role %s\n' "${P2_B_PATIENT_ROLE}"
  printf '\\set p2_b_signing_secret %s\n' "${p2_b_signing_secret}"
  printf '\\i deploy/postgres/p2-b-protected-principal-context.sql\n'
} > "${p2_b_psql_file}"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${p2_b_psql_file}"
rm -f "${p2_b_psql_file}"
p2_b_psql_file=""
unset p2_b_signing_secret
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f deploy/postgres/patient-visible-catalog-rls.sql

header "Step 6/6: consolidate specialist identity"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $specialist_fingerprint$
DECLARE
  v_canonical_name text;
  v_active_duplicates uuid[];
BEGIN
  SELECT full_name INTO v_canonical_name
  FROM public.be_specialists
  WHERE id = 'c9515025-7224-4d9b-86b6-9cb7d26ea503'::uuid
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
    AND id <> 'c9515025-7224-4d9b-86b6-9cb7d26ea503'::uuid;

  IF v_active_duplicates IS DISTINCT FROM ARRAY['518ea988-9b5e-4ad8-8194-a2d98f43bd7b'::uuid]
    AND NOT (
      v_active_duplicates = ARRAY[]::uuid[]
      AND EXISTS (
        SELECT 1 FROM public.be_specialists
        WHERE id = '518ea988-9b5e-4ad8-8194-a2d98f43bd7b'::uuid
          AND organization_id = 'a0000000-0000-4000-8000-000000000001'::uuid
          AND full_name = v_canonical_name
          AND is_active IS FALSE
      )
    )
  THEN
    RAISE EXCEPTION 'SPECIALIST FINGERPRINT FAILED: expected a fresh dump with active duplicate {518ea988-9b5e-4ad8-8194-a2d98f43bd7b}, or its exact current-canonical inactive state; restore a fresh dump instead of reversing an old #667-consolidated copy (active set %)',
      v_active_duplicates;
  END IF;
END
$specialist_fingerprint$;
SQL
pnpm --dir apps/webapp run consolidate-specialist-identity -- \
  --canonical=c9515025-7224-4d9b-86b6-9cb7d26ea503 --summary-only --commit

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
revoke_migrator_elevation
superuser_psql_target -X -v ON_ERROR_STOP=1 \
  -v required_drizzle_hash_groups="${required_drizzle_hash_groups}" \
  -v p2_b_owner_role="${P2_B_OWNER_ROLE}" \
  -v p2_b_migrator_role="${migrator_role}" <<'SQL'
SELECT set_config('deploy.required_drizzle_hash_groups', :'required_drizzle_hash_groups', false);
SELECT set_config('deploy.p2_b_owner_role', :'p2_b_owner_role', false);
SELECT set_config('deploy.p2_b_migrator_role', :'p2_b_migrator_role', false);

DO $assertions$
DECLARE
  v_count bigint;
  v_admin_id uuid;
  v_ledger_column text;
  v_table text;
  v_hash_group text;
  v_hash_group_index integer := 0;
  v_function_security_definer boolean;
  v_owner_role text := current_setting('deploy.p2_b_owner_role');
  v_migrator_role text := current_setting('deploy.p2_b_migrator_role');
  v_saas_versions text[] := ARRAY[
    '20260707_0001_p0_4_i0_integrator_org_columns_predeclare.sql',
    '20260708_0001_p0_4_i1_integrator_direct_user_org.sql',
    '20260708_0002_p0_4_i2_integrator_identity_path_org.sql',
    '20260708_0003_p0_4_i3_integrator_parent_denorm_org.sql',
    '20260708_0004_p0_4_i4_integrator_mailings_org.sql',
    '20260710_0001_r2_integrator_scoped_org_not_null.sql'
  ];
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = v_migrator_role AND rolbypassrls IS TRUE
  ) THEN
    RAISE EXCEPTION 'ASSERT FAILED: migrator role % still has BYPASSRLS', v_migrator_role;
  END IF;

  IF pg_has_role(v_migrator_role, v_owner_role, 'member') THEN
    RAISE EXCEPTION 'ASSERT FAILED: migrator role % is still a member of %', v_migrator_role, v_owner_role;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = v_owner_role AND rolcanlogin IS FALSE AND rolsuper IS FALSE AND rolbypassrls IS TRUE
  ) THEN
    RAISE EXCEPTION 'ASSERT FAILED: owner role % must be NOLOGIN NOSUPERUSER BYPASSRLS', v_owner_role;
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_namespace n
  JOIN pg_roles r ON r.oid = n.nspowner
  WHERE n.nspname = 'app' AND r.rolname = v_owner_role;
  IF v_count <> 1 THEN RAISE EXCEPTION 'ASSERT FAILED: app schema must be owned by %', v_owner_role; END IF;

  SELECT p.prosecdef INTO v_function_security_definer
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_roles r ON r.oid = p.proowner
  WHERE n.nspname = 'app'
    AND p.proname = 'is_staff'
    AND p.pronargs = 0
    AND r.rolname = v_owner_role;
  IF v_function_security_definer IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'ASSERT FAILED: app.is_staff() must exist, be owned by %, and be SECURITY INVOKER', v_owner_role;
  END IF;

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
  WHERE s.id = 'c9515025-7224-4d9b-86b6-9cb7d26ea503'::uuid
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
    'user_subscriptions', 'message_drafts', 'mailings', 'mailing_logs',
    'user_reminder_occurrences',
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
    ('public', 'org_enrollments'), ('public', 'clinical_visit')
  ) AND c.relrowsecurity IS TRUE AND c.relforcerowsecurity IS FALSE;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'ASSERT FAILED: representative dormant NO FORCE RLS table count = %, expected 2', v_count;
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
      AND role = 'doctor' AND specialist_id = 'c9515025-7224-4d9b-86b6-9cb7d26ea503'::uuid
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
FROM public.be_appointments WHERE specialist_id = 'c9515025-7224-4d9b-86b6-9cb7d26ea503'::uuid
UNION ALL SELECT 'drizzle_migrations_minimum', count(*), 178 FROM drizzle.__drizzle_migrations
UNION ALL SELECT 'required_memberships', count(*), 2 FROM public.be_organization_members
WHERE platform_user_id = 'b0021a38-fb86-45e9-9aec-d85014e932d4'::uuid
   OR platform_user_id = (
     SELECT id FROM public.platform_users
     WHERE role = 'admin' AND email_normalized = 'dimmdao@gmail.com'
       AND merged_into_id IS NULL AND is_archived IS FALSE
   );
SQL

revoke_migrator_elevation

printf '\n✅ ALL GREEN (#667 deploy sequence)\n'
