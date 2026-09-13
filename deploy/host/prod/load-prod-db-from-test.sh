#!/usr/bin/env bash
set -Eeuo pipefail
{ set +x; } 2>/dev/null
umask 077

# =============================================================================
# load-prod-db-from-test.sh
#
# Перенос ПРОВЕРЕННОЙ базы TEST на новый прод. Это вторая — и последняя — фаза переезда: первая
# (deploy/host/deploy-test-full-reset.sh) снимает дамп с живого старого прода и по написанному
# конвейеру приводит его к целевой схеме на TEST, здесь готовая база переносится на прод под его
# собственными именами.
#
# ЧТО ПЕРЕЕЗЖАЕТ, А ЧТО ОСТАЁТСЯ (то же разделение, что у TEST -> DEV, см.
# deploy/host/refresh-dev-from-test.sh — эта обёртка её прод-близнец и делит с ней примитивы):
#   переезжает  — принятые продуктовые данные и схема B, которая их несёт: пациенты, записи,
#                 их программы, каталоги, справочники, журнал миграций;
#   остаётся    — окружение прода: его строки system_settings по каждому environment-owned ключу,
#                 его собственный ключ подписи principal-контекста (app.context_signing_secrets),
#                 его env-файлы, его пароли ролей, его владелец/ACL из декларации. Роли, ACL и
#                 владельцы TEST не копируются никогда (`--no-owner --no-acl` и на дампе, и на
#                 восстановлении), а активный TEST-триггер блокировки настроек снимается на въезде.
#
# ПЕРЕИМЕНОВАНИЕ. Имена базы и логинов прода уже переименованы (deploy/host/prod/
# rename-database-to-therapysto.sh, 10.09.2026) и здесь НЕ трогаются. Дамп TEST приезжает без ролей
# и без ACL, поэтому имён bcb_test_* он не несёт вовсе, а владельцев и права раскладывает декларация
# под прод-именами — то есть «правильно переименовалась база» здесь выполняется тем, что имена TEST
# в прод не попадают ни одной строкой, а не тем, что их кто-то переписывает по дороге.
#
# СТАРЫЙ ПРОД ЭТОТ СКРИПТ НЕ ВИДИТ ВООБЩЕ. Он выполняется только на новом проде и отказывается на
# хосте старого; единственное действие над старым продом за весь переезд — чтение дампа, и оно
# происходит на другом хосте, в первой фазе.
#
# Обёртка не изобретает ни второго генератора прав, ни второго прогонщика миграций, ни второго
# списка секретных ключей — она соединяет уже существующие примитивы:
#   deploy/host/prod/runtime-database.sh             единственный ответ «в какую базу ходит рантайм»
#   deploy/host/dev-owned-settings-policy.mjs        какие ключи настроек принадлежат ОКРУЖЕНИЮ
#                                                    (вопрос один и тот же для DEV и для прода)
#   deploy/postgres/dev-refresh-{capture,restore}-*  снятие и возврат состояния окружения
#   deploy/host/prod/migrate-prod.sh                 канонический шлюз схемы и прав прода
#
#   sudo bash deploy/host/prod/load-prod-db-from-test.sh --check --dump /путь/test.dump
#   sudo bash deploy/host/prod/load-prod-db-from-test.sh --execute --dump /путь/test.dump \
#        --confirm-load-prod-db-from-test
#   sudo bash deploy/host/prod/load-prod-db-from-test.sh --rollback /путь/prod-before.dump \
#        --confirm-load-prod-db-from-test
# =============================================================================

PROD_HOST_IP="135.106.187.95"
OLD_PROD_HOST_IP="135.106.162.170"
ADMIN_SOCKET="/var/run/postgresql"
ADMIN_PORT="5432"
OBJECT_OWNER_ROLE="app_object_owner"
CONFIRM_FLAG="--confirm-load-prod-db-from-test"
SRC="/opt/therapysto/src"
STATE_DIR="/opt/therapysto/state"
HOST_LOCK="/run/lock/therapysto-prod-db.lock"
HOST_LOCK_FD=9

SETTINGS_POLICY="$SRC/deploy/host/dev-owned-settings-policy.mjs"
CAPTURE_SQL="$SRC/deploy/postgres/dev-refresh-capture-dev-owned-state.sql"
RESTORE_SQL="$SRC/deploy/postgres/dev-refresh-restore-dev-owned-state.sql"
MIGRATE_PROD="$SRC/deploy/host/prod/migrate-prod.sh"
RUNTIME_DATABASE="$SRC/deploy/host/prod/runtime-database.sh"

MODE=""
CONFIRMED=0
SOURCE_DUMP=""
ROLLBACK_DUMP=""
WORK_DIR=""
KEYS_DIR=""
STOPPED_CONTAINERS=""
DESTRUCTIVE_PHASE_STARTED=0
LOAD_COMPLETE=0
TARGET_CONNECTION_LIMIT=""

usage() {
  cat <<'EOF'
Usage: sudo bash deploy/host/prod/load-prod-db-from-test.sh --check --dump <archive>
       sudo bash deploy/host/prod/load-prod-db-from-test.sh --execute --dump <archive> \
            --confirm-load-prod-db-from-test
       sudo bash deploy/host/prod/load-prod-db-from-test.sh --rollback <archive> \
            --confirm-load-prod-db-from-test

--check     Доказывает готовность хоста, архива, базы и рантайма. Не меняет ничего: ни дампа, ни
            остановки контейнеров, ни одной записи в базу.
--execute   Разрушающая. Заменяет базу прода принятым состоянием TEST, возвращает состояние
            ОКРУЖЕНИЯ прода и проходит канонический шлюз migrate-prod.sh прежде, чем скажет PASS.
            Цель закрыта для подключений от пересоздания до этой единственной границы успеха.
--rollback  Разрушающая. Возвращает базу прода из снимка, снятого этим же скриптом перед переносом.
EOF
}

fatal() {
  printf 'FATAL: load-prod-db-from-test: %s\n' "$1" >&2
  exit 1
}

note() {
  printf 'load-prod-db-from-test: %s\n' "$1"
}

as_postgres() {
  runuser -u postgres -- "$@"
}

postgres_scalar() {
  local database="$1"
  runuser -u postgres -- psql -X -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" -d "$database" \
    -v ON_ERROR_STOP=1 -Atqc "$2"
}

assert_canonical_file() {
  local path="$1" label="$2"
  [[ ! -L "$path" && -f "$path" && "$(realpath "$path")" == "$path" ]] ||
    fatal "$label path guard failed: $path"
}

close_target() {
  runuser -u postgres -- psql -X -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" -d postgres \
    -v ON_ERROR_STOP=1 -c \
    "ALTER DATABASE \"$DB\" CONNECTION LIMIT 0;
     SELECT pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity
      WHERE datname = '$DB' AND pid <> pg_backend_pid();" >/dev/null 2>&1
}

cleanup_exit() {
  local original_status=$?
  trap - EXIT
  trap '' INT TERM HUP
  [[ -z "$KEYS_DIR" ]] || rm -rf -- "$KEYS_DIR"
  if [[ "$DESTRUCTIVE_PHASE_STARTED" == 1 && "$LOAD_COMPLETE" != 1 ]]; then
    # Разрушающая фаза началась и не закончилась. Цель остаётся fail-closed на CONNECTION LIMIT 0, а
    # снимок «до» НАМЕРЕННО не удаляется: это единственный путь назад. Назвать его и команду.
    close_target ||
      printf 'FATAL: load-prod-db-from-test: не удалось оставить %s на CONNECTION LIMIT 0\n' "$DB" >&2
    printf 'load-prod-db-from-test: ПРОД НЕ РАБОТАЕТ. Возврат:\n' >&2
    printf '  sudo bash %s --rollback %s %s\n' \
      "$SRC/deploy/host/prod/load-prod-db-from-test.sh" \
      "${WORK_DIR:-<каталог снимка не создан>}/prod-before.dump" "$CONFIRM_FLAG" >&2
    [[ -z "$STOPPED_CONTAINERS" ]] ||
      printf 'load-prod-db-from-test: контейнеры остановлены и НЕ подняты: %s\n' \
        "$STOPPED_CONTAINERS" >&2
    [[ "$original_status" -ne 0 ]] || original_status=70
  fi
  exit "$original_status"
}

# ---------------------------------------------------------------------------
# Разбор аргументов. Имя базы аргументом не задаётся вовсе: оно выводится из env-файлов рантайма
# единственным примитивом, поэтому ни один вызов не может направить перенос в другую базу.
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check|--execute)
      [[ -z "$MODE" ]] || { usage >&2; exit 2; }
      MODE="${1#--}"
      shift
      ;;
    --rollback)
      [[ -z "$MODE" ]] || { usage >&2; exit 2; }
      [[ $# -ge 2 && -n "${2:-}" && "${2:0:2}" != "--" ]] || { usage >&2; exit 2; }
      MODE=rollback
      ROLLBACK_DUMP="$2"
      shift 2
      ;;
    --dump)
      [[ $# -ge 2 && -n "${2:-}" && "${2:0:2}" != "--" ]] || { usage >&2; exit 2; }
      SOURCE_DUMP="$2"
      shift 2
      ;;
    "$CONFIRM_FLAG")
      CONFIRMED=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

[[ -n "$MODE" ]] || { usage >&2; exit 2; }
if [[ "$MODE" == check && "$CONFIRMED" == 1 ]]; then
  fatal "$CONFIRM_FLAG — подтверждение разрушающего действия, --check его не принимает"
fi
if [[ "$MODE" != check && "$CONFIRMED" != 1 ]]; then
  fatal "разрушающий режим $MODE требует $CONFIRM_FLAG"
fi

# ---------------------------------------------------------------------------
# Гейты личности. Все они выполняются и в --check, и ни один ничего не пишет.
# ---------------------------------------------------------------------------
[[ "$(id -u)" == 0 ]] || fatal 'нужен root (через sudo)'

for command in awk docker dropdb flock hostname node pg_dump pg_restore psql realpath runuser wc; do
  command -v "$command" >/dev/null 2>&1 || fatal "нет обязательной команды: $command"
done

if hostname -I | tr ' ' '\n' | grep -Fxq "$OLD_PROD_HOST_IP"; then
  fatal "это СТАРЫЙ прод $OLD_PROD_HOST_IP — здесь не выполняется ничего"
fi
hostname -I | tr ' ' '\n' | grep -Fxq "$PROD_HOST_IP" ||
  fatal "только для нового прода $PROD_HOST_IP"

[[ -d "$SRC/.git" ]] || fatal "нет рабочего дерева $SRC"
assert_canonical_file "$SETTINGS_POLICY" 'политика environment-owned настроек'
assert_canonical_file "$CAPTURE_SQL" 'снятие состояния окружения'
assert_canonical_file "$RESTORE_SQL" 'возврат состояния окружения'
assert_canonical_file "$MIGRATE_PROD" 'канонический шлюз схемы прода'
assert_canonical_file "$RUNTIME_DATABASE" 'разрешение имени базы рантайма'
[[ -d "$ADMIN_SOCKET" && ! -L "$ADMIN_SOCKET" ]] || fatal 'гейт локального сокета PostgreSQL не прошёл'
[[ -d "$STATE_DIR" && ! -L "$STATE_DIR" ]] || fatal "нет каталога состояния $STATE_DIR"

# shellcheck source=deploy/host/prod/runtime-database.sh
. "$RUNTIME_DATABASE"
DB=$(runtime_database) || exit 1
ENV_NAME=$(runtime_environment "$DB") || exit 1
MIGRATOR_ROLE=$(runtime_migrator "$ENV_NAME") || exit 1
[[ "$ENV_NAME" == prod ]] ||
  fatal "рантайм этого хоста ходит в базу окружения «$ENV_NAME»; перенос на прод отказывается"

eval "exec ${HOST_LOCK_FD}>\"\$HOST_LOCK\""
flock -n "$HOST_LOCK_FD" || fatal 'другой обработчик базы прода уже выполняется'

local_connection="$(postgres_scalar postgres 'SELECT (inet_server_addr() IS NULL)::text;')" ||
  fatal 'локальная админ-проба PostgreSQL не прошла'
[[ "$local_connection" == true ]] || fatal 'админ-канал — не локальный unix-сокет'

target_identity="$(postgres_scalar postgres \
  "SELECT datname || '|' || pg_catalog.pg_get_userbyid(datdba) || '|' || datallowconn::text
     FROM pg_catalog.pg_database WHERE datname = '$DB';")" || fatal 'проба личности базы не прошла'
[[ "$target_identity" == "$DB|postgres|true" ]] ||
  fatal "цель должна быть базой $DB, принадлежащей postgres"

owner_state="$(postgres_scalar "$DB" \
  "SELECT rolcanlogin::text || '|' || rolbypassrls::text || '|' || rolinherit::text
     FROM pg_catalog.pg_roles WHERE rolname = '$OBJECT_OWNER_ROLE';")" ||
  fatal 'не читается владелец объектов'
[[ "$owner_state" == "false|false|false" ]] ||
  fatal "$OBJECT_OWNER_ROLE обязан оставаться NOLOGIN/NOBYPASSRLS/NOINHERIT владельцем"

migrator_state="$(postgres_scalar "$DB" \
  "SELECT rolcanlogin::text || '|' || rolbypassrls::text || '|' || rolinherit::text
     FROM pg_catalog.pg_authid AS role WHERE rolname = '$MIGRATOR_ROLE';")" ||
  fatal 'не читается мигратор прода'
[[ "$migrator_state" == "false|false|false" ]] ||
  fatal "$MIGRATOR_ROLE обязан оставаться NOLOGIN/NOBYPASSRLS/NOINHERIT"

verify_custom_archive() {
  local archive="$1" label="$2"
  [[ "$archive" = /* ]] || fatal "$label: путь обязан быть абсолютным"
  [[ ! -L "$archive" ]] || fatal "$label не должен быть симлинком"
  [[ -f "$archive" ]] || fatal "$label не найден: $archive"
  as_postgres test -r "$archive" || fatal "$label не читается пользователем postgres: $archive"
  as_postgres pg_restore --list "$archive" >/dev/null ||
    fatal "$label — не читаемый архив PostgreSQL в custom-формате"
  [[ "$(head -c5 -- "$archive")" == PGDMP ]] || fatal "$label не несёт магию custom-архива"
}

assert_archive_carries_product_data() {
  # Пустой или чужой архив не должен доезжать до разрушающей фазы. Проверяются ровно те отношения,
  # ради которых делается переезд: люди, их записи и их программы. Оглавление читается ОДИН раз в
  # файл, а не по конвейеру на каждое отношение: `grep -q` закрывает конвейер на первом совпадении,
  # pg_restore получает SIGPIPE, и под `pipefail` успешная проверка выглядела бы провалом.
  local archive="$1" relation missing="" toc
  toc="$KEYS_DIR/archive-toc.txt"
  as_postgres pg_restore --list "$archive" >"$toc" ||
    fatal 'не читается оглавление архива TEST'
  for relation in platform_users be_appointments treatment_program_instances; do
    grep -Eq "TABLE DATA public $relation( |\$)" "$toc" || missing="$missing $relation"
  done
  [[ -z "$missing" ]] ||
    fatal "в архиве TEST нет данных отношений:$missing — это не проверенная база TEST"
}

assert_target_closed() {
  local phase="$1" limit
  limit="$(postgres_scalar postgres \
    "SELECT datconnlimit::text FROM pg_catalog.pg_database WHERE datname = '$DB';")" ||
    fatal "не читается лимит подключений $phase"
  [[ "$limit" == 0 ]] ||
    fatal "$DB открыта для подключений $phase (лимит $limit); разрушающая фаза обязана иметь ровно \
одного писателя. Прод НЕ работает; возвращайтесь из снимка, названного ниже."
}

capture_target_connection_limit() {
  TARGET_CONNECTION_LIMIT="$(postgres_scalar postgres \
    "SELECT datconnlimit::text FROM pg_catalog.pg_database WHERE datname = '$DB';")" ||
    fatal 'не читается лимит подключений базы'
  [[ "$TARGET_CONNECTION_LIMIT" =~ ^-?[0-9]+$ ]] || fatal 'проба лимита подключений непригодна'
  [[ "$TARGET_CONNECTION_LIMIT" != 0 ]] ||
    fatal "$DB уже стоит fail-closed на CONNECTION LIMIT 0 — сначала завершите прошлое восстановление"
}

reopen_target() {
  runuser -u postgres -- psql -X -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" -d postgres \
    -v ON_ERROR_STOP=1 -c "ALTER DATABASE \"$DB\" CONNECTION LIMIT ${TARGET_CONNECTION_LIMIT};" \
    >/dev/null || fatal 'не удалось вернуть лимит подключений'
}

app_containers() {
  docker ps --format '{{.Names}}' | grep -E '^therapysto-(blue|green)-' || true
}

stop_runtime() {
  # Контейнеры останавливаются не ради безопасности — её держит CONNECTION LIMIT 0, — а чтобы прод не
  # провёл перенос в цикле перезапусков и поднялся на новой базе одним чистым стартом.
  STOPPED_CONTAINERS="$(app_containers | tr '\n' ' ')"
  [[ -n "${STOPPED_CONTAINERS// /}" ]] || { note 'рантайм прода уже остановлен'; return 0; }
  note "останавливаю рантайм: $STOPPED_CONTAINERS"
  # shellcheck disable=SC2086
  docker stop $STOPPED_CONTAINERS >/dev/null || fatal 'не удалось остановить рантайм прода'
}

start_runtime() {
  [[ -n "${STOPPED_CONTAINERS// /}" ]] || return 0
  note "поднимаю рантайм: $STOPPED_CONTAINERS"
  # shellcheck disable=SC2086
  docker start $STOPPED_CONTAINERS >/dev/null || fatal 'не удалось поднять рантайм прода'
  local container status deadline
  for container in $STOPPED_CONTAINERS; do
    docker inspect -f '{{if .State.Health}}has{{end}}' "$container" 2>/dev/null | grep -q has ||
      continue
    deadline=$((SECONDS + 300))
    while :; do
      status="$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || echo unknown)"
      [[ "$status" != healthy ]] || break
      [[ "$SECONDS" -lt "$deadline" ]] ||
        fatal "$container не стал healthy за 300 с (состояние: $status)"
      sleep 5
    done
    note "   $container healthy"
  done
  STOPPED_CONTAINERS=""
}

restore_target_from_archive() {
  # Общее разрушающее тело для переноса и для отката. Вызывающий уже выставил
  # DESTRUCTIVE_PHASE_STARTED и остановил рантайм.
  local archive="$1"
  shift
  runuser -u postgres -- psql -X -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" -d postgres \
    -v ON_ERROR_STOP=1 -c \
    "ALTER DATABASE \"$DB\" CONNECTION LIMIT 0;
     SELECT pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity
      WHERE datname = '$DB' AND pid <> pg_backend_pid();" >/dev/null ||
    fatal 'не удалось закрыть базу прода перед восстановлением'
  as_postgres dropdb -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" --if-exists "$DB" ||
    fatal 'не удалось удалить базу прода'
  # Один оператор создаёт базу УЖЕ закрытой: createdb не умеет выразить лимит подключений, и пара
  # createdb + ALTER DATABASE всегда оставляла окно, в котором существует подключаемая база прода —
  # ровно там, где ещё идут восстановление, возврат состояния окружения и шлюз миграций.
  runuser -u postgres -- psql -X -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" -d postgres \
    -v ON_ERROR_STOP=1 -c \
    "CREATE DATABASE \"$DB\" OWNER postgres TEMPLATE template0 CONNECTION LIMIT 0;" >/dev/null ||
    fatal 'не удалось пересоздать базу прода закрытой для подключений'
  assert_target_closed 'сразу после пересоздания'
  runuser -u postgres -- psql -X -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" -d "$DB" \
    -v ON_ERROR_STOP=1 >/dev/null <<'SQL' || fatal 'не удалось поставить базовые расширения'
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SQL
  # pgcrypto принадлежит схеме app_ext в схеме B, но ставится до pg_restore, чтобы объекты на его
  # основе были доступны во время чтения архива. Сначала pre-data (архив создаёт app_ext), затем
  # перенос расширения, и только потом data/post-data: post-data уже называет app_ext.digest/armor.
  as_postgres pg_restore --exit-on-error --no-comments --section=pre-data \
    --role=postgres --dbname="$DB" "$@" "$archive" || fatal 'восстановление pre-data не прошло'
  runuser -u postgres -- psql -X -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" -d "$DB" \
    -v ON_ERROR_STOP=1 -c 'ALTER EXTENSION pgcrypto SET SCHEMA app_ext;' >/dev/null ||
    fatal 'не удалось перенести pgcrypto в каноническую схему app_ext'
  as_postgres pg_restore --exit-on-error --no-comments --section=data \
    --role=postgres --dbname="$DB" "$@" "$archive" || fatal 'восстановление data не прошло'
  as_postgres pg_restore --exit-on-error --no-comments --section=post-data \
    --role=postgres --dbname="$DB" "$@" "$archive" || fatal 'восстановление post-data не прошло'
}

run_migration_gate() {
  # migrate-prod.sh И ЕСТЬ шлюз текущей схемы: кластерный базис ролей, засев реестра стены рождения
  # отношений, миграции вебаппа и интегратора поверх приехавшего журнала, и одна сверка прав
  # декларацией с её аудитом каталога. Он вызывается, а не копируется и не печатается инструкцией
  # после PASS: перенос, не дошедший до текущей схемы и прав, не имеет права отчитаться успехом.
  bash "$MIGRATE_PROD" || fatal 'канонический шлюз схемы прода не прошёл; база остаётся закрытой'
}

report_product_counts() {
  local counts
  counts="$(postgres_scalar "$DB" \
    "SELECT (SELECT count(*) FROM public.platform_users) || ' пользователей, ' ||
            (SELECT count(*) FROM public.be_appointments) || ' записей (' ||
            (SELECT count(*) FROM public.be_appointments WHERE start_at >= now()) ||
            ' будущих), ' ||
            (SELECT count(*) FROM public.treatment_program_instances) || ' программ, ' ||
            (SELECT count(*) FROM drizzle.__drizzle_migrations) || ' миграций';")" ||
    fatal 'не удалось пересчитать приехавшие данные'
  note "приехало: $counts"
}

# ---------------------------------------------------------------------------
# --check заканчивается здесь. Ничего выше не писало ни в базу, ни в файл.
# ---------------------------------------------------------------------------
trap cleanup_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

KEYS_DIR="$(mktemp -d /tmp/therapysto-prod-load-keys.XXXXXX)" || fatal 'нет каталога для списков ключей'
chmod 755 "$KEYS_DIR"
ENV_OWNED_KEY_FILE="$KEYS_DIR/environment-owned-keys.txt"
REGISTRY_KEY_FILE="$KEYS_DIR/registry-keys.txt"
# Политика environment-owned ключей выводится из реестра S5-0 и из оверлея окружения TEST — вопрос
# «какие ключи принадлежат окружению, а не продукту» один и тот же для DEV и для прода, поэтому
# здесь читается тот же модуль, а не его прод-копия, которая разошлась бы при первой же правке.
node "$SETTINGS_POLICY" --dev-owned-keys >"$ENV_OWNED_KEY_FILE" ||
  fatal 'политика environment-owned настроек не вывелась из реестра и оверлея TEST'
node "$SETTINGS_POLICY" --registry-keys >"$REGISTRY_KEY_FILE" ||
  fatal 'список ключей реестра настроек не вывелся'
chmod 644 "$ENV_OWNED_KEY_FILE" "$REGISTRY_KEY_FILE"
[[ -s "$ENV_OWNED_KEY_FILE" && -s "$REGISTRY_KEY_FILE" ]] ||
  fatal 'политика environment-owned настроек дала пустой список ключей'

if [[ "$MODE" != rollback ]]; then
  [[ -n "$SOURCE_DUMP" ]] || fatal "нужен --dump <архив> с проверенной базой TEST"
  verify_custom_archive "$SOURCE_DUMP" 'архив TEST'
  assert_archive_carries_product_data "$SOURCE_DUMP"
fi

if [[ "$MODE" == check ]]; then
  capture_target_connection_limit
  note "check: PASS (хост=$PROD_HOST_IP база=$DB окружение=$ENV_NAME мигратор=$MIGRATOR_ROLE \
архив=${SOURCE_DUMP} environment_owned_keys=$(wc -l <"$ENV_OWNED_KEY_FILE") \
registry_keys=$(wc -l <"$REGISTRY_KEY_FILE") лимит_подключений=$TARGET_CONNECTION_LIMIT; \
ничего не изменено)"
  note "check: запускайте перенос как --execute --dump $SOURCE_DUMP $CONFIRM_FLAG"
  exit 0
fi

# ---------------------------------------------------------------------------
# --rollback: вернуть базу прода из снимка, снятого этим скриптом.
# ---------------------------------------------------------------------------
if [[ "$MODE" == rollback ]]; then
  verify_custom_archive "$ROLLBACK_DUMP" 'снимок для отката'
  TARGET_CONNECTION_LIMIT="$(postgres_scalar postgres \
    "SELECT datconnlimit::text FROM pg_catalog.pg_database WHERE datname = '$DB';")" ||
    fatal 'не читается лимит подключений базы'
  [[ "$TARGET_CONNECTION_LIMIT" =~ ^-?[0-9]+$ ]] || fatal 'проба лимита подключений непригодна'
  [[ "$TARGET_CONNECTION_LIMIT" != 0 ]] || TARGET_CONNECTION_LIMIT=-1

  note 'rollback: возвращаю базу прода из снимка'
  DESTRUCTIVE_PHASE_STARTED=1
  stop_runtime
  restore_target_from_archive "$ROLLBACK_DUMP" --no-owner --no-acl
  note 'rollback: шлюз схемы и сверка прав'
  run_migration_gate
  assert_target_closed 'после сверки прав отката'
  reopen_target
  start_runtime
  LOAD_COMPLETE=1
  report_product_counts
  note "rollback: PASS ($DB восстановлена из снимка; права разложены декларацией; \
лимит подключений $TARGET_CONNECTION_LIMIT). Файл снимка оставлен на месте."
  exit 0
fi

# ---------------------------------------------------------------------------
# --execute
# ---------------------------------------------------------------------------
capture_target_connection_limit

WORK_DIR="$STATE_DIR/load-prod-db-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 -o postgres -g postgres "$WORK_DIR" || fatal 'не создаётся рабочий каталог'
PROD_SNAPSHOT="$WORK_DIR/prod-before.dump"
PROD_SETTINGS="$WORK_DIR/prod-owned-settings.tsv"
PROD_SIGNING_SECRET="$WORK_DIR/prod-signing-secret.tsv"
PROD_HAS_SIGNING_SECRET="$WORK_DIR/prod-has-signing-secret.txt"
PROD_ABSENT_ORG="$WORK_DIR/prod-absent-organization-count.txt"

note 'execute: снимаю состояние ОКРУЖЕНИЯ прода'
runuser -u postgres -- psql -X -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" -d "$DB" \
  -v ON_ERROR_STOP=1 \
  -v target_database="$DB" \
  -v dev_owned_key_file="$ENV_OWNED_KEY_FILE" \
  -v registry_key_file="$REGISTRY_KEY_FILE" \
  -v settings_out="$PROD_SETTINGS" \
  -v signing_secret_out="$PROD_SIGNING_SECRET" \
  -v has_signing_secret_out="$PROD_HAS_SIGNING_SECRET" \
  <"$CAPTURE_SQL" >/dev/null || fatal 'снятие состояния окружения прода не прошло'
for captured in "$PROD_SETTINGS" "$PROD_SIGNING_SECRET" "$PROD_HAS_SIGNING_SECRET"; do
  as_postgres test -f "$captured" || fatal 'снятие не создало своих файлов'
  as_postgres chmod 600 "$captured" || fatal 'не закрывается снятое состояние окружения'
done
PROD_OWNED_ROWS="$(as_postgres wc -l -- "$PROD_SETTINGS" | awk '{print $1}')" ||
  fatal 'не считается число снятых строк окружения'
[[ "$PROD_OWNED_ROWS" =~ ^[0-9]+$ && "$PROD_OWNED_ROWS" -gt 0 ]] ||
  fatal 'у прода нет ни одной environment-owned строки настроек; на пустом снятии перенос отказывается \
отдавать проду состояние окружения TEST'
PROD_HAD_SIGNING_SECRET="$(as_postgres cat "$PROD_HAS_SIGNING_SECRET")" ||
  fatal 'не читается маркер наличия ключа подписи'
[[ "$PROD_HAD_SIGNING_SECRET" == true || "$PROD_HAD_SIGNING_SECRET" == false ]] ||
  fatal 'маркер наличия ключа подписи непригоден'

note 'execute: снимок базы прода ДО переноса'
as_postgres pg_dump -Fc -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" -d "$DB" -f "$PROD_SNAPSHOT" ||
  fatal 'снимок базы прода до переноса не снялся'
verify_custom_archive "$PROD_SNAPSHOT" 'снимок базы прода до переноса'
note "execute: снимок сохранён — $PROD_SNAPSHOT"

note 'execute: заменяю базу прода (разрушающая фаза началась)'
DESTRUCTIVE_PHASE_STARTED=1
stop_runtime
restore_target_from_archive "$SOURCE_DUMP" --no-owner --no-acl

note 'execute: возвращаю состояние ОКРУЖЕНИЯ прода'
runuser -u postgres -- psql -X -h "$ADMIN_SOCKET" -p "$ADMIN_PORT" -d "$DB" \
  -v ON_ERROR_STOP=1 \
  -v target_database="$DB" \
  -v dev_owned_key_file="$ENV_OWNED_KEY_FILE" \
  -v registry_key_file="$REGISTRY_KEY_FILE" \
  -v settings_in="$PROD_SETTINGS" \
  -v signing_secret_in="$PROD_SIGNING_SECRET" \
  -v dev_had_signing_secret="$PROD_HAD_SIGNING_SECRET" \
  -v absent_org_out="$PROD_ABSENT_ORG" \
  <"$RESTORE_SQL" >/dev/null || fatal 'возврат состояния окружения прода не прошёл'

PROD_ABSENT_ORG_ROWS="$(as_postgres cat "$PROD_ABSENT_ORG")" ||
  fatal 'не читается число не возвращённых строк с отсутствующей организацией'
[[ "$PROD_ABSENT_ORG_ROWS" =~ ^[0-9]+$ ]] || fatal 'это число непригодно'
[[ "$PROD_ABSENT_ORG_ROWS" -le "$PROD_OWNED_ROWS" ]] ||
  fatal 'возврат сообщил больше отброшенных строк, чем было снято'
if [[ "$PROD_ABSENT_ORG_ROWS" -gt 0 ]]; then
  note "execute: $PROD_ABSENT_ORG_ROWS environment-owned строк(и) настроек по организации НЕ \
возвращены: такой организации нет в приехавших данных, поэтому строка не может принадлежать новому \
графу данных прода. Все глобальные строки и строки существующих организаций возвращены."
fi
assert_target_closed 'после возврата состояния окружения'

test_lock_present="$(postgres_scalar "$DB" \
  "SELECT EXISTS (
     SELECT 1
       FROM pg_catalog.pg_trigger AS trigger
       JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger.tgrelid
       JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'system_settings'
        AND trigger.tgname = 'system_settings_test_lock'
        AND NOT trigger.tgisinternal
   )::text;")" || fatal 'не проверяется отсутствие TEST-блокировки настроек'
[[ "$test_lock_present" == false ]] || fatal 'TEST-блокировка настроек доехала до прода'

note 'execute: канонический шлюз — схема, миграции, сверка прав декларацией'
run_migration_gate
assert_target_closed 'после канонического шлюза'

# Единственная граница успеха: всё выше выполнялось против базы, до которой не мог дотянуться ни один
# процесс приложения.
reopen_target
start_runtime
LOAD_COMPLETE=1
report_product_counts
note "execute: PASS (архив=$SOURCE_DUMP база=$DB \
environment_owned_settings_preserved=$PROD_OWNED_ROWS \
environment_owned_settings_dropped_absent_org=$PROD_ABSENT_ORG_ROWS \
signing_secret_repinned=$PROD_HAD_SIGNING_SECRET \
лимит_подключений=$TARGET_CONNECTION_LIMIT; роли/ACL/владельцы TEST не копировались; \
схема и права разложены декларацией). Снимок до переноса: $PROD_SNAPSHOT"
