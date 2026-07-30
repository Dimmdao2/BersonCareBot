#!/usr/bin/env bash
# Будильник оркестратора: гарантированное пробуждение, даже если агент завис или умер молча.
#
# Зачем: порт запускает агента с `timeout: none`, а лид ждал его циклом `until ! ps -p <pid>`.
# Если агент подвисает (провайдер молчит, процесс жив), лид ждёт вечно и работа встаёт незаметно.
# Владелец 30.07: «поставь себе будильник, чтобы не сдохнуть, если умрёт агент».
#
# Использование:
#   tools/orch-watchdog.sh <pid> <лог> [дедлайн_сек] [порог_простоя_сек]
#
# Печатает РОВНО одну строку исхода и выходит:
#   DONE      — процесс завершился (нормальный путь; вердикт ищи в /home/dev/brain/runs/agent-port/<run>.json)
#   STALLED   — процесс жив, но лог не растёт дольше порога простоя → скорее всего подвис
#   DEADLINE  — процесс жив и лог растёт, но время вышло → решать лиду, ждать ещё или снимать
#   GONE      — процесса не было уже на старте
set -uo pipefail

PID=${1:?нужен pid}
LOG=${2:?нужен путь к логу}
DEADLINE=${3:-1800}
IDLE_MAX=${4:-600}

ps -p "$PID" >/dev/null 2>&1 || { echo "GONE pid=$PID"; exit 0; }

started=$SECONDS
last_size=-1
last_change=$SECONDS

while :; do
  if ! ps -p "$PID" >/dev/null 2>&1; then
    echo "DONE pid=$PID через $((SECONDS - started))с, лог $LOG"
    exit 0
  fi
  size=$(stat -c %s "$LOG" 2>/dev/null || echo 0)
  if [ "$size" != "$last_size" ]; then
    last_size=$size
    last_change=$SECONDS
  fi
  idle=$((SECONDS - last_change))
  if [ "$idle" -ge "$IDLE_MAX" ]; then
    echo "STALLED pid=$PID лог не растёт ${idle}с (порог ${IDLE_MAX}с), всего ждали $((SECONDS - started))с, лог $LOG"
    exit 0
  fi
  if [ $((SECONDS - started)) -ge "$DEADLINE" ]; then
    echo "DEADLINE pid=$PID жив, лог растёт, но вышло ${DEADLINE}с — решение лида, лог $LOG"
    exit 0
  fi
  sleep 20
done
