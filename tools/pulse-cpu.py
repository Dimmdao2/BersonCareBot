#!/usr/bin/env python3
"""Суммарное процессорное время поддерева процесса, в секундах.

Зачем отдельный инструмент: порт запускает claude через ДВЕ вложенные обёртки bwrap, и у самих
обёрток процессорное время всегда ноль — работает только внук. Замер по видимому pid поэтому врёт
нулём и выглядит как «агент мёртв» (31.07 я на этом ошибся лично). Считаем всё поддерево.
"""
import subprocess, sys


def subtree_cpu(root: int) -> float:
    out = subprocess.run(
        ["ps", "-eo", "pid=,ppid=,cputimes="], capture_output=True, text=True
    ).stdout
    kids: dict[int, list[int]] = {}
    cpu: dict[int, float] = {}
    for line in out.splitlines():
        parts = line.split()
        if len(parts) != 3:
            continue
        try:
            pid, ppid, secs = int(parts[0]), int(parts[1]), float(parts[2])
        except ValueError:
            continue
        kids.setdefault(ppid, []).append(pid)
        cpu[pid] = secs
    total, stack = 0.0, [root]
    seen = set()
    while stack:
        p = stack.pop()
        if p in seen:
            continue
        seen.add(p)
        total += cpu.get(p, 0.0)
        stack.extend(kids.get(p, []))
    return total


if __name__ == "__main__":
    print(f"{subtree_cpu(int(sys.argv[1])):.0f}")
