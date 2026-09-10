#!/usr/bin/env bash
# Догоняет схему прода до выложенного коммита: миграции + сверка прав декларацией.
#
# Почему этот файл вообще появился. У прода не было шага миграций НИ ОДНОГО — `therapysto-deploy`
# собирает образ, ждёт здоровья и переключает nginx, но базу не трогает. Пока прод жил на копии
# схемы TEST, это не проявлялось. Первая же выкладка коммита с новой миграцией даёт рантайм, который
# обращается к таблицам, которых в базе нет: 10.09.2026 на этом упала сверка прав
# (`saas_storage_package_period_prices does not exist`), и это была удача — упади вместо неё
# приложение, отказ пришёл бы позже и от лица пользователя.
#
# Порядок ровно тот же, что на TEST и DEV, и он не произвольный:
#   1. реестр стены рождения отношений — событийный триггер сверяется с ним ПОКА идёт CREATE TABLE,
#      поэтому реестр обязан быть засеян до первой миграции;
#   2. миграции вебаппа в порядке владельца — одна транзакция на миграцию, временное членство
#      владельца выдаётся и снимается внутри неё;
#   3. миграции интегратора — репозиторий держит их отдельным набором с собственным порядком;
#   4. сверка прав декларацией — она описывает права на таблицы ЭТОГО коммита, поэтому идёт после
#      миграций, а не до;
#   5. описатели порт-контекста в env — их читает рантайм при старте.
#
#   sudo bash deploy/host/prod/migrate-prod.sh
set -uo pipefail

SRC=/opt/therapysto/src
ENV_DIR=/opt/therapysto/env

die() { echo "FATAL: migrate-prod: $*" >&2; exit 1; }
say() { printf '\033[1m==>\033[0m %s\n' "$*"; }

[ "$(id -u)" = 0 ] || die "нужен root"
case " $(hostname -I) " in
  *" 135.106.162.170 "*) die "это СТАРЫЙ прод — здесь ничего не трогаем" ;;
esac
case " $(hostname -I) " in
  *" 135.106.187.95 "*) : ;;
  *) die "этот скрипт только для нового прода 135.106.187.95" ;;
esac
[ -d "$SRC/.git" ] || die "нет рабочего дерева $SRC"

# shellcheck source=deploy/host/prod/runtime-database.sh
. "$(dirname "$0")/runtime-database.sh"
DB=$(runtime_database) || exit 1
ENV_NAME=$(runtime_environment "$DB") || exit 1
MIGRATOR=$(runtime_migrator "$ENV_NAME") || exit 1
say "база $DB, окружение $ENV_NAME, мигратор $MIGRATOR"

cd "$SRC"
GEN=deploy/postgres/privileges/generate-cli.mjs
OWNER_MIGRATOR=deploy/postgres/privileges/migrate-local.mjs
INTEGRATOR_MIGRATOR=deploy/postgres/privileges/migrate-integrator-local.mjs
DRIZZLE=$SRC/apps/webapp/db/drizzle-migrations
[ -d "$DRIZZLE" ] && [ ! -L "$DRIZZLE" ] || die "нет каталога миграций $DRIZZLE"

# Кластерные роли могут пополниться декларацией между выкладками, а миграция вправе назначить
# владельца из них. Базис идемпотентен, поэтому стоит здесь безусловно.
say "1/5 кластерные роли"
node --experimental-strip-types "$GEN" --shared-role-baseline --db "$DB" |
  runuser -u postgres -- psql -X -1 -h /var/run/postgresql -p 5432 -d postgres -v ON_ERROR_STOP=1 >/dev/null ||
  die "кластерный базис не разложился"
node --experimental-strip-types "$GEN" --shared-role-verify --db "$DB" |
  runuser -u postgres -- psql -X -1 -h /var/run/postgresql -p 5432 -d postgres -v ON_ERROR_STOP=1 >/dev/null ||
  die "кластерный базис не сверился"

say "2/5 реестр стены рождения отношений"
node --experimental-strip-types "$GEN" --db "$DB" --relation-wall-registry-seed-only |
  runuser -u postgres -- psql -X -1 -h /var/run/postgresql -p 5432 -d "$DB" -v ON_ERROR_STOP=1 >/dev/null ||
  die "реестр не засеялся"

say "3/5 миграции вебаппа"
node "$OWNER_MIGRATOR" --db "$DB" --migrator "$MIGRATOR" --drizzle-folder "$DRIZZLE" --sudo-postgres ||
  die "миграции вебаппа не применились"

say "4/5 миграции интегратора"
node "$INTEGRATOR_MIGRATOR" --db "$DB" --migrator "$MIGRATOR" --owner app_object_owner \
  --root "$SRC/apps/integrator" --sudo-postgres || die "миграции интегратора не применились"

say "5/5 сверка прав и описатели порт-контекста"
( set -a && . "$ENV_DIR/reconcile.env" && set +a &&
  node deploy/postgres/privileges/reconcile-access.mjs \
    --env "$ENV_NAME" --db "$DB" --admin-socket /var/run/postgresql ) ||
  die "сверка прав не прошла"
bash "$SRC/deploy/host/prod/refresh-prod-runtime-env.sh" || die "описатели порт-контекста не обновились"

say "готово — схема и права соответствуют выложенному коммиту"
