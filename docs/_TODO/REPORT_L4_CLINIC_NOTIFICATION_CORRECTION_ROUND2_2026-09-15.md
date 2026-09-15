# Л4 «уведомление клиники о новой заявке», коррекция круга 2 — отчёт 15.09.2026

Клон `/home/dev/dev-projects/bcb-wt-merge-org-gate`, ветка `wt/leads-notify`, голова коррекции
`cabb2fd92` (родитель `5cb6bf7a9`). Оракул — `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`
§8.8. Вход — `docs/_TODO/AUDIT_L4_CLINIC_NOTIFICATION_CORRECTION_2026-09-15.md` (FAIL, Д1 закрыт на
одном чтении из пяти).

## Развилка: выбрана вторая — один именованный корень на весь набор

**Причина — размер поверхности публичной двери, в таблицах.**

| Развязка | Отношений, достижимых РОЛЬЮ публичной двери (`app_tenant_service`) напрямую | Способностей у двери | Чтений на одно уведомление |
|---|---:|---:|---:|
| Запрещённая (объявить `tenant_service`-способности на предпочтения, привязки и подписки) | **4** (`user_channel_bindings`, `user_channel_preferences`, `user_notification_topic_channels`, `user_web_push_subscriptions`) + корень аудитории | 5 | 5 |
| **Выбранная: один корень** | **0** | **1** | **1** |
| Первая (не слать из публичного запроса, отложить на то, что ходит с правами персонала) | 0 при отправке, но **+1 на запись очереди** и **+2 на её вычитку** новым принципалом | ≥2 | 1 + обход очереди |

Замер по выбранной развязке — из сгенерированного артефакта, а не на слово:
`app_tenant_service` стоит в строке `REVOKE ALL PRIVILEGES ON TABLE "public"."user_channel_bindings"
FROM …` (и точно так же на остальных трёх таблицах) — прямого пути у роли двери нет ни к одной из
них. Единственное, что у неё появляется, —
`GRANT EXECUTE ON FUNCTION app.read_clinic_lead_notification_profiles(uuid,text) TO "app_tenant_service"`
(`deploy/postgres/generated/privileges.bcb_webapp_dev.sql:6849`).

**Почему не первая развязка.** В репозитории НЕТ механизма, который уже ходил бы по заявкам с правами
персонала: `apps/webapp/src/app/api/internal/*` — пятнадцать крон-входов, и ни один не разбирает
отложенные уведомления; `relayOutbound` уходит в integrator уже с ГОТОВЫМ получателем и каналом, то
есть разрешение аудитории и способа доставки всё равно остаётся на стороне webapp. Значит первая
развязка — это НОВЫЙ механизм: признак «не уведомлено» на заявке, крон-вход, его регистрация и
принципал, читающий заявки ВСЕХ организаций. Поверхность при этом не исчезает, а переезжает и растёт
(строка выше), уведомление отстаёт от заявки на период крона, а «не изобретай второй механизм, если
один живёт» прямо запрещает это, пока живой механики нет.

**Дом уже строит именно так.** Ровно эта форма стоит у соседей: `app.list_operator_web_push_recipients(text)`
(аудитория веб-пуша оператора — корень сразу исключает заблокированные учётки, отключённый канал и
отсутствие подписки) и `app.read_current_patient_staff_notification_profiles(uuid,text)` (пациентский
случай того же уведомления — весь профиль доставки одним `jsonb`). Новый корень — третий того же вида,
а не отдельная конструкция.

## Что сделано

1. **Один корень вместо пяти чтений.** Миграция
   `apps/webapp/db/drizzle-migrations/20260915T140000_lead_notification_profiles_root.sql` заводит
   `app.read_clinic_lead_notification_profiles(uuid,text)`: получатели (активные `owner`/`admin`
   своей клиники, без слитых и выключенных) вместе с привязками telegram/max, предпочтениями каналов,
   предпочтениями темы и признаком подписки веб-пуша. Прежний корень аудитории
   `app.list_clinic_lead_notification_recipients(uuid)` снят — он был ПЕРВЫМ из тех же пяти чтений, а
   не отдельной дверью; его способность `leads.clinic-notification-audience.read` снята вместе с ним.
   Миграция прежнего корня на DEV никогда не применялась (`to_regprocedure(...) = f` на живой базе),
   поэтому файл переписан на месте, а не поверх (§1: непринятую миграцию переставлять можно).
2. **Права — только в декларации.** `deploy/postgres/privileges/declaration.ts`: способность
   `leads.clinic-notification-profiles.read` (`bcb_dev_webapp_staff → app_tenant_service /
   tenant_service`) и шесть relation surface владельца тела. В самой миграции ни `GRANT`, ни `REVOKE`,
   ни `CREATE POLICY` нет.
3. **Общий путь уведомления не переучен под одно событие.** У
   `notifyDoctorPatientMessageToStaff` появился вход `staffProfiles` — симметрично уже существовавшему
   `staffUserIds` и с той же мотивацией: производитель, чей принципал до этих таблиц не дотягивается,
   разрешает набор своим корнем и отдаёт готовым. Пациентские производители
   (`notifyDoctorPatientMessage`, `notifyDoctorPatientProgramNote`) не затронуты ни строкой поведения.
4. **Разбор ответа — один на оба корня.** `apps/webapp/src/infra/repos/staffNotificationProfilePayload.ts`:
   форма `jsonb` у пациентского и заявочного корней одна, второй разбор той же формы разошёлся бы с
   первым молча. Тип профиля переехал в `modules/doctor-notifications/staffNotificationProfile.ts`.
5. **`ok !== true` — громко.** Чужая организация и неподдерживаемая тема возвращают код отказа, и порт
   бросает. Молчаливый `[]` превратил бы ошибку вызывающего в «никто не подписан».

## Живой вывод — ДО и ПОСЛЕ, дословно

**ДО (и она же инъекция И1).** Профиль не подан, аудитория идёт как `staffUserIds` — то есть ровно
поведение кандидата `e2aa1b309`. Живой прогон против `bcb_webapp_dev` под принципалом ОРГАНИЗАЦИИ:

```text
FAIL  |fast| src/modules/leads/leadClinicNotificationPath.devDbProof.test.ts > путь уведомления о заявке ПОСЛЕ профилей, живой DEV > уведомление о заявке доходит до отправки под принципалом двери заявки
AssertionError: promise rejected "Error: Failed query: select "user_id", "t… { …(2) }" instead of resolving

Caused by: Error: Failed query: select "user_id", "topic_code", "channel_code", "is_enabled", "updated_at" from "user_notification_topic_channels" where "user_notification_topic_channels"."user_id" = $1
params: a4000000-0000-4000-8000-00000000c001
 ❯ Object.listByUserId src/infra/repos/pgTopicChannelPrefs.ts:28:20
 ❯ notifyDoctorPatientMessageToStaff src/modules/doctor-notifications/notifyDoctorPatientMessageToStaff.ts:144:9
 ❯ notifyClinicLeadCreated src/modules/leads/notifyClinicLeadCreated.ts:34:3

Caused by: Error: Missing declared webapp port capability: tenant_service
 ❯ capabilityFor src/infra/db/portContextRuntime.ts:308:26
```

Тот же отказ и та же строка `portContextRuntime.ts:308`, что в обоих кругах аудита.

**ПОСЛЕ.** Тот же файл, тот же принципал, без правок теста:

```text
 RUN  v5.0.0 /home/dev/dev-projects/bcb-wt-merge-org-gate/apps/webapp

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  1.05s

[2026-09-15 07:59:29.773 +0300] INFO (2318971): doctor staff notify channels
    orgId: "a0000000-0000-4000-8000-000000000001"
    event: "doctor_staff_notify.channels"
    userId: "a4000000-0000-4000-8000-00000000c001"
    audience: "staff"
    topicCode: "doctor_patient_messages"
    selectedChannels: []
    hasWebPushSubscription: false
```

Исполнение доходит до решения по каналам — то есть до `relayOutbound`, как требует §8.8. Каналов ноль
и отправки нет потому, что получателем взят несуществующий uuid: отправить ему физически нечем.

**Живое поведение самого корня** — откатываемая проба против `bcb_webapp_dev`, скрипт оставлен в
`docs/_TODO/L4_LEAD_NOTIFICATION_PROFILES_ROOT_PROBE_2026-09-15.sql`. Функция создаётся владельцем из
owner-маркера миграции, права и RLS берутся ДОСЛОВНО из сгенерированного артефакта декларации,
принятый контекст ставится тем же кортежем, что ставит рантайм, вызов идёт под
`session_user = bcb_dev_webapp_staff`, `current_user = app_tenant_service`, затем `ROLLBACK`:

```text
--- ПРОБА 1: своя организация, поддерживаемая тема ---
 {
     "ok": true,
     "profiles": [
         { "max_id": null,       "user_id": "a4000000-0000-4000-8000-00000000a001",
           "telegram_id": "AUDITL4-tg-own-admin", "has_web_push": false,
           "channel_preferences": [],
           "topic_channel_preferences": [ { "is_enabled": true, "topic_code": "doctor_patient_messages",
                                            "channel_code": "telegram" } ] },
         { "max_id": "89002800", "user_id": "b0021a38-fb86-45e9-9aec-d85014e932d4",
           "telegram_id": "364943522", "has_web_push": true,
           "channel_preferences": [ { "channel_code": "web_push", "is_preferred_for_auth": false,
                                      "is_enabled_for_messages": true, "is_enabled_for_notifications": true } ],
           "topic_channel_preferences": [ { "is_enabled": false, "topic_code": "doctor_patient_messages", "channel_code": "max" },
                                          { "is_enabled": false, "topic_code": "doctor_patient_messages", "channel_code": "telegram" },
                                          { "is_enabled": true,  "topic_code": "doctor_patient_messages", "channel_code": "web_push" } ] }
     ]
 }

--- ПРОБА 2: ЧУЖАЯ организация под тем же принципалом ---
 {"ok": false, "code": "lead_notification_organization_mismatch"}

--- ПРОБА 3: неподдерживаемая тема ---
 {"ok": false, "code": "unsupported_lead_notification_topic"}

--- ПРОБА 4: тот же вызов БЕЗ принятого контекста (гейт двери) ---
ERROR:  accepted organization context required
```

Получатели, каналы, привязки и подписка приезжают ОДНИМ вызовом; врач, выключенное членство и слитая
учётка в выдачу не попали; чужая клиника не отдала никого; без принятого контекста дверь закрыта
раньше тела. После `ROLLBACK` на DEV не осталось ничего:

```text
function_rolled_back | fixture_users | fixture_orgs | fixture_bindings | capability_rows | leaked_policies
t                    | 0             | 0            | 0                | 0               | 0
```

**Санкционированный preflight миграции** (owner-aware, rollback-only, из точного клона):

```text
$ bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot
 session_user=bcb_dev_migrator | current_user=app_seam_public_booking_owner | can_create_public=f
CREATE FUNCTION
ROLLBACK
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=1 total=224 …
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)
```

## Таблица инъекций

| # | Что сломано | Что покраснело | Вывод |
|---|---|---|---|
| И1 | в `notifyClinicLeadCreated` профиль подан обратно как `staffUserIds` (поведение кандидата `e2aa1b309`) | живой прогон `leadClinicNotificationPath.devDbProof.test.ts` — 1 failed, `Missing declared webapp port capability: tenant_service` на `pgTopicChannelPrefs.ts:28` | убита: зелёный меряет ИМЕННО отсутствие прямых чтений под принципалом двери |
| И2 | та же поломка, unit-слой | `notifyClinicLeadCreated.unit.test.ts` — 1 failed / 3 passed, `Missing declared webapp port capability: tenant_service (topicChannelPrefs)` | убита: unit держит то же поведение без живой базы |
| И3 | — (инъекция не нужна) | без правок кандидат `e2aa1b309` красный на том же файле | дефект существовал в кандидате как есть |
| И4 | в откатываемой пробе спрошена ЧУЖАЯ организация | `{"ok": false, "code": "lead_notification_organization_mismatch"}` вместо профилей | убита: стена арендатора стоит в теле, а не в вызывающем |
| И5 | в откатываемой пробе снят принятый контекст | `ERROR: accepted organization context required` | убита: без контекста дверь не открывается вовсе |

Все поломки возвращены: `git status --short` после каждого прогона пуст.

## Прогоны и гейты

```text
pnpm exec vitest run --project unit src/modules/doctor-notifications src/modules/messaging \
  src/modules/operator-alerts src/modules/admin-incidents src/modules/leads
 Test Files  12 passed (12)
      Tests  29 passed (29)

node --test deploy/postgres/privileges/*.test.mjs          # tests 388 / pass 188 / fail 0
generate-cli --check                                       # артефакты соответствуют декларации побайтно
generate-cli --all --check --port-context-only             # артефакты соответствуют декларации побайтно
generate-cli --census                                      # ok ×3 базы, 221 ACTIVE relations
check-migration-privileges                                 # OK (225 migration files)
check-c4-migration-owned-function-bodies                   # OK
check-drizzle-migration-order                              # OK
check-legacy-migrations-frozen                             # OK
check-webapp-infra-import-boundary                         # OK
check-no-new-raw-sql                                       # OK (production debt: 0)
tsc --noEmit (apps/webapp)                                 # чисто, кроме двух файлов слияния учёток
eslint по затронутым файлам                                # exit 0, вывод пуст
```

Все прогоны тестов — через общий замок хоста `/home/dev/brain/host-orch/run-tests.sh`.

Два оставшихся `tsc`-расхождения — `src/infra/repos/pgPatientMergeCandidate.ts` и
`src/infra/repos/pgPlatformUserMerge.ts` (`@bersoncare/platform-merge`); в моём диффе этих файлов нет,
они пришли из ветки до меня.

## Ответы на два открытых вопроса прошлого аудита

1. **`reportEmptyAudience` под принципалом организации безопасен** — читать ему нечего:
   `modules/operator-alerts/emptyAudienceRuntime.ts` пишет структурированный лог и зовёт
   зарегистрированный репортер внутри `try/catch`, то есть бросить не может по построению. Пустая
   аудитория заявки даёт лог и нули, а не отказ. Тестом не закрываю: §10a запрещает тест на то, что
   громко держит сама конструкция.
2. **Дубль в живом доказательстве снят.** Случай «публичная дверь заявки (принципал организации)
   правами не отбивается» был подмножеством соседнего и по линейке владельца (§10a, вопрос 3) удалён;
   файл переименован в `leadClinicNotificationProfiles.devDbProof.test.ts` под новый корень.

## НЕ СДЕЛАНО

- **Полный CI (`pnpm run ci`, `scripts/ci-record.mjs`) не запускался** — запрещён брифом; его гоняет
  ведущий после приземления.
- **Миграция на DEV по-настоящему не применялась.** Следствие:
  `src/infra/repos/leadClinicNotificationProfiles.devDbProof.test.ts` в дереве сейчас КРАСНЫЙ, и
  причина не в нём: `Missing unique declared webapp port capability for
  app.read_clinic_lead_notification_profiles(uuid,text)` — `WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON` в
  `.env.dev` переписывает только НАСТОЯЩИЙ `migrate-dev.sh --execute`. Живое поведение корня доказано
  откатываемой пробой выше, но **ведущий обязан прогнать этот файл первым делом после применения
  миграции на DEV** — иначе корень остаётся непроверенным живьём в постоянном окружении.
- **Сквозной прогон «публичная заявка создана → уведомление принято» не выполнялся.** Маршрут
  `api/leads/public/submit` в кандидате есть, но его живой вызов требует подтверждённой сессии,
  капчи и опубликованной записи каталога; принципал двери взят из её кода
  (`withPublicLeadsAccess` → `withExplicitOrganizationPrincipal`), а отказ и его снятие воспроизведены
  отдельно тем же принципалом организации против живой базы.
- **Внешняя доставка (Telegram/MAX/web push) не запускалась** и запуститься не могла: в живом прогоне
  получателем взят несуществующий uuid без привязок и подписок, в откатываемой пробе отправки нет вовсе.
- **Экран не проверялся** — у уведомления экрана нет; автоматические UI-тесты запрещены (§10a).
- **TEST и оба PROD не затрагивались.** Второй Next-сервер из клона не поднимался (§1a).
- **Индекс под новый корень не заводился.** Новых колонок и таблиц миграция не создаёт, а все шесть
  чтений идут по уже существующим ключам (`be_organization_members.organization_id`,
  `platform_users.id`, `*.user_id`); §1 требует индекс для НОВОЙ горячей колонки — таких здесь нет.
- **Отказ уведомления по-прежнему виден только строкой `logger.error`** — ни счётчика, ни алерта.
  В плане владельца строки об этом нет, называю фактом, не задачей.

## Строка вердикта для очереди (в `feat` вносит ведущий, не я)

```
Л4 «уведомление клиники о новой заявке», коррекция круга 2 cabb2fd92 — пять чтений пути сведены в
одно. Публичная дверь (принципал организации) больше не ходит в таблицы персонала напрямую: корень
app.read_clinic_lead_notification_profiles(uuid,text) отдаёт получателей вместе со способом доставки,
старый корень аудитории и его способность сняты. Роль двери на четырёх таблицах персонала остаётся
в REVOKE — прямых грантов ей не выдано. Живой прогон против bcb_webapp_dev зелёный
(apps/webapp/src/modules/leads/leadClinicNotificationPath.devDbProof.test.ts), инъекция возврата к
staffUserIds краснеет тем же `Missing declared webapp port capability: tenant_service`; поведение
корня доказано откатываемой пробой под app_tenant_service, migrate-dev --preflight PASS.
НЕ СДЕЛАНО: полный CI, применение миграции на DEV (и потому leadClinicNotificationProfiles.devDbProof
красный до приземления), сквозной прогон публичной двери.
```
