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

# 1b. Полоса оркестратора: один агент на всю полосу, а не на клон. Владелец 01.08: «новых не запускай
# больше чем одного». Потолок в порту общий на машину и соседний сеанс — он про ресурс; здесь про то,
# сколько ручьёв ведёт ОДИН оркестратор. Полоса задаётся списком её клонов в ORCH_LANE (через пробел);
# без переменной ограничение не действует, и чужие конвейеры работают как раньше.
if [ -n "${ORCH_LANE:-}" ]; then
  for lane_clone in $ORCH_LANE; do
    BUSY=$(ps -eo args | grep "[a]gent-run\.mjs.*bcb-wt-$lane_clone " | sed 's/.*--run-id //' | head -1)
    if [ -n "$BUSY" ]; then
      say "пропуск: в полосе занят клон $lane_clone ($BUSY) — полоса ведёт по одному агенту"
      exit 0
    fi
  done
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

# Гейты порта прогоняем ОТДЕЛЬНО и всухую. Зачем: в режиме ожидания (ORCH_WAIT=1) запуск держит
# скрипт до конца работы агента, и если помечать строку взятой ПОСЛЕ него, она час висит невзятой —
# следующий тик хватает её второй раз. Поэтому: сухой прогон гейтов → пометка → реальный запуск.
# Отказ гейта строку не расходует.
if ! OUT=$(ORCH_DRY=1 tools/orch-launch.sh "$ROLE" "$CLONE_NAME" "$RUN_ID" "$MODEL" "$EFFORT" "$BRIEF" "$SLICE" 2>&1); then
  say "ОТКАЗ порта (гейты): $OUT"
  # Отказ, который повторяется, ожиданием не лечится. Раньше такая строка висела первой в очереди и
  # каждые десять минут писала лиду одну и ту же жалобу: конвейер стоял, а выглядело как живая работа, и
  # настоящие сообщения тонули в повторах. Третий одинаковый отказ подряд откладывает строку —
  # очередь едет дальше, лид получает ОДНО сообщение и сам решает, чинить бриф или снять работу.
  STATE="$REPO/runs/.queue-refusals-$CLONE_NAME"
  PREV_ID=$(cut -d' ' -f1 "$STATE" 2>/dev/null || true)
  PREV_N=$(cut -d' ' -f2 "$STATE" 2>/dev/null || true)
  if [ "$PREV_ID" = "$RUN_ID" ] && [ -n "$PREV_N" ]; then N=$((PREV_N + 1)); else N=1; fi
  printf '%s %s\n' "$RUN_ID" "$N" > "$STATE"
  if [ "$N" -ge 3 ]; then
    REASON=$(printf '%s' "$OUT" | head -1)
    python3 - "$QUEUE" "$LINE" "$REASON" <<'PY'
import sys, time
q, line, reason = sys.argv[1], sys.argv[2], sys.argv[3]
stamp = '# отложено ' + time.strftime('%Y-%m-%d %H:%M') + ' (гейт отказал 3 раза: ' + reason + ') | '
out, done = [], False
for raw in open(q).read().split('\n'):
    if not done and raw == line and not raw.lstrip().startswith('#'):
        out.append(stamp + raw); done = True
    else:
        out.append(raw)
open(q, 'w').write('\n'.join(out))
PY
    rm -f "$STATE"
    say "ОТЛОЖЕНО $RUN_ID: третий одинаковый отказ подряд, строка снята с очереди"
    notify_lead "Конвейер $CLONE_NAME: $RUN_ID отложен — гейт отказал три раза подряд, ожидание не помогает. $REASON"
  else
    notify_lead "Конвейер $CLONE_NAME: порт отказал запускать $RUN_ID (отказ $N из 3). $OUT"
  fi
  exit 0
fi

# помечаем строку взятой ДО запуска, чтобы параллельный тик её не повторил
python3 - "$QUEUE" "$LINE" <<'PY'
import sys, time
q, line = sys.argv[1], sys.argv[2]
stamp = '# взято ' + time.strftime('%Y-%m-%d %H:%M') + ' | '
# Пометку ставим ТОЛЬКО на строку целиком и только если она ещё не помечена. Прежняя версия делала
# replace по подстроке и попадала ВНУТРЬ уже помеченной строки: на одной строке накапливалось четыре
# префикса «взято», а настоящая невзятая строка оставалась нетронутой и запускалась повторно
# (поймано 31.07 на очереди tariff).
out, done = [], False
for raw in open(q).read().split('\n'):
    if not done and raw == line and not raw.lstrip().startswith('#'):
        out.append(stamp + raw)
        done = True
    else:
        out.append(raw)
open(q, 'w').write('\n'.join(out))
PY

# ORCH_WAIT=1 (наследуется из окружения вызывающего) — скрипт держится до конца работы агента.
# Так его запускает ЛИД внутренней фоновой командой своей оболочки: харнесс сам поднимет лида в
# момент завершения, без опроса раз в десять минут (решение владельца 31.07). Крон вызывает тот же
# скрипт без флага — там ожидание не нужно и вредно.
if OUT=$(tools/orch-launch.sh "$ROLE" "$CLONE_NAME" "$RUN_ID" "$MODEL" "$EFFORT" "$BRIEF" "$SLICE" 2>&1); then
  say "ok: $OUT"
  echo "$OUT"
else
  RC=$?
  echo "$OUT"
  # Отказ гейта на РЕАЛЬНОМ запуске (агент не стартовал) — строку надо вернуть в очередь, иначе работа
  # теряется молча. Так и вышло 01.08: сухая проверка потолка прошла, а между ней и запуском слот занял
  # тик соседнего клона — строка осталась помеченной «взято», агент не стартовал, аудит пропал.
  if printf '%s' "$OUT" | grep -q 'ОТКАЗ:'; then
    python3 - "$QUEUE" "$LINE" <<'PY'
import sys
q, line = sys.argv[1], sys.argv[2]
src = open(q).read().split('\n')
out, done = [], False
for raw in src:
    if not done and raw.lstrip().startswith('# взято ') and raw.endswith(line):
        out.append(line)
        done = True
    else:
        out.append(raw)
open(q, 'w').write('\n'.join(out))
PY
    say "ОТКАЗ порта при запуске $RUN_ID — строка возвращена в очередь: $OUT"
    notify_lead "Конвейер $CLONE_NAME: порт отказал запускать $RUN_ID, строка возвращена в очередь. $OUT"
  else
    say "прогон $RUN_ID завершился ненулевым кодом ($RC): $OUT"
    notify_lead "Конвейер $CLONE_NAME: прогон $RUN_ID завершился с кодом $RC — разобрать лог."
  fi
fi
