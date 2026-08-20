# Четыре механических блокера публичной записи — починка и доказательства

Ветка `wt/public-booking-write-20260819`, база сравнения `feat/doctor-ui-rebuild`.
Задание: [`PUBLIC_BOOKING_WRITE_THIRD_AUDIT_2026-08-19.md`](PUBLIC_BOOKING_WRITE_THIRD_AUDIT_2026-08-19.md)
(F2-F6). Поведение записи не трогалось: слепой тест приёмки аудитора `eac8ed8ee` не изменён и зелёный.

**Итог: F3, F4, F5, F6 закрыты. F2 закрыт в своей части (леджер DEV честен, класс закрыт гейтом с
инъекцией). Живой прогон `devDbProof` остаётся 2/4 — упирается в ПЯТЫЙ блокер, пришедший с `feat`
и не принадлежащий этой ветке: DEV-reconcile не проходит на роли `app_seam_public_clinic_card_owner`,
снятой из декларации коммитом `cfa4e45df`, но живой в кластере.** Разбор и два маршрута — в конце.

---

## Сводка команд приёмки

| Проверка | Команда | Результат |
|---|---|---|
| Lint вебаппа | `pnpm --dir apps/webapp lint` | **EXIT=0** |
| Артефакт прав | `node deploy/postgres/privileges/generate-cli.mjs --check` | **EXIT=0** |
| Артефакт порт-контекста | `… --check --port-context-only` | **EXIT=0** |
| Typecheck | `pnpm typecheck` | **EXIT=0** |
| Гейт леджера на DEV | `migrate-local.mjs --db bcb_webapp_dev … --rollback-only` | **EXIT=0**, `pending=0` честно |
| Слепой тест приёмки | `npx vitest run --project unit …/publicBookingSeatIndependence.unit.test.ts` | **8/8**, файл не изменён |
| Юнит-тесты автора | `… createVerifiedPublicBooking.unit.test.ts` | 4/4 (вместе с предыдущим 12/12) |
| Тест маршрута | `npx vitest run --project route …/confirm/route.route.test.ts` | 3/3 |
| Тесты мигратора | `node --test migrate-local.test.mjs migrate-local-objects.test.mjs` | **19/19** |
| Декларация | `node --test function-census port-context-catalog port-context-callsite-catalog` | 39/39 |
| Живое доказательство стен | `RUN_PUBLIC_BOOKING_WRITE_WALLS_DB=1 node --test …devDbProof.test.mjs` | **2/4 — блокер `feat`, §F2-остаток** |

---

## F2. Леджер DEV врал вторым способом — строка есть, объекта нет

### Что было измерено

`bcb_webapp_dev` держал строки леджера ровно с `created_at` трёх миграций ветки, а четырёх её дверей
в `pg_proc` не было. Водяной знак сравнивает только `created_at`, поэтому анти-пропускной гейт молчал
ПО ПОСТРОЕНИЮ, а мигратор печатал `already current: pending=0` поверх дыры — навсегда.

### 1. DEV возвращён в честное состояние

Маршрут — **не** «поднять `when` выше водяного знака», хотя §1 такой ход разрешает и аудит его
предлагал. Поднятие `when` оставляет лживые строки на месте и делает их невидимыми для нового гейта
(они перестают соответствовать какой-либо записи журнала), а на миграции, уже применённой ко второй
цели, так не сделать вовсе. Поэтому дописан сам инструмент:

```
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev \
    --migrator bcb_dev_migrator --drizzle-folder apps/webapp/db/drizzle-migrations \
    --sudo-postgres --rollback-only
Error: The bcb_webapp_dev ledger and the bcb_webapp_dev catalog describe different states:
  3 applied migration(s) have a ledger row, and the objects that row stands for are absent …
  tag=0052_a_failed_public_booking_must_not_leave_a_client
    missing: app.assert_org_patient_count_quota_available(uuid)
    missing: app.revoke_public_booking_enrollment(uuid)
  tag=0053_a_visitor_booking_spends_no_tariff_seat
    missing: app.enroll_current_patient_in_public_booking_clinic(uuid,text)
  tag=0051_a_public_visitor_becomes_a_client_when_identified
    missing: app.resolve_public_booking_client_by_phone(text,text,boolean)
EXIT=1
```

Починка — тем же wrapper'ом, всем маршрутом DEV (`migrate-dev.sh` теперь пробрасывает опции
восстановления, раньше он отвергал любой второй аргумент):

```
$ bash deploy/host/migrate-dev.sh --preflight --reapply 0051_… --reapply 0052_… --reapply 0053_…
  … DELETE 1 / INSERT 0 1 на каждую … ROLLBACK
  Drizzle owner-ordered migration validated and rolled back: pending=3 total=53 reapplied=3
  migrate-dev preflight: PASS
$ bash deploy/host/migrate-dev.sh --execute --reapply 0051_… --reapply 0052_… --reapply 0053_…
  Drizzle owner-ordered migration committed: pending=3 total=53 reapplied=3
```

После этого:

```
$ sudo -u postgres psql -d bcb_webapp_dev -Atc "select p.oid::regprocedure::text …"
app.assert_org_patient_count_quota_available(uuid)
app.enroll_current_patient_in_public_booking_clinic(uuid,text)
app.resolve_public_booking_client_by_phone(text,text,boolean)
app.revoke_public_booking_enrollment(uuid)
```

и хеши трёх строк леджера совпали с текущими файлами байт-в-байт (`ba4a6912…`, `efdb857d…`,
`556c698a…`) — раньше они несли редакции, которых в репозитории уже нет.

**Что осталось в леджере и почему это не трогалось.** Две строки без записи в журнале:
`1800000052000` — след двойного применения 0051 до перенумерации (описан аудитом), и
`1800000060000` — миграция СОСЕДНЕЙ ветки, применённая к общей DEV во время этой работы. Ни одна
не принадлежит этой ветке; для водяного знака они безвредны, гейт их не касается.

### 2. Класс закрыт: расхождение леджера с каталогом теперь видно и останавливает прогон

Новый модуль `deploy/postgres/privileges/migrate-local-objects.mjs` восстанавливает ОБЕЩАНИЕ
применённой части журнала: свёртка `CREATE FUNCTION`/`DROP FUNCTION` по записям, у которых есть
строка леджера, в порядке журнала. Замер по корпусу: post-B0 миграции создают ровно один вид
долговечных объектов — функции (140 `CREATE FUNCTION`, 4 `DROP FUNCTION`, ни одного `CREATE
TABLE/VIEW/TRIGGER`, ни одного `RENAME`), поэтому свёртка — это точный список того, что леджер
обещает. Сверка — одним `to_regprocedure` в мигранте, единственном месте, через которое идут все
прогоны DEV и TEST.

Комментарии и литералы вырезаются до разбора: без этого упоминание функции в комментарии-обосновании
(их в этих миграциях много) стало бы обещанием, и гейт требовал бы объект, которого никто не создавал.
Это поймал юнит-тест, а не рассуждение.

Ложных срабатываний на живых базах нет:

```
bcb_webapp_dev  promised=123 missing=4   ← ровно четыре известные дыры
bersoncarebot_test promised=119 missing=0
```

**Инъекция (обязательная), на живой DEV:**

```
=== ДО инъекции
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=53   EXIT=0

=== ИНЪЕКЦИЯ
$ sudo -u postgres psql -d bcb_webapp_dev -c \
    "DROP FUNCTION app.resolve_public_booking_client_by_phone(text,text,boolean);"
DROP FUNCTION

=== ПОСЛЕ инъекции
Error: The bcb_webapp_dev ledger and the bcb_webapp_dev catalog describe different states:
  1 applied migration(s) …
  tag=0051_a_public_visitor_becomes_a_client_when_identified
    missing: app.resolve_public_booking_client_by_phone(text,text,boolean)
  Re-run with --reapply 0051_… If a later migration replaced anything these create, name it
  with --reapply too: re-running a hole on its own would put its older edition back.
EXIT=1

=== ВОССТАНОВЛЕНИЕ тем же wrapper'ом
$ migrate-local.mjs … --reapply 0051_… --reapply 0052_… --reapply 0053_…
Drizzle owner-ordered migration committed: pending=3 total=53 reapplied=3   EXIT=0

=== ПОСЛЕ восстановления
already current: pending=0   EXIT=0
CHECK org_enrollments_portal_activation_check: идентичен доинъекционному
тело app.enroll_current_patient_in_public_booking_clinic: md5 идентичен доинъекционному
строк леджера: 55 (как до инъекции)
```

Гейт краснеет, НАЗЫВАЕТ объект и миграцию, а восстановление возвращает базу в тот же байт.

**Почему `--reapply` принимает не только дырявую миграцию.** Дыра редко чинится в одиночку: 0051
ставит CHECK из двух значений, 0052 расширяет его до четырёх, 0053 переписывает дверь зачисления.
Повтор одной 0051 откатил бы и то и другое к старой редакции. Поэтому принимается дырявая миграция
и любая, упорядоченная ПОСЛЕ неё; стоящая ПЕРЕД каждой дырой или не связанная с ней — отвергается,
чтобы забытый флаг в командной строке не перезапускал что попало. Обе формы покрыты тестами.

---

## F3. Артефакт прав разошёлся с декларацией

Причина — merge `b312a65f5`, принёсший `cfa4e45df` («снят владелец шва визитки»): декларация больше
не знает `app_seam_public_clinic_card_owner`, а закоммиченный артефакт держал его в строках `REVOKE`.

```
$ node deploy/postgres/privileges/generate-cli.mjs --all
$ git diff --stat deploy/postgres/generated/
 privileges.bcb_webapp_dev.sql     | 8 ++++----
 privileges.bersoncarebot_test.sql | 8 ++++----
```

Разница по существу — ровно одно имя роли, снятое с четырёх строк `REVOKE` в каждой базе (сверено
поимённо, добавленных ролей ноль). Оба режима гейта после этого зелёные, включая
`--check --port-context-only`, который проверяет вторую половину артефактов и первым режимом не виден.

---

## F4. Lint: гейт держит МОДУЛЬ порта, а не одно имя в нём

Гейт `check-transaction-quota-port-boundary` требовал дословно `transactionQuotaPort.withinLock`.
Ветка перенесла правило и замок в SQL-дверь `app.assert_org_patient_count_quota_available`, оставив
транспорт `assertOrgPatientCountQuotaAvailable` В ТОМ ЖЕ модуле `transactionQuotaPort.ts` — то есть
chokepoint не переехал, переехало имя входа.

Гейт научен второму объявленному входу того же модуля и **не ослаблен**: писатель обязан и
импортировать объявленный вход, и позвать его. Самотест вырос с 4 форм обхода до 6 — добавлены
«импортировал, но не зовёт» и «зовёт локального однофамильца вместо порта», обе красные:

```
$ node scripts/check-transaction-quota-port-boundary.mjs --self-test
check-transaction-quota-port-boundary self-test: 6 bypass forms rejected
check-transaction-quota-port-boundary self-test: 2 canonical port writers accepted
$ pnpm --dir apps/webapp lint
… check-transaction-quota-port-boundary: OK …   EXIT=0
```

Атомарность, ради которой гейт существует, сохранена: `pg_advisory_xact_lock` берётся внутри двери,
в той же транзакции, что и последующий `INSERT` вызывающего.

---

## F5. Drizzle-схема догнала базу

`apps/webapp/db/schema/bookingEngine.ts` описывал CHECK канала активации портала списком из двух
значений (редакция 0051), база после 0052 держит четыре. Следующий `drizzle-kit generate` выпустил
бы миграцию, СУЖАЮЩУЮ ограничение обратно, и тихо выключил бы подтверждение почтой и действующей
сессией. Список приведён к четырём значениям.

## F6. Комментарий объекта приведён к факту — в той миграции, которая факт меняет

`COMMENT ON FUNCTION app.assert_org_patient_count_quota_available` утверждал «оба создателя строки
`org_enrollments` её зовут». Это было верно ПОСЛЕ 0052 и перестало быть верным ПОСЛЕ 0053. Поэтому
правится не текст 0052 (он был честен, когда исполнялся), а добавлен `COMMENT` в 0053: у потолка
один спрашивающий — писатель карточки персонала. Комментарий уже стоит в `pg_description` DEV.

---

## ⛔ Остаток: ПЯТЫЙ блокер, пришедший с `feat` — DEV-reconcile не проходит

`devDbProof` даёт 2/4. Обе неудачи — одна причина, и она НЕ в этой ветке.

```
$ bash deploy/host/migrate-dev.sh --execute
… Drizzle owner-ordered migration … (успех)
ERROR:  undeclared managed BCB role survived: app_seam_public_clinic_card_owner
```

Reconcile — одна транзакция; она откатывается целиком, поэтому DEV не получает ни строк способностей
порт-контекста, ни табличных грантов новому шву. Проверено обеими пробами:

1. с временно подсаженными тремя ОБЪЯВЛЕННЫМИ строками способностей (сняты сразу, 236 → 236) тесты
   1-2 уходят с «accepted patient context required» на `42501 permission denied for table
   org_enrollments`;
2. `has_table_privilege('app_seam_public_booking_owner','public.org_enrollments','SELECT,INSERT,UPDATE')`
   = `f`, при том что артефакт эти гранты объявляет (`privileges.bcb_webapp_dev.sql:14927-14930`).

**Атрибуция.** Роль снята из декларации коммитом `cfa4e45df` на `feat`; в декларации `feat` её тоже
нет (единственное вхождение — комментарий). Значит `--env-verify` роняет DEV-reconcile из ЛЮБОГО
дерева, содержащего `cfa4e45df`, — это `feat` и все текущие `wt/*`, не только эта ветка.

**Почему это нельзя закрыть отсюда.** Роль ещё держит объекты:

```
$ BEGIN; DROP ROLE app_seam_public_clinic_card_owner; ROLLBACK;
ERROR:  role "app_seam_public_clinic_card_owner" cannot be dropped because some objects depend on it
DETAIL:  54 objects in database bersoncarebot_test
```

На DEV она уже не владеет ничем (обе двери визитки переведены на `app_seam_public_slug_owner`, как и
говорит декларация), на TEST — ещё владеет. То есть развязка требует прогона reconcile по TEST и
затем дропа роли по кластеру. Это работа снятия шва на `feat`, с радиусом на обе базы, и в «четыре
механических блокера ветки публичной записи» она не входит.

**Два маршрута, оба на решение ведущего/владельца:**

1. **Карантин вместо дропа (дешевле, ничего не ломает).** Внести
   `app_seam_public_clinic_card_owner` в `zeroState.legacyRoles` декларации. Роль уже удовлетворяет
   всем карантинным проверкам: `rolcanlogin=f`, `rolinherit=f`, `rolbypassrls=f`, членств 0.
   Reconcile обеих баз проходит сразу, дроп делается позже, когда TEST переведёт свои 54 зависимости.
2. **Довести снятие шва до конца.** Прогнать reconcile по `bersoncarebot_test` (он переведёт двери
   визитки на `app_seam_public_slug_owner`), затем `DROP ROLE` по кластеру.

**Как только любой из них сделан, `devDbProof` надо перегнать: остальные его предпосылки на DEV уже
стоят** — четыре двери на месте, леджер честен, артефакт совпадает с декларацией.

---

## НЕ СДЕЛАНО

- **Живой сквозной прогон публичной записи через HTTP** не выполнялся: путь `/api/booking/public/create/confirm`
  ходит под рантайм-логином, которому гранты на новые двери приезжают тем самым reconcile.
- **`devDbProof` 2/4**, причина названа выше и доказана двумя пробами; тесты 3 и 4 зелёные.
- **Полный `pnpm run ci` не гонялся.** Гонялись точечно: lint вебаппа (0), typecheck (0), оба режима
  `--check` (0), тесты мигратора 19/19, декларации 39/39, юнит 12/12, маршрут 3/3, гейт леджера на
  DEV (0), `devDbProof` 2/4.
- **Три падения в `migrate-local-parse.test.mjs`** (`0019` reminder-materialization: маркер владельца
  и объявленный язык) — **предсуществующие, к ветке отношения не имеют**: доказано подстановкой
  версии `0053` из `HEAD` (падают одинаково) и тем, что `git diff feat…HEAD` не касается ни
  `migrate-local-parse.mjs`, ни reminder-миграций.
- **Роль `app_seam_public_clinic_card_owner` не тронута**, TEST не тронут, прод не тронут.
- **Строка очереди `declare-enroll-root-20260819`** с двумя неверными утверждениями (§«Расхождения с
  прежними отчётами» аудита) не правилась: это запись чужого прохода, не механика ветки.
