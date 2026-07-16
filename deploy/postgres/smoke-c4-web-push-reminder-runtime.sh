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
CREATE ROLE c4_webpush_smoke_login LOGIN NOINHERIT NOBYPASSRLS;
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
CREATE TABLE public.content_sections(organization_id uuid);
CREATE TABLE public.content_pages(organization_id uuid);
CREATE TABLE public.operator_job_status(job_family text, job_key text, last_status text);
CREATE TABLE public.outside_contour(secret text);
CREATE FUNCTION app.get_web_push_vapid_public_key() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT 'public-key'::text $$;
ALTER FUNCTION app.get_web_push_vapid_public_key() OWNER TO app_owner;
DO $rls$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'reminder_rules', 'platform_users', 'webapp_reminder_occurrences',
    'notification_delivery_attempts', 'product_push_notifications', 'product_analytics_hourly',
    'user_channel_preferences', 'user_notification_topic_channels', 'user_web_push_subscriptions',
    'content_sections', 'content_pages', 'operator_job_status'
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
SQL

"${psql[@]}" -v c4_web_push_reminder_login_role="$LOGIN_ROLE" \
  -f deploy/postgres/c4-web-push-reminder-runtime.sql >/dev/null

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
SQL
injected_overgrants="$("${psql[@]}" -Atc "SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='outside_contour' AND grantee IN ('$LOGIN_ROLE','app_operational_web_push_reminder','app_web_push_reminder_discovery_definer') AND privilege_type='SELECT'")"
[ "$injected_overgrants" = "3" ] || { echo "FATAL: failed to inject overgrant rehearsal" >&2; exit 1; }
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
SELECT has_table_privilege(current_user, 'public.outside_contour', 'SELECT')::int;
SELECT count(*) FROM public.operator_job_status WHERE job_family='other';
RESET ROLE;
SELECT rolcanlogin::int || ':' || rolinherit::int || ':' || rolbypassrls::int FROM pg_roles WHERE rolname='c4_webpush_smoke_login';
SELECT rolcanlogin::int || ':' || rolinherit::int || ':' || rolbypassrls::int FROM pg_roles WHERE rolname='app_operational_web_push_reminder';
SELECT rolcanlogin::int || ':' || rolinherit::int || ':' || rolbypassrls::int FROM pg_roles WHERE rolname='app_web_push_reminder_discovery_definer';
SQL
)"

expected=$'11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222\n11111111-1111-4111-8111-111111111111\n1\n1\n0\n0\n1:0:0\n0:0:0\n0:0:0'
[ "$result" = "$expected" ] || { printf 'FATAL: unexpected proof output\n%s\n' "$result" >&2; exit 1; }

"${psql[@]}" -v c4_web_push_reminder_login_role="$LOGIN_ROLE" -v c4_web_push_reminder_down=1 \
  -f deploy/postgres/c4-web-push-reminder-runtime.sql >/dev/null
cleanup_state="$("${psql[@]}" -Atc "SELECT (to_regrole('app_operational_web_push_reminder') IS NULL)::int || ':' || (to_regrole('app_web_push_reminder_discovery_definer') IS NULL)::int || ':' || (to_regrole('$LOGIN_ROLE') IS NOT NULL)::int || ':' || ((SELECT count(*) FROM pg_auth_members membership JOIN pg_roles granted ON granted.oid=membership.roleid JOIN pg_roles member ON member.oid=membership.member WHERE granted.rolname='$LOGIN_ROLE' OR member.rolname='$LOGIN_ROLE')=0)::int")"
[ "$cleanup_state" = "1:1:1:1" ] || { echo "FATAL: overlay cleanup proof failed" >&2; exit 1; }

echo "C4 Web Push reminder private PostgreSQL 16 proof: OK"
