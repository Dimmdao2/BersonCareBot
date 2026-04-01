# Stage 1: Spec And Contracts

Цель этапа: зафиксировать новую предметную модель и API-контракты до начала миграций и кода.

## S1.T01 - Обновить booking-спеку под city+service

**Цель:** заменить legacy `city+category` для очной записи на `city+service`.

**Предусловия:**
- Согласована бизнес-логика очного потока.

**Файлы:**
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_MODULE_SPEC.md`

**Шаги:**
1. Добавить отдельный раздел "In-person v2".
2. Зафиксировать пользовательский flow: город -> услуга -> слот.
3. Зафиксировать, что online не включен в этот этап.
4. Указать обязательный payload в integrator: `rubitimeBranchId`, `rubitimeCooperatorId`, `rubitimeServiceId`, `slotStart`.

**Тесты:** не требуются (документация).

**Критерии готовности:**
- В спеке нет требования `category` для очного v2.
- Есть section "non-goals" про online.

**Лог:** запись в `EXECUTION_LOG.md` под ID `S1.T01`.

---

## S1.T02 - Переписать декомпозицию Фазы 2

**Цель:** синхронизировать рабочую декомпозицию с новой архитектурой.

**Файлы:**
- `docs/BRANCH_UX_CMS_BOOKING/PHASE_2_TASKS.md`

**Шаги:**
1. Заменить блоки 2.A-2.C на 2.A-2.E из нового подхода.
2. Убрать задачи, где integrator сам резолвит `category/city`.
3. Добавить отдельные блоки на migration/cutover/compat.
4. Для каждой задачи добавить `files + tests + done criteria`.

**Тесты:** не требуются (документация).

**Критерии готовности:**
- Все задачи атомарны (1-4 файла).
- У каждой задачи есть проверяемый output.

**Лог:** `S1.T02`.

---

## S1.T03 - Зафиксировать API contract v2 (webapp <-> integrator)

**Цель:** убрать двусмысленность request/response до имплементации.

**Файлы для создания:**
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/API_CONTRACT_V2.md`

**Шаги:**
1. Описать `POST /api/bersoncare/rubitime/slots` v2 body.
2. Описать `POST /api/bersoncare/rubitime/create-record` v2 body.
3. Дать примеры ошибок (`slots_mapping_not_configured` больше не используется для in-person v2).
4. Зафиксировать backward compatibility policy.

**Тесты:** не требуются (документация).

**Критерии готовности:**
- Контракт покрывает success/error cases.
- Нет ссылок на `category` для очного v2.

**Лог:** `S1.T03`.

---

## S1.T04 - Зафиксировать migration contract v2

**Цель:** зафиксировать точные SQL-сущности до написания миграций.

**Файлы для создания:**
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/MIGRATION_CONTRACT_V2.md`

**Шаги:**
1. Описать таблицы `booking_cities`, `booking_branches`, `booking_specialists`, `booking_services`, `booking_branch_services`.
2. Описать изменения `patient_bookings` (новые FK + snapshot fields).
3. Описать индексы и constraints.
4. Описать порядок apply/rollback.

**Тесты:** не требуются (документация).

**Критерии готовности:**
- Есть полный DDL-план с nullable/non-null.
- Есть отдельный раздел "cutover-safe sequence".

**Лог:** `S1.T04`.

---

## S1.T05 - Зафиксировать seed mapping для Точки Здоровья

**Цель:** подготовить машиночитаемую основу для seed.

**Файлы для создания:**
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/SEED_MAPPING_TOCHKA_ZDOROVYA.md`

**Шаги:**
1. Выписать сущности city/branch/specialist/service.
2. Для каждой связи branch-service указать rubitime IDs.
3. Отметить обязательные поля, которые еще не подтверждены (если есть).
4. Определить fallback policy для отсутствующих ID (миграция должна падать, не молча пропускать).

**Тесты:** не требуются (документация).

**Критерии готовности:**
- Seed mapping полностью соответствует `FUTURE_SETTINGS_TOCHKA_ZDOROVYA.md`.
- Отсутствуют неявные поля.

**Лог:** `S1.T05`.
