# S1 — второй независимый аудит приёмки, 04.09.2026

Основание: `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, волна 03.09, R1 и S1 целиком;
`docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`; первый независимый проход
`docs/_TODO/S1_FIRST_INDEPENDENT_AUDIT_2026-09-03.md`.

Кандидат: `c6bc0bda2` на `wt/trackd-completion-20260904`, диапазон `1cb089f5a..c6bc0bda2`.

Продуктовый код, миграции, права DEV и данные DEV аудитор не менял. Все временные инъекции откатаны, дерево
после каждой проверено `git status --porcelain` (0 строк). Постоянных изменений три и все разрешены брифом:
расширенный acceptance-оракул продажи абонемента, этот артефакт, запись в очередь аудита.

## Вердикт

**PASS.** 9 из 9 пунктов kill-set закрыты; непойманных инъекций нет. Галочка S1 в план-файле владельца
аудитором не проставлена — её ставит ведущий после живой приёмки.

## Kill-set: по пункту, бинарно

| # | класс | вердикт | чем доказано |
| --- | --- | --- | --- |
| K1 | не хватает колонок, которые Drizzle называет в `INSERT` | **PASS** | оракул зелёный; при отключённом расширении — 44 неполных пары на базу |
| K2 | сгенерированные метаданные отстали от схемы | **PASS** | инъекция устаревшего артефакта краснит и побайтный гейт, и оракул |
| K3 | неразрешённый прямой `.insert()` | **PASS** | инъекция роняет и генератор артефакта, и независимый скан оракула |
| K4 | случайное удаление или расширение вне `INSERT` | **PASS** | программный разбор обеих сгенерированных баз + живой каталог DEV |
| K5 | регрессия отношений без Drizzle-модели / ручного объявления | **PASS** | `broadcast_drafts`, `system_settings_audit` не изменены ни одной строкой |
| K6 | порча `platform_users.session_epoch` (нужна только для `UPDATE`) | **PASS** | грант `platform_users` не изменён; колонка на месте |
| K7 | параллельный писатель прав | **PASS** | единственная воронка `finalizeDirect`, второго пути нет |
| K8 | коллизия SQL-имён молча теряет колонки | **PASS** | инъекция второй модели с тем же именем — fail-closed отказ |
| K9 | рантайм-роль всё ещё получает `42501` при зелёной статике | **PASS** | rollback-only прогон всей цепочки продажи под `app_staff` на `bcb_webapp_dev` |

## 1. Разовое состояние: разбор кандидата, не отчёта

**Конструкция та, что предписана планом, и второго пути выдачи прав нет.** Все три ветки прямого доступа
(`clinical + systemDirect`, `clinical`, `systemDirect`) сходятся в один `finalizeDirect`
(`declaration.ts:8012`), и расширение вставлено внутрь него, а не рядом. Сборка таблиц базы вызывает
`revision10RelationAccess` ровно один раз на активное отношение (`declaration.ts:8751`), поэтому обойти
воронку нечем. Миграций в кандидате нет ни одной — права выдаёт только декларация.

**Границы расширения проверены по коду, а не по комментарию.** `withDrizzleInsertColumns` не трогает
табличный грант, не трогает грант без `INSERT`, не трогает роль вне webapp-возможностей `purpose: 'relation'`
и никогда не удаляет объявленную колонку (берётся объединение, а не замена).

**Каждая изменённая сгенерированная строка проверена программно, по обеим управляемым базам:**

```
bcb_webapp_dev:      removed 44, added 44; non-"GRANT INSERT (cols)" changed statements: 0
                     (relation,role) pairs: old 690 new 690; lost 0, new 0
                     op-keys widened 44 (+104 cols), narrowed 0 (-0 cols), non-INSERT changes 0
bersoncarebot_test:  идентично, те же числа
```

То есть множество пар (роль, отношение) не изменилось, ни одна колонка не удалена, ни один `SELECT`,
`UPDATE` или `DELETE` не изменён, и все 88 изменённых строк — колоночный `INSERT`.

**Объявленные исключения на месте дословно.** `public.broadcast_drafts` и `public.system_settings_audit` в
артефакте отсутствуют вовсе (у них нет Drizzle-модели: артефакт содержит 208 отношений, все `public`), поэтому
декларация их физически не может расширить, и их гранты в обеих базах не изменились. `public.platform_users`
не изменился ни одной строкой: `app_staff` сохранил `session_epoch`, которой Drizzle-модель не знает —
объединение оставило её там, где она объявлена, а механическая замена списка её бы стёрла.

**Роли, получившие колонки, — только webapp-реляционные:** `app_staff` (77 колонок), `app_platform_settings`
(18), `app_worker` (8), `app_clinic_billing` (1). Все четыре присутствуют в
`declaration.portContext.capabilities` с `port: 'webapp'`, `purpose: 'relation'`; проверено вызовом самой
декларации, а не чтением списка.

**Ветка разделения гранта проверена инъекцией**, потому что в текущей декларации она не срабатывает ни разу
(все 44 изменённые строки — одиночные `GRANT INSERT`). Временно объявив `app_staff` на
`public.be_patient_package_items` операции `["SELECT","INSERT"]` с одним списком колонок и перегенерировав,
получено:

```
GRANT SELECT ("created_at", "patient_package_id", "quantity_initial", "service_id", "sort_order") … TO "app_staff";
GRANT INSERT ("created_at", "id", "patient_package_id", "quantity_initial", "service_id", "sort_order") … TO "app_staff";
```

`SELECT` сохранил объявленные колонки дословно, `id` в него не протёк. Инъекция откатана, артефакты
перегенерированы, `--check` побайтный.

## 2. Гейты, прогнанные заново

```
pnpm run test:db-privileges              tests 325 / pass 177 / fail 0 / skipped 148   (до правки тестов)
  drizzle-insert-surface.ts: byte-identical to live Drizzle metadata (208 relations, 125 with a direct .insert())
  [S1] column INSERT (role, table) pairs …: 127 per database (254 across 2 managed databases)
pnpm run check:db-privileges-generated   6 артефактов побайтно
pnpm run check:db-privileges-census      208 ACTIVE relations на каждую базу, 3353 source files
node scripts/check-migration-privileges.mjs   OK (114 migration files)
pnpm --dir apps/webapp typecheck         rc 0 (28 файлов `webapp/scripts` входят в область tsc)
tsc --noEmit --strict -p deploy/postgres/privileges   rc 0
eslint deploy/postgres/privileges/patient-package-staff-insert.devDbProof.test.mjs   чисто
```

Оба гейта стоят в CI: `test:db-privileges` (внутри которого первым шагом идёт побайтный
`check:drizzle-insert-surface`) — в `scripts/ci-steps.mjs` и во всех цепочках `ci:resume:*`;
`check:db-privileges-generated` — отдельным шагом `.github/workflows/ci.yml`.

## 3. Собственные инъекции аудитора (5 посажено, 5 убито, 0 не поймано)

| инъекция | что делает | результат |
| --- | --- | --- |
| I1 | убрать `id` из `be_patient_package_items` в артефакте | `check:drizzle-insert-surface` красный; оракул красный строкой `not granted id (first callsite … pgMemberships.ts:501)` в обеих базах |
| I2 | временный файл с `.insert(table)`, неразрешимым по графу импортов | генератор артефакта падает с именем строки; тест 1 оракула красный |
| I3 | вторая Drizzle-модель на то же SQL-имя `be_patient_package_items` с другим набором колонок | fail-closed отказ `two Drizzle models disagree about the SQL table …`; оракул не стартует |
| I4 | снять `withDrizzleInsertColumns` из `finalizeDirect` (состояние до S1) | оракул красный: 127 пар в области на базу, **44 неполных пары на базу, 88 строк отказа**, первая — `app_clinic_billing … saas_billing_invoices`, среди них `be_patient_package_items: not granted id`, `be_package_history_events: not granted id`, `be_payment_intents: not granted id`; `check:db-privileges-generated` — расхождений 2 |
| I5 | временный `.insert(lfkComplexes)` — отношение, у которого сегодня callsite нет | область выросла 127 → 128 пар на базу, появилась строка `lfk_complexes: not granted created_at, id`. Рукописного allowlist нет |

I4 независимо воспроизводит числа красного оракула первого аудитора (127 / 44 / 88) из кода этой ветки.

После каждой инъекции дерево восстановлено: `git status --porcelain` пуст, `generate-cli.mjs --check`
побайтный.

## 4. Живое поведение на именованной DEV (`bcb_webapp_dev`), rollback-only

Всё ниже выполнено локальным административным сокетом (`sudo -n -u postgres psql -h /var/run/postgresql`),
без одноразовых баз, без исторического replay, без PROD, без печати секретов.

### 4.1. Исходное состояние DEV подтверждает диагноз R1

Установленные гранты `app_staff` на 04.09 (reconcile кандидата ещё не выполнялся):

```
be_patient_packages       … , display_number, id, …            ← id ЕСТЬ
be_patient_package_items  created_at, patient_package_id, quantity_initial, service_id, sort_order   ← id НЕТ
be_package_history_events event_type, occurred_at, organization_id, patient_package_id, payload_json ← id НЕТ
be_payment_intents        … без id …                                                                 ← id НЕТ
```

Это ровно та асимметрия, из-за которой прежняя узкая проба была зелёной при сломанном продукте.

### 4.2. Живой отказ воспроизведён на текущих правах DEV

Порт-контекст `app_staff` (`app.begin_port_context`, capability `relation`, реальный actor/организация),
затем продакшн-стейтменты цепочки:

```
INSERT INTO public.be_patient_packages (…)  → ok
INSERT INTO public.be_patient_package_items (id, created_at, patient_package_id, …)
  → ERROR: permission denied for table be_patient_package_items
ROLLBACK
```

То есть родитель коммитится, а позиции падают — тот самый худший исход, который R1 называет прямо.

### 4.3. Кандидат допускает ВСЮ цепочку продажи под `app_staff`

В одной транзакции: применены кандидатские `GRANT`/`REVOKE ON TABLE` трёх отношений цепочки → поставлен
порт-контекст `app_staff` → выполнены пять стейтментов, которые исполняет продакшн-путь
`createManualPatientPackage` (`modules/memberships/service.ts:217`):

1. `INSERT public.be_patient_packages` (`pgMemberships.ts:475`);
2. `INSERT public.be_patient_package_items` (`pgMemberships.ts:501`);
3. `INSERT public.be_package_history_events` `manual_created` (`pgMemberships.ts:901`);
4. `UPDATE public.be_patient_packages` — активация (`pgMemberships.ts:736`);
5. `INSERT public.be_package_history_events` `activated`.

Результат: `items=1`, `history=2`, ни одного `42501`. Прогон повторён вторым вариантом, где
`display_number` передан настоящим `DEFAULT` (`nextval`) — то есть буквально продакшн-стейтментом: цепочка
снова прошла целиком. `has_sequence_privilege('app_staff', 'be_patient_packages_display_number_seq', 'USAGE')`
= `true`, поэтому и путь через последовательность не даёт скрытого `42501`.

### 4.4. Каждая названная колонка нагружена

Для всех трёх отношений цепочки, по каждой колонке из `insertColumns` артефакта (22 + 6 + 6 = 34 прогона):
отзыв одной колонки внутри транзакции роняет цепочку с `permission denied for table <отношение>`. Зелёный
результат 4.3 поэтому не может быть случайным.

### 4.5. Reconcile кандидата, транзакционно и с откатом

Санкционированный `reconcile-access.mjs` режима «применить и откатить» не имеет (это шаг после приземления),
поэтому проверка сделана ограниченно и обратимо: в одной транзакции применены **все 2098** строк
`GRANT`/`REVOKE … ON TABLE` кандидатского `privileges.bcb_webapp_dev.sql`, снят каталожный снимок до и после
(`pg_class.relacl` + `pg_attribute.attacl`, `aclexplode`), затем `ROLLBACK`.

```
ADDED   104   (все — privilege_type = INSERT, 41 отношение, роли: app_staff 77, app_platform_settings 18,
               app_worker 8, app_clinic_billing 1)
REMOVED 0
counts  before=9048  after=9152
```

Дельта совпала со статическим разбором до колонки. `REMOVED 0` дополнительно означает, что установленное
состояние DEV сегодня не имеет дрейфа за пределами этой дельты.

### 4.6. Уборка доказана, а не заявлена

После всех прогонов, отдельным запросом:

```
snapshot_now = 9048                (совпадает с «до»)
be_patient_package_items INSERT (app_staff) = created_at, patient_package_id, quantity_initial,
                                              service_id, sort_order      ← id не появился
be_package_history_events INSERT (app_staff) = event_type, occurred_at, organization_id,
                                               patient_package_id, payload_json
packages=0  items=0  history=0     accepted_port_contexts=0
be_patient_packages_display_number_seq = 1/false   (единственный несбрасываемый след — один
                                                    израсходованный номер — возвращён `setval(…, 1, false)`)
```

Ни строк, ни грантов, ни port-context-записей после аудита не осталось.

## 5. Расширение приёмочного оракула

`deploy/postgres/privileges/patient-package-staff-insert.devDbProof.test.mjs` покрывал **один** `INSERT` в
`be_patient_packages` — отношение, у которого `id` был выдан ещё до S1, поэтому файл был зелёным и до
исправления. Он расширен до всей достижимой транзакции: три теста, opt-in
`RUN_PATIENT_PACKAGE_STAFF_INSERT_DB=1`, только `bcb_webapp_dev`, права применяются внутри транзакции и
откатываются вместе с ней.

Списки колонок в стейтментах не рукописные: они строятся из `drizzle-insert-surface.ts` — того же машинного
артефакта, который читает декларация. Новая колонка схемы попадает в пробу сама, а колонка без значения
роняет пробу явной ошибкой вместо тихого выпадения из покрытия.

```
RUN_PATIENT_PACKAGE_STAFF_INSERT_DB=1 node --test \
  deploy/postgres/privileges/patient-package-staff-insert.devDbProof.test.mjs
# tests 3 / pass 3 / fail 0
pnpm run test:db-privileges   tests 326 / pass 177 / fail 0 / skipped 149
```

## 6. Границы — названы, а не умолчаны

- **Платёжное намерение в семье действий S1 остаётся закрытым не S1.** `createPaymentIntent`
  (`infra/repos/pgPayments.ts:338`) исполняется под `runWithDbOrganizationPrincipal`
  (`pgPayments.ts:154`), то есть **не** как `app_staff`. Каталог DEV:
  `has_table_privilege('app_tenant_service','public.be_payment_intents','INSERT')` = `false`. S1 расширил
  колоночный `INSERT` этой таблицы у `app_staff` (добавлен `id`), но продакшн-путь туда не приходит — это
  предмет R2/S2, а не дефект кандидата. В rollback-only пробу этот стейтмент намеренно не включён, чтобы
  зелёная проба не заявляла покрытие, которого нет.
- **35 отношений с колоночным `INSERT` и без доказанного `.insert()`-callsite** (`be_organizations`,
  `lfk_*`, `message_log`, `patient_bookings` и др.) в область не входят по построению: их гранты обслуживают
  сырой SQL или тело SECURITY DEFINER. Инъекция I5 показывает, что появление реального callsite вводит
  отношение в область автоматически.
- **Избыточный грант отказом не считается** — класс не `42501`, волна 03.09 его не берёт.
- **Интеграторская сторона** гейтом не покрыта (граница первого аудита, кандидатом не изменена).
- **Установленное состояние DEV кандидату ещё не соответствует** — это шаг 5 порядка выполнения
  (`migrate-dev.sh --execute` после приземления), и он владельцем не запускался. Проба это учитывает: она
  проверяет декларацию-кандидата, а не установленный грант.

## 7. Что НЕ сделано

- Полный CI не гонялся (бриф запрещает; по плану он идёт один раз на шаге 4 приземления).
- Деплой не выполнялся, TEST не трогался.
- Галочка S1 в план-файле владельца не проставлена.
- Права DEV не изменены: reconcile кандидата на DEV не выполнялся.
