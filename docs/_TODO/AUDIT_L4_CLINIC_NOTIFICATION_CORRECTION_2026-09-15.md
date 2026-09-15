# Л4 «уведомление клиники о новой заявке» — независимый аудит КОРРЕКЦИИ, 15.09.2026

**ВЕРДИКТ: FAIL.** Д2 и Д3 закрыты и держат под инъекцией. **Д1 закрыт на ПЕРВОМ из пяти чтений
пути и не закрыт на остальных четырёх**: аудитория ушла в именованный корень, а всё, что
`notifyClinicLeadCreated` делает ПОСЛЕ аудитории, осталось прямым реляционным чтением и отбивается
ТЕМ ЖЕ отказом `Missing declared webapp port capability: tenant_service`. Требование оракула §8.8
«уведомлять клинику через `relayOutbound`» в бою по-прежнему не выполняется: до `relayOutbound`
исполнение не доходит. Хуже прошлого круга то, что теперь этот отказ МОЛЧАЛИВЫЙ — Д2 увёл его
в `.catch(log)`.

- Кандидат: клон `/home/dev/dev-projects/bcb-wt-merge-org-gate`, ветка `wt/leads-notify`,
  голова коррекции `c16b75be1`. Автор коррекции — `gpt-5.6-sol high`.
- Оракул: `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md` §8.8.
- Отчёты `AUDIT_L4_CLINIC_NOTIFICATION_2026-09-15.md` и
  `REPORT_L4_CLINIC_NOTIFICATION_CORRECTION_2026-09-15.md` прочитаны как ЗАЯВКИ.
- Находка ниже — НЕ новый скоуп. Прошлый аудит вынес её в свой раздел «НЕ СДЕЛАНО» дословно:
  «остальные четыре чтения внутри `notifyDoctorPatientMessageToStaff` … их отказ сейчас скрыт за
  Д1. После починки Д1 этот вопрос обязан быть закрыт отдельно». Коррекция его не закрыла и в
  своём «НЕ СДЕЛАНО» не назвала.

## Д1 — НЕ ЗАКРЫТ. Дверь заявки отбивается на следующем же чтении

**Чем доказано.** Живой прогон против `bcb_webapp_dev` нового файла
`apps/webapp/src/modules/leads/leadClinicNotificationPath.devDbProof.test.ts` (коммит `e2aa1b309`).
Он вызывает НАСТОЯЩИЙ `notifyDoctorPatientMessageToStaff` с тем же входом, что собирает
`notifyClinicLeadCreated`, и с тем же набором реальных портов, что даёт `buildAppDeps`
(`doctorPatientMessageStaffDeps`), под принципалом ОРГАНИЗАЦИИ — тем самым, который ставит
единственная дверь создания заявки. Аудитория подана готовой, поэтому новый корень тут ни при чём.

Дословный вывод:

```text
FAIL  |fast| src/modules/leads/leadClinicNotificationPath.devDbProof.test.ts > путь уведомления о заявке ПОСЛЕ аудитории, живой DEV > уведомление о заявке доходит до отправки под принципалом двери заявки
Error: Failed query: select "channel_code", "external_id" from "user_channel_bindings" where "user_channel_bindings"."user_id" = $1
params: a4000000-0000-4000-8000-00000000c001
 ❯ Object.loadPlatformUserChannelBindings [as getChannelBindings] src/infra/repos/loadPlatformUserChannelBindings.ts:10:16
 ❯ notifyDoctorPatientMessageToStaff src/modules/doctor-notifications/notifyDoctorPatientMessageToStaff.ts:134:9

Caused by: Error: Missing declared webapp port capability: tenant_service
 ❯ capabilityFor src/infra/db/portContextRuntime.ts:308:26
```

Это ТОТ ЖЕ отказ и та же строка `portContextRuntime.ts:308`, что и в Д1 прошлого круга. Он
детерминированный и от данных не зависит: у класса `tenant_service` реляционного пути нет вовсе.

**Сколько чтений затронуто.** Пять чтений `notifyDoctorPatientMessageToStaff` вызваны по одному под
принципалом организации против живого DEV (одноразовый прогон, в дереве не оставлен). Дословно:

```text
OK    patientStaffNotificationProfiles.listForCurrentPatientOrganization -> null
THROW topicChannelPrefs.listByUserId            -> Missing declared webapp port capability: tenant_service
THROW channelPreferences.getPreferences         -> Missing declared webapp port capability: tenant_service
THROW getChannelBindings                        -> Missing declared webapp port capability: tenant_service
THROW webPushSubscriptions.hasAnyForUserId      -> Missing declared webapp port capability: tenant_service
```

Первое безопасно случайно: `pgPatientStaffNotificationProfiles.ts:108` отдаёт `null` всем, кроме
пациентского принципала, и до чтения не доходит. Остальные четыре — `pgTopicChannelPrefs.ts:27`
(`getDrizzle()`), `pgChannelPreferences.ts:50`, `loadPlatformUserChannelBindings.ts:10`,
`pgWebPushSubscriptions.ts:126` — прямые реляционные и отбиты все. В коде они стоят в одном
`Promise.all` (`notifyDoctorPatientMessageToStaff.ts:134`), поэтому наружу выходит любой из них.

**Проверка, что сам прогон не врёт (зубы).** Те же пять вызовов под принципалом СОТРУДНИКА
(`runWithDbStaffPrincipal`, реальный активный член организации) проходят все:

```text
OK    patientStaffNotificationProfiles.listForCurrentPatientOrganization -> null
OK    topicChannelPrefs.listByUserId -> []
OK    channelPreferences.getPreferences -> [{"channelCode":"telegram",...},…6 каналов]
OK    getChannelBindings -> {}
OK    webPushSubscriptions.hasAnyForUserId -> false
```

То есть красный меряет ПРИНЦИПАЛ ДВЕРИ, а не сломанное окружение и не отсутствие данных.

**Последствие в бою.** Публичный приём Л3 создаёт заявку под принципалом организации. Строка заявки
записана, посетитель получает «принято», уведомление падает на первом же чтении каналов, и с
коррекцией Д2 падает МОЛЧА: `service.ts` гасит его в `void … .catch(reportClinicLeadNotificationError)`,
наружу не выходит ничего, остаётся одна строка `logger.error`. Клиника не узнаёт о заявке НИКОГДА.
Прошлый круг ронял заявку громко; этот круг делает тот же отказ невидимым. §8.8 не выполнен.

**Форма починки (не работа аудитора, называю для экономии круга).** Ровно та же, что применена к
аудитории: четыре чтения уходят в именованный корень (или один корень, отдающий профиль получателя
целиком — `topic_channels + channel_prefs + bindings + has_push` одним `jsonb`, как уже сделано для
пациентского случая в `app.read_current_patient_staff_notification_profiles(uuid,text)`) со своей
объявленной способностью класса `tenant_service` и грантами в `declaration.ts`.

## Д2 — ЗАКРЫТ. Отказ уведомления заявку не отменяет

**Чем доказано.** Oracle прошлого круга не менялся и не ослаблялся: `git log` по
`src/modules/leads/service.unit.test.ts` — последний коммит `bf7f18423` (коммит АУДИТОРА),
кандидат `c16b75be1` этот файл не трогает. Прогон через замок хоста:

```text
$ /home/dev/brain/host-orch/run-tests.sh "… pnpm exec vitest run --project unit src/modules/leads"
 Test Files  2 passed (2)
      Tests  5 passed (5)
```

Зелёный он по ПОВЕДЕНИЮ, а не по переписанному ожиданию — см. инъекцию И1 ниже.

Ошибка не теряется: `buildAppDeps.ts:1315` подаёт `reportClinicLeadNotificationError`, пишущий
`logger.error` с `leadId` и `organizationId`. Модуль infra не импортирует — reporter приходит
инъекцией с края (§5).

## Д3 — ЗАКРЫТ. В мессенджер уезжает абсолютная ссылка

`notifyClinicLeadCreated.ts:30` строит `notificationUrl` от `env.APP_BASE_URL` со снятием одного
завершающего `/`; `nativeRoute` остался относительным. Совпадает с обоими соседними производителями
(`buildDoctorMessagesDeepLink`, `notifyDoctorPatientMessage.ts:50`) и с предписанием шапки самого
типа (`notifyDoctorPatientMessageToStaff.ts:52-55`): `messengerText` склеивается как
`text + "\n\n" + notificationUrl` и уходит в telegram/max, а `nativeRoute` идёт отдельным полем
только в `pushExtras`. Тестом не закрываю: §10a запрещает дублировать тестом контракт и текст.

## Находка ведущего: `v_organization_id := app.current_org_id()` ДО гейта

**Это законное исключение, а не непокрытая дыра.** Механика, а не мнение — три факта из живой базы.

**1. `app.current_org_id()` сам фейл-клоузед и ничего не открывает.** Живое тело
(`pg_get_functiondef` на `bcb_webapp_dev`):

```sql
SELECT organization_id INTO value FROM app_ext.accepted_port_contexts
 WHERE database_oid=(SELECT oid FROM pg_database WHERE datname=current_database())
   AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND cleared_at IS NULL
   AND target_role IN ('app_staff',…,'app_tenant_service','app_worker');
IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='accepted organization context required'; END IF;
```

Функция `STABLE`, побочных действий не имеет, ничего не пишет и наружу ничего не отдаёт: результат
ложится в локальную переменную. Если принятого контекста в транзакции НЕТ — она бросает `42501`
РАНЬШЕ гейта. То есть до `require_accepted_context` выполняется чтение, которое само уже закрыто,
и дверь в этом случае закрывается строго раньше, а не позже.

**2. Прочитать ЧУЖОЙ контекст она физически не может — мешает первичный ключ.**
`app_ext.accepted_port_contexts` (`\d`):

```text
Indexes:
    "accepted_port_contexts_pkey" PRIMARY KEY, btree (database_oid, backend_pid, transaction_id)
```

На транзакцию одного бэкенда существует РОВНО ОДНА строка. `require_accepted_context` проверяет
`session_login`, `target_role`, `context_class`, `purpose`, `typed_args_hash` и `function_identity`
по тем же трём ключевым колонкам — значит по ТОЙ ЖЕ САМОЙ строке. `v_organization_id` не может
оказаться организацией из другого контекста: другого контекста в транзакции нет. Если в транзакции
лежит контекст другого класса (например `app_patient`), `current_org_id()` вернёт его организацию,
но следующей же строкой гейт увидит `target_role <> 'app_tenant_service'` и бросит `42501`;
значение будет отброшено, тело не выполнится.

**3. Это house-форма именно для класса `tenant_service`, а не отклонение.** На живом DEV тем же
`DECLARE v_org uuid := app.current_org_id();` начинаются, в частности, `app.create_public_lead(...)`
— СОСЕДНЯЯ дверь той же работы, которая и создаёт заявку, — а также
`app.list_public_booking_form_fields(text)`, `app.read_acquiring_webhook_booking_payment_setting(text)`
и `app.commit_patient_reminder_materialization(...)`. Все они выданы на `EXECUTE` роли
`app_tenant_service` (`grep GRANT EXECUTE` по `privileges.bcb_webapp_dev.sql`).

**Почему гейт генератора смотрит только на `app_pre_session` и правильно делает.** Проверка
(`generate.mjs`, `preSessionGateVerifierLines`) ловит `:=` в префиксе тела только у DEFINER-корней,
чей `execute` содержит `app_pre_session`. У класса `pre_session` принятого контекста при входе НЕТ
по построению — арендатор ещё не выбран, — и звать `current_org_id()` там нечего. Зато аргументы
там приходят от НЕаутентифицированного посетителя, и любое вычисление в `DECLARE` выполнилось бы с
правами владельца-сеама над непроверенным входом до сверки capability и хэша аргументов. Здесь
вход другой: вызвать функцию может только `app_tenant_service`, уже имеющий принятый контекст, а
единственное довычисление — чтение, которое само требует этого контекста.

**Что при этом правда стоит держать в голове (факт, не задача).** Безопасность формы держится не
формой, а двумя внешними свойствами: фейл-клоузед поведением `current_org_id()` и первичным ключом
на `accepted_port_contexts`. Ослабь любое из них — разреши несколько контекстов на транзакцию или
заставь `current_org_id()` возвращать `NULL` вместо `RAISE` — и форма молча станет дырой, которую
никакая проверка не поймает: гейт генератора ключуется на `app_pre_session`. В плане владельца
строки об этом нет, поэтому в находки не выношу.

## Таблица инъекций

| # | Что сломано | Что покраснело | Вывод |
|---|---|---|---|
| И1 | `void … .catch(report)` возвращён в `await dependencies.notifyClinicLeadCreated?.(lead)` | `созданная заявка возвращается, даже если уведомить клинику не удалось` — 1 failed / 4 passed, `AssertionError: promise rejected "Error: permission denied for table be_org…" instead of resolving` | убита: Д2 держит поведением, а не переписанным ожиданием |
| И2 | принципал двери подменён со СВОЕГО (организация) на сотрудника | мой живой прогон Д1 зеленеет, все пять чтений `OK` | убита: красный меряет принципал двери, а не окружение |
| И3 | — (инъекция не нужна) | прогон Д1 красный БЕЗ поломки, на чистом кандидате | дефект существует в кандидате как есть |

Все поломки возвращены: `git status --short` после каждого прогона пуст.

## Что ещё проверено и держит

**Права и объявление нового корня — полны.** `GRANT EXECUTE ON FUNCTION
app.list_clinic_lead_notification_recipients(uuid) TO "app_tenant_service"`
(`privileges.bcb_webapp_dev.sql:5909`); строка способности
`leads.clinic-notification-audience.read` с `bcb_dev_webapp_staff → app_tenant_service /
tenant_service` (`port-context-capabilities.bcb_webapp_dev.sql:103`); оба relation surface
(`platform_users`, `be_organization_members`) объявлены в `declaration.ts`; в самой миграции
ACL/GRANT/REVOKE нет (§1 соблюдён). RLS владельца тела тоже на месте: у
`app_seam_public_booking_owner` на обеих таблицах стоят политики `rev10_named_root_owner_gate_157`
и `rev10_seam_business_157` (`pg_policy` на живом DEV) — то есть «пустая аудитория по молчаливому
RLS-отказу» здесь не случится.

**Статические гейты — независимо перезапущены, зелёные:**

```text
--check: артефакты соответствуют декларации побайтно.
check-migration-privileges: OK (225 migration files)
check-c4-migration-owned-function-bodies: OK
check-drizzle-migration-order: OK
```

**`eslint` по моему файлу** — `exit 0`, вывод пуст.

**На DEV следов нет.** Мои прогоны фикстур не заводят вовсе (получателем взят несуществующий uuid).
После всех прогонов (включая чужой `leadClinicAdminAudience.devDbProof.test.ts`) замер:
`AUDITL4 platform_users = 0 | чужая организация = 0 | заявок за час = 0`.

## Замечания, НЕ блокирующие приземление

1. **Живое доказательство автора в дереве красное и автором не запускалось.** Его отчёт показывает
   psql-probe и unit-прогон, но не прогон изменённого им
   `leadClinicAdminAudience.devDbProof.test.ts`. Я его запустил — 3 failed:
   `Missing unique declared webapp port capability for app.list_clinic_lead_notification_recipients(uuid)`.
   Причина понятна и сама по себе не дефект: `WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON` в `.env.dev`
   перезаписывает `migrate-dev.sh` при НАСТОЯЩЕМ применении миграции, а брифом оно запрещено.
   Но значит: зелёным этот файл станет только ПОСЛЕ приземления, и ведущий обязан прогнать его
   первым делом после применения миграции на DEV — иначе аудитория остаётся непроверенной живьём
   в постоянном окружении.
2. **Два теста в этом же файле стали дословным дублем.** После правки «`runWithDbStaffPrincipal` →
   `runWithDbOrganizationPrincipal`» случай `публичная дверь заявки (принципал организации) правами
   не отбивается` (строки 136-145) вызывает ровно то же, что и `публичная дверь адресует только
   активных администраторов своей клиники` (строки 120-134), и утверждает подмножество его
   утверждений. По линейке владельца (§10a) второй подлежит удалению: он не ловит ничего, чего не
   ловит первый. Кабинетного принципала в файле больше нет — и это верно, кабинетной двери создания
   заявки не существует.
3. **Отказ уведомления теперь виден только строкой `logger.error`.** Ни счётчика, ни алерта нет.
   В плане владельца строки об этом нет — называю фактом, не задачей.

## НЕ СДЕЛАНО

- **Полный CI (`pnpm run ci`, `scripts/ci-record.mjs`) не запускался** — запрещён брифом; его гоняет
  ведущий после приземления.
- **Миграция на DEV по-настоящему не применялась.** Свой preflight я не гонял: автор показал
  `migrate-dev.sh --preflight` PASS, а статические гейты миграции/прав я перезапустил независимо и
  получил зелёное. Следствие — новый корень живьём из приложения (через `runWebappNamedRoot`) не
  проверен НИКЕМ: у автора он проверен psql-транзакцией, у меня упирается в capability-env.
- **Сквозной прогон «публичная заявка создана → уведомление принято» не выполнялся**: маршрут Л3
  живёт в ветке `wt/leads-public-intake`, в кандидате его нет. Принципал двери взят из кода той
  ветки, а отказ воспроизведён отдельно — тем же принципалом организации против живой базы.
- **Внешняя доставка (Telegram/MAX/web push) не запускалась** и запуститься не могла: получателем
  взят несуществующий uuid без привязок и подписок.
- **Экран не проверялся** — у уведомления экрана нет; автоматические UI-тесты запрещены (§10a).
- **TEST и оба PROD не затрагивались.** Второй Next-сервер из клона не поднимался (§1a).
- **Не проверено, что делает `reportEmptyAudience`** под принципалом организации: он достижим
  только при ПУСТОЙ аудитории, а до него исполнение не доходит из-за Д1. После починки Д1 это
  третий вопрос того же класса.

## Строка вердикта для очереди (в `feat` вносит ведущий, не я)

```
Л4 «уведомление клиники о новой заявке», коррекция c16b75be1 — FAIL независимого аудита
(claude-opus-5, 15.09). Д2 и Д3 закрыты и держат под инъекцией. Д1 закрыт только на чтении
аудитории: остальные четыре чтения пути (topicChannelPrefs, channelPreferences, channelBindings,
webPushSubscriptions) остались прямыми реляционными и под принципалом организации отбиваются тем же
`Missing declared webapp port capability: tenant_service`. Доказано живым прогоном против
bcb_webapp_dev: apps/webapp/src/modules/leads/leadClinicNotificationPath.devDbProof.test.ts
(коммит e2aa1b309). §8.8 не выполнен, и с коррекцией Д2 отказ стал молчаливым.
```
