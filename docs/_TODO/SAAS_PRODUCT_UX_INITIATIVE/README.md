# SaaS Product UX Initiative

**Статус:** discovery / planning.  
**Рабочая ветка:** `feat/saas-interface-work3`.  
**Taskdb:** `#787`.

## Цель

Спроектировать целевую продуктовую структуру BersonCare как specialist-oriented SaaS:

- какие роли и контексты существуют;
- какие экраны доступны каждой роли;
- как специалист или клиника регистрируется и настраивает рабочее пространство;
- как персонал приглашает коллег и пациентов;
- как пациент попадает в приложение, активируется и устанавливает PWA;
- как один пациент работает с несколькими организациями и специалистами;
- как устроены публичный лендинг, публичные страницы организаций, брендинг и custom domains;
- как будущая IA переиспользует текущие экраны без параллельных копий.

Итог инициативы — проверяемая product/UX specification и implementation backlog. Реализация экранов начинается только после закрытия decision gates и сверки с текущим SaaS-планом.

## Граница с текущим SAAS_FOUNDATION

Текущий канон `docs/_TODO/SAAS_FOUNDATION/` ведёт систему к полностью рабочему multi-organization состоянию на TEST. Эта инициатива не меняет его порядок, enforcement, tenant walls, Rubitime retirement, тарифы или settings-root работы.

Здесь отдельно прорабатываются продуктовая IA и будущие пользовательские потоки. Результаты передаются в основной SaaS-план только как согласованные UX-контракты и implementation epics.

Запрещено в рамках discovery:

- менять текущие SaaS enforcement scripts и планы;
- менять tenant/RLS/auth модель ради удобства макета;
- создавать дублирующие деревья patient/doctor routes;
- реализовывать branding/custom-domain инфраструктуру до выбора целевого контракта;
- касаться интеграционных и release-веток или выполнять действия вне изолированного worktree.

## Канонические входы

- решения владельца: `docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md`;
- порядок текущей SaaS-работы: `docs/_TODO/SAAS_FOUNDATION/SEQUENCE.md`;
- текущий SaaS execution plan: `docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md`;
- обзор продукта: `docs/PRODUCT_OVERVIEW.md`;
- фактическая геометрия экранов: `docs/ARCHITECTURE/SCREEN_LAYOUT_INVENTORY.md`;
- текущая навигация специалиста: `docs/ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md`;
- продуктовая структура специалиста: `docs/ARCHITECTURE/SPECIALIST_CABINET_STRUCTURE.md`;
- identity tiers: `docs/ARCHITECTURE/PLATFORM_IDENTITY_SPECIFICATION.md`;
- каналы уведомлений: `docs/ARCHITECTURE/NOTIFICATION_CHANNELS.md`;
- агентная оркестрация: `docs/AGENT_AUTORUN_SCHEME.md` и `docs/ORCHESTRATION_BINDINGS.md`.

Если старый roadmap противоречит `OWNER_RULINGS_2026-07-15.md`, побеждают rulings. Новая product-гипотеза не подписывается как решение владельца до явной фиксации.

## Артефакты

- `REQUIREMENTS.md` — цель, исходные требования, ограничения и стартовые гипотезы;
- `ROADMAP.md` — этапы исследования, роли исполнителей и критерии закрытия;
- `CURRENT_STATE_BASELINE.md` — стартовая карта уже существующих поверхностей;
- `SCREEN_INVENTORY_PATIENT_PUBLIC.md` и `SCREEN_INVENTORY_SPECIALIST.md` — route/family inventory;
- `UX01_EVIDENCE_MANIFEST.md` и `UX01_VISUAL_ATTEMPT_LEDGER.md` — текущая evidence-классификация;
- `UX01_FRESH_AUDIT_2026-07-15.md` — актуальный независимый вердикт UX-01;
- `LOG.md` — журнал фактов, решений и проверок.
