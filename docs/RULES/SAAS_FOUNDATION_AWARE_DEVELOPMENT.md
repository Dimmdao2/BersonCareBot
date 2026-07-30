# SaaS Foundation-aware development

Этот документ — постоянное правило для любых новых разработок и изменений кода/БД до и во время `SAAS_FOUNDATION`.

Канон инициативы:

- `docs/_TODO/SAAS_FOUNDATION/REQUIREMENTS.md`
- `docs/_TODO/SAAS_FOUNDATION/ROADMAP_TO_SAAS.md`
- `docs/_TODO/SAAS_FOUNDATION/CORRECTED_PLAN.md`
- `docs/_TODO/DB_ACCESS_CHOKEPOINT_INITIATIVE/MASTER_PLAN.md`

## Обязательное правило

Перед добавлением новых таблиц, колонок, связей, миграций, репозиториев, API или фоновых процессов агент обязан учитывать, что продукт идет к shared-DB SaaS с tenant = `Organization` и будущей изоляцией данных.

Новые данные не должны становиться глобальными по умолчанию, если они относятся к:

- clinical / patient-facing / doctor-facing workflow;
- booking, schedule, appointments, rooms, branches, services;
- messaging, notifications, reminders, web-push, broadcast;
- media, catalog, treatment programs, exercises, recommendations, tests;
- products, payments, memberships, entitlements;
- settings, integrations, staff/admin surfaces.

Для таких данных перед изменением схемы или write-path нужно явно определить ownership path:

- прямой `organization_id`, если владение очевидно;
- путь через уже scoped parent, если прямое дублирование избыточно;
- `specialist_id`, если сущность действительно принадлежит конкретному специалисту внутри организации;
- patient/enrollment, appointment, program instance или другой scoped aggregate;
- настоящий global catalog только если сущность не принадлежит конкретной организации/специалисту/пациенту.

Если ownership неочевиден, нельзя молча добавлять unscoped таблицу/поле. Нужно остановить этот подпункт,
пометить его как `needs_decision` в каноническом плане и оставить там короткий design note для
dev-lead/владельца. В taskdb меняется только статус карточки и служебный `owner_waiting`.

## Что нельзя делать

- Не усиливать single-clinic / single-doctor assumption в новом коде.
- Не добавлять параллельную SaaS-модель или отдельные SaaS route trees без продуктового решения.
- Не добавлять ad hoc RLS policies, tenant enforcement или request-principal wiring до канонических этапов `DB_ACCESS_CHOKEPOINT` + `SAAS_FOUNDATION`.
- Не переносить tenant/org integration settings в env. Интеграционные настройки остаются DB-backed через org-aware `system_settings` и mirror-правила: global default = `organization_id IS NULL`, org override = тот же key/scope с non-null `organization_id`.
- Не обходить существующие `organizationId` / `specialistId` / scoped parent paths в доменах, где они уже есть.

## Что делать вместо этого

- Делать dormant/backward-compatible изменения: nullable fields, deterministic single-org backfill, indexes, service-level checks and documented compat plan.
- Использовать существующие domain models, ports, repositories and DI boundaries.
- Для новых write-paths сразу принимать/передавать текущий scoped context, если домен уже его поддерживает.
- Для migrations фиксировать backfill/rollback/compat assumptions в плане или migration comments, если это влияет на SaaS path.
- Для автономных задач сначала делать короткий preflight: найти текущую модель ownership в коде и документах, затем реализовывать только подтвержденный scope.
