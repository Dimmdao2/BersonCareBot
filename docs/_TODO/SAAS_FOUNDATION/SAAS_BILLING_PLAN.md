# SaaS-биллинг и оплата клиниками — план работ (карточка #1057)

**Почему отдельный файл.** Владелец 30.07: «всё что пройдёт аудит по биллингу и оплате saas — записать в актуальный
план задачи именно по биллингу и оплате, а не в этот план по тарифам и квотам — не смешивать». Раздел Phase 4 переехал
сюда целиком из `TARIFFS_PAYMENTS_ADMIN_PLAN.md` без переписывания — это перенос, а не новая бумажка.

**Справочник практики (факты, не решения):** `SAAS_BILLING_PRACTICE_RESEARCH_2026-07-27.md` — где хранить ключи ЮKassa
(в настройках базы, не в переменных окружения), почему автопродление у ЮKassa делается сохранённым способом оплаты, а
расписание держим мы.

**Стык с планом тарифов, чтобы планы не разъехались:**

- счёт клиники = цена тарифа + дополнительные специалисты сверх базы (поле цены задаёт владелец в конструкторе тарифов);
- ступень лестницы доступа — «терпение», «только чтение», «выключено» — включается от коммерческого состояния
  организации, которое ведёт биллинг; сами длительности и конечное состояние настраивает владелец в тарифе
  (`TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a, этап 2);
- ⛔ прежняя зашитая лестница «7 дней терпения → 21 день только чтения → блок» и три попытки списания ОТМЕНЕНЫ 30.07:
  это значения полей, а не константы. Их seed в миграции `0259_saas_billing_foundation.sql:238-242` подлежит снятию.

### ⚠️ Инвариант, который биллинг обязан держать (уточнение владельца 30.07)

Оплата клиникой тарифа платформы **никогда** не гейтится тарифными механиками и лестницей доступа — ни в терпении, ни в
режиме только чтения, ни в блоке. Иначе заблокированная клиника не сможет заплатить и снять блок. Гасится только приём
денег клиникой ОТ ПАЦИЕНТОВ (предоплата при записи, онлайн-оплата на приёме) — это отдельная механика тарифа, и она
живёт в плане тарифов, а не здесь. Дословно: «никто и никогда не запрещает клиенту saas платформы оплачивать тариф
платформы». Парный пункт в плане тарифов — 2.1c, с обязательным тестом.

### Найдено аудитом 30.07 и подтверждено по коду — единственный живой дефект из старого плана

- [ ] **B0.1** Пять ручек `*/payments/mock-complete` закрыты тестом: вне development и test каждая отвечает 404; тест
      краснеет при ослаблении `isMockPaymentConfirmEnabled`. Почему это здесь, а не в плане тарифов: владелец 30.07 —
      «всё что пройдёт аудит по биллингу и оплате saas — записать в актуальный план задачи именно по биллингу и оплате».
      Почему это блокер: все пять ручек висят на одном предикате (`mockPaymentGatePolicy.ts:19-20`), две из них
      публичные и без аутентификации, тестов нет ни на предикат, ни на сами ручки, а схема окружения имеет дефолт
      `NODE_ENV='development'` (`config/env.ts:27-29`) — то есть одно ослабление предиката открывает подтверждение
      платежей наружу, и ничто не покраснеет. Разрешение спора двух триажей: `../runs/tariff-mechanics/S4_ADJUDICATE_RESULT.md`.

---

### Phase 4 — достройка SaaS billing поверх существующих PSP (keyless-safe)

> ⛔ **SUPERSEDED — 30.07, replaced by §5a этапом 2 и каноном §4a.** Всё, что ниже в этой фазе описывает жизненный цикл
> доступа фиксированными числами (grace 7 дней → read-only 21 день → blocked, три попытки списания), — отменено:
> длительности, число попыток и конечное состояние стали ПОЛЯМИ, которые задаёт владелец на уровне системы и на уровне
> каждой механики. Дословно 30.07: «ты вообще не должен решать что ограничивать а что нет. ты должен дать мне механизм».
> Значения 7/3/21, засеянные миграцией `0259_saas_billing_foundation.sql:238-242`, тоже подлежат снятию (пункт 2.6a).
> Читать эту фазу можно только как описание платёжной механики; лестницу брать из §5a.


> **Провенанс решений этой фазы:** [`SAAS_BILLING_PRACTICE_RESEARCH_2026-07-27.md`](./SAAS_BILLING_PRACTICE_RESEARCH_2026-07-27.md)
> — разведка мировой практики по прямому распоряжению владельца 27.07 («узнать, как делают в реальной практике»).
> Там зафиксировано и обосновано: ключи в `system_settings`, а не в env; автопродление у ЮKassa = сохранённый
> способ оплаты, а не серверная подписка, и в боевом магазине оно ВЫКЛЮЧЕНО до обращения к менеджеру — поэтому
> примитивом делается СЧЁТ, а автосписание строится поверх него; grace 7 дней + 3 попытки → `read_only`, никогда
> автоматический `blocked`; чек по 54-ФЗ не нужен при переводе от ООО/ИП. Там же §6 — пять развилок владельца
> (получатель денег и НДС, включены ли автоплатежи, карты или только перевод, числа grace, шифрование секретов),
> ни одна из которых слайсу на `mock`-адаптере не требуется.
> Чек-лист работ — ТОЛЬКО этот файл ниже; разведка задач не заводит.
>
> **РЕШЕНИЕ ВЛАДЕЛЬЦА по просрочке (27.07), и честное разделение авторства** — раньше оно лежало только в
> разведке, а разведка решений не хранит (см. её же баннер), поэтому переносится сюда:
> — «7 дней мягкого периода с 3 попытками списания → потом режим "только чтение"» — **предложение агента** по
> мировой практике, владелец ответил «ок»;
> — «**Только чтение ещё на три недели. Потом блок на вход.**» — **слова владельца**, его собственное
> дополнение, в практике-разведке этого не было.
> Итого действующая лестница: 7 дней grace с 3 попытками → 21 день `read_only` → `blocked`. Автоматический
> `blocked` минуя `read_only` запрещён.

Урезанная версия S4-4: **только** оплата клиникой тарифа (SaaS-подписка, `saas_billing_subscription` — НЕ mechanic
`subscriptions`, см. риск §8.7), БЕЗ store package orders (S4-3 вне scope).

> **Ретриаж 2026-08-01 (`wt/tariff-plan-triage`):** четыре пункта ниже помечены «НЕ СДЕЛАНО» текстом, который
> писался ДО коммитов `53dd848c2`/`f773c5d8c`/`9bfa4303c` (2026-07-27/28, «SaaS billing foundation» +
> «read-only subscriptions/invoices») — этот файл не обновлялся после их слияния (последняя правка файла
> `05216970b`, 27.07 17:14, коснулась только денежного инварианта, не этих строк). Реальность на 2026-08-01
> ниже под меткой **✅ УТОЧНЕНО 08-01**; исходный текст «НЕ СДЕЛАНО» оставлен рядом как след прежнего замера,
> не переписан.

ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §9 / S4-4 — «Создать отдельный `modules/saas-billing` domain с ports/service/typed state machine».
- Новый домен `modules/saas-billing` (ports/service), DI через `buildAppDeps`, переиспользует существующий
      `PaymentProviderPort`/`paymentProviderRegistry` — не форкает и не переписывает адаптеры (владелец §1).
      — НЕ СДЕЛАНО: подтверждено дважды независимо (`find apps/webapp/src/modules -iname "*saas-billing*"` — пусто;
      `ls apps/webapp/src/modules | grep -i bill` — пусто). Тот же открытый пункт, что S4-4 в
      `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §9 (строки 313-370, всё ещё `[ ]`, без commit-ссылок).
      — ✅ **УТОЧНЕНО 08-01: СДЕЛАНО.** `apps/webapp/src/modules/saas-billing/{ports.ts,service.ts,settings.ts,
      paidPeriod.ts,providerEventEnvelope.ts,service.test.ts}` существуют; DI — `buildAppDeps.ts:247-249,745-760,1834`
      (`createSaasBillingService`, `deps.saasBilling`); переиспользует `PaymentProviderPort`/`resolvePaymentProvider`,
      не форкает адаптеры (`service.ts:1-6,29-44`).
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §9 / S4-4 — «Добавить минимальные org-owned records: billing account, source-aware tariff subscription, invoice/order и normalized provider event.»
- Минимальные org-owned таблицы: billing account, **`saas_billing_subscriptions`**
      (`pending_payment → active → expired/cancelled`), invoice (снимок tariff/amount/currency/period), provider event
      (idempotent, без patient data). **Именование обязательно дизъюнктно с mechanic `subscriptions`:** в `MECHANICS`
      уже есть ключ `subscriptions` ([`org-entitlements/types.ts:14`](../../../apps/webapp/src/modules/org-entitlements/types.ts))
      = «разрешены ли клинике пациентские абонементы» — совсем другая сущность. Все таблицы/типы/переменные Phase 4
      используют префикс `saas_billing_*` / `SaasBillingSubscription`, голое слово «subscription» в новом коде запрещено
      (см. риск §8.7).
      — НЕ СДЕЛАНО: `grep -rn "SaasBillingSubscription\|saas_billing_subscriptions" apps/webapp` — 0 совпадений в схеме
      и коде. Найден только dormant-плейсхолдер `DormantSaasMerchantIdentity` в
      `apps/webapp/src/modules/payments/merchantIdentityContracts.ts:8-20` с явным комментарием «S4-0 declares this
      only; S4-4 owns its DB setting and activation» — заготовка есть, реализации нет.
      — ✅ **УТОЧНЕНО 08-01: СДЕЛАНО, дизъюнктное именование соблюдено.** `apps/webapp/db/schema/saasBilling.ts`:
      `saasBillingAccounts`/`saasBillingSubscriptions`/`saasBillingInvoices`/`saasBillingProviderEvents`
      (`pgTable`, строки 41/77/154/237); статусы подписки — `SAAS_BILLING_SUBSCRIPTION_STATUS_VALUES` включает
      `pending_payment`; миграция `0259_saas_billing_foundation.sql`. Ни одного голого `subscription`-идентификатора
      не найдено (`grep -in "^export.*\bsubscription\b" db/schema/saasBilling.ts` — 0 совпадений вне префикса).
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §9 / S4-4 — «Перенести существующие manual `tariff_id` assignments в subscription/access rows с source=`manual`».
- Перенести существующие manual `tariff_id` assignments (из Phase 3) в `saas_billing_subscriptions` rows с
      `source="manual"`; compatibility-projection `be_organizations.tariff_id` остаётся согласованной, не второй истиной.
      — НЕ СДЕЛАНО: зависит от предыдущего пункта (таблицы `saas_billing_subscriptions` не существует).
      — ✅ **УТОЧНЕНО 08-01: СДЕЛАНО.** `service.ts:51-112` `assignManualTariff()` — атомарная транзакция:
      `setManualSaasBillingSubscription({..., tariffId})` создаёт/обновляет subscription с `source` (значения
      `SAAS_BILLING_SOURCE_VALUES = ['manual','paid_subscription']`), затем `updateCompatibilityProjection()`
      держит `be_organizations.tariff_id` согласованным той же транзакцией — не вторая истина. Вызывается из
      `POST /api/admin/commercial` action `assign_tariff` (Phase 3), значит manual-путь Phase 3 уже проходит
      через эту таблицу, а не только через compatibility-projection напрямую.
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §9 / S4-4 — «Добавить global DB setting `saas_billing_payment_provider` в `ALLOWED_KEYS`».
- Новый global setting-ключ `saas_billing_payment_provider` в `ALLOWED_KEYS`
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
      — НЕ СДЕЛАНО: `apps/webapp/src/modules/system-settings/registry.ts` не содержит ключа
      `saas_billing_payment_provider` (только `booking_payment_providers`). Только dormant-заготовка из предыдущего
      пункта (`merchantIdentityContracts.ts`, `activation: "dormant_until_s4_4"`), сам ключ не зарегистрирован.
      — ✅ **УТОЧНЕНО 08-01: СДЕЛАНО.** `system-settings/registry.ts:313-318` — `saas_billing_payment_provider:
      restricted('admin','global','secret_envelope','mock','redacted')`; `redactSaasBillingPaymentProviderValue`/
      `mergeSaasBillingPaymentProviderSecretsRetain` в `saas-billing/settings.ts:124-162` делают redaction тем же
      паттерном, что `booking_payment_providers`.
- [x] Дефолтный provider id = `"mock"` (уже существующий адаптер, [`paymentProviderRegistry.ts:25-26`](../../../apps/webapp/src/infra/payments/paymentProviderRegistry.ts))
      до тех пор, пока владелец не передаст реальные ключи. Схема/сервис/UI/webhook реализуются и проверяются
      **полностью** на mock-адаптере — отсутствие реальных ключей не блокирует ни один из этих пунктов.
      — ✅ **ЗАКРЫТО, УТОЧНЕНО 08-01** (первичный текст «НЕ СДЕЛАНО, нечему быть дефолтным» был верен на момент
      написания 27.07, устарел после коммитов того же дня): `saas-billing/settings.ts:3`
      `DEFAULT_SAAS_BILLING_PAYMENT_PROVIDER_ID = 'mock'`; читается и потребляется —
      `service.ts:29-44` `resolvePaymentProvider()` выбирает провайдера по этому id из настройки. UI/webhook для
      **приёма** оплаты по нему по-прежнему не существуют (см. пункты «Checkout UI» и SaaS webhook ниже — те
      остаются открытыми отдельно).
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §9 / S4-4 — «Добавить SaaS webhook route под bootstrap principal: load global provider config → verify signature/status».
- `POST /api/payments/saas-webhook/[provider]` (новый, отдельный от booking-webhook) под bootstrap principal:
      load global config → verify signature/status через существующий `verifyWebhook` → resolve invoice /
      `saas_billing_subscription` → org-scoped capture. Неизвестный ref — safe-acknowledge; forged
      signature/amount/currency mismatch/replay не меняют доступ.
      — НЕ СДЕЛАНО: `find apps/webapp/src -iname "*saas-webhook*"` — пусто. Существующие роуты —
      `api/payments/webhook/[provider]` (booking) и `api/payments/patient-acquiring-webhook/[provider]` — оба
      pre-existing, разные поверхности, не тронуты и не дублированы (это ок — не в scope).
      — **УТОЧНЕНО 08-01: маршрут по-прежнему отсутствует** (`find` пуст, подтверждено повторно), но сервисная
      функция, которую он должен вызывать, уже написана и ждёт вызывающего: `saas-billing/service.ts:144-153`
      `recordSaasBillingProviderEvent()` (санитизирует и пишет provider event идемпотентно). Ни одного
      продуктового вызывающего у неё нет — то же самое отмечено в `TARIFFS_PAYMENTS_ADMIN_PLAN.md` пункте 7.0.
- [ ] Checkout UI — **другая зона от Phase 3.** Clinic-facing план/usage/инвойсы/оплата = **`MGMT-08` Plan, usage
      and billing** («Current plan, limits, invoices, recovery | Owner; delegated view/pay if explicitly allowed», см.
      §0a) — внутри обычного tenant-дерева `/app/doctor/**` (не в `(global-admin)` route group из Phase 3). Новая
      страница/секция под clinic settings/organization area; возвращает provider checkout URL; return page сверяет
      invoice/order по server-derived org, никогда не берёт сумму/tariff/target org от клиента.
      — НЕ СДЕЛАНО как SaaS-checkout, но соседняя READ-ONLY поверхность в той же MGMT-08 зоне уже существует:
      `apps/webapp/src/app/app/settings/BillingSection.tsx` (+ `billingCommercialState.ts`, вкладка `"billing"` в
      `settingsTabs.ts`) показывает название тарифа, human-readable commercial-state и грид всех механик — но БЕЗ
      checkout/invoice/payment-history/upgrade (`grep -in "invoice\|checkout\|payment history"` на обоих файлах —
      ничего), с явным комментарием в коде: «No tariff-change UI here by design — that stays with the platform
      administrator» (commit `60b43d757`). Живой скриншот этой страницы — `runs/screenshots/billing-real.png`
      (25.07, видны все 15 механик со статусом «Включено»). Это НЕ закрывает пункт плана (нет ни одного элемента
      checkout), но следующая реализация Phase 4 должна расширить/заменить этот компонент, а не дублировать новый.
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §9 / S4-4 — «Tariff capture активирует/продлевает source=`paid_subscription`; expiry/cancel/refund завершает только этот source.»
- Успешный capture продлевает `source="paid_subscription"`; expiry/cancel/refund завершает только этот source;
      manual global-admin assignment не перетирается истёкшей подпиской молча.
      — НЕ СДЕЛАНО: зависит от несуществующего billing-модуля.
      — **УТОЧНЕНО 08-01: модуль уже существует, вызывающего пути capture по-прежнему нет.**
      `saas-billing/service.ts:114-142` `createRenewalSaasBillingInvoice()` создаёт invoice и провайдерский intent,
      но ни один route/action её не вызывает (`grep -rn "createRenewalSaasBillingInvoice" apps/webapp/src` — только
      определение в `service.ts`). `source="paid_subscription"` в схеме объявлен
      (`SAAS_BILLING_SOURCE_VALUES`), но ни одна строка в продуктовом коде его не устанавливает — только `"manual"`
      через `assignManualTariff()`. Пункт остаётся открытым по существу.
ВЕДЁТСЯ В `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` §9 / S4-4 — «До кода зафиксировать subscription state machine минимум для».
- Деградация при `expired`/`past_due` — сверить с каноном 4-состояний entitlement denial (`upgrade/grace/
read-only/blocked`, [`ROLE_CAPABILITY_MATRIX.md:17`](../SAAS_PRODUCT_UX_INITIATIVE/ROLE_CAPABILITY_MATRIX.md),
      см. §0a) при проектировании state machine: истечение подписки не обязано мгновенно бить `blocked` на все
      mechanics — решить явно (grace-период до hard block — инженерный выбор этой фазы, не молчаливый пробел).
      — ЧАСТИЧНО заложен фундамент: `checkEntitlement()` в `requireEntitlement.ts:19-38` уже различает
      `active`/`read_only`/`blocked` lifecycle (не `upgrade`/`grace` полностью, 3 из 4 состояний канона) и протестирован
      (`requireEntitlement.test.ts` кейсы «allows reads in read-only lifecycle but rejects mutations», «allows recovery
      reads in blocked lifecycle»). Но САМА подписка/её state machine, которая переводила бы lifecycle по `expired`/
      `past_due`, не существует — фундамент для потребления есть, источника события (billing) нет.

- [ ] **Фискализация: объект `receipt` в платеже и возврате.** Заведено ПРЯМЫМ распоряжением владельца 27.07:
      «И облачную кассу будем подключать» → на уточнение «поле `receipt` в платеже» — **«делай конечно как надо.
      чеки и касса будут»**. Разведка с источниками:
      [`CLOUD_CASH_REGISTER_RESEARCH_2026-07-27.md`](./CLOUD_CASH_REGISTER_RESEARCH_2026-07-27.md).
      Форма правки — **одно необязательное поле `receipt?` в параметрах `createIntent` и `refund`**
      ([`modules/payments/providerPort.ts:12-18`](../../../apps/webapp/src/modules/payments/providerPort.ts)),
      подмешиваемое в тело запроса ЮKassa, когда оно есть
      ([`infra/payments/yookassaPaymentProvider.ts:79-87`](../../../apps/webapp/src/infra/payments/yookassaPaymentProvider.ts)).
      Не форк адаптера, не второй провайдер; `mock` поле игнорирует. `PaymentProviderConfig` не меняется — чек это
      данные платежа, а не учётка провайдера.
      Состав: `customer.email` (обязателен — ЮKassa доставляет чеки только письмом), `items[]` с `description`,
      `quantity`, `amount`, `vat_code`, `payment_subject: "service"`, `payment_mode: "full_prepayment"`,
      и `tax_system_code`.
      **`vat_code` и `tax_system_code` — НАСТРОЙКИ кабинета глобального админа, не константы** (правило
      [`OWNER_PRODUCT_RULES.md` §19](../../ARCHITECTURE/OWNER_PRODUCT_RULES.md)); доказательство обязательности:
      с 01.01.2026 `4`=20 % соседствует с `11`=22 % и `12`=22/122 — захардкоженная ставка неверна уже сегодня.
      **Порядок обязателен: СНАЧАЛА поле в коде, ПОТОМ тумблер кассы в кабинете ЮKassa.** Как только фискализация
      включена, ЮKassa отклоняет создание платежа без `receipt` (`INVALID_REQUEST`, параметр `receipt`) — то есть
      включение кассы без этой правки ломает ВСЕ платежи.
      Сама касса подключается в кабинете ЮKassa (Настройки → Онлайн-касса), НЕ у нас; выбор «Чеки от ЮKassa» или
      партнёрской кассы на код не влияет и решается владельцем позже.
      — НЕ СДЕЛАНО: `grep -rn "receipt\|vat_code\|tax_system_code\|fiscal" apps/webapp/src` — 0 совпадений.

**Проверка:** state-machine + idempotency тесты; подписанный webhook success/replay/forgery/amount-mismatch;
capture/refund integration тест на mock-адаптере; secret redaction scan; checkout UI RTL/E2E.
**Выход:** клиника может оплатить тариф через существующий provider layer в mock-режиме на test; когда владелец
даст реальные ключи, включение — это просто смена `providerId` в Settings, без нового кода.

