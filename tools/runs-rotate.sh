#!/usr/bin/env bash
# Ротация рабочих бумаг прогонов вне репозитория: runs/briefs/ и runs/*.log.
#
# Зачем: брифы и логи прогонов живут в runs/ (в .gitignore, не в git — улика прогона это строка очереди
# NIGHT_WAVE_AUDIT_QUEUE + git-история коммитов, не сам файл), копятся с апреля и ничем не чистятся.
# Удаление здесь безопасно ровно потому, что это НЕ docs/_TODO/runs/** — те в git и требуют
# отдельной ручной подметки, а не таймера.
#
# Использование:
#   tools/runs-rotate.sh [--dry-run] [--days N] [--dir РЕПО]
#   tools/runs-rotate.sh --selftest      # поведенческая самопроверка, ничего в РЕПО не трогает
#
# --dry-run печатает, что было бы удалено, и НЕ удаляет ничего.
# --days N   порог возраста в сутках (по умолчанию 14).
# --dir РЕПО корень репозитория, где искать runs/ (по умолчанию — корень репозитория этого скрипта).
set -euo pipefail

DAYS=14
DRY_RUN=0
REPO_DIR=""
SELFTEST=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --days) DAYS="$2"; shift 2 ;;
    --dir) REPO_DIR="$2"; shift 2 ;;
    --selftest) SELFTEST=1; shift ;;
    *) echo "неизвестный флаг: $1" >&2; exit 1 ;;
  esac
done

rotate() {
  local runs_dir="$1" days="$2" dry_run="$3"
  local briefs_dir="$runs_dir/briefs"
  local -a targets=()

  if [ -d "$briefs_dir" ]; then
    while IFS= read -r -d '' f; do targets+=("$f"); done \
      < <(find "$briefs_dir" -type f -mtime +"$days" -print0)
  fi
  if [ -d "$runs_dir" ]; then
    while IFS= read -r -d '' f; do targets+=("$f"); done \
      < <(find "$runs_dir" -maxdepth 1 -type f -iname "*.log" -mtime +"$days" -print0)
  fi

  if [ "${#targets[@]}" -eq 0 ]; then
    echo "runs-rotate: нечего удалять (старше ${days}д) в $runs_dir"
    return 0
  fi

  if [ "$dry_run" -eq 1 ]; then
    printf 'runs-rotate: [dry-run] удалил бы %d файл(ов):\n' "${#targets[@]}"
    printf '  %s\n' "${targets[@]}"
    return 0
  fi

  for f in "${targets[@]}"; do rm -f -- "$f"; done
  printf 'runs-rotate: удалено %d файл(ов) старше %dд из %s\n' "${#targets[@]}" "$days" "$runs_dir"
}

selftest() {
  local tmp; tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  mkdir -p "$tmp/runs/briefs"

  local old_brief="$tmp/runs/briefs/old.md" new_brief="$tmp/runs/briefs/new.md"
  local old_log="$tmp/runs/old.log" new_log="$tmp/runs/new.log"
  echo old > "$old_brief"; echo new > "$new_brief"
  echo old > "$old_log"; echo new > "$new_log"
  touch -d '20 days ago' "$old_brief" "$old_log"
  touch -d '1 day ago' "$new_brief" "$new_log"

  # --dry-run обязан ничего не удалять и назвать старые файлы.
  local out; out="$(rotate "$tmp/runs" 14 1)"
  if [ ! -f "$old_brief" ] || [ ! -f "$old_log" ] || [ ! -f "$new_brief" ] || [ ! -f "$new_log" ]; then
    echo "SELFTEST FAIL: --dry-run удалил файл" >&2; return 1
  fi
  if ! grep -q "old.md" <<<"$out" || ! grep -q "old.log" <<<"$out"; then
    echo "SELFTEST FAIL: --dry-run не назвал старые файлы" >&2; return 1
  fi

  # Реальный прогон обязан удалить старые и оставить новые нетронутыми.
  rotate "$tmp/runs" 14 0 >/dev/null
  if [ -f "$old_brief" ] || [ -f "$old_log" ]; then
    echo "SELFTEST FAIL: старые файлы пережили прогон" >&2; return 1
  fi
  if [ ! -f "$new_brief" ] || [ ! -f "$new_log" ]; then
    echo "SELFTEST FAIL: свежие файлы удалены по ошибке" >&2; return 1
  fi

  echo "SELFTEST OK: --dry-run ничего не удаляет и называет цели; реальный прогон удаляет только старше порога"
}

if [ "$SELFTEST" -eq 1 ]; then
  selftest
  exit $?
fi

if [ -z "$REPO_DIR" ]; then
  REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

rotate "$REPO_DIR/runs" "$DAYS" "$DRY_RUN"
