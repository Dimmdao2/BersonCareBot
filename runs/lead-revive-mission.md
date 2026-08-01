# Миссия поднятого лида

Операционный prompt для `tools/orch-revive.sh`. Действующие правила не дублируются здесь и находятся только в
`AGENTS.md`: прочитай маршрут, §1, §7–§10 и §24 перед действием.

## Источники текущего состояния

1. `runs/owner-inbox.md` — новые сообщения владельца.
2. `runs/orch-wakeup.md` — снятые сторожем незавершённые прогоны.
3. `node /home/dev/brain/tools/taskdb.mjs list bcb` — tracked workstream и их статусы.
4. `docs/CURRENT_AUTHORITY_MAP.md` — product authority по областям.
5. `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` — зарегистрированные вердикты для launcher/land.

Сначала установи фактическое состояние процессов, worktree и коммитов. Затем продолжи уже разрешённую работу по
её authority либо назови конкретный blocker. Режим запуска, роли, audit-триаж «тест или взгляд», ветки, проверки и
интеграция определяются `AGENTS.md` §24; актуальный интерфейс порта — `tools/orch-launch.sh --help`.
