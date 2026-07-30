#!/usr/bin/env bash
set -euo pipefail

PG_BINDIR="$(pg_config --bindir)"
ROOT="$(mktemp -d /tmp/bcb-c4-webpush-pg16.XXXXXX)"
DATA="$ROOT/data"
SOCKET="$ROOT/socket"
LOGIN_ROLE="c4_webpush_smoke_login"
mkdir -p "$SOCKET"

cleanup(){
  "$PG_BINDIR/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$ROOT"
}
trap cleanup EXIT

"$PG_BINDIR/initdb" -D "$DATA" -A trust -U postgres --no-locale >/dev/null
printf "listen_addresses = ''\nunix_socket_directories = '%s'\n" "$SOCKET" >> "$DATA/postgresql.conf"
"$PG_BINDIR/pg_ctl" -D "$DATA" -w start >/dev/null

psql=("$PG_BINDIR/psql" -h "$SOCKET" -U postgres -d postgres -X -v ON_ERROR_STOP=1 -q)
"${psql[@]}" <<'SQL'
CREATE ROLE app_owner NOLOGIN;
CREATE ROLE app_staff NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE app_patient NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE c4_webpush_smoke_operator LOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE c4_webpush_smoke_login LOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE app_operational_web_push_reminder NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE c4_webpush_smoke_incoming NOLOGIN;
CREATE ROLE c4_webpush_smoke_outgoing NOLOGIN;
CREATE ROLE c4_webpush_smoke_cap_incoming NOLOGIN;
CREATE ROLE c4_webpush_smoke_cap_outgoing NOLOGIN;
CREATE ROLE c4_webpush_smoke_definer_incoming NOLOGIN;
CREATE ROLE c4_webpush_smoke_definer_outgoing NOLOGIN;
CREATE SCHEMA app AUTHORIZATION app_owner;
CREATE TABLE public.platform_users(id uuid PRIMARY KEY, reminder_muted_until timestamptz);
CREATE TABLE public.reminder_rules(organization_id uuid, integrator_rule_id text, platform_user_id uuid, integrator_user_id bigint, is_enabled boolean);
CREATE TABLE public.webapp_reminder_occurrences(id uuid, organization_id uuid);
CREATE TABLE public.notification_delivery_attempts(id uuid, organization_id uuid);
CREATE TABLE public.product_push_notifications(id uuid, organization_id uuid);
CREATE TABLE public.product_analytics_hourly(organization_id uuid);
CREATE TABLE public.user_channel_preferences(platform_user_id uuid);
CREATE TABLE public.user_notification_topic_channels(user_id uuid);
CREATE TABLE public.user_web_push_subscriptions(user_id uuid);
CREATE TABLE public.org_enrollments(organization_id uuid, platform_user_id uuid, status text);
CREATE TABLE public.patient_home_blocks(organization_id uuid);
CREATE TABLE public.patient_home_block_items(organization_id uuid);
CREATE TABLE public.content_sections(organization_id uuid, is_visible boolean);
CREATE TABLE public.content_pages(
  organization_id uuid,
  is_published boolean,
  archived_at timestamptz,
  deleted_at timestamptz
);
CREATE TABLE public.content_section_slug_history(organization_id uuid);
CREATE TABLE public.operator_job_status(job_family text, job_key text PRIMARY KEY, last_status text);
CREATE TABLE public.outside_contour(secret text);
SET ROLE app_owner;
CREATE FUNCTION app.current_org_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT NULLIF(current_setting('app.org', true), '')::uuid
$$;
CREATE FUNCTION app.current_patient_user_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT NULLIF(current_setting('app.patient_user_id', true), '')::uuid
$$;
CREATE FUNCTION app.current_integrator_user_id() RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT NULLIF(current_setting('app.integrator_user_id', true), '')::bigint
$$;
CREATE FUNCTION app.is_staff() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION app.get_web_push_vapid_public_key() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT 'public-key'::text $$;
RESET ROLE;
REVOKE EXECUTE ON FUNCTION app.current_org_id(), app.current_patient_user_id(),
  app.current_integrator_user_id(), app.is_staff() FROM PUBLIC;
DO $rls$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'reminder_rules', 'platform_users', 'webapp_reminder_occurrences',
    'notification_delivery_attempts', 'product_push_notifications', 'product_analytics_hourly',
    'user_channel_preferences', 'user_notification_topic_channels', 'user_web_push_subscriptions',
    'patient_home_blocks', 'patient_home_block_items', 'content_sections', 'content_pages',
    'content_section_slug_history'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO app_owner', relation_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', relation_name);
  END LOOP;
END
$rls$;
INSERT INTO public.platform_users VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', NULL), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', NULL);
INSERT INTO public.reminder_rules VALUES
 ('11111111-1111-4111-8111-111111111111','rule-a','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,true),
 ('22222222-2222-4222-8222-222222222222','rule-b','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',NULL,true);
INSERT INTO public.webapp_reminder_occurrences VALUES
 ('aaaaaaaa-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111'),
 ('bbbbbbbb-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222');
INSERT INTO public.content_sections VALUES
 ('11111111-1111-4111-8111-111111111111', true),
 (NULL, true);
INSERT INTO public.content_pages VALUES
 ('11111111-1111-4111-8111-111111111111', true, NULL, NULL);
INSERT INTO public.org_enrollments VALUES
 ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'active');
INSERT INTO public.operator_job_status(job_key,job_family,last_status) VALUES
 ('reminders.web_push_only.tick','reminders','old'),
 ('health.other.tick','health','old');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_job_status TO app_staff;
GRANT app_staff TO c4_webpush_smoke_operator WITH INHERIT FALSE, SET TRUE;
GRANT USAGE ON SCHEMA public, app TO app_operational_web_push_reminder;
GRANT SELECT ON public.webapp_reminder_occurrences, public.content_sections, public.content_pages
  TO app_operational_web_push_reminder;
GRANT SELECT, INSERT, UPDATE ON public.operator_job_status TO app_operational_web_push_reminder;
GRANT app_operational_web_push_reminder TO c4_webpush_smoke_login WITH INHERIT FALSE, SET TRUE;
GRANT USAGE ON SCHEMA app, public TO app_patient;
GRANT SELECT ON public.content_sections, public.content_pages, public.org_enrollments TO app_patient;
GRANT EXECUTE ON FUNCTION app.current_org_id(), app.current_patient_user_id() TO app_patient;
CREATE POLICY pre_overlay_locked_helper_dependency ON public.webapp_reminder_occurrences
  TO app_operational_web_push_reminder
  USING (
    (app.current_org_id() IS NULL
      AND app.current_patient_user_id() IS NULL
      AND app.current_integrator_user_id() IS NULL
      AND NOT app.is_staff())
    OR (app.is_staff() AND organization_id = app.current_org_id())
  );
CREATE POLICY patient_visible_current_org_select ON public.content_sections
  FOR SELECT
  USING (
    app.current_patient_user_id() IS NOT NULL
    AND organization_id = app.current_org_id()
    AND is_visible = true
    AND EXISTS (
      SELECT 1 FROM public.org_enrollments AS enrollment
      WHERE enrollment.organization_id = app.current_org_id()
        AND enrollment.platform_user_id = app.current_patient_user_id()
        AND enrollment.status = 'active'
    )
  );
CREATE POLICY patient_visible_current_org_select ON public.content_pages
  FOR SELECT
  USING (
    app.current_patient_user_id() IS NOT NULL
    AND organization_id = app.current_org_id()
    AND is_published = true
    AND archived_at IS NULL
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.org_enrollments AS enrollment
      WHERE enrollment.organization_id = app.current_org_id()
        AND enrollment.platform_user_id = app.current_patient_user_id()
        AND enrollment.status = 'active'
    )
  );
SQL

# Reproduce the fresh readiness failure with the actual base LOGIN, terminal capability and org.
if "${psql[@]}" -U "$LOGIN_ROLE" -c \
    "SET ROLE app_operational_web_push_reminder; SELECT set_config('app.org','11111111-1111-4111-8111-111111111111',false); SELECT count(*) FROM public.webapp_reminder_occurrences;" \
    >"$ROOT/pre-overlay-helper.out" 2>&1; then
  echo "FATAL: helper-dependent readiness unexpectedly passed before overlay grant" >&2
  exit 1
fi
grep -Fq 'permission denied for function current_org_id' "$ROOT/pre-overlay-helper.out" || {
  echo "FATAL: pre-overlay proof did not reproduce current_org_id permission denial" >&2
  exit 1
}

# The canonical 163-target strict artifact excludes this INFRA table. A fresh prod-copy therefore
# reaches C4 with RLS/FORCE disabled and no policy; direct capability grants expose every key.
pre_overlay_canonical_state="$("${psql[@]}" -Atc "SELECT relrowsecurity::int || ':' || relforcerowsecurity::int || ':' || (SELECT count(*) FROM pg_policy WHERE polrelid='public.operator_job_status'::regclass)::text FROM pg_class WHERE oid='public.operator_job_status'::regclass")"
[ "$pre_overlay_canonical_state" = "0:0:0" ] || { echo "FATAL: synthetic fixture does not match canonical post-strict operator status state" >&2; exit 1; }
pre_overlay_status="$("${psql[@]}" -U "$LOGIN_ROLE" -Atc "SET ROLE app_operational_web_push_reminder; SELECT count(*) FROM public.operator_job_status; UPDATE public.operator_job_status SET last_status='pre-fix-exposed' WHERE job_key='health.other.tick'; SELECT last_status FROM public.operator_job_status WHERE job_key='health.other.tick';")"
[ "$pre_overlay_status" = $'2\npre-fix-exposed' ] || {
  echo "FATAL: pre-overlay proof did not reproduce permissive operator status exposure" >&2
  exit 1
}

"${psql[@]}" -v c4_web_push_reminder_login_role="$LOGIN_ROLE" \
  -f deploy/postgres/c4-web-push-reminder-runtime.sql >/dev/null

post_overlay_canonical_state="$("${psql[@]}" -Atc "SELECT relrowsecurity::int || ':' || relforcerowsecurity::int || ':' || (SELECT count(*) FROM pg_policy WHERE polrelid='public.operator_job_status'::regclass AND polname='saas_enforce_default_deny_p0_9_1')::text FROM pg_class WHERE oid='public.operator_job_status'::regclass")"
[ "$post_overlay_canonical_state" = "1:1:1" ] || { echo "FATAL: overlay did not materialize canonical operator status P0.9 RLS/FORCE contract" >&2; exit 1; }

post_overlay_helpers="$("${psql[@]}" -U "$LOGIN_ROLE" -Atc \
  "SET ROLE app_operational_web_push_reminder; SELECT set_config('app.org','11111111-1111-4111-8111-111111111111',false); SELECT app.current_org_id()::text || ':' || (app.current_patient_user_id() IS NULL)::int || ':' || (app.current_integrator_user_id() IS NULL)::int || ':' || app.is_staff()::int; SELECT count(*) FROM public.webapp_reminder_occurrences;")"
[ "$post_overlay_helpers" = $'11111111-1111-4111-8111-111111111111\n11111111-1111-4111-8111-111111111111:1:1:0\n1' ] || {
  echo "FATAL: helper-dependent readiness did not pass after overlay" >&2
  exit 1
}

# Reproduce the reported tick failure: the old PUBLIC patient policies force the
# operational role to evaluate org_enrollments even though its own C4 catalog policy matches.
# psql's SQLSTATE variable is the oracle; stderr wording and locale are irrelevant.
for catalog_table in content_sections content_pages; do
  legacy_sqlstate="$("${psql[@]}" -U "$LOGIN_ROLE" -At 2>/dev/null <<SQL | tail -n 1
\set ON_ERROR_STOP 0
SET ROLE app_operational_web_push_reminder;
SELECT set_config('app.org','11111111-1111-4111-8111-111111111111',false);
SELECT count(*) FROM public.${catalog_table};
\echo :SQLSTATE
SQL
  )"
  [ "$legacy_sqlstate" = "42501" ] || {
    echo "FATAL: ${catalog_table} legacy PUBLIC policy returned SQLSTATE ${legacy_sqlstate:-missing}, expected 42501" >&2
    exit 1
  }
done

"${psql[@]}" -f deploy/postgres/patient-visible-catalog-rls.sql >/dev/null

catalog_before_org="$("${psql[@]}" -U "$LOGIN_ROLE" -At 2>/dev/null <<'SQL'
\set ON_ERROR_STOP 0
SET ROLE app_operational_web_push_reminder;
SELECT count(*) FROM public.content_sections;
\echo :SQLSTATE
SQL
)"
[ "$catalog_before_org" = $'1\n00000' ] || {
  printf 'FATAL: content_sections pre-fanout read returned unexpected result/SQLSTATE\n%s\n' \
    "$catalog_before_org" >&2
  exit 1
}

catalog_after_fix="$("${psql[@]}" -U "$LOGIN_ROLE" -Atc \
  "SET ROLE app_operational_web_push_reminder; SELECT set_config('app.org','11111111-1111-4111-8111-111111111111',false); SELECT count(*) FROM public.content_sections; SELECT count(*) FROM public.content_pages; SELECT has_table_privilege(current_user, 'public.org_enrollments', 'SELECT')::int;")"
[ "$catalog_after_fix" = $'11111111-1111-4111-8111-111111111111\n2\n1\n0' ] || {
  echo "FATAL: patient policy repair did not restore least-privilege catalog reads" >&2
  exit 1
}
direct_enrollment_sqlstate="$("${psql[@]}" -U "$LOGIN_ROLE" -At 2>/dev/null <<'SQL' | tail -n 1
\set ON_ERROR_STOP 0
SET ROLE app_operational_web_push_reminder;
SELECT count(*) FROM public.org_enrollments;
\echo :SQLSTATE
SQL
)"
[ "$direct_enrollment_sqlstate" = "42501" ] || {
  echo "FATAL: direct org_enrollments read returned SQLSTATE ${direct_enrollment_sqlstate:-missing}, expected 42501" >&2
  exit 1
}

patient_catalog="$("${psql[@]}" -Atc \
  "SET ROLE app_patient; SELECT set_config('app.org','11111111-1111-4111-8111-111111111111',false); SELECT set_config('app.patient_user_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false); SELECT count(*) FROM public.content_sections; SELECT count(*) FROM public.content_pages;")"
[ "$patient_catalog" = $'11111111-1111-4111-8111-111111111111\naaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\n1\n1' ] || {
  echo "FATAL: scoped patient lost permitted visible/published catalog rows" >&2
  exit 1
}

# Reapply must scrub both incoming and outgoing unexpected membership edges.
"${psql[@]}" <<'SQL'
GRANT c4_webpush_smoke_login TO c4_webpush_smoke_incoming;
GRANT c4_webpush_smoke_outgoing TO c4_webpush_smoke_login;
GRANT app_operational_web_push_reminder TO c4_webpush_smoke_cap_incoming;
GRANT c4_webpush_smoke_cap_outgoing TO app_operational_web_push_reminder;
GRANT app_web_push_reminder_discovery_definer TO c4_webpush_smoke_definer_incoming;
GRANT c4_webpush_smoke_definer_outgoing TO app_web_push_reminder_discovery_definer;
GRANT SELECT ON public.outside_contour TO c4_webpush_smoke_login;
GRANT SELECT ON public.outside_contour TO app_operational_web_push_reminder;
GRANT SELECT ON public.outside_contour TO app_web_push_reminder_discovery_definer;
GRANT SELECT ON public.operator_job_status TO c4_webpush_smoke_login;
GRANT SELECT ON public.operator_job_status TO app_web_push_reminder_discovery_definer;
GRANT DELETE ON public.operator_job_status TO app_operational_web_push_reminder;
GRANT UPDATE (last_status) ON public.operator_job_status TO c4_webpush_smoke_login;
GRANT SELECT (job_key) ON public.operator_job_status TO app_web_push_reminder_discovery_definer;
GRANT REFERENCES (job_key) ON public.operator_job_status TO app_operational_web_push_reminder;
GRANT UPDATE (last_status) ON public.operator_job_status TO PUBLIC;
CREATE POLICY injected_c4_status_permissive ON public.operator_job_status
  TO app_operational_web_push_reminder USING (true) WITH CHECK (true);
GRANT EXECUTE ON FUNCTION app.current_org_id(), app.current_patient_user_id(),
  app.current_integrator_user_id(), app.is_staff() TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_org_id(), app.current_patient_user_id(),
  app.current_integrator_user_id(), app.is_staff() TO c4_webpush_smoke_login;
GRANT EXECUTE ON FUNCTION app.current_org_id(), app.current_patient_user_id(),
  app.current_integrator_user_id(), app.is_staff() TO app_web_push_reminder_discovery_definer;
GRANT EXECUTE ON FUNCTION app.current_org_id(), app.current_patient_user_id(),
  app.current_integrator_user_id(), app.is_staff() TO app_operational_web_push_reminder WITH GRANT OPTION;
SQL
injected_overgrants="$("${psql[@]}" -Atc "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='outside_contour' AND grantee IN ('$LOGIN_ROLE','app_operational_web_push_reminder','app_web_push_reminder_discovery_definer') AND privilege_type='SELECT'")"
[ "$injected_overgrants" = "3" ] || { echo "FATAL: failed to inject overgrant rehearsal" >&2; exit 1; }
injected_status_column_grants="$("${psql[@]}" -Atc "WITH managed AS (SELECT oid FROM pg_roles WHERE rolname IN ('$LOGIN_ROLE','app_operational_web_push_reminder','app_web_push_reminder_discovery_definer')) SELECT count(*) FROM pg_attribute attribute CROSS JOIN LATERAL aclexplode(attribute.attacl) acl WHERE attribute.attrelid='public.operator_job_status'::regclass AND attribute.attnum > 0 AND NOT attribute.attisdropped AND (acl.grantee=0 OR acl.grantee IN (SELECT oid FROM managed))")"
[ "$injected_status_column_grants" = "4" ] || { echo "FATAL: failed to inject operator status column-ACL drift" >&2; exit 1; }
"${psql[@]}" -U "$LOGIN_ROLE" -c \
  'SET ROLE app_operational_web_push_reminder; SELECT count(*) FROM public.outside_contour;' >/dev/null || {
  echo "FATAL: injected overgrant did not make the readiness-negative surface reachable" >&2
  exit 1
}
"${psql[@]}" -v c4_web_push_reminder_login_role="$LOGIN_ROLE" \
  -f deploy/postgres/c4-web-push-reminder-runtime.sql >/dev/null
topology_edges="$("${psql[@]}" -Atc "SELECT count(*) FROM pg_auth_members membership JOIN pg_roles granted ON granted.oid=membership.roleid JOIN pg_roles member ON member.oid=membership.member WHERE granted.rolname IN ('$LOGIN_ROLE','app_operational_web_push_reminder','app_web_push_reminder_discovery_definer') OR member.rolname IN ('$LOGIN_ROLE','app_operational_web_push_reminder','app_web_push_reminder_discovery_definer')")"
[ "$topology_edges" = "1" ] || { echo "FATAL: reapply did not restore exact role topology" >&2; exit 1; }
remaining_overgrants="$("${psql[@]}" -Atc "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='outside_contour' AND grantee IN ('$LOGIN_ROLE','app_operational_web_push_reminder','app_web_push_reminder_discovery_definer') AND privilege_type='SELECT'")"
[ "$remaining_overgrants" = "0" ] || { echo "FATAL: reapply retained injected overgrant" >&2; exit 1; }
helper_acl="$("${psql[@]}" -Atc "WITH helpers(oid) AS (VALUES ('app.current_org_id()'::regprocedure),('app.current_patient_user_id()'::regprocedure),('app.current_integrator_user_id()'::regprocedure),('app.is_staff()'::regprocedure)) SELECT count(*)::text || ':' || count(*) FILTER (WHERE grantee.rolname='app_operational_web_push_reminder' AND acl.privilege_type='EXECUTE' AND NOT acl.is_grantable)::text || ':' || count(*) FILTER (WHERE acl.grantee=0 OR grantee.rolname IN ('$LOGIN_ROLE','app_web_push_reminder_discovery_definer'))::text FROM helpers JOIN pg_proc routine ON routine.oid=helpers.oid CROSS JOIN LATERAL aclexplode(routine.proacl) acl LEFT JOIN pg_roles grantee ON grantee.oid=acl.grantee WHERE acl.privilege_type='EXECUTE' AND (acl.grantee=0 OR grantee.rolname IN ('$LOGIN_ROLE','app_operational_web_push_reminder','app_web_push_reminder_discovery_definer'));")"
[ "$helper_acl" = "4:4:0" ] || { echo "FATAL: reapply did not restore exact helper ACL" >&2; exit 1; }
status_policy_acl="$("${psql[@]}" -Atc "WITH cap AS (SELECT oid FROM pg_roles WHERE rolname='app_operational_web_push_reminder'), managed AS (SELECT oid FROM pg_roles WHERE rolname IN ('$LOGIN_ROLE','app_operational_web_push_reminder','app_web_push_reminder_discovery_definer')) SELECT (SELECT count(*) FROM pg_policy WHERE polrelid='public.operator_job_status'::regclass)::text || ':' || (SELECT count(*) FROM pg_policy, cap WHERE polrelid='public.operator_job_status'::regclass AND NOT polpermissive AND cap.oid=ANY(polroles))::text || ':' || has_table_privilege('$LOGIN_ROLE','public.operator_job_status','SELECT')::int || ':' || has_table_privilege('app_web_push_reminder_discovery_definer','public.operator_job_status','SELECT')::int || ':' || has_table_privilege('app_operational_web_push_reminder','public.operator_job_status','DELETE')::int || ':' || (SELECT count(*) FROM pg_attribute attribute CROSS JOIN LATERAL aclexplode(attribute.attacl) acl WHERE attribute.attrelid='public.operator_job_status'::regclass AND attribute.attnum > 0 AND NOT attribute.attisdropped AND (acl.grantee=0 OR acl.grantee IN (SELECT oid FROM managed)))::text || ':' || (SELECT count(*) FROM pg_class relation CROSS JOIN LATERAL aclexplode(relation.relacl) acl WHERE relation.oid='public.operator_job_status'::regclass AND acl.grantee=0 AND acl.privilege_type='DELETE')::text;")"
[ "$status_policy_acl" = "3:1:0:0:0:0:0" ] || { echo "FATAL: reapply did not restore exact operator status policy/ACL including column/PUBLIC grants" >&2; exit 1; }
status_exact="$("${psql[@]}" -U "$LOGIN_ROLE" -At <<'SQL'
SET ROLE app_operational_web_push_reminder;
INSERT INTO public.operator_job_status(job_family,job_key,last_status)
VALUES ('reminders','reminders.web_push_only.tick','ok')
ON CONFLICT (job_key) DO UPDATE SET job_family=EXCLUDED.job_family,last_status=EXCLUDED.last_status;
SELECT count(*) FROM public.operator_job_status;
WITH changed AS (
  UPDATE public.operator_job_status SET last_status='forbidden' WHERE job_key='health.other.tick' RETURNING 1
) SELECT count(*) FROM changed;
SQL
)"
[ "$status_exact" = $'1\n0' ] || { echo "FATAL: exact operator status transaction failed" >&2; exit 1; }
legacy_operator_status="$("${psql[@]}" -U c4_webpush_smoke_operator -Atc "SET ROLE app_staff; SELECT count(*) FROM public.operator_job_status; UPDATE public.operator_job_status SET last_status='legacy-operator-ok' WHERE job_key='health.other.tick'; SELECT last_status FROM public.operator_job_status WHERE job_key='health.other.tick';")"
[ "$legacy_operator_status" = $'2\nlegacy-operator-ok' ] || { echo "FATAL: restrictive C4 policy broke the intended legacy operator contour" >&2; exit 1; }
if "${psql[@]}" -U "$LOGIN_ROLE" -c "SET ROLE app_operational_web_push_reminder; INSERT INTO public.operator_job_status(job_family,job_key,last_status) VALUES ('health','health.injected','bad');" >/dev/null 2>&1; then
  echo "FATAL: noncanonical operator status insert passed" >&2
  exit 1
fi
if "${psql[@]}" -U "$LOGIN_ROLE" -c "SET ROLE app_operational_web_push_reminder; DELETE FROM public.operator_job_status WHERE job_key='reminders.web_push_only.tick';" >/dev/null 2>&1; then
  echo "FATAL: operator status delete passed" >&2
  exit 1
fi
if "${psql[@]}" -U "$LOGIN_ROLE" -c \
  'SET ROLE app_operational_web_push_reminder; SELECT count(*) FROM public.outside_contour;' >/dev/null 2>&1; then
  echo "FATAL: reapply left the readiness-negative surface reachable" >&2
  exit 1
fi

# Base LOGIN has no direct table access.
if "${psql[@]}" -U "$LOGIN_ROLE" -c 'SELECT * FROM public.reminder_rules' >/dev/null 2>&1; then
  echo "FATAL: base LOGIN can read reminder_rules without SET ROLE" >&2
  exit 1
fi

result="$("${psql[@]}" -U "$LOGIN_ROLE" -At <<'SQL'
SET ROLE app_operational_web_push_reminder;
SELECT string_agg(organization_id::text, ',' ORDER BY organization_id) FROM app.list_web_push_reminder_organization_ids(now());
SELECT set_config('app.org', '11111111-1111-4111-8111-111111111111', false);
SELECT count(*) FROM public.webapp_reminder_occurrences;
SELECT count(*) FROM public.platform_users;
SELECT count(*) FROM public.content_sections;
SELECT count(*) FROM public.content_pages;
SELECT has_table_privilege(current_user, 'public.org_enrollments', 'SELECT')::int;
SELECT has_table_privilege(current_user, 'public.outside_contour', 'SELECT')::int;
SELECT count(*) FROM public.operator_job_status WHERE job_family='other';
RESET ROLE;
SELECT rolcanlogin::int || ':' || rolinherit::int || ':' || rolbypassrls::int FROM pg_roles WHERE rolname='c4_webpush_smoke_login';
SELECT rolcanlogin::int || ':' || rolinherit::int || ':' || rolbypassrls::int FROM pg_roles WHERE rolname='app_operational_web_push_reminder';
SELECT rolcanlogin::int || ':' || rolinherit::int || ':' || rolbypassrls::int FROM pg_roles WHERE rolname='app_web_push_reminder_discovery_definer';
SQL
)"

expected=$'11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222\n11111111-1111-4111-8111-111111111111\n1\n1\n2\n1\n0\n0\n0\n1:0:0\n0:0:0\n0:0:0'
[ "$result" = "$expected" ] || { printf 'FATAL: unexpected proof output\n%s\n' "$result" >&2; exit 1; }

"${psql[@]}" -c 'DROP POLICY pre_overlay_locked_helper_dependency ON public.webapp_reminder_occurrences;'
"${psql[@]}" <<'SQL'
GRANT EXECUTE ON FUNCTION app.current_org_id(), app.current_patient_user_id(),
  app.current_integrator_user_id(), app.is_staff() TO PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_org_id(), app.current_patient_user_id(),
  app.current_integrator_user_id(), app.is_staff() TO c4_webpush_smoke_login;
GRANT EXECUTE ON FUNCTION app.current_org_id(), app.current_patient_user_id(),
  app.current_integrator_user_id(), app.is_staff() TO app_web_push_reminder_discovery_definer;
GRANT EXECUTE ON FUNCTION app.current_org_id(), app.current_patient_user_id(),
  app.current_integrator_user_id(), app.is_staff() TO app_operational_web_push_reminder WITH GRANT OPTION;
GRANT SELECT ON public.operator_job_status TO c4_webpush_smoke_login;
GRANT SELECT ON public.operator_job_status TO app_web_push_reminder_discovery_definer;
GRANT DELETE ON public.operator_job_status TO app_operational_web_push_reminder;
GRANT UPDATE (last_status) ON public.operator_job_status TO c4_webpush_smoke_login;
GRANT SELECT (job_key) ON public.operator_job_status TO app_web_push_reminder_discovery_definer;
GRANT REFERENCES (job_key) ON public.operator_job_status TO app_operational_web_push_reminder;
GRANT UPDATE (last_status) ON public.operator_job_status TO PUBLIC;
CREATE POLICY injected_c4_status_down_drift ON public.operator_job_status
  TO app_operational_web_push_reminder USING (true) WITH CHECK (true);
SQL
"${psql[@]}" -v c4_web_push_reminder_login_role="$LOGIN_ROLE" -v c4_web_push_reminder_down=1 \
  -f deploy/postgres/c4-web-push-reminder-runtime.sql >/dev/null
cleanup_state="$("${psql[@]}" -Atc "SELECT (to_regrole('app_operational_web_push_reminder') IS NULL)::int || ':' || (to_regrole('app_web_push_reminder_discovery_definer') IS NULL)::int || ':' || (to_regrole('$LOGIN_ROLE') IS NOT NULL)::int || ':' || ((SELECT count(*) FROM pg_auth_members membership JOIN pg_roles granted ON granted.oid=membership.roleid JOIN pg_roles member ON member.oid=membership.member WHERE granted.rolname='$LOGIN_ROLE' OR member.rolname='$LOGIN_ROLE')=0)::int")"
[ "$cleanup_state" = "1:1:1:1" ] || { echo "FATAL: overlay cleanup proof failed" >&2; exit 1; }
if "${psql[@]}" -U "$LOGIN_ROLE" -c 'SELECT app.current_org_id();' >/dev/null 2>&1; then
  echo "FATAL: DOWN retained base-login helper EXECUTE" >&2
  exit 1
fi
down_status_state="$("${psql[@]}" -Atc "SELECT (SELECT count(*) FROM pg_policy WHERE polrelid='public.operator_job_status'::regclass)::text || ':' || (SELECT count(*) FROM pg_policy WHERE polrelid='public.operator_job_status'::regclass AND polname='saas_enforce_default_deny_p0_9_1')::text || ':' || has_table_privilege('$LOGIN_ROLE','public.operator_job_status','SELECT')::int || ':' || (SELECT count(*) FROM pg_attribute attribute CROSS JOIN LATERAL aclexplode(attribute.attacl) acl WHERE attribute.attrelid='public.operator_job_status'::regclass AND attribute.attnum > 0 AND NOT attribute.attisdropped AND (acl.grantee=0 OR acl.grantee=(SELECT oid FROM pg_roles WHERE rolname='$LOGIN_ROLE')))::text || ':' || (SELECT count(*) FROM pg_class relation CROSS JOIN LATERAL aclexplode(relation.relacl) acl WHERE relation.oid='public.operator_job_status'::regclass AND acl.grantee=0 AND acl.privilege_type='DELETE')::text;")"
[ "$down_status_state" = "1:1:0:0:0" ] || { echo "FATAL: DOWN did not preserve only legacy operator policy and scrub base/column/PUBLIC ACL" >&2; exit 1; }
"${psql[@]}" -v c4_web_push_reminder_login_role="$LOGIN_ROLE" -v c4_web_push_reminder_down=1 \
  -f deploy/postgres/c4-web-push-reminder-runtime.sql >/dev/null
repeat_down_state="$("${psql[@]}" -Atc "SELECT (to_regrole('app_operational_web_push_reminder') IS NULL)::int || ':' || (to_regrole('app_web_push_reminder_discovery_definer') IS NULL)::int || ':' || (SELECT count(*) FROM pg_policy WHERE polrelid='public.operator_job_status'::regclass)::text")"
[ "$repeat_down_state" = "1:1:1" ] || { echo "FATAL: repeated role-absent DOWN was not idempotent" >&2; exit 1; }

echo "C4 Web Push reminder private PostgreSQL 16 proof: OK"
