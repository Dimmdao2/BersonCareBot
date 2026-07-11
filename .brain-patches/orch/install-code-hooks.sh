#!/usr/bin/env bash
# orch/install-code-hooks.sh — устанавливает git post-commit хук в brain/bcb/storylama.
# Хук вызывает orch/code-pg-delta.sh в ФОНЕ (nohup) → коммит НЕ ждёт PG-индекса.
# Идемпотентно: при наличии post-commit добавляет строку только если её ещё нет.
set -euo pipefail
BRAIN=/home/dev/brain
BCB=/home/dev/dev-projects/BersonCareBot
STORYLAMA=/home/dev/dev-projects/storylama
DELTA="$BRAIN/orch/code-pg-delta.sh"

install_hook(){
  local rname="$1" rpath="$2"
  local hookfile="$rpath/.git/hooks/post-commit"
  local hookline="nohup bash $DELTA --repo ${rname}:${rpath} >> $BRAIN/runs/code-pg-delta.log 2>&1 &"

  if [ ! -f "$hookfile" ]; then
    printf '#!/usr/bin/env bash\n# code-pg-delta: инкрементальный PG-индекс на коммит\n%s\n' "$hookline" > "$hookfile"
    chmod +x "$hookfile"
    echo "install[$rname]: создан $hookfile"
  elif grep -qF "code-pg-delta" "$hookfile"; then
    echo "install[$rname]: hook уже есть в $hookfile — пропуск"
  else
    echo "" >> "$hookfile"
    echo "# code-pg-delta: инкрементальный PG-индекс на коммит" >> "$hookfile"
    echo "$hookline" >> "$hookfile"
    echo "install[$rname]: добавлена строка в $hookfile"
  fi
}

install_hook brain "$BRAIN"
install_hook bcb "$BCB"
install_hook storylama "$STORYLAMA"

echo ""
echo "Регистрация cronport fallback (каждые 5 мин):"
echo "  cd $BRAIN"
echo "  node tools/cronport.mjs set code-pg-delta '*/5 * * * *' \\"
echo "    'bash $BRAIN/orch/code-pg-delta.sh >> $BRAIN/runs/code-pg-delta.log 2>&1'"
