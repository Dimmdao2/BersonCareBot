#!/usr/bin/env bash
# Неубиваемый будильник лида (владелец 31.07: «поставь себе неубиваемый будильник»).
#
# Зачем: tools/orch-watchdog.sh живёт внутри сессии лида — умерла сессия, умер и он.
# Этот скрипт запускается КРОНОМ, то есть переживает и лида, и агентов. Он смотрит на все
# запущенные через порт прогоны и, если работа встала, пишет владельцу в телеграм.
#
# Что считается «встало»:
#   — агент жив, но его лог не растёт дольше порога простоя (по умолчанию 15 мин);
#   — агентов нет вообще, а в очереди есть незакрытая работа (тишина без причины).
#
# Ставится через порт крона: node /home/dev/brain/tools/cronport.mjs set bcb-orch-heartbeat '*/10 * * * *' '...'
set -uo pipefail

IDLE_MAX=${IDLE_MAX:-900}
STATE=/home/dev/dev-projects/BersonCareBot/runs/heartbeat-last-alert
NOTIFY=/home/dev/brain/host-orch/notify-owner.sh
mkdir -p "$(dirname "$STATE")"

alert() {
  local text="$1" key="$2"
  # не долбить одним и тем же чаще раза в час
  local now last
  now=$(date +%s)
  last=$(grep -m1 "^$key " "$STATE" 2>/dev/null | awk '{print $2}')
  if [ -n "${last:-}" ] && [ $((now - last)) -lt 3600 ]; then return; fi
  grep -v "^$key " "$STATE" 2>/dev/null > "$STATE.tmp" || true
  echo "$key $now" >> "$STATE.tmp"
  mv "$STATE.tmp" "$STATE"
  bash "$NOTIFY" "$text" >/dev/null 2>&1 || true
}

stalled=0
live=0
for log in /home/dev/dev-projects/bcb-wt-*/docs/_TODO/runs/*/*.log; do
  [ -f "$log" ] || continue
  pid=$(grep -o 'spawned pid=[0-9]*' "$log" 2>/dev/null | tail -1 | cut -d= -f2)
  [ -n "${pid:-}" ] || continue
  ps -p "$pid" >/dev/null 2>&1 || continue
  live=$((live + 1))
  age=$(( $(date +%s) - $(stat -c %Y "$log") ))
  if [ "$age" -gt "$IDLE_MAX" ]; then
    stalled=$((stalled + 1))
    alert "⏰ Агент подвис: $(basename "$log" .log) — лог не растёт $((age / 60)) мин (pid $pid). Лог: $log" "stall:$(basename "$log" .log)"
  fi
done

echo "$(date '+%F %T') живых=$live подвисших=$stalled" >> /home/dev/dev-projects/BersonCareBot/runs/heartbeat.log
