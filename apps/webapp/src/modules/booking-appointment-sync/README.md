# booking-appointment-sync — Rubitime ↔ канон (mirror)

Единый слой двустороннего зеркалирования для записей с `be_external_entity_mappings` (`entity_type=appointment`, `external_system=rubitime`).

## Модули

| Файл | Назначение |
|------|------------|
| `buildCanonicalSnapshot.ts` | Snapshot для `be_appointments` и `appointment_records` |
| `mergeRubitimeEventPayload.ts` | Fan-out top-level полей webhook → `payloadJson` |
| `mergeCanonicalRefs.ts` | Partial FK: не затирать canonical id в `null` |
| `syncAttribution.ts` | `mirror_last_synced_from`, `mirror_synced_at`, `mirror_sync_version` |
| `loopGuard.ts` | Подавление inbound echo ~8 с после outbound |
| `buildRubitimeOutboundPatch.ts` | Patch для M2M `update-record` |
| `service.ts` | `AppointmentMirrorSync` orchestrator |

## Inbound

`integrator/events.ts` → `applyInboundFromRubitime` → `pgBookingRubitimeBridge.upsertCanonicalFromRubitimeRecord` → тот же snapshot в `appointment_records`.

## Outbound

| Путь | Порядок |
|------|---------|
| Staff `manual-reschedule` | Rubitime → канон (проверка слота) |
| Staff `manual-cancel` | канон `staffCancel` → Rubitime `cancelRecord` |
| Patient cancel/reschedule | канон lifecycle → best-effort Rubitime (`patientMirrorOutbound.ts`) |

Shared staff helpers: `app-layer/booking/staffRubitimeMirrorOutbound.ts`.

Integrator: `normalizeUpdateRecordPatch.ts` (`record`, `datetime_end`, scope ids).

## Документация

- [`docs/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`](../../../../docs/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md)
- [`docs/BOOKING_REWORK_INITIATIVE/ACCEPTANCE_MIRROR_SYNC.md`](../../../../docs/BOOKING_REWORK_INITIATIVE/ACCEPTANCE_MIRROR_SYNC.md)
- [`docs/BOOKING_REWORK_INITIATIVE/LOG.md`](../../../../docs/BOOKING_REWORK_INITIATIVE/LOG.md) § 2026-06-05
- План (архив): [`.cursor/plans/archive/bidirectional_appointment_sync_14c1fa2c.plan.md`](../../../../.cursor/plans/archive/bidirectional_appointment_sync_14c1fa2c.plan.md)

## DI

`buildAppDeps().appointmentMirrorSync` — при наличии PG (`bookingEngine` + bridge port).
