#!/usr/bin/env bash
# ПУЛЬС: одна команда, показывающая правду о работе. Её вызывает лид на каждом ударе будильника.
#
# Владелец 31.07: «ты не тупишь типа "всё хорошо, агент не упал, просто он уже 40 минут молчит" —
# такого не допускать». Поэтому скрипт не говорит «жив», он говорит МОЛЧИТ и сколько минут.
# Живой процесс с непишущимся логом — это ОТКАЗ, а не норма.
#
#   ok       — лог растёт, работа идёт
#   МОЛЧИТ   — процесс есть, лог не растёт дольше порога: считать отказом, снимать и перезапускать
#   упал     — процесса нет, а работа не завершена штатно
#
# Использование: tools/orch-pulse.sh [порог_молчания_сек]   (по умолчанию 600)
set -uo pipefail
ROOT=/home/dev/dev-projects/BersonCareBot
SILENT_MAX=${1:-600}          # сколько секунд лог может не расти (это смерть порта)
IDLE_OUT_MAX=${IDLE_OUT_MAX:-900}  # сколько секунд модель может не выдавать вывод (это зависание провайдера)
now=$(date +%s)

echo "── ПУЛЬС $(date '+%F %H:%M') ─────────────────────────────"

alive=0; silent=0; dead=0
for log in /home/dev/dev-projects/bcb-wt-*/docs/_TODO/runs/*/*.log; do
  [ -f "$log" ] || continue
  pid=$(grep -o 'spawned pid=[0-9]*' "$log" 2>/dev/null | tail -1 | cut -d= -f2)
  [ -n "${pid:-}" ] || continue
  age=$(( now - $(stat -c %Y "$log") ))
  run=$(basename "$log" .log)
  # Процесса нет. Если в логе нет отметки штатного завершения — агент УПАЛ, и это надо видеть,
  # а не пропускать молча (владелец 31.07: «твои скрипты… не ловили мертвых»).
  if ! ps -p "$pid" >/dev/null 2>&1; then
    if ! grep -q '\[agent-run\] done' "$log" 2>/dev/null; then
      [ "$age" -lt 86400 ] || continue   # старьё старше суток не тревожит
      dead=$((dead + 1))
      printf 'УПАЛ    %-34s pid=%-8s процесса нет, штатного завершения в логе НЕТ → разобрать и перезапустить\n' "$run" "$pid"
    fi
    continue
  fi
  # Порт сам пишет сердцебиение каждые 30с, поэтому возраст файла ловит только смерть самого порта.
  # Настоящее молчание модели видно в его же строке: idle_s — сколько секунд агент не выдавал НИЧЕГО.
  # Это важно для Claude, который часто печатает результат одним куском в конце (вопрос владельца 31.07).
  idle=$(grep -o 'idle_s=[0-9]*' "$log" 2>/dev/null | tail -1 | cut -d= -f2)
  elapsed=$(grep -o 'elapsed_s=[0-9]*' "$log" 2>/dev/null | tail -1 | cut -d= -f2)
  if [ "$age" -gt "$SILENT_MAX" ]; then
    silent=$((silent + 1))
    printf 'МОЛЧИТ  %-34s pid=%-8s %s мин без записи в лог → СНЯТЬ И ПЕРЕЗАПУСТИТЬ\n' "$run" "$pid" "$((age / 60))"
  elif [ -n "${idle:-}" ] && [ "$idle" -gt "$IDLE_OUT_MAX" ]; then
    silent=$((silent + 1))
    printf 'ЗАВИС   %-34s pid=%-8s порт жив, но модель молчит %s мин (в работе %s мин) → СНЯТЬ И ПЕРЕЗАПУСТИТЬ\n' \
      "$run" "$pid" "$((idle / 60))" "$(( ${elapsed:-0} / 60 ))"
  else
    alive=$((alive + 1))
    printf 'ok      %-34s pid=%-8s лог %sс назад, модель молчит %sс\n' "$run" "$pid" "$age" "${idle:-0}"
  fi
done
[ "$((alive + silent + dead))" -gt 0 ] || echo "агентов нет ни одного"

echo "── очереди ────────────────────────────────────────────"
for q in "$ROOT"/runs/night-queue-*.txt; do
  [ -f "$q" ] || continue
  left=$(grep -vcE '^\s*(#|$)' "$q")
  printf '%-22s осталось строк: %s\n' "$(basename "$q" .txt)" "$left"
done

echo "── требует разбора ────────────────────────────────────"
open_items=$(grep -c '^- \[ \]' "$ROOT/runs/orch-wakeup.md" 2>/dev/null || echo 0)
echo "файл пробуждения: $open_items незакрытых"
[ "$open_items" = 0 ] || grep '^- \[ \]' "$ROOT/runs/orch-wakeup.md" | tail -3
inbox=$(wc -l < "$ROOT/runs/owner-inbox.md" 2>/dev/null || echo 0)
echo "почта владельца: $inbox строк"
q_open=$(grep -c '^- \[ \]' "$ROOT/runs/owner-questions.md" 2>/dev/null || echo 0)
echo "мои вопросы владельцу (не блокируют работу): $q_open"

echo "── ветка ──────────────────────────────────────────────"
git -C "$ROOT" log --oneline -1
behind=$(git -C "$ROOT" rev-list --count origin/feat/doctor-ui-rebuild..feat/doctor-ui-rebuild 2>/dev/null || echo '?')
echo "неопубликованных коммитов: $behind"

echo "── вердикт ────────────────────────────────────────────"
if [ "$silent" -gt 0 ] || [ "$dead" -gt 0 ]; then
  [ "$silent" = 0 ] || echo "ЕСТЬ МОЛЧУНЫ ($silent) — снять и перезапустить, это отказ, а не работа"
  [ "$dead" = 0 ] || echo "ЕСТЬ УПАВШИЕ ($dead) — разобрать лог и перезапустить строку очереди"
elif [ "$alive" -gt 0 ]; then
  echo "работа идёт: $alive агент(ов)"
else
  echo "РАБОТЫ НЕТ — запустить следующую строку очереди тиком конвейера:"
  echo "  bash tools/orch-queue-tick.sh <клон> runs/night-queue-<клон>.txt"
fi
