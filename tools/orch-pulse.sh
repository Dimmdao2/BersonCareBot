#!/usr/bin/env bash
# ПУЛЬС: одна команда, показывающая правду о работе. Её вызывает лид на каждом ударе будильника.
#
# Владелец 31.07: «ты не тупишь типа "всё хорошо, агент не упал, просто он уже 40 минут молчит" —
# такого не допускать». Поэтому скрипт не говорит «жив», он говорит МОЛЧИТ и сколько минут.
# Живой процесс с непишущимся логом — это ОТКАЗ, а не норма.
#
#   ok       — лог растёт, работа идёт
#   МОЛЧИТ   — процесс есть, лог не растёт дольше порога: считать отказом, снимать и перезапускать
#   упал     — процесса нет, а работа не завершена штатно
#
# Использование: tools/orch-pulse.sh [порог_молчания_сек]   (по умолчанию 600)
set -uo pipefail
ROOT=/home/dev/dev-projects/BersonCareBot
SILENT_MAX=${1:-600}
now=$(date +%s)

echo "── ПУЛЬС $(date '+%F %H:%M') ─────────────────────────────"

alive=0; silent=0
for log in /home/dev/dev-projects/bcb-wt-*/docs/_TODO/runs/*/*.log; do
  [ -f "$log" ] || continue
  pid=$(grep -o 'spawned pid=[0-9]*' "$log" 2>/dev/null | tail -1 | cut -d= -f2)
  [ -n "${pid:-}" ] || continue
  ps -p "$pid" >/dev/null 2>&1 || continue
  age=$(( now - $(stat -c %Y "$log") ))
  run=$(basename "$log" .log)
  if [ "$age" -gt "$SILENT_MAX" ]; then
    silent=$((silent + 1))
    printf 'МОЛЧИТ  %-34s pid=%-8s %s мин без записи в лог → СНЯТЬ И ПЕРЕЗАПУСТИТЬ\n' "$run" "$pid" "$((age / 60))"
  else
    alive=$((alive + 1))
    printf 'ok      %-34s pid=%-8s лог %sс назад\n' "$run" "$pid" "$age"
  fi
done
[ "$((alive + silent))" -gt 0 ] || echo "агентов нет ни одного"

echo "── очереди ────────────────────────────────────────────"
for q in "$ROOT"/runs/night-queue-*.txt; do
  [ -f "$q" ] || continue
  left=$(grep -vcE '^\s*(#|$)' "$q")
  printf '%-22s осталось строк: %s\n' "$(basename "$q" .txt)" "$left"
done

echo "── требует разбора ────────────────────────────────────"
open_items=$(grep -c '^- \[ \]' "$ROOT/runs/orch-wakeup.md" 2>/dev/null || echo 0)
echo "файл пробуждения: $open_items незакрытых"
[ "$open_items" = 0 ] || grep '^- \[ \]' "$ROOT/runs/orch-wakeup.md" | tail -3
inbox=$(wc -l < "$ROOT/runs/owner-inbox.md" 2>/dev/null || echo 0)
echo "почта владельца: $inbox строк"
q_open=$(grep -c '^- \[ \]' "$ROOT/runs/owner-questions.md" 2>/dev/null || echo 0)
echo "мои вопросы владельцу (не блокируют работу): $q_open"

echo "── ветка ──────────────────────────────────────────────"
git -C "$ROOT" log --oneline -1
behind=$(git -C "$ROOT" rev-list --count origin/feat/doctor-ui-rebuild..feat/doctor-ui-rebuild 2>/dev/null || echo '?')
echo "неопубликованных коммитов: $behind"

echo "── вердикт ────────────────────────────────────────────"
if [ "$silent" -gt 0 ]; then
  echo "ЕСТЬ МОЛЧУНЫ ($silent) — снять и перезапустить, это отказ, а не работа"
elif [ "$alive" -gt 0 ]; then
  echo "работа идёт: $alive агент(ов)"
else
  echo "РАБОТЫ НЕТ — запустить следующую строку очереди тиком конвейера:"
  echo "  bash tools/orch-queue-tick.sh <клон> runs/night-queue-<клон>.txt"
fi
