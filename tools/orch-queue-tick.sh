#!/usr/bin/env bash
# Будильник-пинок: детерминированный конвейер запусков для одного клона.
#
# Зачем: владелец 30.07 — «я же тебе говорил поставь будильник себе который пинает… написал мне
# ночью "запускаю дальше, не жду" — и сдох». Ход лида живёт, пока лид вызывает инструменты; если он
# закончил ход без висящего наблюдателя, работа встаёт молча и до утра. Дисциплина лида — не механизм.
# Этот скрипт и есть механизм: крон дергает его, он сам берёт следующую строку очереди и запускает.
#
# Использование (обычно из крона):
#   tools/orch-queue-tick.sh <клон> <файл-очереди>
#
# Формат очереди — по одной работе в строке, поля через |, пустые строки и # игнорируются:
#   роль|модель|effort|путь-к-брифу|слой-плана|run-id
# Пример:
#   worker|gpt-5.6-terra|high|docs/_TODO/runs/x/BRIEF.md|PLAN этап 5|worker-x-0730
#
# Правила, которые скрипт соблюдает механически:
#   1. Никогда не запускает второго агента на тот же клон — сначала проверяет, что живых нет.
#   2. Никогда не запускает на грязном дереве — иначе затрёт незакоммиченную работу.
#   3. Запускает ТОЛЬКО через tools/orch-launch.sh, то есть все его гейты остаются в силе
#      (потолок агентов, свежесть клона, ссылка на план, зарегистрированный аудит предыдущего).
#   4. Взятую строку помечает выполненной в самой очереди (префикс `# взято <дата>`), чтобы повторный
#      тик не запустил её второй раз.
#   5. Если очередь пуста или гейт отказал — пишет строку в лог и уведомляет владельца, а не молчит.
set -uo pipefail

REPO=/home/dev/dev-projects/BersonCareBot
CLONE_NAME=${1:?нужен клон}
QUEUE=${2:?нужен файл очереди}
LOG="$REPO/runs/orch-queue-$CLONE_NAME.log"
# Владельцу конвейер НЕ пишет (решение владельца 31.07): всё уходит в файл пробуждения лида.
WAKEUP="$REPO/runs/orch-wakeup.md"
notify_lead() { printf -- "- [ ] %s (%s)\n" "$1" "$(date "+%F %H:%M")" >> "$WAKEUP"; }

mkdir -p "$(dirname "$LOG")"
say() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M')" "$*" >> "$LOG"; }

cd "$REPO" || exit 1
[ -f "$QUEUE" ] || { say "очереди нет: $QUEUE"; exit 0; }

# 1. Уже кто-то работает на этом клоне?
if ps -eo args | grep -q "[a]gent-run\.mjs.*bcb-wt-$CLONE_NAME"; then
  say "пропуск: на клоне $CLONE_NAME уже работает агент"
  exit 0
fi

CLONE="/home/dev/dev-projects/bcb-wt-$CLONE_NAME"
# 2. Дерево клона чистое?
if [ -n "$(git -C "$CLONE" status --porcelain 2>/dev/null)" ]; then
  say "СТОП: дерево $CLONE грязное — нужен салваж лидом, автозапуск запрещён"
  notify_lead "Конвейер $CLONE_NAME остановлен: в клоне незакоммиченная работа, нужен салваж."
  exit 0
fi

# 3. Следующая невзятая строка.
LINE=$(grep -vE '^\s*(#|$)' "$QUEUE" | head -1 || true)
if [ -z "$LINE" ]; then
  say "очередь пуста"
  exit 0
fi

IFS='|' read -r ROLE MODEL EFFORT BRIEF SLICE RUN_ID <<< "$LINE"
[ -n "${RUN_ID:-}" ] || { say "битая строка очереди: $LINE"; exit 0; }

# 4. Клон обязан содержать свежую голову feat — подтягиваем сами, это безопасно на чистом дереве.
git -C "$CLONE" fetch -q "$REPO" feat/doctor-ui-rebuild 2>>"$LOG" || true
git -C "$CLONE" merge -q --no-edit FETCH_HEAD 2>>"$LOG" || {
  say "СТОП: слияние свежего feat в $CLONE не прошло — конфликт, нужен лид"
  notify_lead "Конвейер $CLONE_NAME остановлен: конфликт при вливании свежего feat в клон."
  exit 0
}

# 5. Запуск через порт. Его отказ — это нормальный исход, а не авария: значит гейт не пройден.
# Провайдер выводится из имени модели: claude-* идёт через провайдера claude, остальное — codex.
# Без этого строка очереди с claude-sonnet-5 уходила в codex и падала как blocked_system (31.07).
case "$MODEL" in
  claude-*) export ORCH_PROVIDER=claude ;;
  *) unset ORCH_PROVIDER ;;
esac
say "запуск $RUN_ID ($ROLE, ${ORCH_PROVIDER:-codex}/$MODEL/$EFFORT) по брифу $BRIEF"
if OUT=$(tools/orch-launch.sh "$ROLE" "$CLONE_NAME" "$RUN_ID" "$MODEL" "$EFFORT" "$BRIEF" "$SLICE" 2>&1); then
  say "ok: $OUT"
  # помечаем строку взятой, чтобы следующий тик её не повторил
  python3 - "$QUEUE" "$LINE" <<'PY'
import sys
q, line = sys.argv[1], sys.argv[2]
src = open(q).read()
open(q, 'w').write(src.replace(line, '# взято ' + __import__('time').strftime('%Y-%m-%d %H:%M') + ' | ' + line, 1))
PY
else
  say "ОТКАЗ порта: $OUT"
  notify_lead "Конвейер $CLONE_NAME: порт отказал запускать $RUN_ID. $OUT"
fi
