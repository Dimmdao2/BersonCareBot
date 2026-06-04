# BOOKING_REWORK_INITIATIVE — доработка записи

**Статус:** `in_progress` (этап 0 — `done`; этап 1 — код готов, ожидает приёмку владельца; **этап 2 — `done`** 2026-06-04; **этап 3 — `done`** 2026-06-04; **этап 4 — `done`** 2026-06-04; этап 5 — pending; ops defer — [`LOG.md`](LOG.md))
**Дата старта:** 2026-06-04
**Владелец постановки:** Дмитрий Берсон

Инициатива фиксирует переработку кабинета записи после внедрения собственного booking engine. Главная цель — перестать показывать пользователю внутреннюю переходную модель (`booking_*`, `be_*`, Rubitime-дубли специалистов, `branchServiceId`, кабинеты/resources) и собрать рабочий интерфейс под текущий продуктовый сценарий: **один специалист работает со своими клиентами, имеет несколько локаций, общий список услуг, разные услуги/расписания по локациям и переходный Rubitime-маппинг**.

Онлайн-направление консультаций в этой инициативе **не трогаем**: оно остается отдельной веткой записи без самостоятельной календарной записи на консультацию в рамках текущего scope.

## Документы

1. [`ROADMAP.md`](ROADMAP.md) — подробный roadmap работ, решения из обсуждения, этапы, проверки и критерии закрытия.
2. [`INVENTORY_AND_IA.md`](INVENTORY_AND_IA.md) — инвентаризация текущих вкладок, источники данных, целевая IA, контракты переходного периода (этап 0).
3. [`LOG.md`](LOG.md) — журнал выполнения этапов.
4. [`ACCEPTANCE_STAGE1.md`](ACCEPTANCE_STAGE1.md) — чек-лист ручной приёмки этапа 1.
5. [`STAGE2_DECOMPOSITION.md`](STAGE2_DECOMPOSITION.md) — декомпозиция этапа 2 (2.1 / 2.2 / 2.3), UI-канон врача.
6. [`ACCEPTANCE_STAGE2.md`](ACCEPTANCE_STAGE2.md) — приёмка этапа 2 по подэтапам (**2.0–2.3a закрыты в коде**; 2.3b ops — unchecked).
7. [`STAGE3_DECOMPOSITION.md`](STAGE3_DECOMPOSITION.md) — декомпозиция этапа 3 (3.0–3.6): комментарий, сеансы, detach, карточка клиента.
8. [`ACCEPTANCE_STAGE3.md`](ACCEPTANCE_STAGE3.md) — приёмка этапа 3 (**закрыта в коде** 2026-06-04).
9. [`STAGE4_DECOMPOSITION.md`](STAGE4_DECOMPOSITION.md) — декомпозиция этапа 4 (4.0–4.8): calendar npm, canonical feed, working/break, DnD, Rubitime rollback, poll refresh.
10. [`ACCEPTANCE_STAGE4.md`](ACCEPTANCE_STAGE4.md) — приёмка этапа 4.
11. План этапа 2 (архив): [`.cursor/plans/archive/booking_rework_stage2_rubitime_adapter.plan.md`](../../.cursor/plans/archive/booking_rework_stage2_rubitime_adapter.plan.md)

**Этап 3 (кратко):** комментарий к пакету (`notes`), индивидуальный абонемент без названия в UI, `GET …/sessions`, `POST …/package/detach`, карточка клиента (`PatientPackageCard` / `PatientPackageSessionsList`), настройка `booking_allow_doctor_unlink_past_package_sessions` — см. [`LOG.md`](LOG.md).

## Основные решения

- Кабинет записи проектируется как **solo-specialist UI**: специалист один и не выбирается в обычных настройках.
- `Кабинет` / room/resource не показывается в основном UX; при необходимости остается внутренней технической сущностью.
- Основной язык интерфейса: **локации, услуги, доступность услуг по локациям, расписание, форма записи, Rubitime-маппинг**.
- Rubitime-дубли специалистов и услуг считаются **внешней интеграционной проекцией**, а не продуктовой моделью.
- Полное закрытие инициативы возможно только после полного прохода UI владельцем постановки и явного решения: **новый интерфейс принят**.

## Связанные документы

- [`../OWN_BOOKING_ENGINE_INITIATIVE/README.md`](../OWN_BOOKING_ENGINE_INITIATIVE/README.md) — исходная инициатива собственного движка записи.
- [`../OWN_BOOKING_ENGINE_INITIATIVE/DATA_MODEL_REFERENCE.md`](../OWN_BOOKING_ENGINE_INITIATIVE/DATA_MODEL_REFERENCE.md) — текущая каноническая модель.
- [`../ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`](../ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md) — текущий Rubitime pipeline.
- [`../ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md`](../ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md) — навигация кабинета врача/админа.

