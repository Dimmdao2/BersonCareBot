# OWN_BOOKING_ENGINE_INITIATIVE — собственный движок записи пациентов

**Статус:** этапы 1–9 — `done`; переходный Rubitime-режим стабилизирован (2026-05-30, план [`rubitime_transition_stabilize`](../../.cursor/plans/archive/rubitime_transition_stabilize.plan.md)). Реализация в git-ветке **`initiative/own-booking-engine`** (см. [`MASTER_PLAN.md`](MASTER_PLAN.md) §Git-ветка).
**Дата старта:** 2026-05-29.
**Владелец постановки:** Дмитрий Берсон.

Цель — перейти с внешней логики **Rubitime** на **собственный движок записи** с каноническим хранением данных в собственной БД (`public` схема webapp), с заделом под будущую **SaaS-платформу** для клиник и специалистов. На переходный период Rubitime остаётся как **двусторонний мост/зеркало**, но источник правды — собственная система.

> Это **управляющая** инициатива (мета-план). Здесь не пишется код и не делается детальная декомпозиция шагов. Здесь фиксируются: исходное ТЗ, мастер-план, поэтапные чек-листы обязательных результатов, чек-лист UI всех кабинетов и бриф для агентов, которые будут строить **декомпозированные планы** (`.cursor/plans/*.plan.md`) под каждый этап.

---

## Документы инициативы (порядок чтения)

1. [`SOURCE_SPEC.md`](SOURCE_SPEC.md) — **первоисточник**: дословное ТЗ владельца (24 раздела). Приоритет при спорах.
2. [`MASTER_PLAN.md`](MASTER_PLAN.md) — мастер-план: видение, архитектурные принципы, сквозные (cross-cutting) правила, обзор этапов, Definition of Done всей инициативы.
3. [`ROADMAP.md`](ROADMAP.md) — таблица этапов, статусы, зависимости, порядок.
4. [`STAGE_CHECKLISTS.md`](STAGE_CHECKLISTS.md) — **ядро**: по каждому этапу — чек-лист обязательных результатов (DoD), правильный способ реализации, что нельзя пропустить, критерии приёмки.
5. [`UI_SURFACES_CHECKLIST.md`](UI_SURFACES_CHECKLIST.md) — все настройки и вся информация, которые обязаны появиться в кабинетах **врача / админа / клиента** + публичный виджет.
6. [`DATA_MODEL_REFERENCE.md`](DATA_MODEL_REFERENCE.md) — справочник канонических сущностей и связей (ориентир, не финальный DDL).
7. [`AGENT_BRIEF.md`](AGENT_BRIEF.md) — ТЗ для агента-исполнителя: как строить декомпозированные планы из чек-листов, какие правила проекта обязательны, формат сдачи этапа.
8. [`SCOPE_DECISIONS.md`](SCOPE_DECISIONS.md) — границы scope, сознательные сужения с причиной, связь с Rubitime и смежными инициативами.
9. [`LOG.md`](LOG.md) — журнал исполнения (ведётся по мере работы).

## Декомпозированные планы для исполнителя (Composer)

По каждому этапу — отдельный план в `.cursor/plans/`, привязанный к реальным путям кода:

- Этап 1 (закрыт): [`.cursor/plans/archive/own_booking_stage1_canonical_model.plan.md`](../../.cursor/plans/archive/own_booking_stage1_canonical_model.plan.md)
- Этап 2 (закрыт): [`.cursor/plans/archive/own_booking_stage2_patient_booking.plan.md`](../../.cursor/plans/archive/own_booking_stage2_patient_booking.plan.md)
- Этап 3 (закрыт): [`.cursor/plans/archive/own_booking_stage3_public_widget.plan.md`](../../.cursor/plans/archive/own_booking_stage3_public_widget.plan.md)
- Этап 4 (закрыт): [`.cursor/plans/archive/own_booking_stage4_reschedule_cancel.plan.md`](../../.cursor/plans/archive/own_booking_stage4_reschedule_cancel.plan.md)
- Этап 5 (закрыт): [`.cursor/plans/archive/own_booking_stage5_prepayment_payments.plan.md`](../../.cursor/plans/archive/own_booking_stage5_prepayment_payments.plan.md)
- Этап 6 (закрыт): [`.cursor/plans/archive/own_booking_stage6_memberships.plan.md`](../../.cursor/plans/archive/own_booking_stage6_memberships.plan.md)
- Этап 7 (закрыт): [`.cursor/plans/archive/own_booking_stage7_products_courses.plan.md`](../../.cursor/plans/archive/own_booking_stage7_products_courses.plan.md)
- Этап 8 (закрыт): [`.cursor/plans/archive/own_booking_stage8_calendar.plan.md`](../../.cursor/plans/archive/own_booking_stage8_calendar.plan.md)
- Этап 9 (закрыт): [`.cursor/plans/archive/own_booking_stage9_client_card_history.plan.md`](../../.cursor/plans/archive/own_booking_stage9_client_card_history.plan.md) — модуль [`client-history.md`](../../apps/webapp/src/modules/client-history/client-history.md)
- **Переход Rubitime (закрыт, 2026-05-30):** [`.cursor/plans/archive/rubitime_transition_stabilize.plan.md`](../../.cursor/plans/archive/rubitime_transition_stabilize.plan.md) — read/write sources, календарь legacy, Rubitime-first create, UI расписания.

Порядок исполнения и gate — в [`ROADMAP.md`](ROADMAP.md). Каждый план исполнять по [`AGENT_BRIEF.md`](AGENT_BRIEF.md).

## Связанные материалы репозитория

- Текущий Rubitime-пайплайн: [`docs/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`](../ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md)
- Нативный модуль записи (текущий, частично через Rubitime): `apps/webapp/src/modules/patient-booking/`
- Смежная инициатива (онлайн-консультации вне Rubitime): [`docs/ONLINE_CONSULT_REHAB_NUTRITION_BOOKING_INITIATIVE/`](../ONLINE_CONSULT_REHAB_NUTRITION_BOOKING_INITIATIVE/README.md) — поглощается/согласуется этой инициативой (см. `SCOPE_DECISIONS`).
- Идентичность пациента из Rubitime: [`docs/LOGIN_REGISTER_NEW_LOGIC/`](../LOGIN_REGISTER_NEW_LOGIC/README.md) (PHASE_01 done; PHASE_07 backfill / PHASE_08 mass-email — deferred).
- Курсы: [`docs/COURSES_INITIATIVE/`](../COURSES_INITIATIVE/README.md) (продукт «курс» как потребитель платёжного слоя).
- Конфигурация (ключи интеграций в БД, не в ENV): [`docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`](../ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md).
- Единая БД (схемы `public` + `integrator`): [`docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`](../ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md).
- Серверные конвенции: [`docs/ARCHITECTURE/SERVER CONVENTIONS.md`](../ARCHITECTURE/SERVER%20CONVENTIONS.md).

## Обязательные правила проекта для всех исполнителей

Перед любой реализацией прочитать и соблюдать (приоритет — always-apply):
- `.cursor/rules/clean-architecture-module-isolation.mdc` (порты/DI, Drizzle для новых таблиц, тонкие route-хендлеры).
- `.cursor/rules/000-critical-integration-config-in-db.mdc` + `.cursor/rules/runtime-config-env-vs-db.mdc` + `.cursor/rules/system-settings-integrator-mirror.mdc` (платёжные ключи/настройки — в `system_settings`, не в ENV).
- `.cursor/rules/plan-authoring-execution-standard.mdc` (как оформлять планы, DoD, scope boundaries, LOG).
- `.cursor/rules/pre-push-ci.mdc` + `.cursor/rules/test-execution-policy.md` (барьеры тестов/CI).
- `.cursor/rules/patient-ui-shared-primitives.mdc` + `.cursor/rules/ui-copy-no-excess-labels.mdc` + `.cursor/rules/ui-select-trigger-display-label.mdc` (patient/UI правила).
- `.cursor/rules/server-conventions-and-doc-onboarding.mdc` (онбординг по docs).
