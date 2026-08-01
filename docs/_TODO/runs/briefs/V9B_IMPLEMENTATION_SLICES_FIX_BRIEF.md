# В9б — docs-only fix исполнимой tenant-wall декомпозиции (#1081)

## Authority

- `AGENTS.md` §5, §10a, §24.
- `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`, В9б.
- Target `V9B_IMPLEMENTATION_SLICES.md` (`ff443a4a4`) и независимый FAIL-аудит `V9B_IMPLEMENTATION_SLICES_AUDIT_REPORT.md` (`a0426b51f`).

Источник оракула: `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md` В9б — «данные недостижимы без принципала» и «доказано прогоном, что маршрут без принципала не получает данных ни по одному пути».

## Задача

Один docs-only fix-round по семи уже названным findings; product/DB не трогать:

1. Довести closure до per-table contract для 10 FORCE + 29 capability/ACL + 9 global rows: table, current grants/roles, live callers, exact seam, implementing slice, adoption evidence, revoke land и конечный A1/TEST actor+verb oracle.
2. Включить существующий D1 writer `writeIdentityAndPreferencesDirect.ts`, `writePort.ts` и `integrator-login-public-identity-grants.sql`; выбрать exact pre-principal seam. Второй writer не строить, D10 prerequisite не является.
3. Разложить порядок на deployable expand → adopt → contract: сначала capability/EXECUTE, затем callers, только после этого direct revoke/FORCE.
4. Удалить постоянную quarantine relation и удаление unresolved booking rows: migration делает deterministic backfill и транзакционно abort-ится с reason counts при любой неоднозначности.
5. Все WAIT заменить на branch/SHA/path/test conditions. S01 пометить READY NOW; owner release/confirmation не требуется.
6. Generic `app_worker` заменить точной матрицей существующих operational roles/login memberships/functions/table verbs для disposable A1 и actual TEST.
7. Исправить helper на `app.current_org_id()` и назвать owner-column/predicate по каждой FORCE table.
8. Пересчитать число migrations после expand/adopt/contract; не сохранять «7» без доказанного file assignment.
9. Первый worker brief S01 сделать запускаемым сейчас с бронью нового номера только после reread доски.

## Запрещено

- Product code, миграции, DB/DEV/TEST/PROD, deploy, taskdb/checkbox closure.
- Новая quarantine/audit table, второй writer, broad worker role, ложный owner-gate, преждевременный revoke/FORCE.
- Удалять canonical `be_*`, `patient_bookings` или `appointment_records`.

## Acceptance

- Семь findings F1–F7 имеют однозначное закрытие в revised plan; 9 audit gates могут быть проверены бинарно.
- 10+29+9 rows представлены exact per-table matrix; S01 READY NOW; first brief запускаем.
- `git diff --check` green; worker коммитит revised plan и `V9B_IMPLEMENTATION_SLICES_FIX_REPORT.md`.
- После worker нужен один repeat docs-only audit тех же findings; product до PASS запрещён.
