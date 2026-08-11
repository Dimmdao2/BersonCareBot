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
PGHOST="$SOCKDIR" node "$REPO_ROOT/deploy/postgres/privileges/migrate-local.mjs" \
  --db "$DB" --migrator bcb_proof_window_migrator --owner app_proof_owner \
  --migration "$FIXTURES_DIR/migration-window.sql" \
  --backfill "$FIXTURES_DIR/migration-window-backfill.sql" \
  --post "$FIXTURES_DIR/migration-window-post.sql"
psql_db -Atc "SELECT (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'public.migration_window_probe'::regclass) || ':' || value FROM public.migration_window_probe WHERE id = 1;"
set +e
PGHOST="$SOCKDIR" setsid node "$REPO_ROOT/deploy/postgres/privileges/migrate-local.mjs" \
  --db "$DB" --migrator bcb_proof_window_migrator --owner app_proof_owner \
  --migration "$FIXTURES_DIR/migration-window-kill.sql" >"$WORKDIR/migration-kill.out" 2>&1 &
KILL_PID=$!
sleep 1
kill -TERM -- "-$KILL_PID"
wait "$KILL_PID"
KILL_RC=$?
set -e
echo "killed wrapper exit: $KILL_RC (expected non-zero)"
psql_db -Atc "SELECT to_regclass('public.migration_window_killed') IS NULL AS killed_window_rolled_back;"
psql_db -Atc "SELECT NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = 'bcb_proof_window_migrator'::regrole AND roleid = 'app_proof_owner'::regrole) AS membership_rolled_back;"

banner "ГОТОВО — кластер удаляется"
