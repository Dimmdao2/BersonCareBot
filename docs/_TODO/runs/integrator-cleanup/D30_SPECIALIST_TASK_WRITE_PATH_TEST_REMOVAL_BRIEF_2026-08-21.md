# D30 specialist-task write-path — correction brief (2026-08-21)

## Источник оракула

> «D36 - очень внимательно! Вы любите писать тесты и гейты там где это не надо и так что они не проверяют
> поведение а сторожат код или цифры» — владелец, 21.08.2026.

`AGENTS.md` §10a/§24.4; активный corrected brief:
`D30_SPECIALIST_TASK_WRITE_PATH_REPAIR_BRIEF_2026-08-21.md`.

## Единственная правка

Удалить из candidate-филиала файл
`deploy/postgres/privileges/specialist-tasks-staff-write.devDbProof.test.mjs` целиком. Он закрепляет ручную SQL-форму,
делает live `REVOKE`/`GRANT` вне rollback-only транзакции и создаёт постоянную тестовую машинерию для разовой
сверки грантов. Заменяющий тест, script, gate или fixture не создавать.

Не менять сам минимальный grant-fix в `relation-access.ts` и generated DEV/TEST artifacts. Не обращаться к БД,
не запускать deploy/full CI, не менять docs/plan/checklist. Выполнить `git diff --check`, явно застейджить только
удаляемый файл и закоммитить. Независимый аудитор после этого проверит diff и выполнит разовый rollback-only
named-DEV proof до landing.
