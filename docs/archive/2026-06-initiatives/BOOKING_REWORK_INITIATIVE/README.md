# BOOKING_REWORK_INITIATIVE (закрыта 2026-06-06)

**Статус:** `done` — этапы 0–5, mirror sync, gaps closeout, sync desync fix (code).

Операционные документы (контракт mirror, acceptance, LOG, runbook smoke) остаются в [`docs/BOOKING_REWORK_INITIATIVE/`](../../BOOKING_REWORK_INITIATIVE/README.md) — стабильные ссылки из кода и architecture docs.

## Закрытые планы (архив `.cursor/plans/archive/`)

| План | Суть |
|------|------|
| [`booking_gaps_closeout_e5b725fb`](../../../../.cursor/plans/archive/booking_gaps_closeout_e5b725fb.plan.md) | rubitime-first overlap, G4/G6, partial UI · `closeoutCommit: eb9eba63` · CI green |
| [`booking_sync_desync_fix_4709fb07`](../../../../.cursor/plans/archive/booking_sync_desync_fix_4709fb07.plan.md) | prod rebook/manage/FK/410 · matrix 7/7 · CI green |
| [`booking_scenarios_audit_e9c4ce97`](../../../../.cursor/plans/archive/booking_scenarios_audit_e9c4ce97.plan.md) | аудит write-сценариев (prod-инцидент) |
| [`booking_mirror_integrity_hardening_8f043ac3`](../../../../.cursor/plans/archive/booking_mirror_integrity_hardening_8f043ac3.plan.md) | partial flags, lifecycle, inbound dedup |
| [`bidirectional_appointment_sync_14c1fa2c`](../../../../.cursor/plans/archive/bidirectional_appointment_sync_14c1fa2c.plan.md) | `AppointmentMirrorSync` live path |

Post-deploy ops (не блокирует закрытие): [`ACCEPTANCE_MIRROR_SYNC.md`](../../BOOKING_REWORK_INITIATIVE/ACCEPTANCE_MIRROR_SYNC.md) § post-deploy.
