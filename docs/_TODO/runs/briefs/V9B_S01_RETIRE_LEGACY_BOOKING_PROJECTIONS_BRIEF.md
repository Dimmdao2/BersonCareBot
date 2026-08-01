# В9б S01 — удалить пять legacy booking projections (#1081)

Прочитать `AGENTS.md`, особенно §1 migration board, §4a, §5, §9–§10 и §24. Authority:
`docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md`, строки S01 и `First-worker brief — S01` целиком.

## Последствие

Пять старых booking projection tables и `pgBranches` держат вторую модель записи рядом с каноническими `be_*`.
Пока они существуют, дальнейшая tenant-wall строится поверх двух источников и может закрыть не тот путь.

## База и миграция

Работать от актуального `wt/single-entry-integration`. Номер `0304` уже забронирован на общей доске именно под S01.
До создания файла перечитать строку брони; файл и шапка обязаны содержать
`-- TEMPORARY LOCAL MIGRATION NUMBER 0304`, окончательный номер подтверждает лид при integration land.

## Точный scope

Удалить ровно `booking_branch_services`, `booking_branches`, `booking_services`, `booking_specialists`, `branches`,
их FK/backrefs, `pgBranches` и его import/factory/returned DI property. Разрешены только:

- `apps/webapp/db/schema/{schema.ts,relations.ts}`;
- `apps/webapp/src/infra/repos/pgBranches.ts` (delete);
- `apps/webapp/src/app-layer/di/{buildAppDeps.ts,di.md}`;
- одна migration `0304_*` + journal;
- `docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs` и сгенерированный
  `deploy/postgres/p0-5b-grants.sql`;
- существующий grant smoke/evidence report и строка S01 status.

Источник оракула: V9б S01 — «Remove exactly five legacy booking projections/FKs/grants»; сохранить canonical `be_*`,
все `patient_bookings`/`appointment_records`, `stockQuotaCheck.ts`, `pgOrganizationInvites.ts`, D1 writer и D10.

Если exact census на свежем SHA показывает живого runtime consumer, остановиться с `path:symbol`; не возвращать таблицу
под другим именем и не строить RLS раньше S02–S05.

## Приёмка

Точный before/after census пяти declarations/callers; migration/journal sync; schema/typecheck; regenerate grant SQL
канонической командой и запустить existing grant smoke; raw-SQL gate и `git diff --check`. Поведенческий тест не
изобретать: это разовое удаление, доказательство — итоговая schema/caller/grant inspection. Коммитить только scope,
не пушить, DB/DEV/TEST/PROD не трогать.

