#!/usr/bin/env bash
# Запуск рабочего агента НАПРЯМУЮ через CLI (владелец 04.08: «запускай напрямую через cli»),
# с ГАРАНТИЕЙ, что его работа не пропадёт.
#
# Зачем эта обёртка (04.08): агенты трижды за ночь завершались, доведя работу до конца, но НЕ сделав
# коммит и НЕ напечатав результат — лог оставался пустым, а правки висели в worktree. Лид спасал их
# вручную; один раз это заметили только через сорок минут. Причина завершения не установлена (реапер
# исключён — он ловит только процессы порта; OOM в журнале нет; setsid отрабатывает, каждый агент в своей
# сессии). Поэтому лечим не причину, а УЩЕРБ: что бы ни случилось с процессом, незакоммиченных правок
# после него не остаётся.
#
# Механика: агент запускается внутри сторожевой оболочки. Когда процесс агента завершается ЛЮБЫМ способом
# — успех, падение, сигнал — оболочка коммитит всё, что он успел изменить, и дописывает в лог код выхода.
# stdout и stderr разведены: пустой stdout при непустом stderr сразу показывает, что агент умер, а не
# «просто ничего не сделал».
#
# Использование:
#   tools/agent-direct.sh <worktree> <файл-брифа> <имя-прогона> [модель] [effort]

set -uo pipefail

WORKTREE="${1:?worktree path required}"
BRIEF="${2:?brief file required}"
NAME="${3:?run name required}"
MODEL="${4:-claude-sonnet-5}"
EFFORT="${5:-high}"

[ -d "$WORKTREE" ] || { echo "no such worktree: $WORKTREE" >&2; exit 1; }
[ -f "$BRIEF" ] || { echo "no such brief: $BRIEF" >&2; exit 1; }

LOGDIR="${AGENT_LOG_DIR:-/tmp/bcb-agent-logs}"
mkdir -p "$LOGDIR"
OUT="$LOGDIR/$NAME.log"
ERR="$LOGDIR/$NAME.err"

BRIEF_TEXT="$(cat "$BRIEF")"

setsid nohup bash -c '
  worktree="$1"; out="$2"; err="$3"; name="$4"; model="$5"; effort="$6"; brief="$7"

  cd "$worktree" || exit 1
  claude -p --dangerously-skip-permissions --output-format json \
    --model "$model" --effort "$effort" "$brief" > "$out" 2> "$err"
  rc=$?

  # Сторож: что бы ни вернул агент, его правки НЕ остаются несохранёнными.
  cd "$worktree" || exit $rc
  if [ -n "$(git status --short 2>/dev/null)" ]; then
    git add -A
    git commit -q -m "wip($name): saved by the agent-direct watchdog, agent exited rc=$rc without committing

The agent process ended without making its own commit. This snapshot is whatever it had written at that
moment — it is NOT a finished pass and must not be read as one. See $out / $err for how the turn ended.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>" 2>/dev/null
    echo "WATCHDOG=committed" >> "$out"
  else
    echo "WATCHDOG=clean" >> "$out"
  fi
  echo "EXIT=$rc" >> "$out"
' _ "$WORKTREE" "$OUT" "$ERR" "$NAME" "$MODEL" "$EFFORT" "$BRIEF_TEXT" < /dev/null > /dev/null 2>&1 &

echo "launched: $NAME  worktree=$WORKTREE"
echo "  stdout: $OUT"
echo "  stderr: $ERR"
