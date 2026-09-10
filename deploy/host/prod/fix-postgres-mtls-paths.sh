#!/usr/bin/env bash
# Доводит до конца переименование хоста в одном месте, которое оно пропустило: пути к материалу
# mTLS внутри самого PostgreSQL.
#
# Переименование двигало файлы и правило конфигурации в /etc. Но `ssl_ca_file`, `ssl_crl_file`,
# `ssl_cert_file` и `ssl_key_file` заданы не в /etc, а через `ALTER SYSTEM` — они живут в
# `postgresql.auto.conf` внутри каталога данных, и там до сих пор стоит `/etc/bersoncarebot/...`,
# каталога, которого больше нет.
#
# Почему это не заметно и почему это опасно. Сервер прочитал эти файлы при последнем перечитывании
# конфигурации (до переименования) и с тех пор работает по загруженному в память материалу: живые
# подключения по клиентским сертификатам проходят, приложение здорово, ничего не жалуется. Но
# ПЕРВЫЙ ЖЕ `reload`, `restart` или перезагрузка машины заставит его открыть файлы по записанному
# пути — и TLS не поднимется вовсе. Для базы, куда рантайм ходит ТОЛЬКО по mTLS, это полный отказ
# приложения, отложенный до ближайшего ребута и внешне беспричинный.
#
# Поэтому чинится не «когда-нибудь», а до ближайшей перезагрузки, и чинится правильным способом:
# `ALTER SYSTEM`, а не правкой `postgresql.auto.conf` руками (её сервер имеет право переписать).
#
#   sudo bash deploy/host/prod/fix-postgres-mtls-paths.sh --check   # только показать состояние
#   sudo bash deploy/host/prod/fix-postgres-mtls-paths.sh --apply   # переставить и перечитать
set -uo pipefail

NEW_ROOT=/etc/therapysto/postgres-mtls
DATA_DIR=/var/lib/postgresql/16/main
AUTO_CONF="$DATA_DIR/postgresql.auto.conf"
# Проверочная роль выбрана намеренно: она ходит в базу тем же способом, что рантайм, — по
# клиентскому сертификату. Проверять доступ локальным postgres-сокетом бессмысленно: он идёт мимо TLS
# и был бы зелёным ровно в том случае, который мы боимся пропустить.
PROBE_LOGIN=bcb_test_integrator

die() { echo "FATAL: fix-postgres-mtls-paths: $*" >&2; exit 1; }
say() { printf '\033[1m==>\033[0m %s\n' "$*"; }

[ "$(id -u)" = 0 ] || die "нужен root"
case " $(hostname -I) " in
  *" 135.106.187.95 "*) : ;;
  *) die "этот скрипт только для нового прода 135.106.187.95" ;;
esac
case " $(hostname -I) " in
  *" 135.106.162.170 "*) die "это СТАРЫЙ прод — здесь ничего не трогаем" ;;
esac

MODE="${1:-}"
case "$MODE" in --check|--apply) : ;; *) die "нужен режим: --check или --apply" ;; esac

psql_admin() { runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 "$@"; }

say "текущие пути, по которым сервер будет искать материал при следующем перечитывании"
psql_admin -Atc "select name || ' = ' || setting from pg_settings
  where name in ('ssl','ssl_ca_file','ssl_crl_file','ssl_cert_file','ssl_key_file') order by name" |
  sed 's/^/    /'
echo "    конфигурация прочитана: $(psql_admin -Atc 'select pg_conf_load_time()')"

# Файлы обязаны существовать и быть читаемыми ДО перестановки: переставить путь на нечитаемый файл и
# перечитать конфигурацию — это ровно тот отказ, который скрипт предотвращает, только устроенный руками.
say "проверяю материал по новому пути"
declare -A WANT=(
  [ssl_ca_file]="$NEW_ROOT/ca.crt"
  [ssl_crl_file]="$NEW_ROOT/ca.crl"
  [ssl_cert_file]="$NEW_ROOT/server/server.crt"
  [ssl_key_file]="$NEW_ROOT/server/server.key"
)
for setting in ssl_ca_file ssl_crl_file ssl_cert_file ssl_key_file; do
  file="${WANT[$setting]}"
  [ -f "$file" ] || die "нет файла $file — переименование каталога не выполнялось или выполнено иначе"
  runuser -u postgres -- test -r "$file" || die "postgres не может прочитать $file"
  echo "    ок: $file"
done
openssl x509 -in "${WANT[ssl_cert_file]}" -noout -checkend 86400 >/dev/null ||
  die "серверный сертификат истекает в ближайшие сутки — сначала перевыпуск, потом пути"
openssl crl -in "${WANT[ssl_crl_file]}" -noout -verify -CAfile "${WANT[ssl_ca_file]}" >/dev/null 2>&1 ||
  die "CRL не проверяется этим CA — пути указали бы на несогласованный материал"

need=0
for setting in "${!WANT[@]}"; do
  current=$(psql_admin -Atc "select setting from pg_settings where name = '$setting'")
  [ "$current" = "${WANT[$setting]}" ] || need=1
done
if [ "$need" = 0 ]; then
  say "пути уже правильные — менять нечего"
  exit 0
fi

if [ "$MODE" = --check ]; then
  cat <<'INSTR'

РАСХОЖДЕНИЕ: сервер настроен на путь, которого больше нет. Пока он работает по материалу,
прочитанному до переименования; ближайшая перезагрузка оставит прод без mTLS, то есть без базы.

Починить:
    sudo bash deploy/host/prod/fix-postgres-mtls-paths.sh --apply
INSTR
  exit 1
fi

say "контрольное подключение ДО правки — фиксирую, что mTLS сейчас жив"
probe() {
  local work; work=$(mktemp -d) || return 1
  # Ключ копируется во временный файл 0600: libpq отказывается использовать ключ, доступный группе,
  # а рабочий ключ намеренно открыт группе контейнера. Копия удаляется в любом случае.
  install -m 0600 "$NEW_ROOT/prod/$PROBE_LOGIN.key" "$work/c.key" 2>/dev/null || { rm -rf "$work"; return 1; }
  install -m 0644 "$NEW_ROOT/prod/$PROBE_LOGIN.crt" "$work/c.crt" 2>/dev/null || { rm -rf "$work"; return 1; }
  local db pass rc
  db=$(psql_admin -Atc "select datname from pg_database where datname not in ('postgres','template0','template1') limit 1")
  # shellcheck disable=SC1091
  pass=$(set -a; . /etc/therapysto/env/reconcile.env; set +a; printf '%s' "${BCB_TEST_INTEGRATOR_PASSWORD:-}")
  [ -n "$pass" ] || { rm -rf "$work"; return 1; }
  PGPASSWORD="$pass" psql -X -Atc 'select 1' \
    "host=127.0.0.1 port=5432 dbname=$db user=$PROBE_LOGIN sslmode=require sslcert=$work/c.crt sslkey=$work/c.key sslrootcert=$NEW_ROOT/ca.crt" \
    >/dev/null 2>&1
  rc=$?
  rm -rf "$work"
  return $rc
}
probe || die "mTLS не работает ЕЩЁ ДО правки — сначала разберитесь с этим, менять пути вслепую нельзя"
echo "    подключение по клиентскому сертификату проходит"

say "резервная копия $AUTO_CONF"
backup="$AUTO_CONF.pre-therapysto-paths.$(date +%s)"
cp -a "$AUTO_CONF" "$backup"
echo "    $backup"

say "переставляю пути и перечитываю конфигурацию"
psql_admin -q <<SQL
ALTER SYSTEM SET ssl_ca_file   = '${WANT[ssl_ca_file]}';
ALTER SYSTEM SET ssl_crl_file  = '${WANT[ssl_crl_file]}';
ALTER SYSTEM SET ssl_cert_file = '${WANT[ssl_cert_file]}';
ALTER SYSTEM SET ssl_key_file  = '${WANT[ssl_key_file]}';
SELECT pg_reload_conf();
SQL

# Ждём, пока перечитывание реально произойдёт: pg_reload_conf() лишь посылает сигнал.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 1
  applied=$(psql_admin -Atc "select setting from pg_settings where name = 'ssl_ca_file'")
  [ "$applied" = "${WANT[ssl_ca_file]}" ] && break
done

say "проверка: сервер работает по новым путям"
psql_admin -Atc "select name || ' = ' || setting from pg_settings
  where name in ('ssl','ssl_ca_file','ssl_crl_file','ssl_cert_file','ssl_key_file') order by name" |
  sed 's/^/    /'

say "контрольное подключение ПОСЛЕ правки — это и есть доказательство"
# Перечитывание уже произошло, и TLS-контекст пересобран из файлов по новому пути. Если бы новый путь
# был неверным, сюда мы бы не дошли — и узнали бы об этом сейчас, а не при следующей перезагрузке.
if probe; then
  echo "    подключение по клиентскому сертификату проходит"
else
  cat >&2 <<INSTR
FATAL: после перестановки путей mTLS не поднялся.

Вернуть прежнее состояние (оно работало ТОЛЬКО из памяти процесса, файлов по тому пути нет —
восстановление имеет смысл лишь как способ не потерять исходный текст):
    cp -a $backup $AUTO_CONF

Смотреть причину:
    tail -50 /var/log/postgresql/postgresql-16-main.log
INSTR
  exit 1
fi

say "готово — переименование больше не переживёт перезагрузку только в памяти"
