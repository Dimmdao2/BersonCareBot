# BOOKING_REWORK_INITIATIVE — доработка записи

**Статус:** `done` (этапы 0–5 — `done`; mirror sync + gaps closeout + sync desync fix + **staff delete** — `done`; post-deploy ops gate — [`ACCEPTANCE_MIRROR_SYNC.md`](ACCEPTANCE_MIRROR_SYNC.md) § post-deploy + § staff delete SD-1..SD-6). Архивный индекс: [`docs/archive/2026-06-initiatives/BOOKING_REWORK_INITIATIVE/README.md`](../archive/2026-06-initiatives/BOOKING_REWORK_INITIATIVE/README.md).
**Дата старта:** 2026-06-04 · **Дата закрытия этапов 0–5:** 2026-06-06 · **Staff delete (доп.):** 2026-06-07
**Владелец постановки:** Дмитрий Берсон

Инициатива фиксирует переработку кабинета записи после внедрения собственного booking engine. Главная цель — перестать показывать пользователю внутреннюю переходную модель (`booking_*`, `be_*`, Rubitime-дубли специалистов, `branchServiceId`, кабинеты/resources) и собрать рабочий интерфейс под текущий продуктовый сценарий: **один специалист работает со своими клиентами, имеет несколько локаций, общий список услуг, разные услуги/расписания по локациям и переходный Rubitime-маппинг**.

Онлайн-направление консультаций в этой инициативе **не трогаем**: оно остается отдельной веткой записи без самостоятельной календарной записи на консультацию в рамках текущего scope.

## Документы

1. [`ROADMAP.md`](ROADMAP.md) — подробный roadmap работ, решения из обсуждения, этапы, проверки и критерии закрытия.
2. [`INVENTORY_AND_IA.md`](INVENTORY_AND_IA.md) — инвентаризация текущих вкладок, источники данных, целевая IA, контракты переходного периода (этап 0).
3. [`LOG.md`](LOG.md) — журнал выполнения этапов.
4. [`STAGE2_DECOMPOSITION.md`](STAGE2_DECOMPOSITION.md) — декомпозиция этапа 2 (2.1 / 2.2 / 2.3), UI-канон врача.
5. [`ACCEPTANCE_STAGE2.md`](ACCEPTANCE_STAGE2.md) — приёмка этапа 2 по подэтапам (**2.0–2.3a закрыты в коде**; 2.3b ops — unchecked).
6. [`STAGE3_DECOMPOSITION.md`](STAGE3_DECOMPOSITION.md) — декомпозиция этапа 3 (3.0–3.6): комментарий, сеансы, detach, карточка клиента.
7. [`ACCEPTANCE_STAGE3.md`](ACCEPTANCE_STAGE3.md) — приёмка этапа 3 (**закрыта в коде** 2026-06-04).
8. [`STAGE4_DECOMPOSITION.md`](STAGE4_DECOMPOSITION.md) — декомпозиция этапа 4 (4.0–4.8): calendar npm, canonical feed, working/break, DnD, Rubitime rollback, poll refresh.
9. [`ACCEPTANCE_STAGE4.md`](ACCEPTANCE_STAGE4.md) — приёмка этапа 4.
10. [`ACCEPTANCE_STAGE5.md`](ACCEPTANCE_STAGE5.md) — финальная приёмка UI (в т.ч. наследие solo UX этапа 1 после IA на 4 вкладки).
11. [`ACCEPTANCE_MIRROR_SYNC.md`](ACCEPTANCE_MIRROR_SYNC.md) — двустороннее зеркалирование Rubitime ↔ канон + integrity hardening (2026-06-05) + gaps closeout + sync desync fix (2026-06-06).
12. План mirror sync (архив): [`.cursor/plans/archive/bidirectional_appointment_sync_14c1fa2c.plan.md`](../../.cursor/plans/archive/bidirectional_appointment_sync_14c1fa2c.plan.md).
13. План integrity hardening (архив): [`.cursor/plans/archive/booking_mirror_integrity_hardening_8f043ac3.plan.md`](../../.cursor/plans/archive/booking_mirror_integrity_hardening_8f043ac3.plan.md) — фазовый closeout 0–7, audit trail, scope reconciliation.
14. Контракт integrity hardening: [`BOOKING_MIRROR_INTEGRITY_CONTRACT.md`](BOOKING_MIRROR_INTEGRITY_CONTRACT.md).
15. План этапа 2 (архив): [`.cursor/plans/archive/booking_rework_stage2_rubitime_adapter.plan.md`](../../.cursor/plans/archive/booking_rework_stage2_rubitime_adapter.plan.md)
16. План gaps closeout (архив, 2026-06-06, `status: completed`): [`.cursor/plans/archive/booking_gaps_closeout_e5b725fb.plan.md`](../../.cursor/plans/archive/booking_gaps_closeout_e5b725fb.plan.md) — rubitime-first overlap class, G4/G6, patient partial UI, shared rollback; CI green (agent-сессия closeout) — [`ACCEPTANCE_MIRROR_SYNC.md`](ACCEPTANCE_MIRROR_SYNC.md) § gaps closeout.
17. План аудита сценариев (архив): [`.cursor/plans/archive/booking_scenarios_audit_e9c4ce97.plan.md`](../../.cursor/plans/archive/booking_scenarios_audit_e9c4ce97.plan.md) — prod-инцидент 2026-06-06, предшественник gaps closeout.
18. План sync desync fix (архив, 2026-06-06, `status: completed`): [`.cursor/plans/archive/booking_sync_desync_fix_4709fb07.plan.md`](../../.cursor/plans/archive/booking_sync_desync_fix_4709fb07.plan.md) — cancel mirror, rebook overlap, FK branch, GCal/Rubitime idempotent delete/update, matrix 7/7; CI green — [`LOG.md`](LOG.md) §2026-06-06 desync fix, [`ACCEPTANCE_MIRROR_SYNC.md`](ACCEPTANCE_MIRROR_SYNC.md) § верификация desync fix + smoke #9; post-deploy ops gate — ACCEPTANCE § post-deploy.
19. План staff delete (архив, 2026-06-07, `status: completed`): [`.cursor/plans/archive/staff_cancelled_delete_5c59a30e.plan.md`](../../.cursor/plans/archive/staff_cancelled_delete_5c59a30e.plan.md) — тихое удаление отменённых (doctor/admin); контракт — [`BOOKING_MIRROR_INTEGRITY_CONTRACT.md`](BOOKING_MIRROR_INTEGRITY_CONTRACT.md) §Staff delete; приёмка — [`ACCEPTANCE_MIRROR_SYNC.md`](ACCEPTANCE_MIRROR_SYNC.md) smoke #10 + SD-1..SD-6; журнал — [`LOG.md`](LOG.md) §2026-06-07.

**Этап 3 (кратко):** комментарий к пакету (`notes`), индивидуальный абонемент без названия в UI, `GET …/sessions`, `POST …/package/detach`, карточка клиента (`PatientPackageCard` / `PatientPackageSessionsList`), настройка `booking_allow_doctor_unlink_past_package_sessions` — см. [`LOG.md`](LOG.md).

## Основные решения

- Кабинет записи проектируется как **solo-specialist UI**: специалист один и не выбирается в обычных настройках.
- `Кабинет` / room/resource не показывается в основном UX; при необходимости остается внутренней технической сущностью.
- Основной язык интерфейса: **локации, услуги, доступность услуг по локациям, расписание, форма записи, Rubitime-маппинг**.
- Rubitime-дубли специалистов и услуг считаются **внешней интеграционной проекцией**, а не продуктовой моделью.
- Инициатива **закрыта** 2026-06-06: новый интерфейс принят владельцем постановки ([`ACCEPTANCE_STAGE5.md`](ACCEPTANCE_STAGE5.md)).

## Связанные документы

- [`../OWN_BOOKING_ENGINE_INITIATIVE/README.md`](../OWN_BOOKING_ENGINE_INITIATIVE/README.md) — исходная инициатива собственного движка записи.
- [`../OWN_BOOKING_ENGINE_INITIATIVE/DATA_MODEL_REFERENCE.md`](../OWN_BOOKING_ENGINE_INITIATIVE/DATA_MODEL_REFERENCE.md) — текущая каноническая модель.
- [`../ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`](../ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md) — Rubitime pipeline + § mirror sync.
- [`ACCEPTANCE_MIRROR_SYNC.md`](ACCEPTANCE_MIRROR_SYNC.md) — приёмка двустороннего зеркалирования.
- [`../../apps/webapp/src/modules/booking-appointment-sync/README.md`](../../apps/webapp/src/modules/booking-appointment-sync/README.md) — модуль mirror (код).
- [`../ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md`](../ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md) — навигация кабинета врача/админа.

