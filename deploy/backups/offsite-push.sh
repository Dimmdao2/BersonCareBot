#!/bin/bash
# Отправка копий бэкапов с боевой машины на отдельный сервер (bcb-second).
#
#   sudo /opt/backups/scripts/offsite-push.sh
#
# Зачем. Часовые дампы уже идут, но лежат на ТОМ ЖЕ диске, что и база: пожар, потеря машины или
# ошибка раздела уносят базу и её бэкапы одним движением. Копия вне машины — единственное, что это
# закрывает.
#
# Почему толкаем отсюда, а не тянем оттуда. Тяга потребовала бы новой двери по SSH на боевой машине
# и ослабления прав на каталог дампов — то есть расширения поверхности атаки прода ради бэкапов.
# Толкаем.
#
# Почему это не даёт проду стереть бэкапы. Ключ отсюда заперт НА ПРИЁМНИКЕ, в его
# `authorized_keys`: `restrict,command="rrsync -wo -no-del /opt/backups/incoming"`. Тот, кто получил
# эту машину, может положить новый файл и больше ничего: ни прочитать, ни перечислить, ни удалить,
# ни открыть порт или tty. Проверено поломками на приёмнике 15.09: `--delete` отвечает «option
# --delete has been disabled on this server», чтение — «reading from write-only server is not
# allowed», произвольная команда — «SSH_ORIGINAL_COMMAND does not run rsync».
#
# И почему одного запрета удаления мало. Запрет удаления НЕ запрещает перезапись: залив мусор под
# уже известным именем, отсюда можно было бы убить историю. Поэтому приёмник уносит принятое из
# `incoming` в недостижимый отсюда `store` (`receive-store.sh`, каждые 5 минут, `--ignore-existing`),
# и столкнувшиеся имена уезжают в карантин, а не поверх хорошей копии. Сроки хранения приёмник
# держит свои, повторяя боевые.
#
# Открытых данных наружу не уходит: артефакты уже зашифрованы `age` на получателей владельца, и
# приёмник видит только шифротекст. Приватного ключа расшифровки этот скрипт не касается.
#
# Отметка в `public.operator_job_status` (job_key=backup.offsite_push, family=backup) — та же
# механика, что у дампов: тревога ждёт отметку по ОЖИДАНИЮ из манифеста, поэтому молчание читается
# как авария, а не как тишина. Отправка, которая тихо не состоялась, хуже отсутствия отправки.
set -uo pipefail

JOB_KEY="backup.offsite_push"
JOB_FAMILY="backup"

SRC_POSTGRES="${BERSONCAREBOT_BACKUPS_ROOT:-/opt/backups/postgres}"
SRC_CADDY="${CADDY_BACKUP_DIR:-/opt/backups/caddy}"
KEY_FILE="${BERSONCAREBOT_OFFSITE_KEY_FILE:-/opt/backups/keys/offsite_push_ed25519}"
KNOWN_HOSTS="${BERSONCAREBOT_OFFSITE_KNOWN_HOSTS:-/opt/backups/keys/offsite_known_hosts}"
REMOTE_USER="${BERSONCAREBOT_OFFSITE_USER:-bcbrecv}"
REMOTE_HOST="${BERSONCAREBOT_OFFSITE_HOST:-81.26.183.196}"

# Открытый ключ ХОСТА приёмника. Он не секрет, и держать его в коде — единственный способ не
# подставлять сюда `StrictHostKeyChecking=no`: иначе первая же подмена на пути между машинами
# получит наши артефакты, а скрипт этого не заметит. Снят с 81.26.183.196 15.09.2026.
REMOTE_HOST_KEY='81.26.183.196 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEv+lEI8vFxg3b0Skv24mvOjQYwYFME033TvyEkmeO7R'

started_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
started_ms="$(date +%s%3N)"

log()  { printf '[offsite-push] %s\n' "$*"; }
fail() { log "FATAL: $*"; tick failure "$*"; exit 1; }

# Отметка пишется от учётки postgres по локальному сокету — ровно так же, как её пишут бэкапы базы
# и края. Сам скрипт работает от root: каталог дампов закрыт 0700 на postgres.
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
    # Текст ошибки — только наш собственный, апострофы удвоены. Чужой вывод сюда не попадает:
    # в нём может оказаться путь, адрес или кусок ответа приёмника.
    local safe="${payload//\'/\'\'}"
    sql="INSERT INTO public.operator_job_status (job_key, job_family, last_status, last_started_at, last_finished_at, last_success_at, last_failure_at, last_duration_ms, last_error, meta_json)
         VALUES ('$JOB_KEY', '$JOB_FAMILY', 'failure', '$started_iso'::timestamptz, now(), NULL, now(), $duration_ms, '$safe', '{}'::jsonb)
         ON CONFLICT (job_key) DO UPDATE SET job_family = EXCLUDED.job_family, last_status = 'failure',
           last_started_at = EXCLUDED.last_started_at, last_finished_at = now(), last_failure_at = now(),
           last_duration_ms = EXCLUDED.last_duration_ms, last_error = EXCLUDED.last_error;"
  fi
  runuser -u postgres -- env PGDATABASE="$db" psql -v ON_ERROR_STOP=1 -q -c "$sql" >/dev/null 2>&1 || true
}

[ "$(id -u)" = 0 ] || { log "FATAL: нужен root — каталог дампов закрыт 0700 на postgres"; exit 1; }

# Та же проверка машины, что у бэкапов: расписание сгенерировано для среды prod, и на любой другой
# машине ожидание не совпадёт. Без неё скрипт однажды отправил бы чужие файлы и записал это успехом.
expect_host="${BERSONCAREBOT_BACKUP_EXPECT_HOSTNAME:-}"
expect_ipv4="${BERSONCAREBOT_BACKUP_EXPECT_IPV4:-}"
[ -n "$expect_host" ] && [ -n "$expect_ipv4" ] \
  || fail "не заданы BERSONCAREBOT_BACKUP_EXPECT_HOSTNAME/_IPV4 — на какой машине работать, неизвестно"
[ "$(hostname)" = "$expect_host" ] || fail "это не $expect_host, а $(hostname)"
case " $(hostname -I) " in
  *" $expect_ipv4 "*) : ;;
  *) fail "у машины нет адреса $expect_ipv4" ;;
esac

command -v rsync >/dev/null 2>&1 || fail "нет rsync — отправлять нечем"
command -v ssh >/dev/null 2>&1 || fail "нет ssh"
[ -d "$SRC_POSTGRES" ] || fail "нет каталога дампов $SRC_POSTGRES"

install -d -m 0700 -o root -g root "$(dirname "$KEY_FILE")" || fail "не создать каталог ключей"
printf '%s\n' "$REMOTE_HOST_KEY" > "$KNOWN_HOSTS" || fail "не записать $KNOWN_HOSTS"
chmod 0600 "$KNOWN_HOSTS"

# Ключ отправки рождается ЗДЕСЬ и отсюда не уходит: приватная половина никогда не покидает боевую
# машину, наружу отдаётся только публичная. Пока её не примет приёмник, скрипт честно падает — это
# не «ещё не настроено», а отсутствие копии вне машины, то есть ровно то, о чём должна кричать
# тревога.
if [ ! -s "$KEY_FILE" ]; then
  ssh-keygen -q -t ed25519 -N '' -f "$KEY_FILE" -C "offsite-push@${expect_host}" \
    || fail "не создать ключ отправки"
  chmod 0600 "$KEY_FILE"
  log "создан ключ отправки; публичная половина:"
  cat "$KEY_FILE.pub"
  fail "ключ отправки ещё не принят приёмником — добавить его публичную половину в authorized_keys учётки $REMOTE_USER строкой restrict,command=\"rrsync -wo -no-del /opt/backups/incoming\""
fi

SSH_CMD="ssh -i $KEY_FILE -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$KNOWN_HOSTS -o ConnectTimeout=20"

# `--ignore-existing` здесь ради самой боевой машины, а не ради приёмника: без него каждая отправка
# заново гнала бы весь набор, а с ним уезжает только то, чего на приёмнике ещё нет. Удаления мы не
# шлём вовсе — их и не примут, но и незачем: срок хранения приёмник держит свой.
push_dir() {
  local src="$1" rel="$2"
  [ -d "$src" ] || return 0
  rsync -a --ignore-existing --timeout=600 -e "$SSH_CMD" \
    "$src"/ "${REMOTE_USER}@${REMOTE_HOST}:./${rel}/" 2>&1
}

out_pg="$(push_dir "$SRC_POSTGRES" postgres)" || fail "не отправить дампы базы"
out_caddy="$(push_dir "$SRC_CADDY" caddy)" || fail "не отправить копию хранилища края"

bytes_pg="$(du -sb "$SRC_POSTGRES" 2>/dev/null | cut -f1)"
files_pg="$(find "$SRC_POSTGRES" -type f 2>/dev/null | wc -l)"
log "отправлено: дампов на диске $files_pg файлов, $bytes_pg байт"
tick success "{\"source_files\":${files_pg:-0},\"source_bytes\":${bytes_pg:-0}}"
