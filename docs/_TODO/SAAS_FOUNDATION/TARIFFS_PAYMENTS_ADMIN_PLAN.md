# Tariffs + Payment Completion + Global-Admin Tariff Grid — re-scoped plan (карточка #751)

> Статус: **план; код/схема/конфиг этим документом не менялись.** DOCS-ONLY проход, реальность проверена
> `code-search`/точечным чтением 2026-07-17. Реализация — отдельный проход по чек-листам ниже.
>
> **Обязательная delta 2026-07-18:** перед реализацией этот checklist читается вместе с
> [`../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md`](../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md)
> §§P1-P3,15 и [`SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`](./SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md). Утверждения ниже
> про конечный boolean list, отсутствие открытых вопросов или узкий prepaid billing устарели. Канон: произвольные
> тарифы, boolean+quota registry, trial-policy, clinic seats, global billing operations и organization
> «Тариф и биллинг»; policy/PSP gates блокируют только зависимые branches.

## 0. Провенанс и re-scope

Карточка #751 была шире (tariffs → entitlements → store → billing → analytics, см.
[`SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`](./SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md) и
[`STORE_EXECUTION_PLAN.md`](./STORE_EXECUTION_PLAN.md)). Владелец сузил её **2026-07-17**, дословно:

> «тарифы и оплата без магазина упражнений. плюс админскую часть для управления тарифной сеткой и вообще должно
> быть еще у админа хотя бы базово (техподдержку еще надо сделать чат)»

— [`OWNER_RULINGS_2026-07-17.md:25-38`](./OWNER_RULINGS_2026-07-17.md). Таблица там же прямо расписывает re-scope:
«#751 — БЕЗ магазина упражнений — магазин/пакеты отложены (не отменены). Платёжка есть — достраивать» + «UI
глобального админа для управления тарифной сеткой — в первую очередь».

**Значит для ЭТОГО документа:**
- Берём из `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` только S4-0/S4-1/S4-2 (registry, chokepoint, admin tariff UI) и
  урезанную S4-4 (biллинг поверх существующих PSP — только tariff subscription, БЕЗ store package orders).
- **НЕ берём** S4-3 (store packages) и S4-5 (platform analytics) — они остаются в S4-doc как отдельная, не
  отменённая, но отложенная работа. Этот документ их не планирует и не трогает.
- «У админа хотя бы базово + чат техподдержки» — это **отдельная карточка #808** (см.
  [`OWNER_RULINGS_2026-07-17.md:37`](./OWNER_RULINGS_2026-07-17.md)), **не входит** в этот документ.
- Биллинг: «платёжная система уже есть и почти готова — не удалять, не переписывать, достраивать; ключи владелец
  даст позже» — [`OWNER_RULINGS_2026-07-15.md:11-19`](./OWNER_RULINGS_2026-07-15.md).
- Тарифы: «тариф → набор механик; цены и состав настраивает глобальный админ, не хардкод; полный конструктор
  механик сразу» — [`OWNER_RULINGS_2026-07-15.md:29-34`](./OWNER_RULINGS_2026-07-15.md).
- Порядок фаз и вся инженерная схема ниже — **не решение владельца** (он явно делегировал: «я просто сказал, чтобы
  агент сам решил, в какой последовательности делать», [`OWNER_RULINGS_2026-07-15.md:24-27`](./OWNER_RULINGS_2026-07-15.md)).
- Правило прода: только «взять свежий дамп» может встречаться в планах — [`OWNER_RULINGS_2026-07-15.md:118-124`](./OWNER_RULINGS_2026-07-15.md).
  Весь документ ниже — **только тестовый сервер** (`bersoncarebot_test`, https://test.bersoncare.ru).

**Historical note 17.07:** на тот момент оба известных вопроса S4 относились к store/analytics вне #751. Это больше
не текущий gate statement. Owner-review 18.07 добавил для #751 quota semantics, trial end/start, clinic seats,
первый PSP и billing lifecycle/operations decisions. Независимые registry/chokepoint/ownership slices остаются
инженерными; зависимые branches не исполняются по догадке.

## 0a. UX/IA канон (мёрджнут в feat вчера, commit `12cdef5d6`) — обязателен для UI-фаз

`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/` — аудированный product/UX canon, отдельная иерархия приоритета от
foundation-рулингов: latest authority
[`OWNER_REVIEW_2026-07-18.md`](../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md) побеждает изменённый
product/UX scope, `OWNER_RULINGS_2026-07-16.md` действует в остальной области, а `OWNER_RULINGS_2026-07-15.md`
сохраняет приоритет в foundation/tenant/enforcement scope. Они не конфликтуют — governance разных доменов
(architecture/tenant vs UI/IA), обе стороны обязательны для этого документа.

Зоны, применимые к тарифам/оплате/admin-гриду (`ROLE_CAPABILITY_MATRIX.md`, `TARGET_IA.md`, `ROUTE_MIGRATION_MAP.md`):

- **`PLAT-02` Organizations** — «Search, organization detail, lifecycle, **entitlement/tariff assignment**» —
  [`TARGET_IA.md:84,182`](../SAAS_PRODUCT_UX_INITIATIVE/TARGET_IA.md). Global-admin назначение тарифа клинике.
- **`PLAT-03` Commercial** — «Plans, tariffs, usage, billing exceptions… contract actions audited; no clinical
  authority implied» — [`TARGET_IA.md:85,183`](../SAAS_PRODUCT_UX_INITIATIVE/TARGET_IA.md). Конструктор
  тарифов/цен/mechanics-грид.
- **`PLAT-05` Configuration** — «Platform integrations… platform defaults; DB-backed settings and secret-safe
  states» — [`TARGET_IA.md:87,185,205`](../SAAS_PRODUCT_UX_INITIATIVE/TARGET_IA.md). Новый глобальный ключ
  `saas_billing_payment_provider` (Phase 4) живёт здесь, не в org-owned booking payments.
- **`MGMT-08` Plan, usage and billing** — «Current plan, limits, invoices, recovery | Owner; delegated view/pay if
  explicitly allowed» — [`TARGET_IA.md:99,206`](../SAAS_PRODUCT_UX_INITIATIVE/TARGET_IA.md). Клиника видит свой
  тариф/usage/инвойсы и платит — это **другая** поверхность, внутри обычного tenant-дерева `/app/doctor/**`, не
  внутри platform shell.
- **Разделение org vs platform payment config уже канонизировано:** `ROUTE_MIGRATION_MAP.md` строка **S25** —
  текущая `admin/booking/payments/page.tsx` расщепляется на MGMT-03 booking + MGMT-07 integrations + **PLAT-05
  legacy/platform ops**, явно: «Organization ownership first; Rubitime/platform controls must not leak into
  ordinary setup» — [`ROUTE_MIGRATION_MAP.md:64`](../SAAS_PRODUCT_UX_INITIATIVE/ROUTE_MIGRATION_MAP.md). Это
  подтверждает инвариант §3/§5.4 ниже: `booking_payment_providers` (org) и `saas_billing_payment_provider`
  (platform) — разные identity, не смешивать.
- **Platform admin = отдельный shell, НЕ расширенный doctor-сайдбар:** «Platform administration uses a separate
  shell and route namespace. It is never an expanded clinical sidebar» /
  «Global admin has its own platform shell and never inherits clinical navigation» —
  [`TARGET_IA.md:177,328`](../SAAS_PRODUCT_UX_INITIATIVE/TARGET_IA.md). Это меняет план размещения нового UI в
  Phase 3 — см. правку там: **не** добавлять пункт в старый кластер `doctorNavLinks.ts` «Настройки» (тот кластер сам
  помечен на миграцию — `ROUTE_MIGRATION_MAP.md` строка **S23**: «move/split → PLAT-05 configuration»,
  [`ROUTE_MIGRATION_MAP.md:62`](../SAAS_PRODUCT_UX_INITIATIVE/ROUTE_MIGRATION_MAP.md)).
- **Владелец платформы работает с агрегатами/организациями, не с карточками пациентов** —
  [`OWNER_RULINGS_2026-07-16.md:98-104`](../SAAS_PRODUCT_UX_INITIATIVE/OWNER_RULINGS_2026-07-16.md) (UX08-10) —
  согласуется с тем, что этот документ и так не планирует patient-level admin UI.
- **Владелец workstream'а, которому принадлежит финальный platform shell:** `IMPLEMENTATION_ROADMAP.md` **U9 —
  global administration and bounded support** явно перечисляет «tariff/entitlement commercial operations per
  existing owner rulings» в своём scope и зависит от «existing tariff/settings foundation» —
  [`IMPLEMENTATION_ROADMAP.md:699-717`](../SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md). **Значит:** этот
  документ строит backend/API/data-слой (Phase 1-3), которым U9 воспользуется для финального единого platform shell;
  этот документ **не берёт на себя** полную переборку shell/навигации — это scope U9, отдельная инициатива. Phase 3
  UI здесь — промежуточное, IA-совместимое размещение (верные zone-ID, верный route-namespace), не финальный shell.
- **Entitlement denial имеет 4 состояния в каноне** (`upgrade/grace/read-only/blocked`), не просто вкл/выкл —
  [`ROLE_CAPABILITY_MATRIX.md:17`](../SAAS_PRODUCT_UX_INITIATIVE/ROLE_CAPABILITY_MATRIX.md). Phase 1-2 этого
  документа сознательно строят только бинарный `entitlement_required` (403) — этого достаточно для scope #751
  (тариф либо даёт механику, либо нет). Полная деградация `grace`/`read-only` при истечении подписки — задача Phase 4
  (см. правку там), не переоткрывается как пробел здесь.
- **Платформенная cross-org операция обязана идти через выделенный capability/port, без org-membership fallback** —
  [`ROLE_CAPABILITY_MATRIX.md:38,73`](../SAAS_PRODUCT_UX_INITIATIVE/ROLE_CAPABILITY_MATRIX.md): «tariff editing
  is platform capability»; «Dedicated platform capability/port before query or mutation; no organization membership
  fallback». Прямое подтверждение риска §8.1 этого документа (RLS-статус `be_organizations` под cross-org listing).

## 1. Reality lock — 2026-07-17 (проверено кодом, не по памяти)

| Область | Уже есть (file:line) | Чего нет / что устарело в старых доках |
|---|---|---|
| Схема entitlements | `saas_tariffs`, `be_organizations.tariff_id`, `saas_org_entitlement_overrides` — [`saasEntitlements.ts:24-59`](../../../apps/webapp/db/schema/saasEntitlements.ts); RLS overlay [`store-p0-entitlements-rls.sql`](../../../deploy/postgres/store-p0-entitlements-rls.sql) применён на test (commit `c1f07c130`) | Нет write-порта (P0 — read-only, [`ports.ts:1-9`](../../../apps/webapp/src/modules/org-entitlements/ports.ts)) |
| Mechanic registry | `MECHANICS` (14 штук) + `OrgMechanic` — [`org-entitlements/types.ts:6-23`](../../../apps/webapp/src/modules/org-entitlements/types.ts); резолвер `override ?? tariff ?? true` — [`service.ts:10-37`](../../../apps/webapp/src/modules/org-entitlements/service.ts); DI wired — [`buildAppDeps.ts:1609`](../../../apps/webapp/src/app-layer/di/buildAppDeps.ts) | — |
| Chokepoint | `requireEntitlement(mechanic)` — [`requireEntitlement.ts:7-23`](../../../apps/webapp/src/app-layer/guards/requireEntitlement.ts); единственный вызывающий — [`courses/route.ts:52`](../../../apps/webapp/src/app/api/doctor/courses/route.ts) (commit `530cb2bbd`) | **Баг, не в доке S4:** `courses/route.ts:50-53` вызывает auth **дважды** — прямой `requireDoctorWorkspaceApiContext()` (строка 50) **и** ещё раз внутри `requireEntitlement()` ([`requireEntitlement.ts:10`](../../../apps/webapp/src/app-layer/guards/requireEntitlement.ts)). S4-1 уже фиксирует это как задачу, но не сделано. Guard сегодня умеет **только** API Route Handler shape (`NextResponse`); Server Actions им напрямую не пользуются (см. ниже) |
| Global-admin tariff CRUD/UI | Нет ни одного файла. `grep -r "saas_tariffs\|tariffId" apps/webapp/src/app/api` — 0 route-файлов | STORE_EXECUTION_PLAN.md P2 полностью не реализован; ни `/api/admin/tariffs`, ни страницы «Тарифы» не существует |
| Admin nav/access tiers | 3-уровневая модель уже в коде: `doctor` / `clinic_admin` / `global_admin` — тип и visibility-фильтр [`doctorNavLinks.ts:36-52`](../../../apps/webapp/src/shared/ui/doctor/doctorNavLinks.ts); кластер «Настройки» (`id: "settings"`, global_admin, `admin-app-settings`/`admin-auth`/`admin-integrations`/`admin-technical`) — строки 112-135; кластер «Система» (`id: "system"`, global_admin, `system-health`/`health-archive`/`audit-log`) — строки 137-152 | Нет пункта «Тарифы» |
| API guard для настоящего platform-admin | `requireAdminWorkspaceApiContext()` — [`requireRole.ts:224-239`](../../../apps/webapp/src/app-layer/guards/requireRole.ts): `role==="admin" && adminMode` | **Риск именования:** в репо есть ТРИ разных «admin»-гейта под похожими именами — `requireAdminWorkspaceApiContext` (настоящий platform admin), `requireAdminDoctorPage`/`requireGlobalAdminDoctorPage` (page-уровень), и `requireAdminBookingEngine`/`requireClinicManagementApiContext` (это на самом деле **org-level** admin/owner, НЕ platform admin — [`_requireAdminBookingEngine.ts:24-34`](../../../apps/webapp/src/app/api/admin/booking-engine/_requireAdminBookingEngine.ts) фактически проверяет `role==="admin" && adminMode` тоже, но контекст — org-scoped booking engine, легко спутать при копипасте) |
| Org listing для global admin | `listOrganizations()` — [`pgBookingEngine.ts:141-144`](../../../apps/webapp/src/infra/repos/pgBookingEngine.ts) читает **все** строки `be_organizations` без org-фильтра в коде уровня порта | Не проверено, есть ли на `be_organizations` FORCE RLS, которая бы это резала для non-global-admin сессий: `grep -rl "CREATE POLICY.*be_organizations" deploy/postgres/*.sql` — 0 совпадений (таблица упоминается в политиках **других** таблиц, но своей политики не нашлось). Нужно подтвердить фактическое состояние RLS на `be_organizations` в начале Phase 3, а не предполагать |
| Org creation (пример пишущего пути) | `provisionSpecialistOwner` вызывает SECURITY DEFINER SQL-функцию `app.provision_specialist_owner` — [`pgOrganizationProvisioning.ts:102-127`](../../../apps/webapp/src/infra/repos/pgOrganizationProvisioning.ts) | `tariff_id` при создании организации нигде не проставляется — новая клиника всегда стартует с `tariff_id IS NULL` → резолвер возвращает all-true (не «базовый тариф», а «все механики включены») |
| Mailings / cms_pages write-путь | **Server Actions**, не route.ts: `executeBroadcastAction` — [`broadcasts/actions.ts:63-82`](../../../apps/webapp/src/app/app/doctor/broadcasts/actions.ts); content sections — [`content/sections/actions.ts:26,131,195,239`](../../../apps/webapp/src/app/app/doctor/content/sections/actions.ts). Обе используют `requireDoctorWorkspaceContext()` (page-контекст), не `requireDoctorWorkspaceApiContext()` | STORE_EXECUTION_PLAN.md (07-13) указывал `apps/webapp/src/app/api/doctor/broadcasts/*` и `.../content/*` как route-пути — **эти пути больше не существуют** (`find apps/webapp/src/app/api/doctor -maxdepth 1 -type d` не содержит `broadcasts`/`content`). `requireEntitlement()` в текущем виде **не может** гейтить Server Actions — возвращает `NextResponse`, которого там нет |
| Subscriptions (абонементы) write-путь | `POST /api/doctor/booking-engine/patient-packages` — [`patient-packages/route.ts:69`](../../../apps/webapp/src/app/api/doctor/booking-engine/patient-packages/route.ts), за локальной композицией `requireDoctorBookingEngine()` — [`_requireDoctorBookingEngine.ts:19-30`](../../../apps/webapp/src/app/api/doctor/booking-engine/_requireDoctorBookingEngine.ts), которая тоже вызывает `requireDoctorWorkspaceApiContext()` внутри себя | Гейтить в лоб `requireEntitlement("subscriptions")` после composed-гейта — снова двойной auth. Нужен redesign (см. §4) |
| Patient files / patient_card write-путь | Настоящий route.ts, тот же shape, что courses: `requireDoctorWorkspaceApiContext()` — [`patients/[userId]/files/route.ts:51,106`](../../../apps/webapp/src/app/api/doctor/patients/[userId]/files/route.ts) | Гейтится по образцу courses без проблем |
| Кнопка «Пересчитать» абонемент | Существует и работает — [`PatientPackageCard.tsx:165-177`](../../../apps/webapp/src/app/app/doctor/clients/PatientPackageCard.tsx), [`recalc/route.ts:12-48`](../../../apps/webapp/src/app/api/doctor/booking-engine/patient-packages/[id]/recalc/route.ts) | Владелец §11 закрыт фактом, см. [`SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md:278-293`](./SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md); в этом документе не переоткрывается |
| PSP adapters | 5 реальных адаптеров за одним портом: mock/yookassa/tinkoff/cloudpayments/alfabank — [`paymentProviderRegistry.ts:8-46`](../../../apps/webapp/src/infra/payments/paymentProviderRegistry.ts), [`providerPort.ts:11-34`](../../../apps/webapp/src/modules/payments/providerPort.ts) | Не трогать/не переписывать (владелец §1) |
| Существующий платёжный ledger | Org-scoped `bePrepaymentPolicies`/intents/payments/refunds, статусные enum'ы — [`bookingPayments.ts:1-60`](../../../apps/webapp/db/schema/bookingPayments.ts); сервис на 577 строк — [`payments/service.ts:1-577`](../../../apps/webapp/src/modules/payments/service.ts) | Это **booking/patient commerce** (предоплата визита, покупка пакета/продукта пациентом) — НЕ платформенный биллинг клиники за тариф. Разные домены, не смешивать (владелец не разделял эти два явно, но это уже задокументировано в S4 §2 и остаётся верным) |
| Webhook | Подписанный, per-org, резолвит организацию из intent перед capture — [`webhook/[provider]/route.ts:1-65`](../../../apps/webapp/src/app/api/payments/webhook/[provider]/route.ts). Есть и второй sibling: [`patient-acquiring-webhook/[provider]/route.ts`](../../../apps/webapp/src/app/api/payments/patient-acquiring-webhook/[provider]/route.ts) (FIN-02: bootstrap principal → provider config → verifyWebhook → org-scoped обработка) — ближайший прецедент по shape для нового saas-webhook route (Phase 4) | Работает только для booking/patient intents; платформенного (tariff subscription) webhook пути нет |
| Payment config UI | `booking_payment_providers`/`booking_payment_enabled` в `ALLOWED_KEYS` — [`system-settings/types.ts:112,123`](../../../apps/webapp/src/modules/system-settings/types.ts); секция настроек — [`BookingPaymentsSection.tsx`](../../../apps/webapp/src/app/app/settings/BookingPaymentsSection.tsx) (283 строки); PATCH-обработка ключа — [`admin/settings/route.ts:218,679`](../../../apps/webapp/src/app/api/admin/settings/route.ts) | Это **per-clinic** booking merchant config. Платформенного (SaaS billing) merchant-ключа нет |
| Patient package pay client | Завершает оплату только через мок — `POST /api/booking/memberships/payments/mock-complete` — [`PatientPackagePayClient.tsx:45`](../../../apps/webapp/src/app/app/patient/memberships/pay/PatientPackagePayClient.tsx) | Не в scope этого документа (patient-facing, не SaaS billing), но подтверждает: mock-путь уже есть и используется как штатный fallback без ключей — та же модель подходит для SaaS billing keyless-режима |
| Settings root split (S5) | **Первый слайс УЖЕ реализован** (commit `f846eb920`, 2026-07-16): таблицы `app_runtime_settings` + `app_runtime_settings_audit` — [`appRuntimeSettings.ts:19-56`](../../../apps/webapp/db/schema/appRuntimeSettings.ts), миграция [`0186_app_runtime_settings.sql`](../../../apps/webapp/db/drizzle-migrations/0186_app_runtime_settings.sql), порт [`pgAppRuntimeSettings.ts`](../../../apps/webapp/src/infra/repos/pgAppRuntimeSettings.ts), provider-слой [`runtimeConfig.ts`](../../../apps/webapp/src/modules/system-settings/runtimeConfig.ts), wired в `buildAppDeps`. Заголовок [`SAAS_S5_SETTINGS_ROOT_SPLIT.md:3`](./SAAS_S5_SETTINGS_ROOT_SPLIT.md) («код не менялся») сам устарел | **Но это НЕ меняет дом для `saas_billing_payment_provider`.** `app_runtime_settings` — по built-контракту **patient-safe, без секретов**: схема-комментарий «Restricted integration/admin settings remain in `system_settings`; only registry-approved safe projections are stored here» ([`appRuntimeSettings.ts:15-18`](../../../apps/webapp/db/schema/appRuntimeSettings.ts)); заголовок миграции «Restricted settings remain in public.system_settings» ([`0186_app_runtime_settings.sql:1-3`](../../../apps/webapp/db/drizzle-migrations/0186_app_runtime_settings.sql)); S5-дизайн кладёт «payment credentials» в Restricted-контур ([`SAAS_S5_SETTINGS_ROOT_SPLIT.md` §1.1](./SAAS_S5_SETTINGS_ROOT_SPLIT.md)). Ключ несёт provider-секреты → его дом — `system_settings`, **по дизайну, не «временно»** (см. Phase 4) |

## 2. Границы (что можно/нельзя трогать)

**В scope:**
- `apps/webapp/src/modules/org-entitlements/**` (write-порт, admin CRUD service).
- `apps/webapp/src/app-layer/guards/requireEntitlement.ts` (redesign) + новый Server Action adapter рядом.
- `apps/webapp/src/infra/repos/pgOrgEntitlements.ts` (+ write-методы), новый `apps/webapp/src/infra/repos/inMemoryOrgEntitlements.ts` (уже существует для DI fake — расширить, не дублировать).
- `apps/webapp/db/schema/saasEntitlements.ts` + backward-compatible migration for the owner-configured trial policy;
  не добавлять hardcoded/default-tariff semantics.
- `apps/webapp/src/app/api/admin/tariffs/**`, `apps/webapp/src/app/api/admin/organizations/**` (новые файлы).
- `apps/webapp/src/app/app/(global-admin)/doctor/tariffs/**` (новая platform-scoped страница, PLAT-02/PLAT-03 —
  см. §0a/Phase 3; **не** старый `/app/doctor/admin/**` кластер) + `doctorNavLinks.ts` — ровно **одна** строка:
  global_admin-tier пункт в существующем кластере `system` (см. Phase 3), не в кластере «Настройки».
- Существующие write-поверхности мест gating (`courses/route.ts` fix, `broadcasts/actions.ts`, `content/sections/actions.ts`, `patient-packages/route.ts`, admin booking-engine write routes, patient files route, patient-card write routes) — **только** добавление вызова entitlement-проверки, без изменения бизнес-логики.
- Новый `apps/webapp/src/modules/saas-billing/**` (домен), новая drizzle-миграция для его таблиц, новый `apps/webapp/src/app/api/payments/saas-webhook/[provider]/route.ts`, новый platform-конфиг UI (PLAT-05, рядом с Phase 3 страницей) и новый clinic-facing plan/usage/billing UI (MGMT-08, внутри `/app/doctor/**` tenant-дерева) — см. Phase 4.
- `system-settings/types.ts` — один новый ключ `saas_billing_payment_provider`.
- Тесты/доки для всего вышеперечисленного; `LOG.md` рядом с этим планом.

**Вне scope (явно не трогать в этой работе):**
- Store packages / `exercise_packages`/`exercise_catalog` grants (S4-3, `STORE_EXECUTION_PLAN.md` P3) — остаются resolver-only.
- Platform analytics / per-clinic dashboards (S4-5, P4) и аналитика специалиста (#800).
- Карточка #808 (базовый admin-минимум + чат техподдержки).
- Лендинг/два входа (#807), инвайты/календарь (#801, #806), `/book/{slug}` (#805) — параллельные карточки, отдельные файлы.
- `branding`, `custom_domain` mechanics — по-прежнему «no surface yet», не изобретать routes ради галочки.
- Любые prod-действия. Только `bersoncarebot_test` / test.bersoncare.ru. Единственное допустимое упоминание «production» — свежий дамп для локальной проверки, если понадобится.
- Переименование/новый домен — не в этом плане.
- `.cursor/rules/*`, `AGENTS.md`, CI workflow — не менять без отдельного явного запроса.

## 3. Целевая модель

```
тариф (admin-конфигурируемые имя/цена/период + typed entitlements/quotas)
  ├─ trial policy → выбранный global_admin тариф + duration/start/post-trial policy
  ├─ subscription/manual assignment → текущий effective tariff организации
  └─ per-org override → точечное исключение
       └─ requireEntitlement(organizationId, mechanic) — единственный chokepoint
            └─ разрешённое/запрещённое действие
```

### 3.1. `requireEntitlement` — redesign (устраняет двойной auth + добавляет Server Action shape)

Сегодняшняя `requireEntitlement(mechanic)` сама делает auth (`requireDoctorWorkspaceApiContext()`) — из-за этого
единственный вызывающий (`courses/route.ts`) вызывает auth дважды, а Server Action-пути (mailings, cms_pages) вообще
не могут ей воспользоваться (нет `NextResponse` в контексте actions). Целевой контракт:

- Ядро без auth: `assertMechanicEnabled(organizationId: string, mechanic: OrgMechanic): Promise<boolean>` — тонкая
  обёртка над уже существующим `isMechanicEnabled(port, organizationId, mechanic)`
  ([`service.ts:30-37`](../../../apps/webapp/src/modules/org-entitlements/service.ts)), ничего не меняет в резолвере.
- `requireEntitlement(ctx: { organizationId: string }, mechanic): Promise<{ok:true} | {ok:false; response: NextResponse}>`
  для API Route Handlers — принимает **уже авторизованный** контекст (любой: `DoctorWorkspaceAccessContext`,
  `DoctorBookingEngineContext`, `AdminBookingEngineContext` — все содержат `organizationId`), сам auth не делает.
  Вызывающий код обязан вызвать auth/composed-gate **до** этого вызова, ровно один раз.
- `requireEntitlementForAction(ctx: { organizationId: string }, mechanic): Promise<{ok:true} | {ok:false; mechanic: OrgMechanic}>`
  для `"use server"` Server Actions — тот же ассерт, без `NextResponse`; action сам решает, как показать отказ
  (throw, error state, redirect) — единообразно с тем, как остальные Server Actions в этих же файлах уже обрабатывают
  ошибки (`requireDoctorWorkspaceContext()` бросает redirect, поэтому action-код уже привык к этому паттерну).
- Один резолвер (`resolveOrgEntitlements`/`isMechanicEnabled`) обслуживает оба адаптера — не форкать логику.

Definition of Done для этого пункта: `courses/route.ts` вызывает auth **один раз**; `broadcasts/actions.ts` и
`content/sections/actions.ts` реально гейтятся; статический чекер (grep-правило) ловит прямой вызов
`isMechanicEnabled`/чтение tariff вне `requireEntitlement*`.

### 3.2. Новая организация — owner-configured trial policy, не фиксированный default

- Global admin выбирает любой созданный тариф как trial tariff и отдельно задаёт duration; названия/состав/число
  тарифов и срок не seedятся как product truth.
- До DDL закрыть branch-local gates: trial start event, post-trial/grace/read-only/block behavior и судьбу созданных
  capabilities/data. Неизбранная policy не блокирует tariff registry/chokepoint, но блокирует автоматическое
  provisioning нового trial.
- Org-creation path сохраняет organization identity и атомарно применяет активную trial policy через typed service;
  он не ищет `is_default` и не выбирает тариф по имени.
- Existing org с `tariff_id IS NULL` сначала инвентаризируются. Их compatibility behavior сохраняется до отдельного
  dry-run/backfill решения; агент не назначает им придуманный «Базовый/Legacy» тариф без owner-approved mapping.
- Compatibility `?? true` должен быть устранён после явного migration gate, но не ценой скрытого изменения доступа.

### 3.3. Один effective access contract — не два расходящихся

Compatibility-projection `be_organizations.tariff_id` остаётся источником для P1/P2. S4-4-подобный «источник
истины между manual assignment и paid subscription» переносится в Phase 4 этого документа (§5.4) в урезанном виде
(только tariff subscription, без store orders) — см. предупреждение S4 §3 «не держит две расходящиеся истины».

## 4. Реестр механик — актуальное состояние на 2026-07-17

| Mechanic | Целевой write-путь | Тип (route/action) | Текущий гейт | Что сделать в Phase 2 |
|---|---|---|---|---|
| `courses` | `POST /api/doctor/courses` | route | ✅ гейтится, но с багом двойного auth | Фикс на новый контракт §3.1 |
| `mailings` | `executeBroadcastAction` [`actions.ts:63`](../../../apps/webapp/src/app/app/doctor/broadcasts/actions.ts) | Server Action | ❌ не гейтится | `requireEntitlementForAction` |
| `cms_pages` | `sections/actions.ts:26,131,195,239` | Server Action | ❌ не гейтится | `requireEntitlementForAction` на create/update/publish/delete |
| `subscriptions` | `POST /api/doctor/booking-engine/patient-packages` | route (composed gate) | ❌ не гейтится | `requireEntitlement(ctx, "subscriptions")` после `requireDoctorBookingEngine()`, используя его `organizationId` |
| `patient_card` | patient-card write routes под `/api/doctor/patients/[userId]/*` (diagnoses/complaints/anamnesis/visits — не list) | route | ❌ не гейтится | Выбрать 1 репрезентативный write route per sub-resource; не гейтить чтения |
| `files` | `POST /api/doctor/patients/[userId]/files` | route | ❌ не гейтится | Прямой `requireEntitlement`, тот же shape что courses |
| `booking` | admin booking-engine write routes (branch/service/slot create) под `/api/admin/booking-engine/*`, за `requireAdminBookingEngine()` | route (composed gate) | ❌ не гейтится | Как `subscriptions` — организация уже в composed ctx |
| `payments` | ветка `booking_payment_providers`/`booking_payment_enabled` внутри `admin/settings/route.ts` PATCH | route (generic settings endpoint) | ❌ не гейтится | Точечная проверка entitlement **только** для этих двух ключей внутри существующего PATCH handler, не гейтить весь `/api/admin/settings` |
| `patient_app` | нет поверхности (подтверждено: `grep` не находит `patient_app_enabled`/toggle) | — | resolver-only | Не изобретать route; пометить `declared_no_surface` |
| `exercise_catalog` | вне scope (store, S4-3) | — | resolver-only | Не трогать в этой работе |
| `exercise_packages` | вне scope (store, S4-3) | — | resolver-only | Не трогать в этой работе |
| `patient_app_paid_subscription` | нет поверхности | — | resolver-only | `declared_no_surface` |
| `branding` | нет поверхности | — | resolver-only | `declared_no_surface` |
| `custom_domain` | нет поверхности | — | resolver-only | `declared_no_surface` |

## 5. Фазы (инженерный порядок, не решение владельца)

### Phase 1 — chokepoint hardening (registry + redesign, без нового UI)

- [ ] Реализовать `assertMechanicEnabled` + redesign `requireEntitlement(ctx, mechanic)` + новый
  `requireEntitlementForAction(ctx, mechanic)` по контракту §3.1. Не менять `resolveOrgEntitlements`/`isMechanicEnabled`.
- [ ] Починить `courses/route.ts:50-53` — один вызов auth, один вызов entitlement.
- [ ] Добавить статический чекер (скрипт в `apps/webapp/scripts/` или тест-guard), не дающий прямого импорта
  `isMechanicEnabled`/tariff-чтения из `app/api/**` или `app/app/**/actions.ts` мимо `requireEntitlement*`.
- [ ] Unit-тесты: `requireEntitlement` без auth-side-effect (принимает готовый ctx), `requireEntitlementForAction`
  тот же resolver, оба independent от auth-механизма вызывающего кода.

**Проверка:** `pnpm --filter webapp vitest run` по затронутым файлам + `pnpm --filter webapp typecheck`.
**Выход:** один chokepoint работает из route.ts и из Server Actions одинаково; нет двойного auth нигде.

### Phase 2 — гейтинг оставшихся механик (default-on, zero behavior change)

Для каждой строки таблицы §4 со статусом «❌ не гейтится»:

- [ ] Перед правкой — `code-search`/`grep` подтверждает актуальный путь файла (пути в §4 уже проверены на
  2026-07-17, но файл мог измениться за время работы — не доверять слепо этому документу дольше одного сеанса).
- [ ] Добавить вызов `requireEntitlement`/`requireEntitlementForAction` **после** существующего auth/composed gate.
- [ ] Проверка per mechanic на test (curl/actions): дефолт (без тарифа/override) — работает как раньше; override
  `enabled=false` для org A — 403/typed-denied; org B не затронут; удалить override — снова работает.
- [ ] 🔴 Полный regression sweep по demo-clinic-a: каждая гейтнутая write-поверхность всё ещё 200 по умолчанию
  (ни одна не сломалась случайно), auth всегда предшествует entitlement (порядок не инвертирован), кросс-тенантная
  проверка (override A не течёт на B).

**Проверка:** contract test на каждый gated route/action; полный regression sweep как отдельный пункт приёмки.
**Выход:** все механики с реальной write-поверхностью гейтятся одним и тем же chokepoint; поверхности без
write-пути честно помечены `declared_no_surface` (не изобретены).

### Phase 3 — global-admin конструктор тарифов + assign-to-org + trial policy

- [ ] Спроектировать backward-compatible trial-policy storage как ссылку на существующий admin-created tariff с
  duration/start/post-trial полями; не добавлять фиксированный тариф или `is_default` product semantics.
- [ ] Расширить `modules/org-entitlements` write-портом: `listTariffs`, `getTariff`, `createTariff`, `updateTariff`,
  `deactivateTariff`, `getTrialPolicy`, `setTrialPolicy`, `assignTariffToOrg`, `unassignTariffFromOrg`, `upsertOverride`,
  `deleteOverride`. Валидировать mechanic-ключи только по `MECHANICS` (registry §4) — отсутствующий UI-toggle не
  теряет ключ молча.
- [ ] Подтвердить фактическое RLS-состояние `be_organizations` (см. риск в Reality lock) **до** реализации
  cross-org listing endpoint — если таблица без своей FORCE RLS policy сегодня, зафиксировать это явно и решить,
  нужен ли аудируемый platform read port или явный global-admin bypass с логированием (не тихий DB bypass —
  см. S4 «Неподвижные рамки»: «Platform cross-clinic operations проходят отдельный audited platform port/capability,
  не adminMode, не случайную clinic session и не DB bypass»).
- [ ] `GET/POST/PATCH /api/admin/tariffs` (+ деактивация) под **`requireAdminWorkspaceApiContext`** — НЕ путать с
  `requireAdminBookingEngine`/`requireClinicManagementApiContext` (те org-scoped, см. риск именования в Reality lock).
- [ ] `GET /api/admin/organizations` — cross-org список для picker'а (только id/title/tariffId), тот же guard.
- [ ] `POST /api/admin/organizations/:id/tariff` — назначить/снять тариф; `POST/DELETE /api/admin/organizations/:id/entitlement-overrides`
  — override CRUD с identity `(organizationId, mechanic)`; delete возвращает effective tariff result, не хранит копию.
- [ ] Org-creation: применить выбранную global-admin trial policy через typed service в атомарной provisioning
  boundary; не выбирать тариф по имени/`is_default` и не скрывать неполную policy под all-on fallback — см. §3.2.
- [ ] Для существующих org с `tariff_id IS NULL` сначала выполнить read-only inventory/dry-run. Apply разрешён только
  по owner-approved mapping; до него сохранить compatibility behavior, не назначать придуманный all-true тариф.
- [ ] UI-размещение — **PLAT-02/PLAT-03**, НЕ старый паттерн S23 (см. §0a). Не добавлять пункт в кластер
  «Настройки» `doctorNavLinks.ts` рядом с `admin-app-settings`/`admin-auth` — тот кластер сам помечен на миграцию
  прочь из doctor-сайдбара. Вместо этого — новый route-group маршрут по образцу уже существующего PLAT-07
  (`system-health`): `apps/webapp/src/app/app/(global-admin)/doctor/tariffs/page.tsx` + свой `layout.tsx`
  (`requireGlobalAdminDoctorPage()` + `DoctorWorkspaceShell` c `enableTenantRuntime={false}`, тот же shape, что
  [`system-health/layout.tsx:15-27`](<../../../apps/webapp/src/app/app/(global-admin)/doctor/system-health/layout.tsx>)).
  Точное имя route-сегмента (`tariffs` / `organizations` / `commercial`) — инженерный выбор фазы, не финальная
  IA-навигация (та — scope workstream'а U9, см. §0a; эта страница не дублирует и не подменяет его будущий shell).
- [ ] Точка входа в навигации: зеркалируемый паттерн PLAT-07 **имеет** пункт меню — `system-health`/`health-archive`/
  `audit-log` живут в отдельном кластере `system` («Система», `accessTier: "global_admin"`) —
  [`doctorNavLinks.ts:137-152`](../../../apps/webapp/src/shared/ui/doctor/doctorNavLinks.ts). Страница «Тарифы»
  получает global_admin-tier пункт **в этом же кластере `system`** (одна строка в `items`), НЕ в кластере
  «Настройки» (`id: "settings"`, строки 112-135 — админ-формы, S23). Это тот же интерим-паттерн, что и у
  system-health: пункт виден только global_admin, а финальная platform-навигация — U9.
- [ ] Содержимое страницы = **PLAT-03** (список тарифов + форма имя/цена/период + чекбокс-грид всех 14 механик,
  контент «Commercial») и **PLAT-02** (назначение тарифа клинике + override-редактор, контент «Organizations» —
  явная platform capability + target-организация, без org-membership fallback). Одна страница/вкладки — ок для
  этой фазы; в финальном U9-shell это может стать двумя разными PLAT-экранами.
- [ ] Только shared doctor primitives + shadcn — см. `.cursor/rules/doctor-ui-shared-primitives.mdc`, без локальных
  одноразовых карточек. `clinic_admin`/doctor не видят маршрут (нет пункта меню, никакого fallback на doctor nav) и
  получают 403 на API.
- [ ] Audit-событие на каждое tariff/assignment/override изменение: actor, target org, before/after mechanic map,
  без секретов/PII. **Механизм — переиспользовать существующий `admin_audit_log`, не строить новый:** таблица уже
  есть ([`schema.ts:1949-1975`](../../../apps/webapp/db/schema/schema.ts): `organizationId` nullable, `actorId`,
  `action`, `targetId`, `details jsonb`, `status`), writer `writeAuditLog` —
  [`adminAuditLog.ts:97`](../../../apps/webapp/src/infra/adminAuditLog.ts); реальные вызывающие — `/api/admin/*`
  handlers (operator-incidents, health-failure-archive, users profile), `/api/integrator/events` и
  `app-layer/product-analytics`, все через re-export `@/app-layer/admin/auditLog`
  ([`app-layer/admin/auditLog.ts:1-14`](../../../apps/webapp/src/app-layer/admin/auditLog.ts));
  modules/admin-incidents импортирует из него только conflict-key helper, не writer. У global_admin уже есть
  страница просмотра «Журнал операций» (`/app/doctor/audit-log`). Новые action-ключи вида
  `saas_tariff_create|update|deactivate`, `saas_tariff_assign|unassign`, `saas_entitlement_override_upsert|delete`;
  before/after mechanic map — в `details`. Вызов из module-слоя — через port по clean-architecture правилам
  (`.cursor/rules/clean-architecture-module-isolation.mdc`), не прямым импортом `@/infra/adminAuditLog` из module.
  Отдельная audit-таблица под тарифы НЕ создаётся (single chokepoint / no-dup).

**Проверка:** module/PG тесты на write-порт; authz A/B матрица (`demo-clinic-a` не может дойти до `/api/admin/tariffs`
ни страницы, ни API); constructor RTL-тест; desktop+mobile screenshot приёмка.
**Выход:** тарифная сетка, цены, mechanics, назначение клинике и override — управляются как данные глобальным
админом; новая организация использует выбранную trial policy, а не hardcoded/default/all-on тариф.

### Phase 4 — достройка SaaS billing поверх существующих PSP (keyless-safe)

Урезанная версия S4-4: **только** оплата клиникой тарифа (SaaS-подписка, `saas_billing_subscription` — НЕ mechanic
`subscriptions`, см. риск §8.7), БЕЗ store package orders (S4-3 вне scope).

- [ ] Новый домен `modules/saas-billing` (ports/service), DI через `buildAppDeps`, переиспользует существующий
  `PaymentProviderPort`/`paymentProviderRegistry` — не форкает и не переписывает адаптеры (владелец §1).
- [ ] Минимальные org-owned таблицы: billing account, **`saas_billing_subscriptions`**
  (`pending_payment → active → expired/cancelled`), invoice (снимок tariff/amount/currency/period), provider event
  (idempotent, без patient data). **Именование обязательно дизъюнктно с mechanic `subscriptions`:** в `MECHANICS`
  уже есть ключ `subscriptions` ([`org-entitlements/types.ts:14`](../../../apps/webapp/src/modules/org-entitlements/types.ts))
  = «разрешены ли клинике пациентские абонементы» — совсем другая сущность. Все таблицы/типы/переменные Phase 4
  используют префикс `saas_billing_*` / `SaasBillingSubscription`, голое слово «subscription» в новом коде запрещено
  (см. риск §8.7).
- [ ] Перенести существующие manual `tariff_id` assignments (из Phase 3) в `saas_billing_subscriptions` rows с
  `source="manual"`; compatibility-projection `be_organizations.tariff_id` остаётся согласованной, не второй истиной.
- [ ] Новый global setting-ключ `saas_billing_payment_provider` в `ALLOWED_KEYS`
  ([`system-settings/types.ts`](../../../apps/webapp/src/modules/system-settings/types.ts)) — **отдельная** identity
  от `booking_payment_providers` (владелец не путает platform merchant с per-clinic booking merchant — см. S4 §3).
  **Хранилище — `system_settings` (restricted-контур), решение с доказательством, не «временное».** S5-слайс уже
  реализован (`f846eb920`, см. Reality lock), но `app_runtime_settings` — по built-контракту patient-safe без
  секретов: «Restricted integration/admin settings remain in `system_settings`»
  ([`appRuntimeSettings.ts:15-18`](../../../apps/webapp/db/schema/appRuntimeSettings.ts),
  [`0186_app_runtime_settings.sql:1-3`](../../../apps/webapp/db/drizzle-migrations/0186_app_runtime_settings.sql)),
  а S5-дизайн явно относит «payment credentials» к Restricted ([`SAAS_S5_SETTINGS_ROOT_SPLIT.md` §1.1](./SAAS_S5_SETTINGS_ROOT_SPLIT.md)).
  Этот ключ несёт provider-секреты (shopId/secretKey/webhookSecret) → `system_settings`. Если Phase 4 понадобится
  клиентский НЕ-секретный флаг (например «SaaS checkout включён») — вот ЕГО можно завести как отдельный
  `derived_runtime`-ключ в `app_runtime_settings`; секретный envelope туда не попадает никогда.
  IA-зона этого конфига — **PLAT-05 Configuration** («platform integrations… platform defaults», см. §0a), не
  `MGMT-03`/`MGMT-07` (org booking payments/integrations) — тот же разрез, что канон уже зафиксировал для текущей
  `admin/booking/payments` страницы в `ROUTE_MIGRATION_MAP.md` строке **S25** (см. §0a). UI-поле для этого ключа
  живёт на той же PLAT-страницу(ах), что и Phase 3 (или соседней PLAT-05 секции), не смешивается с org Settings.
  Redaction/secret-handling по тому же паттерну, что уже есть у `booking_payment_providers` в
  [`admin/settings/route.ts`](../../../apps/webapp/src/app/api/admin/settings/route.ts).
- [ ] Дефолтный provider id = `"mock"` (уже существующий адаптер, [`paymentProviderRegistry.ts:25-26`](../../../apps/webapp/src/infra/payments/paymentProviderRegistry.ts))
  до тех пор, пока владелец не передаст реальные ключи. Схема/сервис/UI/webhook реализуются и проверяются
  **полностью** на mock-адаптере — отсутствие реальных ключей не блокирует ни один из этих пунктов.
- [ ] `POST /api/payments/saas-webhook/[provider]` (новый, отдельный от booking-webhook) под bootstrap principal:
  load global config → verify signature/status через существующий `verifyWebhook` → resolve invoice /
  `saas_billing_subscription` → org-scoped capture. Неизвестный ref — safe-acknowledge; forged
  signature/amount/currency mismatch/replay не меняют доступ.
- [ ] Checkout UI — **другая зона от Phase 3.** Clinic-facing план/usage/инвойсы/оплата = **`MGMT-08` Plan, usage
  and billing** («Current plan, limits, invoices, recovery | Owner; delegated view/pay if explicitly allowed», см.
  §0a) — внутри обычного tenant-дерева `/app/doctor/**` (не в `(global-admin)` route group из Phase 3). Новая
  страница/секция под clinic settings/organization area; возвращает provider checkout URL; return page сверяет
  invoice/order по server-derived org, никогда не берёт сумму/tariff/target org от клиента.
- [ ] Успешный capture продлевает `source="paid_subscription"`; expiry/cancel/refund завершает только этот source;
  manual global-admin assignment не перетирается истёкшей подпиской молча.
- [ ] Деградация при `expired`/`past_due` — сверить с каноном 4-состояний entitlement denial (`upgrade/grace/
  read-only/blocked`, [`ROLE_CAPABILITY_MATRIX.md:17`](../SAAS_PRODUCT_UX_INITIATIVE/ROLE_CAPABILITY_MATRIX.md),
  см. §0a) при проектировании state machine: истечение подписки не обязано мгновенно бить `blocked` на все
  mechanics — решить явно (grace-период до hard block — инженерный выбор этой фазы, не молчаливый пробел).

**Проверка:** state-machine + idempotency тесты; подписанный webhook success/replay/forgery/amount-mismatch;
capture/refund integration тест на mock-адаптере; secret redaction scan; checkout UI RTL/E2E.
**Выход:** клиника может оплатить тариф через существующий provider layer в mock-режиме на test; когда владелец
даст реальные ключи, включение — это просто смена `providerId` в Settings, без нового кода.

### Phase 5 — интеграционная приёмка на тестовом сервере

- [ ] Fixture-манифест: global_admin; demo-clinic-a/b с разными тарифами и override; новая org через signup flow
  (проверяет §3.2 — использует выбранный trial tariff/duration, без hardcoded/default/all-true).
- [ ] Global admin создаёт/меняет тариф, полный mechanic grid, назначает A, меняет override, видит billing state.
- [ ] Clinic A проходит mock checkout, получает активную подписку на тариф; clinic B её не видит/не затронута.
- [ ] Negatives: unauthenticated, doctor вместо global_admin на `/api/admin/tariffs` (403), forged org id, forged
  webhook signature, amount mismatch, replay, mechanic OFF при активной подписке (доступ всё равно закрыт по
  entitlement, подписка не значит automatic mechanic override).
- [ ] Полный regression sweep: existing org сохраняют compatibility access до owner-approved mapping; после
  отдельного mapping apply ни одна организация не теряет доступ вопреки preview.
- [ ] Один финальный `pnpm install --frozen-lockfile && pnpm run ci` после всех фаз — не гонять full CI после
  каждого шага.

**Выход:** тарифы, единый chokepoint, admin-грид и SaaS billing (keyless-safe) работают на тестовом сервере;
демонстрируемо владельцу.

## 6. Definition of Done

- [ ] `requireEntitlement`/`requireEntitlementForAction` — один резолвер, оба API route и Server Action пути реально
  используют его; статический guard подтверждает отсутствие обходов.
- [ ] Все 14 механик из реестра §4 либо гейтятся на реальной write-поверхности, либо честно помечены
  `declared_no_surface` — ни одна не осталась «предполагается, но не проверено».
- [ ] Новая организация применяет выбранную global-admin trial policy; если зависимая policy не утверждена/неполна,
  автоматическое trial provisioning fail-closed без подстановки придуманного тарифа. Existing NULL-org проходят
  отдельный owner-approved migration mapping до удаления compatibility behavior.
- [ ] Global-admin управляет тарифами/ценами/периодом/mechanics/назначением/override как данными; `clinic_admin`
  получает 403 везде.
- [ ] SaaS billing проходит полный цикл (checkout → capture → активная `saas_billing_subscription` → expiry/refund)
  на mock-адаптере; реальные ключи подключаются сменой настройки, без нового кода.
- [ ] A/B изоляция и security negatives (Phase 5) закрыты на тестовом сервере; один финальный CI gate зелёный.
- [ ] Ни один пункт этого документа не был подписан именем владельца там, где решение инженерное (провенанс §0).
- [ ] UI-фазы (Phase 3/4) размещены в верных zone-ID (`PLAT-02`/`PLAT-03`/`PLAT-05`/`MGMT-08`, §0a), не в старом
  doctorNavLinks-кластере «Настройки», и не дублируют/не блокируют будущий U9 platform shell.

## 7. Execution log

При старте реализации завести рядом `TARIFFS_PAYMENTS_ADMIN_PLAN_LOG.md`. После каждой фазы фиксировать: commit
range, точные post-change `file:line` для каждого закрытого пункта, tests/checkers/screenshots и результат,
owner ruling vs инженерное решение раздельно, остаточные риски.

## 8. Открытые инженерные риски (не решения владельца — фиксируются, чтобы Phase 3/4 их не проглядели)

1. **RLS-статус `be_organizations` не подтверждён.** Порт `listOrganizations()` сегодня не фильтрует по org в коде;
   не найдено `CREATE POLICY` именно на эту таблицу в `deploy/postgres/*.sql`. Cross-org listing для tariff-assignment
   picker должен пройти через явный, аудируемый path — не унаследовать случайную дыру и не изобрести новый DB bypass.
   Канон подтверждает это требование отдельно от foundation-доков: «Dedicated platform capability/port before query
   or mutation; no organization membership fallback» —
   [`ROLE_CAPABILITY_MATRIX.md:38,73`](../SAAS_PRODUCT_UX_INITIATIVE/ROLE_CAPABILITY_MATRIX.md).
2. **Три разных «admin»-гейта с похожими именами** (`requireAdminWorkspaceApiContext` = настоящий platform admin;
   `requireAdminBookingEngine`/`requireClinicManagementApiContext` = org-level). Риск: скопировать не тот гейт для
   `/api/admin/tariffs` и случайно открыть тарифную сетку clinic_admin.
3. **Org-creation происходит внутри SECURITY DEFINER SQL-функции** (`app.provision_specialist_owner`). Применение
   выбранной trial policy должно быть атомарно согласовано с provisioning, но нельзя зашивать `is_default`, имя или
   состав тарифа в SQL. Точную transaction boundary решить до Phase 3 write path.
4. **S5 (settings root split) частично реализован** (`f846eb920`: `app_runtime_settings` + provider-слой уже в
   коде, см. Reality lock) — но runtime-таблица by-contract без секретов, поэтому `saas_billing_payment_provider`
   (секреты) живёт в `system_settings` **по дизайну** (см. Phase 4). Остаточный риск другой: если S5 продолжит
   раскатываться параллельно, реализатор Phase 4 обязан свериться с актуальным состоянием registry S5 на момент
   реализации (какие ключи уже мигрированы, какой accessor канонический), а не с этим снапшотом.
5. **Компоновка chokepoint с local composed-гейтами** (`requireDoctorBookingEngine`, `requireAdminBookingEngine`,
   `requireClinicManagementApiContext`) — у каждого свой `ctx`-тип с полем `organizationId`; `requireEntitlement`
   redesign должен принимать любой `{ organizationId: string }`-совместимый ctx, а не завязываться на конкретный тип
   `DoctorWorkspaceAccessContext`, иначе Phase 2 придётся форкать guard под каждый composed-гейт.
6. **Phase 3 UI — временное размещение, не финальный shell.** Полная выделенная platform-навигация (без
   наследования doctor-сайдбара) — scope workstream'а **U9** ([`IMPLEMENTATION_ROADMAP.md:699-728`](../SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md),
   см. §0a), которая этим документом не начинается и не переоткрывается. Риск: если U9 стартует параллельно, две
   команды могут независимо построить два разных «platform shell» — Phase 3 здесь должен явно ссылаться на этот
   документ (и наоборот), не молчать о пересечении.
7. **Коллизия имени «subscription».** Mechanic `subscriptions` в `MECHANICS`
   ([`org-entitlements/types.ts:14`](../../../apps/webapp/src/modules/org-entitlements/types.ts)) = флаг «клинике
   разрешены пациентские абонементы» (гейтит `patient-packages` routes, §4). SaaS-подписка клиники на тариф из
   Phase 4 — не связанная с ним сущность. Если реализатор назовёт таблицу/тип просто `subscriptions`/`Subscription`,
   код и тесты начнут путать биллинговое состояние организации с entitlement-флагом. Есть и третий существующий
   тёзка: таблица `user_subscriptions` ([`schema.ts:2652`](../../../apps/webapp/db/schema/schema.ts), домен
   notification-topics интегратора, схема несвязанная — риск коллизии низкий, но в поиске по слову всплывёт).
   Контракт Phase 4: только `saas_billing_*`-префикс (`saas_billing_subscriptions`, `SaasBillingSubscription`);
   ревью отклоняет голое «subscription» в новых идентификаторах.

## НЕ СДЕЛАНО (в этом документе)

- Реализация — этот проход был **docs-only**; ни один файл кода/схемы/конфига не менялся.
- Store packages, platform analytics, #808 (admin baseline + чат техподдержки), #805-807/801/806 (booking slug,
  лендинг, инвайты) — сознательно не включены, отдельные документы/карточки.
- Подтверждение фактического RLS-состояния `be_organizations` — зафиксировано как открытый риск (§8.1), не
  проверено вживую в рамках этого DOCS-ONLY прохода.
- Финальный список цен/состава тарифов (какие именно mechanics в «базовом» тарифе) — это данные, которые вводит
  global admin через UI Phase 3, не хардкод и не решение этого документа.
