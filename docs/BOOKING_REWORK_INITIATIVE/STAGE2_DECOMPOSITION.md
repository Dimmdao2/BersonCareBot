# Этап 2 — декомпозиция (Rubitime-маппинг как адаптер)

**Статус:** закрыт в коде 2026-06-04 (2.3b ops defer в LOG)  
**Родитель:** [`ROADMAP.md`](ROADMAP.md) §8  
**Зависимости:** этап 0 (`INVENTORY_AND_IA.md`), этап 1 (solo UX; gate — [`ACCEPTANCE_STAGE1.md`](ACCEPTANCE_STAGE1.md))

Этап 2 — **четыре исполнимых блока**: **2.0 → 2.1 → 2.2 → 2.3**. Блок **2.0** обязателен: без runtime-синхронизации SSA ↔ `legacy_branch_service_id` UI маппинга не закроет runtime (сейчас связь создаётся только backfill-миграцией `0087`, а `upsertBranchServiceAdmin` пишет лишь `booking_branch_services`).

---

## UI-канон для этапа 2

Кабинет записи исторически был вне DOCTOR_UI_UNIFICATION; **новый и переработанный UI этапа 2** (вкладка «Интеграция Rubitime») следует канону врача — см. [`.cursor/rules/doctor-ui-shared-primitives.mdc`](../../.cursor/rules/doctor-ui-shared-primitives.mdc).

### Источники (порядок чтения)

1. [`DOCTOR_APP_UI_STYLE_GUIDE.md`](../ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md) — §2, §4, §5, §6b, §14, §16  
2. [`doctorVisual.ts`](../../apps/webapp/src/shared/ui/doctorVisual.ts), [`shared/ui/doctor/`](../../apps/webapp/src/shared/ui/doctor/)  
3. [`doctorWorkspaceLayout.ts`](../../apps/webapp/src/shared/ui/doctorWorkspaceLayout.ts) — `BOOKING_CARD_GRID_CLASS` только для overview; интеграция — `DoctorSection` / `doctorSectionCardClass`

### Паттерны

| Зона | Паттерн | Запрещено |
|------|---------|-----------|
| Матрица маппинга | `<DoctorSection>` + `Table` или stacked rows §5a; toolbar фильтра «только проблемы» | Голые `<h2>`; `rounded-2xl`; UUID/`branchServiceId` в primary колонках |
| Статусы | `Badge` + `getDoctorSectionItemClass('urgent')` для блокеров | Один нечитаемый «error» без кода статуса |
| Dialog «Настроить связь» | shadcn `Dialog` §14; `Button default sm`; Select + `displayLabel` | `ghost` как единственное CTA |
| Справочник Rubitime | Collapsible `<DoctorSection>`, default collapsed | CRUD вне вкладки интеграции |
| Техника | `BookingEngineSection mode="integrations"` в `<DoctorSection>` | Read-source в основном кабинете |

### Самопроверка UI (2.1)

```bash
rg "rounded-2xl|<h2>[^<]" apps/webapp/src/app/app/settings/RubitimeSection.tsx \
  apps/webapp/src/app/app/settings/BookingRubitimeMappingSection.tsx \
  apps/webapp/src/app/app/doctor/admin/booking/integrations --glob "*.tsx"
rg "DoctorSection|doctorSectionCardClass|doctorSectionTitleClass" \
  apps/webapp/src/app/app/settings/BookingRubitimeMappingSection.tsx
pnpm --dir apps/webapp exec vitest run \
  src/app/app/settings/RubitimeSection.test.tsx \
  src/app/api/admin/booking-engine/rubitime-mapping/route.test.ts \
  --project fast
```

---

## Трёхслойная модель маппинга (runtime)

Очная запись резолвится **цепочкой**, не одной таблицей:

```text
be_branches + be_clinic_services + be_specialists (canonical)
  → be_specialist_service_availability (SSA)
  → be_external_entity_mappings (entity_type=availability, metadata.legacy_branch_service_id)
  → booking_branch_services (branchServiceId)
  → Rubitime branch / cooperator / service ids
```

Параллельно для webhook/projection нужны **entity mappings** (`branch`, `specialist`, `service` по `external_id` = Rubitime id) — см. `legacyProjection.ts`, backfill `0087`.

**Вывод для плана:** Dialog «Настроить связь» должен вызывать **единый write-path** (2.0), а не только `POST /api/admin/booking-catalog/branch-services`.

---

## Обзор блоков

| Блок | Цель | Breaking API |
|------|------|--------------|
| **2.0** Link service | Runtime upsert: legacy `branch_services` + SSA + `availability` mapping | Нет |
| **2.1** Mapping UI | Матрица canonical × Rubitime + статусы; реорганизация integrations | Нет |
| **2.2** Internal adapter | Fail-closed resolve; outbound/inbound Rubitime | Нет |
| **2.3** Canonical API | `{ branchId, serviceId }` на slots/create; cutover read-source | Частично |

**Gate:** 2.1 не закрывается без 2.0. 2.3 не стартует без 2.1 + smoke 2.2. **Закрыто 2026-06-04:** все gate пройдены в коде; 2.3b ops — см. [`LOG.md`](LOG.md).

---

## 2.0 — Link service (backend, блокер UI)

### Цель

Любое сохранение связи из UI обновляет **все три слоя**: `booking_branch_services`, SSA (если нет — создать/активировать для default specialist + canonical pair), `be_external_entity_mappings` с `metadata.legacy_branch_service_id`.

### Scope

- `apps/webapp/src/modules/booking-scheduling/ports.ts` — `linkCanonicalToLegacyBranchService(...)` (имя уточнить при реализации)
- `apps/webapp/src/infra/repos/pgBookingScheduling.ts` или `pgBookingEngine.ts` + `pgBookingCatalog.ts` (composition в route, не из modules)
- `POST /api/admin/booking-engine/rubitime-mapping/link` (canonical ids + Rubitime targets **или** legacy catalog ids после резолва в route)
- Unit/route tests

### Алгоритм save (нормативно)

1. Вход: `organizationId`, canonical `branchId`, `serviceId`, default `specialistId`, Rubitime `rubitimeServiceId`, legacy `specialistId` (booking), legacy `branchId`/`serviceId` (booking) — legacy ids **резолвятся в route** через entity mappings + title/duration, не вводятся пользователем.
2. `upsertBranchServiceAdmin` → `branchServiceId`.
3. Ensure SSA active для `(specialistId, branchId, serviceId)` — переиспользовать solo availability path этапа 1.
4. Upsert `be_external_entity_mappings`: `entity_type=availability`, `external_id=rubitimeServiceId`, `canonical_id=ssa.id`, `metadata.legacy_branch_service_id=branchServiceId`.
5. Идемпотентность: повторный save обновляет ту же связь, не плодит SSA.

### Вне scope

- UI (2.1)
- Patient API (2.3)

### DoD 2.0

- [x] Route test: после link `resolveLegacyBranchServiceId({ branchId, serviceId })` возвращает id.
- [x] Route test: `resolveInPersonContext(branchServiceId)` возвращает canonical пару (обратный resolve).
- [x] Нет raw SQL в modules; route → `buildAppDeps` → service → port.

---

## 2.1 — Mapping UI

### Цель

Матрица **canonical** «локация × услуга» ↔ Rubitime; legacy CRUD только в collapsible справочнике. Блок «Связки филиал — услуга» в `RubitimeSection` **удаляется** после появления матрицы (дубль).

### Scope

- `BookingRubitimeMappingSection.tsx` (новый)
- `RubitimeSection.tsx` — CRUD без branch-service matrix
- `integrations/page.tsx`
- `GET /api/admin/booking-engine/rubitime-mapping` — read model
- `loadBookingAdminOverview.ts` — warnings через тот же источник статусов (не дублировать эвристику `getMappingSummary` расходящуюся с матрицей)
- Port read method в `booking-scheduling` или `booking-engine`

### Источник строк

Пары: активные `be_branches` × активные `be_clinic_services`, где пара **релевантна записи**:

- `be_service_location_availability.is_active`, **или**
- активная SSA default specialist для `(branchId, serviceId)`.

Пары без доступности — **не показывать** (или отдельный фильтр «скрытые» — не в DoD первого прохода).

### Статусы (код + приоритет отображения)

Показывается **один primary status** (минимальный rank) + опционально `issues[]` для вторичных.

| rank | code | Условие |
|------|------|---------|
| 1 | `unmapped` | нет `branchServiceId` через reverse resolve |
| 2 | `ssa_missing` | SSA для canonical пары отсутствует или inactive |
| 3 | `reverse_missing` | есть legacy row, но нет mapping `availability` → SSA с `legacy_branch_service_id` |
| 4 | `branch_unmapped` | нет `be_external_entity_mappings` entity_type=branch для Rubitime branch этой локации |
| 5 | `specialist_unmapped` | нет mapping specialist для выбранного Rubitime cooperator |
| 6 | `service_unmapped` | legacy booking service не сопоставлен с canonical (title+duration / entity mapping) |
| 7 | `legacy_inactive` | `booking_branch_services.is_active=false` |
| 8 | `duration_mismatch` | `be_clinic_services.durationMinutes` ≠ `booking_services.duration_minutes` связанной строки |
| 9 | `price_mismatch` | `priceMinor` canonical ≠ legacy связанной строки |
| 10 | `mapped_ok` | иначе |

Сравнение price/duration — **строгое равенство**; `mapped_ok` + issues[] допустимо для rank 8–9 как предупреждение без смены primary на mismatch — **решение UI:** primary `mapped_ok`, badge «расхождение цены» в `issues[]` (зафиксировать в component test).

### Read API (формат строки)

```ts
type RubitimeMappingRow = {
  branchId: string;
  branchTitle: string;
  serviceId: string;
  serviceTitle: string;
  rubitimeBranchTitle: string | null;
  rubitimeSpecialistName: string | null;
  rubitimeServiceTitle: string | null;
  status: string;
  issues: string[];
  // internal, не для primary UI:
  branchServiceId: string | null;
};
```

Query: `?problemsOnly=true`, `?branchId=`, `?serviceId=`.

### UX вкладки (сверху вниз)

1. Summary: `DoctorMetricList` — всего пар / проблем / `mapped_ok` (§6b).
2. `<DoctorSection>` «Связи локация × услуга» + фильтр + таблица.
3. Dialog «Настроить связь» → **`POST .../rubitime-mapping/link`** (2.0), не голый catalog branch-services.
4. Collapsible «Справочник Rubitime» — cities/branches/services/specialists.
5. `<DoctorSection>` «Технические настройки» — `BookingEngineSection mode="integrations"`.

### Шаги

| # | Шаг | Проверка |
|---|-----|----------|
| 2.1.1 | DoD 2.0 закрыт | route tests link |
| 2.1.2 | `GET rubitime-mapping` | route test, все status codes |
| 2.1.3 | `BookingRubitimeMappingSection` | DoctorSection, vitest smoke |
| 2.1.4 | Dialog → link API | integration test или route + mock |
| 2.1.5 | RubitimeSection без branch-service matrix | RubitimeSection.test.tsx |
| 2.1.6 | Overview warnings ↔ matrix | loadBookingAdminOverview unit test |
| 2.1.7 | ACCEPTANCE §2.1 | владелец |

### DoD 2.1

- [x] Все релевантные пары видны; фильтр «только проблемы» работает.
- [x] Save из Dialog проходит полный link-path (2.0).
- [x] Нет дубля branch-service UI в RubitimeSection.
- [x] UI по DOCTOR_APP_UI_STYLE_GUIDE; targeted vitest + `tsc` webapp.

---

## 2.2 — Internal adapter (без breaking API)

### Цель

Runtime fail-closed: canonical pair → adapter → Rubitime; inbound webhook → canonical через entity + availability mappings.

### Уже сделано (этап 1 — не дублировать)

- `resolveLegacyBranchServiceId`, `GET resolve-branch-service`
- Admin public widget + slots probe: локация + услуга → server resolve
- Overview warnings (bridge summary)

### Выполнено (2026-06-04)

| Область | Было | Стало |
|---------|------|-------|
| Patient wizard | `cityCode` + legacy catalog | primary `{ branchId, serviceId }`; legacy deep links compat |
| `patient-booking` | разрозненный resolve | `resolveInPersonBranchServiceId` |
| Create Rubitime | `rubitimeBranchServiceLookup` | ids из linked legacy row post-2.0 |
| Memberships/products | только legacy path | fail-closed при unmapped canonical pair |
| Manual lifecycle | legacy поля | compat через adapter (полный UX — этап 3+) |

### Scope

- `modules/patient-booking/`, `canonicalCreate.ts`, `rubitimeBranchServiceLookup.ts`
- `modules/booking-rubitime-bridge/legacyProjection.ts` — тесты на `resolveAppointmentCanonicalRefs` с availability mapping
- `BookingManualLifecycleSection` (если ещё branchService в UI)

### Шаги

| # | Шаг | Проверка |
|---|-----|----------|
| 2.2.1 | Central helper + fail-closed errors | `canonicalCreate.test.ts`, `service.test.ts` |
| 2.2.2 | Outbound create payload Rubitime ids | lookup tests |
| 2.2.3 | Inbound webhook → canonical branch/service | `legacyProjection` / bridge tests |
| 2.2.4 | Memberships: no silent debit if unmapped | `membership-routes.test.ts` |
| 2.2.5 | Smoke staging | LOG |

### DoD 2.2

- [x] UI не показывает `branchServiceId` (регрессия этапа 1).
- [x] Create BersonCare → корректные Rubitime ids для `mapped_ok` (adapter path + unit tests).
- [x] `branch_service_mapping_missing` / аналоги — понятные ошибки.
- [x] Inbound webhook → canonical (`legacyProjection` unit tests; staging smoke — ops).
- [x] Legacy `branchServiceId` в query/body по-прежнему допустим (dual-input).

---

## 2.3 — Canonical API и cutover

Разделить на **2.3a** (контракт) и **2.3b** (ops cutover) — можно закрыть 2.3a без 2.3b, зафиксировав defer в LOG.

### 2.3a — API и patient/public UI

**Slots / create (in_person):**

```json
{ "branchId": "uuid", "serviceId": "uuid", "slotStartAt": "..." }
```

**Один релиз dual-input:** `{ branchId, serviceId }` **или** legacy `branchServiceId` (deprecated, логировать).

**Patient catalog:** заменить `loadBookingServicesForPatientRsc(cityCode)` / legacy join на listing по canonical branch (новый API или расширение booking-engine admin/public read). Это **обязательный** scope 2.3a — без него UI не сможет отдать branchId+serviceId.

### Scope 2.3a

- `/api/booking/slots`, `/api/booking/create`, `/api/booking/public/*`
- Patient: `booking/new/*`, `useBookingSlots`, `useCreateBooking`
- Public: `/book/new/*`, `usePublicCreateBooking`
- Zod: `createInputValidation.ts`, `bookingPublicBodySchema.ts`
- Новый/расширенный endpoint списка услуг по `branchId` для patient/public

### 2.3b — Read-source cutover (ops gate)

1. 2.1 + 2.2 + ACCEPTANCE §2.1–2.2.
2. Все релевантные пары `mapped_ok` или осознанно off.
3. Smoke: patient create, public create, probe.
4. `booking_slots_read_source=canonical`.
5. **`booking_doctor_appointments_read_source=canonical`** — **после** smoke календаря (связь с этапом 4 ROADMAP); допускается **defer 2.3b-appointments** в LOG, если slots уже canonical.

### DoD 2.3

- [x] Primary path patient/public — `{ branchId, serviceId }`.
- [x] Dual-input compat tests.
- [x] Документация: `api.md`, `INVENTORY_AND_IA.md` §5.3.
- [x] 2.3b slots cutover — ops gate; appointments read-source defer → этап 4 (LOG 2026-06-04).
- [x] Targeted vitest + `tsc`; **`pnpm run ci`** — финальный барьер.

---

## Риски

| Риск | Митигация |
|------|-----------|
| UI save без SSA/mapping | Блок 2.0 обязателен до 2.1 |
| Dialog резолвит legacy UUID | Route link принимает canonical; legacy только server-side |
| Overview vs matrix расходятся | Один read API для warnings |
| Patient cityCode vs branchId | Явный scope 2.3a catalog migration |
| Cutover ломает календарь | 2.3b appointments defer → этап 4 |
| Абонементы | 2.2 fail-closed; UX этап 3 |

---

## Что уже было слабо в v1 декомпозиции (исправлено)

1. Save через только `booking-catalog/branch-services` — **не достаточно** для runtime (нет SSA/mapping upsert).
2. Нет блока 2.0 и entity-level prerequisites (`branch_unmapped`, …).
3. Нет приоритета статусов и формата read API.
4. Не сказано убрать branch-service matrix из `RubitimeSection`.
5. 2.2 смешивал «уже есть в этапе 1» и «patient wizard всё ещё legacy catalog».
6. 2.3 не включал migration patient service listing off `cityCode`.
7. Vitest paths без `pnpm --dir apps/webapp`.
8. Cutover appointments не связан с defer к этапу 4.

---

## Документы

- [`ACCEPTANCE_STAGE2.md`](ACCEPTANCE_STAGE2.md)
- [`ROADMAP.md`](ROADMAP.md) §8 — **`done`**
- [`INVENTORY_AND_IA.md`](INVENTORY_AND_IA.md) §5.2–5.3 — обновлено 2026-06-04
- [`../ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`](../ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md)
- [`apps/webapp/src/app/api/api.md`](../../apps/webapp/src/app/api/api.md) — booking dual-input
- [`LOG.md`](LOG.md)
- [`.cursor/plans/archive/booking_rework_stage2_rubitime_adapter.plan.md`](../../.cursor/plans/archive/booking_rework_stage2_rubitime_adapter.plan.md)
