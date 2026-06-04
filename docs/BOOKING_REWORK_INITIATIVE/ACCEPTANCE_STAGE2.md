# Приёмка — Этап 2 (Rubitime-маппинг как адаптер)

**Статус:** 2.0–2.3a — закрыты в коде и авто-тестах (2026-06-04). 2.3b — ops gate (unchecked ниже). План: [`.cursor/plans/archive/booking_rework_stage2_rubitime_adapter.plan.md`](../../.cursor/plans/archive/booking_rework_stage2_rubitime_adapter.plan.md).

**Маршрут:** `/app/doctor/admin/booking/integrations`  
**План:** [`STAGE2_DECOMPOSITION.md`](STAGE2_DECOMPOSITION.md)

---

## 2.0 — Link service (backend)

- [x] `POST /api/admin/booking-engine/rubitime-mapping/link` создаёт/обновляет legacy row + SSA + `be_external_entity_mappings` (`legacy_branch_service_id`)
- [x] После link работают `resolveLegacyBranchServiceId` и `resolveInPersonContext` для этой пары (verify в route)
- [x] Route tests зелёные

| Роль | Дата | Результат |
|------|------|-----------|
| Разработка | 2026-06-04 | 2.0 OK |

---

## 2.1 — Mapping UI

### Визуал (DOCTOR_APP_UI_STYLE_GUIDE)

- [x] Секции: `<DoctorSection>` / `doctorSectionCardClass` — `rounded-xl`, `p-3`
- [x] Заголовки: `doctorSectionTitleClass`, не голые `<h2>`
- [x] Primary actions: `Button variant="default" size="sm"`
- [x] Select Rubitime-целей: `displayLabel`

### Матрица

- [x] Колонки: **локация | услуга | Rubitime филиал | Rubitime специалист | Rubitime услуга | статус**
- [x] Summary metrics (всего / проблем / связано)
- [x] Фильтр «только проблемы»
- [x] Статусы из декомпозиции различимы (unmapped, SSA, reverse, entity, inactive, mismatch)
- [x] Save из Dialog идёт через link API (2.0), не только catalog branch-services
- [x] В `RubitimeSection` нет дубля «Связки филиал — услуга»

### Справочник и техника

- [x] Legacy CRUD — collapsible «Справочник Rubitime», default collapsed
- [x] Read-source / bridge — блок «Технические настройки»
- [x] Обзор: предупреждения согласованы с матрицей (ссылка на integrations + фильтр)

### Регрессия (авто)

```bash
pnpm --dir apps/webapp exec vitest run \
  src/app/app/settings/RubitimeSection.test.tsx \
  src/app/app/settings/BookingRubitimeMappingSection.test.tsx \
  src/app/api/admin/booking-engine/rubitime-mapping/route.test.ts \
  src/app/api/admin/booking-engine/rubitime-mapping/link/route.test.ts \
  src/app/app/doctor/admin/booking/loadBookingAdminOverview.test.ts \
  --project fast
```

| Роль | Дата | Результат |
|------|------|-----------|
| Владелец постановки | 2026-06-04 | 2.1 принято (код + авто) |

---

## 2.2 — Internal adapter (smoke)

- [x] Widget + probe без ручного `branchServiceId`
- [x] Create (patient/manual) для `mapped_ok` → resolve → legacy row → Rubitime ids (adapter path)
- [x] Webhook → canonical через entity + availability lookup (`legacyProjection` tests)
- [x] Unmapped → явная ошибка (`branch_service_mapping_missing`), не silent debit
- [x] HTTP slots/create **ещё** принимают legacy `branchServiceId` (контракт не сломан)

| Роль | Дата | Результат |
|------|------|-----------|
| Владелец / ops | 2026-06-04 | 2.2 принято (код + unit); staging smoke — ops перед cutover |

---

## 2.3 — Canonical API + cutover

### 2.3a — контракт

- [x] Patient/public primary: `{ branchId, serviceId }`
- [x] Список услуг patient/public по локации (`loadInPersonServicesForCityRsc`, `GET /api/booking/in-person-services`)
- [x] Legacy `branchServiceId` deprecated но работает (dual-input + log)
- [x] `api.md` / INVENTORY обновлены

### 2.3b — cutover (ops)

- [ ] Все релевантные пары `mapped_ok` или off by design — **ops на staging/prod**
- [ ] Smoke patient + public create на staging — **ops перед cutover**
- [ ] `booking_slots_read_source=canonical` — **ops после mapped_ok + smoke**
- [x] `booking_doctor_appointments_read_source=canonical` — **defer → этап 4** (см. [`LOG.md`](LOG.md))

| Роль | Дата | Результат |
|------|------|-----------|
| Владелец постановки | 2026-06-04 | 2.3a принято; 2.3b slots cutover — ops; appointments defer этап 4 |

---

## Закрытие этапа 2

ROADMAP §8 → `done`: **2.0 + 2.1 + 2.2 + 2.3a** закрыты в коде и авто-тестах; **2.3b** ops-gate и defer appointments задокументированы.
