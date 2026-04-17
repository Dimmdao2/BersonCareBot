# Stage 6: F-05 - Документация Stages 8-15 (вариант B)

Цель этапа: привести docs-контур Stages 8-15 к фактическому состоянию, закрыть открытые checklist-пункты и синхронизировать index/log/checklists.

## S6.T01 - README index к фактической структуре

**Цель:** убрать ссылки на несуществующие stage-файлы.

**Файлы:**

- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/README.md`

**Шаги:**

1. Сверить фактический список stage-документов.
2. Исправить index в README без фиктивных ссылок.
3. Добавить явную пометку для stage-summary, если stage-файл отсутствует.

**Тесты:** не требуются (док).

**Критерии готовности:**

- README не содержит битых stage-ссылок.

---

## S6.T02 - Восстановить минимальный stage-summary из логов

**Цель:** иметь минимальную документацию по Stages 8-15 даже без full stage-files.

**Файлы:**

- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md`
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CHECKLISTS.md`
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/AUDIT_STAGE_8_15.md`

**Шаги:**

1. Для каждого Stage 8-15 добавить summary-блок (scope, что сделано, evidence, SHA/CI).
2. Явно отметить unresolved места (если есть) без противоречия с readiness.
3. Привязать summary к проверяемым артефактам.

**Тесты:** не требуются (док).

**Критерии готовности:**

- по каждому stage 8-15 есть минимум: статус + evidence + ссылки на артефакты.

---

## S6.T03 - Закрыть online-safe gate

**Цель:** формально закрыть open пункт checklist по online-safe gate.

**Файлы:**

- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CHECKLISTS.md`
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CUTOVER_RUNBOOK.md`

**Шаги:**

1. Сформулировать условия закрытия gate.
2. Зафиксировать факт выполнения условий (или явную причину невозможности закрытия в этом цикле).
3. Синхронизировать статус между checklist и runbook.

**Тесты:** не требуются (док).

**Критерии готовности:**

- пункт `online-safe gate` переведен в закрытое/обоснованно заблокированное состояние консистентно во всех docs.

---

## S6.T04 - Закрыть SHA+CI traceability по Stage 8-15

**Цель:** закрыть open пункт по traceability.

**Файлы:**

- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md`
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CHECKLISTS.md`

**Шаги:**

1. Для каждого Stage 8-15 добавить final SHA и дату CI.
2. Проверить единый формат записей.
3. Снять противоречия между readiness statement и фактическим статусом checklist.

**Критерии готовности:**

- checklist-пункт `SHA+CI traceability` закрыт.

---

## S6.T05 - Финальная docs-синхронизация

**Цель:** сделать согласованным три источника: index, checklist, execution log.

**Шаги:**

1. Сверить все cross-reference ссылки.
2. Проверить, что stage status не противоречат друг другу.
3. Зафиксировать итог в `AGENT_EXECUTION_LOG.md`.

**Критерии готовности:**

- `README` + `CHECKLISTS` + `EXECUTION_LOG` согласованы.

---

## Audit Gate Stage 6 (обязательный)

`PASS` только если:

1. docs index не содержит несуществующих stage-файлов;
2. два открытых checklist-пункта закрыты и подтверждены;
3. execution log и checklist синхронизированы по статусам;
4. Composer 2 подтверждает docs audit без critical/major.
