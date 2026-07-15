# SaaS S4 — тарифы, магазин, entitlements, биллинг и безопасная аналитика

> План этапа 4 из [`SEQUENCE.md`](./SEQUENCE.md). При конфликте старых формулировок с
> [`OWNER_RULINGS_2026-07-15.md`](./OWNER_RULINGS_2026-07-15.md) приоритет имеют дословные рулинги владельца.
> Этот файл задаёт только работу для полностью функционирующей системы на тестовом сервере.

## 0. Результат

На тестовом сервере должен работать единый коммерческий контур:

`тариф как данные → полный набор механик → клиника → requireEntitlement() → разрешённое действие`

Поверх него работают:

- global_admin-конструктор тарифов, цен, состава механик и точечных override для клиники;
- магазин курируемых пакетов упражнений, где купленный пакет и собственные упражнения клиники сосуществуют;
- org-facing биллинг, достроенный поверх существующих PSP adapters, payment intents, refunds и webhook verification;
- аналитика по клиникам как клиентам платформы: биллинг, агрегированное использование и общая нагрузка;
- существующие пациентские абонементы без повторной реализации.

Файлы упражнений и медиа никогда не копируются: любой тарифный или купленный доступ — source-aware grant на
канонический `content_id`.

## 1. Канон и провенанс

### Решения владельца

| Решение | Источник |
|---|---|
| Тариф → механики → клиника; цены и состав настраивает global_admin | [`OWNER_RULINGS_2026-07-15.md:28-34`](./OWNER_RULINGS_2026-07-15.md), [`OWNER_DECISIONS_FOR_REVIEW.md:39-42`](./OWNER_DECISIONS_FOR_REVIEW.md) |
| Полный конструктор механик сразу; override на конкретную клинику сохраняется | [`OWNER_RULINGS_2026-07-15.md:28-34`](./OWNER_RULINGS_2026-07-15.md) |
| Платёжная система уже есть и почти готова; её не удалять, а достраивать; ключи владелец даст позже | [`OWNER_RULINGS_2026-07-15.md:10-19`](./OWNER_RULINGS_2026-07-15.md) |
| Купленные пакеты и собственные упражнения клиники сосуществуют; магазин не поглощает clinic-owned feature | [`OWNER_RULINGS_2026-07-15.md:35-44`](./OWNER_RULINGS_2026-07-15.md) |
| Файлы не копируются; доступ выдаётся грантом на канонический `content_id` | [`OWNER_DECISIONS_FOR_REVIEW.md:49-51`](./OWNER_DECISIONS_FOR_REVIEW.md) |
| Global_admin нужна аналитика по клиникам как клиентам, биллингу, использованию и общей нагрузке платформы | [`OWNER_RULINGS_2026-07-15.md:45-63`](./OWNER_RULINGS_2026-07-15.md) |
| Персональная аналитика пациентов чужих клиник, выполнение упражнений и переписка не входят в platform view | [`OWNER_RULINGS_2026-07-15.md:50-63`](./OWNER_RULINGS_2026-07-15.md) |
| Точный набор метрик определяется в конце | [`OWNER_RULINGS_2026-07-15.md:60-63`](./OWNER_RULINGS_2026-07-15.md) |
| Система абонементов существует; сначала проверить наличие кнопки пересчёта | [`OWNER_RULINGS_2026-07-15.md:115-120`](./OWNER_RULINGS_2026-07-15.md) |

Порядок S4-0…S4-6 ниже — **инженерное предложение**, а не решение владельца. Он выбран по зависимостям данных:
сначала registry и chokepoint, затем управляющий UI, store, billing, PII-free analytics и общий тестовый gate.

### Инженерный канон исполнения

- порядок инициативы: [`SEQUENCE.md`](./SEQUENCE.md);
- tenant/principal/aggregate boundaries: [`SAAS_ENFORCE_ROADMAP.md`](./SAAS_ENFORCE_ROADMAP.md);
- ownership и clean architecture: [`AGENTS.md`](../../../AGENTS.md),
  [`.cursor/rules/saas-foundation-aware-development.mdc`](../../../.cursor/rules/saas-foundation-aware-development.mdc),
  [`.cursor/rules/clean-architecture-module-isolation.mdc`](../../../.cursor/rules/clean-architecture-module-isolation.mdc);
- DB-backed provider credentials: [`.cursor/rules/000-critical-integration-config-in-db.mdc`](../../../.cursor/rules/000-critical-integration-config-in-db.mdc),
  [`.cursor/rules/system-settings-integrator-mirror.mdc`](../../../.cursor/rules/system-settings-integrator-mirror.mdc);
- этапный worker/audit/fixer loop и доказательства: [`ORCHESTRATION_BINDINGS.md`](../../ORCHESTRATION_BINDINGS.md).

## 2. Reality lock на 2026-07-15

| Область | Уже есть | Что нужно достроить |
|---|---|---|
| Entitlements | `saas_tariffs`, `be_organizations.tariff_id`, `saas_org_entitlement_overrides` ([`saasEntitlements.ts:24-59`](../../../apps/webapp/db/schema/saasEntitlements.ts)); typed `MECHANICS` и resolver `override > tariff > current default` ([`types.ts:6-23`](../../../apps/webapp/src/modules/org-entitlements/types.ts), [`service.ts:10-36`](../../../apps/webapp/src/modules/org-entitlements/service.ts)) | Полный method-level registry, global_admin CRUD/assignment/override UI и системное покрытие механик |
| Chokepoint | `requireEntitlement()` существует ([`requireEntitlement.ts:7-23`](../../../apps/webapp/src/app-layer/guards/requireEntitlement.ts)) | Сейчас используется только в одном slice; auth вызывается повторно; нет coverage gate |
| PSP adapters | Общий `PaymentProviderPort.createIntent/refund/verifyWebhook` ([`providerPort.ts:11-33`](../../../apps/webapp/src/modules/payments/providerPort.ts)); registry с mock, YooKassa, Tinkoff, CloudPayments и Alfa-Bank ([`paymentProviderRegistry.ts:8-45`](../../../apps/webapp/src/infra/payments/paymentProviderRegistry.ts)) | Не переписывать adapters; проверить provider contracts и подключить их к org-facing SaaS billing |
| Платёжный ledger | Org-scoped intents/payments/refunds/provider events и idempotency уже есть ([`bookingPayments.ts:93-231`](../../../apps/webapp/db/schema/bookingPayments.ts)); service создаёт intents, capture и refund ([`payments/service.ts:136-299`](../../../apps/webapp/src/modules/payments/service.ts), [`payments/service.ts:327-512`](../../../apps/webapp/src/modules/payments/service.ts)) | Это booking/patient commerce, а не subscription ledger клиники. Нужен отдельный org-facing lifecycle без второго PSP abstraction |
| Webhooks | Подписанный route определяет клинику по intent/provider ref и исполняет capture под org principal ([`payments/webhook/[provider]/route.ts:10-64`](../../../apps/webapp/src/app/api/payments/webhook/[provider]/route.ts)) | Добавить отдельный SaaS webhook path/config boundary; не смешивать platform merchant с per-org booking merchant |
| Payment UI/config | Provider credentials редактируются в Settings и хранятся в `system_settings` ([`BookingPaymentsSection.tsx:41-75`](../../../apps/webapp/src/app/app/settings/BookingPaymentsSection.tsx), [`system-settings/types.ts:111-123`](../../../apps/webapp/src/modules/system-settings/types.ts)) | Текущая секция относится к оплате записи; patient pay clients завершают только mock ([`PatientPackagePayClient.tsx:42-79`](../../../apps/webapp/src/app/app/patient/memberships/pay/PatientPackagePayClient.tsx)). Для SaaS billing нужны отдельная global config и реальный redirect/status flow |
| Store grants | `content_access_grants_webapp` уже несёт `organization_id`, canonical `content_id`, expiry/revoke ([`schema.ts:370-395`](../../../apps/webapp/db/schema/schema.ts)); `modules/entitlements` выдаёт user grants ([`entitlements/service.ts:5-40`](../../../apps/webapp/src/modules/entitlements/service.ts)) | Эволюционировать существующий grant path для org targets; третья grant table запрещена |
| LFK | `lfk_exercises`, media и ordered templates имеют `organization_id`; `NULL` может обозначать platform content ([`schema.ts:906-1023`](../../../apps/webapp/db/schema/schema.ts)) | Store package должен ссылаться на canonical template/exercise IDs; clinic create/edit flow остаётся отдельным |
| Аналитика | Raw/user rows содержат `organization_id`, но ingest его не передаёт; platform hourly не имеет org dimension ([`productAnalytics.ts:53-147`](../../../apps/webapp/db/schema/productAnalytics.ts), [`types.ts:56-68`](../../../apps/webapp/src/modules/product-analytics/types.ts), [`pgProductAnalytics.ts:57-176`](../../../apps/webapp/src/infra/repos/pgProductAnalytics.ts)) | Отдельная PII-free platform aggregate projection. Существующий `clientActivity` с `userId/displayName` ([`types.ts:161-186`](../../../apps/webapp/src/modules/product-analytics/types.ts)) нельзя отдавать platform analytics |
| Абонементы | Кнопка, route, service, concurrency guard и тесты уже существуют | Пункт владельца закрыт фактом; новой реализации в S4 нет, см. §10 |

Термины не смешивать:

- SaaS tariff — цена и механики платформы для клиники;
- SaaS subscription — оплачиваемый период доступа клиники к тарифу;
- store exercise package — курируемый пакет platform content для клиники;
- patient membership — абонемент пациента на услуги внутри клиники;
- `be_products` — clinic-owned продукт для пациента.

## 3. Неподвижные рамки

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

`S4-0 → S4-1 → S4-2 → S4-3 → S4-4 → S4-5 → S4-6`

- S4-0 фиксирует полный registry и ownership/data contracts.
- S4-1 создаёт один проверяемый entitlement boundary.
- S4-2 даёт global_admin управление тарифами и override.
- S4-3 строит store grants без копирования контента.
- S4-4 подключает существующий PSP foundation к SaaS billing и store orders.
- S4-5 создаёт PII-free aggregate boundary; точные метрики утверждаются только в конце этапа.
- S4-6 доказывает весь контур на тестовом сервере.

Каждый checkbox закрывается записью: **изменение · точные `file:line` после изменения · доказательство и результат**.
Если новый файл ещё не существует, стартовой точкой служит указанный существующий anchor, а окончательные строки
фиксируются в execution log.

## 5. S4-0 — mechanic, ownership и payment-contract inventory

**Стартовые точки:** [`org-entitlements/types.ts:6-23`](../../../apps/webapp/src/modules/org-entitlements/types.ts),
[`org-entitlements/service.ts:10-36`](../../../apps/webapp/src/modules/org-entitlements/service.ts),
[`providerPort.ts:11-33`](../../../apps/webapp/src/modules/payments/providerPort.ts),
[`bookingPayments.ts:93-231`](../../../apps/webapp/db/schema/bookingPayments.ts),
[`content_access_grants_webapp:370-395`](../../../apps/webapp/db/schema/schema.ts).

- [ ] Построить method-level матрицу `mechanic → entrypoint/action → auth/context source → requireEntitlement →
  service/port` с `file:line` для каждого реального action. Доказательство: checker сопоставляет export/action symbols,
  а не каталоги routes; неизвестный или двойной mapping даёт non-zero.
- [ ] Сверить все ключи `MECHANICS` с реальными поверхностями. Отсутствующая поверхность получает
  `declared_no_surface` + code-search evidence; route ради флага не создаётся.
- [ ] Зафиксировать единую typed registry с ключом и русской подписью; constructor, chokepoint и checker импортируют
  её, локальных массивов mechanic keys нет.
- [ ] Зафиксировать инженерный compatibility path для клиники без тарифа: до назначения всем существующим test-org
  явного тарифа сохраняется текущий resolver result; после заполнения fixture/data gate implicit default не используется
  для новых test-org. Доказательство: migration/fixture report `unassigned org = 0` и resolver tests на assigned,
  override и intentionally-unassigned cases.
- [ ] Описать ownership новых сущностей до DDL: platform package/tariff = global catalog; subscription/invoice/order/
  grant = direct org или scoped parent; analytics aggregate = org bucket без person identity.
- [ ] Провести provider contract inventory по всем четырём real adapters: checkout URL, provider intent ref,
  idempotency, success/refund event, amount/currency verification и signature/status verification. Доказательство:
  таблица по adapters + contract tests; неподтверждённый callback не может активировать subscription/grant.
- [ ] Зафиксировать отдельные config identities: existing per-org booking merchant и new global SaaS merchant.
  Доказательство: разные typed accessors/settings keys и тест отсутствия fallback между ними.
- [ ] Зафиксировать один source-aware tariff access contract: временно существующий `be_organizations.tariff_id`
  остаётся compatibility projection; конечный resolver различает manual assignment и active paid subscription,
  не держит две расходящиеся истины и не снимает доступ одного source при завершении другого.

**Проверка:** inventory checker self-test; resolver/provider contract unit tests; webapp typecheck.

**Выход:** реализация следующих фаз не угадывает mechanics, ownership, provider behavior или source of truth.

## 6. S4-1 — один requireEntitlement() chokepoint

**Стартовые точки:** [`requireEntitlement.ts:7-23`](../../../apps/webapp/src/app-layer/guards/requireEntitlement.ts),
[`requireEntitlement.test.ts:1-79`](../../../apps/webapp/src/app-layer/guards/requireEntitlement.test.ts),
[`courses/route.ts:49-77`](../../../apps/webapp/src/app/api/doctor/courses/route.ts),
[`buildAppDeps.ts:1583-1585`](../../../apps/webapp/src/app-layer/di/buildAppDeps.ts).

- [ ] Привести guard к typed контракту `requireEntitlement(ctx, mechanic)`: context уже авторизован и содержит
  server-derived org; guard обращается только к `orgEntitlements` и возвращает единый 403
  `entitlement_required` с mechanic key.
- [ ] Убрать повторный auth call из существующего courses slice. Доказательство: одна auth/context resolution на
  request; service не вызывается после 401/403.
- [ ] Применить S4-0 mapping ко всем `protected` actions. Для feature с несколькими aliases gate стоит на общем
  application command/feature boundary, а не копируется по routes.
- [ ] Доказать ordering `auth → tenant/principal → entitlement → service`: unauthenticated, wrong role/org,
  disabled mechanic и success имеют разные ожидаемые результаты.
- [ ] Доказать org isolation: override/tariff A не меняет B; forged org ID не меняет target resolver.
- [ ] Добавить static guard: прямые `isMechanicEnabled` и чтения tariff/override из feature routes/services вне
  единственного boundary дают non-zero.

**Проверка:** guard tests; по одному contract test на action family; static checker + self-test; webapp lint/typecheck.

**Выход:** coverage checker сообщает `protected actions = mapped actions`, дублирующих entitlement rules нет.

## 7. S4-2 — global_admin-конструктор тарифов и overrides

**Стартовые точки:** [`saasEntitlements.ts:24-59`](../../../apps/webapp/db/schema/saasEntitlements.ts),
[`pgOrgEntitlements.ts:16-43`](../../../apps/webapp/src/infra/repos/pgOrgEntitlements.ts),
[`doctorNavLinks.ts:36-52`](../../../apps/webapp/src/shared/ui/doctor/doctorNavLinks.ts),
[`doctorNavLinks.ts:105-135`](../../../apps/webapp/src/shared/ui/doctor/doctorNavLinks.ts).

- [ ] Расширить существующий `modules/org-entitlements` typed CRUD: tariff list/get/create/update/deactivate,
  assign/unassign, override list/upsert/delete. Новый соседний tariffs module не создаётся.
- [ ] Хранить name, description, `priceMinor`, currency, billing period и полный mechanic map как DB data.
  Hardcoded tier names/prices/compositions отсутствуют.
- [ ] Валидировать mechanics только по registry S4-0; отсутствующий UI-toggle не может тихо потерять mechanic key.
- [ ] Реализовать узкий platform write port для manual tariff assignment. До S4-4 он транзакционно меняет только
  compatibility `be_organizations.tariff_id`; S4-4 мигрирует такие назначения в source=`manual` и оставляет колонку
  только согласованной projection, не универсальным editor организации.
- [ ] Override identity остаётся `(organization_id, mechanic)`; delete возвращает tariff default, а не сохраняет
  копию этого default.
- [ ] Global_admin page содержит tariff list/editor, цену/период, grid всех mechanics, clinic assignment и override.
  `clinic_admin`/doctor не видят nav item и получают 403 на API.
- [ ] Audit event содержит actor, target org, tariff, before/after mechanic map и reason без secret/PII.
- [ ] E2E contract: tariff с mechanic=false → A denied; B unchanged; override A=true → allowed; delete override →
  denied; смена тарифа меняет доступ через тот же chokepoint.

**Проверка:** module/PG/API tests; authz A/B matrix; constructor RTL; desktop/mobile visual acceptance.

**Выход:** тарифная сетка, цены, период, mechanics и clinic override управляются global_admin как данные.

## 8. S4-3 — магазин пакетов и org grants без копирования

**Стартовые точки:** [`schema.ts:906-1023`](../../../apps/webapp/db/schema/schema.ts),
[`entitlements/ports.ts:1-20`](../../../apps/webapp/src/modules/entitlements/ports.ts),
[`entitlements/service.ts:5-40`](../../../apps/webapp/src/modules/entitlements/service.ts),
[`pgEntitlements.ts:9-76`](../../../apps/webapp/src/infra/repos/pgEntitlements.ts),
[`content_access_grants_webapp:370-395`](../../../apps/webapp/db/schema/schema.ts).

- [ ] Добавить минимальную platform package entity с commercial metadata, price/currency/access duration и ссылкой
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

**Стартовые точки:** [`providerPort.ts:11-33`](../../../apps/webapp/src/modules/payments/providerPort.ts),
[`paymentProviderRegistry.ts:8-45`](../../../apps/webapp/src/infra/payments/paymentProviderRegistry.ts),
[`bookingPayments.ts:93-231`](../../../apps/webapp/db/schema/bookingPayments.ts),
[`payments/service.ts:136-450`](../../../apps/webapp/src/modules/payments/service.ts),
[`payments/webhook/[provider]/route.ts:10-64`](../../../apps/webapp/src/app/api/payments/webhook/[provider]/route.ts),
[`BookingPaymentsSection.tsx:41-75`](../../../apps/webapp/src/app/app/settings/BookingPaymentsSection.tsx).

- [ ] Создать отдельный `modules/saas-billing` domain с ports/service/typed state machine; он переиспользует
  `PaymentProviderPort` через DI и не импортирует infra registry напрямую.
- [ ] Добавить минимальные org-owned records: billing account, source-aware subscription, invoice/order и normalized provider
  event. Invoice фиксирует tariff/package, amount/currency/period snapshot; webhook event имеет provider event ID и
  idempotency, но не хранит patient data.
- [ ] Перенести существующие manual `tariff_id` assignments в subscription/access rows с source=`manual`; переключить
  resolver на один access contract и проверять, что compatibility projection совпадает. Mismatch checker даёт non-zero.
- [ ] Реализовать prepaid lifecycle `pending_payment → active → expired/cancelled` с идемпотентным повторным checkout,
  capture, refund и периодическим expiry evaluation. Автоматическое списание без provider token contract не
  имитируется; новый оплачиваемый период создаётся подтверждённым checkout.
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
- [ ] Store package capture выдаёт source-aware org grants; refund/reversal отзывают только grants этого order.
- [ ] Payment failure/expiry не затрагивают другую клинику и не удаляют clinic-owned exercises/content.
- [ ] Реальные provider credentials, когда владелец их предоставит, вводятся только через Settings на тестовом сервере.
  До этого architecture, mock checkout и recorded provider contract fixtures должны проходить полностью; отсутствие
  ключей не блокирует schema/service/UI/webhook implementation.

**Проверка:** state-machine and idempotency tests; provider adapter contract tests; signed webhook success/replay/
forgery/amount mismatch; tariff and package capture/refund integration; A/B authz; secret redaction scan; checkout UI.

**Выход:** клиника может оплатить тариф или отдельный package через существующий provider layer; успешное событие
идемпотентно меняет subscription/grants, а refund корректно отзывает только свой источник доступа.

## 10. Абонементы — факт проверен, работа закрыта

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
- [ ] **ФИНАЛЬНОЕ РЕШЕНИЕ ВЛАДЕЛЬЦА:** утвердить точный список метрик и формулы после работающих tariffs/store/billing.
  Кандидаты из рулинга — клиники, специалисты, клиенты как counts, загрузки видео, биллинг и использование — не
  расширяются персональными drill-down.
- [ ] После решения реализовать только утверждённые metric keys, формулы и layout; каждый metric получает source
  query `file:line`, denominator/timezone semantics и fixture с ожидаемым числом.

**Проверка:** aggregate builder/port/API tests; schema/static PII checker + self-test; A/B authz; canary PII scan;
global_admin visual acceptance после финального metric decision.

**Выход:** global_admin видит утверждённую аналитику по клиникам и общей нагрузке, но platform analytics физически
не содержит персональной активности пациентов чужих клиник.

## 12. S4-6 — интеграционная приёмка на тестовом сервере

- [ ] Подготовить непересекающиеся synthetic fixtures: global_admin; clinic_admin/doctor A и B; разные tariffs/
  overrides; platform package; grant только A; clinic-owned exercises у A и B; SaaS invoice/subscription/order.
  Доказательство: fixture manifest без реальных PII.
- [ ] Global_admin создаёт/меняет tariff, цену/период/full mechanic map, назначает A, меняет override, курирует package,
  видит billing state и утверждённые aggregate metrics.
- [ ] Clinic A проходит checkout mock/recorded-provider flow, получает tariff/package access и продолжает видеть свои
  clinic exercises отдельно от store content.
- [ ] Clinic B не видит tariff override, invoice, grant, package/content/media или analytics A; её собственные
  exercises и mechanics работают по её tariff.
- [ ] Payment negatives: duplicate checkout/webhook, forged signature/org ID, wrong amount/currency, unknown provider
  ref, refund replay. Ни один отказ не меняет subscription/grant.
- [ ] Entitlement/store negatives: unauthenticated, doctor вместо global_admin, direct IDs, expired/revoked grant,
  mechanic OFF with active package grant.
- [ ] Analytics negatives: platform JSON/schema/visual artifacts не содержат patient identity, message text,
  exercise execution details или clinic drill-down rows; clinic A не получает B.
- [ ] UI-фазы получают desktop/mobile screenshots; executor, independent audit и fixer закрывают один и тот же
  checklist по [`ORCHESTRATION_BINDINGS.md`](../../ORCHESTRATION_BINDINGS.md).
- [ ] После всех фаз выполнить один финальный `pnpm install --frozen-lockfile && pnpm run ci`; повторять полный gate
  без изменений кода не требуется.

**Выход:** tariffs, one chokepoint, store, real-provider-ready SaaS billing, безопасная analytics и coexistence с
clinic exercises работают на тестовом сервере для A/B.

## 13. Единственные открытые решения владельца

1. **ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА:** как выглядит ручная «покупка» store package, пока PSP keys ещё не переданы:
   отдельное действие global_admin, clinic_admin request с последующим подтверждением или другой UX. Foundation
   order/grant API не угадывает этот интерфейс; tariff-included path и PSP checkout path строятся независимо.
2. **ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА В КОНЦЕ:** точный набор metric keys, formulas и layout platform analytics.

Все остальные детали этого плана — инженерная работа. Порядок фаз, table/route names, state machine, provider
contract, grant lifecycle, default compatibility и DB-role implementation не подписываются именем владельца и не
останавливаются вопросом к нему.

## 14. Definition of Done

- [ ] Каждая owner attribution ссылается на `OWNER_RULINGS_2026-07-15.md` либо непереопределённую Часть Б
  `OWNER_DECISIONS_FOR_REVIEW.md`; инженерные решения подписаны как инженерные.
- [ ] Полный mechanic registry доказан method-level matrix; все protected actions используют один chokepoint.
- [ ] Global_admin управляет tariffs/prices/periods/mechanics/assignments/overrides как DB data.
- [ ] Store packages и clinic-owned exercises сосуществуют; grants source-aware; canonical content/media не копируются.
- [ ] Existing provider adapters обслуживают SaaS checkout/capture/refund/webhook; keys DB-backed и redacted.
- [ ] Platform analytics содержит только утверждённые org/platform aggregates и проходит PII canary/static gate.
- [x] Bulk «Пересчитать» в memberships подтверждён существующим UI, route, service, tests и DB invariant.
- [ ] A/B acceptance, security negatives, screenshots/audits и один финальный CI gate закрыты на тестовом сервере.

## 15. Execution log

При старте реализации создать рядом `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS_LOG.md`. После каждой фазы фиксировать:

- run/agent IDs, checklist IDs, commit range и фактически изменённые files;
- точные post-change `file:line` для каждого закрытого пункта;
- tests/checkers/smokes/screenshots и exit/result;
- provider contract и credential-independent evidence;
- owner rulings отдельно от инженерных решений;
- residual risks и только два owner-decision пункта из §13.
