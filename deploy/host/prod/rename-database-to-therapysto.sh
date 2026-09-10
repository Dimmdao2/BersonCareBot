#!/usr/bin/env bash
# Переименование базы и логинов нового прода: bersoncarebot_test → therapysto_prod,
# bcb_test_* → therapysto_prod_*.
#
# Это ВТОРАЯ половина переименования, начатого rename-host-to-therapysto.sh. Первая переставила
# каталоги, сервисы и правила; здесь меняется то, что живёт внутри PostgreSQL и в строках
# подключения рантайма.
#
# Почему одним проходом, а не по шагам. `pg_hba` пускает эти логины правилом
# `clientcert=verify-full clientname=CN`: имя роли обязано совпадать с CN клиентского сертификата.
# Значит переименование роли обесценивает её сертификат — роль и сертификат меняются вместе или не
# меняются вовсе. Разнести это по двум запускам нельзя: между ними прод не подключается к базе.
#
# Что делает по шагам:
#   1. проверяет предусловия и делает проверенный бэкап базы и глобальных объектов;
#   2. останавливает рантайм обоих цветов (иначе базу не переименовать — она занята);
#   3. ALTER DATABASE / ALTER ROLE — имена меняются на месте, данные не двигаются;
#   4. выпускает четыре новых клиентских сертификата с CN = новым именам ролей;
#   5. пере-рендерит управляемый блок pg_hba штатным рендерером;
#   6. переписывает reconcile.env и строки подключения в env-файлах;
#   7. раскладывает права декларацией уже под именем prod и сверяет их;
#   8. убирает роли, оставшиеся от чужого кластера, и поднимает рантайм.
#
#   sudo bash deploy/host/prod/rename-database-to-therapysto.sh --check   # только проверки
#   sudo bash deploy/host/prod/rename-database-to-therapysto.sh --apply   # выполнить
set -uo pipefail

OLD_DB=bersoncarebot_test
NEW_DB=therapysto_prod
ROOT=/opt/therapysto
SRC="$ROOT/src"
ENV_DIR="$ROOT/env"
MTLS=/etc/therapysto/postgres-mtls
CA_KEY="$MTLS/authority/private/ca.key"
CA_SRL="$MTLS/authority/private/ca.srl"
HBA=/etc/postgresql/16/main/pg_hba.conf
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="$ROOT/state/rename-db-$STAMP"

# Пары «старое имя → новое». Порядок фиксирован: он же используется для сертификатов и env-файлов,
# и второго списка имён в этом скрипте нет — расхождение двух списков было бы худшим здесь дефектом.
ROLES=(
  "bcb_test_webapp_staff:therapysto_prod_webapp_staff"
  "bcb_test_webapp_patient:therapysto_prod_webapp_patient"
  "bcb_test_webapp_global_admin:therapysto_prod_webapp_global_admin"
  "bcb_test_integrator:therapysto_prod_integrator"
  "bcb_test_migrator:therapysto_prod_migrator"
)
# Переменные reconcile.env переименовываются вместе с ролями: имя переменной задано декларацией
# (`passwordEnv`), и reconcile ищет именно его. Значения не меняются — это те же пароли.
ENV_VARS=(
  "BCB_TEST_WEBAPP_STAFF_PASSWORD:THERAPYSTO_PROD_WEBAPP_STAFF_PASSWORD"
  "BCB_TEST_WEBAPP_PATIENT_PASSWORD:THERAPYSTO_PROD_WEBAPP_PATIENT_PASSWORD"
  "BCB_TEST_WEBAPP_GLOBAL_ADMIN_PASSWORD:THERAPYSTO_PROD_WEBAPP_GLOBAL_ADMIN_PASSWORD"
  "BCB_TEST_INTEGRATOR_PASSWORD:THERAPYSTO_PROD_INTEGRATOR_PASSWORD"
)
# Роли соседнего кластера, попавшие сюда прежним поведением кластерного примитива (без --db он
# раскладывал надмножество всех объявленных ролей). В прод-кластере им делать нечего.
FOREIGN_ROLES=(bcb_dev_migrator)

die() { echo "FATAL: rename-database: $*" >&2; exit 1; }
say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
step() { printf '\n\033[1m--- %s\033[0m\n' "$*"; }

[ "$(id -u)" = 0 ] || die "нужен root"
case " $(hostname -I) " in
  *" 135.106.162.170 "*) die "это СТАРЫЙ прод — здесь ничего не трогаем" ;;
esac
case " $(hostname -I) " in
  *" 135.106.187.95 "*) : ;;
  *) die "этот скрипт только для нового прода 135.106.187.95" ;;
esac

MODE="${1:-}"
case "$MODE" in --check|--apply) : ;; *) die "нужен режим: --check или --apply" ;; esac

psql_admin() { runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 "$@"; }
scalar() { psql_admin -Atc "$1"; }

########################################  ПРОВЕРКИ  ########################################
step "предусловия"

for command_name in openssl psql pg_dump pg_dumpall runuser docker node install shred; do
  command -v "$command_name" >/dev/null || die "нет команды $command_name"
done

[ -d "$SRC/.git" ] || die "нет рабочего дерева $SRC"
[ -r "$ENV_DIR/reconcile.env" ] || die "нет $ENV_DIR/reconcile.env"
[ -r "$ENV_DIR/webapp.prod" ] && [ -r "$ENV_DIR/api.prod" ] || die "нет env-файлов рантайма"
[ -r "$CA_KEY" ] || die "нет приватного ключа CA $CA_KEY"
[ -r "$MTLS/ca.crt" ] || die "нет сертификата CA"
[ -f "$HBA" ] || die "нет $HBA"

# Декларация обязана знать prod ДО того, как база получит это имя: иначе после переименования права
# разложить нечем, а откат — это восстановление из бэкапа, а не «переименовать обратно».
GEN="$SRC/deploy/postgres/privileges/generate-cli.mjs"
RECONCILE="$SRC/deploy/postgres/privileges/reconcile-access.mjs"
RENDER_HBA="$SRC/deploy/postgres/port-context/render-host-mtls-hba.mjs"
for f in "$GEN" "$RECONCILE" "$RENDER_HBA"; do
  [ -f "$f" ] || die "нет $f — выложите на прод коммит, где декларация знает окружение prod"
done
node --experimental-strip-types "$GEN" --shared-role-baseline --db "$NEW_DB" >/dev/null 2>&1 ||
  die "декларация в $SRC не знает базу $NEW_DB — сначала деплой нужного коммита"
echo "    декларация знает $NEW_DB"

[ "$(scalar "select count(*) from pg_database where datname = '$OLD_DB'")" = 1 ] ||
  die "нет базы $OLD_DB — возможно, переименование уже выполнено"
[ "$(scalar "select count(*) from pg_database where datname = '$NEW_DB'")" = 0 ] ||
  die "база $NEW_DB уже существует — разберитесь вручную, перезаписывать нельзя"

for pair in "${ROLES[@]}"; do
  old="${pair%%:*}"; new="${pair##*:}"
  [ "$(scalar "select count(*) from pg_roles where rolname = '$old'")" = 1 ] ||
    die "нет роли $old"
  [ "$(scalar "select count(*) from pg_roles where rolname = '$new'")" = 0 ] ||
    die "роль $new уже существует — переименование сделало бы конфликт имён"
done
echo "    пять ролей на месте, новых имён ещё нет"

for pair in "${ENV_VARS[@]}"; do
  old="${pair%%:*}"
  grep -q "^$old=" "$ENV_DIR/reconcile.env" || die "в reconcile.env нет $old"
done
echo "    четыре пароля на месте в reconcile.env"

grep -q "^# BEGIN BCB MANAGED MTLS HBA $OLD_DB\$" "$HBA" ||
  die "в $HBA нет управляемого блока для $OLD_DB — пере-рендер вслепую запрещён"
echo "    управляемый блок pg_hba найден"

# Пути внутри самого сервера обязаны указывать на существующий материал: если они всё ещё смотрят
# в /etc/bersoncarebot, перезагрузка конфигурации на шаге pg_hba оставит прод без TLS.
bad_paths=$(scalar "select string_agg(name || ' -> ' || setting, ', ')
  from pg_settings where name in ('ssl_ca_file','ssl_crl_file','ssl_cert_file','ssl_key_file')
  and setting not like '/etc/therapysto/%'")
[ -z "$bad_paths" ] ||
  die "postgres настроен на несуществующие пути ($bad_paths) — сначала fix-postgres-mtls-paths.sh --apply"
echo "    пути к материалу mTLS внутри сервера корректны"

if [ "$MODE" = --check ]; then
  say "--check пройден: предусловия выполнены, переименование можно запускать"
  echo "    sudo bash $0 --apply"
  exit 0
fi

########################################  БЭКАП  ########################################
step "1/8 проверенный бэкап"
install -d -m 0700 -o postgres -g postgres "$BACKUP_DIR"
runuser -u postgres -- pg_dump -Fc -h /var/run/postgresql -p 5432 -d "$OLD_DB" \
  -f "$BACKUP_DIR/$OLD_DB.dump" || die "не удалось снять дамп базы"
# Дампу верим только после того, как он прочитан обратно: непроверенный бэкап — это не бэкап.
runuser -u postgres -- pg_restore --list "$BACKUP_DIR/$OLD_DB.dump" >/dev/null ||
  die "дамп нечитаем — дальше нельзя"
[ "$(head -c5 -- "$BACKUP_DIR/$OLD_DB.dump")" = PGDMP ] || die "дамп не в ожидаемом формате"
# Роли и их пароли лежат вне базы, и переименование трогает именно их.
runuser -u postgres -- pg_dumpall -h /var/run/postgresql -p 5432 --globals-only \
  -f "$BACKUP_DIR/globals.sql" || die "не удалось снять глобальные объекты"
cp -a "$ENV_DIR/reconcile.env" "$ENV_DIR/webapp.prod" "$ENV_DIR/api.prod" "$BACKUP_DIR/"
cp -a "$HBA" "$BACKUP_DIR/pg_hba.conf"
cp -a "$MTLS/prod" "$BACKUP_DIR/mtls-prod"
chmod -R go-rwx "$BACKUP_DIR"
echo "    $BACKUP_DIR ($(du -sh "$BACKUP_DIR" | cut -f1))"

########################################  ОСТАНОВКА  ########################################
step "2/8 останавливаю рантайм обоих цветов"
# База не переименовывается, пока к ней есть подключения, а рантайм держит пул. Останавливаем оба
# цвета: неактивный тоже держит соединения, если его не сняли после прошлой выкладки.
for colour in blue green; do
  ids=$(docker ps -q --filter "label=com.docker.compose.project=therapysto-$colour")
  [ -n "$ids" ] && docker stop $ids >/dev/null && echo "    остановлен $colour"
done
sleep 2
scalar "select pg_terminate_backend(pid) from pg_stat_activity
  where datname = '$OLD_DB' and pid <> pg_backend_pid()" >/dev/null
left=$(scalar "select count(*) from pg_stat_activity where datname = '$OLD_DB' and pid <> pg_backend_pid()")
[ "$left" = 0 ] || die "к базе $OLD_DB осталось $left подключений — переименование не пройдёт"
echo "    подключений к $OLD_DB не осталось"

########################################  ПЕРЕИМЕНОВАНИЕ  ########################################
step "3/8 переименование базы и ролей"
psql_admin -q -d postgres -c "ALTER DATABASE $OLD_DB RENAME TO $NEW_DB;" || die "ALTER DATABASE не прошёл"
echo "    база: $OLD_DB → $NEW_DB"
for pair in "${ROLES[@]}"; do
  old="${pair%%:*}"; new="${pair##*:}"
  # Пароль переживает переименование: верификатор SCRAM-SHA-256, в отличие от старого md5, не
  # включает имя пользователя. Reconcile ниже всё равно проставит те же значения из reconcile.env.
  psql_admin -q -d postgres -c "ALTER ROLE $old RENAME TO $new;" || die "ALTER ROLE $old не прошёл"
  echo "    роль: $old → $new"
done

########################################  СЕРТИФИКАТЫ  ########################################
step "4/8 новые клиентские сертификаты (CN = новым именам ролей)"
work=$(mktemp -d); chmod 700 "$work"
trap 'rm -rf "$work"' EXIT
# Расширения задаются явно: у прежних пар их не было вовсе. Сертификат без extendedKeyUsage
# формально годится куда угодно; клиентский должен быть клиентским.
cat > "$work/client.ext" <<'EXT'
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = clientAuth
EXT
for pair in "${ROLES[@]}"; do
  old="${pair%%:*}"; new="${pair##*:}"
  # У мигратора нет клиентского сертификата: он ходит локальным сокетом, а не по TLS.
  [ -f "$MTLS/prod/$old.crt" ] || continue
  openssl req -new -nodes -newkey rsa:3072 -sha256 \
    -keyout "$work/$new.key" -out "$work/$new.csr" -subj "/CN=$new" >/dev/null 2>&1 ||
    die "не удалось создать запрос для $new"
  openssl x509 -req -sha256 -days 825 \
    -in "$work/$new.csr" -CA "$MTLS/ca.crt" -CAkey "$CA_KEY" -CAserial "$CA_SRL" \
    -extfile "$work/client.ext" -out "$work/$new.crt" >/dev/null 2>&1 ||
    die "не удалось подписать сертификат для $new"
  openssl verify -CAfile "$MTLS/ca.crt" "$work/$new.crt" >/dev/null ||
    die "новый сертификат $new не проверяется этим CA"
  # Владелец и права снимаются со старой пары, а не задаются заново: их выставил тот, кто ставил
  # хост, и контейнер получает ключ по группе (`group_add` в compose).
  install -o "$(stat -c '%U' "$MTLS/prod/$old.crt")" -g "$(stat -c '%G' "$MTLS/prod/$old.crt")" \
    -m "$(stat -c '%a' "$MTLS/prod/$old.crt")" "$work/$new.crt" "$MTLS/prod/$new.crt"
  install -o "$(stat -c '%U' "$MTLS/prod/$old.key")" -g "$(stat -c '%G' "$MTLS/prod/$old.key")" \
    -m "$(stat -c '%a' "$MTLS/prod/$old.key")" "$work/$new.key" "$MTLS/prod/$new.key"
  echo "    выписан $new"
done

########################################  PG_HBA  ########################################
step "5/8 управляемый блок pg_hba под новые имена"
# Старый блок снимается по маркерам, а не правкой строк: рендерер удаляет блок только для базы,
# которую ему назвали, и блок прежнего имени иначе остался бы в файле вторым, живым правилом.
awk -v b="# BEGIN BCB MANAGED MTLS HBA $OLD_DB" -v e="# END BCB MANAGED MTLS HBA $OLD_DB" '
  $0 == b { inside = 1; next } $0 == e { inside = 0; next } !inside { print }
' "$HBA" > "$work/hba.stripped"
grep -q "MANAGED MTLS HBA $OLD_DB" "$work/hba.stripped" && die "старый блок pg_hba снялся не полностью"
node "$RENDER_HBA" merge --input "$work/hba.stripped" --output "$work/hba.new" \
  --database "$NEW_DB" \
  --staff-login therapysto_prod_webapp_staff \
  --patient-login therapysto_prod_webapp_patient \
  --global-admin-login therapysto_prod_webapp_global_admin \
  --integrator-login therapysto_prod_integrator || die "рендерер pg_hba отказал"
node "$RENDER_HBA" validate --input "$work/hba.new" \
  --database "$NEW_DB" \
  --staff-login therapysto_prod_webapp_staff \
  --patient-login therapysto_prod_webapp_patient \
  --global-admin-login therapysto_prod_webapp_global_admin \
  --integrator-login therapysto_prod_integrator || die "новый pg_hba не проходит собственную проверку"
install -o "$(stat -c '%U' "$HBA")" -g "$(stat -c '%G' "$HBA")" -m "$(stat -c '%a' "$HBA")" \
  "$work/hba.new" "$HBA"
scalar "select pg_reload_conf()" >/dev/null
sleep 1
echo "    блок пере-рендерен и перечитан"

########################################  ENV  ########################################
step "6/8 строки подключения и имена паролей"
for pair in "${ENV_VARS[@]}"; do
  old="${pair%%:*}"; new="${pair##*:}"
  sed -i "s|^$old=|$new=|" "$ENV_DIR/reconcile.env"
done
echo "    reconcile.env: четыре переменные переименованы (значения не тронуты)"

# В env-файлах меняются только имена: логин в строке подключения, имя базы и пути к парам. Пароли
# в этих же строках не трогаются — замены точечные, по именам, а не по позиции.
for f in "$ENV_DIR/webapp.prod" "$ENV_DIR/api.prod"; do
  for pair in "${ROLES[@]}"; do
    old="${pair%%:*}"; new="${pair##*:}"
    sed -i "s|://$old:|://$new:|g; s|'$old'|'$new'|g; s|/$old\.crt|/$new.crt|g; s|/$old\.key|/$new.key|g" "$f"
  done
  sed -i "s|/$OLD_DB'|/$NEW_DB'|g; s|/$OLD_DB\"|/$NEW_DB\"|g" "$f"
  remaining=$(grep -c 'bcb_test\|bersoncarebot_test' "$f" || true)
  [ "$remaining" = 0 ] || die "в $f осталось $remaining упоминаний старых имён — разберитесь вручную"
  echo "    $(basename "$f"): старых имён не осталось"
done

########################################  ПРАВА  ########################################
step "7/8 права декларацией под именем prod"
node --experimental-strip-types "$GEN" --shared-role-baseline --db "$NEW_DB" |
  psql_admin -1 -h /var/run/postgresql -p 5432 -d postgres >/dev/null ||
  die "кластерный базис не разложился"
node --experimental-strip-types "$GEN" --shared-role-verify --db "$NEW_DB" |
  psql_admin -1 -h /var/run/postgresql -p 5432 -d postgres >/dev/null ||
  die "кластерный базис не сверился"
echo "    кластерные роли разложены и сверены"

( cd "$SRC" && set -a && . "$ENV_DIR/reconcile.env" && set +a &&
  node deploy/postgres/privileges/reconcile-access.mjs \
    --env prod --db "$NEW_DB" --admin-socket /var/run/postgresql ) ||
  die "сверка прав не прошла — рантайм НЕ поднят, база уже переименована; см. $BACKUP_DIR"
echo "    права разложены и проверены"

step "8/8 чужие роли, описатели порт-контекста, рантайм"
for role in "${FOREIGN_ROLES[@]}"; do
  if [ "$(scalar "select count(*) from pg_roles where rolname = '$role'")" = 1 ]; then
    # DROP не пройдёт, если у роли остались объекты или гранты — и это правильно: молча
    # отобранная роль хуже, чем роль, о которой сказали вслух.
    if psql_admin -q -d postgres -c "DROP ROLE $role;" 2>/dev/null; then
      echo "    удалена чужая роль $role"
    else
      echo "    ВНИМАНИЕ: роль $role не удалена (за ней числятся объекты или права) — разберитесь отдельно"
    fi
  fi
done

bash "$SRC/deploy/host/prod/refresh-prod-runtime-env.sh" ||
  die "не удалось обновить описатели порт-контекста"

say "поднимаю рантайм"
"$ROOT/pipeline/therapysto-deploy" prod-probe ||
  die "выкладка не поднялась; база и права уже переименованы, бэкап в $BACKUP_DIR"

step "проверка"
psql_admin -Atc "select 'база на месте: ' || datname || ', владелец ' || pg_get_userbyid(datdba)
  from pg_database where datname = '$NEW_DB'" | sed 's/^/    /'
psql_admin -Atc "select 'роли: ' || string_agg(rolname, ', ' order by rolname)
  from pg_roles where rolname like 'therapysto_prod%'" | sed 's/^/    /'
psql_admin -Atc "select 'остатки bcb_*: ' || coalesce(string_agg(rolname, ', ' order by rolname), 'нет')
  from pg_roles where rolname like 'bcb_%'" | sed 's/^/    /'

cat <<INSTR

Готово. Бэкап: $BACKUP_DIR

Старые клиентские ключи остались в $MTLS/prod/bcb_test_*.key. Отзыв в CRL не нужен и невозможен
здесь по построению: у этого CA нет базы выпущенных сертификатов, а главное — pg_hba пускает по
правилу clientname=CN, где CN обязан совпасть с ИМЕНЕМ РОЛИ. Ролей bcb_test_* больше нет, значит
предъявить такой сертификат некому и не за кого. Их следует просто уничтожить, убедившись, что
приложение живо:

    shred -u $MTLS/prod/bcb_test_*.key && rm -f $MTLS/prod/bcb_test_*.crt
INSTR
