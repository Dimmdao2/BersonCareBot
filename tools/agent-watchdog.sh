#!/usr/bin/env bash
# Сторож АГЕНТОВ — и только агентов. Лида не поднимает никогда.
#
# Владелец 31.07: «удали сторожа который поднимает лида… оставь только своего сторожа. Я тебе говорил
# что фоновый лид сейчас вреден тк неконтролируемый».
#
# Прежний `tools/orch-revive.sh` делал ДВЕ разные вещи в одном файле: следил за зависшими агентами
# (полезно) и поднимал второго лида, когда сессия казалась мёртвой (вредно — за вечер 31.07 дважды
# поднял второго лида на ЖИВУЮ сессию, и тот молча правил те же файлы). Скрипт удалён, полезная
# половина живёт здесь отдельно и **не умеет запускать лида в принципе**: в нём нет вызова порта.
#
# Что делает:
#   1. Находит живых агентов по логам прогонов.
#   2. Если лог агента не растёт дольше IDLE_MAX — снимает его и пишет строку в файл пробуждения,
#      который лид разбирает на каждом ударе будильника.
#   3. Больше ничего. Ни запусков, ни решений.
set -uo pipefail

ROOT=/home/dev/dev-projects/BersonCareBot
IDLE_MAX=${IDLE_MAX:-900}
WAKEUP="$ROOT/runs/orch-wakeup.md"
HEARTBEAT="$ROOT/runs/heartbeat.log"
mkdir -p "$ROOT/runs"

live=0
stalled=0
for log in /home/dev/dev-projects/bcb-wt-*/docs/_TODO/runs/*/*.log; do
  [ -f "$log" ] || continue
  pid=$(grep -o 'spawned pid=[0-9]*' "$log" 2>/dev/null | tail -1 | cut -d= -f2)
  [ -n "${pid:-}" ] || continue
  ps -p "$pid" >/dev/null 2>&1 || continue
  age=$(( $(date +%s) - $(stat -c %Y "$log") ))
  if [ "$age" -gt "$IDLE_MAX" ]; then
    run=$(basename "$log" .log)
    if ! grep -q "^- \[ \] $run " "$WAKEUP" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      echo "- [ ] $run — снят сторожем $(date '+%F %H:%M'), лог не рос $((age / 60)) мин. Разобрать и перезапустить через порт. Лог: $log" >> "$WAKEUP"
      stalled=$((stalled + 1))
    fi
  else
    live=$((live + 1))
  fi
done

echo "$(date '+%F %T') агентов живо=$live, снято зависших=$stalled (лида не поднимаю — сторож этого не умеет)" >> "$HEARTBEAT"
