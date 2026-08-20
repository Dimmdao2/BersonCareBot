#!/usr/bin/env bash
# Предпочтительный порт repo-work агентов с гейтами. Простой bounded spawn допустим напрямую;
# действующие правила выбора режима находятся только в AGENTS.md §24.
set -euo pipefail

MAIN=/home/dev/dev-projects/BersonCareBot
FEAT=feat/doctor-ui-rebuild
QUEUE="$MAIN/docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md"
# Общий host-cap; per-orchestrator limit задаёт AGENTS.md §24.3.
# Потолок 4, а не 8 (владелец, 20.08): «агентов тебе разрешаю максимум 4 — иначе ты не успеешь сводить».
# Ограничение не по железу, а по пропускной способности ведущего: результаты надо принимать и сводить.
MAX_AGENTS=${ORCH_MAX_AGENTS:-4}
PORT=/home/dev/brain/host-orch/agent-run.mjs

die() { echo "ОТКАЗ: $*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
tools/orch-launch.sh worker       <clone> <run-id> <model> <effort> <brief> <scope>
tools/orch-launch.sh auditor-live <clone> <run-id> <model> <effort> <brief> <scope>
tools/orch-launch.sh land         <clone> <branch>

This port is preferred for gated/stateful repo-work. Simple bounded work may use direct spawn.
Environment: ORCH_WAIT=1, ORCH_OPS="reason", ORCH_NO_TESTS="reason", ORCH_ISOLATE=1, ORCH_DRY=1.
Canon: AGENTS.md §24. Operational paths: docs/ORCHESTRATION_BINDINGS.md.
USAGE
}

[ "${1:-}" != "--help" ] && [ "${1:-}" != "-h" ] || { usage; exit 0; }

[ $# -ge 1 ] || die "нужна команда: worker, auditor-live или land. Смотри шапку файла."

# Команда land сливает принятую ветку в feat отдельно от worker/auditor-live;
# непроверенная ветка не приземляется.
if [ "$1" = land ]; then
  [ $# -eq 3 ] || die "land: нужно 2 аргумента <клон> <ветка>, дано $(( $# - 1 )). Смотри шапку файла."
  CLONE_NAME=$2
  BRANCH=$3
  CLONE="/home/dev/dev-projects/bcb-wt-$CLONE_NAME"
  [ -e "$CLONE/.git" ] || die "клон $CLONE_NAME не найден ($CLONE/.git отсутствует)"

  MAIN_BRANCH=$(git -C "$MAIN" symbolic-ref --short -q HEAD || true)
  [ "$MAIN_BRANCH" = "$FEAT" ] || die "главное дерево $MAIN сейчас не на $FEAT (на '$MAIN_BRANCH') — land мержит именно в $FEAT, переключи главное дерево сначала."
  [ -z "$(git -C "$MAIN" status --porcelain)" ] || die "дерево главного репо $MAIN грязное — land на грязном дереве не запускается, сначала закоммить или сбрось."

  git -C "$MAIN" fetch -q "$CLONE" "$BRANCH" 2>/dev/null || die "не удалось выкачать ветку $BRANCH из клона $CLONE_NAME"
  HEAD_FEAT=$(git -C "$MAIN" rev-parse "$FEAT")
  BRANCH_TIP=$(git -C "$MAIN" rev-parse FETCH_HEAD)
  # Свежесть ветки НЕ требуется: land делает настоящий merge --no-ff, git сводит расхождение сам.
  # Прежняя проверка «ветка содержит голову feat» создавала порочный круг: land требует строку вердикта
  # в очереди, а её коммит двигает голову feat — и ветка становилась устаревшей ровно в тот момент,
  # когда её делали пригодной к приземлению. Конфликт слияния остаётся законным отказом (см. ниже).
  if ! git -C "$MAIN" merge-base --is-ancestor "$HEAD_FEAT" "$BRANCH_TIP" 2>/dev/null; then
    echo "  ветка отстаёт от $FEAT — это нормально, сливаю через merge --no-ff; конфликт остановит land"
  fi

  UNREG=""
  for sha in $(git -C "$MAIN" rev-list --no-merges "$HEAD_FEAT".."$BRANCH_TIP" 2>/dev/null); do
    short=${sha:0:9}
    grep -q "$short" "$QUEUE" || UNREG="$UNREG $short"
  done
  [ -z "$UNREG" ] || die "в очереди $QUEUE нет строки с вердиктом по коммитам ветки $BRANCH:$UNREG
  Непроверенная ветка не приземляется — сначала независимый аудит и строка с вердиктом в очереди, потом land."

  echo "land: $BRANCH (${BRANCH_TIP:0:9}) содержит голову $FEAT, все коммиты зарегистрированы в очереди — сливаю."
  [ -z "${ORCH_DRY:-}" ] || { echo "  ORCH_DRY=1 — все проверки пройдены, слияние НЕ выполнено"; exit 0; }
  # ORCH_LAND=1 — единственный ключ от hook-а reference-transaction, который отказывает на ручном
  # `git merge` в feat мимо этого порта (tools/git-hooks/reference-transaction). Гейт вердикта выше
  # уже пройден, поэтому именно здесь слияние законно.
  ORCH_LAND=1 git -C "$MAIN" merge --no-ff "$BRANCH_TIP" -m "merge($CLONE_NAME): $BRANCH into $FEAT"
  MERGE_SHA=$(git -C "$MAIN" rev-parse HEAD)
  echo "готово: $FEAT теперь на ${MERGE_SHA:0:9}"
  echo "строка для очереди аудита: $BRANCH | ${MERGE_SHA:0:9}"
  exit 0
fi

[ $# -eq 7 ] || die "нужно 7 аргументов, дано $#. Смотри шапку файла."
ROLE=$1 CLONE_NAME=$2 RUN_ID=$3 MODEL=$4 EFFORT=$5 BRIEF=$6 SCOPE=$7
CLONE="/home/dev/dev-projects/bcb-wt-$CLONE_NAME"

# auditor-live имеет shell/write для inspection, временной fault injection и одноразовых acceptance-тестов.
case "$ROLE" in
  worker)       SANDBOX=workspace-write ;;
  auditor-live) SANDBOX=workspace-write ;;
  auditor) die "роль auditor убрана из порта: её песочница лишает shell/git, поэтому она не может надёжно
  выполнить ни inspection-команды, ни fault injection. Используй auditor-live и начни brief с классификации
  «тест или взгляд». Временные production-поломки откатываются; оставить можно только намеренные acceptance-тесты
  и audit-artifact, продуктовый fix аудитор не делает." ;;
  *) die "роль должна быть worker или auditor-live, дано '$ROLE'" ;;
esac

# Default trusted-full даёт доступ к dev env, но не поручает worker запускать сервер; live-проверка
# задаётся отдельным verify/auditor-live brief по AGENTS.md §24.3.
if [ -n "${ORCH_ISOLATE:-}" ]; then
  ROLE_FOR_PORT=worker
  echo "  ORCH_ISOLATE=1 — агент В bwrap-песочнице (worker); .env.dev будет занулён, живой приёмки не будет" >&2
else
  ROLE_FOR_PORT=dev-lead
  echo "  режим по умолчанию: БЕЗ песочницы (dev-lead/trusted-full) — виден .env.dev, полный доступ к хосту" >&2
fi

# 1. Потолок агентов — общий на все роли и все клоны, включая соседний сеанс: считаем ВСЕ живые
# процессы порта. Потолок общий именно потому, что ресурс общий — машина и база одни на всех.
LIVE=$(ps -eo args | grep -c '[a]gent-run\.mjs' || true)
CAP=$MAX_AGENTS
[ "$LIVE" -lt "$CAP" ] || die "уже $LIVE агентов, потолок $CAP суммарно на все роли и клоны (владелец 01.08). В очередь, не веером.
  Живые сейчас:
$(ps -eo args | grep '[a]gent-run\.mjs' | sed 's/.*--cwd /    /; s/ --run-id / · /')"

# 2. Клон: существует (обычный клон ИЛИ прилинкованный git worktree — у него .git файл, не
#    каталог, отсюда -e а не -d), чистый, содержит текущую голову feat.
[ -e "$CLONE/.git" ] || die "клон $CLONE не найден"
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

# 3. Бриф: есть, непустой. Для tracked workstream authority — существующий plan/checklist. Для любой bounded
#    работы без plan-файла authority = сам brief, а ORCH_OPS="<почему brief достаточен>" фиксирует выбор.
[ -s "$BRIEF" ] || die "бриф $BRIEF не найден или пуст"
grep -q "AGENTS.md" "$BRIEF" || die "в брифе нет AGENTS.md — агент не получил единственный канон правил"
if [ -n "${ORCH_OPS:-}" ]; then
  echo "  bounded-режим: authority = сам бриф; причина: $ORCH_OPS (plan-файл не требуется)"
else
  grep -q "docs/_TODO/" "$BRIEF" || die "в брифе нет ссылки на authority/checklist в docs/_TODO/ — исполнителю нечего сдавать, аудитору нечего проверять (AGENTS.md §24.2).
  Для tracked workstream добавь существующий plan. Для bounded-задачи без плана запускай с
  ORCH_OPS=\"<почему brief достаточен>\", тогда authority = сам brief."
fi

if [ "$ROLE" = auditor-live ]; then
  grep -qiE "тест или взгляд|test or view" "$BRIEF" || die "audit brief не начинается с классификации «Тест или взгляд» (AGENTS.md §24.4)"
fi

# (было 3a: проверка «бриф про поломки требует auditor-live, не auditor» — снята вместе с ролью
# auditor, М4 #1081. Условие проверяло ровно то, что теперь отсекается раньше самим `case` выше:
# роль `auditor` умирает при запуске, до этой строки просто не доходит.)

# 3b. AGENTS.md уже обязателен для любого брифа. Если воркер пишет тесты, бриф дополнительно называет
#     authority ожидаемого поведения. Для задачи без тестов причина фиксируется через ORCH_NO_TESTS.
if [ "$ROLE" = worker ] && [ -z "${ORCH_NO_TESTS:-}" ]; then
  grep -qE "Источник оракула|Строка плана, дающая оракул" "$BRIEF" || die "в брифе воркера нет строки «Источник оракула:» —
  Назови требование authority: «Источник оракула: <ссылка> — «<дословная цитата>»».
  Если задача действительно без тестов — запускай с ORCH_NO_TESTS=\"<причина>\"."
  ORACLE_BLOCK=$(awk '/Источник оракула|Строка плана, дающая оракул/{f=1} f{print; if ($0 ~ /^[[:space:]]*$/) exit}' "$BRIEF" | tr '\n' ' ')
  printf '%s' "$ORACLE_BLOCK" | grep -qE '«.+»' || die "в абзаце «Источник оракула» нет дословной цитаты authority в кавычках «…».
  Если задача без тестов — используй ORCH_NO_TESTS."
fi
if [ -n "${ORCH_NO_TESTS:-}" ]; then
  echo "  без-тестов-режим: $ORCH_NO_TESTS"
fi

# 4. Для воркера: предыдущая работа этого клона должна быть зарегистрирована в очереди аудита.
if [ "$ROLE" = worker ]; then
  # Смотрим на СОБСТВЕННЫЕ коммиты клона (без коммитов слияния — их в очереди быть не может,
  # они появляются, когда в клон подтягивают свежий feat). Каждый обязан быть зарегистрирован
  # в файле очереди: либо он уже сведён, либо у него есть строка с вердиктом аудита.
  UNREG=""
  NO_ARTIFACT=""
  for sha in $(git -C "$CLONE" rev-list --no-merges "$HEAD_MAIN".."$HEAD_CLONE" 2>/dev/null); do
    short=${sha:0:9}
    if ! grep -q "$short" "$QUEUE"; then
      UNREG="$UNREG $short"
      continue
    fi
    # 4b (М2, #1081). Коммит тестовой работы (конвенция репо: `test(scope): ...`, см. 35eb9159c,
    # 7a7b24c08, 55cdfc48e, c223fcd15) обязан иметь в СВОЕЙ строке очереди путь к отчёту поломок
    # (.md/.json) и число непойманного/убитых — иначе PASS/FAIL в очереди ничем не доказан
    # (владелец 31.07: «без тестов не принимается аудит», тот же принцип применён к самой записи
    # вердикта). Формат не изобретаю — тот же, что уже используют записи очереди
    # (NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md): путь к артефакту + число рядом со словом
    # непойман*/убит*.
    subject=$(git -C "$CLONE" log --format=%s -1 "$sha")
    if printf '%s' "$subject" | grep -qE '^test\('; then
      line=$(grep "$short" "$QUEUE")
      if ! printf '%s' "$line" | grep -qiE '[A-Za-z0-9_./-]+\.(md|json)'; then
        NO_ARTIFACT="$NO_ARTIFACT $short(нет-пути-к-отчёту)"
      elif ! printf '%s' "$line" | grep -qiE '[0-9]+[^0-9]{0,20}(непойман|убит)|(непойман|убит)[^0-9]{0,20}[0-9]+'; then
        NO_ARTIFACT="$NO_ARTIFACT $short(нет-числа-непойманного/убитых)"
      fi
    fi
  done
  [ -z "$UNREG" ] || die "в клоне $CLONE_NAME есть несведённые коммиты без записи в $QUEUE:$UNREG
  Сначала аудит и строка с вердиктом в очереди, потом новая работа."
  [ -z "$NO_ARTIFACT" ] || die "в клоне $CLONE_NAME тестовые коммиты (test(...)) зарегистрированы в $QUEUE,
  но их строка вердикта не называет путь к отчёту поломок (.md/.json) и/или число непойманного/убитых:$NO_ARTIFACT
  Формат — как уже пишется в $QUEUE, новый не изобретай. Допиши строку вердикта, потом новая работа."
fi

# Провайдер stateful repo-work по умолчанию; advisory/read-only spawn к этому порту не относится.
PROVIDER=${ORCH_PROVIDER:-claude}
# Провайдер и модель обязаны быть из одного семейства. Несовпадение раньше проявлялось только в логе
# уже запущенного агента (провайдер отвечал 400 «model is not supported») — то есть слот и запуск
# сгорали впустую. Здесь это отказ до старта, с внятной причиной, и его видно в ORCH_DRY.
case "$PROVIDER:$MODEL" in
  codex:claude-*|claude:gpt-*)
    echo "ОТКАЗ: провайдер $PROVIDER не обслуживает модель $MODEL — прогон сгорел бы на 400 от провайдера." >&2
    echo "  Либо ORCH_PROVIDER под модель, либо модель под провайдера." >&2
    exit 1 ;;
esac

# 5. Запуск. Лог рядом с брифом, run-id — в имени.
LOG="$(dirname "$BRIEF")/$RUN_ID.log"
echo "запуск: роль=$ROLE клон=$CLONE_NAME провайдер=$PROVIDER модель=$MODEL effort=$EFFORT scope=$SCOPE"
echo "  клон содержит feat ${HEAD_MAIN:0:9}, своих коммитов сверху: $AHEAD; агентов было $LIVE из $CAP; лог $LOG"
[ -z "${ORCH_DRY:-}" ] || { echo "  ORCH_DRY=1 — все проверки пройдены, агент НЕ запущен"; exit 0; }
# ORCH_JOB="worker|worker-hard|reviewer|reviewer-critical|explorer|mechanic" — канонический выбор модели и effort
# по карте `/home/dev/brain/docs/MODEL_TIERS.md`. Владелец 30.07: «у тебя же есть полный список решения когда и
# какого агента выбрать» — знание о цене и способностях живёт в одном месте, а не дублируется в каждом вызове.
# Если ORCH_JOB задан, модель и effort из аргументов ИГНОРИРУЮТСЯ (передавай в них job-имя дважды, для лога).
if [ -n "${ORCH_JOB:-}" ]; then
  MODEL_ARGS=(--job "$ORCH_JOB")
  echo "  job-режим: модель и effort выбирает канон по job=$ORCH_JOB (аргументы модели/effort игнорируются)"
else
  MODEL_ARGS=(--model "$MODEL" --effort "$EFFORT")
fi
# `setsid` уводит порт в СВОЮ сессию: иначе lifecycle-cleanup вызывающего shell шлёт SIGTERM всей
# процесс-группе, `host-agent-run.mjs` пробрасывает его дочернему `claude -p`, и живой прогон умирает
# с `exit 143` посреди работы. 03.08 так потеряны два прогона живой оплаты (43-я и 67-я минута), причём
# в логе реапера записей об этих убийствах нет — убивал не он. `nohup` тут не помогает: он глушит
# SIGHUP, а приходит SIGTERM.
# Преамбула к КАЖДОМУ брифу. Правило §24.2 записано в каноне и повторялось в брифах руками — за одну
# сессию 03.08 шесть прогонов всё равно закончили ход в ожидании фоновой сборки/CI/монитора, оставив
# работу незакоммиченной; она держалась только тем, что лид доставал её из дерева. Поэтому теперь порт
# подаёт это первым, что агент видит, а не полагается на автора брифа.
PREAMBLE=$(cat <<'PRE'
=== ОБЯЗАТЕЛЬНОЕ, ЧИТАЕТСЯ ПЕРВЫМ (AGENTS.md §24.2) ===
Ты работаешь ОДНИМ ходом. Следующего хода НЕ БУДЕТ: процесс печатает результат и завершается.

1. НИКОГДА не заканчивай ход в ожидании чего-либо: фоновой сборки, CI, монитора, уведомления, ответа
   платёжного шлюза. Никто тебя не разбудит. Долгие команды запускай на переднем плане и ДОЖДИСЬ их.
2. КОММИТЬ ДО КОНЦА ХОДА. Незакоммиченное дерево — потерянная работа: следующий land её сотрёт, а твой
   отчёт будет говорить «сделано». Коммит — последнее действие, не первое.
3. Отчёт без коммита не считается выполненной работой.
=== КОНЕЦ ОБЯЗАТЕЛЬНОЙ ЧАСТИ, ДАЛЬШЕ БРИФ ЗАДАЧИ ===

PRE
)
# Преамбула + бриф собираются в ОДИН файл и подаются перенаправлением. Конвейер здесь недопустим:
# 04.08 подача через `... | setsid node` убила прогон на 4-й минуте — setsid отвязывал только правую
# часть, левая (фидер) умирала с уборкой shell, закрывала stdin, и порт выходил, не успев записать
# даже run-record.
BRIEF_WITH_PREAMBLE=$(mktemp /tmp/orch-brief-XXXXXX.md)
{ printf '%s\n' "$PREAMBLE"; cat "$BRIEF"; } > "$BRIEF_WITH_PREAMBLE"
setsid nohup node "$PORT" --provider "$PROVIDER" "${MODEL_ARGS[@]}" \
  --role "$ROLE_FOR_PORT" --sandbox "$SANDBOX" --cwd "$CLONE" --run-id "$RUN_ID" \
  < "$BRIEF_WITH_PREAMBLE" > "$LOG" 2>&1 &
AGENT_PID=$!
echo "  pid=$AGENT_PID"
[ "$ROLE" != auditor-live ] || echo "  ⚠ auditor-live: проверить откат временных production-поломок; допустимы только намеренные test/audit artifacts"

# `nohup` защищает от SIGHUP обычного терминала, но не от lifecycle-cleanup короткоживущего
# automated exec-сеанса: тот удаляет оставшиеся дочерние процессы после выхода shell. Внешний
# bwrap порта запущен с --die-with-parent, поэтому вслед за agent-run исчезает и Codex, а run-state
# навсегда остаётся worker_running. Синхронный режим удерживает вызывающий сеанс до терминального
# состояния и сохраняет реальный код завершения порта.
if [ "${ORCH_WAIT:-}" = 1 ]; then
  echo "  ORCH_WAIT=1 — ждём завершения pid=$AGENT_PID"
  set +e
  wait "$AGENT_PID"
  AGENT_RC=$?
  set -e
  echo "  завершено: pid=$AGENT_PID rc=$AGENT_RC"
  exit "$AGENT_RC"
fi
