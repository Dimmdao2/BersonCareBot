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
#   3. Бриф существует и непустой. Продуктовая работа обязана ссылаться на план в docs/_TODO/; для
#      операционной (слить ветки, спасти коммит, CI) плана нет — запускай с ORCH_OPS="<причина>",
#      тогда authority = сам бриф (осознанно и логируемо), фейковый план не плодится.
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

# Владелец 28.07: «запускай аудиторов не в песочнице — это двойная работа и тупо».
# Причина, найденная в коде порта: роль `auditor` входит в READ_ONLY_ROLES
# (governor/host-sandbox.mjs:13), поэтому аудитору ПРИНУДИТЕЛЬНО ставится read-only-джейл
# независимо от того, что просит вызывающий. Джейл блокирует sudo, аудиторы не могли читать
# живую базу и честно ставили UNPROVEN — а перепроверял потом лид руками, то есть работа
# делалась дважды.
#
# Отсюда третья роль `auditor-live`: в порт уходит как worker (песочница пускает к базе), в
# потолках считается аудитором, а бриф ей ЗАПРЕЩАЕТ менять файлы. Гарантия не в песочнице, а в
# проверке после прогона: дерево клона обязано остаться чистым (напоминание печатается ниже).
ROLE_FOR_PORT="$ROLE"
case "$ROLE" in
  worker)       SANDBOX=workspace-write ;;
  auditor)      SANDBOX=read-only ;;
  auditor-live) SANDBOX=workspace-write; ROLE_FOR_PORT=worker ;;
  *) die "роль должна быть worker, auditor или auditor-live, дано '$ROLE'" ;;
esac

# 1. Потолок агентов.
LIVE_W=$(ps -eo args | grep '[a]gent-run\.mjs' | grep -c -- '--role worker' || true)
LIVE_A=$(ps -eo args | grep '[a]gent-run\.mjs' | grep -c -- '--role auditor' || true)
# auditor-live уходит в порт воркером, поэтому в счётчике воркеров он неотличим: считаем его
# аудитором консервативно — иначе один и тот же процесс не попадёт ни в один потолок.
[ "$ROLE" != auditor-live ] || LIVE_A=$((LIVE_A + LIVE_W))
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
# Клон обязан СОДЕРЖАТЬ голову feat. Равенства требовать нельзя: клон с невлитым фиксом
# опережает feat на свой коммит, и его как раз надо аудировать (гейт 28.07 это запрещал —
# ошибка конструкции, найденная на первом же аудите фиксов).
if ! git -C "$CLONE" merge-base --is-ancestor "$HEAD_MAIN" "$HEAD_CLONE" 2>/dev/null; then
  die "клон $CLONE_NAME на ${HEAD_CLONE:0:9} НЕ содержит голову $FEAT ${HEAD_MAIN:0:9}. Сначала:
    git -C $CLONE fetch $MAIN $FEAT && git -C $CLONE merge --no-edit FETCH_HEAD
  (аудит на устаревшем клоне 28.07 проверял код, которого там не было)"
fi
AHEAD=$(git -C "$CLONE" rev-list --count "$HEAD_MAIN".."$HEAD_CLONE")

# 3. Бриф: есть, непустой. Authority: для продуктовой работы — ссылка на план в docs/_TODO/; для
#    операционной (слить ветки, спасти коммит, прогнать CI) плана нет и не должно быть — тогда
#    authority = сам бриф, а ORCH_OPS="<причина>" делает выбор осознанным и логируемым.
#    Владелец 29.07: «orch-launch механически требует docs/_TODO/ — некорректное решение хорошей идеи»;
#    хорошая идея (без authority нечего сдавать/проверять) сохранена, но перестала плодить фейковые планы
#    на «подмести пол».
[ -s "$BRIEF" ] || die "бриф $BRIEF не найден или пуст"
if [ -n "${ORCH_OPS:-}" ]; then
  echo "  ops-режим: authority = сам бриф; причина: $ORCH_OPS (план docs/_TODO/ не требуется)"
else
  grep -q "docs/_TODO/" "$BRIEF" || die "в брифе нет ссылки на план-файл в docs/_TODO/ — исполнителю нечего сдавать, аудитору нечего проверять (ORCHESTRATION_BINDINGS.md §{PROMPT_CONTEXT}).
  Продуктовая работа обязана ссылаться на план. Операционная (слить ветки/спасти коммит/CI) — запускай с
  ORCH_OPS=\"<причина>\", тогда authority = сам бриф."
fi

# 4. Для воркера: предыдущая работа этого клона должна быть зарегистрирована в очереди аудита.
if [ "$ROLE" = worker ]; then
  # Смотрим на СОБСТВЕННЫЕ коммиты клона (без коммитов слияния — их в очереди быть не может,
  # они появляются, когда в клон подтягивают свежий feat). Каждый обязан быть зарегистрирован
  # в файле очереди: либо он уже сведён, либо у него есть строка с вердиктом аудита.
  UNREG=""
  for sha in $(git -C "$CLONE" rev-list --no-merges "$HEAD_MAIN".."$HEAD_CLONE" 2>/dev/null); do
    short=${sha:0:9}
    grep -q "$short" "$QUEUE" || UNREG="$UNREG $short"
  done
  [ -z "$UNREG" ] || die "в клоне $CLONE_NAME есть несведённые коммиты без записи в $QUEUE:$UNREG
  Сначала аудит и строка с вердиктом в очереди, потом новая работа."
fi

# 5. Запуск. Лог рядом с брифом, run-id — в имени.
LOG="$(dirname "$BRIEF")/$RUN_ID.log"
echo "запуск: роль=$ROLE клон=$CLONE_NAME провайдер=${ORCH_PROVIDER:-codex} модель=$MODEL effort=$EFFORT слой=$PLAN_SLICE"
echo "  клон содержит feat ${HEAD_MAIN:0:9}, своих коммитов сверху: $AHEAD; агентов роли было $LIVE из $CAP; лог $LOG"
[ -z "${ORCH_DRY:-}" ] || { echo "  ORCH_DRY=1 — все проверки пройдены, агент НЕ запущен"; exit 0; }
# Провайдер по умолчанию — codex (весь исполнительский поток идёт через него). Владелец 30.07 попросил
# аудит плана ДВУМЯ моделями, Sol и Opus, поэтому провайдер стал параметром: ORCH_PROVIDER=claude.
# Мимо порта всё равно ничего не запускается — гейты выше не зависят от провайдера.
PROVIDER=${ORCH_PROVIDER:-codex}
nohup node "$PORT" --provider "$PROVIDER" --model "$MODEL" --effort "$EFFORT" \
  --role "$ROLE_FOR_PORT" --sandbox "$SANDBOX" --cwd "$CLONE" --run-id "$RUN_ID" \
  < "$BRIEF" > "$LOG" 2>&1 &
echo "  pid=$!"
[ "$ROLE" != auditor-live ] || echo "  ⚠ auditor-live: после прогона проверить, что дерево клона осталось чистым"
