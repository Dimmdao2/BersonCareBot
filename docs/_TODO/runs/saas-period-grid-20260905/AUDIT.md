# AUDIT — SaaS global billing-period price grid (#1069), первый независимый аудит-live

| | |
|---|---|
| **Роль** | `auditor-live` (первый аудитор новой поверхности, §10b / §24.5) |
| **Продуктовый SHA** | `c1e18607b` (+ прерванный чекпоинт `649d898ae`), ветка `wt/saas-period-grid` |
| **База сравнения** | `feat/doctor-ui-rebuild` = `bb7f91265`; аудирован ВЕСЬ диапазон, не последний коммит |
| **Audit SHA** | см. хвост файла |
| **Kill-set** | [`KILLSET.md`](KILLSET.md) — составлен по решениям владельца Т14 **до** открытия тестов |
| **Дата** | 2026-09-05 |

## ВЕРДИКТ: ⛔ **FAIL** — кандидат НЕ land-ready

Три независимых механических гейта репозитория красные на **неизменённом** кандидате, и живая
интроспекция PostgreSQL доказывает, что новая поверхность физически неработоспособна под своими
рантайм-ролями. Это не стиль и не «можно покрыть ещё» — это `42501` на первом живом вызове по
каждому из трёх путей, которые реализует сам этап.

Продуктовый дизайн при этом в основном соответствует Т14: сетка периодов — данные, хардкода
`month/year` в логике и UI не осталось, невозвратность SaaS-платежей выполнена чисто, миграция
корректна и проходит owner-aware preflight. Отказ — в слое прав и в незавершённой сдаче (гейты и
тесты не приведены в соответствие).

---

## 1. Что запускалось и что получилось (точные команды)

| # | Команда | Результат |
|---|---------|-----------|
| 1 | `pnpm run check:drizzle-insert-surface` | ⛔ **FAIL** — «does not match live Drizzle metadata» |
| 2 | `pnpm run test:db-privileges` | ⛔ **FAIL** — падает на шаге 1 (см. выше), до privilege-тестов не доходит |
| 3 | `node deploy/postgres/privileges/generate-cli.mjs --check` | ✅ PASS — 4/4 артефакта побайтно совпадают с декларацией |
| 4 | `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` | ✅ **PASS** — `pending=1 total=118`, одна транзакция `BEGIN…ROLLBACK`, DEV не изменён |
| 5 | `pnpm --dir apps/webapp typecheck` | ⛔ **FAIL** — **64 ошибки** в 4 файлах (все — тестовые) |
| 6 | `vitest run --project fast src/modules/saas-billing/` | ⛔ **46 failed / 53 passed (99)** |
| 7 | `vitest run --project fast src/modules/org-entitlements/service.test.ts` | ⛔ **27 failed / 40 passed (67)** |
| 8 | `vitest run BillingSection.ui.test.tsx PayTariffButton.ui.test.tsx` | ⛔ **2 failed / 6 passed (8)** |
| 9 | `vitest run --project unit src/modules/saas-billing/retiredBillingPeriod.unit.test.ts` | ⛔ **1 failed / 1 passed** — намеренный acceptance (handoff evidence) |
| 10 | `eslint` по всей затронутой поверхности (7 путей) | ✅ PASS, 0 замечаний |
| 11 | `git diff --check feat/doctor-ui-rebuild...HEAD` | ✅ чисто |
| 12 | Живая rollback-only интроспекция + исполнение под ролями на `bcb_webapp_dev` | см. §3 |

Полный CI не гонялся: §9 не даёт нового сигнала — три гейта уже красные на targeted-уровне, и
причина каждого локализована точно.

**Итого по typecheck (64):** `service.test.ts` 36 · `org-entitlements/service.test.ts` 17 ·
`BillingSection.ui.test.tsx` 7 · `PayTariffButton.ui.test.tsx` 4. **Продуктовый код типизируется
чисто** — сломан только набор тестов, который автор не привёл в соответствие с новой сигнатурой.

---

## 2. Разбор прав миграции по §1 «Перед приземлением миграции — разбор её прав»

Миграция `20260905T120000_one_global_billing_period_price_matrix.sql`.

**1. Что создаёт/меняет.**
Создаёт таблицу `public.saas_tariff_period_prices` + индекс
`idx_saas_tariff_period_prices_period_tariff (billing_period_code, tariff_id)`. Добавляет
`saas_billing_subscriptions.billing_period_code` и `.pending_billing_period_code`, два составных FK
на матрицу цен (`ON DELETE RESTRICT`, MATCH SIMPLE) и CHECK-парность pending. Заменяет тело
`app.list_saas_billing_subscriptions_due_for_renewal(timestamptz,integer)`.

**2. Под какой ролью исполняется каждое тело.**
Блоки 1 и 3 — `app_object_owner`; блок 2 — `BCB-MIGRATION-BACKFILL` (data-only); блок 4 —
`app_seam_org_commerce_owner` + `SCHEMA-CREATE: app` + `LANGUAGE-USAGE: plpgsql`. Маркеры
корректны и приняты раннером (шаг 4 таблицы выше показал реальные `SET LOCAL ROLE`).
`postgres` в owner-маркере отсутствует. ✅

**3. Каких прав требуют тела, чтобы ИСПОЛНИТЬСЯ.**
Обновлённая due-функция читает `saas_billing_subscriptions(… billing_period_code,
pending_billing_period_code, cancelled_at …)` и больше НЕ читает `saas_tariffs` — декларация это
отражает, и колоночные гранты владельцу шва выданы (`privileges.bcb_webapp_dev.sql:17537`). ✅
Рантайм-роли, которые пишут новые колонки и читают матрицу цен, прав НЕ получили — §3.

**4. Чего нет в декларации.** См. §3 — три подтверждённых пробела.

**Запрет «миграция не выдаёт и не отзывает права»:** соблюдён — в файле нет ни одного
`GRANT/REVOKE/CREATE ROLE/ALTER ROLE/ALTER DEFAULT PRIVILEGES/CREATE POLICY`. ✅

**Индекс на горячую колонку в том же PR:** есть, и он именно обратный (`period, tariff`) —
ровно тот, которым идёт проверка полноты при активации периода. ✅

**Бэкфилл ничего не выдумывает:** `INSERT … SELECT id, billing_period, price_minor,
discounted_price_minor FROM saas_tariffs WHERE price_minor IS NOT NULL` — только фактическая
легаси-пара, без умножения на месяцы и без дефолтного периода; `ON CONFLICT DO NOTHING`. ✅ (F1)

---

## 3. Права БД — живое доказательство (rollback-only, `bcb_webapp_dev`)

Метод: в одной транзакции созданы объекты кандидата (таблица — под `app_object_owner`, как в
миграции), применены **дословно строки собственного сгенерированного артефакта кандидата**
`deploy/postgres/generated/privileges.bcb_webapp_dev.sql`, затем `has_column_privilege` /
`has_table_privilege` / `has_function_privilege` и реальные `SET LOCAL ROLE` + попытки записи;
`ROLLBACK`. Текст SQL не проверялся нигде (§10a «Как НЕ надо» п.5).

### 3.1 ⛔ F-1 (CONFIRMED, новое) — ни одна рантайм-роль не может писать новые колонки пары

`has_column_privilege`, все 12 комбинаций = **false**:

| Роль | `billing_period_code` | `pending_billing_period_code` |
|---|---|---|
| `app_clinic_billing` | INSERT ✗ · UPDATE ✗ | INSERT ✗ · UPDATE ✗ |
| `app_platform_settings` | INSERT ✗ · UPDATE ✗ | INSERT ✗ · UPDATE ✗ |
| `app_worker` | INSERT ✗ · UPDATE ✗ | INSERT ✗ · UPDATE ✗ |

Живое исполнение под ролью (каждая попытка в своём SAVEPOINT):

```
D1 контроль: SET ROLE app_clinic_billing; UPDATE saas_billing_subscriptions SET tariff_id=tariff_id
             -> УСПЕХ (привилегия на старую колонку есть)
D2 SET ROLE app_clinic_billing;    UPDATE … SET billing_period_code='month'
             -> ERROR: permission denied for table saas_billing_subscriptions
D3 SET ROLE app_platform_settings; UPDATE … SET pending_billing_period_code='month'
             -> ERROR: permission denied for table saas_billing_subscriptions
D4 SET ROLE app_worker;            UPDATE … SET billing_period_code='month'
             -> ERROR: permission denied for table saas_billing_subscriptions
```

Контроль D1 доказывает, что отказ относится ИМЕННО к новым колонкам, а не к таблице целиком.

**Достижимые пути:** `setManualSaasBillingSubscription` (`pgSaasBilling.ts:985/1007`, INSERT …
ON CONFLICT DO UPDATE) — дверь и клиники (`scheduleOwnTariffChange`), и админа
(`assignManualTariff`); промоушен пары при оплате (`pgSaasBilling.ts:415-419`). То есть **любая**
покупка, смена тарифа/периода и расчёт по факту падают `42501`.

**Причина механическая:** колоночные гранты подписки живут в `relation-access.ts`, а он в этой
ветке **не менялся** (`git diff --name-only … deploy/postgres/privileges/` даёт только
`declaration.ts` и `function-census.ts`).

**Важно для исполнителя:** перегенерация `drizzle-insert-surface.ts` закрывает только **INSERT**
(проверено: после регенерации `billing_period_code`/`pending_billing_period_code` появляются в
`GRANT INSERT`, а `GRANT UPDATE` остаётся БЕЗ них). **UPDATE придётся дописать руками** в
`relation-access.ts` для всех трёх ролей.

### 3.2 ⛔ F-2 (CONFIRMED, новое) — `app_worker` не видит матрицу цен

`has_table_privilege('app_worker','public.saas_tariff_period_prices','SELECT')` = **false**;
живьём — `ERROR: permission denied for table saas_tariff_period_prices`.

Достижимый путь: `createSaasBillingRenewalInvoiceIfAbsent` (`pgSaasBilling.ts:1950-1959`) читает
`saas_tariff_period_prices` через `getDrizzle()`, а тик продления входит
`enterWithDbInfraPrincipal` (`api/internal/saas-billing/renewal/tick/route.ts:31`) → роль
`app_worker`. **Автопродление не выставит ни одного счёта.** Отказ дорогой (не выставляем счета
клиникам) и молчаливый (тик отчитывается `failed`, продукт не падает).

### 3.3 ⚠️ F-3 (CONFIRMED, но ПРЕДСУЩЕСТВУЕТ) — воркеру недоступен ни один корень каталога периодов

`has_function_privilege('app_worker', …)`: `app.list_saas_billing_period_catalog()` = **false**,
`app.list_saas_billing_period_catalog_platform()` = **false** (execute-списки —
`app_clinic_billing` и `app_platform_settings` соответственно).

`runDueSaasBillingRenewals` зовёт `paidPeriodEndsAtForBillingCode` → `listBillingPeriods()`, а тот
под не-platform принципалом уходит в клиничий корень.

**Это НЕ регрессия #1069:** тот же вызов стоит в `runDueSaasBillingRenewals` на
`feat/doctor-ui-rebuild` (`service.ts:978` базовой ветки). Лид из brief **подтверждён**, но
атрибуция — предсуществующий дефект. Рекомендация из brief корректна: закрывать не широким
грантом, а тем, что due-корень уже отдаёт `billingPeriod` — доверенное число месяцев логичнее
отдать оттуда же, чем открывать воркеру каталог.

### 3.4 ⛔ F-4 (CONFIRMED, новое) — full-replace цен несовместим с историей подписок

`writeTariffPeriodPrices` (`pgPlatformEntitlements.ts:240`) на КАЖДОМ сохранении тарифа делает
`DELETE … WHERE tariff_id = …` и переписывает матрицу целиком; вызывается безусловно и из
`createTariff`, и из `updateTariff` (`:671`, `:706`). Составной FK подписки — `ON DELETE RESTRICT`.

Живое доказательство (одна транзакция, `ROLLBACK`): заведены реальный billing-account и активная
подписка на реальную пару, затем выполнен именно этот DELETE:

```
ERROR: update or delete on table "saas_tariff_period_prices" violates foreign key constraint
       "saas_billing_subscriptions_tariff_period_price_fkey" on table "saas_billing_subscriptions"
DETAIL: Key (tariff_id, billing_period_code)=(59fbb0c9-…, month) is still referenced
        from table "saas_billing_subscriptions".
контроль: тот же DELETE на тарифе БЕЗ подписчика -> успех
```

**Следствие:** как только у тарифа появится хоть одна платящая клиника, владелец не сможет
сохранить по нему НИЧЕГО — ни цену, ни название. Это лобовое столкновение решения 2 (матрица
редактируется) с решением 3 (история не переписывается). Лечится diff-записью (upsert + удаление
только неиспользуемых строк) вместо full-replace.

### 3.5 Матрица прав против фактических путей вызова — итог

| Требование brief | Факт | Вердикт |
|---|---|---|
| platform: periods/prices SELECT+INSERT+колоночный UPDATE, **без DELETE** | выдан **табличный** `SELECT, INSERT, UPDATE, DELETE` на `saas_tariff_period_prices` | ⚠️ шире требуемого; но DELETE **реально используется** full-replace-ом (§3.4) — сначала чинится запись, потом сужается грант |
| clinic billing: читать активные тарифы/периоды/цену; писать выбранную пару через существующий chokepoint | чтение ✅ (`SELECT` табличный); запись пары ⛔ (§3.1) | ⛔ |
| worker: читать цену/период для продления, писать пару при расчёте | чтение цены ⛔ (§3.2), период ⛔ (§3.3), запись пары ⛔ (§3.1) | ⛔ |
| именованные корни-владельцы: ровно те колонки, что трогают тела | `app_seam_org_commerce_owner` и `app_seam_specialist_provision_owner` получили колоночные `SELECT` строго по спискам; мед./кросс-арендных расширений нет | ✅ |
| глобальный админ — только через отдельный пул/членство | `bcb_dev_webapp_global_admin` → `app_platform_admin`, `app_platform_settings`; у `bcb_dev_webapp_staff` `app_platform_settings` НЕТ | ✅ (G10 опровергнут) |

### 3.6 Лиды brief, которые ОПРОВЕРГНУТЫ

- **`PLATFORM_ROLE_SCOPE.mayTouch`** — правка последнего коммита генератору видна. Доказано
  runtime-импортом (не чтением файла): `mayTouch includes public.saas_tariff_period_prices => true`
  (19 записей), и сам вывод генератора содержит таблицу с политиками и грантами
  (`privileges.bcb_webapp_dev.sql:17895-17934`). ✅
- **`DELETE` на `saas_tariff_period_prices` как чистый овергрант** — не овергрант: используется
  (§3.4). Настоящая проблема — сама форма записи, а не грант.
- **`DELETE` на `saas_billing_periods`** — овергрант остаётся (снятие периода делается UPDATE-ом
  `setBillingPeriodSelectable`, DELETE не зовёт никто), но он **предсуществует** и этой веткой не
  введён.

### 3.7 Консолидация авторитетности (решение владельца 6)

Ответ на вопрос brief: **авторитетность структурно расщеплена, и кандидат обновил не все входы.**
`declaration.ts` — исполняемый корень, но фактические колоночные гранты рантайм-ролей приходят в
него из `relation-access.ts` (рукописный), сигнатуры/поверхности функций — из `function-census.ts`
(рукописный), колоночный INSERT — из `drizzle-insert-surface.ts` (машинный). Кандидат обновил
`declaration.ts` и `function-census.ts`, **не тронул `relation-access.ts`** и **не перегенерировал
машинный артефакт** — отсюда одновременно и красный гейт №1, и дыра §3.1. Формально решение 6 («одна
исполняемая декларация») сегодня не выполняется самой архитектурой слоя, а не только этой веткой;
это **owner question**, не работа, заведённая аудитом (§24.6).

---

## 4. Поведение: kill-set, что поймано и что нет

### 4.1 ⛔ F-5 (CONFIRMED, новое) — СНЯТЫЙ период остаётся покупаемым

**Единственный недостающий поведенческий тест, который я добавил:**
`apps/webapp/src/modules/saas-billing/retiredBillingPeriod.unit.test.ts` — **падает на
неизменённом кандидате**, что и есть handoff evidence (§24.5).

```
AssertionError: promise resolved "{ outcome: 'scheduled' }" instead of rejecting
```

`scheduleOwnTariffChange` (`service.ts:1131-1136`) сводит код периода ТОЛЬКО с матрицей цен
(`targetChoice.periodPrices.some(...)`) и нигде не спрашивает, выбираем ли период сейчас.
`listActiveTariffChoices` (`pgSaasBilling.ts:585-608`) тоже не джойнит `saas_billing_periods` и не
фильтрует по `is_selectable`. А строка цены снятого периода жива НАМЕРЕННО — снятие не разрушает
историю (решение 2). Именно это делает дыру достижимой.

Отказ дорогой (продаём отозванный владельцем период по замороженной цене, и продление будет
выставлять его бесконечно) и молчаливый (покупка проходит как обычная).

**Показательно:** админская дверь ЭТУ проверку делает — `requireActiveTariff`
(`pgSaasBilling.ts:911-922`) джойнит `saas_billing_periods` и фильтрует `isSelectable = true`.
То есть две двери отвечают на один вопрос по-разному — прямое нарушение §5 «Один общий проход».

Контрольный тест в том же файле (выбираемый период того же тарифа → `{outcome:'cancelled'}`)
зелёный: отказ не тотальный, тест не вакуумный.

### 4.2 ⛔ F-6 (CONFIRMED, новое) — отмена подписки недостижима

`cancelOwnTariffBillingSubscription` реализована в сервисе (`service.ts:1242`), в обоих репозиториях
и в порту, а due-корень корректно исключает `cancelled_at IS NOT NULL`. Но **ни один route и ни один
UI её не зовёт** (`grep` по `apps/webapp/src` вне тестов даёт только определения). Половина решения
владельца 3 («отмена гасит продление после конца оплаченного периода») построена, но не подключена.

### 4.3 Что подтверждено как СДЕЛАННОЕ ПРАВИЛЬНО

| Kill-set | Проверка | Итог |
|---|---|---|
| A1 «период — данные, не хардкод» | `grep` по `modules/saas-billing`, `modules/org-entitlements`, обоим pg-репозиториям: ни одного живого литерала `'month'/'year'` в логике (осталcя только комментарий). `TariffBillingPeriodCode = string` — закрытого union нет | ✅ |
| A1 в UI | в `CommercialConstructorClient.tsx` и `PayTariffButton.tsx` нет списка периодов; «Месяцев» — заголовок колонки данных | ✅ |
| A2 «одна сетка на все тарифы» | сетка одна (`saas_billing_periods`), per-tariff набора периодов в схеме нет | ✅ |
| A4/B7 | `sort_order`/`label`/`months` — колонки; валюта на тарифе, не в строке матрицы | ✅ |
| E5 «API принимает только пару» | `billingPatchSchema` = `{tariffId, billingPeriodCode}`; ни суммы, ни месяцев от клиента; сумма выводится сервером | ✅ |
| E6 «конец периода из месяцев периода» | `paidPeriod.test.ts` зелёный (4 теста), включая произвольный `half_year` и отказ на неизвестном коде | ✅ |
| E1 «сумма инвойса неизменна» | `amount_minor` не входит ни в один UPDATE-грант clinic/platform/worker — только шов деривации; **грант-поверхность инвойса этой веткой не менялась** (побайтно совпадает с базой) | ✅ |
| D1 «нет достижимого возврата SaaS» | каталог маршрута `payments/[invoiceId]/refund/` удалён; `refundSaasBillingInvoice`, `reserveSaasBillingRefund`, `attachSaasBillingRefundProviderRef`, `markSaasBillingRefundFailed` отсутствуют вне комментариев | ✅ |
| D2 «история возвратов читается» | `RefundCell` — read-only отчётность; webhook-расчёт уже существовавших строк сохранён | ✅ |
| D3 «пациентские возвраты не тронуты» | в диффе нет ни одного файла `modules/payments` / клиничьих возвратов | ✅ |
| C1/C2 «граница оплаченного периода» | планирование пишет pending-пару и НЕ трогает текущие `tariffId`/`billingPeriodCode`/`current_period_*`; тот же тариф с другим периодом планируется (не считается no-op) | ✅ (по чтению) |
| C4 «нет немедленного апгрейда» | `createProratedTariffUpgradeCheckout` и `createProratedTariffUpgradeInvoice` удалены; `proration.ts` остался только под Р-15 (места), что и есть действующее решение | ✅ |
| F2 «миграция без прав» | ни одного `GRANT/REVOKE/ROLE/POLICY` | ✅ |
| F3 контракт файла миграции | имя `YYYYMMDDTHHMMSS_slug.sql`, owner-маркеры на всех блоках, verify-probe в шапке | ✅ |
| F6 preflight | PASS против named DEV, rollback-only | ✅ |
| H2/I1 документация | Т9 помечено «⛔ УСТАРЕЛО, заменено Т14», Р-14 заменено, К2 отменено, `SAAS_BILLING_PLAN` сверен. Двух активных несовместимых вариантов не осталось | ✅ |
| H3 админ-UI | есть глобальный редактор периодов (`billing_period_upsert`, `set_billing_period_selectable`) и матрица тариф×период | ✅ |

---

## 5. Fault injection — «что сломано → что покраснело»

Четыре инъекции, по одной на независимый класс. **Каждая откачена, дерево чистое.**

| # | Что сломано | Что покраснело | Итог |
|---|---|---|---|
| 1 | `paidPeriodEndsAtFromMonths` игнорирует `periodMonths` (всегда 1 месяц) | `paidPeriod.test.ts`: 4 passed → **1 failed / 3 passed** | ✅ **ПОЙМАНО** |
| 2 | `assertCompleteTariffPeriodPriceMatrix` перестал отвергать НЕПОЛНУЮ матрицу | `org-entitlements/service.test.ts`: **27 failed / 40 passed → 27 failed / 40 passed** | ⛔ **НЕ ПОЙМАНО** |
| 3 | `purchasedTariffPeriodPair` игнорирует ЗАПЛАНИРОВАННУЮ пару (счёт уходит по старой) | `modules/saas-billing/`: **46 failed / 53 passed → 46 failed / 53 passed** | ⛔ **НЕ ПОЙМАНО** |
| 4 | `scheduleOwnTariffChange` отказывает ЛЮБОЙ паре (валидация моего же теста) | мой контрольный тест покраснел | ✅ **ПОЙМАНО** (тест не вакуумный) |

**Счёт: поймано 2, не поймано 2.** Причина обоих непойманных одна: тесты, которые обязаны были
защищать эти классы, входят в те самые 73 уже падающих. Красный набор защитой не является (§10b п.4),
поэтому денежные гарантии решений 2 и 3 сегодня не защищены ничем.

---

## 6. Оценка существующих сломанных тестов (по требованию brief)

Я их **не переписывал**: это не механическая правка, а завершение самого этапа, и переписывание
уничтожило бы handoff evidence. Оценка против действующего поведения владельца:

| Файл | Ошибок | Оракул | Что делать исполнителю |
|---|---|---|---|
| `saas-billing/service.test.ts` | 36 TS / 46 runtime | **в основном ВАЛИДЕН** — сигнатура выросла на `billingPeriodCode`, контракт тот же | обновить вызовы и фейки |
| — его же блоки про `createProratedTariffUpgradeInvoice` (стр. ~2517, ~2547, ~3834-3883) | — | **УСТАРЕЛ** — Т14 отменила немедленный/пропорциональный апгрейд | удалить целиком |
| `org-entitlements/service.test.ts` | 17 TS / 27 runtime | **ВАЛИДЕН** — падает на `port.listBillingPeriods is not a function`, то есть устарел ФЕЙК порта, а не ожидание | добавить метод в фейк |
| `BillingSection.ui.test.tsx` | 7 | контракт валиден | обновить под новую форму |
| `PayTariffButton.ui.test.tsx` | 4 / 2 runtime | падает на `getByRole('combobox')` — теперь селекторов два (тариф + период) | сделать запрос однозначным; счёт элементов тестом не закреплять (§10a) |
| `proration.test.ts` | 0 | **ВАЛИДЕН и должен остаться** — покрывает Р-15 (места), а не отменённый апгрейд тарифа | не трогать |

---

## 7. Findings — сводка (только достижимые нарушения, §24.6)

| ID | Severity | Findings |
|---|---|---|
| **F-1** | 🔴 blocker | Рантайм-роли не могут писать `billing_period_code`/`pending_billing_period_code` → `42501` на любой покупке/смене/расчёте. Перегенерация артефакта закрывает только INSERT; UPDATE дописывается в `relation-access.ts` руками |
| **F-2** | 🔴 blocker | `app_worker` без `SELECT` на `saas_tariff_period_prices` → автопродление не выставляет счета |
| **F-4** | 🔴 blocker | Full-replace матрицы цен блокируется `RESTRICT`-FK: тариф с платящей клиникой становится нередактируемым |
| **F-5** | 🔴 major | Снятый период остаётся покупаемым через клиничью дверь (падающий acceptance-тест приложен) |
| **F-6** | 🟠 major | Отмена подписки реализована, но не подключена ни к API, ни к UI |
| **F-7** | 🟠 major | `check:drizzle-insert-surface` и весь `test:db-privileges` красные; машинный артефакт не перегенерирован |
| **F-8** | 🟠 major | `typecheck` красный: 64 ошибки; 73 падающих теста в двух затронутых модулях + 2 UI |
| **F-3** | 🟡 minor | Воркеру недоступен корень каталога периодов — **предсуществует**, не регрессия #1069 |

**Recommendations (НЕ findings, работой не становятся автоматически):**
- docstring `assertCompleteTariffPeriodPriceMatrix` утверждает, что гейт активации периода зовёт
  именно её, — фактически `setBillingPeriodSelectable` считает `missing` своим кодом. Сегодня две
  проверки согласны, но это две двери к одному правилу (§5);
- `requireActiveTariff` называет выбранный период «cheapest», а сортирует по `sortOrder`, не по цене;
- мёртвый код ошибки `saas_billing_tariff_upgrade_proration_unavailable` остался в
  `api/clinic/billing/route.ts:79` и `PayTariffButton.tsx:31`; docstring `payableTariff.ts:33` всё
  ещё ссылается на удалённый `createProratedTariffUpgradeInvoice`;
- `DELETE` на `saas_billing_periods` у `app_platform_settings` — предсуществующий овергрант.

---

## 8. Ограничения этого аудита (честно)

1. **Миграция не проверена на данных, где бэкфилл реально что-то делает.** На DEV
   `saas_billing_subscriptions` пуста (0 строк), тарифов 4 и у всех `price_minor IS NOT NULL` —
   preflight показал `INSERT 0 4` и `UPDATE 0`, `UPDATE 0`. Значит **не проверены два сценария**,
   которые могут уронить миграцию на TEST/PROD:
   - подписка с `current_period_starts_at IS NOT NULL` на тарифе с `price_minor IS NULL` → строки
     цены нет, а `billing_period_code` проставится → нарушение составного FK;
   - `pending_tariff_id` на тарифе, у которого `billing_period IS NULL` → `pending_billing_period_code`
     останется NULL при не-NULL `pending_tariff_id` → нарушение CHECK-парности.

   Перед накатом на TEST исполнителю прогнать:
   ```sql
   SELECT count(*) FROM saas_billing_subscriptions s JOIN saas_tariffs t ON t.id = s.tariff_id
    WHERE s.current_period_starts_at IS NOT NULL AND t.price_minor IS NULL;
   SELECT count(*) FROM saas_billing_subscriptions s JOIN saas_tariffs t ON t.id = s.pending_tariff_id
    WHERE t.billing_period IS NULL;
   ```
   Оба должны дать 0.
2. **Живой клик-through не проводился.** Админский редактор периодов и матрица оценены чтением
   кода и схемы API, не в браузере: поднимать стенд при трёх красных гейтах и `42501` на записи
   бессмысленно — до экрана поведение всё равно не доедет.
3. **Full CI не гонялся** — §9 не даёт нового сигнала поверх трёх уже красных targeted-гейтов.
4. **Права доказаны на `bcb_webapp_dev`.** TEST не трогался. Артефакт
   `privileges.bersoncarebot_test.sql` в этих же местах отличается от DEV только именами
   миграторных логинов, поэтому вывод переносится, но живьём на TEST не проверялся.
5. **F-4 доказан на синтетической подписке**, созданной внутри той же откатываемой транзакции
   (на DEV реальных подписок нет). Сам FK и его `RESTRICT` — настоящие, из DDL кандидата.
6. Классы «неполная матрица» и «запланированная пара» остались **без зелёной защиты** (§5);
   я их не покрывал новыми тестами, потому что контракт уже написан в существующих файлах — их
   нужно починить, а не продублировать (§10b п.4).

---

## 9. Что я оставил в дереве

Только намеренное (§24.3):

- `docs/_TODO/runs/saas-period-grid-20260905/KILLSET.md` — слепой kill-set;
- `docs/_TODO/runs/saas-period-grid-20260905/AUDIT.md` — этот файл;
- `apps/webapp/src/modules/saas-billing/retiredBillingPeriod.unit.test.ts` — acceptance-тест F-5.

Продуктовый код **не менялся**: все четыре инъекции откачены, `git status` чист, регенерированные
артефакты привилегий возвращены (`git checkout`). Продуктовых фиксов, правок миграции, декларации
и документации я не делал; push не выполнялся.

**Handoff:** падающий acceptance-тест F-5 передаётся выбранному по §24.1 исполнителю как
фиксированный oracle. F-1/F-2/F-4/F-6/F-7/F-8 — нетестовые findings, требуют правок продукта и слоя
прав. Повторный слепой аудит нужен только новой поверхности (§24.5).
