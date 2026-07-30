#!/usr/bin/env bash
# Будильник лида: будит ЛИДА, а не владельца (владелец 31.07: «мне не надо — надо тебе»).
#
# Живёт в кроне, поэтому переживает и сессию лида, и самих агентов. Что делает:
#   1. смотрит все прогоны, запущенные через порт;
#   2. если агент жив, но его лог не растёт дольше порога, — снимает его и пишет строку в файл пробуждения;
#   3. если живых агентов нет, а в файле пробуждения есть незакрытые строки — оставляет их лиду.
#
# Файл пробуждения `runs/orch-wakeup.md` — это то, что лид читает в начале хода: там список «что встало».
# Владельцу отсюда НИЧЕГО не пишется: его дёргают только люди, а не сторож.
set -uo pipefail

IDLE_MAX=${IDLE_MAX:-900}
ROOT=/home/dev/dev-projects/BersonCareBot
WAKEUP="$ROOT/runs/orch-wakeup.md"
mkdir -p "$ROOT/runs"

live=0; stalled=0
for log in /home/dev/dev-projects/bcb-wt-*/docs/_TODO/runs/*/*.log; do
  [ -f "$log" ] || continue
  pid=$(grep -o 'spawned pid=[0-9]*' "$log" 2>/dev/null | tail -1 | cut -d= -f2)
  [ -n "${pid:-}" ] || continue
  ps -p "$pid" >/dev/null 2>&1 || continue
  live=$((live + 1))
  age=$(( $(date +%s) - $(stat -c %Y "$log") ))
  [ "$age" -gt "$IDLE_MAX" ] || continue
  run=$(basename "$log" .log)
  grep -q "^- \[ \] $run " "$WAKEUP" 2>/dev/null && continue
  kill "$pid" 2>/dev/null
  stalled=$((stalled + 1))
  echo "- [ ] $run — снят сторожем $(date '+%F %H:%M'), лог не рос $((age / 60)) мин. Разобраться и перезапустить через порт. Лог: $log" >> "$WAKEUP"
done

echo "$(date '+%F %T') живых=$live снято=$stalled" >> "$ROOT/runs/heartbeat.log"
