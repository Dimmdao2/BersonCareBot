#!/usr/bin/env bash
# proof-run.sh — ПРУФ ГЕНЕРАТОРА на ОДНОРАЗОВОМ кластере PostgreSQL 16 (приёмка Ф2.3, SCHEME §B).
#
# Что делает: создаёт СВОЙ кластер (initdb во временный каталог, unix-сокет, listen_addresses=''),
# воспроизводит на нём ЖИВОЙ дефект, гоняет КРАСНЫЙ → ЗЕЛЁНЫЙ → СНОВА КРАСНЫЙ и проверяет
# собственные свойства генератора (идемпотентность, атомарность, детерминизм), затем сносит кластер.
#
# ⚠ TEST/dev/прод НЕ затрагиваются: своя порт-независимая инстанция, свой сокет, свой каталог.
#
#   bash deploy/postgres/privileges/fixtures/proof-run.sh
#
# Переменные: PGBIN (по умолчанию /usr/lib/postgresql/16/bin).

set -euo pipefail

FIXTURES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$FIXTURES_DIR/../../../.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
DECLARATION="$FIXTURES_DIR/proof-declaration.ts"
CLI="$REPO_ROOT/deploy/postgres/privileges/generate-cli.mjs"
DB=bcb_privproof

WORKDIR="$(mktemp -d /tmp/bcb-privproof-XXXXXX)"
SOCKDIR="$(mktemp -d /tmp/bcbsock-XXXXXX)"   # короткий путь: лимит unix-сокета 107 байт
PGDATA="$WORKDIR/pgdata"
LOGFILE="$WORKDIR/postgres.log"

teardown() {
  "$PGBIN/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORKDIR" "$SOCKDIR"
}
trap teardown EXIT

psql_db() { psql -h "$SOCKDIR" -U postgres -d "$DB" "$@"; }
banner() { printf '\n══════════════════════════════════════════════════════════════════════\n%s\n══════════════════════════════════════════════════════════════════════\n' "$1"; }

banner "0. ОДНОРАЗОВЫЙ КЛАСТЕР"
"$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 --locale=C >"$WORKDIR/initdb.log" 2>&1
"$PGBIN/pg_ctl" -D "$PGDATA" -l "$LOGFILE" -w start -o \
  "-k $SOCKDIR -c listen_addresses='' -c log_min_messages=warning -c log_min_error_statement=error -c log_line_prefix='%m [%p] %q%u@%d '"
psql -h "$SOCKDIR" -U postgres -d postgres -Atc "SELECT version()"
echo "каталог кластера: $PGDATA (будет удалён), сокет: $SOCKDIR, TCP выключен (listen_addresses='')"

banner "1. ВОСПРОИЗВЕДЕНИЕ ЖИВОГО ДЕФЕКТА"
psql -h "$SOCKDIR" -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$FIXTURES_DIR/proof-setup.sql"
psql -h "$SOCKDIR" -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $DB OWNER bcb_proof_migrator"
psql_db -v ON_ERROR_STOP=1 -f "$FIXTURES_DIR/proof-setup-db.sql"

banner "2. КРАСНЫЙ — ДО генератора: app_staff без принципала читает чужие коды входа"
psql_db -v ON_ERROR_STOP=0 <<'SQL'
SELECT relname, relrowsecurity AS rls, relforcerowsecurity AS force, relacl::text
  FROM pg_class WHERE relname IN ('phone_challenges','be_organization_members') ORDER BY 1;
SET ROLE app_staff;
SELECT current_user AS "роль",
       current_setting('app.org_id', true) IS NULL AS "принципал не установлен";
SELECT challenge_id, phone, code AS "ОТП открытым текстом" FROM public.phone_challenges ORDER BY 1;
SELECT count(*) AS "строк видно app_staff (phone_challenges)" FROM public.phone_challenges;
SELECT count(*) AS "чужих членств видно app_staff" FROM public.be_organization_members;
RESET ROLE;
SQL

banner "3. ГЕНЕРАЦИЯ АРТЕФАКТА (подключение к БД не требуется)"
node "$CLI" --declaration "$DECLARATION" --gaps
node "$CLI" --declaration "$DECLARATION" --db "$DB" --out-dir "$WORKDIR/gen"
echo "--- первые 20 строк артефакта ---"
head -20 "$WORKDIR/gen/privileges.$DB.sql"

banner "4. ПРИМЕНЕНИЕ — ОДНА ТРАНЗАКЦИЯ (psql -1 -v ON_ERROR_STOP=1)"
psql_db -1 -v ON_ERROR_STOP=1 -f "$WORKDIR/gen/privileges.$DB.sql" > "$WORKDIR/apply-1.out"
echo "код выхода psql: $? (0 = вся транзакция закоммичена)"
echo "статей выполнено: $(wc -l < "$WORKDIR/apply-1.out"); хвост:"
tail -5 "$WORKDIR/apply-1.out"

banner "4b. LOGIN-РЕНДЕР ИЗ ENV-МАППИНГА (§A.1) — применяется ОТДЕЛЬНО, в артефакт не входит"
node "$CLI" --declaration "$DECLARATION" --env proof --db "$DB" > "$WORKDIR/env-proof.sql"
grep -c '^ALTER ROLE .* PASSWORD ' "$WORKDIR/env-proof.sql" \
  | sed 's/^/статей PASSWORD (значение — psql-переменная, литерала в тексте нет): /'
grep '^ALTER ROLE .* PASSWORD ' "$WORKDIR/env-proof.sql"
psql_db -1 -v ON_ERROR_STOP=1 \
  -v PGPASSWORD_BCB_PROOF_MIGRATOR=dummy-not-a-real-secret \
  -v PGPASSWORD_BCB_PROOF_STAFF=dummy-not-a-real-secret \
  -f "$WORKDIR/env-proof.sql" | tail -3
echo "код выхода psql: $?"
echo "--- РЕАЛЬНОЕ соединение логином (не SET ROLE из суперпользователя) ---"
psql -h "$SOCKDIR" -U bcb_proof_staff_login -d "$DB" -v ON_ERROR_STOP=0 <<'SQL'
SELECT session_user AS "логин", current_user AS "текущая роль";
SET ROLE app_staff;
SELECT current_user AS "текущая роль после SET ROLE";
SELECT count(*) FROM public.phone_challenges;
SELECT app.public_booking_otp_issue('+79990000002') AS "штатный definer-путь";
SQL

banner "5. ЗЕЛЁНЫЙ — ПОСЛЕ генератора: ноль строк И ошибка в журнале"
psql_db -v ON_ERROR_STOP=0 <<'SQL'
SELECT relname, relrowsecurity AS rls, relforcerowsecurity AS force, relacl::text
  FROM pg_class WHERE relname IN ('phone_challenges','be_organization_members') ORDER BY 1;
SET ROLE app_staff;
SELECT current_user AS "роль",
       current_setting('app.org_id', true) IS NULL AS "принципал не установлен";
SELECT challenge_id, phone, code FROM public.phone_challenges ORDER BY 1;
SELECT count(*) AS "чужих членств видно app_staff" FROM public.be_organization_members;
SELECT app.public_booking_otp_issue('+79990000001') AS "штатный definer-путь жив";
RESET ROLE;
SQL
echo "--- журнал сервера: запись отказа ---"
grep -E "ОШИБКА|ERROR" "$LOGFILE" | tail -5

banner "6. СНОВА КРАСНЫЙ — независимые grant/owner/policy/member мутации откатываются"
psql_db -v ON_ERROR_STOP=0 <<'SQL'
BEGIN;
GRANT SELECT ON TABLE public.phone_challenges TO app_staff;
ALTER TABLE public.phone_challenges OWNER TO app_owner;
DROP POLICY be_organization_members_staff_org ON public.be_organization_members;
GRANT app_patient TO bcb_proof_staff_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
ALTER TABLE public.be_organization_members DISABLE ROW LEVEL SECURITY;
SET ROLE app_staff;
SELECT count(*) AS "снова видно (phone_challenges)" FROM public.phone_challenges;
SELECT count(*) AS "снова видно чужих членств" FROM public.be_organization_members;
RESET ROLE;
SELECT pg_get_userbyid(c.relowner) AS "подсаженный owner"
  FROM pg_class c WHERE c.oid = 'public.phone_challenges'::regclass;
SELECT EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.roleid = 'app_patient'::regrole
               AND m.member = 'bcb_proof_staff_login'::regrole) AS "подсаженный member";
ROLLBACK;
SET ROLE app_staff;
SELECT count(*) AS "после ROLLBACK — снова стена" FROM public.phone_challenges;
RESET ROLE;
SQL

banner "7. ИДЕМПОТЕНТНОСТЬ — второй прогон без ошибок, каталог побайтно тот же"
psql_db -Atf "$FIXTURES_DIR/proof-snapshot.sql" -v ON_ERROR_STOP=1 > "$WORKDIR/snap-1.txt"
test -s "$WORKDIR/snap-1.txt" || { echo "снимок каталога ПУСТ — доказательство недействительно"; exit 1; }
psql_db -1 -v ON_ERROR_STOP=1 -f "$WORKDIR/gen/privileges.$DB.sql" >/dev/null
psql_db -1 -v ON_ERROR_STOP=1 \
  -v PGPASSWORD_BCB_PROOF_MIGRATOR=dummy-not-a-real-secret \
  -v PGPASSWORD_BCB_PROOF_STAFF=dummy-not-a-real-secret \
  -f "$WORKDIR/env-proof.sql" >/dev/null
echo "код выхода второго применения: $?"
psql_db -Atf "$FIXTURES_DIR/proof-snapshot.sql" -v ON_ERROR_STOP=1 > "$WORKDIR/snap-2.txt"
if diff -u "$WORKDIR/snap-1.txt" "$WORKDIR/snap-2.txt"; then
  echo "ИДЕМПОТЕНТНО: снимок каталога (relacl/флаги/политики/proacl/nspacl/datacl/дефолты) совпал побайтно"
  echo "строк в снимке: $(wc -l < "$WORKDIR/snap-1.txt"), sha256: $(sha256sum < "$WORKDIR/snap-1.txt")"
  echo "--- снимок целиком (он же — ожидаемая сторона §F) ---"
  cat "$WORKDIR/snap-1.txt"
fi

banner "8. АТОМАРНОСТЬ — падающая статья внутри транзакции не оставляет следа"
cp "$WORKDIR/gen/privileges.$DB.sql" "$WORKDIR/atomicity-probe.sql"
cat >> "$WORKDIR/atomicity-probe.sql" <<'SQL'

-- ⚠ ПОДСАЖЕННЫЕ статьи: видимое изменение + заведомо падающая статья ПОСЛЕ него.
GRANT SELECT ON TABLE public.phone_challenges TO app_staff;
ALTER TABLE public.table_that_does_not_exist OWNER TO app_owner;
SQL
set +e
psql_db -1 -v ON_ERROR_STOP=1 -f "$WORKDIR/atomicity-probe.sql" >/dev/null 2>"$WORKDIR/atomicity-err.txt"
ATOMIC_RC=$?
set -e
echo "код выхода psql: $ATOMIC_RC (ожидается ≠ 0)"
cat "$WORKDIR/atomicity-err.txt"
psql_db -Atf "$FIXTURES_DIR/proof-snapshot.sql" -v ON_ERROR_STOP=1 > "$WORKDIR/snap-3.txt"
if diff -u "$WORKDIR/snap-2.txt" "$WORKDIR/snap-3.txt"; then
  echo "АТОМАРНО: ACL/флаги не изменились ни на байт — вся транзакция откатилась"
fi
psql_db -Atc "SELECT relacl::text FROM pg_class WHERE relname = 'phone_challenges'"

banner "9. ДЕТЕРМИНИЗМ — тот же вход ⇒ побайтно тот же выход; --check против закоммиченного"
node "$CLI" --declaration "$DECLARATION" --db "$DB" --out-dir "$WORKDIR/gen2" >/dev/null
for f in "privileges.$DB.sql" "org-allowlist.$DB.sql"; do
  cmp "$WORKDIR/gen/$f" "$WORKDIR/gen2/$f" && echo "побайтно совпало: $f ($(sha256sum < "$WORKDIR/gen/$f" | cut -c1-16)…)"
done
node "$CLI" --declaration "$DECLARATION" --db "$DB" --out-dir "$FIXTURES_DIR/generated" --check
echo "--- гейт обязан КРАСНЕТЬ на устаревшем артефакте ---"
mkdir -p "$WORKDIR/stale"
cp "$FIXTURES_DIR/generated/privileges.$DB.sql" "$FIXTURES_DIR/generated/org-allowlist.$DB.sql" "$WORKDIR/stale/"
printf 'GRANT SELECT ON TABLE public.phone_challenges TO app_staff;\n' >> "$WORKDIR/stale/privileges.$DB.sql"
set +e
node "$CLI" --declaration "$DECLARATION" --db "$DB" --out-dir "$WORKDIR/stale" --check
echo "код выхода --check на устаревшем артефакте: $? (1 = красный)"
set -e

banner "10. REVISION-10 DECLARATION — --gaps и --check зелёные"
node "$CLI" --gaps
node "$CLI" --all --out-dir "$WORKDIR/production-gen" >/dev/null
node "$CLI" --check --out-dir "$WORKDIR/production-gen"

banner "11. NOLOGIN MIGRATOR WINDOW — commit path and killed-before-commit rollback"
psql_db -v ON_ERROR_STOP=1 -c "GRANT USAGE, CREATE ON SCHEMA public TO app_proof_owner"
psql_db -v ON_ERROR_STOP=1 -c "GRANT USAGE, CREATE ON SCHEMA public TO app_proof_seam_owner"
PGHOST="$SOCKDIR" node "$REPO_ROOT/deploy/postgres/privileges/migrate-local.mjs" \
  --db "$DB" --migrator bcb_proof_window_migrator \
  --step "app_proof_owner:$FIXTURES_DIR/migration-window.sql" \
  --step "app_proof_seam_owner:$FIXTURES_DIR/migration-window-seam.sql" \
  --backfill "$FIXTURES_DIR/migration-window-backfill.sql" \
  --post "$FIXTURES_DIR/migration-window-post.sql"
psql_db -Atc "SELECT (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'public.migration_window_probe'::regclass) || ':' || value FROM public.migration_window_probe WHERE id = 1;"
psql_db -Atc "SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'public.migration_window_seam()'::regprocedure;"
set +e
PGHOST="$SOCKDIR" setsid node "$REPO_ROOT/deploy/postgres/privileges/migrate-local.mjs" \
  --db "$DB" --migrator bcb_proof_window_migrator \
  --step "app_proof_owner:$FIXTURES_DIR/migration-window-kill.sql" \
  --step "app_proof_seam_owner:$FIXTURES_DIR/migration-window-kill-seam.sql" >"$WORKDIR/migration-kill.out" 2>&1 &
KILL_PID=$!
for _ in $(seq 1 100); do
  if psql -h "$SOCKDIR" -U postgres -d "$DB" -Atc "SELECT count(*) FROM pg_stat_activity WHERE datname = '$DB' AND query LIKE '%migration_window_kill_marker%' AND wait_event_type = 'Timeout'" | grep -qx 1; then
    break
  fi
  sleep 0.05
done
psql -h "$SOCKDIR" -U postgres -d "$DB" -Atc "SELECT count(*) FROM pg_stat_activity WHERE datname = '$DB' AND query LIKE '%migration_window_kill_marker%' AND wait_event_type = 'Timeout'" | grep -qx 1
kill -TERM -- "-$KILL_PID"
wait "$KILL_PID"
KILL_RC=$?
set -e
echo "killed wrapper exit: $KILL_RC (expected non-zero)"
psql_db -Atc "SELECT to_regclass('public.migration_window_killed') IS NULL AS killed_window_rolled_back;"
psql_db -Atc "SELECT to_regprocedure('public.migration_window_killed_seam()') IS NULL AS killed_seam_rolled_back;"
psql_db -Atc "SELECT NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = 'bcb_proof_window_migrator'::regrole AND roleid IN ('app_proof_owner'::regrole, 'app_proof_seam_owner'::regrole)) AS memberships_rolled_back;"

banner "12. ACTUAL REVISION-10 ARTIFACT — bilateral verifier and faults for DEV + TEST"
verify_catalog() { PGHOST="$SOCKDIR" node "$FIXTURES_DIR/catalog-verifier.mjs" --db "$1"; }
reapply_catalog() { psql -h "$SOCKDIR" -U postgres -d "$1" -1 -v ON_ERROR_STOP=1 -f "$WORKDIR/rev10-$1/privileges.$1.sql" >/dev/null; }
expect_verifier_red() {
  local db="$1" label="$2" out="$WORKDIR/$db-$2.verifier.out"
  set +e
  PGHOST="$SOCKDIR" node "$FIXTURES_DIR/catalog-verifier.mjs" --db "$db" >"$out" 2>&1
  local rc=$?
  set -e
  test "$rc" -ne 0
  printf 'fault %s/%s: ' "$db" "$label"
  head -1 "$out"
}
proof_production_db() {
  local db="$1" env="$2"
  psql -h "$SOCKDIR" -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $db OWNER postgres"
  node "$FIXTURES_DIR/production-catalog.mjs" "$db" | psql -h "$SOCKDIR" -U postgres -d "$db" -v ON_ERROR_STOP=1
  node "$CLI" --db "$db" --out-dir "$WORKDIR/rev10-$db" >/dev/null
  reapply_catalog "$db"
  verify_catalog "$db"
  psql -h "$SOCKDIR" -U postgres -d "$db" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.be_appointments (id, organization_id, platform_user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001');
SET app.org_id = '20000000-0000-0000-0000-000000000001';
SET app.patient_id = '30000000-0000-0000-0000-000000000001';
SET ROLE app_staff;
SELECT count(*) AS staff_own_org_rows FROM public.be_appointments;
RESET ROLE;
SET ROLE app_patient;
SELECT count(*) AS patient_own_org_rows FROM public.be_appointments;
RESET ROLE;
SQL
  psql -h "$SOCKDIR" -U postgres -d "$db" -Atc "SET app.org_id='20000000-0000-0000-0000-000000000001'; SET app.patient_id='30000000-0000-0000-0000-000000000001'; SET ROLE app_staff; SELECT count(*) FROM public.be_appointments;" | tail -1 | grep -qx 1
  psql -h "$SOCKDIR" -U postgres -d "$db" -Atc "SET app.org_id='20000000-0000-0000-0000-000000000001'; SET app.patient_id='30000000-0000-0000-0000-000000000001'; SET ROLE app_patient; SELECT count(*) FROM public.be_appointments;" | tail -1 | grep -qx 1
  echo "runtime RLS/$db: staff=1 patient=1; same-subject cross-org row denied"
  psql -h "$SOCKDIR" -U postgres -d "$db" -v ON_ERROR_STOP=1 -c 'CREATE TABLE public.decl_undeclared_relation (id uuid);'
  expect_verifier_red "$db" undeclared_relation
  psql -h "$SOCKDIR" -U postgres -d "$db" -v ON_ERROR_STOP=1 -c 'DROP TABLE public.decl_undeclared_relation;'
  reapply_catalog "$db"; verify_catalog "$db"
  psql -h "$SOCKDIR" -U postgres -d "$db" -v ON_ERROR_STOP=1 -c 'CREATE POLICY decl_using_true ON public.be_appointments AS PERMISSIVE FOR SELECT TO app_staff USING (true);'
  expect_verifier_red "$db" permissive_using_true
  reapply_catalog "$db"; verify_catalog "$db"
  psql -h "$SOCKDIR" -U postgres -d "$db" -v ON_ERROR_STOP=1 -c 'CREATE FUNCTION app.decl_undeclared_definer() RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;'
  expect_verifier_red "$db" undeclared_definer
  psql -h "$SOCKDIR" -U postgres -d "$db" -v ON_ERROR_STOP=1 -c 'DROP FUNCTION app.decl_undeclared_definer();'
  reapply_catalog "$db"; verify_catalog "$db"
  psql -h "$SOCKDIR" -U postgres -d "$db" -v ON_ERROR_STOP=1 -c 'GRANT SELECT ON public.phone_challenges TO app_staff;'
  expect_verifier_red "$db" arbitrary_table_acl
  reapply_catalog "$db"; verify_catalog "$db"
  psql -h "$SOCKDIR" -U postgres -d "$db" -v ON_ERROR_STOP=1 -c 'ALTER DEFAULT PRIVILEGES FOR ROLE app_object_owner IN SCHEMA public GRANT SELECT ON TABLES TO app_staff;'
  expect_verifier_red "$db" default_acl_drift
  psql -h "$SOCKDIR" -U postgres -d "$db" -v ON_ERROR_STOP=1 -c 'ALTER DEFAULT PRIVILEGES FOR ROLE app_object_owner IN SCHEMA public REVOKE SELECT ON TABLES FROM app_staff;'
  reapply_catalog "$db"; verify_catalog "$db"
  psql -h "$SOCKDIR" -U postgres -d "$db" -v ON_ERROR_STOP=1 -c 'GRANT EXECUTE ON FUNCTION app.require_platform_principal() TO app_staff;'
  expect_verifier_red "$db" stale_execute
  reapply_catalog "$db"; verify_catalog "$db"
  psql -h "$SOCKDIR" -U postgres -d "$db" -v ON_ERROR_STOP=1 -c 'ALTER ROLE app_staff BYPASSRLS;'
  expect_verifier_red "$db" unsafe_role_attrs
  psql -h "$SOCKDIR" -U postgres -d "$db" -v ON_ERROR_STOP=1 -c 'ALTER ROLE app_staff NOBYPASSRLS;'
  reapply_catalog "$db"; verify_catalog "$db"
  psql -h "$SOCKDIR" -U postgres -d "$db" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ DECLARE p text; BEGIN
  SELECT policyname INTO p FROM pg_policies WHERE schemaname='public' AND tablename='be_appointments' AND policyname LIKE 'rev10_context_gate_%';
  EXECUTE format('DROP POLICY %I ON public.be_appointments', p);
END $$;
SQL
  expect_verifier_red "$db" missing_declared_policy
  reapply_catalog "$db"; verify_catalog "$db"
  echo "catalog faults/$db: 8/8 red before repair, 8/8 green after repair/reapply"
}
PROOF_DATABASES="${PROOF_DATABASES:-bcb_webapp_dev bersoncarebot_test}"
for proof_db in $PROOF_DATABASES; do
  case "$proof_db" in
    bcb_webapp_dev) proof_production_db bcb_webapp_dev dev ;;
    bersoncarebot_test) proof_production_db bersoncarebot_test test ;;
    *) echo "unknown PROOF_DATABASES entry: $proof_db" >&2; exit 2 ;;
  esac
done

banner "ГОТОВО — кластер удаляется"
