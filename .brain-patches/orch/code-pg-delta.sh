#!/usr/bin/env bash
# orch/code-pg-delta.sh — инкрементальный PG-индекс кода: ТОЛЬКО репо с новыми коммитами.
#
# РЕИСПОЛЬЗУЕТ: code-reindex.sh (change-guard по HEAD SHA) + code-index-pg.mjs (SHA-skip чанков).
# Эмбеддер :8766 сериализован/медленный — дельта чтобы НЕ грузить его полным прогоном в пик.
#
# КАК РАБОТАЕТ:
#   1. Для каждого репо сравнивает текущий HEAD с runs/code-pg-delta-<имя>.sha (прошлый индекс).
#   2. Если HEAD изменился → code-index-pg.mjs --repo <root> --no-embed (text-delta, секунды).
#      SHA-skip внутри пропускает файлы без изменений содержимого → чистая дельта по чанкам.
#   3. При успехе → быстрый вектор-добор для этого репо (code-embed-fill.mjs --repo <имя>)
#      под гейтом load и временным потолком. Если эмбеддер недоступен — пропуск (nightly добавит).
#   4. SHA сохраняется только при успехе текстового шага.
#
# ВЫЗОВ:
#   bash orch/code-pg-delta.sh                           — все репо (из cronport-fallback каждые 5 мин)
#   bash orch/code-pg-delta.sh --repo brain:/path        — один репо (из git post-commit hook)
#   bash orch/code-pg-delta.sh --force                   — игнорировать HEAD-guard (SHA-skip внутри остаётся)
#
# УСТАНОВКА CRONPORT (fallback, если hook не сработал):
#   cd /home/dev/brain
#   node tools/cronport.mjs set code-pg-delta '*/5 * * * *' \
#     'bash /home/dev/brain/orch/code-pg-delta.sh >> /home/dev/brain/runs/code-pg-delta.log 2>&1'
#
# Лог: runs/code-pg-delta.log. flock → один экземпляр одновременно.
set -uo pipefail
cd /home/dev/brain || exit 1
set -a; . secrets/storage.env; set +a
export EMBED_E5=1 EMBED_DIM=1024   # e5 passage:/query: — симметрия с codeq.mjs

LOG=runs/code-pg-delta.log
LOCK=runs/code-pg-delta.lock
# гейт вектор-добора: не грузить эмбеддер при высокой нагрузке
GATE_LOAD="${GATE_LOAD:-6.5}"
# потолок вектор-добора на весь прогон (сек): дельта коммита мала, 2 мин хватает
MAX_FILL_SECS="${MAX_FILL_SECS:-120}"
# чанков за один вектор-добор: дельта обычно 5-30 файлов → 80 чанков достаточно
FILL_LIMIT="${FILL_LIMIT:-80}"
# малый батч: :8766 сериализован — не грузим длинной очередью
FILL_BATCH="${FILL_BATCH:-4}"
# потолок на text-обход одного репо (SHA-skip делает его быстрым, timeout для страховки)
INDEX_TIMEOUT="${INDEX_TIMEOUT:-90}"

log(){ echo "$(date '+%F %T') $*" >> "$LOG"; }
exec 9>"$LOCK"; flock -n 9 || { log "delta: уже идёт — пропуск"; exit 0; }

# --- разобрать аргументы: --repo name:path | все три стандартных ----------------------
SINGLE_REPO_ARG=""
FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --repo)  shift; SINGLE_REPO_ARG="${1:-}"; shift;;
    --force) FORCE=1; shift;;
    *)       shift;;
  esac
done

declare -a REPO_NAMES
declare -A REPO_PATHS
if [ -n "$SINGLE_REPO_ARG" ]; then
  rn="${SINGLE_REPO_ARG%%:*}"; rp="${SINGLE_REPO_ARG#*:}"
  REPO_NAMES=("$rn"); REPO_PATHS["$rn"]="$rp"
else
  # те же 3 репо, что в code-reindex.sh и discoverRepos()
  REPO_NAMES=(brain bcb storylama)
  REPO_PATHS[brain]="/home/dev/brain"
  REPO_PATHS[bcb]="/home/dev/dev-projects/BersonCareBot"
  REPO_PATHS[storylama]="/home/dev/dev-projects/storylama"
fi

log "delta START repos=${REPO_NAMES[*]} force=$FORCE"
indexed_repos=()

# --- 1) текстовый переиндекс для репо с новыми коммитами ----------------------------
for rname in "${REPO_NAMES[@]}"; do
  rpath="${REPO_PATHS[$rname]}"
  SHA_FILE="runs/code-pg-delta-${rname}.sha"

  cur_sha=$(git -C "$rpath" rev-parse HEAD 2>/dev/null) || {
    log "ERR[$rname]: git rev-parse HEAD провалился — пропуск"
    continue
  }
  prev_sha=$(cat "$SHA_FILE" 2>/dev/null || echo "")

  if [ "$FORCE" = "0" ] && [ "$cur_sha" = "$prev_sha" ]; then
    log "delta[$rname]: HEAD=$cur_sha — без изменений, пропуск"
    continue
  fi

  if [ "$FORCE" = "0" ]; then
    log "delta[$rname]: HEAD ${prev_sha:-<first>}→${cur_sha} — текстовый переиндекс"
  else
    log "delta[$rname]: --force, HEAD=$cur_sha — переиндексируем"
  fi

  # code-index-pg.mjs --no-embed: быстрый обход (секунды), SHA-skip пропускает неизменённые файлы.
  # Только изменённые файлы получат новые чанки с embedding=NULL → code-embed-fill добирает вектора.
  if timeout "$INDEX_TIMEOUT" nice -n15 \
       node tools/code-index-pg.mjs --repo "$rpath" --repo-name "$rname" --no-embed >> "$LOG" 2>&1; then
    echo "$cur_sha" > "$SHA_FILE"
    indexed_repos+=("$rname")
    log "delta[$rname]: текст OK, sha=$cur_sha сохранён"
  else
    ir=$?
    [ "$ir" = "124" ] && log "delta[$rname]: TIMEOUT ${INDEX_TIMEOUT}s — sha НЕ сохранён, повторим позже" \
                      || log "delta[$rname]: text FAIL rc=$ir — sha НЕ сохранён"
  fi
done

if [ "${#indexed_repos[@]}" = "0" ]; then
  log "delta END: изменений не было"
  exit 0
fi

# --- 2) гейт вектор-добора: нагрузка + доступность эмбеддера -----------------------
load1=$(awk '{print $1}' /proc/loadavg)
if awk -v l="$load1" -v g="$GATE_LOAD" 'BEGIN{exit !(l+0 > g)}'; then
  log "delta: вектор-добор пропущен (load $load1 > $GATE_LOAD) — nightly добавит"
  exit 0
fi

if ! curl -sf --max-time 3 http://127.0.0.1:8766/health >/dev/null 2>&1; then
  log "delta: эмбеддер :8766 недоступен — пропуск вектор-добора, nightly добавит"
  exit 0
fi

# --- 3) вектор-добор для переиндексированных репо (под временным потолком) ----------
# code-embed-fill.mjs --repo <имя>: заливает ТОЛЬКО NULL-вектора данного репо (после
# text-индекса это будут только чанки изменённых в коммите файлов → истинная дельта).
fill_start=$(date +%s)
for rname in "${indexed_repos[@]}"; do
  now=$(date +%s)
  if [ $((now - fill_start)) -ge "$MAX_FILL_SECS" ]; then
    log "delta: достигнут MAX_FILL_SECS=$MAX_FILL_SECS — остаток добавит nightly"
    break
  fi
  log "delta[$rname]: вектор-добор --limit $FILL_LIMIT --batch $FILL_BATCH"
  nice -n19 ionice -c3 \
    node tools/code-embed-fill.mjs --repo "$rname" --limit "$FILL_LIMIT" --batch "$FILL_BATCH" >> "$LOG" 2>&1 \
    || log "delta[$rname]: вектор-добор rc≠0 (эмбеддер флапает?) — nightly добавит"
done

log "delta END indexed=${indexed_repos[*]}"
