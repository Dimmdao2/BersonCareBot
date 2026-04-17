# Stage 2: F-04 - Полная compat-синхронизация и provenance

Цель этапа: убрать деградацию compat-строк, внедрить реальный `branch_service_id` lookup и сохранять происхождение изменения.

## S2.T01 - Зафиксировать контракт "full compat"

**Цель:** синхронизировать DoD и фактическую реализацию.

**Файлы:**

- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/COMPATIBILITY_RUBITIME_WEBAPP.md`
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CHECKLISTS.md`

**Шаги:**

1. Явно описать обязательные поля для full compat.
2. Зафиксировать недопустимость `fake full` без реального lookup.
3. Уточнить критерии `compat_quality`.

**Тесты:** не требуются (контракт/док).

**Критерии готовности:**

- DoD full совпадает с реализацией и gate-критериями.

---

## S2.T02 - Реализовать lookup `branch_service_id`

**Цель:** заполнять `branch_service_id` по реальным Rubitime identifiers.

**Файлы:**

- `apps/webapp/src/infra/repos/pgPatientBookings.ts`
- `apps/webapp/src/modules/integrator/events.ts`
- `apps/integrator/src/integrations/rubitime/connector.ts`

**Шаги:**

1. Построить deterministic lookup по `rubitime_branch_id + rubitime_service_id (+ rubitime_cooperator_id при наличии)`.
2. Заполнять `branch_service_id` и snapshot-поля в compat-path.
3. Явно логировать `lookup_miss` без ложного success.

**Тесты:**

- [ ] compat create with full lookup.
- [ ] compat update with same rubitime_id (no duplicate).
- [ ] lookup miss classification.

**Критерии готовности:**

- новые compat-строки создаются без деградации при доступном mapping.

---

## S2.T03 - Добавить provenance хранения

**Цель:** хранить происхождение создания/изменения записи.

**Файлы:**

- `apps/webapp/migrations/*`
- `apps/webapp/src/modules/*`
- `apps/webapp/src/infra/repos/pgPatientBookings.ts`

**Шаги:**

1. Добавить schema-поля provenance (`created_by`, `updated_by`, `source_actor`, или эквивалент по доменной модели).
2. Пробросить поля из ingest payload, если Rubitime передает эти значения.
3. Обеспечить безопасный null/unknown fallback.

**Тесты:**

- [ ] provenance persisted on create.
- [ ] provenance updated on update.

**Критерии готовности:**

- provenance присутствует и читается в доменном/репозиторном слое.

---

## S2.T04 - UI маркер происхождения

**Цель:** визуально пометить происхождение записи в списке.

**Файлы:**

- `apps/webapp/src/app/app/patient/*`
- `apps/webapp/src/app/app/doctor/*`
- `apps/webapp/src/shared/ui/*`

**Шаги:**

1. Добавить маркер в список (точка/лейбл, например "создано администратором").
2. Утвердить mapping `source/provenance -> label`.
3. Обеспечить ненавязчивый UX без ломки текущей верстки.

**Тесты:**

- [ ] UI renders provenance marker.
- [ ] marker hidden when provenance unknown (по договоренной политике).

**Критерии готовности:**

- врач/оператор видит происхождение записи без открытия деталей.

---

## S2.T05 - Backfill compat + финальные проверки

**Цель:** довести исторические compat-строки до нового уровня качества.

**Файлы:**

- `apps/webapp/scripts/backfill-rubitime-compat-snapshots.ts`
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md`
- `docs/BRANCH_UX_CMS_BOOKING/GLOBAL_FIX/AGENT_EXECUTION_LOG.md`

**Шаги:**

1. Реализовать/доработать backfill с dry-run и commit.
2. Добавить counters: enriched/degraded/unchanged/failed.
3. Зафиксировать SQL evidence по качеству compat до/после.
4. Прогнать `pnpm run ci`.

**Критерии готовности:**

- полнота enrich подтверждена метриками и логом.

---

## Audit Gate Stage 2 (обязательный)

`PASS` только если:

1. compat-строки не деградируют относительно contract DoD;
2. lookup `branch_service_id` реально выполняется;
3. provenance сохраняется и отображается;
4. Composer 2 подтвердил достижимость `full compat`.
