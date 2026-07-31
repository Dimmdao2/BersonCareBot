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
# Порог 15 минут при пинке раз в 10: один пропущенный удар — ещё не тревога, два подряд — уже отказ
# сессии, и тогда крон поднимает работу сам (схема владельца 31.07: «пинок пишет время, крон смотрит,
# если затянулось — поднимает»).
# Порог 1800, не 900 (правка 31.07 после ДВУХ ложных подъёмов за вечер). Живой лид отмечается каждым
# СВОИМ ХОДОМ, а ходы приходят по будильнику раз в 10-20 минут — при 900 достаточно одного длинного хода,
# чтобы сторож счёл сессию мёртвой и поднял ВТОРОГО лида на то же дерево. Оба раза второй лид молча
# правил тот же файл, что и первый. 1800 = два пропущенных удара будильника подряд, это уже отказ.
if [ $((now - alive_stamp)) -lt "${LEAD_ALIVE_MAX:-1800}" ]; then
  echo "$(date '+%F %T') лид в сессии жив (метка $((now - alive_stamp))с назад) — не вмешиваюсь" >> "$ROOT/runs/heartbeat.log"
  exit 0
fi

# TEST_FORCE=1 — проверочный режим: не смотреть на живых агентов, чтобы можно было доказать
# работу канала пробуждения, не убивая настоящую работу. В кроне никогда не выставляется.
if [ "${TEST_FORCE:-0}" != 1 ] && [ "$live" -gt 0 ]; then
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

# ── Проверка результативности подъёмов ───────────────────────────────────────────────────────────
# Ночь 31.07: сторож поднял лида 17 раз, все 17 не сделали НИЧЕГО (роль worker → джейл → клоны
# только на чтение), и об этом никто не узнал до утра. Поэтому: если подъём не дал ни одного нового
# коммита в ветке, считаем его пустым; два пустых подряд — эскалация владельцу, дальше молчать нельзя.
HEADFILE="$ROOT/runs/lead-revive.head"
FAILFILE="$ROOT/runs/lead-revive.empty"
head_now=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo none)
head_prev=$(cat "$HEADFILE" 2>/dev/null || echo none)
if [ "$head_prev" != none ] && [ "$head_now" = "$head_prev" ]; then
  empty=$(( $(cat "$FAILFILE" 2>/dev/null || echo 0) + 1 ))
  echo "$empty" > "$FAILFILE"
  if [ "$empty" -ge 2 ]; then
    # Владельцу отсюда НЕ пишем (его слова 31.07: «сторож должен пинать ТЕБЯ, а не писать мне»).
    # Пишем в файл пробуждения — его лид читает первым делом на каждом ходу и при подъёме.
    echo "- [ ] ⚠️ $empty подъёма подряд без единого нового коммита — конвейер не двигается, разобраться ПЕРВЫМ делом ($(date '+%F %H:%M')). Лог: runs/lead-revive.log" >> "$WAKEUP"
    echo 0 > "$FAILFILE"
  fi
else
  echo 0 > "$FAILFILE"
fi
echo "$head_now" > "$HEADFILE"

echo "$(date '+%F %T') живых нет — бужу сессию лида" >> "$ROOT/runs/heartbeat.log"

# Будим ИМЕННО ту сессию, в которой лид разговаривает с владельцем, а не новую (владелец 31.07:
# «крон не может оживить этот чат — нет, все остальные агенты почему-то делали»). Приём взят из
# /home/dev/brain/host-orch/devlead-poke.sh: порт умеет `--session <id>`, то есть продолжает
# существующий разговор со всей его памятью. Идентификатор лежит в runs/lead-session.id и
# обновляется самим лидом на каждом ходу.
SID=$(cat "$ROOT/runs/lead-session.id" 2>/dev/null | tr -d '[:space:]')
if [ -n "$SID" ]; then
  nohup node "$PORT" --provider claude --model claude-sonnet-5 --effort medium \
    --role dev-lead --sandbox workspace-write --cwd "$ROOT" --session "$SID" \
    --run-id "lead-wake-$(date +%H%M)" < "$ROOT/runs/ALARM.md" > "$LEAD_LOG" 2>&1 &
else
  # Запасной путь: идентификатора нет — поднимаем свежую сессию с полной миссией.
  nohup node "$PORT" --provider claude --model claude-sonnet-5 --effort medium \
    --role dev-lead --sandbox workspace-write --cwd "$ROOT" --run-id "lead-revive-$(date +%H%M)" \
    < "$LEAD_MISSION" > "$LEAD_LOG" 2>&1 &
fi
