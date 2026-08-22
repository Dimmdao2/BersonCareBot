# FAIL — независимый аудит D17 шага 1 (коммит `8fc46b499`, ветка `wt/d17-writers-20260822`, 22.08.2026)

Роль: auditor-live, скептик. Отчёт автора и зелёные прогоны доказательством не считались: каждый пункт
проверен командой против дерева, против сгенерированных артефактов и против ЖИВОЙ именованной DEV
`bcb_webapp_dev` (только чтение).

**Вердикт — FAIL по одной причине, и она блокирующая:** шестой путь (`support_delivery_events`) объявлен
в декларации ключом, который УЖЕ ЗАНЯТ возможностью порта вебаппа. Объектный литерал JavaScript оставляет
последнее определение, поэтому новая дверь с порта интегратора не доехала ни в один артефакт и ни в один
рантайм-каталог. Логин интегратора теряет возможность вызвать корень, а реляционную запись у него уже
забрали — то есть запись в канон поддержки прекращается совсем. Ни один существующий гейт этого не ловит
по построению. Остальные пять переводов сделаны корректно; права, порядок миграций и два из трёх заявлений
автора подтвердились.

Сводка находок:

| # | Класс | Суть | Где |
|---|---|---|---|
| **F1** | **БЛОКЕР** | дубль ключа `integrator_support_delivery_attempt_record` — новая возможность порта интегратора молча вытеснена; `support_delivery_events` больше не пишется ничем | `declaration.ts:2562` vs `:3140` |
| **F2** | важное | шестой писатель (`broadcast_audit`) не покрыт ни одним тестом: подмена счётчика проходит все 227 тестов, на которые ссылается коммит | `outgoingDeliveryWorker.ts:265,276,993` |
| **F3** | важное | гейт каталога возможностей сверяет резолвер с УЖЕ схлопнутым объектом — потерю двери он поймать не может никогда | `port-context-catalog.test.mjs:25-33` |
| F4 | точность отчёта | утверждение «реляционных `INSERT`/`UPDATE` по `public.*` в `apps/integrator/**` не осталось» — неверно: три живых, три мёртвых, один dev-скрипт | перепись `:219`, WORK_ORDER D17 |
| F5 | скрытое расхождение | корень напоминаний проверяет стену по ВХОДНОМУ `platform_user_id`, политика — по РЕЗУЛЬТИРУЮЩЕЙ строке | миграция `20260822T110000` |
| F6 | расхождение поведения (в сторону громкости) | столкновение `integrator_intent_event_id` чужой организации из тихого no-op стало вечным повтором → DLQ | корень поддержки, тело на DEV |
| F7 | сузился смысл теста | арбитр N3 («список колонок против VALUES») исчез вместе с `INSERT`; отображение «параметр → колонка» в теле корня теперь не проверяет никто | `notificationDeliveryAttempts.test.ts:227-268` |

---

## 1. Полнота переписи (взгляд)

Перечисление доказано командами, а не утверждением.

```bash
grep -rnEi "(INSERT[[:space:]]+INTO|UPDATE[[:space:]]+[a-z_.\"]+[[:space:]]+SET|DELETE[[:space:]]+FROM)" \
  apps/integrator/src --include=*.ts | grep -v '\.test\.' | grep -v '__tests__' \
  | grep -vE "INSERT INTO integrator\.|UPDATE integrator\.|DELETE FROM integrator\."
grep -rnoE "\.(insert|update|delete)\(\s*[a-zA-Z][a-zA-Z0-9_]*" apps/integrator/src --include=*.ts | grep -v '\.test\.'
```

Реальный вывод после коммита — ни одного НОВОГО, пропущенного автором писателя продуктового канона.
Шесть путей переписи в `public.*` реляционно больше не пишут. Осталось ровно то, что перепись сама
вынесла за скоуп, и это надо читать как «не блокер D17», а не как «ничего не осталось» (см. F4):

| путь | таблица | статус |
|---|---|---|
| `repos/userChannelBotBlocked.ts:45,56,67,86,97` | `public.user_channel_bindings` | ЖИВОЙ, вне скоупа по брифу («привязки каналов — своё») |
| `repos/messengerPhoneBindAudit.ts:116(FOR UPDATE),120,133,143,153` | `public.admin_audit_log` | ЖИВОЙ, служебный журнал; и он недостижим для интегратора уже сегодня (см. §4 переписи, п.1) |
| `repos/operatorHealthDrizzle.ts:94,241,320` | `public.operator_incidents`, `public.operator_job_status` | ЖИВОЙ, телеметрия оператора |
| `directPublic/writeSupportQuestionsDirect.ts:147,200,238` | `support_questions`, `support_question_messages` | МЁРТВЫЙ — подтверждено независимо |
| `infra/scripts/reconcile-dev-patient-reminder-orphans.ts:69` | `public.reminder_rules` | dev-скрипт, вне рантайм-замыкания |

Мёртвость трёх писателей поддержки перепроверена своей командой, не по отчёту:

```bash
for fn in createSupportQuestionDirect appendSupportQuestionMessageDirect markSupportQuestionAnsweredDirect; do
  grep -rn "\b$fn\b" --include=*.ts --include=*.mjs --include=*.js . | grep -v node_modules | grep -v /dist/ \
    | grep -v writeSupportQuestionsDirect.ts
done
```
Вывод пуст по всем трём. Заявление автора подтверждено.

**F4.** Строка `D17_CANON_WRITER_CENSUS_2026-08-22.md:219` («Реляционных `INSERT`/`UPDATE` по `public.*`
в `apps/integrator/**` не осталось») и её повтор в блоке D17 `WORK_ORDER.md` фактически неверны: три
живых писателя выше существуют. Верная формулировка — «реляционных писателей ПРОДУКТОВОГО КАНОНА из
переписи §2.2 не осталось». Это правка текста, не работа по коду; и она важна именно потому, что шаг 3
(снятие членств) будет опираться на это предложение.

---

## 2. Эквивалентность поведения по каждому из шести (тест)

### 2.1. `reminder_rules` + подметание `integrator.user_reminder_occurrences` — ЭКВИВАЛЕНТНО

Колонки, список `ON CONFLICT DO UPDATE`, `COALESCE`-семантика по `platform_user_id`/`organization_id`,
условие `notification_topic_code = CASE WHEN provided …`, `updated_at = now()` и `RETURNING updated_at::text`
перенесены в тело `20260822T110000_…` дословно (сверено построчно со снятым кодом
`writeReminderRulesDirect.ts` в `git show 8fc46b499`).

**Атомарность «строка + подметание» сохранена и стала строже, чем была.** Раньше это были два оператора
одной транзакции интегратора; теперь оба внутри одного тела `PL/pgSQL`, то есть в одной транзакции по
построению. Разрешение `platform_user_id`/`organization_id` вынесено в отдельную транзакцию — но оно
только читает, поэтому атомарность ЗАПИСЕЙ не пострадала.

Стена подметания сверена с политикой:

```
$ grep -n "rev10_tenant_delete_17" deploy/postgres/generated/privileges.bcb_webapp_dev.sql
10415:CREATE POLICY "rev10_tenant_delete_17" ON "integrator"."user_reminder_occurrences"
       AS PERMISSIVE FOR DELETE TO "app_tenant_service" USING ((organization_id = (SELECT app.current_org_id())));
```
Тело добавляет `AND occurrence.organization_id = p_organization_id`, а выше по телу стоит отказ при
`p_organization_id IS DISTINCT FROM app.current_org_id()`. Это ровно та же граница, а не сужение.

Стены INSERT/UPDATE сверены с `rev10_tenant_insert_173` / `rev10_tenant_update_173`
(`privileges.bcb_webapp_dev.sql:17344,17346`) — совпадают, включая ветку «сотрудник ИЛИ активно
записанный пациент».

**F5 (скрытое расхождение).** Политика проверяет `reminder_rules.platform_user_id` РЕЗУЛЬТИРУЮЩЕЙ строки;
тело проверяет ВХОДНОЙ `p_platform_user_id`. При `p_platform_user_id IS NULL` на апдейте строка
сохраняет прежнего платформенного пользователя (`COALESCE`), политика бы его переаттестовала, а тело —
нет. Сегодня недостижимо: `upsertReminderRuleDirect` бросает `no_platform_user_candidate`, если кандидата
нет, поэтому `NULL` в корень не попадает. Классифицирую как латентное расхождение, не как дефект.

### 2.2. `reminder_delivery_events` — ЭКВИВАЛЕНТНО

Колонки и `ON CONFLICT (integrator_delivery_log_id) DO NOTHING` перенесены дословно. Стена сверена с
`privileges.bcb_webapp_dev.sql:17165` (`rev10_delivery_replay_worker_170`) — предикат повторён
один в один (status/operation/organization_id/`payload->>'organizationId'`/`payload->>'integratorDeliveryLogId'`).

### 2.3. `content_access_grants_webapp` — ЭКВИВАЛЕНТНО

Колонки и весь `DO UPDATE SET` (включая `COALESCE` по `platform_user_id` и отсутствие `created_at`
в апдейте) перенесены дословно; стена сверена с `:13234` (`rev10_delivery_replay_worker_84`), плюс
добавлен явный отказ на строку чужой организации — это USING-половина той же политики.

### 2.4. `notification_delivery_attempts` — ЭКВИВАЛЕНТНО, с одной снятой обёрткой

Колонки и `parseOccurrenceUuid` сохранены; стена сверена с `:14812` (`rev10_tenant_insert_120`) — совпадает.
Снят хелпер `runWithOptionalOrganizationPrincipalTransaction` (обёртка `db.tx` при известной организации).
Проверено, что это безопасно: `runWithOptionalOrganizationPrincipal` при непустой организации вызывает
тот же `runWithOrganizationPrincipal` (`organizationPrincipal.ts:45-50`), а транзакция корню не нужна и
прямо запрещена (`runIntegratorSql.ts:51-53`). Живые вызывающие (`relayOutboundRoute.ts:337,383` и два
внутренних цикла `notificationDeliveryAttempts.ts:138,167`) tx-связанный `DbPort` не передают.

Тип `integrator_user_id` проверен по живой DEV (`information_schema.columns`) — `text`, поэтому явный
`::text` в новом фрагменте не ломает вставку.

### 2.5. `broadcast_audit` — ЭКВИВАЛЕНТНО ПО SQL, НО НЕ ПОКРЫТО НИЧЕМ (F2)

Три места сведены в одну функцию с параметром-именем счётчика — это ровно тот единственный chokepoint,
которого требует канон. Тело повторяет `rev10_tenant_update_65` (`:12503`), добавляя явное
`audit.organization_id = p_organization_id`; «ноль строк — не ошибка» соответствует USING-половине.
Отдельно проверено, что множество допустимых счётчиков закрыто (`23514` на чужом имени).

**Инъекция неисправности (арбитр), продукт возвращён побайтно:**

```
outgoingDeliveryWorker.ts:993  'sent_count'  ->  'error_count'
$ ./node_modules/.bin/vitest --run src/infra/db src/infra/runtime/worker
  Test Files  47 passed | 1 skipped (48)
  Tests  227 passed | 1 skipped (228)
```

То есть отчёт врача по рассылке начинает показывать 0 отправленных и N ошибок — и все 227 тестов,
на которые ссылается сообщение коммита как на доказательство шести переводов, остаются зелёными.
`canonWritersUseNamedRoots.behaviour.test.ts` этот писатель не упоминает вовсе. Отказ дорогой
(клиентский журнал рассылок врёт) и молчаливый — то есть ступень 2 §10a пройдена, тест здесь уместен.

### 2.6. `support_delivery_events` — СЛОМАНО (F1, блокер)

Тело чужого корня снято с ЖИВОЙ DEV и сверено с прежним `INSERT`:

```
$ sudo -u postgres psql -d bcb_webapp_dev -c "select pg_get_functiondef(oid) …"
app.record_integrator_support_delivery_attempt(uuid,text,text,text,text,integer,text,text,timestamptz)
  → те же 11 колонок, тот же частичный ON CONFLICT (integrator_intent_event_id) WHERE … DO NOTHING,
    та же стена organization_id = app.current_org_id(), conversation_message_id = NULL всегда
```
Сама запись по колонкам — да, ровно та же. **Но дверь к ней не существует.** См. §6-а ниже: доказательство
и последствие.

**F6.** Одно расхождение семантики, кроме F1: старый код на дубликате `integrator_intent_event_id`
возвращал `{ id: '' }` и молчал; корень на дубликате СВОЕЙ организации возвращает существующий `id`
(лучше), а на дубликате ЧУЖОЙ организации — `ok:false`/`support_delivery_attempt_conflict`, что новый
вызывающий превращает в исключение → долговечный повтор → DLQ. Раньше это был тихий no-op. Изменение
в сторону громкости, но это изменение, и в отчёте автора оно не названо.

---

## 3. Права каждой миграции (взгляд, AGENTS.md §1)

Пять файлов, в каждом РОВНО один statement, один owner-маркер и один VERIFY-пробник:

```
$ grep -c 'statement-breakpoint' 20260822T1100*.sql   → 0 во всех пяти
$ grep -c 'BCB-MIGRATION-OWNER'  20260822T1100*.sql   → 1 во всех пяти
$ grep -c 'BCB-MIGRATION-VERIFY' 20260822T1100*.sql   → 1 во всех пяти
```

`GRANT`/`REVOKE`/`CREATE ROLE`/`ALTER ROLE`/`ALTER DEFAULT PRIVILEGES`/`CREATE|ALTER|DROP POLICY`
и переключение RLS — **ноль совпадений** (`grep -nEi` по всем пяти, exit 1). §1 соблюдён.

| миграция | объект | владелец тела | что телу нужно, чтобы ИСПОЛНИТЬСЯ | объявлено? |
|---|---|---|---|---|
| `T110000` | `app.integrator_upsert_reminder_rule(23 арг.)` NEW | `app_seam_reminder_patient_owner` | `public.reminder_rules` S+I+U (ON CONFLICT DO UPDATE + RETURNING ⇒ SELECT обязателен); `be_organization_members`/`org_enrollments` SELECT; `integrator.user_reminder_occurrences` SELECT+DELETE | ✅ `privileges…dev.sql:17297,17301,17302` (S/I/U, включая `updated_at`), `:10372,10373` (DELETE был раньше, добавлен колоночный SELECT), политики `rev10_seam_business_173`/`_17` уже содержат эту роль |
| `T110100` | `app.integrator_append_reminder_delivery_event(10)` NEW | `app_seam_delivery_scope_owner` | `reminder_delivery_events` INSERT (DO NOTHING ⇒ SELECT НЕ нужен); `integrator.direct_public_write_retries` SELECT | ✅ INSERT-грант + НОВЫЙ `GRANT SELECT (operation, organization_id, payload, status)` и НОВЫЕ политики `rev10_seam_business_9`/`rev10_named_root_owner_gate_9` |
| `T110200` | `app.integrator_upsert_content_access_grant(11)` NEW | `app_seam_delivery_scope_owner` | `content_access_grants_webapp` S+I+U (DO UPDATE + EXISTS ⇒ SELECT); `direct_public_write_retries` SELECT | ✅ все три гранта + `rev10_seam_business_84`/`_gate_84` |
| `T110400` | `app.integrator_record_notification_delivery_attempt(14)` NEW | `app_seam_delivery_scope_owner` | `notification_delivery_attempts` INSERT; `be_organization_members`/`org_enrollments` SELECT | ✅ INSERT-грант + `rev10_seam_business_120`/`_gate_120` уже содержали роль |
| `T110500` | `app.integrator_increment_broadcast_audit_counter(3)` NEW | `app_seam_delivery_scope_owner` | `broadcast_audit` SELECT (`WHERE` + чтение счётчика) **и НОВЫЙ UPDATE** — таблица была для этой роли read-only | ✅ добавлены оба гранта на пять колонок; политики `rev10_seam_business_65`/`_gate_65` роль уже содержали |

Отдельно по списку брифа:
* `SELECT … FOR UPDATE`/`FOR SHARE` — **ни в одном** из пяти тел (`grep -ni` пуст). Единственный
  `FOR UPDATE` интегратора остался там, где и был (`messengerPhoneBindAudit.ts:116`), и он не в скоупе.
* Запись в ранее read-only таблицу — **есть один случай**, `broadcast_audit` для
  `app_seam_delivery_scope_owner`; объявлен, сгенерирован, политика есть. Это тот самый случай, который
  гейт «объявлено == лежит» не поймал бы, — проверен вручную и закрыт.
* Смена сигнатуры / OID — **нет**: все пять функций новые, чужой корень поддержки не менялся ни телом,
  ни сигнатурой (сверено с DEV).
* Удалённых колонок и осиротевших упоминаний в декларации — нет; диф `declaration.ts` не содержит
  ни одной удалённой строки (`git show … | grep -E "^-"` даёт только заголовок `--- a/…`).

Артефакты действительно порождаются этой декларацией:

```
$ node deploy/postgres/privileges/generate-cli.mjs --all --check                  → EXIT=0, 4/4 побайтно
$ node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only --check → EXIT=0, 2/2 побайтно
```

---

## 4. Порядок миграций (взгляд)

Ledger живой DEV, только чтение:

```
$ sudo -u postgres psql -d bcb_webapp_dev -c \
  "select tag, created_at from drizzle.__drizzle_migrations order by created_at desc limit 6"
20260822T100000_pre_session_email_and_signup_roots_accept_their_named_context | 1800000095000
20260822T090000_the_email_contact_door_names_its_real_index                   | 1800000094000
20260822T010000_the_phone_bind_root_names_the_colliding_account               | 1800000093000
…
$ … "select count(*) from drizzle.__drizzle_migrations where tag like '20260822T1100%'"   → 0
$ … "select count(*) from pg_proc … proname in (пять новых корней)"                        → 0
```

Последняя применённая — `20260822T100000`; все пять новых (`T110000`, `T110100`, `T110200`, `T110400`,
`T110500`) строго больше по имени, ни одна не в ledger, ни один корень ещё не создан на DEV. Порядок
верный, «навсегда pending» не будет. Имена проходят безусловное timestamp-правило:

```
$ node -e "… findMigrationNameViolations(readMigrationFolder('apps/webapp/db/drizzle-migrations'))"
files read: 34
name violations: []
```

Пропуск `T110300` и нумерация в шапках `(1/6) (2/6) (3/6) (5/6) (6/6)` — след отказа заводить шестую
миграцию; на порядок не влияет.

`--preflight` я НЕ гонял: он занимает общую именованную DEV, которую ведёт соседняя ветка, а pending-состав
и отсутствие объектов доказаны чтением выше. Отдельно замечу: preflight и не мог бы поймать F1 — он
компилирует DDL и откатывает, а потерянная возможность живёт в декларации, а не в DDL.

---

## 5. Тесты (тест)

### 5.1. `canonWritersUseNamedRoots.behaviour.test.ts` — поведение, не текст, но с дырой

Тест НЕ читает исходник и не считает вхождения: он подменяет только границу `DbPort` и наблюдает, какой
оператор ушёл в базу, с каким ПОЗИЦИОННЫМ набором аргументов и под каким принципалом. Это наблюдаемый
выход слоя записи, то есть §10a соблюдён; проверка `not.toMatch(/INSERT INTO public\.…/)` — не «нет такой
строки в файле», а «в базу ушёл не тот оператор».

Инъекции неисправности прогнаны мной, каждый раз с возвратом продукта побайтно (`git status --porcelain`
пуст после каждой):

| # | что сломал | результат |
|---|---|---|
| И1 | `notificationDeliveryAttempts.ts`: `input.status` и `reason` местами (и в массиве, и во фрагменте) | **КРАСНЫЙ** — 5 упавших тестов, в т.ч. `notificationDeliveryAttempts.test.ts:255` |
| И2 | `writeReminderRulesDirect.ts`: в аргумент организации подставлен принятый контекст вместо организации строки | **КРАСНЫЙ** — `canonWritersUseNamedRoots.behaviour.test.ts:155`, `Expected a0000000… Received b0000000…` |
| И3 | `outgoingDeliveryWorker.ts:993`: `'sent_count'` → `'error_count'` | **ЗЕЛЁНЫЙ, 227 pass** — дыра F2 |

Базовый прогон до инъекций: `Test Files 2 passed, Tests 18 passed`.

Дыры теста, названные словами:
* **F2** — `broadcast_audit` не покрыт вовсе (И3);
* тест не может поймать F1: последний блок «выбор возможности под корень» строит `caps` руками, а не из
  декларации, поэтому отсутствие ОБЪЯВЛЕННОЙ двери для него невидимо.

### 5.2. `notificationDeliveryAttempts.test.ts` — смысл сузился (F7)

Прежний тест N3 доставал индекс колонки ИЗ РЕАЛЬНОГО текста `INSERT` и сверял с ним значение —
он ловил перестановку в СПИСКЕ КОЛОНОК при неизменном `VALUES`. Новая редакция сверяет полный
позиционный набор аргументов с хардкодом `COL.*`, то есть ровно ту форму, против которой N3 и писался.

Часть смысла честно переехала: списка колонок в вызывающем больше нет. Но отображение «параметр корня →
колонка таблицы» переехало в тело миграции, и его теперь не проверяет НИКТО: ни этот тест, ни декларация
(`relationSurfaces` перечисляет колонки, но не их привязку к параметрам), ни `--check`. Перестановка
`p_status`/`p_reason` в теле `T110400` пройдёт всё зелёным. Тест при этом не ослаблен в том, за что теперь
отвечает вызывающий: И1 доказала, что перестановку в вызове он ловит.

---

## 6. Три заявления автора

### (а) переиспользование чужого корня и брошенное исключение — ЧАСТИЧНО ПРАВДА, и здесь блокер F1

**Про `conversationMessageId` автор прав.** Единственный живой вызывающий передаёт литеральный `null`:

```
$ grep -rn "conversationMessageId" --include=*.ts apps/integrator/src | grep -v '\.test\.'
apps/integrator/src/infra/db/writePort.ts:849:            conversationMessageId: null,
apps/integrator/src/infra/db/directPublic/writeSupportQuestionsDirect.ts:256:  conversationMessageId: string | null;
apps/integrator/src/infra/db/directPublic/writeSupportQuestionsDirect.ts:296:  if (input.conversationMessageId !== null) {
```
Повтор (`directPublicWriteRetryWorker`) проигрывает тот же payload, а `JSON` сохраняет `null`. Непустого
значения сегодня не передаёт никто, потеря связи с сообщением не наступает, отказ громкий. Претензий нет.

**Но сам корень интегратору недоступен.** Автор объявил дверь ключом, который уже занят:

```
$ grep -n "integrator_support_delivery_attempt_record" deploy/postgres/privileges/declaration.ts
2560:    // Корень уже есть и делает ровно это (`integrator_support_delivery_attempt_record` на порту
2562:    integrator_support_delivery_attempt_record: { port: 'integrator', …
3140:    integrator_support_delivery_attempt_record: { port: 'webapp', sessionRole: 'app_staff', …
```

Это один объектный литерал. Побеждает последнее определение — то есть возможность порта ВЕБАППА, а
объявление порта интегратора исчезает до всякой генерации. Доказательство, а не рассуждение:

```
$ node -e "… const caps = decl.portContext.capabilities; …"
matching keys: [ 'integrator_support_delivery_attempt_record' ]
integrator_support_delivery_attempt_record => {"port":"webapp","sessionRole":"app_staff",…}

$ node -e "… renderPortContextRuntimeEnv(decl,'dev','bcb_webapp_dev','integrator') …"
has support_delivery_attempt_record? false
```

Тот же провал видно и в артефактах — на функцию есть РОВНО одна строка каталога, и она webapp:

```
$ grep -n "support-delivery-attempt" deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql
74: (… 'webapp'::app.port_name, 'bcb_dev_webapp_staff'::name, … 'integrator.support-delivery-attempt.record', …)
```
(в дифе коммита к артефактам добавлено 5 строк возможностей, а объявлено было 6 — недостача ровно эта).

Сканирование всей декларации показывает, что дубль ровно один и он внесён этим коммитом:

```
$ node -e "… скан ключей возможностей …"
capability keys scanned: 233
DUPLICATE KEYS: [["integrator_support_delivery_attempt_record",2562,3140]]
```

**Последствие, по коду:** `appendSupportDeliveryEventDirect` (`writeSupportQuestionsDirect.ts:300`) зовёт
`runIntegratorNamedRoot`, тот ставит операцию и уходит в `integratorPortContextPrincipal`, который
выбирает возможность ПО `functionIdentity` и падает, если совпадений не ровно одно
(`portContextRuntime.ts:209-229`, `Missing unique declared integrator port capability for …`). Совпадений
ноль. Дальше `writePort.ts` ловит, ставит долговечный повтор и пишет `warn`; повтор идёт тем же
`writeDirectPublic('support-delivery-append', …, { organizationId })` и падает так же — до
`maxAttempts`, потом `failDirectPublicWriteRetry` (DLQ).

**До коммита этот путь работал в переднем плане:** `app_tenant_service` имеет INSERT на таблице
(`privileges.bcb_webapp_dev.sql:18327 … TO "app_tenant_service"`), и реляционная запись под
организационным принципалом проходила. Значит это не «падал и раньше», а прекращение записи в канон
поддержки. Отказ дорогой (клиника теряет ленту доставки обращений) и молчаливый — он маскируется под
уже привычный «передний план упал, доедет повтором».

**F3 — почему ни один гейт не покраснел.** `port-context-catalog.test.mjs:25-33` сверяет результат
резолвера с `Object.keys(declaration.portContext.capabilities)`, то есть с объектом, который дубль УЖЕ
схлопнул: обе стороны сравнения потеряли строку одинаково. Проверено прогоном:

```
$ node --experimental-strip-types --test deploy/postgres/privileges/port-context-catalog.test.mjs
# pass 7  # fail 0
```
Такая же слепота у `--check` (артефакт совпадает с декларацией, которая уже неполна) и у
seed/verifier-SQL. Дубль ключа в этом каталоге не может поймать никто.

### (б) «`reminder_delivery_events` и `content_access_grants_webapp` зафиксированы как есть» — ПРАВДА

Путь повтора прослежен целиком и не изменился:
* передний план — `writePort.ts:697,758` через `writeDirectPublic` со стратегией `organization`
  (`directPublic/writePort.ts:56-61`). Раньше он падал на отсутствии табличного гранта у
  `app_tenant_service`; теперь падает на отборе возможности — объявленный класс контекста этих двух
  корней `service`/`app_operational_delivery_worker` (`declaration.ts:2550-2559`), а организационный
  принципал требует `tenant_service` (`portContextRuntime.ts:215-216`). Отказ в той же точке и с тем же
  последствием — `queueDirectPublicRetry`;
* повтор — `directPublicWriteRetryWorker.ts:94-101` внутри `runWithInfraPrincipal({portCapability:'delivery'})`,
  без `options.organizationId`, то есть под инфра-принципалом → класс `service` → возможность найдена →
  корень исполняется как `app_operational_delivery_worker`;
* строка повтора берётся `claimDueDirectPublicWriteRetries` ОТДЕЛЬНЫМ закоммиченным запросом до
  вызова, поэтому `EXISTS (… status='processing' …)` в теле корня её видит. Это я проверял специально:
  если бы захват шёл в одной незакоммиченной транзакции с записью, обе таблицы стали бы недостижимы
  навсегда. Не тот случай.

Заявление подтверждено.

### (в) «членства логина не снимались» — ПРАВДА

```
$ git show 8fc46b499 -- deploy/postgres/privileges/declaration.ts | grep -E "^-" | grep -v '^---'
(пусто)
```
Ни одной удалённой строки. `declaration.ts:1851-1855` по-прежнему объявляет `bcb_dev_integrator` членом
`app_integrator_request`, `app_integrator_resolver`, `app_operational_delivery_worker`,
`app_operational_scheduler`, `app_tenant_service`, `app_service`. Шаг 3 действительно не начат.

---

## ВОПРОСЫ ВЛАДЕЛЬЦУ:

1. **F1 — чинить в этой ветке или отдельным ходом?** Правка механическая (переименовать один из двух
   ключей, перегенерировать шесть артефактов), но пункта «починить дверь поддержки» в плане нет, а §24.6
   запрещает мне заводить работу из находки. Прошу решение: доработка идёт в `wt/d17-writers-20260822`
   до приземления, или коммит откатывается целиком?
2. **F3 — заводить ли защиту от повторения дубля ключа?** Сейчас потерю объявленной двери структурно не
   ловит ничто, и это не свойство D17: следующий такой дубль пройдёт так же тихо. Самая верхняя ступень
   §10a здесь — конструкция (например, объявлять каталог списком пар вместо объектного литерала, тогда
   дубль перестаёт быть выразимым), а не ещё один тест. Это отдельная работа, и её в плане нет.
3. **F2 — нужен ли тест шестому писателю?** Отказ дорогой и молчаливый (журнал рассылок врача врёт
   числами), то есть по §10a ступень 2 он проходит. Но заводить его — тоже работа вне плана.
4. **F4** — поправить ли формулировку в переписи и в блоке D17 `WORK_ORDER.md` на «писателей канона из
   §2.2 не осталось»? Это текст владельческого плана, я его не трогаю.

## НЕ СДЕЛАНО:

* `bash deploy/host/migrate-dev.sh --preflight` не гонял — DEV ведёт соседняя ветка, а бриф запрещает
  `--execute`; состав pending и отсутствие пяти корней на DEV доказаны чтением ledger и `pg_proc`.
  Отдельно: preflight и не поймал бы F1.
* Живой прогон записи в базу (реальный вызов корней под реальными принципалами) не делал — бриф прямо
  запрещает любую запись в базу. Поэтому F1 доказан по коду отбора возможности и по сгенерированному
  каталогу, а не наблюдением `42501` на живом вызове.
* Полный `pnpm test:db-privileges` (138 тестов) не перепрогонял целиком: прогнал точечно
  `port-context-catalog.test.mjs` (7 pass) и обе генерации `--check`, потому что предмет сомнения был
  именно в каталоге возможностей.
* Тесты вебаппа не трогал: коммит его кода не меняет, а возможность порта вебаппа на корень поддержки
  осталась ровно той, что была.
* Ничего не чинил и не правил — ни кода, ни миграций, ни декларации. Все три инъекции неисправности
  возвращены побайтно, дерево перед написанием отчёта чистое (`git status --porcelain` пуст).
