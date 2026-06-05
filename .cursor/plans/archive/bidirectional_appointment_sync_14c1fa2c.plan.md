---
name: Bidirectional appointment sync
overview: "Единый AppointmentMirrorSync: полное двустороннее зеркалирование Rubitime ↔ be_appointments для mapped записей (включая native/admin_manual). Закрыто 2026-06-05."
status: completed
completedAt: 2026-06-05
todos:
  - id: phase0-contract-and-boundaries
    content: "Фаза 0: зеркальный контракт полей, ownership-правила и loop guard"
    status: completed
  - id: phase1-inbound-rubitime-to-canonical
    content: "Фаза 1: inbound Rubitime→канон — mapped записи, merge payload, recovery sync"
    status: completed
  - id: phase2-outbound-canonical-to-rubitime
    content: "Фаза 2: outbound канон→Rubitime — staff/patient/admin, patch-builder, integrator normalize"
    status: completed
  - id: phase3-unified-orchestrator
    content: "Фаза 3: модуль AppointmentMirrorSync, events/staff/patient на orchestrator"
    status: completed
  - id: phase4-validation-and-ops
    content: "Фаза 4: тест-матрица, docs, ops backfill bridge"
    status: completed
isProject: false
---

# Двусторонняя синхронизация Rubitime и канона — закрыто

**Приёмка:** [`docs/BOOKING_REWORK_INITIATIVE/ACCEPTANCE_MIRROR_SYNC.md`](../../docs/BOOKING_REWORK_INITIATIVE/ACCEPTANCE_MIRROR_SYNC.md)  
**Журнал:** [`docs/BOOKING_REWORK_INITIATIVE/LOG.md`](../../docs/BOOKING_REWORK_INITIATIVE/LOG.md) § 2026-06-05  
**Код:** [`apps/webapp/src/modules/booking-appointment-sync/README.md`](../../apps/webapp/src/modules/booking-appointment-sync/README.md)

## Цель (достигнута)

Двусторонняя синхронизация для **любого** `be_appointments` с `be_external_entity_mappings` (`entity_type=appointment`, `external_system=rubitime`): время, длительность, услуга, специалист, филиал, статусы, отмена — единым механизмом.

## Итог по фазам

| Фаза | Статус | Результат |
|------|--------|-----------|
| 0 | done | `types.ts`, loop guard, partial FK policy, `syncAttribution` |
| 1 | done | Inbound без `skipped_native_owner`; fan-out; recovery → immediate update |
| 2 | done | `buildRubitimeOutboundPatch`, integrator `normalizeUpdateRecordPatch.ts`; staff cancel **канон → Rubitime**; reschedule **Rubitime → канон** |
| 3 | done | `service.ts` orchestrator; `integrator/events.ts` mirror-first; `patientMirrorOutbound.ts`; admin/doctor manual routes |
| 4 | done | Vitest matrix; docs sync; ops `POST .../bridge` для истории |

## Scope (фактически затронуто)

Помимо плана изначально:

- `apps/webapp/src/modules/booking-appointment-sync/**`
- `apps/webapp/src/app/api/admin/booking-engine/appointments/[id]/manual-{cancel,reschedule}/`
- `apps/webapp/src/app-layer/booking/staffRubitimeMirrorOutbound.ts`
- `apps/webapp/src/modules/patient-booking/patientMirrorOutbound.ts`
- `apps/integrator/src/integrations/rubitime/normalizeUpdateRecordPatch.ts`

## Outbound-порядок (канон)

| Путь | Порядок |
|------|---------|
| Staff `manual-reschedule` | Rubitime → канон |
| Staff/admin `manual-cancel` | канон → Rubitime |
| Patient cancel/reschedule | канон → best-effort Rubitime |

## Definition of Done

- [x] Staff cancel, reschedule, duration/service → Rubitime + `be_appointments`
- [x] Rubitime inbound → канон + календарь (`appointment_records` тот же snapshot)
- [x] Mapped `native`/`admin_manual` — inbound не пропускается
- [x] `mirror_last_synced_from`, `mirror_synced_at`, `mirror_sync_version` + echo guard ~8s
- [x] Целевые тесты зелёные; docs и LOG обновлены

## Проверки (выполнены)

```bash
pnpm --dir apps/webapp exec vitest run \
  src/modules/booking-appointment-sync \
  src/modules/patient-booking/patientMirrorOutbound.test.ts \
  src/infra/repos/pgBookingRubitimeBridge.test.ts \
  src/modules/integrator/events.test.ts

pnpm --dir apps/integrator exec vitest run \
  src/integrations/rubitime/normalizeUpdateRecordPatch.test.ts
```

Полная матрица — в ACCEPTANCE_MIRROR_SYNC.

## Вне scope (не делали)

- DDL/миграции
- Real-time UI push (polling)
- Полный FSM redesign
