#!/bin/bash
# Суточный бэкап хранилища сертификатов края (Caddy) на новом проде.
#
#   sudo /opt/backups/scripts/caddy-store-backup.sh
#
# Зачем это вообще. Потеря хранилища — не потеря данных: Caddy выпустит всё заново сам. Но у
# Let's Encrypt лимит 50 новых сертификатов в неделю на один зарегистрированный домен, и когда клиник
# станет много, восстановление «с нуля» растянется на дни, в течение которых часть клиник будет без
# TLS. Копия снимает это целиком: развернул каталог обратно — и край поднимается с теми же
# сертификатами и тем же ACME-аккаунтом.
#
# Что внутри: весь каталог данных Caddy — сертификаты, их приватные ключи и ключ ACME-аккаунта.
# Поэтому артефакт шифруется тем же `age` и на тех же получателей, что и дампы базы: открыть его
# можно только фразой владельца. Открытым на диск не ложится ничего — tar идёт в `age` потоком.
#
# Скрипт намеренно отказывается работать, а не «делает что может»: нет age, нет файла получателей,
# не та машина, нет каталога — это отказ. Бэкап, который тихо не состоялся, хуже отсутствия бэкапа,
# потому что о нём думают, что он есть.
#
# Отметка в `public.operator_job_status` (job_key=backup.caddy_store, family=backup) — та же
# механика, что у дампов базы: тревога ждёт отметку по ОЖИДАНИЮ из манифеста, поэтому молчание
# читается как авария, а не как тишина.
set -uo pipefail

JOB_KEY="backup.caddy_store"
JOB_FAMILY="backup"
STORE_DIR="${CADDY_DATA_DIR:-/opt/therapysto/state/caddy}"
OUT_DIR="${CADDY_BACKUP_DIR:-/opt/backups/caddy}"
RECIPIENTS_FILE="${BERSONCAREBOT_BACKUP_AGE_RECIPIENTS_FILE:-/opt/backups/age-recipients.txt}"
KEEP="${CADDY_BACKUP_KEEP:-14}"

started_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
started_ms="$(date +%s%3N)"

log()  { printf '[caddy-store-backup] %s\n' "$*"; }
fail() { log "FATAL: $*"; tick failure "$*"; exit 1; }

# Отметка пишется от учётки postgres по локальному сокету — ровно так же, как её пишет бэкап базы.
# Сам скрипт работает от root, потому что хранилище края принадлежит учётке caddy и закрыто 0700.
tick() {
  local status="$1" payload="${2:-}"
  local db="${BERSONCAREBOT_BACKUP_DATABASE:-}"
  [ -n "$db" ] || return 0
  command -v runuser >/dev/null 2>&1 || return 0
  local duration_ms=$(( $(date +%s%3N) - started_ms ))
  local sql
  if [ "$status" = success ]; then
    local meta="$payload"
    [ -n "$meta" ] || meta='{}'
    sql="INSERT INTO public.operator_job_status (job_key, job_family, last_status, last_started_at, last_finished_at, last_success_at, last_failure_at, last_duration_ms, last_error, meta_json)
         VALUES ('$JOB_KEY', '$JOB_FAMILY', 'success', '$started_iso'::timestamptz, now(), now(), NULL, $duration_ms, NULL, '$meta'::jsonb)
         ON CONFLICT (job_key) DO UPDATE SET job_family = EXCLUDED.job_family, last_status = 'success',
           last_started_at = EXCLUDED.last_started_at, last_finished_at = now(), last_success_at = now(),
           last_failure_at = NULL, last_duration_ms = EXCLUDED.last_duration_ms, last_error = NULL,
           meta_json = EXCLUDED.meta_json;"
  else
    # Текст ошибки — только наш собственный, апострофы удвоены. Чужой вывод сюда не попадает.
    local safe="${payload//\'/\'\'}"
    sql="INSERT INTO public.operator_job_status (job_key, job_family, last_status, last_started_at, last_finished_at, last_success_at, last_failure_at, last_duration_ms, last_error, meta_json)
         VALUES ('$JOB_KEY', '$JOB_FAMILY', 'failure', '$started_iso'::timestamptz, now(), NULL, now(), $duration_ms, '$safe', '{}'::jsonb)
         ON CONFLICT (job_key) DO UPDATE SET job_family = EXCLUDED.job_family, last_status = 'failure',
           last_started_at = EXCLUDED.last_started_at, last_finished_at = now(), last_failure_at = now(),
           last_duration_ms = EXCLUDED.last_duration_ms, last_error = EXCLUDED.last_error;"
  fi
  runuser -u postgres -- env PGDATABASE="$db" psql -v ON_ERROR_STOP=1 -q -c "$sql" >/dev/null 2>&1 || true
}

[ "$(id -u)" = 0 ] || { log "FATAL: нужен root — хранилище края закрыто 0700 на учётку caddy"; exit 1; }

# Та же проверка машины, что у бэкапа базы, и по тем же переменным: файл расписания сгенерирован для
# среды prod, и на любой другой машине ожидание не совпадёт. Без этого скрипт однажды снял бы чужое
# хранилище в чужой каталог и записал это как успех.
expect_host="${BERSONCAREBOT_BACKUP_EXPECT_HOSTNAME:-}"
expect_ipv4="${BERSONCAREBOT_BACKUP_EXPECT_IPV4:-}"
[ -n "$expect_host" ] && [ -n "$expect_ipv4" ] \
  || fail "не заданы BERSONCAREBOT_BACKUP_EXPECT_HOSTNAME/_IPV4 — на какой машине работать, неизвестно"
[ "$(hostname)" = "$expect_host" ] || fail "это не $expect_host, а $(hostname)"
case " $(hostname -I) " in
  *" $expect_ipv4 "*) : ;;
  *) fail "у машины нет адреса $expect_ipv4" ;;
esac

command -v age >/dev/null 2>&1 || fail "нет age — шифровать нечем"
command -v tar >/dev/null 2>&1 || fail "нет tar"
[ -s "$RECIPIENTS_FILE" ] || fail "нет файла получателей $RECIPIENTS_FILE"
grep -qE '^[[:space:]]*age1[0-9a-z]+[[:space:]]*$' "$RECIPIENTS_FILE" \
  || fail "в $RECIPIENTS_FILE нет ни одной пригодной строки получателя"
[ -d "$STORE_DIR" ] || fail "нет хранилища края $STORE_DIR"
[ -d "$STORE_DIR/certificates" ] || fail "в $STORE_DIR нет каталога certificates — бэкапить нечего"

install -d -m 0700 -o root -g root "$OUT_DIR" || fail "не создать $OUT_DIR"
case "$OUT_DIR" in /|/*/..*|*//*) fail "небезопасный путь $OUT_DIR" ;; esac

ts="$(date -u +%Y%m%dT%H%M%SZ)"
artifact="$OUT_DIR/caddy-store_${ts}.tar.age"
manifest="$artifact.sha256"
partial="$artifact.partial.$$"
cleanup() { rm -f "$partial"; }
trap cleanup EXIT

# tar идёт в age потоком: открытого архива на диске не существует ни секунды. Каталог берётся целиком,
# включая ключ ACME-аккаунта, — без него восстановление снова упрётся в лимиты выпуска.
umask 077
if ! tar -C "$(dirname "$STORE_DIR")" -cf - "$(basename "$STORE_DIR")" \
     | age -R "$RECIPIENTS_FILE" -o "$partial"; then
  fail "не снять копию хранилища"
fi
[ -s "$partial" ] || fail "копия получилась пустой"

mv -f "$partial" "$artifact" || fail "не опубликовать артефакт"
trap - EXIT
( cd "$OUT_DIR" && sha256sum "$(basename "$artifact")" > "$(basename "$manifest")" ) \
  || fail "не записать контрольную сумму"

# Хранение: столько последних копий, сколько сказано. Сертификат живёт 90 дней, две недели суточных
# копий с запасом покрывают любую замеченную поломку.
mapfile -t old < <(find "$OUT_DIR" -maxdepth 1 -type f -name 'caddy-store_*.tar.age' -printf '%T@\t%p\n' \
                     | sort -rn | tail -n +$((KEEP + 1)) | cut -f2)
for f in "${old[@]:-}"; do
  [ -n "$f" ] || continue
  rm -f -- "$f" "$f.sha256"
done

bytes="$(stat -c %s "$artifact")"
log "готово: $artifact ($bytes байт), храним последние $KEEP"
tick success "{\"artifact\":\"$(basename "$artifact")\",\"bytes\":$bytes}"
