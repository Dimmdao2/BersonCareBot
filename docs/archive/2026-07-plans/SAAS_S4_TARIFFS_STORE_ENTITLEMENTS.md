> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md

# SaaS S4 — тарифы, магазин, entitlements, биллинг и безопасная аналитика

> ⚠️ **ПРИОРИТЕТ 30.07: при любом расхождении прав `TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a и канон
> `QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md`, а не этот файл.** Здесь 83 открытых чекбокса по той же теме, написанных
> раньше; часть уже сделана, часть отменена решениями владельца 30.07 (агент не решает, что ограничивать; лестница
> состояний настраивается владельцем; чтение тоже ограничивается скрытием раздела). Файл сохранён только до построчной
> сверки — пункт 6a.4 плана. Не брать отсюда работу, не сверившись с §5a.

> План этапа 4 из [`SEQUENCE.md`](./SEQUENCE.md). При конфликте старых формулировок с
> [`OWNER_RULINGS_2026-07-15.md`](./OWNER_RULINGS_2026-07-15.md) приоритет имеют дословные рулинги владельца.
> Для product/commercial scope последняя обязательная delta —
> [`../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md`](../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md)
> §§P1-P5, 13, 15. Она побеждает старые defaults и варианты, не меняя foundation safety gates.
> Этот файл задаёт только работу для полностью функционирующей системы на тестовом сервере.

## 0. Результат

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

На тестовом сервере должен работать единый коммерческий контур:

`тариф как данные → полный набор механик → клиника → requireEntitlement() → разрешённое действие`

Поверх него работают:

- global_admin-конструктор тарифов, цен, состава механик и точечных override для клиники;
- boolean entitlements, numeric/unlimited quotas, настраиваемая trial-policy и clinic seats/add-ons;
- три режима упражнений: own-only, новая platform base library и независимо подключаемый позднее store;
- два billing surface: global platform operations и org-facing «Тариф и биллинг», достроенные поверх существующих
  PSP adapters, payment intents, refunds и webhook verification;
- аналитика по клиникам как клиентам платформы: биллинг, агрегированное использование и общая нагрузка;
- существующие пациентские абонементы без повторной реализации.

Файлы упражнений и медиа никогда не копируются: любой тарифный или купленный доступ — source-aware grant на
канонический `content_id`.

## 1. Канон и провенанс

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### Решения владельца

| Решение                                                                                                    | Источник                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Тариф → механики → клиника; цены и состав настраивает global_admin                                         | [`OWNER_RULINGS_2026-07-15.md:28-34`](./OWNER_RULINGS_2026-07-15.md), [`OWNER_DECISIONS_FOR_REVIEW.md:39-42`](./OWNER_DECISIONS_FOR_REVIEW.md) |
| Полный конструктор механик сразу; override на конкретную клинику сохраняется                               | [`OWNER_RULINGS_2026-07-15.md:28-34`](./OWNER_RULINGS_2026-07-15.md)                                                                           |
| Платёжная система уже есть и почти готова; её не удалять, а достраивать; ключи владелец даст позже         | [`OWNER_RULINGS_2026-07-15.md:10-19`](./OWNER_RULINGS_2026-07-15.md)                                                                           |
| Купленные пакеты и собственные упражнения клиники сосуществуют; магазин не поглощает clinic-owned feature  | [`OWNER_RULINGS_2026-07-15.md:35-44`](./OWNER_RULINGS_2026-07-15.md)                                                                           |
| Файлы не копируются; доступ выдаётся грантом на канонический `content_id`                                  | [`OWNER_DECISIONS_FOR_REVIEW.md:49-51`](./OWNER_DECISIONS_FOR_REVIEW.md)                                                                       |
| Global_admin нужна аналитика по клиникам как клиентам, биллингу, использованию и общей нагрузке платформы  | [`OWNER_RULINGS_2026-07-15.md:45-63`](./OWNER_RULINGS_2026-07-15.md)                                                                           |
| Персональная аналитика пациентов чужих клиник, выполнение упражнений и переписка не входят в platform view | [`OWNER_RULINGS_2026-07-15.md:50-63`](./OWNER_RULINGS_2026-07-15.md)                                                                           |
| Точный набор метрик определяется в конце                                                                   | [`OWNER_RULINGS_2026-07-15.md:60-63`](./OWNER_RULINGS_2026-07-15.md)                                                                           |
| Система абонементов существует; сначала проверить наличие кнопки пересчёта                                 | [`OWNER_RULINGS_2026-07-15.md:115-120`](./OWNER_RULINGS_2026-07-15.md)                                                                         |
| Названия/число тарифов не фиксируются; global admin собирает их из boolean mechanics и quotas              | [`../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md`](../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md) §P1                     |
| Trial ссылается на выбранный управляемый тариф и имеет настраиваемую длительность                          | тот же источник, §P2                                                                                                                           |
| Clinic mode и приглашённые специалисты ограничиваются entitlement/местами либо доплатой                    | тот же источник, §§P1,15                                                                                                                       |
| Exercise model = own-only / новая base library / future store; owner-clinic content не становится global   | тот же источник, §P4                                                                                                                           |
| Billing принадлежит организации; нужны отдельные global-operator и org-payer surfaces                      | тот же источник, §§P3,15                                                                                                                       |

Порядок S4-0…S4-6 ниже — **инженерное предложение**, а не решение владельца. Он выбран по зависимостям данных:
сначала registry и chokepoint, затем независимо активируемые tariff/ownership/billing/analytics branches. Future
store исполняется только после отдельной активации C5D и не является промежуточным gate для billing или launch.

### Инженерный канон исполнения

- порядок инициативы: [`SEQUENCE.md`](./SEQUENCE.md);
- tenant/principal/aggregate boundaries: [`SAAS_ENFORCE_ROADMAP.md`](./SAAS_ENFORCE_ROADMAP.md);
- ownership и clean architecture: [`AGENTS.md`](../../../AGENTS.md),
  [`.cursor/rules/saas-foundation-aware-development.mdc`](../../../.cursor/rules/saas-foundation-aware-development.mdc),
  [`.cursor/rules/clean-architecture-module-isolation.mdc`](../../../.cursor/rules/clean-architecture-module-isolation.mdc);
- DB-backed provider credentials: [`.cursor/rules/000-critical-integration-config-in-db.mdc`](../../../.cursor/rules/000-critical-integration-config-in-db.mdc),
  [`.cursor/rules/system-settings-integrator-mirror.mdc`](../../../.cursor/rules/system-settings-integrator-mirror.mdc);
- этапный worker/audit/fixer loop и доказательства: [`ORCHESTRATION_BINDINGS.md`](../../ORCHESTRATION_BINDINGS.md).

## 2. Reality lock на 2026-07-15 — исторический снимок

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

> **Не использовать как current execution selector.** После этого снимка S4-0/S4-1 закрыты `#888`, S4-2/C5A —
> `#751`, а двенадцать residual entitlement bypass — `#939`. Текущие статусы находятся в чек-листах ниже и в
> единственном product DAG `SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`; открытыми остаются только явно
> незакрытые S4-4/C5B, C5C/C5D, S4-5/C6 и TEST/C7 ветви.

| Область           | Уже есть                                                                                                                                                                                                                                                                                                                                                                                                   | Что нужно достроить                                                                                                                                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entitlements      | `saas_tariffs`, `be_organizations.tariff_id`, `saas_org_entitlement_overrides` ([`saasEntitlements.ts:24-59`](../../../apps/webapp/db/schema/saasEntitlements.ts)); typed `MECHANICS` и resolver `override > tariff > current default` ([`types.ts:6-23`](../../../apps/webapp/src/modules/org-entitlements/types.ts), [`service.ts:10-36`](../../../apps/webapp/src/modules/org-entitlements/service.ts)) | Полный method-level registry, global_admin CRUD/assignment/override UI и системное покрытие механик                                                                                                                                                                                               |
| Chokepoint        | `requireEntitlement()` существует ([`requireEntitlement.ts:7-23`](../../../apps/webapp/src/app-layer/guards/requireEntitlement.ts))                                                                                                                                                                                                                                                                        | Сейчас используется только в одном slice; auth вызывается повторно; нет coverage gate                                                                                                                                                                                                             |
| PSP adapters      | Общий `PaymentProviderPort.createIntent/refund/verifyWebhook` ([`providerPort.ts:11-33`](../../../apps/webapp/src/modules/payments/providerPort.ts)); registry с mock, YooKassa, Tinkoff, CloudPayments и Alfa-Bank ([`paymentProviderRegistry.ts:8-45`](../../../apps/webapp/src/infra/payments/paymentProviderRegistry.ts))                                                                              | Не переписывать adapters; проверить provider contracts и подключить их к org-facing SaaS billing                                                                                                                                                                                                  |
| Платёжный ledger  | Org-scoped intents/payments/refunds/provider events и idempotency уже есть ([`bookingPayments.ts:93-231`](../../../apps/webapp/db/schema/bookingPayments.ts)); service создаёт intents, capture и refund ([`payments/service.ts:136-299`](../../../apps/webapp/src/modules/payments/service.ts), [`payments/service.ts:327-512`](../../../apps/webapp/src/modules/payments/service.ts))                    | Это booking/patient commerce, а не subscription ledger клиники. Нужен отдельный org-facing lifecycle без второго PSP abstraction                                                                                                                                                                  |
| Webhooks          | Подписанный route определяет клинику по intent/provider ref и исполняет capture под org principal ([`payments/webhook/[provider]/route.ts:10-64`](../../../apps/webapp/src/app/api/payments/webhook/[provider]/route.ts))                                                                                                                                                                                  | Добавить отдельный SaaS webhook path/config boundary; не смешивать platform merchant с per-org booking merchant                                                                                                                                                                                   |
| Payment UI/config | Provider credentials редактируются в Settings и хранятся в `system_settings` ([`BookingPaymentsSection.tsx:41-75`](../../../apps/webapp/src/app/app/settings/BookingPaymentsSection.tsx), [`system-settings/types.ts:111-123`](../../../apps/webapp/src/modules/system-settings/types.ts))                                                                                                                 | Текущая секция относится к оплате записи; patient pay clients завершают только mock ([`PatientPackagePayClient.tsx:42-79`](../../../apps/webapp/src/app/app/patient/memberships/pay/PatientPackagePayClient.tsx)). Для SaaS billing нужны отдельная global config и реальный redirect/status flow |
| Store grants      | `content_access_grants_webapp` уже несёт `organization_id`, canonical `content_id`, expiry/revoke ([`schema.ts:370-395`](../../../apps/webapp/db/schema/schema.ts)); `modules/entitlements` выдаёт user grants ([`entitlements/service.ts:5-40`](../../../apps/webapp/src/modules/entitlements/service.ts))                                                                                                | Эволюционировать существующий grant path для org targets; третья grant table запрещена                                                                                                                                                                                                            |
| LFK               | `lfk_exercises`, media и ordered templates имеют `organization_id`; `NULL` может обозначать platform content ([`schema.ts:906-1023`](../../../apps/webapp/db/schema/schema.ts))                                                                                                                                                                                                                            | Store package должен ссылаться на canonical template/exercise IDs; clinic create/edit flow остаётся отдельным                                                                                                                                                                                     |
| Аналитика         | Raw/user rows содержат `organization_id`, но ingest его не передаёт; platform hourly не имеет org dimension ([`productAnalytics.ts:53-147`](../../../apps/webapp/db/schema/productAnalytics.ts), [`types.ts:56-68`](../../../apps/webapp/src/modules/product-analytics/types.ts), [`pgProductAnalytics.ts:57-176`](../../../apps/webapp/src/infra/repos/pgProductAnalytics.ts))                            | Отдельная PII-free platform aggregate projection. Существующий `clientActivity` с `userId/displayName` ([`types.ts:161-186`](../../../apps/webapp/src/modules/product-analytics/types.ts)) нельзя отдавать platform analytics                                                                     |
| Абонементы        | Кнопка, route, service, concurrency guard и тесты уже существуют                                                                                                                                                                                                                                                                                                                                           | Пункт владельца закрыт фактом; новой реализации в S4 нет, см. §10                                                                                                                                                                                                                                 |

Термины не смешивать:

- SaaS tariff — цена и механики платформы для клиники;
- SaaS subscription — оплачиваемый период доступа клиники к тарифу;
- store exercise package — курируемый пакет platform content для клиники;
- patient membership — абонемент пациента на услуги внутри клиники;
- `be_products` — clinic-owned продукт для пациента.

## 3. Неподвижные рамки

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- Изменять только webapp-домены tariffs/entitlements/store/SaaS billing/platform analytics и их тесты/доки.
- Не создавать второй LFK/media engine, второй PSP registry, второй memberships domain или третью grant table.
- Platform package — настоящий global catalog; tariff assignment, subscription, invoice, purchase и grant имеют явный
  `organization_id` или scoped parent.
- Provider keys/webhook secrets хранятся только в DB-backed `system_settings`, редактируются global_admin и никогда
  не попадают в env, клиентский JSON, screenshot или лог.
- `booking_payment_providers` остаётся конфигурацией оплаты записи конкретной клиники. Platform merchant получает
  отдельный global setting key; смешивать эти credentials нельзя.
- Tenant resolution и authorization выполняются раньше entitlement. `organizationId` из body/query не является
  источником полномочий.
- Единственный механизм feature-gating — `requireEntitlement(ctx, mechanic)`; локальные проверки тарифа/override в
  routes и services запрещены.
- Platform cross-clinic operations проходят отдельный audited platform port/capability, не `adminMode`, не случайную
  clinic session и не DB bypass.
- Store purchase никогда не создаёт новую строку упражнения, media file или object key.
- Platform analytics storage/API не содержит patient/user IDs, ФИО, телефоны, email, тексты сообщений, содержимое
  программ, факты выполнения конкретным пациентом или free-form metadata.
- UI использует существующий global_admin shell и doctor shared primitives. Новые path names в пунктах ниже —
  инженерные имена; перед реализацией их сверяют с актуальным nav contract, не создавая второй shell.

## 4. Порядок исполнения

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

```text
S4-0 -> S4-1 -> S4-2 ---------------------------> S4-6(included scope)
          +----> C4D own/base ownership --------> S4-6(included scope)
          +----> S4-4/C5B billing -> S4-5/C6 ---> S4-6(included scope)
          +----> S4-3/C5D future store (deferred, explicit activation only)
```

- S4-0 фиксирует полный registry и ownership/data contracts.
- S4-1 создаёт один проверяемый entitlement boundary.
- S4-2 даёт global_admin управление тарифами, quotas, trial-policy, clinic seats и overrides.
- C4D сначала доказывает own/base ownership. S4-3 добавляет future store grants только после отдельного C5D gate.
- S4-4 подключает существующий PSP foundation к двум SaaS billing surfaces; store orders — отдельное C5D extension.
- S4-5 создаёт PII-free aggregate boundary; точные метрики утверждаются только в конце этапа.
- S4-6 доказывает весь контур на тестовом сервере.

Каждый checkbox закрывается записью: **изменение · точные `file:line` после изменения · доказательство и результат**.
Если новый файл ещё не существует, стартовой точкой служит указанный существующий anchor, а окончательные строки
фиксируются в execution log.

### Crosswalk к единственному product roadmap

| S4 technical stage              | Product stage                                 |
| ------------------------------- | --------------------------------------------- |
| S4-0/S4-1 registry + chokepoint | C4A-D и C5A-D shared foundation               |
| S4-2 tariffs/quotas/trial/seats | C5A; seat enforcement C4A, commerce C5C       |
| S4-3 own/base/store grants      | C4D own/base; C5D future store commerce       |
| S4-4 SaaS billing               | C5B; organization tab в C3 shell              |
| S4-5 analytics                  | C6                                            |
| S4-6 TEST proof                 | C7 только для фактически включённых substages |

S4 — технический sub-plan, не второй источник product sequencing. Future store/course/full CMS не становятся
launch dependencies из-за наличия checklist ниже.

## 5. S4-0 — mechanic, ownership и payment-contract inventory

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

**Статус 2026-07-22: [x] закрыто `#888`, accepted; integration `4ae94a0a2` + `b0703b605`, поздний residual
coverage `#939` закрыт `84bf193ac`. Повторно не исполнять.**

**Стартовые точки:** [`org-entitlements/types.ts:6-23`](../../../apps/webapp/src/modules/org-entitlements/types.ts),
[`org-entitlements/service.ts:10-36`](../../../apps/webapp/src/modules/org-entitlements/service.ts),
[`providerPort.ts:11-33`](../../../apps/webapp/src/modules/payments/providerPort.ts),
[`bookingPayments.ts:93-231`](../../../apps/webapp/db/schema/bookingPayments.ts),
[`content_access_grants_webapp:370-395`](../../../apps/webapp/db/schema/schema.ts).

- [x] Построить method-level матрицу `mechanic → entrypoint/action → auth/context source → requireEntitlement →
service/port` с `file:line` для каждого реального action. Доказательство: checker сопоставляет export/action symbols,
      а не каталоги routes; неизвестный или двойной mapping даёт non-zero.
- [x] Сверить все ключи `MECHANICS` с реальными поверхностями. Отсутствующая поверхность получает
      `declared_no_surface` + code-search evidence; route ради флага не создаётся.
- [x] Зафиксировать единую typed registry с ключом и русской подписью; constructor, chokepoint и checker импортируют
      её, локальных массивов mechanic keys нет.
- [x] Зафиксировать инженерный compatibility path для клиники без тарифа: до назначения всем существующим test-org
      явного тарифа сохраняется текущий resolver result; после заполнения fixture/data gate implicit default не используется
      для новых test-org. Доказательство: migration/fixture report `unassigned org = 0` и resolver tests на assigned,
      override и intentionally-unassigned cases.
- [x] Описать ownership новых сущностей до DDL: platform package/tariff = global catalog; subscription/invoice/order/
      grant = direct org или scoped parent; analytics aggregate = org bucket без person identity.
- [x] Провести provider contract inventory по всем четырём real adapters: checkout URL, provider intent ref,
      idempotency, success/refund event, amount/currency verification и signature/status verification. Доказательство:
      таблица по adapters + contract tests; неподтверждённый callback не может активировать subscription/grant.
- [x] Зафиксировать отдельные config identities: existing per-org booking merchant и new global SaaS merchant.
      Доказательство: разные typed accessors/settings keys и тест отсутствия fallback между ними.
- [x] Зафиксировать один source-aware tariff access contract: временно существующий `be_organizations.tariff_id`
      остаётся compatibility projection; конечный resolver различает manual assignment и active paid subscription,
      не держит две расходящиеся истины и не снимает доступ одного source при завершении другого.

**Проверка:** inventory checker self-test; resolver/provider contract unit tests; webapp typecheck.

**Выход:** реализация следующих фаз не угадывает mechanics, ownership, provider behavior или source of truth.

## 6. S4-1 — один requireEntitlement() chokepoint

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

**Статус 2026-07-22: [x] закрыто `#888`, accepted; method/action residual закрыт `#939` / `84bf193ac`.
Повторно не исполнять.**

**Стартовые точки:** [`requireEntitlement.ts:7-23`](../../../apps/webapp/src/app-layer/guards/requireEntitlement.ts),
[`requireEntitlement.test.ts:1-79`](../../../apps/webapp/src/app-layer/guards/requireEntitlement.test.ts),
[`courses/route.ts:49-77`](../../../apps/webapp/src/app/api/doctor/courses/route.ts),
[`buildAppDeps.ts:1583-1585`](../../../apps/webapp/src/app-layer/di/buildAppDeps.ts).

- [x] Привести guard к typed контракту `requireEntitlement(ctx, mechanic)`: context уже авторизован и содержит
      server-derived org; guard обращается только к `orgEntitlements` и возвращает единый 403
      `entitlement_required` с mechanic key.
- [x] Убрать повторный auth call из существующего courses slice. Доказательство: одна auth/context resolution на
      request; service не вызывается после 401/403.
- [x] Применить S4-0 mapping ко всем `protected` actions. Для feature с несколькими aliases gate стоит на общем
      application command/feature boundary, а не копируется по routes.
- [x] Доказать ordering `auth → tenant/principal → entitlement → service`: unauthenticated, wrong role/org,
      disabled mechanic и success имеют разные ожидаемые результаты.
- [x] Доказать org isolation: override/tariff A не меняет B; forged org ID не меняет target resolver.
- [x] Добавить static guard: прямые `isMechanicEnabled` и чтения tariff/override из feature routes/services вне
      единственного boundary дают non-zero.

**Проверка:** guard tests; по одному contract test на action family; static checker + self-test; webapp lint/typecheck.

**Выход:** coverage checker сообщает `protected actions = mapped actions`, дублирующих entitlement rules нет.

## 7. S4-2 — global_admin-конструктор тарифов и overrides

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

**Статус 2026-07-22: [x] закрыто C5A `#751`, integration through `a678d043d`; accumulated milestone
`c6a8930c2` green. S4-4/C5B billing и C5C seat commerce этим не закрыты.**

**Стартовые точки:** [`saasEntitlements.ts:24-59`](../../../apps/webapp/db/schema/saasEntitlements.ts),
[`pgOrgEntitlements.ts:16-43`](../../../apps/webapp/src/infra/repos/pgOrgEntitlements.ts),
[`doctorNavLinks.ts:36-52`](../../../apps/webapp/src/shared/ui/doctor/doctorNavLinks.ts),
[`doctorNavLinks.ts:105-135`](../../../apps/webapp/src/shared/ui/doctor/doctorNavLinks.ts).

- [x] Расширить существующий `modules/org-entitlements` typed CRUD: tariff list/get/create/update/deactivate,
      assign/unassign, override list/upsert/delete. Новый соседний tariffs module не создаётся.
- [x] Хранить name, description, `priceMinor`, currency, billing period и полный mechanic map как DB data.
      Hardcoded tier names/prices/compositions отсутствуют.
- [x] Registry различает boolean entitlement и numeric/unlimited quota. Для каждой quota до enforcement записаны
      unit, reset/period, soft/hard behavior, upgrade/downgrade/overage semantics и source of usage; `null`, `0` и
      `unlimited` не смешиваются.
- [x] Добавить global trial-policy: ссылка на существующий active tariff, duration и start event. `Light/Pro`, 14/30
      дней и фиксированный стартовый состав отсутствуют. Post-trial/grace и судьба созданных данных реализуются только
      после decision gate §13.
- [x] Clinic entitlement хранит included specialist seats и/или per-seat add-on policy. Team UI/API показывают
      used/available seats; invitation проверяет limit server-side. Downgrade/overage не удаляет membership молча.
- [x] Валидировать mechanics только по registry S4-0; отсутствующий UI-toggle не может тихо потерять mechanic key.
- [x] Реализовать узкий platform write port для manual tariff assignment. До S4-4 он транзакционно меняет только
      compatibility `be_organizations.tariff_id`; S4-4 мигрирует такие назначения в source=`manual` и оставляет колонку
      только согласованной projection, не универсальным editor организации.
- [x] Override identity остаётся `(organization_id, mechanic)`; delete возвращает tariff default, а не сохраняет
      копию этого default.
- [x] Global_admin page содержит tariff list/editor, цену/период, grid всех mechanics, clinic assignment и override.
      `clinic_admin`/doctor не видят nav item и получают 403 на API.
- [x] Audit event содержит actor, target org, tariff, before/after mechanic map и reason без secret/PII.
- [x] E2E contract: tariff с mechanic=false → A denied; B unchanged; override A=true → allowed; delete override →
      denied; смена тарифа меняет доступ через тот же chokepoint.

**Проверка:** module/PG/API tests; authz A/B matrix; constructor RTL; desktop/mobile visual acceptance.

**Выход:** тарифная сетка, цены, период, mechanics и clinic override управляются global_admin как данные.

## 8A. C4D — own-only и platform-base ownership (исполняется без store)

- [ ] Code-search-first inventory: для exercise/template/media list, direct ID, count, search, picker, assignment и
      playback зафиксировать ownership source и current tenant guard; неизвестный path остаётся gap, не становится global.
- [ ] Режим `own_only` показывает organization только её exercises/templates/media и не читает owner-clinic content
      другой organization ни через list, ни через direct ID.
- [ ] Режим `platform_base` добавляет отдельную platform library, создаваемую с нуля global admin. Existing
      owner-clinic exercises не мигрируют и не публикуются автоматически.
- [ ] Global admin управляет composition platform base; тариф может включать base-library entitlement без purchase,
      grant или store surface.
- [ ] Publication clinic→platform отсутствует до отдельного workflow/licensing/moderation owner decision.
- [ ] Entitlement OFF/ON/downgrade проверяется server-side и в UI. Hidden navigation не заменяет direct API/media
      denial; current program instances не теряют canonical content без явной downgrade policy.
- [ ] Synthetic org A/B acceptance закрывает list/direct/count/search/picker/assignment/media negatives, owner-only
      content privacy, base visibility и отсутствие copied rows/object keys.
- [ ] Desktop/mobile acceptance показывает own-only и own+base состояния; future store отсутствует, а не рендерится
      пустым/сломавшимся экраном.

**Выход C4D:** private organization library и новая platform base library сосуществуют без смешивания ownership;
магазин не нужен для выполнения или приёмки этого этапа.

## 8B. S4-3 — future store packages (deferred; только после активации C5D)

**Execution gate:** этот checklist не берётся агентом автоматически после S4-2/C4D и не входит в launch acceptance.
Начало разрешено только после owner decisions по commerce/licensing/moderation и явной активации C5D. До этого
исполняются только own-only + platform-base ownership пункты C4D, перечисленные в общем roadmap.

**Стартовые точки:** [`schema.ts:906-1023`](../../../apps/webapp/db/schema/schema.ts),
[`entitlements/ports.ts:1-20`](../../../apps/webapp/src/modules/entitlements/ports.ts),
[`entitlements/service.ts:5-40`](../../../apps/webapp/src/modules/entitlements/service.ts),
[`pgEntitlements.ts:9-76`](../../../apps/webapp/src/infra/repos/pgEntitlements.ts),
[`content_access_grants_webapp:370-395`](../../../apps/webapp/db/schema/schema.ts).

- [ ] После активации C5D добавить platform package entity с commercial metadata, price/currency/access duration и ссылкой
      на существующий ordered `lfk_complex_template`; exercises/media остаются canonical rows.
- [ ] Platform package composition может ссылаться только на platform exercises/templates. Clinic-owned exercise
      create/edit/list продолжает жить в текущем LFK flow и не становится store content.
- [ ] Эволюционировать `content_access_grants_webapp` и `modules/entitlements` для org target: source kind/id,
      organizationId, contentId, expiry/revoke, idempotency. Существующие user grants и integrator projection не ломаются;
      третья grant table не создаётся.
- [ ] Grant одного source идемпотентен. Revoke/refund удаляет только этот source; доступ сохраняется, если тот же
      `content_id` покрыт другим active tariff/purchase/manual source.
- [ ] Access predicate clinic-facing store: own clinic content OR active org grant. Patient program assignment остаётся
      отдельным patient access source и не расширяет clinic-wide store visibility.
- [ ] Добавить no-copy invariant: package grant/order не создаёт `lfk_exercises`, `lfk_exercise_media`, `media_files`
      или object keys; IDs до/после совпадают.
- [ ] `exercise_packages` mechanic и specific package grant проверяются раздельно: mechanic ON не открывает все
      packages; grant без mechanic ON не открывает store surface.
- [ ] Global_admin курирует/архивирует packages; clinic_admin/doctor только видят разрешённое и используют купленное
      рядом со своими упражнениями.
- [ ] A/B negatives закрывают list, direct package ID, direct exercise ID и media playback; B без grant не получает
      package/content A.
- [ ] Поддержать два source path: package включён в tariff composition и package куплен отдельно. Оба создают
      source-aware grants на те же canonical content IDs.

**Проверка:** package/grant service+PG tests; RLS/IDOR A/B matrix; no-copy invariant; curator/store visual acceptance.

**Выход:** купленные пакеты и clinic-owned exercises одновременно доступны клинике, не смешаны и не копируют файлы.

## 9. S4-4 — достройка SaaS billing поверх существующих PSP

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

**Стартовые точки:** [`providerPort.ts:11-33`](../../../apps/webapp/src/modules/payments/providerPort.ts),
[`paymentProviderRegistry.ts:8-45`](../../../apps/webapp/src/infra/payments/paymentProviderRegistry.ts),
[`bookingPayments.ts:93-231`](../../../apps/webapp/db/schema/bookingPayments.ts),
[`payments/service.ts:136-450`](../../../apps/webapp/src/modules/payments/service.ts),
[`payments/webhook/[provider]/route.ts:10-64`](../../../apps/webapp/src/app/api/payments/webhook/[provider]/route.ts),
[`BookingPaymentsSection.tsx:41-75`](../../../apps/webapp/src/app/app/settings/BookingPaymentsSection.tsx).

- [ ] Создать отдельный `modules/saas-billing` domain с ports/service/typed state machine; он переиспользует
      `PaymentProviderPort` через DI и не импортирует infra registry напрямую.
- [ ] Добавить минимальные org-owned records: billing account, source-aware tariff subscription, invoice/order и
      normalized provider event. Invoice фиксирует tariff, amount/currency/period snapshot; webhook event имеет provider event ID и
      idempotency, но не хранит patient data.
- [ ] Перенести существующие manual `tariff_id` assignments в subscription/access rows с source=`manual`; переключить
      resolver на один access contract и проверять, что compatibility projection совпадает. Mismatch checker даёт non-zero.
- [ ] До кода зафиксировать subscription state machine минимум для `trial/pending_payment/active/grace/past_due/
cancelled/expired`, allowed transitions, source event, retry/dunning и capability effect. Реализовать только
      transitions, подтверждаемые выбранным provider contract; автоматическое списание без provider token contract не
      имитируется.
- [ ] Добавить global DB setting `saas_billing_payment_provider` в `ALLOWED_KEYS`, Settings UI, redaction/secret-retain
      service и sanctioned accessor; запись идёт через `updateSetting` с обычным mirror contract. Он не читает и не
      перезаписывает per-org `booking_payment_providers`.
- [ ] Сохранить и вернуть provider checkout URL безопасному clinic_admin UI. Return/status page сверяет invoice/order
      из server-derived org и никогда не принимает сумму, tariff или target org от клиента как source of truth.
- [ ] Добавить SaaS webhook route под bootstrap principal: load global provider config → verify signature/status →
      resolve invoice/order → run org-scoped capture. Unknown ref acknowledges safely; forged signature, amount/currency
      mismatch и replay не активируют доступ.
- [ ] Закрыть provider-specific gaps из S4-0. В частности, callback, который требует server-side status verification,
      не считается успешным только по payload; provider order ref и transaction ref имеют проверенный mapping.
- [ ] Tariff capture активирует/продлевает source=`paid_subscription`; expiry/cancel/refund завершает только этот
      source. Manual global_admin assignment или более новый paid source сохраняют доступ; compatibility tariff projection
      обновляется тем же service transaction.
- [ ] Не включать store-package capture в C5B acceptance. Если C5D позднее активирован, его adapter extension
      выдаёт source-aware org grants и имеет собственный refund/reversal checklist.
- [ ] Payment failure/expiry не затрагивают другую клинику и не удаляют clinic-owned exercises/content.
- [ ] Global billing surface показывает organizations/payers/subscriptions, trial/grace/past_due, attempts,
      refunds/cancellations, provider events, invoices/receipts, filters/aggregates и только безопасные PSP-supported
      support actions. Любая mutation идемпотентна и попадает в immutable admin audit; manual «успешно оплачено» нет.
- [ ] Organization settings tab «Тариф и биллинг» показывает current tariff/capabilities/usage/seats, next payment,
      lifecycle status, upgrade/downgrade effect/date, add-ons, payment history and documents. Она доступна owner/payment
      admin; ordinary invited specialist не видит tab и получает server denial.
- [ ] B2B bank-transfer invoice/status и fiscal receipt/invoice obligations имеют provider/legal decision gate;
      неподдержанный flow не симулируется фиктивной кнопкой.
- [ ] Реальные provider credentials, когда владелец их предоставит, вводятся только через Settings на тестовом сервере.
      До этого architecture, mock checkout и recorded provider contract fixtures должны проходить полностью; отсутствие
      ключей не блокирует schema/service/UI/webhook implementation.

**Проверка:** state-machine and idempotency tests; provider adapter contract tests; signed webhook success/replay/
forgery/amount mismatch; tariff capture/refund integration; A/B authz; secret redaction scan; checkout UI. Store
capture tests добавляются только в активированном C5D.

**Выход C5B:** организация может оплатить тариф через существующий provider layer; успешное событие идемпотентно
меняет subscription, а refund корректно отзывает только свой источник доступа. Store grants не входят без C5D.

## 10. Абонементы — факт проверен, работа закрыта

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [x] Кнопка «Пересчитать» существует на active package:
      [`PatientPackageCard.tsx:165-177`](../../../apps/webapp/src/app/app/doctor/clients/PatientPackageCard.tsx).
- [x] UI вызывает `POST .../[id]/recalc`, показывает summary и refresh:
      [`DoctorClientMembershipsPanel.tsx:247-269`](../../../apps/webapp/src/app/app/doctor/clients/DoctorClientMembershipsPanel.tsx).
- [x] Route получает org из doctor gate и вызывает существующий memberships service:
      [`recalc/route.ts:12-48`](../../../apps/webapp/src/app/api/doctor/booking-engine/patient-packages/[id]/recalc/route.ts).
- [x] Bulk implementation идемпотентно списывает прошлые состоявшиеся визиты, работает под package lock и не уходит
      ниже нуля: [`memberships/service.ts:1133-1369`](../../../apps/webapp/src/modules/memberships/service.ts).
- [x] UI behavior покрыт тестом:
      [`DoctorClientMembershipsPanel.test.tsx:213-285`](../../../apps/webapp/src/app/app/doctor/clients/DoctorClientMembershipsPanel.test.tsx);
      duplicate consume защищён unique index
      [`0137_be_package_usages_consume_unique.sql:1-9`](../../../apps/webapp/db/drizzle-migrations/0137_be_package_usages_consume_unique.sql).

**Вывод:** owner question закрыт фактом. S4 не планирует кнопку, второй memberships module или повтор ST-01/ST-02.

## 11. S4-5 — PII-free analytics по клиникам и нагрузке

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

**Стартовые точки:** [`productAnalytics.ts:53-147`](../../../apps/webapp/db/schema/productAnalytics.ts),
[`types.ts:56-68`](../../../apps/webapp/src/modules/product-analytics/types.ts),
[`types.ts:161-186`](../../../apps/webapp/src/modules/product-analytics/types.ts),
[`ports.ts:14-30`](../../../apps/webapp/src/modules/product-analytics/ports.ts),
[`pgProductAnalytics.ts:57-176`](../../../apps/webapp/src/infra/repos/pgProductAnalytics.ts).

- [ ] Ввести отдельную typed platform aggregate projection/port. Строка содержит только time bucket,
      organizationId или platform-total bucket, allowlisted metric key, integer/decimal value и generatedAt; нет FK на
      user/patient, person/session IDs и JSON metadata.
- [ ] Существующий raw/user analytics остаётся clinic-operational source и не экспортируется через platform port.
      `ProductAnalyticsClientActivityRow` и registration drill-down физически недоступны platform API/page.
- [ ] Протянуть trusted `organizationId` в те ingest paths, которые действительно org-scoped. Payload не назначает
      org; shared-patient event без scoped resource не угадывается и не попадает в per-clinic aggregate.
- [ ] Aggregate builders считают только allowlisted counters из billing/subscription и platform load sources.
      Message body, exercise execution event, program content и patient identity не читаются и не проецируются.
- [ ] Добавить schema/DTO/static checker, запрещающий в platform analytics person columns, free-form payload и imports
      clinic drill-down repo. Canary test кладёт узнаваемые PII strings в source fixtures и доказывает их отсутствие в
      aggregate rows, API JSON, logs и screenshots.
- [ ] Сделать отдельный global_admin platform port/API; clinic analytics port остаётся строго single-org.
      clinic_admin A не может запросить B query/filter/direct ID.
- [ ] До финального решения владельца UI показывает только технический preview структуры aggregate buckets без
      объявления набора KPI окончательным.
- [ ] **OWNER GATE:** утвердить точный список метрик и формулы после работающих tariffs/billing/usage sources;
      future store становится источником метрик только если C5D к тому моменту активирован.
      Кандидаты из рулинга — клиники, специалисты, клиенты как counts, загрузки видео, биллинг и использование — не
      расширяются персональными drill-down.
- [ ] После решения реализовать только утверждённые metric keys, формулы и layout; каждый metric получает source
      query `file:line`, denominator/timezone semantics и fixture с ожидаемым числом.

**Проверка:** aggregate builder/port/API tests; schema/static PII checker + self-test; A/B authz; canary PII scan;
global_admin visual acceptance после финального metric decision.

**Выход:** global_admin видит утверждённую аналитику по клиникам и общей нагрузке, но platform analytics физически
не содержит персональной активности пациентов чужих клиник.

## 12. S4-6 — интеграционная приёмка на тестовом сервере

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Подготовить непересекающиеся synthetic fixtures только для включённых substages: global_admin;
      clinic_admin/doctor A и B; разные tariffs/overrides; clinic-owned/base exercises; SaaS invoice/subscription/order.
      Package/grant fixtures добавляются только если C5D явно активирован.
      Доказательство: fixture manifest без реальных PII.
- [ ] Global_admin создаёт/меняет tariff, цену/период/full mechanic map, назначает A, меняет override, видит billing
      state и утверждённые aggregate metrics. Package curation проверяется только в C5D acceptance.
- [ ] Clinic A проходит checkout mock/recorded-provider flow, получает tariff access и продолжает видеть свои
      clinic exercises отдельно от platform base content.
- [ ] Clinic B не видит tariff override, invoice или analytics A; её собственные
      exercises и mechanics работают по её tariff.
- [ ] Payment negatives: duplicate checkout/webhook, forged signature/org ID, wrong amount/currency, unknown provider
      ref, refund replay. Ни один отказ не меняет subscription/grant.
- [ ] Entitlement negatives обязательны. Store direct-ID/expired-grant/mechanic-vs-grant negatives добавляются только
      для активированного C5D.
- [ ] Analytics negatives: platform JSON/schema/visual artifacts не содержат patient identity, message text,
      exercise execution details или clinic drill-down rows; clinic A не получает B.
- [ ] UI-фазы получают desktop/mobile screenshots; executor, independent audit и fixer закрывают один и тот же
      checklist по [`ORCHESTRATION_BINDINGS.md`](../../ORCHESTRATION_BINDINGS.md).
- [ ] После всех фаз выполнить один финальный `pnpm install --frozen-lockfile && pnpm run ci`; повторять полный gate
      без изменений кода не требуется.

**Выход:** включённые substages — tariffs, one chokepoint, own/base ownership, real-provider-ready SaaS billing и
безопасная analytics — работают на TEST для A/B. Store не симулируется и не требуется, пока C5D deferred.

## 13. Decision gates, не общий стоп инициативы

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

1. Для каждой quota: unit/period, soft или hard limit, overage и downgrade behavior.
2. Trial start event, post-trial/grace и судьба созданных branding/content/data при снижении тарифа.
3. Первый PSP для SaaS billing и реально поддержанные им recurring/retry/refund/receipt/B2B operations. Provider
   choice не блокирует ownership, state-machine design, mock/recorded contracts и UI IA.
4. Store package commerce: manual bootstrap до PSP, разовая покупка, допподписка или обе модели; publisher,
   moderation, licensing и payouts. Base library и own-only mode не ждут store model.
5. Clinic seats: included count, per-seat price, purchase moment и policy для existing over-limit memberships.
6. В конце работающего billing/usage foundation — точные metric keys, formulas, windows и platform analytics layout.

Инженерные детали не подписываются именем владельца. Открытый gate блокирует только зависимую ветку: он не
разрешает агенту угадать policy и не останавливает независимые registry/chokepoint/ownership/test slices.

## 14. Definition of Done

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Каждая owner attribution ссылается на `OWNER_RULINGS_2026-07-15.md`, непереопределённую Часть Б
      `OWNER_DECISIONS_FOR_REVIEW.md` либо latest `OWNER_REVIEW_2026-07-18.md`; инженерные решения подписаны как
      инженерные.
- [ ] Полный mechanic registry доказан method-level matrix; все protected actions используют один chokepoint.
- [ ] Global_admin управляет tariffs/prices/periods/mechanics/quotas/trial/seats/assignments/overrides как DB data.
- [ ] Own-only и base library разведены, clinic content приватен. Если C5D активирован, future store/grants проходят
      отдельный source-aware/no-copy acceptance; иначе этот подпункт явно отмечается deferred, не failed.
- [ ] Existing provider adapters обслуживают SaaS checkout/capture/refund/webhook; keys DB-backed и redacted.
- [ ] Global operator billing и organization «Тариф и биллинг» имеют разные authorization surfaces и общий
      reconciled ledger; ordinary specialist не получает финансовые права.
- [ ] Platform analytics содержит только утверждённые org/platform aggregates и проходит PII canary/static gate.
- [x] Bulk «Пересчитать» в memberships подтверждён существующим UI, route, service, tests и DB invariant.
- [ ] A/B acceptance, security negatives, screenshots/audits и один финальный CI gate закрыты на тестовом сервере.

## 15. Execution log

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

При старте реализации создать рядом `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS_LOG.md`. После каждой фазы фиксировать:

- run/agent IDs, checklist IDs, commit range и фактически изменённые files;
- точные post-change `file:line` для каждого закрытого пункта;
- tests/checkers/smokes/screenshots и exit/result;
- provider contract и credential-independent evidence;
- owner rulings отдельно от инженерных решений;
- residual risks и только два owner-decision пункта из §13.

## 16. Консолидированный workstream SaaS billing / team / quotas (`#1057`)

Этот раздел сохраняет непотерянный scope карточек группы 12 перед их предложенной свёрткой в одну
workstream-карточку `#1057`. Он не заменяет этапы S4 выше, а связывает каждую прежнюю карточку с атомарными
требованиями единственного execution plan.

### `#843` — clinic/team entitlement и места

- [ ] Включать clinic/team mode только купленным tariff entitlement; team settings/tab доступны только при
      entitlement, а UI и API одинаково fail closed.
- [ ] Дать global admin настройку included invited-specialist count и/или per-seat surcharge.
- [ ] Зафиксировать и реализовать contracts для over-limit, add-seat, downgrade, existing overage и связь с
      billing; C4A уже готов, C5C доплаты за места остаётся после billing.
- [ ] Active specialist binding и pending invite потребляют/резервируют seat, non-clinical admin — нет; included
      count и per-seat price/purchase moment остаются tariff data; downgrade/over-limit сохраняют memberships и
      блокируют новый growth.
- [ ] Переиспользовать C4A server-side seat usage/limit contract и C5B billing
      account/order/subscription primitives.
- [ ] Построить payer-authorized add-on checkout/order → idempotent confirmed payment → subscription seat
      allocation; client payload не задаёт org, цену, количество или payment success.
- [ ] Обрабатывать replay, failed/past_due/refund/cancel/downgrade строго по утверждённой policy; existing
      memberships не удаляются молча, а новые invites блокируются/разрешаются сервером по effective paid limit.
- [ ] Скрыть billing mutation от ordinary specialist и проверить direct API denial.
- [ ] Закрыть org A/B isolation, immutable before/after audit, reconciliation, mock/recorded-provider TEST и
      organization «Тариф и биллинг» acceptance. Product gates C4C5-01…07 resolved by the 2026-07-19 addendum;
      real PSP activation remains blocked until YooKassa merchant/legal/receipt/retry/proration operations are
      specified and proven. C4C5-08 store commerce remains deferred.

Authority карточки: `SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md` §§P1,15; roadmap C4A/C5C.
`auto_ok=false`.

### `#844` — global-admin billing operations

- [ ] Достроить standard SaaS billing operations baseline для global admin: subscriptions/payers,
      `paid|unpaid|trial|grace|past_due`, payment attempts, refunds, cancellations, filters/stats,
      invoice/receipt details и provider events.
- [ ] Реализовать только PSP-supported safe retry/reissue/cancel/refund/grace operations, reconciliation и
      immutable audit; ручной success без подтверждённого money event запрещён.
- [ ] Сначала зафиксировать design/spec с учётом выбранного PSP и legal/cash-register model.

Authority карточки: `SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md` §P3; S4 §9. `auto_ok=false`.

### `#845` — organization payer surface

- [ ] Достроить owner/payment-admin settings surface «Тариф и биллинг»: current tariff/capabilities/usage/seats,
      subscription status, next payment, upgrade/downgrade, add-ons/seats, payment history, receipts/invoices,
      B2B bank-transfer invoice/status и failed-payment recovery.
- [ ] Доказать, что billing принадлежит organization, а ordinary invited specialists не видят tab и не имеют
      API access.

Authority карточки: `SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md` §§P3,15; S4 §9.
`auto_ok=false`, depends on billing lifecycle/spec.

### `#1057` — широкая работа SaaS-оплаты клиниками

Владелец 27.07, дословно: «Когда закончишь делай saas оплату клиниками».

- [ ] Достроить существующий payment layer для оплаты клиниками подписки на платформу; не писать платёжку заново
      и не смешивать её с оплатой услуг пациентами или ранее убранными store phases.
- [ ] Сохранить модель `тариф → механики → клиника`; prices — admin-managed data, не code constants.
- [ ] Проверить текущее состояние patient online payment: doctor memberships работают end-to-end, patient online
      payment ранее был mock.
- [ ] Сохранить аналитику по клиникам без PII пациентов и не вернуть пять mock payment confirmations в production:
      они отключены вне development commit `15ad7ba6f`, gate fail closed.
- [ ] Перед исполнением перечитать `OWNER_RULINGS_2026-07-15.md` и сверить существующие
      `saas_tariffs`, `saas_org_entitlement_overrides`, `saas_organization_trials`; неизвестные развилки сначала
      исследовать по мировой практике, не угадывать.

Порядок владельца: работа идёт после F-6 slug/public link, C-5 password change и self-login smoke; слово
«когда закончишь» не отменяет эти predecessors.

Открытые owner gates из карточки, без выбора за владельца:

1. Что происходит при прекращении оплаты: в коде `active/read_only/blocked`, в каноне также `grace`; срок grace
   и отключаемые возможности не зафиксированы.
2. Юрлицо/PSP: отдельный SaaS merchant/shop или тот же, что у клиник для patient payments; получатель и 54-ФЗ
   для B2B subscription.
3. B2B bank transfer для ИП/юрлиц — первый slice или сначала card only.
4. Extra seat «+500р в месяц»: mid-period purchase и proration при нынешнем hard cap.
5. Строить экран до получения PSP keys или после.

Главный вопрос карточки остаётся открытым дословно:

> «СТРОИТЬ SAAS-ОПЛАТУ СЕЙЧАС, НО ЗАПУСКАТЬСЯ БЕЗ НЕЁ — ИЛИ ОНА ВОЗВРАЩАЕТСЯ В СКОУП ЗАПУСКА?»

Позднее указание 27.07 не позволяет агенту самому переопределить ruling 24.07 `paid billing = OUT of first launch`.
Факт для решения: «Тест Клиника» находится в `no_trial`, без тарифа, все mechanics выключены; если fixture нужен,
тариф назначается через `/app/admin/commercial`.
Разрешённый владельцем 27.07 канал связи для этой работы:
`bash /home/dev/brain/host-orch/notify-owner.sh`; ответы сохраняются в task record лидом.

### `#1069` — quotas/mechanics enforcement

Владелец 27–28.07, дословно: «разные параметры - разные квоты и разные настройки. это делать не тяп ляп» и
«запустить двух конструкторов-исследователей». Сведённый design:
`QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md`.

- [ ] Исполнить модель четырёх классов: наличие; запас с прямым пересчётом; расход за период через event ledger;
      объём как сумма байт.
- [ ] Для каждой write-path проверки ставить quota enforcement внутри пишущей repository transaction под
      advisory lock, а не в pre-transaction `requireEntitlement`; эталон гонки —
      `scripts/check-c5a-courses-quota-race.mjs` с настоящим PostgreSQL.
- [ ] Включать по одной механике: сначала показать usage без запрета → найти over-limit → выдать override →
      включить enforcement. Первый slice: `exercise_packages` или `cms_pages`; выбор остаётся в design gate.
- [ ] Сначала создать event facts для рассылок и оплат, потому что сейчас отсутствует даже строка события,
      которую можно посчитать; только затем вводить расходную quota.
- [ ] Получить решения владельца из §1 quota design: какая «Сегодня», period anchor, tariff change mid-period и
      payments at limit.

Проверенные design facts, которые нельзя потерять:

- работающих механизмов **2**, не 1: courses trigger `app.enforce_courses_snapshot_quota`
  (`0225_saas_tariff_quotas_trial.sql:302-387`) и seats с advisory lock в
  `clinic_invite_seats`/`pgOrganizationInvites.ts:106-192`; registry ошибочно помечает seats
  `declared_no_enforcement`;
- `TariffQuota.period` нигде не читается, кроме assertion, что courses period = `snapshot`
  (`org-entitlements/service.ts:28`);
- `resolveOrgQuotaProjections` отбрасывает `declared_no_enforcement` (`service.ts:133`);
- из **15** mechanics только **1** считалась реально проверяемой в исходной карточке; для **14** нет полного
  enforcement/usage path.
