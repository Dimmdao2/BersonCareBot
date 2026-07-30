#!/usr/bin/env bash
# Будильник, который переживает сессию лида (владелец 31.07: «должен только пинать тебя на проверку агентов
# и поднимать если ты сам заглох»).
#
# Без блокирующих вопросов: крон не умеет отвечать на подтверждения, поэтому подъём идёт через порт агентов
# (node agent-run.mjs) — ровно так же, как это делает tools/orch-launch.sh, неинтерактивно.
#
#   1. Считает живых агентов. Кто-то работает — сторож молчит и выходит.
#   2. Агент жив, но лог не растёт дольше IDLE_MAX — снимает его и пишет строку в runs/orch-wakeup.md.
#   3. Живых нет — поднимает ЛИДА: прогон через порт с миссией «проверь агентов, разбери файл пробуждения,
#      запусти следующий пункт плана». Лид дальше работает по правилам репозитория и запускает воркеров портом.
#
# Защита от толпы: поднимает лида не чаще REVIVE_COOLDOWN и только если предыдущий лид уже не жив.
set -uo pipefail

ROOT=/home/dev/dev-projects/BersonCareBot
IDLE_MAX=${IDLE_MAX:-900}
REVIVE_COOLDOWN=${REVIVE_COOLDOWN:-1800}
WAKEUP="$ROOT/runs/orch-wakeup.md"
LEAD_LOG="$ROOT/runs/lead-revive.log"
LEAD_MISSION="$ROOT/runs/lead-revive-mission.md"
STAMP="$ROOT/runs/lead-revive.stamp"
PORT=/home/dev/brain/host-orch/agent-run.mjs
mkdir -p "$ROOT/runs"

live=0
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
      echo "- [ ] $run — снят сторожем $(date '+%F %H:%M'), лог не рос $((age / 60)) мин. Разобраться и перезапустить через порт. Лог: $log" >> "$WAKEUP"
    fi
  else
    live=$((live + 1))
  fi
done

now=$(date +%s)

# Живой лид в интерактивной сессии сам отмечается в runs/lead-alive.stamp каждым ходом.
# Пока метка свежая, поднимать второго лида нельзя — иначе два оркестратора топчут одну ветку.
alive_stamp=$(stat -c %Y "$ROOT/runs/lead-alive.stamp" 2>/dev/null || echo 0)
if [ $((now - alive_stamp)) -lt "${LEAD_ALIVE_MAX:-1200}" ]; then
  echo "$(date '+%F %T') лид в сессии жив (метка $((now - alive_stamp))с назад) — не вмешиваюсь" >> "$ROOT/runs/heartbeat.log"
  exit 0
fi

if [ "$live" -gt 0 ]; then
  echo "$(date '+%F %T') живых=$live — лида не поднимаю" >> "$ROOT/runs/heartbeat.log"
  exit 0
fi

lead_pid=$(grep -o 'spawned pid=[0-9]*' "$LEAD_LOG" 2>/dev/null | tail -1 | cut -d= -f2)
if [ -n "${lead_pid:-}" ] && ps -p "$lead_pid" >/dev/null 2>&1; then
  echo "$(date '+%F %T') лид уже поднят pid=$lead_pid" >> "$ROOT/runs/heartbeat.log"
  exit 0
fi

last=$(cat "$STAMP" 2>/dev/null || echo 0)
if [ $((now - last)) -lt "$REVIVE_COOLDOWN" ]; then
  echo "$(date '+%F %T') живых нет, пауза после прошлого подъёма" >> "$ROOT/runs/heartbeat.log"
  exit 0
fi
echo "$now" > "$STAMP"

echo "$(date '+%F %T') живых нет — поднимаю лида" >> "$ROOT/runs/heartbeat.log"
nohup node "$PORT" --provider claude --model claude-sonnet-5 --effort medium \
  --role worker --sandbox workspace-write --cwd "$ROOT" --run-id "lead-revive-$(date +%H%M)" \
  < "$LEAD_MISSION" > "$LEAD_LOG" 2>&1 &
