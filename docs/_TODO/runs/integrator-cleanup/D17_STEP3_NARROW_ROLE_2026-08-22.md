# D17 шаг 3 — членства логина интегратора: замер, развилка, что снято

**Ветка:** `wt/d17-step3-20260822` · **база:** `c61619e85`
**Оракул:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, блок «**D17 — узкая роль в базе.**»
**Это отчёт исполнителя, НЕ приёмка.** Галочку D17 ставит ведущий.

**Короткий итог.** Замер показал, что снимать нечего: **оба членства несущие**, и это доказано не
рассуждением, а живым прогоном на DEV — каждый из семи корней шагов 1/2b достижим ровно ОДНОЙ ролью
логина, а шесть колонок, которые читают живые реляционные читатели интегратора, видны ровно одной
роли. Наивное снятие любого из двух членств уронит либо приём сообщения, либо доставку. Развилка
названа ниже: у `app_operational_delivery_worker` вердикт **(в) нужно как есть**, у
`app_tenant_service` — **(б) нужно, но слишком широко**, и узкая выдача упирается в границу этого же
шага (`--execute` запрещён), поэтому она вынесена отдельным шагом с готовым проектом, а не сделана
вслепую. Попутно удалены три мёртвые функции записи канона поддержки — это было разрешено брифом.

---

## 1. Замер

### 1.1 Что вообще есть у логина (живой кластер, не декларация)

```
$ sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -Atc \
    "select r.rolname, m.inherit_option, m.set_option from pg_auth_members m
       join pg_roles r on r.oid=m.roleid join pg_roles g on g.oid=m.member
      where g.rolname='bcb_dev_integrator' order by 1"
app_integrator_request|f|t
app_integrator_resolver|f|t
app_operational_delivery_worker|f|t
app_operational_scheduler|f|t
app_service|f|t
app_tenant_service|f|t
```

Все шесть членств — `INHERIT=false, SET=true`, и сам логин `rolinherit=f`. **Членство здесь значит
ровно одно: право сделать `SET ROLE`.** Прав от него не «натекает»; поэтому вопрос «можно ли снять
членство» — это вопрос «нужен ли интегратору когда-нибудь `SET ROLE` в эту роль», а не «широка ли
роль».

### 1.2 Насколько широка каждая из двух ролей

```
$ ... -Atc "select count(distinct table_schema||'.'||table_name) from information_schema.table_privileges where grantee='<роль>'"
$ ... -Atc "select count(*) from information_schema.column_privileges where grantee='<роль>'"
```

| роль | отношений | колоночных привилегий | EXECUTE в схеме `app` | кто ещё её носит |
|---|---:|---:|---:|---|
| `app_tenant_service` | **62** | **565** | 27 | `bcb_dev_webapp_staff` (логин вебаппа) |
| `app_operational_delivery_worker` | **4** | **100** | 23 | никто, кроме логина интегратора |

Четыре отношения делового воркера — и все про доставку:

```
integrator.direct_public_write_retries | SELECT,UPDATE | 12 колонок
public.content_access_grants_webapp    | INSERT,SELECT,UPDATE | 12
public.outgoing_delivery_queue         | SELECT,UPDATE | 19
public.reminder_delivery_events        | INSERT,SELECT | 11
```

Шестьдесят два отношения `app_tenant_service` — это ВЕСЬ арендаторский стол вебаппа: `platform_users`
(ПДн, 12 колонок), `user_identity`, `user_phone_history`, `user_contacts`, `platform_user_contacts`,
`be_payments`/`be_payment_intents`/`be_payment_history_events`, `treatment_program_*`,
`patient_bookings`, `symptom_*`, `patient_diary_day_snapshots`, `support_*` и так далее. Это и есть
дословно та «та же роль, что у вебаппа», ради устранения которой существует D17.

### 1.3 Кто из корней требует какую роль — живой прогон, транзакция откачена

На DEV семи корней шагов 1/2b **нет**: их миграции ещё pending (`--preflight` печатает `pending=7`),
а `--execute` ведёт ведущий. Поэтому проба сначала МАТЕРИАЛИЗУЕТ их в откатываемой транзакции
(файлы миграций дословно, каждый под своим объявленным владельцем из заголовка
`BCB-MIGRATION-OWNER`), навешивает `GRANT EXECUTE` дословными строками генератора
(`deploy/postgres/generated/privileges.bcb_webapp_dev.sql`) и зовёт каждый корень последовательно
под каждой из шести ролей логина. Скрипт заканчивается `ROLLBACK`; DEV не изменился.

```
$ sudo -n -u postgres psql -X -q -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -f /tmp/d17s3-live-proof2.sql
                      root                       |             as_role             |                        verdict
-------------------------------------------------+---------------------------------+--------------------------------------------------------
 integrator_upsert_reminder_rule                 | app_tenant_service              | допущен до двери: 42501 accepted port context required
 integrator_upsert_reminder_rule                 | app_operational_delivery_worker | НЕТ ДОСТУПА К ФУНКЦИИ
 integrator_upsert_reminder_rule                 | app_integrator_request          | НЕТ ДОСТУПА К ФУНКЦИИ
 integrator_upsert_reminder_rule                 | app_integrator_resolver         | НЕТ ДОСТУПА К ФУНКЦИИ
 integrator_upsert_reminder_rule                 | app_operational_scheduler       | НЕТ ДОСТУПА К ФУНКЦИИ
 integrator_upsert_reminder_rule                 | app_service                     | НЕТ ДОСТУПА К ФУНКЦИИ
 integrator_record_notification_delivery_attempt | app_tenant_service              | допущен до двери: 42501 accepted port context required
 …                                               | остальные пять                  | НЕТ ДОСТУПА К ФУНКЦИИ
 integrator_increment_broadcast_audit_counter    | app_tenant_service              | допущен до двери: 42501 accepted port context required
 …                                               | остальные пять                  | НЕТ ДОСТУПА К ФУНКЦИИ
 integrator_set_user_channel_bot_blocked         | app_tenant_service              | допущен до двери: 42501 accepted port context required
 …                                               | остальные пять                  | НЕТ ДОСТУПА К ФУНКЦИИ
 integrator_record_messenger_phone_bind_audit    | app_tenant_service              | допущен до двери: 42501 accepted port context required
 …                                               | остальные пять                  | НЕТ ДОСТУПА К ФУНКЦИИ
 integrator_append_reminder_delivery_event       | app_operational_delivery_worker | допущен до двери: 42501 accepted port context required
 …                                               | остальные пять                  | НЕТ ДОСТУПА К ФУНКЦИИ
 integrator_upsert_content_access_grant          | app_operational_delivery_worker | допущен до двери: 42501 accepted port context required
 …                                               | остальные пять                  | НЕТ ДОСТУПА К ФУНКЦИИ
(42 строки)
```

Читается так: «НЕТ ДОСТУПА К ФУНКЦИИ» = `42501 permission denied for function`, то есть роль до двери
не допускается вовсе. «Допущен до двери» = роль прошла проверку EXECUTE и упёрлась в гейт принятого
контекста (`accepted port context required`) — ровно то, что и должно случиться при вызове без
установленной строки контекста. **Каждый корень достижим ровно одной ролью логина: пять —
`app_tenant_service`, два — `app_operational_delivery_worker`. Снятие членства выключает эти корни.**

Полный перечень возможностей порта интегратора по целевой роли (из
`deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql`): `app_tenant_service` —
**13**, `app_operational_delivery_worker` — **11**, `app_service` — 11, `app_integrator_resolver` — 5,
`app_operational_scheduler` — 2, `app_integrator_request` — 1.

Тринадцать возможностей `app_tenant_service`: `calendar.map.delete`, `calendar.map.get`,
`calendar.map.upsert`, `calendar.patient-profile.read`, `calendar.staff-comment.read`,
`integrator.broadcast-audit-counter.increment`, `integrator.messenger-phone-bind-audit.record`,
`integrator.notification-delivery-attempt.record`, `integrator.reminder-occurrence-finalized.record`,
`integrator.reminder-rule.upsert`, `integrator.support-delivery-attempt.record`,
`integrator.user-channel-bot-blocked.set` и — отдельно важное — **`relation`**, сквозная дверь для
произвольного реляционного SQL под этой ролью.

### 1.4 Очередь доставки — живой прогон, транзакция откачена

Та же запись, которой воркер двигает строку очереди (`repos/jobQueue.ts:163`,
`repos/outgoingDeliveryQueue.ts:177,239,283,371,395,415`):

```
             as_role             |                          verdict
---------------------------------+-----------------------------------------------------------
 app_tenant_service              | 42501 permission denied for table outgoing_delivery_queue
 app_operational_delivery_worker | 00000 UPDATE допущен
 app_integrator_request          | 42501 permission denied for schema public
 app_integrator_resolver         | 42501 permission denied for schema public
 app_operational_scheduler       | 42501 permission denied for schema public
 app_service                     | 42501 permission denied for schema public
```

### 1.5 Кто ещё, кроме корней, живёт на `app_tenant_service`

Реляционные читатели `public.*`, оставшиеся в `apps/integrator/**` (шаги 1 и 2b снимали ПИСАТЕЛЕЙ, о
читателях речи не было):

| путь | таблица.колонка |
|---|---|
| `repos/platformUserByChannel.ts:127` | `public.platform_users.integrator_user_id` |
| `repos/platformUserByChannel.ts:128` | `public.user_contacts.platform_user_id` |
| `repos/platformUserByChannel.ts:129` | `public.user_channel_bindings.user_id` |
| `repos/reminders.ts:28,30,32` (`organizationIdForIntegratorUserSql`) | `platform_users`, `org_enrollments.platform_user_id`, `be_organization_members.platform_user_id` |
| `repos/reminders.ts:323,343,374,394` | `public.reminder_rules.integrator_rule_id` / `.organization_id` |
| `repos/adminStats.ts:44,50,51` | `user_contacts`, `user_channel_bindings`, `platform_users` |

Живая проверка «а какая роль это вообще видит»:

```
 rolname                         | pu_integrator_user_id | uc_platform_user_id | ucb_user_id | rr_org | rr_ruleid | oe_pu | bom_pu
---------------------------------+-----------------------+---------------------+-------------+--------+-----------+-------+--------
 app_integrator_request          | f                     | f                   | f           | f      | f         | f     | f
 app_integrator_resolver         | f                     | f                   | f           | f      | f         | f     | f
 app_operational_delivery_worker | f                     | f                   | f           | f      | f         | f     | f
 app_operational_scheduler       | f                     | f                   | f           | f      | f         | f     | f
 app_service                     | f                     | f                   | f           | f      | f         | f     | f
 app_tenant_service              | t                     | t                   | t           | t      | t         | t     | t
```

**Единственная роль.** Это и есть второй, независимый от корней, довод: сквозная дверь `relation`
класса `tenant_service` жива, и снятие членства выключит разрешение получателя (кто это, из какой
клиники) на входящем сообщении.

### 1.6 Что при этом СЛОМАНО и без нас (находки, не работа)

- `repos/broadcastAudit.ts:13` читает `public.broadcast_audit.organization_id`, а этой колонки
  **не видит ни одна из шести ролей логина** (`ba_org = f` у всех; у `app_tenant_service` на этой
  таблице только `blocked_recipient_count, error_count, id, sent_count`). Значит
  `resolveBroadcastAuditOrganizationId` всегда возвращает `null`, и три счётчика рассылки
  (`outgoingDeliveryWorker.ts:268,284,993`) идут в корень без организационного принципала. Это
  ПРЕДШЕСТВУЮЩИЙ дефект, не регрессия шагов 1/2b: прежний реляционный `UPDATE` упирался туда же.
- `repos/reminders.ts:343` внутри `runWithOrganizationPrincipal` делает
  `UPDATE integrator.user_reminder_occurrences`, а `app_tenant_service` на этой таблице имеет только
  `SELECT(rule_id,status)` и `DELETE` — `UPDATE` ей не дан. Тот же класс.
- `repos/integratorUserOrganizationSql.ts` — мёртвый дубль `reminders.ts:22`
  (`organizationIdForIntegratorUserSql`); импортирующих в дереве ноль.

Ни одно из трёх не входит в план владельца по D17 и потому не чинилось (§ «запрет аудит-разгона»).

---

## 2. Развилка — названа явно, решение инженерное

### 2.1 `app_operational_delivery_worker` → **(в) нужно как есть**

Это НЕ остаточная широта. Роль узкая по построению — 4 отношения, 100 колоночных привилегий, всё про
доставку; носит её только логин интегратора (у `bcb_dev_webapp_staff` её нет). Интегратор и ЕСТЬ
воркер доставки (C5/D4: своего пула воркер не открывает, ходит на порт интегратора через `SET ROLE`).
Живой прогон §1.4 показывает, что без неё не двигается ни одна строка очереди, а §1.3 — что без неё
недостижимы `integrator_append_reminder_delivery_event` и `integrator_upsert_content_access_grant`.
Сужать нечего: сузить эту роль — значит сузить саму доставку.

### 2.2 `app_tenant_service` → **(б) нужно, но слишком широко**

Нужно — доказано дважды (пять корней §1.3 и шесть колонок §1.5). Слишком широко — 62 отношения и 565
колоночных привилегий, дословно роль вебаппа, включая ПДн `platform_users` и денежные таблицы, к
которым интегратору дела нет.

**Рекомендуемая узкая выдача (проект, к исполнению отдельным шагом):** новая роль
`app_integrator_tenant_service`, `NOLOGIN NOINHERIT`, и в ней ровно:

1. **Табличные права — только шесть отношений §1.5** (`platform_users`, `user_contacts`,
   `user_channel_bindings`, `org_enrollments`, `be_organization_members`, `reminder_rules`), теми же
   колонками, что у `app_tenant_service` сегодня. Остальные 56 отношений не переносятся. Каталог
   Drizzle интегратора это подтверждает независимо: `schema/integratorPublicProduct.ts` описывает
   ровно `booking_calendar_map` (только через корни), `org_enrollments`, `platform_users`,
   `reminder_rules`, `user_channel_bindings`, `user_contacts` — иных таблиц `public` интегратор
   реляционно не знает.
2. **EXECUTE — только на 13 возможностей §1.3**, ни на одну из остальных 14 функций
   `app_tenant_service`.
3. Тела семи корней принимают новую роль так же, как уже делает
   `app.record_reminder_occurrence_finalized_projection`, — через `CASE` по
   `current_setting('role')` внутри `require_accepted_context` (механика в базе уже есть и работает,
   проверено `pg_get_functiondef`).
4. Дескрипторы возможностей в `declaration.ts` перецеливаются с `app_tenant_service` на новую роль;
   членство логина меняется одно на другое.

**Почему это НЕ сделано этим шагом, а вынесено следующим.** Замена целевой роли под семью
`SECURITY DEFINER`-телами — не аддитивная правка: если колоночная перепись §1.5 неполна хоть на одну
колонку, продукт получит 42501 в живом маршруте, и **деплой этого не поймает** — он ассертит
совпадение декларации с кластером, а не достаточность прав для кода. Единственное, что ловит такую
ошибку, — живой прогон под НОВОЙ ролью, а для этого роль должна существовать в кластере, то есть
нужен `bash deploy/host/migrate-dev.sh --execute`, который этому шагу запрещён явно («DEV ведёт
ведущий»). Приземлять непроверяемую правку прав — это ровно то «снятие вслепую», которым бриф
открывается. Поэтому проект отдан ведущему как шаг 4, вместе с готовой переписью.

---

## 3. Что сделано

### 3.1 Снято членств: НОЛЬ — и это результат замера, а не пропущенная работа

Ни `app_tenant_service`, ни `app_operational_delivery_worker` не оказались лишними. Декларация
(`deploy/postgres/privileges/declaration.ts`) не менялась — оба `--check` генератора совпадают
побайтно. `GRANT`/`REVOKE`/`CREATE POLICY` в миграциях не добавлялось: миграций в этом шаге нет
вообще.

### 3.2 Удалены три мёртвые функции записи канона поддержки (разрешено брифом)

`apps/integrator/src/infra/db/directPublic/writeSupportQuestionsDirect.ts` — минус
`createSupportQuestionDirect` (`:119`, `INSERT public.support_questions`),
`appendSupportQuestionMessageDirect` (`:179`, `INSERT public.support_question_messages`),
`markSupportQuestionAnsweredDirect` (`:231`, `UPDATE public.support_questions`), их типы
ввода/вывода, класс `SupportQuestionsDirectWriteError`, тип `SupportQuestionsWriteFailureCode`,
хелпер `trimmedOrNull` и импорт `runIntegratorSql`.

**Доказательство смерти — перечислением мест, где искал:**

```
$ grep -rn "createSupportQuestionDirect\|appendSupportQuestionMessageDirect\|markSupportQuestionAnsweredDirect\
|CreateSupportQuestionDirect(Input|Result)\|AppendSupportQuestionMessageDirect(Input|Result)\
|MarkSupportQuestionAnsweredDirect(Input|Result)" \
    --include=*.ts --include=*.tsx --include=*.mjs --include=*.js --include=*.json --include=*.md .
```

Вне `docs/` — только собственные определения в самом файле. Ни одного вызывающего: ни в `apps/`, ни в
`packages/`. Живой путь создания вопроса ушёл в D4 на подписанный
`/api/integrator/support/question`, где строку канона пишет вебапп
(`runs/integrator-cleanup/D4_QUESTIONS_OWNERSHIP_REPORT.md`, строка про `question.create`).
Импортирующие модуль (`writePort.ts:39`, `directPublicWriteRetryWorker.ts:3`,
`repos/directPublicWriteRetry.ts:4`, `canonWritersUseNamedRoots.behaviour.test.ts:41`) берут только
`appendSupportDeliveryEventDirect` и его типы — они остались.

Файл ужался со 336 до 120 строк; заголовок переписан под то, что в нём осталось (одна дверь, и она
именованный корень). После удаления в `apps/integrator/**` не осталось реляционных операторов по
`public.support_questions` / `public.support_question_messages`.

### 3.3 Починен красный `tsc` ветки

`directPublic/remainingWritersUseNamedRoots.behaviour.test.ts:91,139,159` передавали
`externalId: 777` (число) в поле типа `string | null` — три `TS2322`, приехавшие с шагом 2b. Проверено,
что они были и ДО моей правки (`git stash` + `tsc --noEmit` на чистом `c61619e85` даёт те же три).
Исправлено на `'777'`; строка `:179` уже была строкой, так что ожидаемое значение аргумента корня не
изменилось. `tsc --noEmit` интегратора теперь `EXIT=0`.

### 3.4 Новый гейт

`deploy/postgres/privileges/integrator-login-membership-load.devDbProof.test.mjs` — живая проба на
DEV, opt-in по `RUN_INTEGRATOR_MEMBERSHIP_DB=1` (в CI не ходит в базу).

Что ловит: снятие любого из двух членств — или сужение прав самих ролей — БЕЗ предварительного
перевода живых путей. Три теста:
1. `app_tenant_service` — единственная роль логина, которой видны шесть колонок §1.5;
2. `app_operational_delivery_worker` — единственная, которой доступна запись очереди и очереди
   повтора;
3. самопроверка батареи: предикат обязан отвечать «нет» роли, которой этих прав не давали
   (`app_integrator_request`), иначе первые два зелены бессмысленно.

Проверка читает ЖИВОЙ каталог прав, а не текст декларации, — поэтому краснеет и когда правят
декларацию, и когда кластер разъезжается с ней. Ничего не пишет: только `SELECT`.

---

## 4. Доказательства (реальный вывод)

**`bash deploy/host/migrate-dev.sh --preflight`** — `EXIT=0`:

```
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev":
  pending=7 total=37 reapplied=0 foreign-ledger-rows=0 relabeled=0 dropped-foreign=0
  dropped-foreign-by-hash=0 unapplied=0
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)
```

**Оба `--check` генератора — побайтно:**

```
$ node deploy/postgres/privileges/generate-cli.mjs --check
… ok bcb_webapp_dev/privileges … ok bersoncarebot_test/allowlist … совпадает побайтно
--check: артефакты соответствуют декларации побайтно.            EXIT=0

$ node deploy/postgres/privileges/generate-cli.mjs --check --port-context-only
ok bcb_webapp_dev/portContext … ok bersoncarebot_test/portContext … совпадает побайтно
--check: артефакты соответствуют декларации побайтно.            EXIT=0
```

**`pnpm test:db-privileges`** — `# tests 189 / # pass 142 / # fail 0 / # skipped 47`
(до шага было 142/0/44; +3 пропуска — это три новых теста гейта, у которых не взведён opt-in).

**Живой прогон на DEV в откаченной транзакции** — §1.3 (42 строки: семь корней × шесть ролей) и §1.4
(очередь доставки × шесть ролей). Оба скрипта заканчиваются `ROLLBACK`; DEV не изменён.

**Гейт, зелёный:**

```
$ RUN_INTEGRATOR_MEMBERSHIP_DB=1 node --test deploy/postgres/privileges/integrator-login-membership-load.devDbProof.test.mjs
ok 1 - app_tenant_service — единственная роль логина, которой видны колонки живых читателей
ok 2 - app_operational_delivery_worker — единственная роль логина, которой доступна запись очереди
ok 3 - самопроверка: предикат отличает роль, которой этих прав не давали
# pass 3   # fail 0
```

**Инъекция неисправности A — субъект без делового членства:**

```
$ RUN_INTEGRATOR_MEMBERSHIP_DB=1 INTEGRATOR_MEMBERSHIP_PROOF_LOGIN=bcb_dev_webapp_staff node --test …
not ok 1 - app_tenant_service — единственная роль логина, которой видны колонки живых читателей
  error: public.platform_users.integrator_user_id (repos/platformUserByChannel.ts:127):
         ожидали ровно app_tenant_service, получили [app_staff, app_tenant_service]
not ok 2 - app_operational_delivery_worker — единственная роль логина, которой доступна запись очереди
  error: логин bcb_dev_webapp_staff не член app_operational_delivery_worker
ok 3 - самопроверка …
# pass 1   # fail 2
```

**Инъекция неисправности B — сломать саму реальность, которую читает гейт (в откате):**

```
BEGIN;
SELECT has_column_privilege('app_tenant_service','public.platform_users','integrator_user_id','SELECT');
 → ДО инъекции      | t
REVOKE SELECT (integrator_user_id) ON TABLE public.platform_users FROM app_tenant_service;
 → ПОСЛЕ инъекции   | f          ← утверждение теста ['app_tenant_service'] превращается в [] → красный
ROLLBACK;
 → после ROLLBACK   | t
```

**Продукт возвращён побайтно:** после обеих инъекций гейт снова `# pass 3 # fail 0` на настоящем
субъекте (вывод выше). Ни один файл при инъекциях не правился — менялся вход и состояние базы внутри
транзакции.

**Статика интегратора:** `npx tsc --noEmit` — `EXIT=0`; `npx eslint` по трём затронутым файлам —
чисто; `npx vitest run src/infra/db/directPublic src/infra/db/repos` — 19 файлов / 96 тестов, все
зелёные.

---

## ВОПРОСЫ ВЛАДЕЛЬЦУ:

Продуктовых развилок здесь нет — вопрос про узкую роль инженерный и решён в §2.2 (проект есть, к
исполнению следующим шагом ведущего с `--execute`). Ниже — три находки §1.6, каждая ЛОМАЕТ живую
функцию и каждая старше шагов 1/2b; ни одна не входит в текст D17, поэтому это вопрос, а не работа:

1. Счётчики рассылки (`sent_count`/`error_count`/`blocked_recipient_count`) не приземляются никогда:
   организацию строки рассылки прочитать нечем. Заводить отдельный пункт плана?
2. Подметание просроченных срабатываний напоминаний (`reminders.ts:343`) требует `UPDATE` на
   `integrator.user_reminder_occurrences`, которого арендаторской роли не давали. Туда же?
3. `repos/integratorUserOrganizationSql.ts` — мёртвый дубль; удалять его бриф не разрешал.

## НЕ СДЕЛАНО:

- **Членства не сняты — ни одно.** Замер (§1.3–1.5, живой) показал, что оба несущие. Это ответ на
  задачу шага, а не пропуск: снятие вслепую уронило бы либо приём сообщения, либо доставку.
- **Узкая роль `app_integrator_tenant_service` не заведена.** Проект в §2.2 полный, но приземлять
  её нечем: живой прогон под новой ролью требует `--execute`, который шагу запрещён. Отдано ведущему.
- **Реляционные ЧИТАТЕЛИ `public.*` из интегратора не переводились на корни** (§1.5). Шаги 1 и 2b
  снимали писателей; читатели — отдельная работа, и она нужна только если ведущий предпочтёт узкой
  роли полное уничтожение сквозной двери `relation`.
- **Три находки §1.6 не чинились** — их нет в плане владельца.
- **Файл `writeSupportQuestionsDirect.ts` не переименован**, хотя после удаления §3.2 в нём остался
  один писатель, и он про `support_delivery_events`, а не про вопросы. Переименование трогает пять
  мест импорта и брифом не разрешено.
- **Полный CI и push не запускались** (запрещено брифом). Галочка D17 не ставилась.
