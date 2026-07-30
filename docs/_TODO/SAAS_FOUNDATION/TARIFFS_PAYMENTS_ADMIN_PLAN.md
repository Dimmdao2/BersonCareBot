# Tariffs + Payment Completion + Global-Admin Tariff Grid — re-scoped plan (карточка #751)

> Статус: **план; код/схема/конфиг этим документом не менялись.** DOCS-ONLY проход, реальность проверена
> `code-search`/точечным чтением 2026-07-17. Реализация — отдельный проход по чек-листам ниже.
>
> **Reconciliation 2026-07-27 (was → now → why):** был документ с 44 открытыми `[ ]` без сверки с фактическим
> состоянием кода на `feat/doctor-ui-rebuild`. Стало: построчная сверка каждого чекбокса против кода/тестов/деплоя
> (не по отчёту, не по имени файла). Почему: между 2026-07-17 (реальность-лок этого документа) и сегодня прошла
> отдельная, не отслеженная этим планом волна работы (карточки C5A/#1003/owner ruling 2026-07-26) — она закрыла
> Phase 1-3 практически полностью и местами **превысила** формулировку плана (единый резолвер вырос в
> read/mutation/Server-Action/Page адаптеры с 4-состояниями `active/read_only/blocked` вместо плоского on/off;
> платформенный UI получил не временное размещение внутри doctor-сайдбара, а полностью отдельный `/app/admin/*`
> shell с собственной навигацией — то, что план явно откладывал как scope воркстрима U9). Phase 4 (SaaS billing) и
> Phase 5 (интеграционная приёмка) подтверждены как реально ОТКРЫТЫЕ — `modules/saas-billing`, `saas_billing_*`
> схема, `saas-webhook` роут не существуют нигде в репозитории (проверено `grep`/`find`, не по памяти). Итог:
> **20 из 44 боксов отмечены `[x]`** (с пруфом commit/file:line/перепрогнанный зелёный тест — большинство Phase 1-3),
> **24 остаются открытыми** `[ ]` (в основном Phase 4/5 целиком + два открытых пункта внутри Phase 3 — trial policy
> при provisioning и NULL-org migration mapping). Часть ticked-боксов помечена ДУБЛЬ-СЛИТ: функциональность есть,
> но не в форме отдельных роутов, которые называл план (единый `/api/admin/commercial` вместо раздельных
> `/api/admin/tariffs`+`/api/admin/organizations`) — это не пробел, а более сильный «single chokepoint»-паттерн.
> Отдельно зафиксирован «ложный друг»: статический anti-bypass чекер существует и протестирован (self-test 6/6),
> но при прямом запуске сегодня даёт false-positive и не подключён ни к `lint`, ни к `ci`. Phase 1 п.3 (весь бокс —
> про этот чекер) оставлен ОТКРЫТЫМ по этой причине; DoD п.1 (бокс о двух вещах — едином резолвере И чекере)
> тикнут с явной 🔴-оговоркой, потому что часть про «один резолвер, оба пути его используют» доказана отдельно от
> чекера.
>
> **Обязательная delta 2026-07-18:** перед реализацией этот checklist читается вместе с
> [`../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md`](../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md)
> §§P1-P3,15 и [`SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`](./SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md). Утверждения ниже
> про конечный boolean list, отсутствие открытых вопросов или узкий prepaid billing устарели. Канон: произвольные
> тарифы, boolean+quota registry, trial-policy, clinic seats, global billing operations и organization
> «Тариф и биллинг»; policy/PSP gates блокируют только зависимые branches.

## 0. Провенанс и re-scope

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

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

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

| Область                                 | Уже есть (file:line)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Чего нет / что устарело в старых доках                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Схема entitlements                      | `saas_tariffs`, `be_organizations.tariff_id`, `saas_org_entitlement_overrides` — [`saasEntitlements.ts:24-59`](../../../apps/webapp/db/schema/saasEntitlements.ts); RLS overlay [`store-p0-entitlements-rls.sql`](../../../deploy/postgres/store-p0-entitlements-rls.sql) применён на test (commit `c1f07c130`)                                                                                                                                                                                                   | Нет write-порта (P0 — read-only, [`ports.ts:1-9`](../../../apps/webapp/src/modules/org-entitlements/ports.ts))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Mechanic registry                       | `MECHANICS` (14 штук) + `OrgMechanic` — [`org-entitlements/types.ts:6-23`](../../../apps/webapp/src/modules/org-entitlements/types.ts); резолвер `override ?? tariff ?? true` — [`service.ts:10-37`](../../../apps/webapp/src/modules/org-entitlements/service.ts); DI wired — [`buildAppDeps.ts:1609`](../../../apps/webapp/src/app-layer/di/buildAppDeps.ts)                                                                                                                                                    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Chokepoint                              | `requireEntitlement(mechanic)` — [`requireEntitlement.ts:7-23`](../../../apps/webapp/src/app-layer/guards/requireEntitlement.ts); единственный вызывающий — [`courses/route.ts:52`](../../../apps/webapp/src/app/api/doctor/courses/route.ts) (commit `530cb2bbd`)                                                                                                                                                                                                                                                | **Баг, не в доке S4:** `courses/route.ts:50-53` вызывает auth **дважды** — прямой `requireDoctorWorkspaceApiContext()` (строка 50) **и** ещё раз внутри `requireEntitlement()` ([`requireEntitlement.ts:10`](../../../apps/webapp/src/app-layer/guards/requireEntitlement.ts)). S4-1 уже фиксирует это как задачу, но не сделано. Guard сегодня умеет **только** API Route Handler shape (`NextResponse`); Server Actions им напрямую не пользуются (см. ниже)                                                                                                                                                         |
| Global-admin tariff CRUD/UI             | Нет ни одного файла. `grep -r "saas_tariffs\|tariffId" apps/webapp/src/app/api` — 0 route-файлов                                                                                                                                                                                                                                                                                                                                                                                                                  | STORE_EXECUTION_PLAN.md P2 полностью не реализован; ни `/api/admin/tariffs`, ни страницы «Тарифы» не существует                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Admin nav/access tiers                  | 3-уровневая модель уже в коде: `doctor` / `clinic_admin` / `global_admin` — тип и visibility-фильтр [`doctorNavLinks.ts:36-52`](../../../apps/webapp/src/shared/ui/doctor/doctorNavLinks.ts); кластер «Настройки» (`id: "settings"`, global_admin, `admin-app-settings`/`admin-auth`/`admin-integrations`/`admin-technical`) — строки 112-135; кластер «Система» (`id: "system"`, global_admin, `system-health`/`health-archive`/`audit-log`) — строки 137-152                                                    | Нет пункта «Тарифы»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| API guard для настоящего platform-admin | `requireAdminWorkspaceApiContext()` — [`requireRole.ts:224-239`](../../../apps/webapp/src/app-layer/guards/requireRole.ts): `role==="admin" && adminMode`                                                                                                                                                                                                                                                                                                                                                         | **Риск именования:** в репо есть ТРИ разных «admin»-гейта под похожими именами — `requireAdminWorkspaceApiContext` (настоящий platform admin), `requireAdminDoctorPage`/`requireGlobalAdminDoctorPage` (page-уровень), и `requireAdminBookingEngine`/`requireClinicManagementApiContext` (это на самом деле **org-level** admin/owner, НЕ platform admin — [`_requireAdminBookingEngine.ts:24-34`](../../../apps/webapp/src/app/api/admin/booking-engine/_requireAdminBookingEngine.ts) фактически проверяет `role==="admin" && adminMode` тоже, но контекст — org-scoped booking engine, легко спутать при копипасте) |
| Org listing для global admin            | `listOrganizations()` — [`pgBookingEngine.ts:141-144`](../../../apps/webapp/src/infra/repos/pgBookingEngine.ts) читает **все** строки `be_organizations` без org-фильтра в коде уровня порта                                                                                                                                                                                                                                                                                                                      | Не проверено, есть ли на `be_organizations` FORCE RLS, которая бы это резала для non-global-admin сессий: `grep -rl "CREATE POLICY.*be_organizations" deploy/postgres/*.sql` — 0 совпадений (таблица упоминается в политиках **других** таблиц, но своей политики не нашлось). Нужно подтвердить фактическое состояние RLS на `be_organizations` в начале Phase 3, а не предполагать                                                                                                                                                                                                                                   |
| Org creation (пример пишущего пути)     | `provisionSpecialistOwner` вызывает SECURITY DEFINER SQL-функцию `app.provision_specialist_owner` — [`pgOrganizationProvisioning.ts:102-127`](../../../apps/webapp/src/infra/repos/pgOrganizationProvisioning.ts)                                                                                                                                                                                                                                                                                                 | `tariff_id` при создании организации нигде не проставляется — новая клиника всегда стартует с `tariff_id IS NULL` → резолвер возвращает all-true (не «базовый тариф», а «все механики включены»)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Mailings / cms_pages write-путь         | **Server Actions**, не route.ts: `executeBroadcastAction` — [`broadcasts/actions.ts:63-82`](../../../apps/webapp/src/app/app/doctor/broadcasts/actions.ts); content sections — [`content/sections/actions.ts:26,131,195,239`](../../../apps/webapp/src/app/app/doctor/content/sections/actions.ts). Обе используют `requireDoctorWorkspaceContext()` (page-контекст), не `requireDoctorWorkspaceApiContext()`                                                                                                     | STORE_EXECUTION_PLAN.md (07-13) указывал `apps/webapp/src/app/api/doctor/broadcasts/*` и `.../content/*` как route-пути — **эти пути больше не существуют** (`find apps/webapp/src/app/api/doctor -maxdepth 1 -type d` не содержит `broadcasts`/`content`). `requireEntitlement()` в текущем виде **не может** гейтить Server Actions — возвращает `NextResponse`, которого там нет                                                                                                                                                                                                                                    |
| Subscriptions (абонементы) write-путь   | `POST /api/doctor/booking-engine/patient-packages` — [`patient-packages/route.ts:69`](../../../apps/webapp/src/app/api/doctor/booking-engine/patient-packages/route.ts), за локальной композицией `requireDoctorBookingEngine()` — [`_requireDoctorBookingEngine.ts:19-30`](../../../apps/webapp/src/app/api/doctor/booking-engine/_requireDoctorBookingEngine.ts), которая тоже вызывает `requireDoctorWorkspaceApiContext()` внутри себя                                                                        | Гейтить в лоб `requireEntitlement("subscriptions")` после composed-гейта — снова двойной auth. Нужен redesign (см. §4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Patient files / patient_card write-путь | Настоящий route.ts, тот же shape, что courses: `requireDoctorWorkspaceApiContext()` — [`patients/[userId]/files/route.ts:51,106`](../../../apps/webapp/src/app/api/doctor/patients/[userId]/files/route.ts)                                                                                                                                                                                                                                                                                                       | Гейтится по образцу courses без проблем                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Кнопка «Пересчитать» абонемент          | Существует и работает — [`PatientPackageCard.tsx:165-177`](../../../apps/webapp/src/app/app/doctor/clients/PatientPackageCard.tsx), [`recalc/route.ts:12-48`](../../../apps/webapp/src/app/api/doctor/booking-engine/patient-packages/[id]/recalc/route.ts)                                                                                                                                                                                                                                                       | Владелец §11 закрыт фактом, см. [`SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md:278-293`](./SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md); в этом документе не переоткрывается                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| PSP adapters                            | 5 реальных адаптеров за одним портом: mock/yookassa/tinkoff/cloudpayments/alfabank — [`paymentProviderRegistry.ts:8-46`](../../../apps/webapp/src/infra/payments/paymentProviderRegistry.ts), [`providerPort.ts:11-34`](../../../apps/webapp/src/modules/payments/providerPort.ts)                                                                                                                                                                                                                                | Не трогать/не переписывать (владелец §1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Существующий платёжный ledger           | Org-scoped `bePrepaymentPolicies`/intents/payments/refunds, статусные enum'ы — [`bookingPayments.ts:1-60`](../../../apps/webapp/db/schema/bookingPayments.ts); сервис на 577 строк — [`payments/service.ts:1-577`](../../../apps/webapp/src/modules/payments/service.ts)                                                                                                                                                                                                                                          | Это **booking/patient commerce** (предоплата визита, покупка пакета/продукта пациентом) — НЕ платформенный биллинг клиники за тариф. Разные домены, не смешивать (владелец не разделял эти два явно, но это уже задокументировано в S4 §2 и остаётся верным)                                                                                                                                                                                                                                                                                                                                                           |
| Webhook                                 | Подписанный, per-org, резолвит организацию из intent перед capture — [`webhook/[provider]/route.ts:1-65`](../../../apps/webapp/src/app/api/payments/webhook/[provider]/route.ts). Есть и второй sibling: [`patient-acquiring-webhook/[provider]/route.ts`](../../../apps/webapp/src/app/api/payments/patient-acquiring-webhook/[provider]/route.ts) (FIN-02: bootstrap principal → provider config → verifyWebhook → org-scoped обработка) — ближайший прецедент по shape для нового saas-webhook route (Phase 4) | Работает только для booking/patient intents; платформенного (tariff subscription) webhook пути нет                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Payment config UI                       | `booking_payment_providers`/`booking_payment_enabled` в `ALLOWED_KEYS` — [`system-settings/types.ts:112,123`](../../../apps/webapp/src/modules/system-settings/types.ts); секция настроек — [`BookingPaymentsSection.tsx`](../../../apps/webapp/src/app/app/settings/BookingPaymentsSection.tsx) (283 строки); PATCH-обработка ключа — [`admin/settings/route.ts:218,679`](../../../apps/webapp/src/app/api/admin/settings/route.ts)                                                                              | Это **per-clinic** booking merchant config. Платформенного (SaaS billing) merchant-ключа нет                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Patient package pay client              | Завершает оплату только через мок — `POST /api/booking/memberships/payments/mock-complete` — [`PatientPackagePayClient.tsx:45`](../../../apps/webapp/src/app/app/patient/memberships/pay/PatientPackagePayClient.tsx)                                                                                                                                                                                                                                                                                             | Не в scope этого документа (patient-facing, не SaaS billing), но подтверждает: mock-путь уже есть и используется как штатный fallback без ключей — та же модель подходит для SaaS billing keyless-режима                                                                                                                                                                                                                                                                                                                                                                                                               |
| Settings root split (S5)                | Existing partial slice: `app_runtime_settings`, migration [`0186_app_runtime_settings.sql`](../../../apps/webapp/db/drizzle-migrations/0186_app_runtime_settings.sql), `pgAppRuntimeSettings` and provider. **`app_runtime_settings_audit` does not exist**; it remains S5-1 work. S5-0 reality lock is logged in [`SAAS_S5_SETTINGS_ROOT_SPLIT_LOG.md`](./SAAS_S5_SETTINGS_ROOT_SPLIT_LOG.md); S5-1—S5-7 are not complete.                                                                                       | This does **not** change the domain for `saas_billing_payment_provider`: the runtime store is patient-safe and credentials remain restricted in `system_settings` by design.                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## 2. Границы (что можно/нельзя трогать)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

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

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

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

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

| Mechanic                        | Целевой write-путь                                                                                                                 | Тип (route/action)                | Текущий гейт                          | Что сделать в Phase 2                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `courses`                       | `POST /api/doctor/courses`                                                                                                         | route                             | ✅ гейтится, но с багом двойного auth | Фикс на новый контракт §3.1                                                                                                             |
| `mailings`                      | `executeBroadcastAction` [`actions.ts:63`](../../../apps/webapp/src/app/app/doctor/broadcasts/actions.ts)                          | Server Action                     | ❌ не гейтится                        | `requireEntitlementForAction`                                                                                                           |
| `cms_pages`                     | `sections/actions.ts:26,131,195,239`                                                                                               | Server Action                     | ❌ не гейтится                        | `requireEntitlementForAction` на create/update/publish/delete                                                                           |
| `subscriptions`                 | `POST /api/doctor/booking-engine/patient-packages`                                                                                 | route (composed gate)             | ❌ не гейтится                        | `requireEntitlement(ctx, "subscriptions")` после `requireDoctorBookingEngine()`, используя его `organizationId`                         |
| `patient_card`                  | patient-card write routes под `/api/doctor/patients/[userId]/*` (diagnoses/complaints/anamnesis/visits — не list)                  | route                             | ❌ не гейтится                        | Выбрать 1 репрезентативный write route per sub-resource; не гейтить чтения                                                              |
| `files`                         | `POST /api/doctor/patients/[userId]/files`                                                                                         | route                             | ❌ не гейтится                        | Прямой `requireEntitlement`, тот же shape что courses                                                                                   |
| `booking`                       | admin booking-engine write routes (branch/service/slot create) под `/api/admin/booking-engine/*`, за `requireAdminBookingEngine()` | route (composed gate)             | ❌ не гейтится                        | Как `subscriptions` — организация уже в composed ctx                                                                                    |
| `payments`                      | ветка `booking_payment_providers`/`booking_payment_enabled` внутри `admin/settings/route.ts` PATCH                                 | route (generic settings endpoint) | ❌ не гейтится                        | Точечная проверка entitlement **только** для этих двух ключей внутри существующего PATCH handler, не гейтить весь `/api/admin/settings` |
| `patient_app`                   | нет поверхности (подтверждено: `grep` не находит `patient_app_enabled`/toggle)                                                     | —                                 | resolver-only                         | Не изобретать route; пометить `declared_no_surface`                                                                                     |
| `exercise_catalog`              | вне scope (store, S4-3)                                                                                                            | —                                 | resolver-only                         | Не трогать в этой работе                                                                                                                |
| `exercise_packages`             | вне scope (store, S4-3)                                                                                                            | —                                 | resolver-only                         | Не трогать в этой работе                                                                                                                |
| `patient_app_paid_subscription` | нет поверхности                                                                                                                    | —                                 | resolver-only                         | `declared_no_surface`                                                                                                                   |
| `branding`                      | нет поверхности                                                                                                                    | —                                 | resolver-only                         | `declared_no_surface`                                                                                                                   |
| `custom_domain`                 | нет поверхности                                                                                                                    | —                                 | resolver-only                         | `declared_no_surface`                                                                                                                   |

## 5. Фазы (инженерный порядок, не решение владельца)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### Phase 1 — chokepoint hardening (registry + redesign, без нового UI)

- [x] **Реализовать `assertMechanicEnabled` + redesign `requireEntitlement(ctx, mechanic)` + новый
      `requireEntitlementForAction(ctx, mechanic)` по контракту §3.1. Не менять `resolveOrgEntitlements`/`isMechanicEnabled`.**
      — ГОТОВО, превышает формулировку (`530cb2bbd` P1 thin slice → `4ae94a0a2`/`739f67a98`/`d424a1273`/`31e3a8e5d`/
      `efc30b730` C5A). `apps/webapp/src/app-layer/guards/requireEntitlement.ts:44-121`: `assertMechanicEnabled` — тонкая
      обёртка над `isMechanicEnabled` без изменений резолвера; вместо плоского `requireEntitlement`/`requireEntitlementForAction`
      реализованы `requireEntitlementForRead`/`requireEntitlementForMutation` (route) и `requireEntitlementForReadAction`/
      `requireEntitlementForMutationAction` (Server Action) + `requireEntitlementForPage` (RSC), все через один общий
      `checkEntitlement()` с 4-состояниями `active/read_only/blocked` (не просто on/off, как просил план). `resolveOrgEntitlements`/
      `isMechanicEnabled` не тронуты.
- [x] **Починить `courses/route.ts:50-53` — один вызов auth, один вызов entitlement.**
      — ПОДТВЕРЖДЕНО чтением файла: `apps/webapp/src/app/api/doctor/courses/route.ts` — `GET` вызывает
      `requireDoctorWorkspaceApiContext()` один раз (строка ~27) и `requireEntitlementForRead` один раз (строка ~29);
      `POST` — `requireDoctorWorkspaceApiContext()` один раз и `requireEntitlementForMutation` один раз после валидации
      тела. Двойного auth нет.
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §6 / S4-1 — «Добавить static guard: прямые `isMechanicEnabled` и чтения tariff/override из feature routes/services вне единственного boundary дают non-zero.»
- Добавить статический чекер (скрипт в `apps/webapp/scripts/` или тест-guard), не дающий прямого импорта
      `isMechanicEnabled`/tariff-чтения из `app/api/**` или `app/app/**/actions.ts` мимо `requireEntitlement*`.
      — ЧАСТИЧНО: `apps/webapp/scripts/check-s4-entitlement-coverage.ts` (230 строк) + `check-s4-entitlement-coverage.test.ts`
      (6 тестов) существуют, покрывают именно этот инвариант (`staticBypassFindings`/`DIRECT_BYPASS_PATTERN` ловит прямой
      вызов `assertMechanicEnabled|isMechanicEnabled|resolveOrgEntitlements|getTariffForOrg|listOverrides` вне
      `APPROVED_BYPASS_BOUNDARY_FILES`), self-test проходит (`6/6 passed`, перезапущено при сверке). **Но:** прямой запуск
      `npx tsx scripts/check-s4-entitlement-coverage.ts` сегодня падает (exit 1) на false positive — регэксп матчит
      `isMechanicEnabled(` внутри JSDoc-комментария в `apps/webapp/src/modules/org-branding/service.ts:138` (реального
      обхода там нет, только упоминание в тексте комментария). Скрипт также НЕ подключён ни к `lint`, ни к `ci`
      (`package.json` есть `check:s4-entitlement-coverage`, но ни `lint`, ни корневой `ci` его не вызывают — проверено
      `grep`). Не считать закрытым, пока false positive не починен и чекер не подключён к гейту.
- [x] **Unit-тесты: `requireEntitlement` без auth-side-effect (принимает готовый ctx), `requireEntitlementForAction`
      тот же resolver, оба independent от auth-механизма вызывающего кода.**
      — ГОТОВО и перепрогнано зелёным: `apps/webapp/src/app-layer/guards/requireEntitlement.test.ts` (6 `it`-блоков) —
      мокает только `buildAppDeps`, вызывает `requireEntitlementForRead/Mutation/ReadAction/MutationAction` напрямую с
      готовым `ctx`, без auth-инфраструктуры. `npx vitest run` в рамках этой сверки: 3 файла/24 теста зелёных, включая
      этот.

**Проверка:** `pnpm --filter webapp vitest run` по затронутым файлам + `pnpm --filter webapp typecheck`.
**Выход:** один chokepoint работает из route.ts и из Server Actions одинаково; нет двойного auth нигде.

### Phase 2 — гейтинг оставшихся механик (default-on, zero behavior change)

Для каждой строки таблицы §4 со статусом «❌ не гейтится»:

- [x] **Перед правкой — `code-search`/`grep` подтверждает актуальный путь файла (пути в §4 уже проверены на
      2026-07-17, но файл мог измениться за время работы — не доверять слепо этому документу дольше одного сеанса).**
      — ПОДТВЕРЖДЕНО косвенно: при сверке 2026-07-27 все пути из таблицы §4 (`courses/route.ts`, `broadcasts/actions.ts`,
      `content/sections/actions.ts`, `patient-packages/route.ts`, patient-card под-ресурсы, `admin/booking-engine/*`,
      `admin/settings/route.ts`) всё ещё существуют по тем же путям и реально гейтятся — расхождений с §4 не найдено.
- [x] **Добавить вызов `requireEntitlement`/`requireEntitlementForAction` после существующего auth/composed gate.**
      — ГОТОВО на всех перечисленных в §4 write-поверхностях, `grep` подтверждает по каждой: `mailings`
      (`broadcasts/actions.ts:77,102` → `requireEntitlementForMutationAction`), `cms_pages` (`sections/actions.ts:95,136,
202,248` — 4 экспорта), `subscriptions` (`patient-packages/route.ts:77`), `patient_card` (гейтится не один
      представитель, а ВСЕ write sub-resources: visits/anamnesis/complaints/diagnoses/diagnoses-status — см.
      `protectedActionRegistry.ts:71-76`, шире, чем просил план), `files`
      (`patients/[userId]/files/route.ts:142`), `booking` (admin booking-engine services/branches/schedule-blocks/
      online-location routes), `payments` (`admin/settings/route.ts:379`). `patient_app`/`exercise_catalog`/
      `exercise_packages`/`patient_app_paid_subscription`/`branding`/`custom_domain` честно в `DECLARED_NO_SURFACE`
      (`app-layer/entitlements/protectedActionRegistry.ts:130-137`), не изобретены.
- [x] **Проверка per mechanic на test (curl/actions): дефолт (без тарифа/override) — работает как раньше; override
      `enabled=false` для org A — 403/typed-denied; org B не затронут; удалить override — снова работает.**
      — ДОКАЗАНО на уровне contract-тестов, НЕ живым curl/actions прогоном. Файлы `*.entitlement.test.ts`
      (`services/route.entitlement.test.ts`, `courses/route.entitlement.test.ts`, `clinic/invites/route.entitlement.test.ts`
  - `requireEntitlement.test.ts`) — перепрогнаны в рамках этой сверки: 4 файла / 19 тестов зелёных (число уточнено независимым аудитом 27.07: перепрогон даёт 19, не 18), проверяют
    default-on, 403 при `enabled=false`, и что composed-гейт вызывается **до** entitlement
    (`invocationCallOrder` assertion в `services/route.entitlement.test.ts`). Живой curl-round-trip с реальным override
    create/delete на тестовом сервере в рамках этой сверки не выполнялся — если нужен именно он, это отдельный шаг.
- [ ] 🔴 Полный regression sweep по demo-clinic-a: каждая гейтнутая write-поверхность всё ещё 200 по умолчанию
      (ни одна не сломалась случайно), auth всегда предшествует entitlement (порядок не инвертирован), кросс-тенантная
      проверка (override A не течёт на B).
      — НЕ СДЕЛАНО: `grep -rn "demo-clinic-a" apps/webapp` не находит ничего в коде (только в план-документах);
      отдельного regression-sweep скрипта/теста с этим именем нет. Contract-тесты выше покрывают per-mechanic логику
      изолированно, но не заменяют явный полный прогон по живой demo-clinic-a.

**Проверка:** contract test на каждый gated route/action; полный regression sweep как отдельный пункт приёмки.
**Выход:** все механики с реальной write-поверхностью гейтятся одним и тем же chokepoint; поверхности без
write-пути честно помечены `declared_no_surface` (не изобретены).

### Phase 3 — global-admin конструктор тарифов + assign-to-org + trial policy

- [x] **Спроектировать backward-compatible trial-policy storage как ссылку на существующий admin-created tariff с
      duration/start/post-trial полями; не добавлять фиксированный тариф или `is_default` product semantics.**
      — ГОТОВО: `TrialPolicy` в `apps/webapp/src/modules/org-entitlements/types.ts` и `trialPolicySchema` в
      `apps/webapp/src/app/api/admin/commercial/route.ts:31-39` требуют `tariffId: uuid()` (ссылка на реальный тариф),
      `durationDays`, `graceDays`, `startEvent: "organization_provisioned"`, `postTrialBehavior`
      (`read_only|blocked|tariff`), `postTrialTariffId`. Никакого `is_default`/hardcoded тарифа в схеме нет.
- [x] **Расширить `modules/org-entitlements` write-портом: `listTariffs`, `getTariff`, `createTariff`, `updateTariff`,
      `deactivateTariff`, `getTrialPolicy`, `setTrialPolicy`, `assignTariffToOrg`, `unassignTariffFromOrg`, `upsertOverride`,
      `deleteOverride`. Валидировать mechanic-ключи только по `MECHANICS` (registry §4) — отсутствующий UI-toggle не
      теряет ключ молча.**
      — ГОТОВО с переименованием: `PlatformEntitlementsPort` (`apps/webapp/src/modules/org-entitlements/ports.ts:56-66`)
      имеет `listTariffs`, `getTrialPolicy`, `createTariff`, `updateTariff`, `archiveTariff` (=`deactivateTariff`,
      переименован), `assignTariff(organizationId, tariffId|null, audit)` (assign И unassign в одной функции — `null`
      снимает), `upsertOverride`, `deleteOverride`, `setTrialPolicy`, плюс незапрошенные, но полезные
      `startTrial`/`extendTrial`. Mechanic-ключи валидируются по `MECHANIC_REGISTRY`/`MECHANICS`
      (`org-entitlements/types.ts:11-32`, сейчас 15 ключей — `clinic_team` добавлен позже реестра §4 из плана).
- [x] **Подтвердить фактическое RLS-состояние `be_organizations` (см. риск в Reality lock) до реализации
      cross-org listing endpoint...**
      — ПОДТВЕРЖДЕНО, риск §8.1 закрыт: `deploy/postgres/c5a-platform-operations-runtime.sql:147-155` —
      `ALTER TABLE public.be_organizations FORCE ROW LEVEL SECURITY` + реальные политики
      `be_organizations_platform_operations_select`/`_update` и `be_organizations_staff_current_org_read`. Таблица
      больше не «без своей policy» — cross-org listing идёт через audited platform-only read, не DB bypass.
- [x] **`GET/POST/PATCH /api/admin/tariffs` (+ деактивация) под `requireAdminWorkspaceApiContext`...**
      — ГОТОВО, но формой/именем guard'а отличается от буквы плана: реализовано как один
      `apps/webapp/src/app/api/admin/commercial/route.ts` с `GET` (чтение) и `POST` (discriminated union
      `create_tariff|update_tariff|archive_tariff|assign_tariff|upsert_override|delete_override|set_trial_policy|
start_trial|extend_trial`), не раздельные `/api/admin/tariffs`. Гейт — `requirePlatformOperationsApiContext()`
      (`requireRole.ts:231`), НЕ буквально `requireAdminWorkspaceApiContext` (тот существует, но используется в других
      местах — users/archive), однако это ТОЖЕ настоящий platform-only гейт, не org-scoped
      `requireAdminBookingEngine`/`requireClinicManagementApiContext` — риск подмены гейта из Reality lock не
      реализовался. Commit `49f19b120` (`refactor(admin): rename /app/platform/* to /app/admin/*`).
- [x] **`GET /api/admin/organizations` — cross-org список для picker'а...**
      — ДУБЛЬ-СЛИТ: нет отдельного роута, тот же `GET /api/admin/commercial` возвращает `{ tariffs, organizations,
trialPolicy }` одним payload'ом (`route.ts:99-104`), тем же гейтом. Функционально эквивалентно, один chokepoint
      вместо двух — соответствует правилу «single chokepoint, no dup».
- [x] **`POST /api/admin/organizations/:id/tariff` ... `POST/DELETE /api/admin/organizations/:id/entitlement-overrides`...**
      — ДУБЛЬ-СЛИТ: `assign_tariff`/`upsert_override`/`delete_override` — actions внутри того же
      `POST /api/admin/commercial` (`route.ts:56-74`), identity `(organizationId, mechanic)` соблюдена.
- [ ] Org-creation: применить выбранную global-admin trial policy через typed service в атомарной provisioning
      boundary; не выбирать тариф по имени/`is_default` и не скрывать неполную policy под all-on fallback — см. §3.2.
      — НЕ СДЕЛАНО: `grep` по `modules/organization-provisioning/{service,ports}.ts` не находит ни `trial`, ни `tariff`.
      `startTrial` вызывается только вручную из admin UI action (`route.ts` `start_trial`), не из
      `specialist-signup/confirm|retry` или provisioning flow. Новая организация trial policy автоматически не получает.
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §5 / S4-0 — «Зафиксировать инженерный compatibility path для клиники без тарифа».
- Для существующих org с `tariff_id IS NULL` сначала выполнить read-only inventory/dry-run. Apply разрешён только
      по owner-approved mapping; до него сохранить compatibility behavior, не назначать придуманный all-true тариф.
      — НЕ СДЕЛАНО: никакого dry-run/inventory скрипта или роута для `tariff_id IS NULL` в репозитории не найдено.
- [x] **UI-размещение — PLAT-02/PLAT-03, НЕ старый паттерн S23 (см. §0a). Не добавлять пункт в кластер**
      «Настройки» `doctorNavLinks.ts` рядом с `admin-app-settings`/`admin-auth` — тот кластер сам помечен на миграцию
      прочь из doctor-сайдбара. Вместо этого — новый route-group маршрут по образцу уже существующего PLAT-07
      (`system-health`): `apps/webapp/src/app/app/(global-admin)/doctor/tariffs/page.tsx` + свой `layout.tsx`
      (`requireGlobalAdminDoctorPage()` + `DoctorWorkspaceShell` c `enableTenantRuntime={false}`, тот же shape, что
      [`system-health/layout.tsx:15-27`](<../../../apps/webapp/src/app/app/(global-admin)/doctor/system-health/layout.tsx>)).
      Точное имя route-сегмента (`tariffs` / `organizations` / `commercial`) — инженерный выбор фазы, не финальная
      IA-навигация (та — scope workstream'а U9, см. §0a; эта страница не дублирует и не подменяет его будущий shell).
      — ГОТОВО, но по НОВОМУ, более сильному паттерну, чем просил план: план ожидал `(global-admin)/doctor/tariffs/`
      внутри doctor-дерева (временное размещение до U9). Вместо этого owner ruling того же 2026-07-26
      (`49f19b120 refactor(admin): rename /app/platform/* to /app/admin/*`) вынес ВЕСЬ platform-shell в отдельный
      `apps/webapp/src/app/app/admin/*` с собственным `layout.tsx` (`requirePlatformOperationsPage()`,
      `DoctorWorkspaceShell`) — то есть фактически уже сделал часть работы workstream'а U9, которую план явно
      откладывал. Страница — `apps/webapp/src/app/app/admin/commercial/page.tsx` (сегмент `commercial`, не `tariffs`),
      guard `requirePlatformOperationsPage()`. Старый `doctorNavLinks.ts` больше не содержит НИ «system»-кластер,
      НИ пункт «Тарифы» вообще (`grep` — 0 совпадений «tariff/commercial/Тариф») — файл сам это документирует
      комментарием: «the platform operator's own destinations ... moved out to `platformNavLinks.ts`».
- [x] **Точка входа в навигации: ... Страница «Тарифы» получает global_admin-tier пункт в этом же кластере
      `system`... НЕ в кластере «Настройки»...**
      — ГОТОВО, тем же превышающим план способом: пункт живёт не в `doctorNavLinks.ts`, а в новом отдельном
      `apps/webapp/src/shared/ui/doctor/platformNavLinks.ts:36` — `{ id: "commercial", label: "Тарифы и триал",
href: "/app/admin/commercial", accessTier: "global_admin" }`, плоский platform-only список (не смешан с
      doctor-навигацией вообще, не просто «не в кластере Настройки»).
- [x] **Содержимое страницы = PLAT-03 (список тарифов + форма имя/цена/период + чекбокс-грид всех 14 механик) и
      PLAT-02 (назначение тарифа клинике + override-редактор)...**
      — ГОТОВО: `apps/webapp/src/app/app/admin/commercial/CommercialConstructorClient.tsx` реализует форму
      имя/цена/период/mechanics-грид + список тарифов + назначение организации + override-редактор + trial-policy
      форму в одном компоненте, обёрнутом в `DoctorAppShell`/`DoctorPageHeader`.
- [x] **Только shared doctor primitives + shadcn ... `clinic_admin`/doctor не видят маршрут ... получают 403 на API.**
      — ГОТОВО: `CommercialConstructorClient` использует общие `DoctorAppShell`/`DoctorPageHeader`/`Badge` и т.п., не
      одноразовые локальные карточки. Нав-пункт фильтруется по `accessTier: "global_admin"` в `platformNavLinks.ts`.
      403 подтверждён живым (пусть и mocked-guard) тестом: `apps/webapp/src/app/api/admin/commercial/route.test.ts:49-54`
      — перепрогнан в рамках этой сверки зелёным вместе с остальными.
- [x] **Audit-событие на каждое tariff/assignment/override изменение: actor, target org, before/after mechanic map,
      без секретов/PII. **Механизм — переиспользовать существующий `admin_audit_log`, не строить новый:\*_ таблица уже
      есть ([`schema.ts:1949-1975`](../../../apps/webapp/db/schema/schema.ts): `organizationId` nullable, `actorId`,
      `action`, `targetId`, `details jsonb`, `status`), writer `writeAuditLog` —
      [`adminAuditLog.ts:97`](../../../apps/webapp/src/infra/adminAuditLog.ts); реальные вызывающие — `/api/admin/_`handlers (operator-incidents, health-failure-archive, users profile),`/api/integrator/events`и`app-layer/product-analytics`, все через re-export `@/app-layer/admin/auditLog`
([`app-layer/admin/auditLog.ts:1-14`](../../../apps/webapp/src/app-layer/admin/auditLog.ts));
modules/admin-incidents импортирует из него только conflict-key helper, не writer. У global_admin уже есть
страница просмотра «Журнал операций» (`/app/doctor/audit-log`). Новые action-ключи вида
`saas_tariff_create|update|deactivate`, `saas_tariff_assign|unassign`, `saas_entitlement_override_upsert|delete`;
before/after mechanic map — в `details`. Вызов из module-слоя — через port по clean-architecture правилам
(`.cursor/rules/clean-architecture-module-isolation.mdc`), не прямым импортом `@/infra/adminAuditLog`из module.
Отдельная audit-таблица под тарифы НЕ создаётся (single chokepoint / no-dup).
— ГОТОВО, точно по спеке:`apps/webapp/src/infra/repos/pgPlatformEntitlements.ts:25`импортирует существующий`adminAuditLog`из`db/schema/schema.ts`(не новую таблицу), локальный`appendAudit()`(строки 51-65) пишет`{ before, after, reason }`в`details`. Ключи действий совпадают со спекой почти дословно: `saas_tariff_create`(288),`saas_tariff_update`(301),`saas_tariff_deactivate`(313),`saas_tariff_assign`/`saas_tariff_unassign`(346-347, по значению tariffId),`saas_entitlement_override_upsert`(362),`saas_entitlement_override_delete`(370), плюс незапрошенные`saas_trial_policy_update`/`saas_trial_extend`(382/399). Запись идёт из`infra/repos`
      (не через отдельный re-export порт, как предлагал план для module-слоя) — это infra-слой обращается к своей же
      БД напрямую, не нарушение clean-architecture правила о module-изоляции в буквальном смысле.

**Проверка:** module/PG тесты на write-порт; authz A/B матрица (`demo-clinic-a` не может дойти до `/api/admin/tariffs`
ни страницы, ни API); constructor RTL-тест; desktop+mobile screenshot приёмка.
**Выход:** тарифная сетка, цены, mechanics, назначение клинике и override — управляются как данные глобальным
админом; новая организация использует выбранную trial policy, а не hardcoded/default/all-on тариф.

### Phase 4 — SaaS billing → ПЕРЕЕХАЛ В СВОЙ ПЛАН (решение владельца 30.07)

Владелец: «всё что пройдёт аудит по биллингу и оплате saas — записать в актуальный план задачи именно по биллингу и
оплате, а не в этот план по тарифам и квотам — не смешивать». Биллинг и оплата теперь живут в
`SAAS_BILLING_PLAN.md` (карточка #1057). Здесь остаются только тарифы, механики и лимиты.

Стык между планами, чтобы не разъехались: счёт клиники = цена тарифа + дополнительные специалисты сверх базы, а
ступень лестницы доступа («терпение», «только чтение», «выключено») включается от коммерческого состояния
организации, которое ведёт биллинг. Поля лестницы задаёт владелец в конструкторе тарифов (§5a, этап 2).

### Phase 5 — интеграционная приёмка на тестовом сервере

ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §12 / S4-6 — «Подготовить непересекающиеся synthetic fixtures только для включённых substages: global_admin».
- Fixture-манифест: global_admin; demo-clinic-a/b с разными тарифами и override; новая org через signup flow
      (проверяет §3.2 — использует выбранный trial tariff/duration, без hardcoded/default/all-true).
      — НЕ СДЕЛАНО: `grep -rln "demo-clinic-a\|demo-clinic-b" apps/webapp --include="*.ts" --include="*.tsx" --include="*.sql"`
      — 0 совпадений в коде (только в план-документах). Зависит и от открытого Phase 3 п.7 (trial при provisioning).
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §12 / S4-6 — «Global_admin создаёт/меняет tariff, цену/период/full mechanic map, назначает A, меняет override, видит billing state».
- Global admin создаёт/меняет тариф, полный mechanic grid, назначает A, меняет override, видит billing state.
      — ЧАСТИЧНО заложено: API/UI-механика (create/update/archive tariff, assign, override, полный mechanic-грид)
      реально существует и протестирована (46 зелёных тестов между `pgPlatformEntitlements.*.test.ts`,
      `api/admin/commercial/route.test.ts`, `CommercialConstructorClient.test.tsx`, `org-entitlements/service.test.ts`
      — перепрогнаны в рамках этой сверки). «Видит billing state» — нет, поскольку billing (Phase 4) не существует.
      Живой click-through с demo-организациями в рамках этой сверки не проводился.
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §12 / S4-6 — «Clinic A проходит checkout mock/recorded-provider flow, получает tariff access».
- Clinic A проходит mock checkout, получает активную подписку на тариф; clinic B её не видит/не затронута.
      — НЕ СДЕЛАНО: checkout не существует (Phase 4).
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §12 / S4-6 — «Payment negatives: duplicate checkout/webhook, forged signature/org ID, wrong amount/currency, unknown provider ref»; «Entitlement negatives обязательны.»
- Negatives: unauthenticated, doctor вместо global_admin на `/api/admin/tariffs` (403), forged org id, forged
      webhook signature, amount mismatch, replay, mechanic OFF при активной подписке (доступ всё равно закрыт по
      entitlement, подписка не значит automatic mechanic override).
      — ЧАСТИЧНО: unauthenticated/wrong-role 403 покрыт тестом (`api/admin/commercial/route.test.ts:49-54`,
      mocked-guard unit test, не живой E2E). Forged webhook/amount-mismatch/replay/mechanic-OFF-during-subscription —
      не применимы, пока saas-webhook и подписка не существуют.
- [ ] Полный regression sweep: existing org сохраняют compatibility access до owner-approved mapping; после
      отдельного mapping apply ни одна организация не теряет доступ вопреки preview.
      — НЕ СДЕЛАНО: mapping/dry-run инструмент из Phase 3 п.8 не существует, sweep нечего проверять.
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §12 / S4-6 — «После всех фаз выполнить один финальный `pnpm install --frozen-lockfile && pnpm run ci`».
- Один финальный `pnpm install --frozen-lockfile && pnpm run ci` после всех фаз — не гонять full CI после
      каждого шага.
      — НЕ СДЕЛАНО в рамках этой сверки (запускались только точечные `vitest run` на затронутые файлы, по правилу
      «scoped tests per change, full CI once at end» — полный `pnpm run ci` разумен только после Phase 4/5, которых
      ещё нет).

**Выход:** тарифы, единый chokepoint, admin-грид и SaaS billing (keyless-safe) работают на тестовом сервере;
демонстрируемо владельцу.

## 5a. МЕХАНИКИ И ЛИМИТЫ ТАРИФОВ — карточка #1069 (влито сюда 30.07 по требованию владельца «тебе мало бумажек?»)

Это единственный чек-лист работ по механикам, классам и пределам. Отдельного файла плана больше нет: 30.07 владелец
запретил разводить бумажки, содержимое переехало сюда. Смысловой канон (классы, лестница состояний, слова) —
`QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md`. Владельческая сводка — `../OWNER_PUNCHLIST_2026-07-28.md` §10. Прогоны и
вердикты аудитов — `../runs/tariff-mechanics/`.

**Переделано целиком 30.07** по решению владельца: «ты вообще не должен решать что ограничивать а что нет. ты должен
дать мне механизм. В настройках тарифа — я указываю ЧТО делать доступом к системе вообще и к конкретной функции в
частности — какой период терпения с полным доступом до отключения, какой период read-only». Поэтому сначала механизм
(лестница состояний и единая точка исполнения), потом подключение механик.

**Слова владельца, из которых собран этот раздел — дословно, чтобы исполнитель и аудитор сверялись с ними, а не с моим
пересказом:**

> «ты вообще не должен решать что ограничивать а что нет. ты должен дать мне механизм. В настройках тарифа — я указываю
> ЧТО делать доступом к системе вообще и к конкретной функции в частности — какой период терпения с полным доступом до
> отключения, какой период read-only».

> «мы не ограничиваем часть критичных механик. но большинство мы ограничиваем конечно. если у специалиста нет в тарифе
> разминок и cms — то ни он не видит в кабинете этого раздела, ни его клиенты не увидят у себя разминок и статей его».

> «тебе не важно что входит во все платные тарифы, какая разница вообще тебе? как настрою то и входит, ты мне главное
> дай выключатели корректные» · «сами цифры — тебя не касаются» · «главное — не переусложнить. Делать НЕОБХОДИМО И
> ДОСТАТОЧНО (код должен работать, а не быть написан ради кода, как и тесты)».

**Дерево работы:** клон `/home/dev/dev-projects/bcb-wt-tariff`, слияние в `feat/doctor-ui-rebuild` одним заходом в
конце. Живые прогоны на dev — лид в основном дереве (из клона миграция dev-базы запрещена защитой пути).

### Проблема, ради которой это делается

1. Тариф не разделяет клиники: числовой предел работает у трёх механик, рубильник — у части путей записи, остальное
   достаётся всем тарифам.
2. Политика зашита в код вместо настроек: длительности и конечное состояние выбирал автор кода в каждом обработчике.
3. Правило живёт в десятках мест: запись идёт через роуты, серверные действия, бота, редактор контента, общую ручку
   настроек, ленивую материализацию при чтении и подписку на пуши — три аудита подряд находили новые двери.
4. Слова в конструкторе непонятны владельцу.

### Как проверяем

Правила 29–30.07: тест обязан называть поломку и краснеть при её внесении; утверждения о тексте исходника запрещены;
состояние доказывается поведением, а не реестром (`scripts/check-s4-entitlement-coverage.ts:64-68` вызов ворот не
проверяет); числовой предел без доказательства гонки не сделан, пересчёт — под принципалом (FORCE-RLS возвращает
пустоту, а не ошибку); тесты по масштабу шага, точечный `vitest run <файл>`; полный CI один раз на приёмке и только
через замок `/home/dev/brain/host-orch/run-tests.sh`; коммитить до истечения времени.

### Этапы механик и лимитов (#1069)

Порядок жёсткий: 1 → 2 → 3 → дальше. Механизм раньше механик.

#### Этап 1. Класс механики и реестр — СДЕЛАНО

- [x] **1.1** Класс обязателен у каждой механики: `возможность | места | запас | объём | никогда`.
      ✅ аудит `audit-tariff-s12-r4`, независимый typecheck зелёный.
- [x] **1.2** Тип запрещает недопустимое: число у `возможность` и `никогда`, период у `места` и `запас`, единицы кроме
      байт у `объём` — ошибка компиляции. ✅ там же, арбитр получил TS2353.
- [x] **1.3** Резолвер и проекции расхода читают класс, а не наличие единиц. ✅ там же.
- [x] **1.4** Тринадцать новых механик объявлены: пациенты и филиалы числом, восемь функций, три механики владельца
      выключенными у всех. ✅ аудит `audit-tariff-s40` — PASS, ровно 13 ключей, поведение в коммит не пролезло.
- [x] **1.5** Фиктивные единицы удалены, карточка и приложение пациента переведены в класс «никогда», у файлов остались
      только байты, оценки материалов выведены из тарифных механик. ✅ аудиты `audit-tariff-s12-r4`, `-r5`.

#### Этап 2. Механизм жизненного цикла доступа — ЯДРО ПЕРЕДЕЛКИ

Канон §4a. Лестница: `полный доступ` → `терпение` (полный доступ, N дней) → `только чтение` (M дней) → `выключено`.

- [ ] **2.1** Поля лестницы в тарифе на ДВУХ уровнях: система целиком и каждая механика отдельно. По каждому уровню
      владелец задаёт длительность терпения, длительность режима только чтения и конечное состояние. Ноль дней =
      ступени нет. Агент не подставляет ни одного значения по умолчанию.
- [ ] **2.1a** ⚠️ ДОСТУП В КАБИНЕТ — отдельный предмет лестницы (уточнение владельца 30.07: «и сам доступ к кабинету
      и доступ к механикам внутри тарифа»). Настраивается теми же тремя величинами: сколько терпения с полным доступом,
      сколько только чтения, когда блок. Блок кабинета закрывает вход в продукт целиком, а не отдельные разделы; данные
      при этом не удаляются и возвращаются при возобновлении.
- [ ] **2.1b** Исключений НЕТ ни у одной механики, включённой в тариф: агент не выбирает, какая подчиняется лестнице.
      Механическая проверка: в коде нет ни одного списка механик, исключённых из лестницы по решению агента. Критичные
      механики, которые владелец велел не трогать, не являются тарифными опциями и в тариф не попадают вовсе — их
      закрывает только блок кабинета как следствие уровня системы.
- [ ] **2.2** Уровень механики сильнее системного; не задан — действует системный. Оба случая доказаны поведением.
- [ ] **2.3** ОДИН резолвер состояния: «в каком состоянии эта механика у этой организации сейчас». Ни один обработчик
      не решает это сам. Вход — тариф, персональное исключение организации и её коммерческое состояние; выдуманных
      локальных флагов нет.
- [ ] **2.4** Смысл ступеней в коде: `терпение` — работает как включённое плюс предупреждение с датой; `только чтение` —
      существующее видно и выгружается, создавать и менять нельзя; `выключено` — раздела нет ни у специалиста, ни у его
      пациентов, данные сохранены и возвращаются при включении.
- [ ] **2.5** Критичные механики всегда «полный доступ» — отдельная проверка, что лестница их не касается.
- [ ] **2.6** Зашитых констант не остаётся: «14 дней и два предупреждения» у мест специалистов становятся значениями
      полей. Механическая проверка: в коде нет длительностей и конечных состояний, выбранных агентом.
- [ ] **2.6a** Снять агентские константы, которые сегодня решают за владельца (список — аудит Opus 30.07, раздел B):
      порог предупреждения 80% (`org-entitlements/service.ts:226`) → поле рядом с числом; количество предупреждений →
      ЧЕТВЁРТОЕ поле лестницы (владелец назвал «два», но поля под это нет, иначе число неизбежно станет константой);
      `CLINIC_TEAM_FAIL_CLOSED_SEAT_BASELINE = 1` (`types.ts:137`) → обязательное поле тарифа, отсутствие = отказ, а не
      «одно место»; литеральный список `MECHANIC_DEFAULT_ENABLED` (`types.ts:119-129`) → значение тарифа или исключения;
      `access.source === 'no_trial' ? false` (`service.ts:172`) → конечное состояние системного уровня; засеянные
      миграцией `graceDays 7 / chargeAttempts 3 / readOnlyDays 21` (`0259_...sql:238-242`) → снять seed;
      `start_event` жёстко `organization_provisioned` (CHECK в `saasEntitlements.ts:150-153`) → якорь события настраивается,
      потому что системную лестницу владелец описал «при неоплате», а не «при провижининге».
- [ ] **2.6b** `TariffQuotaMap` сегодня физически допускает число только у файлов (`types.ts:110`, `normalizeQuotaMap`
      бросает на других ключах) — владелец не может поставить число пациентам и филиалам. Расширить до класса `запас`,
      не открывая число там, где класс его не допускает.
- [x] **2.6c** ✅ **ЗАКРЫТО ВЛАДЕЛЬЦЕМ 30.07** — вопроса нет, есть его решение: «конечно отключаются и оплаты и
      лестницы, но мы вернулись к началу — ты вместо того чтобы дать мне ручки настройки, решаешь как захардкодить
      поведение при завершении оплаты. Это не решается тобой сейчас — я должен это поведение настраивать в тарифах для
      всех механик». ДЕЙСТВУЕТ: лестница применима КО ВСЕМ механикам, включая приём оплат и брендирование; исключений,
      выбранных агентом, нет. Моё правило «деньги клиники не блокируем никогда» удалено из канона как домысел.
      Единственный набор вне лестницы — критичные механики, названные владельцем лично.
- [ ] **2.8** Конечное состояние — ПЕРЕЧЕНЬ, а не одно «выключено» (сверка с практикой 30.07 по просьбе владельца):
      «оставить доступ» · «только чтение» · «скрыть раздел», выбирается владельцем на каждом уровне. Это перевод на язык
      функций того, что Stripe даёт как выбор из трёх вариантов конечного поведения при исчерпании попыток оплаты
      («оставить просроченной, доступ сохранить» / «пометить неоплаченной, доступ отозвать» / «отменить»). Источники —
      `QUOTAS_RESEARCH_2026-07-28.md`, часть III. Тест: каждый вариант перечня даёт своё поведение, и подмена одного
      варианта на другой краснит тест.
- [ ] **2.7** Конструктор показывает лестницу по-человечески, без слова «квота»: «Терпение: … дней», «Только чтение: …
      дней», «Затем: …». Числа ставит владелец.

#### Этап 3. Единая точка исполнения — чтобы дверь была одна

- [ ] **3.1** Все проверки состояния идут через один порт: обработчик спрашивает резолвер, а не проверяет флаги сам. У
      числовых механик проверка остаётся внутри пишущей транзакции под блокировкой (образец — места и файлы).
- [ ] **3.1a** ⚠️ ГЛАВНОЕ ПО НАХОДКЕ АУДИТА: отозванное правило «чтение не ограничиваем» не выброшено, а ИСПОЛНЯЕТСЯ.
      `app-layer/guards/requireEntitlement.ts:42-49` делает ранний `return { ok: true }` для любого чтения, поэтому
      `requireEntitlementForRead`/`...ReadAction` не могут отказать никогда — а ими помечены семь точек, включая
      пациентский список курсов (`protectedActionRegistry.ts:89-98`), то есть ровно то, про что владелец сказал «его
      клиенты не увидят». Снять ранний return и комментарий, перевести исключения вида «read route/read action» на
      решение по лестнице, тест на скрытие у пациента.
- [ ] **3.1b** Адаптер видимости раздела — сегодня пустая заглушка: требование «ни он не видит в кабинете этого
      раздела, ни его клиенты не увидят» не исполняет ничто. Один адаптер: навигация специалиста, пациентская
      навигация и прямой URL. Доказательство поведением с обеих сторон.
- [ ] **3.2** Механический запрет обхода: дойти до записи данных механики мимо порта нельзя. Тем же приёмом, что уже
      применён в репозитории для принципала, плюс падающий тест на неклассифицированную ручку.
- [ ] **3.3** Реестр защищённых точек перестаёт врать: ни одного исключения, прикрывающего реальную запись. Ложное
      исключение хуже отсутствующего — проверка покрытия на нём зеленеет.
- [ ] **3.4** Уже сделанные точки контроля переведены на порт: внешний календарь, дневники, разминки, промо (слайс A) и
      начатые клинические тесты (лежат в stash клона: «слайс B прерван на переделке модели 30.07»).

#### Этап 4. Подключение механик — механически, по одной

По каждой: спросить резолвер на путях записи И на видимости раздела у обеих сторон, видимый отказ, строка в реестре
защищённых точек, тест с доказательством через снятие защиты.

- [ ] **4.1** Клинические тесты и наборы; при выключении системные группы тестов исчезают и из программы лечения.
- [ ] **4.2** Онлайн-анкета.
- [ ] **4.3** Задачи специалиста.
- [ ] **4.4** Статистика кабинета вместе с источниками записи — одна механика, не две.
- [ ] **4.5** Проактивные подсказки.
- [ ] **4.6** Предоплата при записи; правила отмены не трогать.
- [ ] **4.7** Курсы · CMS · каталог и пакеты упражнений · абонементы · приём оплат · платная подписка пациента ·
      брендирование (включает свои шаблоны уведомлений) · свой домен — привести к порту и к лестнице.
- [ ] **4.8** Рассылки — после появления модели каналов клиники в соседнем потоке (#1071), по их контракту.
- [ ] **4.9** Три механики владельца («Сегодня», разминки, промо) — выключены у всех, включаются ему существующим
      исключением организации, и подчиняются лестнице как все.

#### Этап 4a. Добор по находкам двойного аудита плана (Sol + Opus, 30.07)

- [ ] **4a.1** Механизм выбора, кого переводить в режим только чтения при превышении мест: выбирает администратор
      клиники, по умолчанию последние добавленные, выбор изменяем. Владелец утвердил словом «делай так» — в плане пункта
      не было.
- [ ] **4a.2** Рубильник поддержки нигде не отслеживается: канон отправляет его в §11 punchlist, а там пункта нет.
      Завести пункт в §11 со ссылкой сюда, чтобы требование владельца не исчезло во «вне scope».
- [ ] **4a.3** Граница CMS проверяется тестом: при выключенной CMS страница профиля клиники, публичная страница записи
      и виджет для внешнего сайта продолжают работать (`app/book/embed.js/route.ts` и публичная страница).
- [ ] **4a.4** Внешний календарь и дневники пациента прогнать по чек-листу этапа 4 целиком (видимость у обеих сторон,
      видимый отказ, строка в реестре, тест со снятием защиты) — сейчас они только «переведены на порт».
- [ ] **4a.5** Ложные записи `DECLARED_NO_SURFACE` в реестре защищённых точек: у брендирования стоит «нет действия
      записи» при существующем `saveOrgBranding` (`app/app/settings/brandingActions.ts:33`), у каталога упражнений — при
      существующих действиях (`doctor/exercises/actions.ts:25,39,58,84`). Такие записи подавляют проверку покрытия.
      Снять, закрыть реальные пути, и расширить формулировку 3.3: ловить не только исключения, но и ложные «поверхности
      нет».
- [ ] **4a.6** Приёмка владельцем В СЕРЕДИНЕ плана: после этапа 2 он смотрит поля лестницы в конструкторе, до того как
      на неё сядут остальные механики. Требование `plan-authoring-execution-standard.mdc`; в плане была только финальная.

#### Этап 5. Числа

- [ ] **5.1** Места специалистов: база и цена за дополнительного; превышение разрешено и оплачивается; сумма к
      подтверждению; выставление счёта — #1057.
- [ ] **5.2** Число пациентов: проверка только при создании и реактивации; ведение существующей карточки не
      блокируется; архивирование освобождает место.
- [ ] **5.3** Число филиалов.
- [ ] **5.4** Объём файлов в байтах: атомарная проверка суммы при загрузке.
- [ ] **5.5** Освобождение объёма — предусловие включения предела: у файлов пациента нет пути удаления, а удаление
      записи медиатеки оставляет строку в сумме байтов. Пока нет штатного способа освободить место, предел объёма не
      раздаётся ни одной клинике.
- [ ] **5.6** Правила смены тарифа: повышение сразу; понижение с начала следующего расчётного периода и только после
      уборки (освободить места, заархивировать лишнее).
- [ ] **5.7** Доказательство гонки на каждое число (пациенты, филиалы, объём): настоящий PostgreSQL, из двух
      одновременных попыток на последний слот проходит одна, пересчёт под принципалом.
- [ ] **5.8** Контракт деплоя для каждой новой функции и триггера: права под исполняющей ролью; при появлении
      `SECURITY DEFINER` во владении `app_owner` — счётчик в `deploy/host/deploy-test-saas.sh` и два контрактных теста.

#### Этап 6. Витрина и защита от лишнего

- [ ] **6.1** Клиника видит «использовано из включённого» по всем числам и своё состояние по лестнице: в терпении — до
      какой даты, в режиме только чтения — что именно нельзя.
- [ ] **6.2** Отчёт по всем организациям: кто за пределом и кто на какой ступени лестницы.
- [ ] **6.3** Порядок включения по одной механике: показать числа → найти превысивших → выдать исключение → включить.
- [ ] **6.4** Проверка, что не появилось лишнего: у критичных механик и у запрещённого владельцем нет ни лестницы, ни
      числа. Расхождение — блокер этапа.

#### Этап 6a. Сведение документации (владелец 30.07: «без ста дублей и без старых ошибочных утверждений»)

- [x] **6a.1** Отдельный файл плана механик снесён, содержимое живёт этим разделом 5a; ссылки в брифах переписаны.
- [x] **6a.2** Две разведки слиты в один справочник `QUOTAS_RESEARCH_2026-07-28.md` без потери текста.
- [x] **6a.3** Дублирующий чек-лист из `../OWNER_PUNCHLIST_2026-07-28.md` §10 удалён, оставлен указатель на этот план.
- [x] **6a.4** Старый план S4 разобран построчно: 83 пункта, у каждого один вердикт — 2 сделано (с доказательствами),
      6 отменены решениями владельца 30.07, 11 отложены как магазин («как сделаем сам магазин, так и сделаем в тарифах
      настройку»), 64 живых. Из живых 53 не имели пункта в этом плане и прошли двойной триаж (Sol и Opus независимо) на
      мировую практику и разумность, как велел владелец: 12 — «нужно позже» с названным предусловием (библиотека
      платформы ждёт магазина, каналы рассылок — соседний поток, поддержка — своя система), остальные — «не нужно»
      (сделано другими работами, противоречит решениям владельца или машинерия ради машинерии). Шесть спорных, где
      триажи разошлись, разрешены третьим прогоном по коду: пять оказались уже закрытыми (RLS-cutover применяется
      обязательным TEST-финалайзером, дублирующий гейт управления, отсутствие активирующего вебхука), один настоящий —
      и он про оплату, поэтому уехал в план биллингa пунктом B0.1, а не сюда. Доказательства:
      `../runs/tariff-mechanics/S4_RECONCILE_REPORT.md`, `TRIAGE_S4_SOL_RESULT.md`, `TRIAGE_S4_OPUS_RESULT.md`,
      `S4_ADJUDICATE_RESULT.md`.
- [x] **6a.5** По теме тарифов и механик остался ровно комплект: план (§5a этого файла) · канон
      (`QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md`) · справочник (`QUOTAS_RESEARCH_2026-07-28.md`) · журнал прогонов
      (`../runs/tariff-mechanics/`). Оплата и биллинг — отдельный план `SAAS_BILLING_PLAN.md`, не смешивается. Старый
      файл S4 с разметкой убран в `docs/archive/2026-07-plans/` — заглушку на его месте не оставляем, чтобы не плодить
      второй источник правды.

#### Этап 7. Приёмка

- [ ] **7.1** Полный CI в клоне через замок, один раз.
- [ ] **7.2** Гейт слияния при живых параллельных потоках: свежий feat вливается В КЛОН; после каждого руками
      разрешённого конфликта — тесты обеих сторон, не только тайпчек; номер миграции присваивается только здесь с
      проверкой, что параллельный поток его не занял, и с поиском ссылок на прежнее имя файла; при удалении роутов
      снести `apps/webapp/.next/types`; счётчик definer-функций и контрактные тесты; повторный полный CI на объединённом
      дереве; только потом слияние.
- [ ] **7.3** Деплой на TEST и живой прогон: настроить тариф с лестницей, назначить клинике и увидеть все три ступени —
      терпение, только чтение, выключено — на одной механике и на одном числе.
- [ ] **7.4** Владелец смотрит конструктор и подтверждает, что понятно, что и на сколько он настраивает.

---

### Definition of Done по механикам и лимитам

1. В конструкторе владелец задаёт лестницу доступа на двух уровнях — система и механика — со своими числами и конечным
   состоянием; в коде нет ни одной длительности, выбранной агентом.
2. Состояние механики у организации отвечает один резолвер; обработчики только спрашивают.
3. Дойти до записи данных механики мимо порта нельзя, и это доказано падающим тестом, а не обещанием.
4. У критичных механик лестницы нет; у запрещённого владельцем — ни лестницы, ни числа.
5. Числа: места, пациенты, филиалы, объём — с доказательством гонки, проверенными правами в базе и правилами смены
   тарифа.
6. Витрина расхода и состояния у клиники, отчёт по всем организациям и порядок включения по одной механике — сделаны
   (этап 6), документация сведена к одному комплекту (этап 6a, включая построчную разметку старого плана S4).
7. Приёмка владельцем прошла ДВАЖДЫ: после этапа 2 (поля лестницы) и в финале.
8. Полный CI зелёный один раз через замок; TEST задеплоен; владелец подтвердил живьём.

---


### Что осталось от прежней работы

Реестр с классами и тринадцатью механиками прошёл независимый аудит; точки контроля слайса A и начатых клинических
тестов становятся входами для порта. Выбрасывается ровно то, что было решением агента за владельца: зашитые
длительности, выбор конечного состояния и правило «чтение не ограничиваем никогда».

---

## 6. Definition of Done

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [x] **`requireEntitlement`/`requireEntitlementForAction` — один резолвер, оба API route и Server Action пути реально
      используют его.** (первая половина исходного составного пункта DoD)
      — ДОКАЗАНО: `checkEntitlement()` в `requireEntitlement.ts` — единственный внутренний резолвер за 6 адаптерами
      (Read/Mutation route + ReadAction/MutationAction + Page); `courses/route.ts` и
      `broadcasts/actions.ts`/`sections/actions.ts` реально его используют.
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §6 / S4-1 — «Добавить static guard: прямые `isMechanicEnabled` и чтения tariff/override из feature routes/services вне единственного boundary дают non-zero.»
- **Статический guard подтверждает отсутствие обходов.** (вторая половина исходного составного пункта DoD)
      — **Разделено независимым аудитом 27.07: составной пункт не может нести одну галочку, когда одна его половина
      документированно не работает.** Чекер `check-s4-entitlement-coverage.ts` логически проверен своими тестами
      (6/6 зелёных), но прямой запуск даёт exit 1 — false positive на JSDoc-комментарии в
      `org-branding/service.ts:138` — и он не подключён ни к `lint`, ни к `ci`. То есть сегодня он не гейтит
      ничего автоматически. Закроется починкой false positive плюс подключением чекера к `lint`.
- [x] **Все 14 механик из реестра §4 либо гейтятся на реальной write-поверхности, либо честно помечены
      `declared_no_surface`...**
      — ГОТОВО (реестр вырос до 15 — `clinic_team` добавлен позже §4 из этого плана):
      `apps/webapp/src/app-layer/entitlements/protectedActionRegistry.ts` мапит write-поверхности всех гейтящихся
      механик (courses/mailings/cms_pages/subscriptions/patient_card/files/booking/payments/clinic_team) и честно
      декларирует `exercise_catalog`/`exercise_packages`/`patient_app`/`patient_app_paid_subscription`/`branding`/
      `custom_domain` в `DECLARED_NO_SURFACE` (строки 130-137). Coverage-тест (6/6) подтверждает: ни одна механика не
      осталась без mapping или exemption.
- [ ] Новая организация применяет выбранную global-admin trial policy; если зависимая policy не утверждена/неполна,
      автоматическое trial provisioning fail-closed без подстановки придуманного тарифа. Existing NULL-org проходят
      отдельный owner-approved migration mapping до удаления compatibility behavior.
      — НЕ СДЕЛАНО: см. Phase 3 пп.7-8 выше — ни provisioning-интеграция, ни dry-run/mapping инструмент не существуют.
- [x] **Global-admin управляет тарифами/ценами/периодом/mechanics/назначением/override как данными; `clinic_admin`
      получает 403 везде.**
      — ГОТОВО: `CommercialConstructorClient.tsx` + `POST /api/admin/commercial` (create/update/archive/assign/
      upsert-override/delete-override actions) под `requirePlatformOperationsApiContext`; 403-тест на неавторизованный
      вызов зелёный (`route.test.ts:49-54`, перепрогнан).
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §9 / S4-4 — «Создать отдельный `modules/saas-billing` domain с ports/service/typed state machine».
- SaaS billing проходит полный цикл (checkout → capture → активная `saas_billing_subscription` → expiry/refund)
      на mock-адаптере; реальные ключи подключаются сменой настройки, без нового кода.
      — НЕ СДЕЛАНО: весь Phase 4 открыт (см. выше), цикла не существует.
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §12 / S4-6 — «Clinic B не видит tariff override, invoice или analytics A»; «Payment negatives: duplicate checkout/webhook, forged signature/org ID»; «После всех фаз выполнить один финальный `pnpm install --frozen-lockfile && pnpm run ci`».
- A/B изоляция и security negatives (Phase 5) закрыты на тестовом сервере; один финальный CI gate зелёный.
      — НЕ СДЕЛАНО: Phase 5 открыт (см. выше), финальный `pnpm run ci` в рамках этой сверки не запускался.
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §14 / Definition of Done — «Каждая owner attribution ссылается на `OWNER_RULINGS_2026-07-15.md`».
- Ни один пункт этого документа не был подписан именем владельца там, где решение инженерное (провенанс §0).
      — Не проверяется кодом/тестом — это самопроверка текста документа, не код-артефакт. §0 и §8 существующего текста
      уже явно разделяют owner ruling vs инженерный выбор («Порядок фаз... не решение владельца», «риск §8.1/8.2...»)
      — на вид соблюдается, но формального пруфа (commit/тест) для этого пункта не существует по своей природе, оставлено
      открытым до отдельной ревизии документа целиком.
- [ ] UI-фазы (Phase 3/4) размещены в верных zone-ID (`PLAT-02`/`PLAT-03`/`PLAT-05`/`MGMT-08`, §0a), не в старом
      doctorNavLinks-кластере «Настройки», и не дублируют/не блокируют будущий U9 platform shell.
      — ЧАСТИЧНО: Phase 3-половина ГОТОВА и превышает требование — `/app/admin/commercial` живёт в отдельном
      platform-shell (`platformNavLinks.ts`), не в `doctorNavLinks.ts` «Настройки», и фактически уже реализует часть
      U9-цели (не просто «не блокирует»). Phase 4-половина (`MGMT-05`/`MGMT-08` billing UI) не существует вовсе —
      пункт как целое (Phase 3 И Phase 4) не может быть закрыт, пока Phase 4 не начата.

## 7. Execution log

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

При старте реализации завести рядом `TARIFFS_PAYMENTS_ADMIN_PLAN_LOG.md`. После каждой фазы фиксировать: commit
range, точные post-change `file:line` для каждого закрытого пункта, tests/checkers/screenshots и результат,
owner ruling vs инженерное решение раздельно, остаточные риски.

## 8. Открытые инженерные риски (не решения владельца — фиксируются, чтобы Phase 3/4 их не проглядели)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

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
