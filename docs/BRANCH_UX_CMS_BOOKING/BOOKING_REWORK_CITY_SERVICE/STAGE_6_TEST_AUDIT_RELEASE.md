# Stage 6: Test, Audit, Release

Цель этапа: подтвердить корректность новой модели, закрыть аудит и подготовить безопасный релиз.

## S6.T01 - Добавить тест-матрицу e2e сценариев очной записи

**Файлы для создания:**
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/TEST_MATRIX.md`

**Шаги:**
1. Описать happy-path по городам Москва/СПб.
2. Описать негативные кейсы (нет услуги в филиале, неактивная связь, Rubitime 5xx).
3. Описать смешанные данные old/new после backfill.

**Тесты:** не требуются (документ-матрица).

**Критерии готовности:**
- Матрица покрывает API, UI, sync и data migration.

**Лог:** `S6.T01`.

---

## S6.T02 - Реализовать unit/integration тесты webapp v2

**Файлы для изменения:**
- tests в `apps/webapp/src/modules/patient-booking/*`
- tests в `apps/webapp/src/app/api/booking/*`
- tests для `booking-catalog` repos/services

**Шаги:**
1. Закрыть ветки логики v2.
2. Добавить regression для rollback при `slot_overlap`.
3. Добавить проверку dual-read mixed history.

**Критерии готовности:**
- Все ключевые ветки v2 покрыты тестами.

**Лог:** `S6.T02`.

---

## S6.T03 - Реализовать unit/integration тесты integrator v2

**Файлы для изменения:**
- `apps/integrator/src/integrations/rubitime/*.test.ts`

**Шаги:**
1. Тесты `slots/create` на explicit IDs.
2. Тесты валидации контрактов.
3. Тесты fallback-режима legacy (если временно оставлен).

**Критерии готовности:**
- Integrator test suite подтверждает v2 behavior.

**Лог:** `S6.T03`.

---

## S6.T04 - Провести аудит этапов и закрыть замечания

**Файлы для создания:**
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/AUDIT_STAGE_2_6.md`

**Шаги:**
1. Code review по diff этапов 2-6.
2. Проверка соответствия `MIGRATION_CONTRACT_V2.md` и `API_CONTRACT_V2.md`.
3. Фиксация замечаний severity: critical/major/minor.
4. Повторный аудит после rework.

**Критерии готовности:**
- Финальный статус: `approve`.

**Лог:** `S6.T04`.

---

## S6.T05 - Финальный pre-release check

**Файлы для изменения:**
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md`
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CHECKLISTS.md`

**Шаги:**
1. Заполнить итоговые статусы задач.
2. Пройти release checklist.
3. Прогнать `pnpm run ci`.
4. Зафиксировать итог `ready/not-ready` и blockers.

**Критерии готовности:**
- Чек-лист релиза полностью отмечен.
- CI green.

**Лог:** `S6.T05`.
