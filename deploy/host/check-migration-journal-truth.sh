#!/usr/bin/env bash
# Гейт правды журнала миграций: сравнивает цель с эталонной базой.
#
# Зачем (15.09.2026): мигратор считает миграцию применённой по одному признаку — её тег лежит в
# `drizzle.__drizzle_migrations`. Артефакт переезда пишет теги туда НАПРЯМУЮ, и один раз этого
# хватило, чтобы цель получила DDL миграции без её data-only части: кабинет клиента упал целиком и
# на TEST, и на новом проде. Владелец: «вот это главный баг что такое вообще возможно».
#
# Как спрашивает: у каждой миграции, помеченной применённой, есть заголовочная строка
# `-- BCB-MIGRATION-VERIFY: <предикат>` — готовый вопрос «сбылось ли обещанное». Скрипт задаёт его
# живой базе. Судить по одной базе нельзя: предикат — утверждение на МОМЕНТ своей миграции, и
# следующая миграция законно делает его ложным. Поэтому сравниваем с эталоном — базой, прошедшей
# миграции по-настоящему (по умолчанию DEV).
#
# Использование:
#   bash deploy/host/check-migration-journal-truth.sh <база-цели> [ssh-хост-цели]
# Примеры:
#   bash deploy/host/check-migration-journal-truth.sh bersoncarebot_test
#   bash deploy/host/check-migration-journal-truth.sh therapysto_prod bcb-build
# Ненулевой код возврата — цель потеряла то, что на эталоне сбылось.
set -Eeuo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_DB=${1:?нужна база цели}
TARGET_SSH=${2:-}
REFERENCE_DB=${BCB_JOURNAL_TRUTH_REFERENCE:-bcb_webapp_dev}

[ "$TARGET_DB" != "$REFERENCE_DB" ] || {
  echo "ОТКАЗ: цель и эталон — одна база ($TARGET_DB); сравнивать нечего" >&2
  exit 2
}

PIPELINE=${BCB_JOURNAL_TRUTH_PIPELINE:-/opt/therapysto/pipeline}
# shellcheck disable=SC2206
SSH_OPTS=(${BCB_JOURNAL_TRUTH_SSH_OPTS:-})
# shellcheck disable=SC2206
SCP_OPTS=(${BCB_JOURNAL_TRUTH_SSH_OPTS:-})

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
SQL=$WORK/journal-truth.sql

node "$REPO/deploy/postgres/migration-journal-truth.mjs" > "$SQL"
# psql бежит от postgres, поэтому файл обязан быть читаем не только автором.
chmod 0755 "$WORK"
chmod 0644 "$SQL"

ask_local() {
  sudo -n -u postgres psql -d "$1" -X -A -t -F $'\t' -v ON_ERROR_STOP=1 -f "$SQL" 2>/dev/null |
    grep '^RESULT' || true
}

# Удалённая цель отвечает СВОЕЙ командой конвейера: она root-owned, собирает запрос сама из
# выложенного дерева и потому разрешима одной строкой sudoers. Запасной путь — прямой psql: он нужен
# там, где конвейера нет (стенд, свежий хост), и работает только под учёткой с sudo.
ask_remote() {
  local db=$1
  # shellcheck disable=SC2029
  if ssh "${SSH_OPTS[@]}" "$TARGET_SSH" "sudo -n $PIPELINE/therapysto-journal-truth" 2>"$WORK/pipeline.err" |
       grep '^RESULT'; then
    return 0
  fi
  # Почему запасной путь вообще понадобился — видно здесь, а не в тишине: 15.09 конвейерный путь
  # молча не сработал, запасной упёрся в чужой файл, и наверх ушло «в базе прода нет того, что
  # миграции обещали» — сообщение про совсем другое.
  [ -s "$WORK/pipeline.err" ] && sed 's/^/  конвейерный путь: /' "$WORK/pipeline.err" >&2
  # Имя файла на цели — своё на каждый прогон. Постоянный путь в общем /tmp запирает гейт навсегда,
  # как только его однажды создаст другая учётка: прежние выкладки шли от root, нынешние от deploy,
  # и `scp` получил Permission denied на root-owned /tmp/bcb-journal-truth.sql.
  local remote
  remote=$(ssh "${SSH_OPTS[@]}" "$TARGET_SSH" 'mktemp /tmp/bcb-journal-truth.XXXXXXXX.sql') || return 0
  [ -n "$remote" ] || return 0
  # shellcheck disable=SC2064
  # Копию `.pg` кладёт `sudo install`, то есть её владелец — root, а мы ходим от deploy. Обычный
  # `rm` в sticky-каталоге /tmp такой файл снять НЕ может, и каждый запасной прогон оставлял на
  # цели ещё один root-owned хвост. Поэтому снимаем её тем же способом, каким положили: через sudo.
  # shellcheck disable=SC2064
  trap "ssh ${SSH_OPTS[*]} '$TARGET_SSH' 'rm -f \"$remote\"; sudo -n rm -f \"$remote.pg\" || rm -f \"$remote.pg\"' >/dev/null 2>&1; rm -rf '$WORK'" EXIT
  scp "${SCP_OPTS[@]}" -q "$SQL" "$TARGET_SSH:$remote"
  # shellcheck disable=SC2029
  ssh "${SSH_OPTS[@]}" "$TARGET_SSH" "sudo -n install -m 0644 '$remote' '$remote.pg' &&
    sudo -n -u postgres psql -d '$db' -X -A -t -F \$'\t' -v ON_ERROR_STOP=1 -f '$remote.pg' 2>/dev/null" |
    grep '^RESULT' || true
}

ask_local "$REFERENCE_DB" > "$WORK/reference.tsv"
if [ -n "$TARGET_SSH" ]; then ask_remote "$TARGET_DB" > "$WORK/target.tsv"; else ask_local "$TARGET_DB" > "$WORK/target.tsv"; fi

# Пустой ответ — это не «всё хорошо», а «спросить не получилось».
[ -s "$WORK/reference.tsv" ] || { echo "ОТКАЗ: эталон $REFERENCE_DB не ответил ни одной строкой" >&2; exit 2; }
[ -s "$WORK/target.tsv" ] || { echo "ОТКАЗ: цель $TARGET_DB не ответила ни одной строкой" >&2; exit 2; }

echo "эталон: $REFERENCE_DB ($(wc -l < "$WORK/reference.tsv") обещаний) · цель: $TARGET_DB ($(wc -l < "$WORK/target.tsv"))"
node "$REPO/deploy/postgres/migration-journal-truth.mjs" --diff "$WORK/reference.tsv" "$WORK/target.tsv"
