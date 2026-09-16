# Повторный адверсарный аудит: перевыставление счёта за место — три находки закрыты?

**Ветка:** `wt/invoice-reissue-20260819` @ `5bee02a50` · **Фиксер-коммиты:** `d419ad3f1`, `5fab9b2ec` ·
**Вход:** `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` (строка ветки), первый аудит
`docs/REPORTS/INVOICE_REISSUE_AUDIT_2026-08-19.md` (FAIL), фикс-отчёт
`docs/REPORTS/INVOICE_REISSUE_FIX_2026-08-19.md`. **Среда:** DEV (`bcb_webapp_dev`), ПРОД не открывался.

## ВЕРДИКТ: PASS по всем трём находкам, с одним неснятым операционным блокером вне скоупа этой ветки

Ф1, Ф2, Ф3 доказаны прогоном против живого PostgreSQL и целевыми инъекциями, а не чтением диффа. Все
инъекции откатились, база восстановлена в точности до состояния на момент старта (см. «Как оставлена
база»). Один блокер остаётся: **runtime-роли на DEV до сих пор не имеют прав писать новые колонки и
звать новый шов** (reconcile прав не запускался) — тот же пробел, что фиксер сам назвал в НЕ СДЕЛАНО
своего отчёта 19.08, и он всё ещё не закрыт. Из-за него нельзя прогнать Ф2 через настоящий HTTP-путь
живой ролью; денежная логика доказана прогоном шва и инъекцией против TypeScript-комбинатора, но не
сквозным вызовом `pgSaasBilling` под `app_clinic_billing`.

**Важное наблюдение, не находка против этой ветки.** На момент старта аудита (значительно позже фикса
19.08) миграция на DEV **уже не была применена** — леджер не нёс тега ветки, колонок не было. То есть
между `5fab9b2ec` (23:51 19.08) и стартом этого аудита DEV потерял применённую миграцию — скорее всего
из-за общего обновления/сброса dev-базы (см. «Что оказалось»). Раздельно: пока шёл этот аудит, соседний
воркер `wt/migration-timestamp-20260819` (`run-id fix-migtime-20260820`, живой процесс, роль `dev-lead`)
переименовал файл миграции ЭТОЙ ветки прямо в рабочем дереве (`git status` показал staged rename
`0050_a_seat_invoice_is_not_cancelled_it_is_reissued.sql` →
`20260819T204355_a_seat_invoice_is_not_cancelled_it_is_reissued.sql`) — это чужая, ещё не закоммиченная
правка, я её не трогал и не коммитил. Это живое подтверждение, что коллизия «два разных файла с
префиксом 0050» (её ловил Ф1 первого аудита) — не выдумка, а актуальная проблема, которую сейчас чинят
отдельным потоком; тег-идентичность мигратора (`migration-order.mjs`) пережила переименование без единой
запинки, что и является предметом проверки ниже.

---

## Ф1 — миграция доезжает до DEV. PASS

### Что оказалось

На старте `SELECT max(created_at) FROM drizzle.__drizzle_migrations` = `1800000070000`, тег
`0050_the_transcode_queue_dispatcher_had_no_door` (ЧУЖАЯ миграция другой уже влитой ветки, тоже
пронумерованная 0050). Колонок `carried_debt_minor` / `superseded_by_invoice_id` на таблице не было.
То есть ровно то состояние, которое аудит 19.08 описывал как блокер, — снова живое, но по ДРУГОЙ
причине: не watermark-коллизия (тот механизм закрыт `migration-order-20260819`), а сам факт, что
DEV — общий, часто обновляемый ресурс, и миграция незалитой ветки на нём не держится сама по себе.

### Чем доказано (прогон, не чтение)

Холостой прогон (ROLLBACK):
```
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev \
    --migrator bcb_dev_migrator --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres --rollback-only
...
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=1 total=52 reapplied=0 foreign-ledger-rows=5
```
Никакой ошибки разбора (`BCB-MIGRATION-OWNER` у каждой инструкции — на месте), никакой коллизии слотов.

Реальное применение:
```
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev \
    --migrator bcb_dev_migrator --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres
...
Drizzle owner-ordered migration committed for "bcb_webapp_dev": pending=1 total=52 reapplied=0 foreign-ledger-rows=5
```
Живая проверка:
```
$ psql ... -c "SELECT created_at, tag FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1;"
1800000071000|20260819T204355_a_seat_invoice_is_not_cancelled_it_is_reissued
$ psql ... -c "SELECT id, carried_debt_minor, superseded_by_invoice_id FROM public.saas_billing_invoices LIMIT 1;"
 a0000001-…| 0 | (было ERROR: column does not exist)
$ psql ... -c "SELECT conname FROM pg_constraint WHERE conrelid='public.saas_billing_invoices'::regclass AND contype='c';"
saas_billing_invoices_carried_debt_check
saas_billing_invoices_seat_void_has_successor_check
saas_billing_invoices_superseded_is_void_check
... (+ существовавшие)
$ psql ... -c "SELECT proname, pg_get_userbyid(proowner) FROM pg_proc WHERE proname='release_carried_seat_debt';"
release_carried_seat_debt|app_seam_org_commerce_owner
```

**Повтор отвечает «нечего применять» (идемпотентность):**
```
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator \
    --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=52 verified-objects=81 foreign-ledger-rows=5
```

**§1, права в миграции:**
```
$ grep -Ein "grant|revoke|create role|alter role|alter default privileges|create policy" 20260819T204355_...sql
(пусто)
```

**`generate-cli --check`:**
```
$ node deploy/postgres/privileges/generate-cli.mjs --check
ok bcb_webapp_dev/privileges: … совпадает побайтно
ok bcb_webapp_dev/allowlist: … совпадает побайтно
ok bersoncarebot_test/privileges: … совпадает побайтно
ok bersoncarebot_test/allowlist: … совпадает побайтно
```

**Независимая проверка идемпотентности юнит-тестом** (fake-postgres, не эта ветка, но тот же
механизм): `deploy/postgres/privileges/migrate-local.test.mjs` — `'a ledger that names every migration
reports itself current and touches nothing'` — зелёный, `node --test` 20/20 pass.

### Что удаление записи из `meta/_journal.json` значит для двух баз (прямой вопрос миссии)

Журнал больше НЕ участвует в выборе pending (`migration-order.mjs`, порядок = имя файла, применённость =
тег в леджере). Он используется только ОДИН раз — разметить строки леджера, ЗАПИСАННЫЕ ДО появления
колонки `tag` (легаси). Наша миграция никогда не применялась ни на одной из баз до тега, поэтому:
- **на TEST**, где миграции ещё нет вовсе: удаление записи не меняет ничего — файла с этим `when` в
  журнале и не было бы в игре, отбор идёт по тегу файла;
- **на DEV**, где слот `when=1800000052000` занят ЧУЖОЙ миграцией без тега: если бы запись осталась,
  разметка (однократная, по `created_at`) присвоила бы наш тег чужой строке — та слот и заняла первой.
  Это не «потеря», а именно то, что убрали: без записи в журнале чужая строка размечается (если вообще
  размечается) из СВОЕЙ исторической записи, если такая есть, а не из нашей.

Проверено не чтением, а прогоном выше: `foreign-ledger-rows=5` — пять строк леджера, которые эта ветка
не может назвать по тегу (чужая работа), и они не мешают и не участвуют в pending. Дыры не возникает.

### PASS с оговоркой

Мигратор больше не «молчит» и не «размечает не то». Но у DEV нет памяти между сессиями других
воркеров: применённая, но не влитая в `feat` миграция может исчезнуть (наблюдалось прямо на старте этого
аудита). Это не дефект миграции 0050 и не новый скоуп — вопрос ведущему ниже.

---

## Ф2 — оплата по счёту, погашенному преемником, не выбрасывается. PASS

### Прогон против живого PostgreSQL (в транзакции, ROLLBACK)

Приняты фикстуры первого аудита (`org=a0000000-…-001`, тариф `СТАРТ`). Тело шва взято `pg_get_functiondef`
из каталога, скопировано под другим именем, снята только строка `require_attested_context_for_roles`
(конструкция принудительно проверяет, что снятие строки гейта не осталось незамеченным — иначе
исключение). Арифметика и цепочка преемников — те, что реально лежат в базе, не переписаны заново.

```
--- 0. до оплаты: преемник несёт долг 150000 сверху тарифа 80000 = 230000 ---
 id=222… | status=draft | amount_minor=230000 | carried_debt_minor=150000

--- 1. провайдер подтверждает оплату СТАРОГО (void-с-преемником) счёта: settleSuperseded ---
 outcome: released

--- 2. markPaid: старый счёт помечается paid, ссылка на преемника снимается тем же UPDATE ---
UPDATE 1

--- 3. сведение денег: долг снят ровно на сумму, дублей нет ---
 id=111… (место июля)   | status=paid  | amount_minor=150000 | carried_debt_minor=0     | superseded=NULL
 id=222… (период августа)| status=draft | amount_minor=80000   | carried_debt_minor=0     | superseded=NULL

 к оплате всего теперь: 230000   ← было 230000 ДО оплаты (150000 долга внутри преемника + 80000 тарифа);
                                    после оплаты старого те же 230000 распределены как 150000(paid)+80000(draft).
                                    Деньги не потеряны и не задвоены.
```

Обратное — двойного зачисления нет: сумма преемника после снятия долга — РОВНО 80000 (тариф), не 230000
и не 0; повторный вызов шва (доказано ранее фиксером и логикой FOR UPDATE + `already_billed`) не может
снять с одного счёта долг дважды — сам шов физически меняет строку один раз и на втором вызове находит
её уже без долга.

### Инъекция в новый комбинатор захвата (прямое требование миссии)

Комбинатор `captureSaasBillingPaidInvoice` (`invoiceOperations.ts`) — единственное место, решающее
порядок `settleSuperseded → markPaid`. Сломано: убран вызов `settleSuperseded` и проверка его результата,
`markPaid(true)` вызывается напрямую для счёта, погашенного преемником (реинтродукция ИСХОДНОГО дефекта
Ф2 — молчаливый пропуск гашения долга).

```diff
-    const settled = await steps.settleSuperseded(invoice.supersededByInvoiceId);
-    if (settled !== 'released') return steps.refuse('superseded_debt_already_billed');
-    return steps.markPaid(true);
+    return steps.markPaid(true);
```

```
$ npx vitest run   # весь webapp
 FAIL seatInvoiceDebtAndReissue.test.ts > оплата по счёту, чей долг уже переехал >
      снимает переехавший долг с преемника и засчитывает место (оплата ПОСЛЕ переезда)
   expected 150000 to be +0 (carriedDebtMinor преемника не снят)
 FAIL … > преемник уже оплачен — деньги не выбрасываются молча и место не выдаётся дважды
   expected 'paid' to be 'void' (счёт задним числом стал paid вместо отказа с записью аудита)
 FAIL … > перевыставленный счёт: оплата по старой ссылке снимает долг с ЕГО преемника
   expected 150000 to be +0
 Test Files  1 failed | 390 passed | 4 skipped (396)
      Tests  3 failed | 1826 passed | 12 skipped (1841)
```

3 сценария красные — ровно то число, что называл фикс-коммит `5fab9b2ec` («снятый в нём порядок краснит
3 сценария»). Инъекция откачена (`git checkout --`), повторный прогон — 22/22 зелёных
(`seatInvoiceDebtAndReissue.test.ts` + `invoiceOperations.unit.test.ts`).

### PASS с оговоркой (та же, что называл сам фиксер)

Дыра, которую фиксер сам назвал НЕ закрытой: подмена САМОГО вызова шва внутри `pgSaasBilling.ts`
(`releaseCarriedSeatDebt`) на заглушку «всегда released» тестами не ловится — исполнение боевого
pg-репозитория против PostgreSQL не проверяет ни один тест, а завести такой тест — новая DEV-DB
тест-механика, замороженная §10b до отдельного аудита ролей и owner-go. Я это НЕ чинил (аудитор не
принимает свой фикс, §24.6) и заново не заводил тест — это по-прежнему факт в отчёт, не задача.

**Проверено заново и остаётся в силе прямо сейчас:** запрос
`has_function_privilege('app_clinic_billing', 'app.release_carried_seat_debt(uuid,uuid)', 'EXECUTE')` →
`false`; `app_worker` и `app_clinic_billing` имеют только `SELECT` на новые колонки, не `INSERT`/`UPDATE`.
То есть **на живом DEV прямо сейчас настоящий вебхук под настоящей ролью получит 42501**, если попытается
пройти путь Ф2 — потому что `reconcile-access.mjs` (шаг привилегий) для этой ветки не запускался. Это тот
же пробел, что фиксер прямо назвал в НЕ СДЕЛАНО своего отчёта 19.08 («доезжает до DEV» ≠ «работает под
runtime-ролью на DEV»), и он не изменился с тех пор.

---

## Ф3 — обе защиты больше не снимаются молча. PASS, и сильнее исходного требования

### Повтор инъекции 1 — снят `asOf`

`modules/saas-billing/seatDebt.ts`, `isSaasBillingSeatDebtForPeriod`: убрано условие
`invoice.servicePeriodEndsAt <= scope.asOf` (буквально то же снятие, что делал первый аудит в БОЕВОМ
репозитории — но теперь условие живёт в одном месте на оба репозитория).

```
$ npx vitest run   # весь webapp, 1841 тестов
 FAIL seatInvoiceDebtAndReissue.test.ts > … > не трогает счёт за место, чей отрезок услуги ещё идёт
   expected 150000 to be +0
 Test Files  1 failed | 391 passed | 4 skipped (396)
      Tests  1 failed | 1828 passed | 12 skipped (1841)
```
Было (аудит 19.08, та же инъекция): **367 зелёных, 0 красных.** Стало: **1 красный.** Разница —
`modules/saas-billing/seatDebt.ts` теперь единственный источник правила, и его зовут оба репозитория
(боевой и двойник), поэтому красить есть чему. Инъекция откачена, повторный прогон файла — 13/13.

### Повтор инъекции 2 — снят отказ «счёт за место не отменяют»

`invoiceOperations.ts`, `saasBillingInvoiceCancelVerdict`: убрана ветка
`invoiceKind === 'seat_overage' → seat_invoice_not_cancellable`, остаётся только проверка статуса.

```
$ npx vitest run
 FAIL invoiceOperations.unit.test.ts > отмена счёта: вид счёта решает раньше статуса >
      отказывает отменить неоплаченный счёт за место — его перевыставляют
 FAIL invoiceOperations.unit.test.ts > … > называет отказ по ВИДУ, а не по статусу, даже когда статус тоже не подходит
 FAIL seatInvoiceDebtAndReissue.test.ts > счёт за место не отменяют >
      маршрутный вызов отмены отвергается на уровне репозитория, а не только кнопкой
 Test Files  2 failed | 390 passed | 4 skipped (396)
      Tests  3 failed | 1826 passed | 12 skipped (1841)
```
Было: **156 зелёных, 0 красных.** Стало: **3 красных.** Откачено, повторный прогон — 22/22 зелёных.

### Плюс: конструкция держит даже при обходе ВСЕГО кода (не требовалось миссией явно, но это и есть
### верхняя ступень §10a — проверено против самой живой базы, не только тестом)

Прямой `UPDATE` мимо приложения, никакого TypeScript вообще:
```
UPDATE public.saas_billing_invoices SET status = 'void' WHERE id = '<seat_overage-счёт>';
ERROR:  new row for relation "saas_billing_invoices" violates check constraint
        "saas_billing_invoices_seat_void_has_successor_check"

-- контроль: обычный счёт периода отменяется по-прежнему --
UPDATE public.saas_billing_invoices SET status='void' WHERE id='<tariff_period-счёт>';
UPDATE 1   -- проходит, как и должно

-- снять преемника, оставив void — тоже отказ (та же ступень) --
UPDATE public.saas_billing_invoices SET superseded_by_invoice_id = NULL WHERE id = '<тот же seat-счёт>';
ERROR:  … violates check constraint "saas_billing_invoices_seat_void_has_successor_check"
```
То есть даже если ВЕСЬ код (обе TS-защиты) удалить одновременно, база всё равно откажет — предмет
находки Ф3 первого аудита («обе защиты можно удалить, и тесты останутся зелёными») закрыт на уровень
выше, чем спрашивала миссия: не «тест поймает», а «действие невозможно физически», независимо от теста.

### Повтор инъекции из `5fab9b2ec` (реордер комбинатора захвата) — см. секцию Ф2 выше, тот же прогон.

---

## Открытые вопросы первого аудита — проверено, изменилось ли что-то (§24.6, вопросы, не работа)

1. **Фоновый тик под `app_worker` без INSERT на `saas_billing_invoices`.** Проверено заново:
   `app_worker` имеет только `SELECT` на таблицу (табличный грант), как и 19.08. Ничего не изменилось —
   вторая дверь выставления по-прежнему не может вставить счёт вообще.
2. **Долг едет ровно один период.** `seatDebt.ts` (единственный источник правила теперь) по-прежнему
   фильтрует только `invoice_kind = 'seat_overage'`; попав строкой в `tariff_period`-счёт, при неуплате
   ТОГО счёта долг дальше не покатится. Поведение не изменилось, решения владельца по-прежнему нет.

---

## Как оставлена база

Все временные инъекции в `.ts`-файлах откачены `git checkout --` (подтверждено `git status` — дерево
чистое от моих правок; единственные изменения в рабочем дереве — staged rename и правка `_journal.json`
от ЖИВОГО чужого процесса `wt/migration-timestamp-20260819`, не мои, не тронуты).

Миграция была реально закоммичена на DEV для прогона Ф1/Ф2 (иначе колонки/шов/ограничения нечем было бы
проверить прогоном, а не чтением) и затем **вручную откачена тем же способом, каким она добавляла
объекты** — 2 колонки, 4 ограничения, 1 индекс, 1 функция, 1 строка леджера — до состояния на момент
старта аудита:
```
$ psql … -c "SELECT max(created_at), tag FROM …"
1800000070000|0050_the_transcode_queue_dispatcher_had_no_door   ← совпадает с состоянием на старте
$ psql … -c "SELECT carried_debt_minor FROM public.saas_billing_invoices LIMIT 1;"
ERROR: column "carried_debt_minor" does not exist                ← совпадает с состоянием на старте
```
DEV сейчас в том же состоянии, в каком был до этого прогона. Реальное закрытие Ф1 на разделяемой DEV
(миграция ОСТАЁТСЯ применённой, а не только доказано, что применяется) требует свести ветку в `feat` и
запустить `migrate-dev.sh --execute` из основного чекаута штатным порядком — это НЕ действие аудитора.

---

## НЕ ПРОВЕРЕНО

1. **Живой HTTP-прогон Ф2 под настоящей runtime-ролью (`app_clinic_billing`).** Заблокировано
   подтверждённым фактом: `EXECUTE` на новый шов и `INSERT`/`UPDATE` на новые колонки у этой роли
   отсутствуют (reconcile прав не выполнялся, тот же пробел, что назвал фиксер 19.08). Денежная логика
   доказана прогоном шва (гейт снят вручную, тело — из каталога) и инъекцией в TS-комбинатор, но не
   сквозным вызовом `pgSaasBilling` от лица арендной роли.
2. **Подмена вызова `releaseCarriedSeatDebt` внутри `pgSaasBilling.ts` на заглушку.** По-прежнему не
   ловится ни одним тестом (исполнение боевого репозитория против PostgreSQL не проверяет ничего) — это
   тот же пробел, что фиксер сам назвал в НЕ СДЕЛАНО, я его не заводил и не чинил (§10b заморожен,
   §24.6 — не источник скоупа).
3. **Реальная гонка двух HTTP-дверей** (webhook + перевыставление) на живом приложении — не запускалась;
   доказано только на уровне замка (`pg_advisory_xact_lock`) прошлым аудитом, повторно не перепроверялось
   этим проходом (не входило в миссию).
4. **Двойное списание у реального провайдера** — песочница не поднималась.
5. **TEST** — не трогался (канон: только после полностью зелёного DEV; DEV не зелёный по причине
   отсутствующего reconcile прав).
6. **Причина, по которой DEV потерял применённую миграцию между 19.08 и стартом этого аудита** — не
   расследовалась (не входило в миссию); называю как факт и как вопрос ведущему, не как находку против
   этой ветки.
7. **Full CI репозитория целиком** — не гонялся; прогнаны точечно `apps/webapp` vitest (весь, 1841 тест),
   `deploy/postgres/privileges` `node --test` (миграторный слой), `generate-cli --check`.
