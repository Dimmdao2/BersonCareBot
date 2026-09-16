# SaaS Product UX Initiative

**Статус:** staged execution in progress. Planning package 2026-07-16, complete owner review 2026-07-18 and owner
addendum 2026-07-19 are consolidated in
[`OWNER_REVIEW_2026-07-18.md`](./OWNER_REVIEW_2026-07-18.md); the binding execution DAG, current stage status and
task mappings are maintained in [`IMPLEMENTATION_ROADMAP.md`](./IMPLEMENTATION_ROADMAP.md) §7.3. Discovery task
`#787` is completed and accepted; implementation continues through the stage-specific taskdb cards named in that
roadmap. The earlier statement about `0` pending product decisions applies only to the 2026-07-16 packet.
**Рабочая ветка:** `feat/doctor-ui-rebuild`.
**Taskdb:** `#787` — historical discovery; execution — stage-specific cards in `IMPLEMENTATION_ROADMAP.md` §7.3.

## Цель

Спроектировать целевую продуктовую структуру Therapysto/Therapygo как specialist-oriented SaaS:

- какие роли и контексты существуют;
- какие экраны доступны каждой роли;
- как специалист или клиника регистрируется и настраивает рабочее пространство;
- как персонал приглашает коллег и пациентов;
- как пациент попадает в приложение, активируется и устанавливает PWA;
- как один пациент работает с несколькими организациями и специалистами;
- как устроены публичный лендинг, публичные страницы организаций, брендинг и custom domains;
- как будущая IA переиспользует текущие экраны без параллельных копий.

Итог инициативы — поэтапно реализованный и проверенный owner roadmap, поддержанный product/UX specification и
актуальным implementation backlog. Owner product gates для solo-first launch классифицированы; каждая реализация
всё равно проходит собственные implementation/foundation readiness и stage acceptance.

## Граница с текущим SAAS_FOUNDATION

Текущий канон `docs/_TODO/SAAS_FOUNDATION/` сохраняет ownership над enforcement, tenant walls и физическими
Rubitime/DB/release gates. Последний owner-review при этом **изменил** product sequencing и contracts тарифов,
settings, billing и capability activation; эти delta уже reconciled в `IMPLEMENTATION_ROADMAP.md` §7.3 и
подчинённых foundation-планах. Ни один старый foundation checklist не исполняется вопреки этой delta.

Здесь прорабатываются product authority, IA и пользовательские потоки; foundation определяет технические gates.
Исполнение идёт только через общий roadmap, а не через две независимые последовательности.

Запрещено в рамках discovery:

- менять текущие SaaS enforcement scripts и планы;
- менять tenant/RLS/auth модель ради удобства макета;
- создавать дублирующие деревья patient/doctor routes;
- реализовывать branding/custom-domain инфраструктуру до выбора целевого контракта;
- касаться интеграционных и release-веток или выполнять действия вне изолированного worktree.

## Канонические входы

- Единый owner-review от 2026-07-18 с датированным addendum 2026-07-19:
  [`OWNER_REVIEW_2026-07-18.md`](./OWNER_REVIEW_2026-07-18.md) — последний канон глобальных продуктовых решений и UI
  corrections этой сессии; при конфликте его более поздняя финальная формулировка побеждает более ранние product/UX
  документы;
- Foundation-решения владельца: `docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md` — высший приоритет в
  foundation/tenant/enforcement scope;
- UX product-решения владельца от 2026-07-16: `OWNER_RULINGS_2026-07-16.md` — предыдущий authority, действующий в
  части, не изменённой единым owner-review от 2026-07-18;
- порядок текущей SaaS-работы: `docs/_TODO/SAAS_FOUNDATION/SEQUENCE.md`;
- текущий SaaS execution plan: `docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md`;
- обзор продукта: `docs/PRODUCT_OVERVIEW.md`;
- во время активной UI-переработки геометрия экранов определяется только по текущему коду и live UI; прежний
  inventory архивирован как негодный и не является authority;
- текущая навигация специалиста: `docs/ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md`;
- продуктовая структура специалиста: `docs/ARCHITECTURE/SPECIALIST_CABINET_STRUCTURE.md`;
- identity tiers: `docs/ARCHITECTURE/PLATFORM_IDENTITY_SPECIFICATION.md`;
- каналы уведомлений: `docs/ARCHITECTURE/NOTIFICATION_CHANNELS.md`;
- агентная оркестрация: `docs/AGENT_AUTORUN_SCHEME.md` и `docs/ORCHESTRATION_BINDINGS.md`.

Если старый product/UX text противоречит `OWNER_REVIEW_2026-07-18.md`, побеждает финальная формулировка review.
`OWNER_RULINGS_2026-07-16.md` сохраняет силу в остальной области. Foundation rulings 2026-07-15 сохраняют
приоритет в foundation/enforcement-инвариантах. Новая product-гипотеза не подписывается как решение владельца.

## Правило актуальности документов

- **Решение владельца 2026-07-18:** не плодить отдельные документы с частичными или конкурирующими условиями.
  Сначала обновляется существующий канон. Новый сводный документ допустим только когда для него есть явная роль и
  в него перенесены все ещё действующие, но не реализованные решения из заменяемых документов.
- Этот `README.md`, `REQUIREMENTS.md` и `ROADMAP.md` — существующий канон инициативы; новые решения сначала
  исправляют их, а не создают параллельный документ с конкурирующей версией правил.
- Новый файл создаётся только когда он заранее указан в `ROADMAP.md` как самостоятельный выход фазы или нужен как
  обязательный audit/evidence record. Ad hoc документы с новыми правилами или решениями запрещены.
- Устаревшее положение обновляется или явно помечается историческим в том же каноническом документе. Нельзя
  оставлять две формулировки без указания, какая действует.
- Если старый документ полностью заменён, в его начале ставится явная пометка `SUPERSEDED`/`УСТАРЕЛ`, ссылка на
  действующий канон и краткое описание границы замены. Такой файл остаётся только для истории и старых ссылок.
- Если два документа по архитектурной причине должны сосуществовать, в обоих указываются направления ссылок,
  области ответственности и приоритет при конфликте; изменение общего контракта синхронизируется в той же задаче.
- Перед началом implementation агент обязан проверить, что каждое используемое условие имеет один действующий
  authority, а ещё не реализованные решения не потерялись при переносе.
- Рекомендация агента, safe default и owner decision всегда маркируются раздельно. Решением владельца считается
  только явно высказанное и трассируемое решение владельца.

## Артефакты

- `OWNER_REVIEW_2026-07-18.md` — единый канон всей диктовки 2026-07-18: продуктовые решения, открытые вопросы,
  UI-дефекты и acceptance delta;
- `OWNER_RULINGS_2026-07-16.md` — предыдущий product/UX authority и solo-first launch boundary, действующий в
  части, не изменённой review 2026-07-18;
- `OWNER_DECISION_PACKET.md` — superseded исходные варианты/history, подчинённые dated rulings;
- `REQUIREMENTS.md` — цель, исходные требования, ограничения и стартовые гипотезы;
- `ROADMAP.md` — этапы исследования, роли исполнителей и критерии закрытия;
- `CURRENT_STATE_BASELINE.md` — стартовая карта уже существующих поверхностей;
- `SCREEN_INVENTORY_PATIENT_PUBLIC.md` и `SCREEN_INVENTORY_SPECIALIST.md` — route/family inventory;
- `UX01_EVIDENCE_MANIFEST.md` и `UX01_VISUAL_ATTEMPT_LEDGER.md` — текущая evidence-классификация;
- `UX01_PATIENT_REPLAY_AUDIT_2026-07-15.md` — актуальный независимый PASS UX-01;
- `UX01_FRESH_AUDIT_2026-07-15.md` — исторический FAIL до разблокировки DEV и patient replay;
- `UX02_PRODUCT_PATTERNS.md` и `UX02_TECHNICAL_PATTERNS.md` — внешние product/technical patterns;
- `UX02_RESEARCH_AUDIT.md` — независимый PASS внешнего исследования;
- `OPERATING_MODEL.md` и `ROLE_CAPABILITY_MATRIX.md` — decision-ready модель ролей, контекстов и capabilities;
- `UX03_INDEPENDENT_AUDIT.md` — historical pre-ruling PASS operating model; superseded for current acceptance;
- `ENTRY_AND_INVITE_JOURNEYS.md` и `UX04_SCREEN_STATE_LIST.md` — acquisition/invite/activation/install journeys и
  проекция экранных состояний;
- `UX04_INDEPENDENT_AUDIT.md` — historical pre-ruling identity/security/product PASS;
- `BRANDING_DOMAIN_CONTRACT.md` и `BRANDING_CAPABILITY_MATRIX.md` — branding/domain/sender/PWA contract;
- `UX05_INDEPENDENT_AUDIT.md` — historical pre-ruling product/architecture PASS;
- `TARGET_IA.md`, `SCREEN_COMPOSITION.md` и `ROUTE_MIGRATION_MAP.md` — целевая IA, канонический состав экранов и
  полная current→target migration map;
- `UX06_INDEPENDENT_AUDIT.md` — historical pre-ruling full-coverage PASS;
- `UX07_PROTOTYPE_INDEX.md`, `UX07_USABILITY_FINDINGS.md` и `ux07-prototype/index.html` — навигируемый прототип
  ключевых сценариев и наблюдения по нему;
- `UX07_INDEPENDENT_AUDIT.md` — historical pre-ruling visual/usability PASS and seals; current acceptance superseded;
- `IMPLEMENTATION_ROADMAP.md` — binding roadmap: existing U-stage DAG plus owner-review correction program C0-C7
  and residual structured-identity stage C2F;
- `UX09_INDEPENDENT_AUDIT.md` — исторический PASS pre-ruling owner packet/roadmap; актуальный полный
  cross-contract audit записан в `LOG.md`;
- `LOG.md` — журнал фактов, решений и проверок.
