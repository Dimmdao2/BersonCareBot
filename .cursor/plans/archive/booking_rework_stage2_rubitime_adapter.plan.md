---
name: BOOKING REWORK — этап 2 Rubitime-адаптер
overview: "Закрыть этап 2 BOOKING_REWORK: link service (2.0), mapping UI (2.1), internal adapter (2.2), canonical API (2.3a); 2.3b ops defer в LOG."
todos:
  - id: 2.0-link-service
    content: "POST rubitime-mapping/link: legacy row + SSA + availability mapping; verify resolveLegacyBranchServiceId"
    status: completed
  - id: 2.1-mapping-ui
    content: "BookingRubitimeMappingSection, GET rubitime-mapping, overview warnings, RubitimeSection без branch-service matrix"
    status: completed
  - id: 2.2-adapter
    content: "resolveInPersonBranchServiceId fail-closed; memberships/products; legacyProjection tests"
    status: completed
  - id: 2.3a-canonical-api
    content: "Dual-input slots/create; GET in-person-services; patient/public wizard primary branchId+serviceId"
    status: completed
  - id: 2.3b-ops-defer
    content: "2.3b slots cutover — ops gate; appointments read-source defer → этап 4 (LOG)"
    status: completed
  - id: audit-fixes
    content: "Аудит: link verify, deprecation log, public deep link, расширенные тесты, api.md"
    status: completed
  - id: docs-sync
    content: "ROADMAP, ACCEPTANCE, STAGE2_DECOMPOSITION, INVENTORY §5, LOG, README"
    status: completed
  - id: ci
    content: "pnpm run ci зелёный; port-based Deps без import buildAppDeps в modules"
    status: completed
isProject: false
---

# BOOKING REWORK — этап 2 (закрыт 2026-06-04)

**Канон:** [`docs/BOOKING_REWORK_INITIATIVE/STAGE2_DECOMPOSITION.md`](../../docs/BOOKING_REWORK_INITIATIVE/STAGE2_DECOMPOSITION.md) · [`ACCEPTANCE_STAGE2.md`](../../docs/BOOKING_REWORK_INITIATIVE/ACCEPTANCE_STAGE2.md) · [`LOG.md`](../../docs/BOOKING_REWORK_INITIATIVE/LOG.md)

## Definition of Done

- [x] 2.0–2.3a в коде и targeted vitest
- [x] ROADMAP §8 → `done`
- [x] 2.3b ops (slots cutover, staging smoke) — зафиксирован defer; appointments → этап 4
- [x] `pnpm run ci` зелёный

## Вне scope (следующие этапы)

- Этап 3 — абонементы UX
- Этап 4 — календарь + `booking_doctor_appointments_read_source=canonical`
- Ops: `booking_slots_read_source=canonical` на staging/prod
