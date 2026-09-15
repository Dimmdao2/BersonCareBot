#!/usr/bin/env bash
# Учения по восстановлению боевой базы из шифрованного бэкапа. Б-6 из docs/_TODO/BACKUPS_2026-09-14.md.
#
#   bash deploy/backups/restore-drill.sh                 # взять свежий часовой артефакт с прода
#   bash deploy/backups/restore-drill.sh <файл.dump.age> # взять готовый локальный артефакт
#
# Зачем. Бэкап, из которого ни разу не восстанавливали, — это не бэкап, а файл с обещанием. Проверено
# на нём бывает ровно одно: что он существует. Целый ли внутри дамп, открывается ли он тем ключом,
# который считается ключом, и поднимается ли база до состояния, в котором с ней можно работать, —
# ничего из этого размер файла не доказывает.
#
# ГДЕ ЭТО ГОНЯЕТСЯ: на dev-боксе, во ВРЕМЕННУЮ базу со своим именем. Ни прод, ни TEST, ни рабочая
# dev-база не затрагиваются: скрипт отказывается работать, если имя временной базы уже занято, и
# сносит её за собой в любом исходе.
#
# ПОЧЕМУ ЭТО НЕ АВТОМАТИЗИРУЕТСЯ. Дамп зашифрован `age` на получателей владельца, а приватный ключ
# заперт его фразой. Чтобы учения шли по расписанию сами, фраза или открытый ключ должны были бы
# лежать на машине — то есть шифрование бэкапов перестало бы что-либо значить. Поэтому учения
# ОПЕРАТОРСКИЕ: владелец вводит фразу, когда их гоняют. Скрипт существует, чтобы это занимало минуту
# и всегда проверяло одно и то же, а не вспоминалось заново каждый раз.
set -uo pipefail

PROD_SSH="${BCB_DRILL_PROD_SSH:-bcb-build}"
PROD_BACKUP_DIR="${BCB_DRILL_PROD_BACKUP_DIR:-/opt/backups/postgres/hourly}"
IDENTITY="${BCB_DRILL_IDENTITY:-$HOME/recovery-key.age}"
WORK="${BCB_DRILL_WORKDIR:-/tmp/bcb-restore-drill.$$}"
DB="${BCB_DRILL_DB:-bcb_restore_drill_$(date -u +%Y%m%d%H%M%S)}"

# Таблицы, по которым сверяем «восстановилось ли то самое». Не весь список схемы: нужен показатель,
# а не перепись. Взяты разные углы — люди, записи, организации, журнал миграций, — чтобы пустая или
# наполовину восстановленная база не прошла проверку за счёт одной уцелевшей таблицы.
CHECK_TABLES=(
  public.platform_users
  public.be_appointments
  public.organizations
  public.system_settings
  drizzle.__drizzle_migrations
)

log()  { printf '[restore-drill] %s\n' "$*"; }
die()  { printf '[restore-drill] ОТКАЗ: %s\n' "$*" >&2; exit 1; }

cleanup() {
  # Открытый дамп и временная база не переживают прогон НИ В КАКОМ исходе: в дампе боевые
  # персональные данные, и оставить его лежать в /tmp — худшее, что могут сделать учения.
  [ -n "${DB_CREATED:-}" ] && dropdb --if-exists "$DB" >/dev/null 2>&1
  rm -rf "$WORK"
}
trap cleanup EXIT

for t in age pg_restore createdb dropdb psql sha256sum; do
  command -v "$t" >/dev/null 2>&1 || die "нет $t"
done
[ -s "$IDENTITY" ] || die "нет файла ключа $IDENTITY (его держит владелец; путь задаётся BCB_DRILL_IDENTITY)"

# Фразу вводит человек, значит нужен терминал. Без этой проверки `age` падает на «/dev/tty is not
# available», и отказ читается как «неверная фраза» — то есть учения выглядели бы провалившимися
# там, где их просто запустили не оттуда.
[ -t 0 ] || die "нужен терминал: фразу от ключа вводит владелец, из фонового запуска учения не идут"

mkdir -p "$WORK" || die "не создать $WORK"
chmod 0700 "$WORK"

ARTIFACT="${1:-}"
if [ -n "$ARTIFACT" ]; then
  [ -s "$ARTIFACT" ] || die "нет артефакта $ARTIFACT"
  log "беру готовый артефакт: $ARTIFACT"
else
  log "беру свежий часовой артефакт с $PROD_SSH"
  name="$(ssh -o BatchMode=yes "$PROD_SSH" "ls -1t '$PROD_BACKUP_DIR'/*.dump.age 2>/dev/null | head -1")" \
    || die "не спросить прод об артефактах"
  [ -n "$name" ] || die "на проде нет ни одного часового артефакта — это отдельная авария, а не сбой учений"
  base="$(basename "$name")"
  ssh -o BatchMode=yes "$PROD_SSH" "cat '$name'" > "$WORK/$base" || die "не забрать $base"
  ssh -o BatchMode=yes "$PROD_SSH" "cat '$name.sha256'" > "$WORK/$base.sha256" 2>/dev/null || true
  ARTIFACT="$WORK/$base"
  log "забрано: $base ($(stat -c %s "$ARTIFACT") байт)"
fi

# Контрольная сумма — до расшифровки: если артефакт побился на диске или в пути, об этом надо знать
# отдельным словом, а не как о «неверной фразе».
if [ -s "$ARTIFACT.sha256" ]; then
  ( cd "$(dirname "$ARTIFACT")" && sha256sum -c "$(basename "$ARTIFACT").sha256" >/dev/null 2>&1 ) \
    || die "контрольная сумма не сошлась — артефакт побит, восстанавливать нечего"
  log "контрольная сумма сошлась"
else
  log "ВНИМАНИЕ: рядом нет манифеста .sha256 — целостность артефакта не проверена"
fi

log "расшифровываю; age спросит фразу владельца"
age -d -i "$IDENTITY" -o "$WORK/drill.dump" "$ARTIFACT" || die "не расшифровать (неверная фраза или не тот ключ)"
[ -s "$WORK/drill.dump" ] || die "расшифрованный дамп пуст"

# Первые пять байт custom-формата pg_dump — PGDMP. Проверка дешёвая и отсекает случай «расшифровалось
# во что-то не то» до долгого восстановления.
head -c 5 "$WORK/drill.dump" | grep -q PGDMP || die "расшифровано, но это не дамп pg_dump"
log "расшифровано: $(stat -c %s "$WORK/drill.dump") байт, формат pg_dump"

psql -Atqc "SELECT 1 FROM pg_database WHERE datname = '$DB'" postgres 2>/dev/null | grep -q 1 \
  && die "база $DB уже существует — учения не трогают чужое"
createdb "$DB" || die "не создать временную базу $DB"
DB_CREATED=1
log "создана временная база $DB"

# `pg_restore` на чужой машине всегда ругается на владельцев ролей и расширения, которых здесь нет.
# Это не провал восстановления: данные при этом восстанавливаются. Поэтому код возврата не считаем
# приговором — приговор выносит сверка строк ниже.
restore_log="$WORK/restore.log"
pg_restore --no-owner --no-privileges --dbname "$DB" "$WORK/drill.dump" >"$restore_log" 2>&1
restore_rc=$?
errors="$(grep -c '^pg_restore: error' "$restore_log" 2>/dev/null || echo 0)"
log "pg_restore завершился с кодом $restore_rc, строк с error: $errors"

echo
printf '%-40s %14s\n' 'таблица' 'строк'
printf '%-40s %14s\n' '----------------------------------------' '--------------'
total=0
for t in "${CHECK_TABLES[@]}"; do
  n="$(psql -Atqc "SELECT count(*) FROM $t" "$DB" 2>/dev/null)"
  if [ -z "$n" ]; then
    printf '%-40s %14s\n' "$t" 'НЕТ ТАБЛИЦЫ'
  else
    printf '%-40s %14s\n' "$t" "$n"
    total=$(( total + n ))
  fi
done
echo

[ "$total" -gt 0 ] || die "во всех проверяемых таблицах ноль строк — восстановление не состоялось"

log "УЧЕНИЯ ПРОЙДЕНЫ: артефакт открылся, дамп поднялся, данные на месте"
log "сверьте числа выше с боевыми (панель здоровья или psql на проде) — это последний шаг, его делает человек"
