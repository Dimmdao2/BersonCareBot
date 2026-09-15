# Независимая проверка Э1, круг 7: legacy `NULL` в organization-aware merge gate

Дата: 2026-09-15

Candidate: `wt/merge-org-gate` @ `f6ca09321`

Authority: `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18; этап Э1
`docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`.

Классификация по `AGENTS.md` §24.4: повторяемое поведение живого PostgreSQL; отсутствие остаточных строк после
`ROLLBACK` — разовая DB-интроспекция. Автоматический UI не применим и не запускался.

## Вердикт

_Будет зафиксирован после обязательных живых прогонов и fault injection._

## Проверки

_Команды и фактический вывод будут добавлены после каждого завершённого прогона._

