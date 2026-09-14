#!/usr/bin/env bash
# Приёмник бэкапов: ТЯНЕТ копию с боевой машины на отдельную. Ставится на `bcb-second`, НЕ на прод.
#
# Почему тянет приёмник, а не толкает прод. Если бы толкал прод, прод держал бы ключ с правом писать
# в хранилище бэкапов — и тот, кто получил прод, получил бы заодно возможность стереть бэкапы, то
# есть ровно то, от чего бэкапы и защищают. При тяге прод о приёмнике не знает ничего и доступа к
# нему не имеет; скомпрометированный прод не дотягивается до копий.
#
# Обратная сторона: ключ на стороне приёмника открывает вход на прод, поэтому он обязан быть заперт
# на ОДНУ команду чтения. На проде в `authorized_keys` этот ключ прописывается так:
#
#   command="rrsync -ro /opt/backups/postgres",restrict <тип> <ключ> backup-pull@bcb-second
#
# `rrsync` (идёт в пакете rsync) физически не выпускает вызов за пределы указанного каталога, `-ro`
# запрещает запись, `restrict` снимает порты, агента, X11 и tty. Ключ без `command=` давал бы
# полноценный вход на боевую машину — так его ставить нельзя.
#
# Файлы уже зашифрованы `age` на стороне прода, поэтому приёмнику НЕ нужен ни `age`, ни приватный
# ключ: он хранит непрозрачные для себя файлы. Это намеренно — приёмник не должен уметь их читать.
#
# Проверка целостности идёт по манифестам `.sha256`, которые лежат рядом с артефактами.
#
# Запуск: pull-backups-from-prod.sh [--dry-run]

set -euo pipefail

PROD_HOST="${BCB_BACKUP_SOURCE_HOST:-135.106.187.95}"
PROD_USER="${BCB_BACKUP_SOURCE_USER:-backup-pull}"
PROD_KEY="${BCB_BACKUP_SOURCE_KEY:-/opt/backups/keys/backup-pull}"
MIRROR="${BCB_BACKUP_MIRROR_ROOT:-/opt/backups/mirror}"
# Сколько суток держим на приёмнике. Больше, чем на проде: приёмник и существует затем, чтобы
# пережить машину, на которой retention уже отработал.
KEEP_DAYS="${BCB_BACKUP_MIRROR_KEEP_DAYS:-60}"
JOURNAL="${BCB_BACKUP_MIRROR_JOURNAL:-/opt/backups/mirror-last-run.json}"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

die() { echo "pull-backups: $*" >&2; exit 1; }

command -v rsync >/dev/null || die "нет rsync"
[ -r "$PROD_KEY" ] || die "не читается ключ $PROD_KEY"

# Каталог зеркала виден только владельцу: внутри лежат полные копии боевой базы, пусть и
# зашифрованные. Право «прочитать файл» тут равно праву «унести базу целиком».
install -d -m 0700 "$MIRROR"

started_iso="$(date -u +%FT%TZ)"
rsync_flags=(-a --delete --partial --timeout=1800)
[ "$DRY_RUN" = 1 ] && rsync_flags+=(--dry-run --itemize-changes)

# `command=` на стороне прода уже жёстко задаёт каталог-источник, поэтому путь здесь — это путь
# ВНУТРИ него, а не абсолютный путь на проде.
rsync "${rsync_flags[@]}" \
  -e "ssh -i ${PROD_KEY} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=30" \
  "${PROD_USER}@${PROD_HOST}:./" "${MIRROR}/" ||
  die "перенос не удался (источник ${PROD_USER}@${PROD_HOST})"

if [ "$DRY_RUN" = 1 ]; then
  echo "pull-backups: dry-run завершён, ничего не записано"
  exit 0
fi

# Целостность проверяется ЗДЕСЬ, на приёмнике, а не принимается на веру от источника: копия, про
# которую известно только «rsync не ругнулся», — это предположение, а не бэкап. Манифест лежит
# рядом с артефактом и проверяется в его каталоге.
checked=0
bad=0
while IFS= read -r manifest; do
  dir="$(dirname "$manifest")"
  base="$(basename "$manifest")"
  if (cd "$dir" && sha256sum -c --status "$base"); then
    checked=$((checked + 1))
  else
    bad=$((bad + 1))
    echo "pull-backups: КОНТРОЛЬНАЯ СУММА НЕ СОШЛАСЬ: ${manifest}" >&2
  fi
done < <(find "$MIRROR" -type f -name '*.dump.age.sha256')

# Своё retention: прод удаляет по своим окнам, приёмник держит дольше. `--delete` выше уже повторил
# удаления источника, поэтому эта чистка снимает только то, что пережило и источник, и наше окно.
find "$MIRROR" -type f -name '*.dump.age' -mtime "+${KEEP_DAYS}" -delete
find "$MIRROR" -type f -name '*.dump.age.sha256' -mtime "+${KEEP_DAYS}" -delete

bytes="$(du -sb "$MIRROR" 2>/dev/null | cut -f1)"
files="$(find "$MIRROR" -type f -name '*.dump.age' | wc -l)"

# Журнал последнего переноса лежит файлом, потому что к базе прода приёмник намеренно не ходит:
# его задача — пережить прод, а не зависеть от него.
umask 077
printf '{"startedAt":"%s","finishedAt":"%s","artifacts":%s,"bytes":%s,"verified":%s,"corrupt":%s}\n' \
  "$started_iso" "$(date -u +%FT%TZ)" "${files:-0}" "${bytes:-0}" "$checked" "$bad" > "$JOURNAL"

[ "$bad" -eq 0 ] || die "перенос завершён, но ${bad} копий не прошли проверку целостности"
echo "pull-backups: готово — ${files} артефактов, проверено ${checked}, размер ${bytes} Б"
