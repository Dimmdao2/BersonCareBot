# D17 финал — интегратор ходит под СВОЕЙ ролью: что сделано, что измерено, что упёрлось

**Ветка:** `wt/d17-own-role-20260822` · **база:** `e157d5bda`
**Оракул:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, пункт «**D17 — узкая роль в базе**».
**Это отчёт исполнителя, НЕ приёмка.** Галочку D17 ставит ведущий.

**Короткий итог.** Дверей интегратора, которые открывались РОЛЬЮ ВЕБАППА `app_tenant_service`, было
**тринадцать**, а не семь. Десять из них — те, где корень принадлежит интегратору одному — переведены
на его собственную роль `app_integrator_request`: гейт называет её, EXECUTE у `app_tenant_service`
снят, все десять исполнены живьём на DEV под новой ролью и все десять отказывают под старой.
**Три двери не переведены, и это блокер, а не пропуск**: две из них — ОДИН корень на двоих с вебаппом
(вебапп законно вызывает его под `app_tenant_service`), и назвать в их гейте одну роль физически
нельзя; третья — сквозная реляционная дверь, за которой не «шесть колонок», а **60 колоночных
привилегий на семи отношениях**. Поэтому **членство `bcb_dev_integrator` в `app_tenant_service` НЕ
снято** — снять его сегодня значит выключить приём сообщения. Вопрос ведущему — в конце.

---

## 1. Замер — до правки, поимённо

### 1.1 Расхождение с брифом №1: семь корней — это 5 + 2, а не 7

Бриф: «семь именованных корней интегратора называют в гейте `app_integrator_request` вместо
`app_tenant_service`». По факту из семи корней шагов 1/2b на `app_tenant_service` стоят **пять**, а два
стоят на `app_operational_delivery_worker` — той самой роли, которую бриф отдельной строкой запрещает
трогать («она называет отдельное дело — доставку — и уедет к резидентному процессу по D30»).

| корень | миграция | роль в гейте сегодня |
|---|---|---|
| `app.integrator_upsert_reminder_rule(…)` | `20260822T110000_the_reminder_rule_upsert_gets_a_named_root.sql:56` | `app_tenant_service` |
| `app.integrator_record_notification_delivery_attempt(…)` | `20260822T110400_…:45` | `app_tenant_service` |
| `app.integrator_increment_broadcast_audit_counter(uuid,uuid,text)` | `20260822T110500_…:32` | `app_tenant_service` |
| `app.integrator_set_user_channel_bot_blocked(…)` | `20260822T111000_…:46` | `app_tenant_service` |
| `app.integrator_record_messenger_phone_bind_audit(uuid,text,text,text)` | `20260822T111100_…:46` | `app_tenant_service` |
| `app.integrator_append_reminder_delivery_event(…)` | `20260822T110100_…:40` | **`app_operational_delivery_worker`** |
| `app.integrator_upsert_content_access_grant(…)` | `20260822T110200_…:38` | **`app_operational_delivery_worker`** |

**Не подгонял:** два последних не тронуты. Бриф про них говорит явно и говорит «не трогать».

### 1.2 Расхождение с брифом №2: дверей на роли вебаппа было тринадцать

Целевое состояние брифа кончается строкой «членство `bcb_*_integrator` в `app_tenant_service` снято».
Членство — это право `SET ROLE`; чтобы его снять, под этой ролью не должно остаться НИ ОДНОЙ живой
двери порта интегратора. Замер живого каталога
(`deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql`) — их было **тринадцать**:

```
пять корней §1.1                       (переведены)
calendar.map.get      -> app.get_google_calendar_event_id(uuid)                    (переведён)
calendar.map.upsert   -> app.upsert_google_calendar_event_id(uuid,text)            (переведён)
calendar.map.delete   -> app.delete_google_calendar_event_id(uuid)                 (переведён)
calendar.patient-profile.read -> app.read_booking_calendar_patient_profile(uuid)   (переведён)
calendar.staff-comment.read   -> app.read_booking_calendar_latest_staff_comment(uuid) (переведён)
integrator.reminder-occurrence-finalized.record -> app.record_reminder_occurrence_finalized_projection(…)  ⛔ ОБЩИЙ С ВЕБАППОМ
integrator.support-delivery-attempt.record      -> app.record_integrator_support_delivery_attempt(…)       ⛔ ОБЩИЙ С ВЕБАППОМ
relation (functionIdentity NULL)                                                   ⛔ 60 колоночных привилегий
```

Пять календарных корней принадлежат интегратору ОДНОМУ: строки возможностей на них есть только у порта
`integrator`, и вызывают их только `apps/integrator/src/infra/db/repos/bookingCalendarMap.ts:11,24,39` и
`apps/integrator/src/integrations/google-calendar/calendarDescription.ts:69,76`. Это ровно тот же класс,
ради которого существует D17, — интегратор под ролью вебаппа, — поэтому они переведены вместе с пятью.

### 1.3 Расхождение с брифом №3: «шесть колонок» — это шесть ОТНОШЕНИЙ, и колонок там 60

Бриф: «SELECT на шесть колонок, которые читают оставшиеся реляционные ЧИТАТЕЛИ `public.*`». Источник
этой строки — отчёт шага 3 §2.2 п.1, и там сказано «только **шесть отношений**», а шесть колонок в §1.5
были ПРОБАМИ по одной колонке на таблицу, а не полным списком. Живой замер разрыва между ролями:

```
отношение                        колонок SELECT у app_tenant_service | у app_integrator_request | всего в таблице
public.platform_users                            11 |  0 | 23
public.user_contacts                              9 |  0 |  9
public.user_channel_bindings                      6 |  0 |  7
public.org_enrollments                            3 |  0 |  7
public.be_organization_members                    3 |  0 |  9
public.reminder_rules                            24 |  0 | 27
public.broadcast_audit                            4 |  0 | 16
                                          ИТОГО   60 |  0
```

Читатели: `repos/platformUserByChannel.ts:127-129`, `repos/reminders.ts:28,30,32,323,343,374,394`,
`repos/adminStats.ts:44,50,51`, `repos/broadcastAudit.ts:13`. **Не подгонял:** перепись не «шесть», и
выдавать шесть колонок вместо шестидесяти — это выдать заведомо неработающую роль.

---

## 2. Что сделано

### 2.1 Миграция — только имя роли в гейте, десять корней

`apps/webapp/db/drizzle-migrations/20260822T130000_the_integrator_roots_name_the_integrator_role.sql`,
десять statement'ов `CREATE OR REPLACE FUNCTION`, каждый со своим `BCB-MIGRATION-OWNER`
(`app_seam_reminder_patient_owner`, `app_seam_delivery_scope_owner` ×3, `app_seam_identity_lookup_owner`,
`app_seam_patient_booking_owner` ×5).

Тела взяты `pg_get_functiondef` с живого DEV — то есть дословно из кластера, не набраны заново — и в
каждом заменён РОВНО ОДИН литерал: второй аргумент `app.require_accepted_context`,
`'app_tenant_service'::name` → `'app_integrator_request'::name`. Генератор миграции сам отказывал бы,
если бы литерал встретился не один раз (проверка `hits !== 1`) или если бы после замены в теле осталось
`app_tenant_service`. Сигнатура, возврат, владелец, волатильность, `SECURITY DEFINER`, `search_path`,
класс контекста (`tenant_service` — организационный принципал никуда не делся), назначение и хеш
типизированных аргументов — прежние, поэтому OID сохранён и ни одна `regprocedure`-ссылка не протухла.

**Гейт по-прежнему называет РОВНО ОДНОГО законного вызывающего.** Формы со списком ролей и `CASE` по
`current_setting('role')` в миграции нет. `GRANT`/`REVOKE`/`ALTER ROLE` в ней нет тоже (AGENTS.md §1).

### 2.2 Права — только через декларацию

`deploy/postgres/privileges/declaration.ts`, 20 правок и ни одной больше:
- 10 дескрипторов возможностей: `targetRole: 'app_tenant_service'` → `'app_integrator_request'`
  (`contextClass` не тронут — организационный принципал остаётся `tenant_service`);
- 10 объявлений функций: `execute: ['app_tenant_service']` → `['app_integrator_request']`.

Артефакты пересобраны `--all` и `--all --port-context-only`; оба `--check` — побайтно (EXIT=0).
Диффа в артефактах ровно 100 строк на четыре файла и ни одной лишней.

**Класс контекста `tenant_service` с ролью `app_integrator_request` — законная пара, не обход.**
Проверено по телам в базе: `app.install_port_context` в матрице классов требует у `tenant_service`
только `organization_id IS NOT NULL` и пустые actor/subject/integrator_user_id/request_id — про роль в
матрице ничего нет; `app_ext.assert_port_context_claim` для `tenant_service` проверяет существование
организации и роль не читает; `app.current_org_id()` перечисляет `app_integrator_request` в списке
ролей, у которых организация вообще есть.

### 2.3 Второй путь к той же двери закрыт, а не оставлен

Артефакт сначала `REVOKE ALL ON FUNCTION … FROM <все роли>`, потом `GRANT` только объявленному
исполнителю, — поэтому `app_tenant_service` попадает в REVOKE-список и GRANT ей не выдаётся. Живой
кластер после reconcile:

```
                                                 EXECUTE у         EXECUTE у        гейт называет
                                            app_integrator_request  app_tenant_service  свою роль
delete_google_calendar_event_id                       t                    f                t
get_google_calendar_event_id                          t                    f                t
upsert_google_calendar_event_id                       t                    f                t
read_booking_calendar_patient_profile                 t                    f                t
read_booking_calendar_latest_staff_comment            t                    f                t
integrator_increment_broadcast_audit_counter          t                    f                t
integrator_record_messenger_phone_bind_audit          t                    f                t
integrator_record_notification_delivery_attempt       t                    f                t
integrator_set_user_channel_bot_blocked               t                    f                t
integrator_upsert_reminder_rule                       t                    f                t
```

### 2.4 Защита от отката — перепись, а не счётчик

`deploy/postgres/privileges/port-context-catalog.test.mjs` (последний тест) + запись
`integratorDoorsOnTheWebappTenantRole` в `name-census.json`. Перепись называет ПОИМЁННО двери порта
интегратора, всё ещё достижимые через роль вебаппа. Сегодня в ней ровно три (§3). Она обязана пустеть,
а не расти; пока непуста — членство снимать нельзя, и это написано в комментарии теста.

---

## 3. Что НЕ переведено и почему это блокер, а не пропуск

Осталось три двери порта интегратора на `app_tenant_service` (замер по пересобранному артефакту):

```
reminder_occurrence_finalized_record -> app.record_reminder_occurrence_finalized_projection(…)
support_delivery_attempt_record      -> app.record_integrator_support_delivery_attempt(…)
tenant_service                       -> relation-wide (60 колоночных привилегий, §1.3)
```

**Первые две — ОДИН корень на двоих с вебаппом.** Тот же корень вызывает вебапп под логином
`bcb_dev_webapp_staff` и ролью `app_tenant_service`:
`apps/webapp/src/infra/repos/pgReminderProjection.ts:69` и
`apps/webapp/src/infra/repos/pgIntegratorSupportQuestionOwnership.ts:128`; со стороны интегратора —
`apps/integrator/src/infra/db/directPublic/writeReminderProjectionDirect.ts:69` и
`writeSupportQuestionsDirect.ts:33`. Оба вызывающих живые.

Отсюда развилка, и обе её ветки упираются в ПРЯМОЙ запрет:
- назвать в гейте обе роли (список либо `CASE` по `current_setting('role')`, как уже сделано в
  `record_reminder_occurrence_finalized_projection`) — **запрещено брифом дословно**: «Никакой формы
  гейта со списком ролей. Гейт называет ровно одного законного вызывающего»;
- развести корень на два (свой вебаппу, свой интегратору) — против правила одного chokepoint, и против
  решения, уже записанного в самой декларации (`declaration.ts:2562`): «Корень уже есть и делает ровно
  это … второй не заводим, добавляем этой же функции дверь с порта интегратора».

Причины этой развилки в брифе нет, поэтому по п.7 брифа — СТОП и вопрос, а не самодеятельность. Я не
завёл роль, не расширил гейт до списка и не выдал «временно» широкое право.

**Третья — сквозная `relation`.** Её перевод — это не «шесть колонок», а 60 колоночных привилегий на
семи отношениях (§1.3), и цена ошибки в переписи — `42501` в живом маршруте, которого деплой не ловит
(он сверяет «объявлено == лежит в базе», а не достаточность прав для кода). Это отдельная работа с
отдельным живым прогоном, и брифом она названа неверным числом.

**Поэтому членство `bcb_dev_integrator` в `app_tenant_service` НЕ снято.** Состояние членств после
работы — прежнее и полное:
`app_integrator_request, app_integrator_resolver, app_operational_delivery_worker,
app_operational_scheduler, app_service, app_tenant_service`.

---

## 4. Доказательства (реальный вывод)

**Миграция приземлена на DEV.** `bash deploy/host/migrate-dev.sh --preflight` → EXIT=0,
`pending=1 total=40`, `migrate-dev preflight: PASS`. Затем `--execute` → EXIT=0:

```
Drizzle owner-ordered migration committed for "bcb_webapp_dev": pending=1 total=40 reapplied=0 …
access reconcile committed: env=dev database=bcb_webapp_dev; local admin socket=/run/postgresql
DEV port-context runtime env synchronized with declaration
migrate-dev: PASS (pending migrations applied; declaration reconciled and catalog-audited)
```
Верхняя строка журнала: `20260822T130000_the_integrator_roots_name_the_integrator_role`.

**Живой прогон: каждый из десяти корней исполнен под `app_integrator_request`.** Проба идёт настоящим
маршрутом порта — соединение под ЛОГИНОМ `bcb_dev_integrator`, `app.begin_port_context(<capability_id>,
claims)` с реальным хешем типизированных аргументов, затем вызов корня; каждая проба в своей транзакции
и заканчивается `ROLLBACK`. Ошибок ноль:

```
$ psql -f /tmp/d17_probe_app_integrator_request.sql | grep -c '^ERROR'
0
#### get_google_calendar_event_id … upsert … delete … read_booking_calendar_patient_profile …
#### read_booking_calendar_latest_staff_comment … integrator_increment_broadcast_audit_counter …
#### integrator_record_notification_delivery_attempt … integrator_record_messenger_phone_bind_audit …
#### integrator_set_user_channel_bot_blocked … integrator_upsert_reminder_rule
```
(`integrator_record_messenger_phone_bind_audit` вернул `t`, `integrator_upsert_reminder_rule` вернул
`2026-08-22 18:22:13.367638+03` — то есть корни не просто пропущены гейтом, а сделали свою работу.)

**Контр-прогон: те же десять под `app_tenant_service` — отказ на КАЖДОМ, двумя независимыми слоями.**
Через порт — отказ в каталоге возможностей:

```
#### get_google_calendar_event_id :: app_tenant_service
ERROR:  port context capability mismatch
CONTEXT:  PL/pgSQL function install_port_context(uuid,port_context_claims) line 12 at RAISE
… то же на всех десяти
```
Мимо порта, прямым `SET ROLE` — отказ правом:
```
ERROR:  permission denied for function get_google_calendar_event_id
ERROR:  permission denied for function integrator_increment_broadcast_audit_counter
```

**Инъекция неисправности A — вернуть гейт на роль вебаппа (в откатываемой транзакции):**
```
### ДО инъекции  — вызов прошёл
### ИНЪЕКЦИЯ (CREATE OR REPLACE, гейт снова 'app_tenant_service'::name):
    ERROR:  accepted port context required
    CONTEXT: PL/pgSQL function require_accepted_context(…) line 23 at RAISE
             SQL statement "SELECT app.require_accepted_context('app_seam_patient_booking_owner'::name,
                            'app_tenant_service'::name, …)"
### ПОСЛЕ отката — вызов прошёл
```
Ни один файл при инъекции не правился: менялось состояние базы внутри транзакции, и она откачена.

**Инъекция неисправности B — вернуть одну дверь на роль вебаппа в декларации:** перепись краснеет и
называет виновника, а не число:
```
not ok 9 - integrator port doors on the webapp tenant role are named, and the list only shrinks
  integrator port capabilities still reached through the webapp tenant role:
  recorded name census "integratorDoorsOnTheWebappTenantRole" diverged
    appeared (1): get_google_calendar_event_id -> app.get_google_calendar_event_id(uuid)
    vanished (0): —
```
После отката инъекции — `ok 9`, `# pass 9 # fail 0`.

**Вход владельца тремя учётками на `:5200` после reconcile — 200 на всех трёх:**
```
dimmdao@yandex.ru        HTTP 200 {"ok":true,"redirectTo":"/app/doctor","role":"doctor"}
dimmdao@gmail.com        HTTP 200 {"ok":true,"redirectTo":"/app/admin/system-health","role":"admin"}
kinesiospace@gmail.com   HTTP 200 {"ok":true,"redirectTo":"/app/patient","role":"client"}
```

**Оба `--check` генератора — побайтно, EXIT=0** (после пересборки `--all` и `--all --port-context-only`).

**Тесты и статика:**
- `pnpm test:db-privileges` — `# tests 199 # pass 143 # fail 0 # skipped 56` (было 198/142/56; +1 — новый
  тест переписи);
- opt-in DEV-пробы: `RUN_INTEGRATOR_MEMBERSHIP_DB=1 …integrator-login-membership-load…` — 3/0;
  `RUN_PORT_CONTEXT_GATE_DB=1 …port-context-gate-refusal…` — 3/0;
- гейты репозитория: `check-db-chokepoint`, `check-no-new-raw-sql`, `check-queue-port-boundary`,
  `check-test-runner-visibility`, `check-c4-migration-owned-function-bodies` — все OK;
- интегратор: `npx tsc --noEmit` — EXIT=0; `npx vitest run src/infra/db src/integrations/google-calendar`
  — 41 файл, 180 тестов, 0 падений;
- `npx eslint apps/integrator/src/infra/db deploy/postgres/privileges/declaration.ts
  deploy/postgres/privileges/port-context-catalog.test.mjs` — чисто.

---

## 5. Находки, которые НЕ чинились (их нет в плане владельца)

1. **`tsc` декларации был красным ДО меня — и остался.** `npx tsc --noEmit -p
   deploy/postgres/privileges/tsconfig.json` даёт два `TS2322` на `declaration.ts:3640` и `:6730`
   (строки `evidence`, которых нет в объединении допустимых значений). Проверено против чистого
   `e157d5bda`: те же две ошибки, тот же текст. Мои 20 правок к ним отношения не имеют.
2. **`port-context-tenant-claim.devDbProof.test.mjs`, тест 2 — красный на нехватке фикстуры DEV**, не на
   поведении: «DEV-база не содержит фикстуры: клиент, заведённый врачом (зачисление в статусе
   `invited`)». Замер: в `public.org_enrollments` на DEV только `active` (237) и `archived` (2), строк
   `invited` нет ни одной. Остальные 4 теста файла зелёные.
3. **Живой DEV-интегратор ждёт перезапуска.** Он бежит из главного чекаута
   (`/home/dev/dev-projects/BersonCareBot`, pid 2279493, `tsx watch`), а его каталог возможностей
   приезжает из `.env` при старте. Строку `INTEGRATOR_PORT_CONTEXT_CAPABILITIES_JSON` в главном чекауте
   я синхронизировал (разница — ровно те десять `targetRole`, ничего больше, длина +40 = 10×4 символа),
   но процесс держит в памяти старый каталог, и до перезапуска эти десять дверей у него отвечают
   `port context capability mismatch`. Перезапускать чужой процесс не стал.

---

## ВОПРОС ВЕДУЩЕМУ (один, и без него членство не снимается)

`app.record_reminder_occurrence_finalized_projection` и `app.record_integrator_support_delivery_attempt`
— один корень на двоих: вебапп законно ходит в них под `app_tenant_service`, интегратор — под ней же.
Чтобы интегратор ушёл на свою роль, нужно ОДНО из двух, и оба против записанного правила:

- **(а) гейт называет две роли** (список либо `CASE` по `current_setting('role')` — механика уже живёт в
  `record_reminder_occurrence_finalized_projection`). Против прямого запрета брифа.
- **(б) два корня вместо одного** — свой вебаппу, свой интегратору. Против одного chokepoint и против
  решения, записанного в `declaration.ts:2562`.

Моя рекомендация — **(а)**, и вот почему: список ролей в гейте опасен тем, что расширяет круг
вызывающих, а здесь он его НЕ расширяет — обе роли и сегодня вызывают этот корень, просто одна из них
чужая интегратору. Дублирование по (б) создаёт второе тело с той же стеной арендатора, и расходиться
они начнут на первой же правке — это ровно тот класс, который D17 и разбирает. Механика (а) в базе уже
есть, работает и покрыта.

Отдельно нужна санкция на перевод сквозной `relation`-двери: это 60 колоночных привилегий на семи
отношениях (§1.3), отдельный шаг с отдельным живым прогоном под новой ролью.

## НЕ СДЕЛАНО

- **Членство `bcb_*_integrator` в `app_tenant_service` не снято** — блокер §3, снятие сегодня выключает
  приём сообщения. Это ответ на задачу, а не пропуск.
- **Две двери на общие с вебаппом корни не переведены** — вопрос выше.
- **Сквозная `relation`-дверь не переведена**, `app_integrator_request` колоночных прав на семь
  отношений не получил — брифом названо «шесть колонок», по факту 60 (§1.3).
- **`app_operational_delivery_worker` не тронута** — бриф запрещает явно; два корня доставки остались на ней.
- **Три находки §5 не чинились** — их нет в плане владельца.
- **Полный CI, `push`, деплой и запись на TEST не запускались** — запрещено брифом. Галочка D17 не ставилась.
