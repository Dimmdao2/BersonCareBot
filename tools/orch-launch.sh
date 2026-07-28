#!/usr/bin/env bash
# Порт запуска исполнителей и аудиторов. Мимо него агентов не запускать.
#
# Зачем: правила оркестрации (независимый аудит после каждого воркера, потолок агентов,
# актуальная база клона) лежали в AGENTS.md и docs/ORCHESTRATION_BINDINGS.md и всё равно
# нарушались — оркестратор их не перечитывал. Владелец 28.07: «если бы опирался на правила
# репо — оркестрация шла бы обязательно с аудированием». Поэтому правило переехало из памяти
# в дверь: скрипт ОТКАЗЫВАЕТ, если условия не выполнены.
#
# Использование:
#   tools/orch-launch.sh worker  <клон> <run-id> <модель> <effort> <файл-брифа> <слой-плана>
#   tools/orch-launch.sh auditor <клон> <run-id> <модель> <effort> <файл-брифа> <слой-плана>
#
#   <клон> — имя каталога рядом с репозиторием: bcb-wt-<имя> передаётся как <имя>.
#
# Проверки перед запуском (любая непройденная = отказ, exit 1):
#   1. Потолок одновременных агентов (AGENTS.md §24: ориентир 3).
#   2. Клон существует, дерево чистое и стоит РОВНО на текущей голове feat-ветки.
#   3. Бриф существует, непустой и содержит ссылку на план-файл (иначе исполнителю нечего сдавать).
#   4. Для worker: у предыдущего воркера того же клона зарегистрирован аудит в файле очереди
#      (ORCHESTRATION_BINDINGS.md:55 — самооценка исполнителя не засчитывается).
#   5. Аудитор запускается только read-only; воркер — только workspace-write.
set -euo pipefail

MAIN=/home/dev/dev-projects/BersonCareBot
FEAT=feat/doctor-ui-rebuild
QUEUE="$MAIN/docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md"
# Потолки разные по роли. Воркеров 4 — владелец 28.07: «воркеров можно в 4 ручья гнать (только тесты
# чтобы гнали по очереди)»; это поверх ориентира AGENTS.md §24 в 3. Сериализация тестов — не здесь,
# а мьютексом run-tests.sh, и требованием в брифе.
# Аудиторы только читают, конфликтовать им нечем — их 5. Владелец 28.07: «почему аудит идёт
# в ОДИН ПОТОК? уж тут то можно хоть в пять».
MAX_WORKERS=${ORCH_MAX_WORKERS:-4}
MAX_AUDITORS=${ORCH_MAX_AUDITORS:-5}
PORT=/home/dev/brain/host-orch/agent-run.mjs

die() { echo "ОТКАЗ: $*" >&2; exit 1; }

[ $# -eq 7 ] || die "нужно 7 аргументов, дано $#. Смотри шапку файла."
ROLE=$1 CLONE_NAME=$2 RUN_ID=$3 MODEL=$4 EFFORT=$5 BRIEF=$6 PLAN_SLICE=$7
CLONE="/home/dev/dev-projects/bcb-wt-$CLONE_NAME"

case "$ROLE" in
  worker)  SANDBOX=workspace-write ;;
  auditor) SANDBOX=read-only ;;
  *) die "роль должна быть worker или auditor, дано '$ROLE'" ;;
esac

# 1. Потолок агентов.
LIVE_W=$(ps -eo args | grep '[a]gent-run\.mjs' | grep -c -- '--role worker' || true)
LIVE_A=$(ps -eo args | grep '[a]gent-run\.mjs' | grep -c -- '--role auditor' || true)
if [ "$ROLE" = worker ]; then
  [ "$LIVE_W" -lt "$MAX_WORKERS" ] || die "уже $LIVE_W воркеров, потолок $MAX_WORKERS (AGENTS.md §24). В очередь, не веером."
  LIVE=$LIVE_W; CAP=$MAX_WORKERS
else
  [ "$LIVE_A" -lt "$MAX_AUDITORS" ] || die "уже $LIVE_A аудиторов, потолок $MAX_AUDITORS. В очередь."
  LIVE=$LIVE_A; CAP=$MAX_AUDITORS
fi

# 2. Клон: существует, чистый, на текущей голове feat.
[ -d "$CLONE/.git" ] || die "клон $CLONE не найден"
[ -z "$(git -C "$CLONE" status --porcelain)" ] || die "в клоне $CLONE есть незакоммиченное — салважни или сбрось перед запуском"
HEAD_MAIN=$(git -C "$MAIN" rev-parse "$FEAT")
HEAD_CLONE=$(git -C "$CLONE" rev-parse HEAD)
if [ "$HEAD_MAIN" != "$HEAD_CLONE" ]; then
  die "клон $CLONE_NAME на ${HEAD_CLONE:0:9}, а $FEAT на ${HEAD_MAIN:0:9}. Сначала:
    git -C $CLONE fetch $MAIN $FEAT && git -C $CLONE reset --hard FETCH_HEAD
  (аудит на устаревшем клоне 28.07 проверял код, которого там не было)"
fi

# 3. Бриф: есть, непустой, ссылается на план.
[ -s "$BRIEF" ] || die "бриф $BRIEF не найден или пуст"
grep -q "docs/_TODO/" "$BRIEF" || die "в брифе нет ссылки на план-файл в docs/_TODO/ — исполнителю нечего сдавать, аудитору нечего проверять (ORCHESTRATION_BINDINGS.md §{PROMPT_CONTEXT})"

# 4. Для воркера: предыдущая работа этого клона должна быть зарегистрирована в очереди аудита.
if [ "$ROLE" = worker ]; then
  PREV=$(git -C "$CLONE" log --oneline -1 --pretty=%h)
  if git -C "$MAIN" merge-base --is-ancestor "$PREV" "$FEAT" 2>/dev/null; then
    : # клон на общей истории — предыдущей несведённой работы нет
  else
    grep -q "$PREV" "$QUEUE" || die "коммит $PREV из клона $CLONE_NAME не сведён и не зарегистрирован в $QUEUE — сначала аудит, потом новая работа"
  fi
fi

# 5. Запуск. Лог рядом с брифом, run-id — в имени.
LOG="$(dirname "$BRIEF")/$RUN_ID.log"
echo "запуск: роль=$ROLE клон=$CLONE_NAME модель=$MODEL effort=$EFFORT слой=$PLAN_SLICE"
echo "  клон и feat совпадают на ${HEAD_MAIN:0:9}; агентов роли было $LIVE из $CAP; лог $LOG"
[ -z "${ORCH_DRY:-}" ] || { echo "  ORCH_DRY=1 — все проверки пройдены, агент НЕ запущен"; exit 0; }
nohup node "$PORT" --provider codex --model "$MODEL" --effort "$EFFORT" \
  --role "$ROLE" --sandbox "$SANDBOX" --cwd "$CLONE" --run-id "$RUN_ID" \
  < "$BRIEF" > "$LOG" 2>&1 &
echo "  pid=$!"
