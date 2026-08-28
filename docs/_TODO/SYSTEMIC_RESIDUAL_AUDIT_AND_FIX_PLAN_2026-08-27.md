# Сводный системный аудит и план исправления — 27.08.2026

## Статус и границы

Проверен `feat/doctor-ui-rebuild` на коммите `b43d159a5bc5328fa79783f16795456104a580a4`.

Это только проверка и планирование. Код, данные, env, службы, расписания и TEST не менялись. PROD не
проверялся и не затрагивался. Три независимых прохода выполнены в чистых worktree без коммитов:

- Claude Sonnet 5, `high` — пациентские медиа, превью и часовые пояса;
- Claude Opus 5, `xhigh` — жизненный цикл данных, дубли, очистка и фоновые задания;
- Claude Opus 5, `xhigh` — роли БД, RLS, публичные пути и runtime-границы.

Исходные машинные отчёты:

- `/home/dev/brain/runs/agent-port/patient-media-time-audit-retry-20260827.json`;
- `/home/dev/brain/runs/agent-port/data-lifecycle-audit-20260827.json`;
- `/home/dev/brain/runs/agent-port/db-runtime-boundaries-audit-20260827.json`.

Выбор моделей сделан по `/home/dev/brain/docs/MODEL_TIERS.md`: длинный, но ограниченный продуктовый
проход отдан Sonnet; два прохода с большим числом связанных контрактов и риском потерять общую нить —
Opus с максимальным reasoning effort.

## Итог простыми словами

Проблема не в том, что «одной таблице забыли один GRANT». Найдено пять системных разрывов:

1. Стена клиники объявляется в одном месте, а фактически генерируется из нескольких независимых списков.
2. Реестр фоновых задач, файлы cron и реально установленное расписание никак не сверяются между собой.
3. Track D перенёс факты в новые канонические хранилища, но не все читатели, очистки и удаления были
   переведены на новые контракты.
4. Политика хранения составлена по заметным на тот момент большим таблицам, а не по полному перечню всех
   журналов и временных хранилищ.
5. Некоторые фоновые процессы проглатывают ошибку и всё равно записывают общий успех.

Поэтому последовательное исправление отдельных 500-х действительно могло находить по одному следующему
симптому. План ниже сначала убирает эти пять источников расхождения, затем исправляет уже известные последствия
и только после этого делает один связный живой проход.

## Ход исправления

Базовая часть этапов 3–4 (C1, C2, C3, D1, E1 + nullable retired id) сведена и развёрнута на TEST в составе
`206be5478`. Последующий живой тик обнаружил остаточный прямой путь media purge и `42501`. Исправление
`7908b5070` заменило все DB-шаги purge одной leased/CAS-функцией, не держит транзакцию во время S3 и удаляет
связанную пациентскую запись атомарно. TEST выявил ещё один общий разрыв маршрутизатора: именованный infra-root
ошибочно требовал параллельную relation-capability. `b3e2e8eb9` убрал это требование без возврата прямого доступа;
после выкатки штатный `media_purge` завершился со статусом `success`, `removed=14`, `errors=0`.
Отчёт и слепой kill-set:
[`runs/integrator-cleanup/SYSTEMIC_LIFECYCLE_C1_E1_D1_2026-08-27.md`](runs/integrator-cleanup/SYSTEMIC_LIFECYCLE_C1_E1_D1_2026-08-27.md).
Там же — обязательный перед landing `migrate-dev.sh --preflight`, handoff scheduler-ветке и два
открытых owner question по срокам хранения.

**Поправка к §D2 ниже:** single-PUT `pending` без сессии, orphan hosted-cover, claim/retry/complete и пустые
S3-ключи теперь принадлежат одной функции `process_media_pending_delete_step`. Отдельная
`stageStaleSinglePutMediaForPurge` и старый orphan-root удалены. Замеренные 7 строк — накопленный вход для этого
тика на момент аудита; к живому прогону накопилось 14 строк, и все они обработаны на TEST без ошибки.

## Подтверждённые находки

### A. Границы доступа и роли БД

#### A1. У `content_access_grants_webapp` фактически нет стены клиники для staff

В декларации таблица помечена как пациентская и принадлежащая организации. Сгенерированная политика для
`app_staff` проверяет только имя роли и не сравнивает `organization_id` с текущей клиникой. В результате
обычный сотрудник, если его код достигает этой таблицы, получает не строки своей клиники, а всю таблицу,
включая служебные токены и метаданные.

Причина: таблица включена в список `specialized`, но отсутствует в другом списке, который добавляет
организационный предикат. Никакой инвариант не проверяет, что `org: true` действительно превратился в
`organization_id = current_org_id()` во всех разрешающих политиках.

Доказательство: `deploy/postgres/privileges/declaration.ts:1045`, `:8180-8226`, `:8551-8589` и
`deploy/postgres/generated/privileges.bcb_webapp_dev.sql:13169-13203`.

#### A2. Пациентские пути читают ту же таблицу, но роль пациента к ней не допущена

`app_patient` сначала явно лишается всех прав на таблицу, а страницы пациентского контента вызывают
`EntitlementsService`, который делает прямой `SELECT`. Для onboarding-пациента это достижимый путь к `42501`
и SSR 500 вместо нормального решения «можно/нельзя показать материал».

Причина общая с A1: access-census знает имя файла, который обращается к таблице, но не знает, под какой
runtime-ролью выполняется этот файл.

Доказательство: `apps/webapp/src/infra/repos/pgEntitlements.ts:10-25`,
`apps/webapp/src/modules/platform-access/resolvePatientSectionContentAccess.ts:11-39`,
`apps/webapp/src/modules/platform-access/resolvePatientCanViewContent.ts:8-20` и сгенерированный revoke/grant
в `deploy/postgres/generated/privileges.bcb_webapp_dev.sql:13168-13172`.

#### A3. Старый и новый способы выбора DB-роли продолжают жить параллельно

Новая схема `port-context` переводит запрос клиники в узкую роль и фоновые задания — в отдельные
операционные роли. Если строка `DB_PRINCIPAL_CONTEXT_MODE` отсутствует или отличается, код выбирает старый
путь: организация становится `app_staff`, а внутренние cron-задачи тоже получают `app_staff` с очищенным
контекстом клиники.

Сейчас DEV/TEST, вероятнее всего, упадут громко из-за отсутствующего старого подключения и строгого RLS, а не
раскроют данные. Но обход новой архитектуры остаётся в продукте и включается одной строкой env. Это тот самый
старый путь, который Track D и слой узких ролей должны были заменить.

Доказательство: `apps/webapp/src/infra/db/withClient.ts:23-58`,
`packages/db-principal/src/index.ts:1041-1130`,
`packages/db-principal/src/webappLockedInfraCronSources.ts:1-36`.

#### A4. Существующие privilege/RLS-гейты не запускаются GitHub CI

В репозитории есть `test:db-privileges`, `test:scripts` и генератор с `--check`, но `.github/workflows/ci.yml`
не запускает ни один из них. Поэтому декларация, генератор и committed SQL могут разойтись, а merge останется
зелёным; ошибка A1 относится ровно к этому классу.

Это не требование гонять полный CI после каждой строки. Нужны быстрые самостоятельные параллельные jobs только
для соответствующих гейтов.

#### A5. Повторяющиеся timestamp миграций — пока только дырка в защите

Есть четыре группы одинаковых timestamp. Текущей зависимости, которая уже ломает порядок, аудитор не нашёл;
это не дефект продукта. Но `migration-order` проверяет форму имени и не проверяет уникальность timestamp, хотя
документация обещает обратное. Исправлять вместе с CI-защитой, не как отдельную срочную миграцию.

### B. Планировщик, cron и наблюдаемость

#### B1. Четыре cron-шаблона стучатся в Next без правильного Host и получают 404
**Статус 27.08.2026:** закрыто в коде. Cron-строки больше не несут заголовков: единственный transport
`deploy/host/run-internal-job.sh` строит surface identity из `APP_BASE_URL`, а `>/dev/null` убран — не-2xx
печатается с телом и роняет прогон. Поведение закреплено `deploy/host/run-internal-job.test.mjs`.


После разделения поверхностей запрос с `Host: 127.0.0.1:6300` отсекается в `proxy.ts` до API-маршрута.
Шаблоны превью, критического health-check и продления тарифа не передают публичный Host; шаблон retention,
созданный позже, передаёт и работает.

Прямая проверка аудитора:

```bash
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:6300/
curl -s -o /dev/null -w '%{http_code}' -H 'Host: test.bersoncare.ru' http://127.0.0.1:6300/
```

Результат: `404`, затем `200`. `curl -fsS ... >/dev/null` скрывает тело ответа, поэтому cron срабатывает, но
приложение не получает тик и не записывает новый статус. Из-за этого одновременно не работают превью, внешний
dead-man's-switch и, вероятно, автоматическое продление тарифа.

#### B2. Часть объявленных retention-задач вообще не имеет расписания
**Статус 27.08.2026:** расписания добавлены в manifest и сгенерированы в `deploy/host/cron.d/` для PROD и
TEST. Установка на хост остаётся операторским шагом.


Для retention HLS proxy errors и product analytics существуют API, права и записи в реестре здоровья, но нет
cron-шаблона, установленного cron и вызова из resident scheduler. На TEST уже есть события старше объявленного
окна.

Команда аудитора для замера остатка:

```bash
sudo -n -u postgres psql -d bersoncarebot_test -Atc "SELECT count(*) FROM product_analytics_events_recent WHERE created_at < now() - interval '90 days';"
```

Результат: `517` строк. Это не проблема прав — право и named root проверены; отсутствует «будильник».

#### B3. Реестр, шаблоны и установленное расписание не имеют общей точки истины
**Статус 27.08.2026:** точка истины — `backgroundJobManifest.ts`; реестр здоровья выводится из него, шаблоны
генерируются, deploy сверяет manifest ⇄ artifacts ⇄ установленное расписание до переключения версии.


В `cronJobRegistry.ts` объявлено больше внутренних заданий, чем поставляется шаблонов, а на хосте установлено
ещё меньше. Deploy не сравнивает эти множества, а здоровье видит только те jobs, которые когда-то уже записали
тик. Новая задача может быть полностью реализована и никогда не запуститься.

### C. Track D: старые потребители нового канона

#### C1. Полное удаление пользователя пропускает часть истории напоминаний

Основной purge удаляет пользовательские таблицы по `platform_user_id`, но
`reminder_occurrence_history` туда не включена. Отдельный старый запрос удаляет её только по
`integrator_user_id`, если такой retired-id ещё есть. FK от `platform_user_id` с cascade также нет.

Живой read-only замер аудитора:

```bash
sudo -n -u postgres psql -d bersoncarebot_test -Atc "SELECT count(*), count(DISTINCT platform_user_id) FROM reminder_occurrence_history WHERE integrator_user_id IS NULL;"
```

Результат: `130|33`. Для этих пользователей полное удаление учётной записи оставит историю напоминаний.
Тот же старый ключ повторён в `apps/webapp/scripts/user-phone-admin.ts`.

#### C2. Журнал попыток стал failure-only, а health-card продолжает искать в нём успехи

Новый контракт верен: реальная неуспешная попытка provider записывается отдельно, а окончательный успех живёт
в канонической очереди/истории. Но `pgNotificationDeliveryAttempts` продолжает считать `status='success'` и
`lastSuccessAt` из failure-only таблицы. Поэтому экран не способен показать здоровую доставку и проглатывает
ошибку чтения в пустом `catch`.

Доказательство: `apps/integrator/src/infra/db/repos/notificationDeliveryAttempts.ts:7-20`,
`apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts:510-550`,
`apps/webapp/src/infra/repos/pgNotificationDeliveryAttempts.ts:68-153`,
`apps/webapp/src/app-layer/health/adminNotificationDeliveryHealthMetrics.ts:88-126`.

#### C3. Объединённая история напоминаний не получила окна хранения

`20260823T220000_consolidate_reminder_occurrence_stores.sql` объединила три физических источника в
`reminder_occurrence_history`, но таблица не попала ни в `prune_retention_target`, ни в таблицу окон. Она
одновременно не очищается по возрасту и может пережить удаление пользователя из C1.

#### C4. Дубли итогового факта доставки действительно удалены

Это важный отрицательный результат: очередь, история возникновения напоминания и журнал неуспешных попыток —
разные факты, а не три копии одного результата. Старые `reminder_delivery_events`,
`user_reminder_delivery_logs`, `reminder_journal`, `delivery_attempt_logs`, `message_retry_jobs`,
`projection_outbox`, `support_delivery_events`, `user_reminder_occurrences` на TEST отсутствуют.

То есть снова объединять очередь, историю и ошибки в одну физическую таблицу из этого аудита не следует.
Исправляется владение жизненным циклом этих трёх разных фактов.

### D. Хранение медиа и фоновые ошибки

#### D1. Multipart cleanup удаляет единственный ключ ретрая, затем скрывает ошибку S3

Сначала транзакция удаляет `media_files` и каскадно session, затем вызывается `AbortMultipartUpload`. Ошибка
S3 проглатывается, `cleaned` увеличивается, а общий tick записывается как успешный. Повторить попытку уже нельзя:
`s3_key` и `upload_id` потеряны.

При другой ошибке row переводится в `expired`, а selector берёт только активные истёкшие session — такая строка
тоже больше никогда не повторяется. `errors > 0` всё равно сопровождается `success: true`.

Доказательство: `apps/webapp/src/app/api/internal/media-multipart/cleanup/route.ts:62-107`.

#### D2. Обычный single-PUT upload может навсегда остаться `pending`

Multipart cleanup видит только строки с `media_upload_sessions`, а pending-delete worker — только
`pending_delete/deleting`. Для `media_files.status='pending'` без session нет владельца очистки.

Команда аудитора:

```bash
sudo -n -u postgres psql -d bersoncarebot_test -Atc "SELECT count(*), min(m.created_at) FROM media_files m LEFT JOIN media_upload_sessions s ON s.media_id=m.id WHERE m.status='pending' AND s.id IS NULL;"
```

Результат: `7|2026-06-14...` на момент аудита.

#### D3. Hosted-video preview — исправлено и принято на TEST для YouTube

Одна общая дверь создаёт служебную media-строку, сервер один раз получает внешнюю обложку, сохраняет её в наше
S3 и отдаёт врачу и пациенту только через `/api/media/{id}/preview/{size}`. Реализация и независимый аудит
сведены коммитом `a259d7836`, полный CI закрыт на `206be5478`; этот SHA развёрнут на TEST.

Живая проверка под штатными owner-ролями врача и пациента подтвердила точную нашу картинку, HTTP `200`,
отсутствие внешних image-source и чистый повторный пациентский проход. Временные продуктовые данные очищены.
VK-код готов, но его живая проверка остаётся внешне заблокирована отсутствующим сервисным токеном VK.

#### D4. Media worker и TEST runtime — подтверждено

Миграции применены на TEST, media worker активен, минутное задание перевело конкретную YouTube-обложку из
`pending` в `ready`, и оба кабинета получили её из нашего storage. Сгенерированное расписание TEST установлено
и `background-jobs-cli --verify-installed --env test` прошло. PROD не затрагивался.

### E. Политика хранения неполна

#### E1. `message_log` не имеет окна хранения

Таблица подключена к реальному writer, содержит текст и ошибку сообщения, но отсутствует в retention-регистре.
На DEV/TEST строк сейчас нет, поэтому текущей утечки не доказано. Это пробел политики, который должен решаться
в общем реестре, а не отдельным случайным cron.

#### E2. Для terminal `media_upload_sessions` нет подтверждённого owner-решения

Завершённые/ошибочные/прерванные session сейчас исчезают только вместе с `media_id`. Нужно зафиксировать,
должны ли terminal-session иметь собственное окно. До решения автоматически добавлять их в purge нельзя.

#### E3. Низкоприоритетные пробелы наблюдаемости
**Статус 27.08.2026:** карта операций выводится из manifest и не собирается без записи для нового семейства;
`cron_maintenance` и `cron_saas_billing` добавлены в TS-словарь и в overlay `saas-isolation-telemetry.sql`
(переприменение overlay — операторский шаг).


`maintenance` и `saas_billing` отсутствуют в карте isolation telemetry. Ошибка записи их тика останется только
warning. Это исправляется общей моделью результата фоновой задачи, не отдельными ручными логами.

## Проверено и не является новой работой

- Часовой пояс пациента и сотрудника синхронизируется с устройством только при расхождении; пояс филиала
  редактируется в настройках локаций. Известные Moscow-hardcode в карточке врача уже отдельно отложены владельцем.
- Файловое пациентское видео идёт через `/api/media/[id]/playback`; hosted-видео — через общий allowlist iframe.
  Автоматически возвращать заглушку «нажмите смотреть» нельзя: владелец это решение отменил.
- Generic bot ingress не создаёт аккаунты. Запись/изменение `platform_users` остаётся только у pre-session
  телефонных дверей с пользовательской сессией.
- Рассылки доступны только брендированной клинике с собственным каналом.
- Обычный public-booking статически использует узкие named roots; живой полный anonymous-сценарий ещё не принят.
- У runtime/seam ролей нет `SUPERUSER` или `BYPASSRLS`.
- Обычный deploy не накатывает старые overlay-файлы; они доступны только destructive reset-пути.
- Терминальные состояния outgoing queue покрыты retention; будущие scheduled rows не являются зависшими.
- Почасовой `db-journal-retention` с правильным Host реально работает.

## Не подтверждено живьём

После исправлений, но не раньше, нужно на TEST доказать:

- полный anonymous booking: создание, чтение, перенос, отмена и история без кабинетной сессии;
- подтверждение контакта, подтверждение записи и реальное напоминание через узкие роли;
- media preview worker, очистки и hosted-preview;
- mTLS refusal с неправильным/просроченным/отозванным сертификатом;
- полный продуктовый проход под patient, doctor, clinic admin и global admin.

PROD и домены не входят в этот проход.

## Системный план исправления

### Этап 1. Одна исполнимая модель доступа

- Сделать декларацию единственным источником tenant/patient wall; удалить влияние несогласованных ручных списков
  либо генерировать их из декларации.
- Добавить инвариант: каждая `org: true` таблица во всех разрешающих tenant-role политиках обязана содержать
  организационный предикат. Инъекция удаления предиката должна красить гейт.
- Расширить access census до `callsite → runtime principal → named root/relation → columns/actions`, чтобы
  пациентский caller нельзя было объявить на staff-only relation.
- Для entitlements выбрать одну узкую дверь: пациент читает только собственный активный доступ и только нужные
  поля; staff остаётся внутри своей клиники. Прямой table-wide patient grant не выдавать.
- Удалить production-ветвление на старую principal→role модель. Неверный/отсутствующий mode должен останавливать
  старт, а не выбирать legacy.

Приёмка этапа: статический инвариант, privilege/RLS oracle с отрицательной инъекцией, живые A/B clinic probes и
patient onboarding/content probes на DEV, затем TEST.

**Статус 27.08 (ветка `wt/systemic-access-20260827`).** Код закрыт, живая приёмка — нет.

- [x] Декларация — единственный источник. Второй ручной список (`REV10_EXPLICIT_ORG_COLUMN` в
      `declaration.ts`) удалён; организационный предикат выводится из `org === true` самой декларации, а
      расхождение с первым списком, которым и была A1, стало невыразимым. Семь `saas_*` таблиц несут
      `organization_id` и были объявлены без `org`, что и делало вывод невозможным, — объявление исправлено.
- [x] Инвариант: `tenantPredicateViolations` в `deploy/postgres/privileges/tenant-wall.mjs` (том же файле, что
      уже был единственным источником стены). Проверяется по объявленной политике, а не по тексту SQL.
      Стоит в `generatePrivilegesSql`: генератор не отдаёт артефакт со стеной-дырой, поэтому краснеет и
      `--check`, и каждая пруф-фикстура. Инъекция удаления предиката проверена, `exit 1`.
- [x] Access census знает runtime principal: `assertPatientCallsiteDoors`
      (`deploy/postgres/privileges/access-census.mjs`, гейт в `generate-cli.mjs --census`). Принципал не
      объявляется, а выводится: модуль, достижимый ТОЛЬКО с пациентской поверхности (граф импортов плюс
      разбор `deps.<ключ>` через `buildAppDeps`), исполняется под пациентским принципалом. Такому модулю
      запрещено отношение без пациентской двери.
- [x] Одна узкая дверь entitlements: `app_patient` получает SELECT ровно на шесть колонок
      `content_access_grants_webapp` (`token_hash` и интеграторские идентификаторы не выдаются), а политика
      сужает строки до «своя клиника + свой человек + не отозван + не истёк». Ветка сотрудника впервые
      сравнивает организацию. Новый DB root не понадобился: права и RLS целиком принадлежат генератору,
      миграции здесь нет.
- [x] Продуктовое ветвление на старую модель снято: `resolveWebappDbPrincipalContextMode`
      (`apps/webapp/src/config/env.ts`) отказывает старту при отсутствующем или ином режиме;
      `infra/db/withClient.ts` спрашивает ту же одну точку. Тестовый harness называет режим явно и работает.
- [ ] Живые A/B clinic probes и patient onboarding/content probes на DEV, затем TEST. **Не сделано** —
      выполняется вместе с этапом 7; общий DEV/TEST в этот ход не занимался.

Слепой kill-set, таблица «что сломано → что покраснело» и прогоны:
[`runs/systemic-access/BLIND_KILL_SET_2026-08-27.md`](runs/systemic-access/BLIND_KILL_SET_2026-08-27.md).

### Этап 2. Один manifest фоновых заданий — сделано в коде (`wt/systemic-scheduler-20260827`)

- Свести route, method, principal, cadence, timeout, staleness, Host/Origin и среду в один typed manifest.
- Генерировать из него host schedule или проверяемые шаблоны; убрать ручные curl-копии из runbook.
- На deploy сравнивать manifest, поставляемые artifacts и реально установленное расписание. Лишнее и
  отсутствующее — fail-loud до переключения версии.
- Внутренний HTTP-клиент должен формировать корректную surface identity сам; cron не должен знать детали
  branding proxy.
- Health должен различать `никогда не запускалось`, `просрочено`, `последний запуск упал` и `запуск успешен`.
  Dead-man's-switch остаётся внешним по отношению к наблюдаемому scheduler.

Приёмка этапа: на TEST каждая обязательная job получает свежий тик, а намеренно удалённая из установленного
schedule job красит deploy/reconcile-проверку до запуска продукта.

**Что уже стоит в репозитории.**

- `apps/webapp/src/modules/operator-health/backgroundJobManifest.ts` — единственный typed manifest (route,
  method, principal, cadence, timeout, staleness, surface identity, среда, обязательность, dead-man-признак).
  `cronJobRegistry.ts` и `reconcileJobKeys.ts` стали его проекциями, второй рукописной копии не осталось.
- `deploy/host/cron.d/*.cron.template` — 20 файлов (10 заданий × PROD/TEST) генерируются
  `deploy/host/background-jobs-cli.mjs --write`; `--check` красит расхождение и входит в `pnpm test:scripts`.
- `deploy/host/run-internal-job.sh` — единственный transport. Cron-строка не содержит ни `Host`, ни `Origin`,
  ни `curl`, ни `>/dev/null`; identity строится из `APP_BASE_URL` тем же `webapp-health-host.mjs`, которым
  пользуется health-проверка деплоя. Любой не-2xx, timeout или отказ сети печатается с телом ответа, уходит в
  syslog (`bersoncarebot-cron`) и даёт ненулевой код возврата.
- `--verify-installed --env prod|test` вызывается в `deploy-prod.sh`, `deploy-webapp-prod.sh` и `deploy-test.sh`
  **до** рестарта служб: обязательное задание без установленного расписания, файл без записи в manifest и строка
  мимо общего transport роняют выкатку и печатают точные `install`-команды.
- Появились отсутствовавшие расписания (B2): `hls_proxy_retention`, `product_analytics_retention`,
  `playback_retention`, `media_purge`, `media_multipart`, `media_transcode_reconcile` — и их TEST-двойники.
- `classifyOperatorCronJobHealth` различает `never_run` / `stale` / `last_run_failed` / `success`; `reason`
  доехал до payload `cronJobs`.
- E3: карта isolation telemetry выводится из manifest (`cronIsolationOperations.ts`), добавлены операции
  `cron_maintenance` и `cron_saas_billing` — в TS-словаре и в `deploy/postgres/saas-isolation-telemetry.sql`.

**Что осталось оператору (хост не трогали).**

1. Установить сгенерированные файлы в `/etc/cron.d` от root на PROD и TEST — до этого первый же deploy
   красит `--verify-installed`. Команды печатает сам гейт.
2. Переприменить `deploy/postgres/saas-isolation-telemetry.sql` на DEV/TEST/PROD, иначе новые операции
   `cron_maintenance`/`cron_saas_billing` отвергнет закрытый словарь БД.
3. Живая приёмка на TEST: свежий тик у каждой обязательной job и красный deploy-гейт при намеренно снятом
   расписании.

### Этап 3. Полный реестр жизненного цикла данных

- Инвентаризировать все журналы, очереди, попытки, временные upload/session stores и пользовательские проекции,
  а не только самые большие таблицы.
- Для каждой физической сущности зафиксировать: зачем существует, канонический ключ пользователя/клиники,
  cascade при account/org purge, terminal states, окно хранения, named prune root, scheduler и health signal.
- Перевести purge `reminder_occurrence_history` на `platform_user_id`; retired integrator-id оставить только как
  временный backfill/reconcile вход, не как условие удаления.
- Добавить окно истории напоминаний и решение по `message_log`; terminal `media_upload_sessions` включить только
  после owner-решения.
- Сопоставить Drizzle schema, реально применённую TEST-схему и generated snapshots, особенно nullable
  `integrator_user_id` в истории напоминаний.

Приёмка этапа: автоматический census не допускает новую journal/temp таблицу без owner/retention/purge policy;
живой account purge не оставляет ни одного связанного пользовательского факта вне явно сохранённых по закону.

### Этап 4. Один контракт результата фоновой операции

- Успех batch-job возможен только когда все обязательные операции завершены; `errors > 0` не превращается в
  `success: true`.
- Не удалять retry identity до подтверждённого S3 Abort/Delete. Ошибка хранится в retryable состоянии с bounded
  backoff и видна в health.
- Объединить логи, `operator_job_status` и isolation telemetry через один результат выполнения; убрать пустые
  `catch`, которые меняют отказ на `no_data`.
- Delivery health перевести на текущий контракт: failure-only attempt journal показывает реальные ошибки, а
  окончательный success/staleness читается из канонического delivery lifecycle. Успехи обратно в журнал попыток
  не дублировать.

Приёмка этапа: fault injection S3/provider/DB ошибки оставляет retryable запись, красный tick и операторский
сигнал; повторный запуск завершает работу ровно один раз.

### Этап 5. Завершить медиа как один поток

- Включить single-PUT `pending` в тот же lifecycle владельца очистки, не создавать отдельный одноразовый cron.
- Реализовать одну preview-door для doctor и patient: наш файл, hosted-video, отсутствие превью.
- YouTube/VK обложка получается сервером один раз, нормализуется и сохраняется в наше private storage; UI получает
  только нашу картинку. Private/deleted/unsupported ролик переходит в явное terminal состояние.
- После этого отдельно доказать установленный media worker и обработку уже накопленных строк на TEST.

Приёмка этапа: сетевой лог пациента не содержит запроса за preview к YouTube/VK; hosted и local preview проходят
одну state machine; старые pending rows либо обработаны, либо получили объяснимое terminal состояние.

**Статус 28.08 (ветка `wt/systemic-hosted-preview-impl-20260827`, пункты 2–3 — preview-door и YouTube/VK).**
Полный разбор и все решения — в
[`OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md`](OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md) §«Превью для
видео по ссылке», разделы «Что построено 28.08» и «Инъекции 28.08» (не дублирую здесь). Коротко:

- [x] Одна preview-door на оба кабинета: `catalogMediaLadderLookup` принимает URL медиа и знает три
      источника — наш файл, ссылку на хостинг, отсутствие. Ручной разбор id у четырёх вызывающих и два
      собственных `LEFT JOIN media_files` в `pgLfkExercises` удалены.
- [x] Обложка YouTube/VK получается сервером один раз, перекодируется существующим
      `imageStandardRendition` и живёт в нашем private S3 как обычная строка `media_files`
      (`usage_purpose = 'hosted_video_preview'`). Отдельного крона не заведено — работает тот же
      `processMediaPreviewBatch`. UI получает только `/api/media/{id}/preview/{size}`.
- [x] Private/deleted/unsupported переходит в явное terminal (`skipped`); временные отказы — bounded retry
      до `failed`. Вечного `pending` нет ни в одном разряде.
- [x] Пункт 1 этапа: single-PUT `pending` включён в одну leased/CAS state machine вместе с hosted-cover,
      multipart retry identity и обычным pending-delete. Доказательство: независимый аудит пяти достижимых
      отказов; targeted route+lifecycle `15/15`, webapp typecheck, privilege generator и owner-aware
      rollback-only DEV preflight — PASS.
- [x] Пункт 4 этапа: `b3e2e8eb9` развёрнут штатным `deploy-test.sh` (`PASS`); ручной вызов через
      `run-internal-job.sh test media_purge` записал на TEST `success`, `removed=14`, `errors=0`, а четыре
      TEST-unit остались `active`.
- [ ] **Owner-gate:** VK-обложки не появятся, пока владелец не заведёт сервисный токен VK API с правом
      `video` в `system_settings` (ключ `vk_video_service_token`, scope `admin`). Токен бота сообщества
      (`vk_community_access_token`) для `video.get` не годится — подтверждено живым запросом.

### Этап 6. Подключить быстрые защиты к CI

- Добавить отдельные параллельные GitHub jobs для `test:db-privileges`, `test:scripts`, migration timestamp
  uniqueness и `generate-cli.mjs --check`.
- Не включать их последовательным хвостом в каждый локальный micro-fix и не заменять ими живую проверку ролей.
- Полный `pnpm run ci` оставить финальным интеграционным сигналом только когда накоплен соответствующий риск;
  после локальной правки запускать затронутый сегмент.

Приёмка этапа: planted tenant-wall drift, stale generated SQL, пропущенный schedule artifact и duplicate timestamp
краснят каждый свой быстрый job независимо.

**Статус 27.08 (ветка `wt/systemic-access-20260827`).**

- [x] Три отдельных параллельных job в `.github/workflows/ci.yml`: `test-db-privileges`, `test-scripts`,
      `privileges-generated` (`--check` плюс `--census`). Хвостом общего прогона они не являются.
- [x] Уникальность timestamp миграций: `findMigrationTimestampCollisions`
      (`deploy/postgres/privileges/migration-order.mjs`) внутри существующего `findMigrationStaticViolations`
      и в раннере `migrate-local.mjs`. Четыре уже применённые исторические группы не переименованы, а
      зафиксированы КАК СОСТАВ: добавление файла в такую группу краснеет так же, как новое совпадение.
      Гейт едет в job `test-db-privileges`.
- [x] Пропущенный schedule artifact краснит единый manifest/artifact-гейт; TEST/PROD deploy до перезапуска
      сверяет поставляемые artifacts и реально установленное расписание.
- [x] `apps/webapp/scripts/run-webapp-drizzle-migrate.mjs` использует тот же
      `findMigrationTimestampCollisions`, что и `migrate-local.mjs`, поэтому оба действующих раннера отказываются
      продолжать при новом совпадении timestamp.

### Этап 7. Одна связная живая приёмка и синхронизация документов

- После завершения этапов 1–6 выкатить один накопленный пакет на TEST.
- Пройти весь список из раздела «Не подтверждено живьём», сохраняя console, webapp/integrator/worker logs и DB
  denials в одном evidence-пакете.
- Исправлять найденное пачками по общей причине; не прерывать проход после каждой мелкой ошибки ради полного CI.
- После зелёной повторной приёмки синхронизировать owner-планы, taskdb и runbook с фактом кода. Архивные evidence
  не переписывать.

## Порядок выполнения

Сначала этапы 1–2: они закрывают риск межклинического доступа и возвращают работающий фон/наблюдаемость. Затем
этапы 3–4 одним data-lifecycle пакетом, чтобы Track D окончательно перестал зависеть от retired integrator-id и
старого журнала успехов. Медиа завершается после появления надёжного scheduler/result contract. CI-гейты
подключаются параллельно с соответствующими инвариантами, а не после очередной серии дефектов. Финальный TEST
проход начинается только после сборки всего пакета.

## Вопросы владельцу, не блокирующие первые этапы

- Нужно ли отдельное окно для terminal `media_upload_sessions`, или они должны жить до удаления `media_id`?
- Решение о настройках пересылки входящих сообщений брендированного бота найдено как направление, но не как
  однозначно активный пункт текущего плана. Его не следует молча включать в этот пакет до сверки owner-authority.
