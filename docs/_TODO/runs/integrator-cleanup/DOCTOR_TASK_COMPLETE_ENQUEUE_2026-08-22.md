# «Выполнить» у задачи врача отдавала 500: очередь доставки писалась мимо объявленной двери

Дата: 22.08.2026 · ветка `wt/task-complete-enqueue-20260822` · роль: worker
Оракул: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, «Б2 — регистрация второй клиники
как это сделал бы живой человек» (кликовая проверка продукта владельцем).

## 1. Путь целиком

| # | Звено | `path:line` |
|---|---|---|
| 1 | Маршрут `POST /api/doctor/tasks/<id>/complete`; гейт роли, entitlement, затем `withDoctorWorkspacePrincipal` (принципал = `app_staff` + организация) | `apps/webapp/src/app/api/doctor/tasks/[taskId]/complete/route.ts:15-38` |
| 2 | Сервис задач специалиста | `apps/webapp/src/modules/specialist-tasks/service.ts:76-79` |
| 3 | Репозиторий: `complete()` открывает транзакцию, закрывает задачу и снимает её не отправленные напоминания | `apps/webapp/src/infra/repos/pgSpecialistTasks.ts:169-198` |
| 4 | **Оператор, который падал:** `terminalizeUnsentSpecialistTaskReminders` — реляционный `UPDATE public.outgoing_delivery_queue` через drizzle под тем же принципалом персонала | `apps/webapp/src/infra/repos/pgOutgoingDeliveryQueue.ts:87-101` (до правки) |

Причина отказа — не логика, а стена. У роли `app_staff` на `public.outgoing_delivery_queue`
**ноль** привилегий и по решению их быть не должно (очередь — поверхность доставки):

```
$ grep -n 'outgoing_delivery_queue' deploy/postgres/generated/privileges.bcb_webapp_dev.sql | grep GRANT
15507: GRANT SELECT ... TO "app_operational_delivery_worker"
15509-15537: гранты только владельцам швов (app_seam_*) и воркеру доставки
# ни одной строки с app_staff / app_patient
```

Поэтому `POST …/complete` отвечал `500`, а в журнале вебаппа стояло
`error: permission denied for table outgoing_delivery_queue, code: '42501'`.

**Тот же оператор стоял ещё на трёх путях того же экрана** (`pgSpecialistTasks.ts` до правки: `create` 119, `update` 155-160, `delete` 203, тик 280-285), поэтому и **постановка** напоминания
по задаче не работала ни разу: `enqueueReady` делал реляционный `INSERT` в ту же очередь.

## 2. Как ставят в очередь соседи

В репозитории уже действует правило: фильтр стоит на ПОСТАНОВКЕ, разбор очереди идёт под
инфраструктурной ролью, а сама постановка проходит объявленным SECURITY DEFINER-корнем, которому
рабочая роль получает **только EXECUTE** — гранта на таблицу не получает никто.

| Сосед | Корень | Кто исполняет |
|---|---|---|
| Напоминание о записи | `app.replace_appointment_reminder_generation(uuid,uuid,timestamptz,text,text)` | `app_tenant_service` |
| Напоминание пациента | `app.commit_patient_reminder_materialization(uuid,text,text,uuid,text,timestamptz,integer,text)` | `app_tenant_service` |
| Произвольное исходящее сообщение | `app.enqueue_outbound_message(uuid,text,text,text,text,text,integer)` | `app_patient`, `app_staff` |
| Суточная сводка оператора | `app.enqueue_operator_health_digest_delivery(text,text,text,integer)` | `app_worker` |
| Код входа по почте | `app.email_auth_enqueue_otp_delivery(uuid,uuid)` | `app_pre_session` |
| Доставка интегратора | `app.enqueue_integrator_outgoing_delivery(...)` | `app_operational_delivery_worker` |

Ближайший по смыслу — первый: он заменяет ПОКОЛЕНИЕ напоминаний одной сущности целиком
(снять не отправленное прошлое + записать названное новое), берёт `p_deliveries` как `text`
и повторяет арендную стену в теле. Существующей двери, которая делает нужное для задачи
специалиста, нет: `app.enqueue_outbound_message` ставит одно сообщение и ничего не снимает,
`app.refresh_specialist_task_reminder_materialization` только считает отпечаток. Поэтому заведён
новый корень — по форме близнеца, без второго пути к той же записи.

## 3. Что изменено

### Новый корень (миграция)

`apps/webapp/db/drizzle-migrations/20260822T121000_the_specialist_task_reminder_generation_gets_a_named_root.sql`

`app.replace_specialist_task_reminder_generation(p_task_id uuid, p_deliveries text, p_reason text)
RETURNS jsonb`, владелец `app_seam_reminder_specialist_owner`, SECURITY DEFINER,
`search_path = pg_catalog`, гейт первым исполняемым оператором.

**ОДНА точка, варианты — её параметры (§5):** создание задачи — непустой `p_deliveries` без прошлого
поколения; правка — непустой список плюс снятие лишнего; завершение и удаление — пустой массив.
Отдельных функций «поставить» и «снять» не заведено; реляционный писатель убран целиком.

**Почему гейт `require_attested_context_for_roles`, а не `require_accepted_context`.** Корень зовётся
ВНУТРИ уже открытой транзакции задачи: закрытие задачи и снятие её напоминаний обязаны быть одним
фактом. `runWebappNamedRoot`, который несёт точный гейт, по построению отказывает внутри транзакции
(`apps/webapp/src/infra/db/runWebappSql.ts:66-68`: «Webapp named root must start before the relation
transaction»). Ровно по этой причине attested-гейт стоит у соседа по тому же шву —
`app.refresh_specialist_task_reminder_materialization(text)`, который зовётся из той же транзакции.
Гейт не выбран рукой: генератор выводит его режим сам (`deploy/postgres/privileges/generate.mjs:1426-1465`
— `exact` для корней из каталога port-context, `attested` для остальных) и приводит тело к
объявленному виду на каждом reconcile.

### Права — только декларация

`deploy/postgres/privileges/declaration.ts:3706-3723` — объявление корня (`execute: ['app_staff']`,
поверхности `public.specialist_tasks` SELECT и `public.outgoing_delivery_queue` SELECT/INSERT/UPDATE).
`deploy/postgres/privileges/declaration.ts:3694-3697` — делегирование (см. §4).
`deploy/postgres/privileges/types.ts:314-315` — две новые ссылки `evidence` (союз закрытый).
Сгенерировано: `deploy/postgres/generated/privileges.{bcb_webapp_dev,bersoncarebot_test}.sql`.
⛔ В миграции нет ни `GRANT`, ни `REVOKE`, ни `CREATE POLICY`, ни `CREATE/ALTER ROLE`.

### Вебапп

| Файл | Что стало |
|---|---|
| `apps/webapp/src/modules/messaging/outgoingDeliveryQueuePort.ts:100-117` (метод — `:109`) | Порт записи схлопнут в один метод `replaceSpecialistTaskReminderGeneration`; `enqueueReady` и `terminalizeUnsentSpecialistTaskReminders` больше нет |
| `apps/webapp/src/infra/repos/pgOutgoingDeliveryQueue.ts:48-79` (метод — `:50`) | Реляционный DML заменён вызовом корня; отпечаток материализации по-прежнему ставит соседняя объявленная дверь; строка без отпечатка роняет транзакцию, как и раньше |
| `apps/webapp/src/infra/repos/pgSpecialistTasks.ts:119, 159, 191, 207, 285` | Пять колл-сайтов (create/update/complete/delete/тик) зовут одну точку |
| `apps/webapp/src/modules/specialist-tasks/prepareReminderDeliveries.ts:40-55` | Возвращаемый тип сужен до `SpecialistTaskReadyOutgoingDelivery[]` — это и есть правда |
| `apps/webapp/src/infra/repos/pgSpecialistTaskReminderGenerationDoor.unit.test.ts` | Новый поведенческий тест (§6) |

## 4. Разбор прав по §1 (что тело трогает и хватает ли объявленного, чтобы оно ИСПОЛНИЛОСЬ)

Миграция создаёт ровно один объект: `app.replace_specialist_task_reminder_generation(uuid,text,text)`.
Ничего не меняет и не удаляет. Тело исполняется под владельцем шва `app_seam_reminder_specialist_owner`.

| Отношение | Операция в теле | Нужное право | Было у владельца шва | Добавлено декларацией |
|---|---|---|---|---|
| `public.specialist_tasks` | `SELECT organization_id … WHERE id = p_task_id` | SELECT (`id`, `organization_id`) | да (SELECT на 13 колонках от `…_fingerprint`) | грант перевыдан тем же набором, новых колонок нет |
| `public.outgoing_delivery_queue` | терминализация `UPDATE … SET status/dead_at/last_error/updated_at`, чтение `kind`/`organization_id`/`event_id`/`status` в `WHERE` | SELECT + UPDATE | да, но на более узком наборе колонок | набор колонок расширен до объявленной поверхности |
| `public.outgoing_delivery_queue` | `INSERT … ON CONFLICT (event_id) DO UPDATE` | **INSERT** | **нет ни одной колонки** | `GRANT INSERT (13 колонок)` — это и есть недостающее право |

- **`SELECT … FOR UPDATE` в теле нет**, поэтому «право требует UPDATE вместо SELECT» здесь не
  срабатывает. Маркер `FunctionRelationSurface.requiredByTrigger` не использован и не нужен:
  ни одна операция тела не выполняется триггером, гейт не обходится.
- **RLS.** На `public.outgoing_delivery_queue` стоит `FORCE RLS`; `app_seam_reminder_specialist_owner`
  уже входит в политики `rev10_named_root_owner_gate_134` и `rev10_seam_business_134`, на
  `public.specialist_tasks` — в `rev10_named_root_owner_gate_191` / `rev10_seam_business_191`.
  Новых политик не потребовалось и не заведено.
- **Владелец шва обходит RLS, поэтому арендная стена повторена в теле дословно:** организация берётся
  из ПРИНЯТОГО контекста порта (`app.current_org_id()` читает `app_ext.accepted_port_contexts`,
  подделать из приложения нельзя), задача обязана принадлежать ей, и все предикаты по очереди
  несут `organization_id = v_org`. Прежний реляционный путь этой проверки не имел вовсе — он
  полагался на RLS, которая под `app_staff` не срабатывала ни разу, потому что запрос падал раньше.
- **Роли рантайма прав на таблицу не получили.** `app_staff` получил `EXECUTE` на корень и больше
  ничего; `app_patient` — ничего.
- **Сигнатура/OID.** Функция новая, `DROP+CREATE` существующей нет, `function_identity` соседей не
  меняется. Индексов миграция не добавляет: новых колонок в `WHERE`/`JOIN`/`ORDER BY` нет,
  терминализация идёт по уже существующему `event_id`-префиксу и `organization_id`.

### Отдельная находка того же разбора, на том же живом пути — и она исправлена здесь же

`app.refresh_specialist_task_reminder_materialization(text)` (EXECUTE у `app_staff`) вызывает
`app.specialist_task_reminder_materialization_fingerprint(uuid)`, у которой EXECUTE только у
`app_operational_delivery_worker`. Генератор выводит внутренней функции attested-гейт ровно под её
`execute`, поэтому под контекстом персонала внутренний гейт отвечал
`42501 accepted port context required` (доказано вживую, см. §5). То есть постановка напоминания по
задаче упала бы и после выдачи прав на очередь — вторым шагом.

Правка — объявленным делегированием, не грантом:
`declaration.ts` → `'app.refresh_specialist_task_reminder_materialization(text)': { …census, delegatesTo:
['app.specialist_task_reminder_materialization_fingerprint(uuid)'] }`. Генератор пропускает контекст
обёртки внутрь по графу `delegatesTo`, а гранты по-прежнему выводит только из `execute`
(`generate.mjs:1396-1420`). В сгенерированном артефакте видно ровно одно изменение — гейт:

```
+ ('app.specialist_task_reminder_materialization_fingerprint(uuid)', 'attested',
   'app.require_attested_context_for_roles(''app_seam_reminder_specialist_owner''::name,
    ARRAY[''app_operational_delivery_worker''::name, ''app_staff''::name]::name[])', …)
```

Прямого `EXECUTE` роль персонала на счётчик отпечатка **не получила** — в диффе грантов по этой
функции нет ни одной строки. Это включено в скоуп, потому что без него живой экран врача остаётся
сломанным: правка очереди без этого доказуемо недостаточна.

## 5. Доказательства (реальный вывод)

### Живой прогон на DEV

Dev-сервер поднят из этого worktree на свободном порту `:5311` (`:5200` занят соседним чатом),
вход врачом `dimmdao@yandex.ru` через `POST /api/auth/email-password/login` с `Origin` того же порта:

```
HTTP/1.1 200 OK
{"ok":true,"redirectTo":"/app/doctor","role":"doctor"}
```

**Постановка** (создание задачи с напоминанием через `POST /api/doctor/tasks`) — строка появилась,
с отпечатком материализации:

```
 event_id        | specialist-task:cd52a370-…:2026-08-29%2010%3A00%3A00%2B03:telegram
 kind            | specialist_task_reminder
 channel         | telegram
 status          | pending
 max_attempts    | 6
 organization_id | a0000000-0000-4000-8000-000000000001
 fp              | 83e8b73b7dc69a1b2d7b7d5ef10dfc9a
```

**Тот самый маршрут** — `POST /api/doctor/tasks/cd52a370-0ef9-45bc-886c-34d381d685bf/complete`:

```
complete -> HTTP 200
```

Строками из базы: задача закрыта, её не отправленное напоминание похоронено с причиной.

```
        completed_at        | status |             last_error
----------------------------+--------+------------------------------------
 2026-08-22 15:54:24.324+03 | dead   | SPECIALIST_TASK_REMINDER_CANCELLED
```

Промежуточный замер по дороге (доказательство находки §4): до правки делегирования тот же
`POST /api/doctor/tasks` отвечал `500`, и в журнале стояло
`error: accepted port context required, code: '42501'`,
`where: PL/pgSQL function app.refresh_specialist_task_reminder_materialization(text) line 36 at assignment`.

**Как объекты попали на DEV.** `bash deploy/host/migrate-dev.sh --execute` брифом запрещён, поэтому
применён точечный маршрут из канона (памятка «reconcile на DEV падает на объектах соседней ветки»):
тело корня создано под объявленным владельцем (временный `CREATE`/`USAGE`, снятые тем же скриптом —
ровно как делает мигратор), затем применены семь `+`-строк `GRANT/REVOKE` СВОЕГО диффа
`privileges.bcb_webapp_dev.sql` и перевыдан гейт `…_fingerprint(uuid)` в объявленном виде. Ни одной
чужой строки прав не тронуто, леджер миграций не менялся — `--execute` ведущего применит миграцию
штатно (`CREATE OR REPLACE` идемпотентен).

### Инъекция неисправности на живом маршруте (продукт возвращён побайтно)

| Что сняли | Маршрут | Ответ |
|---|---|---|
| `REVOKE EXECUTE ON FUNCTION app.replace_specialist_task_reminder_generation FROM app_staff` | `POST …/complete` | **500**, `permission denied for function replace_specialist_task_reminder_generation` |
| право возвращено объявленной строкой | `POST …/complete` | **200** |
| `REVOKE INSERT ON public.outgoing_delivery_queue FROM app_seam_reminder_specialist_owner` | `POST /api/doctor/tasks` с напоминанием | **500**, `permission denied for table outgoing_delivery_queue` |
| право возвращено объявленной строкой | то же | **200** |

### Инъекция неисправности в продукт (возврат прямой записи)

В `pgOutgoingDeliveryQueue.ts` вызов корня временно заменён на `UPDATE public.outgoing_delivery_queue …`:

```
FAIL  src/infra/repos/pgSpecialistTaskReminderGenerationDoor.unit.test.ts
AssertionError: expected 'UPDATE public.outgoing_delivery_queue…' to contain 'app.replace_specialist_task_reminder_…'
Tests  2 failed | 2 passed (4)
```

Файл возвращён побайтно (`md5sum` совпал), тесты снова `4 passed`.

### Гейты

| Проверка | Результат |
|---|---|
| `bash deploy/host/migrate-dev.sh --preflight` | `PASS (post-cutover DEV; rollback-only webapp DDL validation complete)`, `pending=1 total=38` |
| `node deploy/postgres/privileges/generate-cli.mjs --check` | `артефакты соответствуют декларации побайтно` (4 из 4 файлов) |
| `node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only` | оба `port-context-capabilities.*.sql` не изменились (у attested-корня capability не заводится) |
| `node deploy/postgres/privileges/generate-cli.mjs --gaps` / `--census` | `unresolved=0 gaps=0`; census по 217 ACTIVE отношениям — ok |
| `pnpm test:db-privileges` | `pass 142, fail 0, skipped 44` |
| `pnpm --dir apps/webapp typecheck` | зелено |
| vitest: `src/infra/repos`, `src/modules/specialist-tasks`, `src/modules/doctor-notifications`, `src/app/api/doctor/tasks`, `src/modules/messaging` | `Test Files 69 passed \| 3 skipped`, `Tests 271 passed \| 11 skipped` |
| `check-db-chokepoint` · `check-no-new-raw-sql` · `check-queue-port-boundary` | OK · OK (`production debt: 0`) · OK |
| `eslint` по изменённым файлам | чисто |

### Уборка на DEV

Семь пробных задач и их строки очереди удалены (`leftover_tasks 0`, в очереди строк
`kind='specialist_task_reminder'` — `0`); настройка владельца
`user_notification_topic_channels(doctor_specialist_task_reminders, telegram)` возвращена в
`is_enabled=false` вместе с прежним `updated_at`. Она временно включалась, потому что при
выключенном telegram и не настроенном на DEV VAPID у врача не остаётся ни одного канала и
напоминание не материализуется вовсе — то есть INSERT-ветку двери иначе не проверить вживую.

## 6. Поведенческий тест

`apps/webapp/src/infra/repos/pgSpecialistTaskReminderGenerationDoor.unit.test.ts` (4 случая):

1. завершение задачи снимает напоминание ОБЪЯВЛЕННЫМ КОРНЕМ: компилированный SQL содержит
   `app.replace_specialist_task_reminder_generation(`, не содержит `outgoing_delivery_queue`,
   параметры `[taskId, '[]', 'SPECIALIST_TASK_REMINDER_CANCELLED']`, реляционные `tx.insert`/
   `tx.update`/`tx.execute` не вызваны (второго пути нет), и корень зовётся НА ТОЙ ЖЕ транзакции;
2. поколение едет корнем целиком: транскрипт `p_deliveries` сверяется поэлементно (включая
   `successOutcome` и маркер бота), затем ровно один вызов двери отпечатка на записанную строку;
3. строка без отпечатка материализации роняет транзакцию задачи, а не уезжает в доставку;
4. корень, не назвавший записанные строки, — отказ, а не молчаливый успех.

Тест проверяет ПОВЕДЕНИЕ (что реально уходит в базу и что происходит при отказе), а не текст
исходника: инъекция прямой записи выше делает его красным.

## 7. Перепись того же класса рядом

| Место | Принципал | Что делает с очередью | Упало бы сегодня так же? |
|---|---|---|---|
| `apps/webapp/src/infra/repos/pgDoctorBroadcastDelivery.ts:65-81` — рассылки врача | `app_staff` (`withDoctorWorkspacePrincipal`, `actions.ts:101`) | реляционный `INSERT` строк рассылки в `public.outgoing_delivery_queue` | **ДА.** Та же конструкция, та же роль без единой привилегии на таблице. **Живой экран врача — не исправлено, см. вопрос В1** |
| `apps/webapp/src/app-layer/health/adminReminderPipelineMetrics.ts:74` | `app_platform_admin` (`/api/admin/system-health`) | реляционный `SELECT count(*)` по очереди | **ДА**, но отказ проглатывается `try/catch` в `{ok:false, errorCode}` — панель админа молча пустеет. Не экран врача |
| `apps/webapp/src/app/api/internal/specialist-task-reminders/tick/route.ts:37` → `pgSpecialistTasks.enqueueDueReminders` | INFRA-принципал без организации (`enterWithDbInfraPrincipal`) | ставит напоминания по всем врачам и клиникам | **ДА, и до правки, и после.** Новый корень требует организацию принятого контекста, у инфра-принципала её нет; до правки тот же тик падал раньше — на правах таблицы, а затем на гейте отпечатка. Регрессии нет, дефект прежний. См. вопрос В2 |
| `pgAppointmentReminderMaterialization.ts`, `pgPatientReminderMaterialization.ts`, `pgOperatorHealthDigestDeliveries.ts`, `pgAuthEmailOtpDeliveryQueue.ts`, `pgOutboundMessageQueue.ts` | разные | постановка объявленными корнями | нет, эти уже за дверью |
| `deliveryHeartbeatObserver.ts`, `collectAdminSystemHealthData.ts` | `app_worker` | чтение через `app.read_operator_delivery_queue_health()` | нет, это объявленная дверь |

После этой правки `public.outgoing_delivery_queue` из вебаппа реляционно пишет ровно ОДНО место —
`pgDoctorBroadcastDelivery.ts`; всё остальное ходит объявленными корнями.

## ВОПРОСЫ ВЛАДЕЛЬЦУ:

**В1. Рассылки врача — тот же дефект на живом экране, чинить отдельной работой?**
`pgDoctorBroadcastDelivery.ts` пишет очередь реляционно под `app_staff` — конструкция ровно та,
что давала 500 на «Выполнить». Я её НЕ трогал: там одна транзакция на три таблицы
(`broadcast_audit`, `outgoing_delivery_queue`, `broadcast_audit_recipients`) и N строк доставки, то
есть это свой корень со своей арендной стеной и своим разбором прав — отдельная работа, а не «заодно»
в этом коммите. Рекомендация: завести её следующей, до приёмки экрана рассылок.
Мой замер — по правам и по коду (грантов у `app_staff` нет, путь реляционный); кликом не
воспроизводил, потому что рассылка идёт server action и требует живой аудитории.

**В2. Ночной тик напоминаний по задачам ходит без организации — куда его вести?**
`/api/internal/specialist-task-reminders/tick` метёт задачи всех врачей и всех клиник под
инфра-принципалом без организации, поэтому арендную стену новой двери он не проходит (и до правки не
работал вовсе). Два выхода: (а) как у пациентских напоминаний — тик перебирает организации и заходит
в каждую под её принципалом (`app.list_web_push_reminder_organization_ids` уже даёт такой список);
(б) отдельная дверь для инфра-роли, которая берёт организацию из самой задачи. Рекомендую (а):
это уже принятая в репозитории форма, и она не заводит второй способ писать ту же строку.
Safe-default, если решения нет: оставить как есть — тик и сегодня не работает, регрессии он не даёт.

## НЕ СДЕЛАНО:

- **Рассылки врача (`pgDoctorBroadcastDelivery.ts`) не переведены на объявленную дверь** — вопрос В1.
- **Ночной тик `/api/internal/specialist-task-reminders/tick` не работает** — вопрос В2.
  Это не регрессия: он не работал и до правки.
- **Панель напоминаний в админской системе здоровья** читает очередь реляционно и молча пустеет
  (`adminReminderPipelineMetrics.ts`) — не трогал, не экран врача.
- **Колоночная поверхность новой двери взята шире минимально необходимой** — один блок из 13 колонок
  на SELECT/INSERT/UPDATE, как у близнеца `app.replace_appointment_reminder_generation`. Строго по
  телу `UPDATE` не нужны `event_id` и `priority`, а `SELECT` хватает четырёх колонок. Оставил форму
  близнеца, чтобы соседние двери одного шва не разъезжались; сузить — отдельная правка обеих.
- **`tsc -p deploy/postgres/privileges` даёт две ошибки, которых я не заводил** и не чинил (§24.6):
  `declaration.ts:3640` (`'D20 enqueue root inserts idempotently and prunes expired sent rows'`) и
  `declaration.ts:6730` (`'exact UPDATE in migration 0050'`) — обе строки `evidence` не внесены в
  закрытый союз `types.ts`. Проверено `git show HEAD` — обе были красными до моей ветки. Свои две
  ссылки я в союз внёс.
- **`--execute`, деплой, TEST, PROD, push и full CI не запускались** (запрещены брифом).
- Фикстур, одноразовых баз и тестовой машинерии не заводил.
