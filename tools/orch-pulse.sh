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
  #
  # ⛔ idle_s КАК ПРИЗНАК ЗАВИСАНИЯ НЕ РАБОТАЕТ — проверено 31.07 на живом прогоне. Порт запускает
  # claude с `--output-format json`, а тот отдаёт ВЕСЬ вывод одним куском в конце: stdout_bytes=0 и
  # idle_s == elapsed_s всю дорогу, у здорового агента тоже. Прежний детектор объявлял «ЗАВИС» каждый
  # работающий claude-воркер — ночью он бы вырезал всю живую работу. Это ровно тот случай, о котором
  # владелец спрашивал: «а что с claude, который вывод делает только в конце?».
  #
  # Настоящий признак жизни — РОСТ ПРОЦЕССОРНОГО ВРЕМЕНИ. Считаем по всему поддереву: у самих обёрток
  # bwrap время всегда ноль, работает только внук-claude (на этом я лично ошибся в замере 31.07).
  # Снимок обновляем ТОЛЬКО когда время выросло — иначе таймер простоя сбрасывался бы каждым пульсом.
  elapsed=$(grep -o 'elapsed_s=[0-9]*' "$log" 2>/dev/null | tail -1 | cut -d= -f2)
  cpu=$(python3 "$ROOT/tools/pulse-cpu.py" "$pid" 2>/dev/null || echo 0)
  snap="$ROOT/runs/pulse-cpu/$run.snap"
  mkdir -p "$(dirname "$snap")"
  read -r old_cpu old_at < <(cat "$snap" 2>/dev/null || echo "-1 $now")
  if [ "${old_cpu:--1}" = -1 ] || [ "$cpu" -gt "${old_cpu:-0}" ]; then
    echo "$cpu $now" > "$snap"
    stall=0
  else
    stall=$(( now - ${old_at:-$now} ))
  fi
  if [ "$age" -gt "$SILENT_MAX" ]; then
    silent=$((silent + 1))
    printf 'МОЛЧИТ  %-34s pid=%-8s %s мин без записи в лог → СНЯТЬ И ПЕРЕЗАПУСТИТЬ\n' "$run" "$pid" "$((age / 60))"
  elif [ "$stall" -gt "$IDLE_OUT_MAX" ]; then
    silent=$((silent + 1))
    printf 'ЗАВИС   %-34s pid=%-8s порт жив, но процессор не тратится %s мин (в работе %s мин, CPU %sс) → СНЯТЬ И ПЕРЕЗАПУСТИТЬ\n' \
      "$run" "$pid" "$((stall / 60))" "$(( ${elapsed:-0} / 60 ))" "$cpu"
  else
    alive=$((alive + 1))
    printf 'ok      %-34s pid=%-8s лог %sс назад, CPU %sс (простой %sс)\n' "$run" "$pid" "$age" "$cpu" "$stall"
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
