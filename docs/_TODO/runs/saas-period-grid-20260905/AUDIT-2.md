# AUDIT-2 — SaaS global billing-period price grid (#1069), второй независимый аудит-live

| | |
|---|---|
| **Роль** | `auditor-live`, независим от обоих продуктовых воркеров (их отчёты — заявка, не доказательство) |
| **Кандидат** | `738a29c39` (HEAD на старте) на `wt/saas-period-grid` |
| **Аудируемая дельта** | `ddb2b92cb` (salvage фиксера) + `64641a616` (re-sync generated) поверх уже аудированного `c1e18607b` |
| **База сравнения** | `feat/doctor-ui-rebuild` = `bb7f91265` |
| **Слепой kill-set новой поверхности** | [`KILLSET-ADDENDUM.md`](KILLSET-ADDENDUM.md), коммит `4367201cc` — составлен ДО открытия реализации и тестов |
| **Переиспользован** | [`KILLSET.md`](KILLSET.md) для неизменённых поверхностей (§24.5) |
| **Дата** | 2026-09-05 |

## ВЕРДИКТ: ✅ **PASS** — кандидат land-ready

Все восемь findings первого аудита (`AUDIT.md`) закрыты и **перепроверены независимо против
реальности**, а не по отчёту исполнителя: три ранее красных механических гейта зелёные, живая
rollback-only интроспекция PostgreSQL показывает работоспособность каждой из трёх ролей на новых
колонках, и целевая инъекция поломки краснит именно то, что должна.

Достижимых нарушений решений владельца Т14 не найдено. Ниже — три findings **не блокирующего**
класса (покрытие тестами и предсуществующая архитектура слоя прав); ни одно из них не является
регрессией #1069, и ни одно не превращается мной в задачу (§24.6).

---

## 1. Что запускалось (точные команды и их вывод)

| # | Команда | Результат |
|---|---------|-----------|
| 1 | `node deploy/postgres/privileges/generate-cli.mjs --check` | ✅ 4/4 артефакта побайтно совпадают |
| 2 | `pnpm run check:drizzle-insert-surface` | ✅ **был FAIL** → `byte-identical to live Drizzle metadata (209 relations, 125 with a direct .insert())` |
| 3 | `pnpm run test:db-privileges` | ✅ **был FAIL** → `# tests 335 # pass 178 # fail 0 # skipped 157` |
| 4 | `pnpm --dir apps/webapp typecheck` | ✅ **было 64 ошибки** → `tsc --noEmit`, exit 0, 0 ошибок |
| 5 | `vitest run src/modules/saas-billing/ src/modules/org-entitlements/service.test.ts BillingSection.ui.test.tsx PayTariffButton.ui.test.tsx` | ✅ **было 75 падающих** → `Test Files 13 passed (13) · Tests 190 passed (190)` (188 кандидата + 2 моих) |
| 6 | `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` | ✅ `PASS`, `pending=1 total=118`, `BEGIN…ROLLBACK`, DEV не изменён |
| 7 | `eslint` по 7 затронутым путям (вкл. мой тест) | ✅ exit 0, 0 замечаний |
| 8 | `git diff --check feat/doctor-ui-rebuild...HEAD` | ✅ чисто |
| 9 | Живая rollback-only интроспекция + `SET ROLE` на `bcb_webapp_dev` | см. §2 |
| 10 | 6 целевых инъекций поломки | см. §4 |

Full CI не гонялся: §9 не даёт нового сигнала — все затронутые гейты зелёные на targeted-уровне,
кросс-пакетного риска не осталось (изменения целиком внутри `apps/webapp` + `deploy/postgres`).

---

## 2. Права БД — живое доказательство (rollback-only, `bcb_webapp_dev`, всё откачено)

Метод: в ОДНОЙ транзакции созданы объекты кандидата (таблица и колонки — DDL самой миграции),
применены **дословно строки собственного сгенерированного артефакта кандидата**
`privileges.bcb_webapp_dev.sql` (строки 17403-17408, 17534-17551, 17902-17909), затем
`has_column_privilege` / `has_table_privilege` и реальные `SET LOCAL ROLE` + попытки записи;
`ROLLBACK`. Текст SQL нигде не проверялся (§10a «Как НЕ надо» п.5).

### 2.1 ✅ F-1 ЗАКРЫТ — было 12/12 `false`, стало рабочим

```
         role          |             col             | ins | upd
-----------------------+-----------------------------+-----+-----
 app_clinic_billing    | billing_period_code         | t   | t
 app_clinic_billing    | pending_billing_period_code | t   | t
 app_platform_settings | billing_period_code         | t   | t
 app_platform_settings | pending_billing_period_code | t   | t
 app_worker            | billing_period_code         | f   | t
 app_worker            | pending_billing_period_code | f   | t
```

Живое исполнение под ролью (каждая попытка в своём SAVEPOINT) — три записи, падавшие `42501`:

```
E1 SET ROLE app_clinic_billing;    UPDATE … SET billing_period_code='month'         -> УСПЕХ
E2 SET ROLE app_platform_settings; UPDATE … SET pending_billing_period_code='month' -> УСПЕХ
E3 SET ROLE app_worker;            UPDATE … SET billing_period_code='month'         -> УСПЕХ
```

`app_worker` без INSERT — и правильно: воркер подписки не создаёт, только рассчитывает
(settlement/promotion). Грант **уже** сужен, а не выдан «на всякий случай».

### 2.2 ✅ F-2/F-3 ЗАКРЫТЫ — и закрыты именно способом из brief, без broad direct read

```
worker_prices_select | worker_periods_select | seam_prices_table | seam_price_minor | seam_months
----------------------+-----------------------+-------------------+------------------+-------------
 f                    | f                     | f                 | t               | t

E4 CONTROL: SET ROLE app_worker; SELECT count(*) FROM saas_tariff_period_prices
   -> ERROR: permission denied for table saas_tariff_period_prices
```

Воркеру НЕ выдан ни широкий SELECT на матрицу цен, ни на каталог периодов, ни execute на
клиничий корень каталога. Вместо этого due-корень `app.list_saas_billing_subscriptions_due_for_renewal`
(владелец `app_seam_org_commerce_owner`, колоночный SELECT ровно на `months` и `price_minor`)
теперь сам отдаёт `billingPeriodMonths` и `billingPeriodPriceMinor` доверенными.

Проверено, что это не только в декларации, но и в коде:
- `service.ts:929-933` — `paidPeriodEndsAtForCode(..., new Map([[subscription.billingPeriod, subscription.billingPeriodMonths]]))`, вызова `listBillingPeriods()` в цикле продления НЕТ;
- `service.ts:967` — `tariffPriceMinor: subscription.billingPeriodPriceMinor` передаётся вниз;
- `pgSaasBilling.ts:1976` — `createSaasBillingRenewalInvoiceIfAbsent` БОЛЬШЕ не читает `saasTariffPeriodPrices`, цена берётся из `input.tariffPriceMinor`;
- оставшиеся два вызова `paidPeriodEndsAtForBillingCode` — `createManualSaasBillingInvoice` (платформа) и `createOwnTariffRenewalInvoice` (клиника); машинного тика среди них нет.

Сумма по-прежнему выводится на сервере: клиент называет только пару `{tariffId, billingPeriodCode}`.

### 2.3 ✅ F-4 / G5 ЗАКРЫТЫ — DELETE снят, запись стала недеструктивной

```
         role          |               tbl                | del
-----------------------+----------------------------------+-----
 app_platform_settings | public.saas_billing_periods      | f
 app_platform_settings | public.saas_tariff_period_prices | f
 (и f у app_clinic_billing / app_staff / app_worker на обеих)

E5 CONTROL: SET ROLE app_platform_settings; DELETE FROM saas_tariff_period_prices
   -> ERROR: permission denied for table saas_tariff_period_prices
```

`writeTariffPeriodPrices` (`pgPlatformEntitlements.ts:243`) — чистый
`insert(...).onConflictDoUpdate({target:[tariffId,billingPeriodCode], set:{priceMinor, discountedPriceMinor, updatedAt}})`.
Full-replace `DELETE … WHERE tariff_id = …` удалён, поэтому `RESTRICT`-FK больше не может
запереть тариф с платящей клиникой. `grep -rn "delete(saasTariffPeriodPrices)|delete(saasBillingPeriods)"`
по `apps/webapp/src` → **NONE**. Заодно снят и предсуществовавший овергрант DELETE на
`saas_billing_periods` — поверхность **сужена**, а не расширена.

### 2.4 Матрица требований brief против факта

| Требование | Факт | Вердикт |
|---|---|---|
| platform: periods/prices SELECT+INSERT+UPDATE, **без DELETE** | ровно так (артефакт 17405, 17905) | ✅ |
| clinic billing: читать активные тарифы/периоды/цену, писать пару через существующий chokepoint | SELECT табличный + колоночные INSERT/UPDATE обеих колонок пары | ✅ |
| worker: доверенные месяцы/цена для продления **без broad read**, UPDATE пары для settlement | ровно так: 0 прямых чтений, UPDATE есть | ✅ |
| корни-владельцы — ровно трогаемые колонки | `app_seam_org_commerce_owner` — колоночный SELECT `(code,months)` и `(tariff_id,billing_period_code,price_minor)`; мед./кросс-арендных расширений нет | ✅ |
| глобальный админ — через отдельный пул/членство | без изменений (G10 опровергнут ещё первым аудитом) | ✅ |

---

## 3. Миграция (гейт 4) — разбор прав по §1, БЕЗ применения

Файл: `20260905T120000_one_global_billing_period_price_matrix.sql` (529 строк), **один**
timestamp-forward файл, он же последний по времени; второй файл на ту же трансформацию не заведён.

- **Запрет прав соблюдён.** `grep -nE "\b(GRANT|REVOKE|CREATE +ROLE|ALTER +ROLE|DROP +ROLE|CREATE +POLICY|ALTER +POLICY|DROP +POLICY|ALTER +DEFAULT +PRIVILEGES)\b"` → **0 совпадений**. ✅ (Т14 п.6, §1)
- **Контракт файла:** имя `YYYYMMDDTHHMMSS_slug`, `BCB-MIGRATION-OWNER` на каждом из 6 блоков
  (`app_object_owner` ×2, `BCB-MIGRATION-BACKFILL`, `app_seam_org_commerce_owner` ×2,
  `app_seam_specialist_provision_owner` ×2), verify-probe в шапке, `postgres` в owner-маркерах нет. ✅
- **Бэкфилл ничего не выдумывает:** `INSERT … SELECT id, billing_period, price_minor, discounted_price_minor FROM saas_tariffs WHERE price_minor IS NOT NULL` + `ON CONFLICT DO NOTHING`; ни умножения на месяцы, ни дефолтного периода. ✅
- **Оба сценария из §8 первого аудита ЗАКРЫТЫ в самом SQL** (это и была главная просьба):
  - (a) подписка на тарифе без легаси-цены больше не получает `billing_period_code` — стоит `AND EXISTS (SELECT 1 FROM saas_tariff_period_prices …)`, поэтому составной FK не нарушается;
  - (b) `pending_tariff_id` без выводимого периода очищается в `NULL`, поэтому CHECK-парность не нарушается.
- **История и составные ограничения:** FK на пару `ON DELETE RESTRICT` (MATCH SIMPLE — намеренно пропускает пред-первую-оплату), CHECK `(pending_tariff_id IS NULL) = (pending_billing_period_code IS NULL)`, PK `(tariff_id, billing_period_code)`, CHECK неотрицательности цены и скидки, обратный индекс `(billing_period_code, tariff_id)` — ровно тот, которым идёт проверка полноты при активации периода (§1 «индекс в том же PR»). ✅
- **Preflight:** owner-aware, rollback-only, против **named DEV** (`bcb_webapp_dev`); TEST/PROD и disposable не трогались. `PASS`, `pending=1 total=118`, `ROLLBACK`.

**⚠️ Единственная оговорка к накату (не блокер, но измерить перед TEST/PROD).** Шаг (b) —
`UPDATE saas_billing_subscriptions SET pending_tariff_id = NULL WHERE pending_tariff_id IS NOT NULL
AND pending_billing_period_code IS NULL` — это **удаление факта**: запланированная клиникой смена
тарифа пропадает. На DEV это ноль строк (замерено), но решение «уронить запланированную смену
вместо того, чтобы нарушить CHECK» принадлежит владельцу. Перед накатом на TEST/PROD:

```sql
SELECT count(*) FROM saas_billing_subscriptions s JOIN saas_tariffs t ON t.id = s.pending_tariff_id
 WHERE t.billing_period IS NULL OR t.price_minor IS NULL;   -- сколько плановых смен будет стёрто
SELECT count(*) FROM saas_billing_subscriptions s JOIN saas_tariffs t ON t.id = s.tariff_id
 WHERE s.current_period_starts_at IS NOT NULL AND t.price_minor IS NULL;  -- сколько подписок останутся без пары
```

Замер на DEV сейчас: `subscriptions_total=0 · scenario_a=0 · scenario_b=0 · tariffs_active=4 ·
tariffs_with_legacy_price=4`. То есть на DEV бэкфилл по-прежнему проверен только вхолостую.

---

## 4. Инъекции поломки — «что сломано → что покраснело»

Шесть инъекций, каждая в своём классе. **Все откачены, продуктовое дерево чистое.**

| # | Что сломано | Что покраснело | Итог |
|---|---|---|---|
| A | `assertCompleteTariffPeriodPriceMatrix` перестал отвергать НЕПОЛНУЮ матрицу | 180 passed → **180 passed** | ⛔ **НЕ ПОЙМАНО** |
| B | `purchasedTariffPeriodPair` игнорирует ЗАПЛАНИРОВАННУЮ пару (счёт по старой) | **2 failed / 178 passed** | ✅ ПОЙМАНО *(в первом аудите — НЕ ловилось)* |
| C | отмена перестала гасить autopay-согласие | 180 passed → **180 passed** | ⛔ НЕ ПОЙМАНО *(практического эффекта нет: due-корень уже исключает отменённые)* |
| D | снят гейт «снятый период не продаётся» (обе двери) | **1 failed** — `retiredBillingPeriod.unit.test.ts` | ✅ ПОЙМАНО |
| E | отменённая подписка остаётся due для продления | 180 passed → **180 passed** | ⛔ **НЕ ПОЙМАНО** → закрыто моим тестом, см. §5 |
| F | `assertCompleteTariffPeriodPriceMatrix` принимает ОТРИЦАТЕЛЬНУЮ цену | 180 passed → **180 passed** | ⛔ НЕ ПОЙМАНО *(бэкстоп — CHECK в БД, отказ громкий)* |

Оба класса, не ловившиеся в первом аудите (неполная матрица, запланированная пара), проверены
заново: **пара теперь защищена** (B), **полнота матрицы — нет** (A) → finding N-1.

---

## 5. Что я добавил в дерево (единственный тест, разрешённый brief)

`apps/webapp/src/modules/saas-billing/service.test.ts` — блок
`describe('Т14 п.3: отмена гасит продление и не трогает оплаченный доступ')`, 2 теста.

- **Почему тест, а не «взгляд»** (§24.4): повторяемое поведение денежного цикла, не разовое состояние.
- **Почему он оправдан:** инъекция E доказала, что центральную новую гарантию этапа — «отмена гасит
  будущее продление» (Т14 п.3) — не ловил НИ ОДИН существующий тест (180/180 зелёные при поломке).
  Отказ дорогой (счёт и автосписание после отмены) и молчаливый (тик отчитывается успехом).
- **Самый дешёвый публичный слой:** `runDueSaasBillingRenewals` поверх настоящего
  `createInMemorySaasBillingRepository` — единственный уровень, где виден реальный due-фильтр
  (в проде тот же фильтр `cancelled_at IS NULL` стоит в корне из этой миграции).
- **Оракул — деньги и доступ**, не текст: счёт не выставлен (`dueCount:0, created:0`, длина списка
  инвойсов не изменилась) и `currentPeriodEndsAt` остался `2026-08-01` (оплаченное не отобрано).
- **Переиспользование, не дубль** (§10b, §11): взяты существующие `paidPeriodScenario()` и
  `seedCurrentPaidPeriod()` из того же файла; нового файла и новой фикстуры не заведено.
- **Инъекция один раз, как требует brief:** снят `!cancelledAtBySubscriptionId.has(row.id)` в фейке
  → `AssertionError: expected { dueCount: 1, created: 1 } to match object { dueCount: +0, created: +0 }`.
  Контрольный тест («БЕЗ отмены тот же тик счёт выставляет») при этом остался зелёным — тест не вакуумный.
  Инъекция откачена.

---

## 6. Findings (ни одно не блокирует land; ни одно не является регрессией #1069)

### N-1 🟠 major — гарантия «полная матрица цена×период» не защищена ничем на пути СОХРАНЕНИЯ тарифа

`assertCompleteTariffPeriodPriceMatrix` (`billingPeriodCatalog.ts:32`) — единственная функция,
реализующая отказы из Т14 п.2 (дубль / неизвестный код / отрицательная цена / отрицательная скидка /
неполнота). **Ни одна из пяти её проверок не покрыта тестом** (инъекции A и F выжили).

Четыре из пяти подстрахованы БД (PK, FK, два CHECK) — их нарушение будет громким. **Пятая,
«неполнота», кросс-строчная и бэкстопа не имеет.** Достижимый сценарий: активный тариф сохраняется
с дырой на выбираемый период → `listActiveTariffChoices` (он ведётся строками цен) просто не
показывает этот период клиникам данного тарифа → **разные тарифы показывают разные лестницы
периодов**, ровно то, что Т14 п.2 запрещает дословно. Молчаливо: ничего не падает.

Смягчающее: путь **активации периода** защищён отдельно и авторитетно — `setBillingPeriodSelectable`
(`pgPlatformEntitlements.ts:599-631`) пересчитывает `missing` внутри транзакции против
`FOR UPDATE`-залоченной строки. Дыра только на пути сохранения тарифа.

Я тест не писал: brief разрешил один тест и только под новое поведение отмены, а класс «неполная
матрица» стоял без защиты ещё в первом аудите (§8 п.6) и не является поломкой этой дельты.

### N-2 🟡 minor — docstring обещает один общий проход, которого нет (§5)

`billingPeriodCatalog.ts:26-30` дословно: «Called by BOTH the write path (`createTariff`/`updateTariff`)
and the completeness gate a period activation runs, so the two can never silently disagree on what
"complete" means». **Фактически гейт активации её не зовёт**: полнота считается ТРИЖДЫ и тремя
разными кусками кода — `assertCompleteTariffPeriodPriceMatrix`, инлайн-`missing` в
`org-entitlements/service.ts:750-752` и SQL-`NOT EXISTS` в `pgPlatformEntitlements.ts:614-626`.
Сегодня все три согласны, поэтому это не денежный баг — но следующий агент, прочитав docstring,
будет уверен, что дверь одна. Первый аудит отмечал это как recommendation; сохранилось.

### N-3 🟠 major, ПРЕДСУЩЕСТВУЕТ — «одна исполняемая декларация»: структурно да, по-человечески нет

Ответ на прямой вопрос brief, механикой, а не эстетикой числа файлов.

**Что выполнено (проверено командами):** `generate-cli.mjs` читает РОВНО одну авторитетность —
`DEFAULT_DECLARATION = ./declaration.ts`; всё остальное импортируется в неё. Сгенерированный SQL —
только вывод и сверяется побайтно (`--check` → 4/4). Миграция не несёт ни одного GRANT/REVOKE/ROLE/POLICY.
`drizzle-insert-surface.ts` — машинный артефакт с отказом при расхождении
(`byte-identical to live Drizzle metadata`), то есть допустимый по brief производный инвентарь.
**По букве решения владельца 6 требование выполнено.**

**Что НЕ выполнено:** решения «кто какие колонки пишет» ведутся РУКОЙ в двух картах сразу:

```
REV10_CLINICAL_ACCESS (relation-access.ts):  156 отношений, 154 с грантами, 659 рукописных grant-строк
REV10_SYSTEM_DIRECT_ACCESS (declaration.ts):  66 отношений
объявлены в ОБЕИХ картах:                     51 отношение
```

Для этих 51 генератор их **объединяет** (`declaration.ts:8131` —
`grants: [...clinical.grants, ...systemDirect.grants]`), а не сверяет. Следствия, измеренные:

1. **Объединение умеет молча расширять.** Найдено 1 живое расхождение по ширине:
   `public.operator_health_failure_archive :: app_staff :: INSERT` — `declaration.ts` даёт
   ТАБЛИЧНЫЙ грант, `relation-access.ts` намеренно сужает до 8 колонок; побеждает табличный.
2. **Механического отказа за непокрытие колонок UPDATE/SELECT нет.** `assertNoUndeclaredRuntimeSurface`
   (`access-census.mjs:85`) сверяет декларацию саму с собой и наличие callsite — но не то, что
   рантайм-путь пишет колонку, которой нет в гранте. Мехвывод есть **только для INSERT**
   (`withDrizzleInsertColumns`, `declaration.ts:8094`).

Это и есть механика F-1: автор правил `declaration.ts` (где живут НОВЫЕ таблицы), а колоночные
гранты подписки живут в `relation-access.ts` — и ничто не отказало. Фиксер закрыл дыру тем же
способом — правкой руками во втором файле.

**Почему это НЕ блокер и почему я не завожу из этого работу (§24.6):** (а) слияние файлов саму
поломку не предотвратило бы — единый 30-тысячестрочный файл имеет ровно ту же неполноту;
предотвращает её мехвывод/отказ для UPDATE-колонок, которого нет; (б) свойство предсуществует,
#1069 его не вносил и не ухудшал — наоборот, сузил поверхность на два DELETE-овергранта;
(в) строчки «сделать вывод UPDATE-колонок механическим» в план-файле владельца нет, поэтому это
**вопрос владельцу, а не задача аудита**.

### N-4 🟡 minor — оракулы формы UI в изменённых тест-файлах (гейт 3)

Точная команда и счёт:
`grep -nE "toHaveTextContent|toBeDisabled|toBeInTheDocument|toHaveLength|toHaveClass|toHaveStyle|toHaveAttribute" PayTariffButton.ui.test.tsx BillingSection.ui.test.tsx`
→ **18 строк**. Из них по классу brief («точный текст UI, число/порядок/наличие контролов»):

- `PayTariffButton.ui.test.tsx:49` — `toHaveTextContent('Выберите тариф')` — точный текст;
- `:50/:56/:86/:105` — `toBeDisabled()` / `not.toBeDisabled()` — состояние контрола;
- `:179/:180` — `getByText('Тариф бесплатный — платить нечего.')`, `queryByRole(...).not.toBeInTheDocument()`;
- `BillingSection.ui.test.tsx:120/121/122/157/158/198/199/200/201/214` — наличие узлов и точные
  строки, включая форматирование чисел (`'1 из 4'`, `'8.0 МБ из 10.0 МБ'`).

Тест `PayTariffButton › показывает выбор тарифа до первого выбора` целиком состоит из таких
оракулов: денежного/доступного/API side effect в нём нет.

**Существенное измерение — кандидат не добавил НИ ОДНОГО из них:**
`git diff bb7f91265...HEAD -- <оба файла> | grep '^+' | grep -E "toHaveTextContent|toBeDisabled|toBeInTheDocument|toHaveClass|toHaveStyle|getByText"` → **пусто, во всём диапазоне #1069**.
Все 18 — предсуществующие, кандидат обновил только фикстуры под новую форму пропсов.

Что кандидат В ЭТОМ месте сделал ПРАВИЛЬНО: заменил `getByRole('combobox')` на
`getByRole('combobox', { name: 'Тариф' })` — accessible name как несущий селектор вместо запроса
по счёту/позиции, ровно как требует brief. Валидный оракул рядом тоже на месте:
`BillingSection.ui.test.tsx:69` проверяет тело PATCH-запроса
(`{tariffId:'small', billingPeriodCode:'monthly'}`) — это API side effect, не форма.

Удалять чужие тесты я как аудитор не стал (прямой запрет brief). Решение «вычистить эти оракулы» —
владельца: это предсуществующая практика двух экранов, а не поломка #1069.

---

## 7. Kill-set: что закрыто и чем

### Дельта (KILLSET-ADDENDUM)

| ID | Итог | Доказательство |
|---|---|---|
| N1 отмена недостижима | ✅ закрыт | `BillingSection.tsx:113` рендерит `CancelSubscriptionButton`, тот шлёт `PATCH /api/clinic/billing {action:'cancel_subscription'}` |
| N2 чужая клиника | ✅ закрыт | `organizationId` берётся из `gate.ctx.organizationId` (сессия), из тела запроса не читается вовсе |
| N3 обрезает доступ | ✅ закрыт | репозиторий пишет только `cancelled_at`+`updated_at`; мой тест проверяет сохранение `currentPeriodEndsAt` |
| N4 не гасит продление | ✅ закрыт | `cancelled_at IS NULL` в due-корне миграции + **мой тест** (инъекция E краснит) |
| N5 неидемпотентна | ✅ закрыт | повтор → `already_cancelled`; UPDATE под `isNull(cancelledAt)`, границу не переписывает |
| N6 pending переживает отмену | ✅ не достижимо | due-корень исключает отменённые, промоушен идёт только из due-цикла |
| N7 нет гранта на `cancelled_at` | ✅ закрыт | `cancelled_at` в колоночном UPDATE `app_clinic_billing` (артефакт 17536) |
| N8 не тот, кто вправе | ✅ закрыт | `requireBillingManager()` → только `membershipRole` `owner`/`admin`, иначе 403 |
| N9 оракул формы в UI-тесте | ⚠️ finding N-4 | кандидатом не добавлено ни одного |
| P1/P2 расщеплённая авторитетность | ⚠️ finding N-3 | §6 |
| P3 артефакты разошлись | ✅ | `--check` 4/4 |
| P4/P5 колонки и матрица | ✅ | §2.1, §2.2 |
| P6 овергрант вместо узкого | ✅ | воркер без broad read; DELETE снят |
| P7 корни шире тел | ✅ | колоночные SELECT ровно по спискам тел |
| P8 регрессия соседей | ✅ | дифф артефакта вне #1069-таблиц пуст |
| Q1-Q2 деструктивная запись / потеря правки | ✅ | чистый upsert с `DO UPDATE` |
| Q3 удаление ненужных пар | ✅ по построению | «убрать цену» не операция: все выбираемые периоды обязаны быть оценены, снятые хранятся ради истории |
| Q4 дубли пар | ✅ | PK `(tariff_id, billing_period_code)` |
| Q5 DELETE-овергрант | ✅ закрыт | §2.3 |
| R1 клиничья дверь | ✅ закрыт | инъекция D краснит `retiredBillingPeriod.unit.test.ts` |
| R2 админская дверь | ✅ закрыт | единственный внешний вызов (`pgPlatformEntitlements.ts:767`) периода НЕ передаёт → фолбэк `requireActiveTariff` фильтрует `isSelectable=true` |
| R3 две двери, два ответа | ✅ | `listActiveTariffChoices` — один канонический вход (фильтр `isSelectable === true`), плюс перекрёстная сверка в сервисе |
| R4 снятие рвёт продление платящему | ✅ | ветка «текущая пара» намеренно освобождена от проверки; цена снятого периода жива |
| S1-S3, S5 миграция | ✅ | §3 |
| S4 два сценария данных | ✅ закрыт в SQL | §3, оба `EXISTS`-guard'а |
| T1 удалено валидное | ✅ опровергнут | §8 |
| T2 запрещённый оракул | ⚠️ finding N-4 | — |
| T3 тест подогнан под код | ✅ опровергнут | инъекции B и D краснят именно те тесты |
| T4 фейк разошёлся с pg | ✅ | инъекция E доказала, что фейк несёт настоящий due-фильтр (тот же, что в SQL-корне) |

### Базовый KILLSET — перепроверено выборочно, расхождений с первым аудитом нет
A1/A2/A4, B2/B3/B4/B7, C1/C2/C4, D1/D2/D3, E1/E5/E6, F1/F2/F3/F5/F6, G7/G9/G10, H2/H3 —
подтверждены как СДЕЛАННЫЕ ПРАВИЛЬНО ещё первым аудитом; на текущем HEAD перепроверены D1/D3/C4
(`grep` по всему `apps/webapp/src`: `refundSaasBillingInvoice`, `reserveSaasBillingRefund`,
`createProratedTariffUpgrade*` встречаются **только в комментариях**, ни одной живой ссылки;
каталога маршрута возврата SaaS нет; пациентские возвраты `modules/payments` и
`booking-engine/…/package/refund` на месте и не тронуты).

---

## 8. Гейт 3 — что удалено из тестов и было ли это законно

Команда:
`git show ddb2b92cb -- .../saas-billing/service.test.ts .../org-entitlements/service.test.ts | grep -E "^-\s*(it|test|describe)\("` → **24 удалённых**, `grep -E "^\+\s*(it|describe)\("` → **5 добавленных**.

- **4 «подозрительных» удаления оказались переносом, а не потерей** — те же имена добавлены обратно
  с новой сигнатурой: `refuses to SAVE a tariff without a specialist seat count`,
  `refuses a numeric quota on any critical mechanic (no number)`,
  `refuses a notification row whose templateId names no template on the tariff`,
  `refuses a negative discounted price instead of silently clamping it`.
- **1 замена по модели:** `refuses createTariff when billingPeriod is not selectable` →
  `refuses createTariff when a periodPrices row names a period that is not selectable in the catalog`
  (цена переехала из поля тарифа в матрицу).
- **Все остальные 19 лежали внутри отменённых владельцем блоков** — проверено сопоставлением с
  родительским коммитом: `describe('Р-14: immediate paid upgrade')`,
  `describe('Fiscalized SaaS refunds')`, `describe('B0.3/#1057: повторный апгрейд …')`,
  `describe('#1057: open upgrade invoice scoped to target tariff')`. Сюда попали и три
  идемпотентных теста про переоткрытие заказа, и «charges the next full period at the new price…»,
  и «keeps the old snapshot until capture…» — все они были детьми `Р-14: immediate paid upgrade`,
  то есть ушли вместе с отменённой Т14 п.3 механикой, а не сами по себе.
- **Денежные/граничные гарантии остались:** блокировка даунгрейда покрыта пятью тестами, включая
  проверку на границе продления (`service.test.ts:1026`, ожидание
  `errors:[{error:'saas_billing_tariff_downgrade_blocked'}]`) и сохранение обеих дат оплаченного
  периода при запланированном даунгрейде (`:630`). Идемпотентность тика жива
  (`К5: повторный тик … не выставляет второй счёт`). `proration.test.ts` (Р-15, места) не тронут.

**Вывод гейта 3: удалено ровно отменённое; валидные денежные/идемпотентные/продленческие/граничные
гарантии на месте.** Единственная претензия — оракулы формы UI (N-4), и их кандидат не добавлял.

---

## 9. Ограничения этого аудита (честно)

1. **Живой клик-through не проводился.** Кнопка отмены и админский редактор матрицы проверены
   чтением кода, схемы API и тестами, не в браузере. Это остаётся за приёмкой владельца
   (§«Приёмка владельца В СЕРЕДИНЕ плана»); «готово» = его живая проверка, не мой PASS.
2. **Права доказаны на `bcb_webapp_dev`.** TEST не трогался. Артефакт
   `privileges.bersoncarebot_test.sql` в этих местах отличается от DEV только именами миграторных
   логинов (побайтно сверено `--check`), поэтому вывод переносится — но живьём на TEST не проверялся.
3. **Бэкфилл по-прежнему проверен вхолостую:** на DEV 0 подписок, оба рисковых сценария = 0.
   Гарантия теперь в самом SQL (`EXISTS`-guard'ы), а не в свойствах данных, — но строка,
   очищающая `pending_tariff_id`, на непустых данных удалит факт; замер перед TEST/PROD в §3.
4. **Full CI не гонялся** — §9 не даёт нового сигнала поверх зелёных targeted-гейтов; изменения не
   выходят за `apps/webapp` + `deploy/postgres`.
5. **N-3 доказан на структуре и на одном живом расхождении ширины**, а не исчерпывающим перебором
   всех 51 пересекающихся отношений на предмет неполноты.

---

## 10. Что я оставил в дереве

- `docs/_TODO/runs/saas-period-grid-20260905/KILLSET-ADDENDUM.md` — слепой kill-set (коммит `4367201cc`, до чтения кода);
- `docs/_TODO/runs/saas-period-grid-20260905/AUDIT-2.md` — этот файл;
- `apps/webapp/src/modules/saas-billing/service.test.ts` — блок из 2 acceptance-тестов (§5).

**Продуктовый код, миграция, декларация прав и сгенерированные артефакты НЕ менялись.** Все шесть
инъекций откачены; после отката прогнаны заново `vitest` (190 passed) и `typecheck` (0 ошибок).
Push, land, деплой и накат миграций не выполнялись.

**Handoff:** блокеров нет. На стол владельцу — три решения: (1) убирать ли оракулы формы UI на двух
экранах (N-4); (2) заводить ли механический вывод/отказ для UPDATE-колонок в слое прав (N-3);
(3) достаточно ли гейта активации периода, или нужен тест на полноту матрицы при сохранении
тарифа (N-1). Ни одно из трёх я в работу не превращал.
