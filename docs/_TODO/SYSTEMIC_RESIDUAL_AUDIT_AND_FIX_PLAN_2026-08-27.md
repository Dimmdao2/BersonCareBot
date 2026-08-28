# Сводный системный аудит и план исправления — 27.08.2026

## Статус и границы

Исходный аудит выполнен на `b43d159a5bc5328fa79783f16795456104a580a4`. Исправляющий пакет затем доведён,
проверен и развёрнут на TEST до `7f29df6a1`; текущее состояние и внешние остатки записаны в этапе 7.

Первоначальный проход был только проверкой и планированием: в нём код, данные, env, службы, расписания и TEST не
менялись. Последующие явно помеченные этапы этого же плана уже содержат реализацию и TEST evidence. PROD не
проверялся и не затрагивался. Три независимых исходных прохода выполнены в чистых worktree без коммитов:

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

### Финальный свод проверок 28.08 перед последним пакетом исправлений

Проверки выполнялись на `6f924fe1d`; последующий UI-коммит `0da226a60` не пересекается с перечисленными ниже
backend/media/data-lifecycle файлами. До исправлений все находки сведены здесь, отдельные мелкие fix-циклы не
запускаются.

- Hosted-video/program-video аудит `2246c0f87` — **PASS**: одна private preview-door, общий lifecycle,
  fail-loud retry, `9.6` и missing duration отклоняются до upload, `10`/`12` и обычный HLS-path работают.
  Единственный внешний blocker — отсутствующий VK service token с `video` scope.
- Completion-аудит `ccf96854f` подтвердил этапы 1–6 и нашёл незавершённую живую часть этапа 7: текущий
  acceptance-runner не знает роль clinic admin; public booking, contact/booking confirmation, реальное
  напоминание и wrong-certificate mTLS refusal ещё не повторены единым финальным проходом.
- Lifecycle-аудит Claude завершился сохранённым коммитом `2fe5fefba` и дал **FAIL** по пяти достижимым классам:
  частичный отказ продления тарифа скрывался зелёным тиком; `manual_patient_commands` блокировал account purge
  целиком; ещё три пользовательских класса переживали purge; census зависел от суффикса имени; новые cron-классы
  isolation telemetry отвергались живыми DEV/TEST. Отчёт и два acceptance-test приземлены; временные product-
  инъекции откачены. Billing-класс исправлен в `a394efaa9`, F1–F3 ведутся одним lifecycle-пакетом, F5 закрывается
  обычной forward-миграцией вместо restore-only overlay.
- Повторная инспекция purge-path нашла ещё один исполняемый хвост Track D: strict purge всё ещё запускает
  retired integrator cleanup, переносит `integrator_user_id`/телефон в post-purge audit и содержит активный
  cleanup-вход по retired id, хотя integrator identity/contact storage уже снят. Этот хвост нужно удалить, а
  purge оставить только на каноническом UUID и S3/media lifecycle.
- Реестр lifecycle ложно объявляет `message_log` и `media_files` как anonymised, хотя действующий core удаляет
  строки физически. Три actor-FK (`system_settings_audit`, `organization_slug_rename_events`,
  `online_intake_status_history`) тоже объявлены anonymised, но живой FK = `NO ACTION`. Реестр приводится к
  фактическому delete-контракту, actor-FK — к `ON DELETE SET NULL`; публичный destructive route остаётся
  выключенным.
- Post-purge audit не должен снова сохранять удалённую identity: успешный/частичный audit оставляет только
  ограниченные счётчики и класс ошибки, без телефона, retired id, raw user UUID, S3 keys и media row ids.
  Мёртвый retry API, который требовал этот raw payload, удаляется; будущая retention state machine получит
  отдельную durable retry-очередь только после принятия PR-03 policy.
- Финальный production-census retired `integrator_user_id` измерил 82 production-файла / 420 строк и нашёл пять
  достижимых путей, пропущенных прежней записью о готовности: Telegram/MAX auth с fallback-созданием аккаунта,
  создание напоминаний, чтение/статистика напоминаний, callback-кнопки Telegram/MAX и ссылка из рассылки врача.
  Все пять переводятся на уже существующие canonical UUID, подтверждённый телефон и channel bindings; только
  после этого удаляется публичный retired-id runtime-контракт. Внутренний principal-id самого integrator остаётся
  отдельным техническим ключом и не оправдывает публичный дубль identity.

Порядок одного исправляющего пакета: route-result contract → retired purge tail + lifecycle truth/FK → перевод
пяти runtime-путей со старого id → clinic-admin acceptance support → targeted gates и rollback-only DB proof →
один финальный CI → push → TEST deploy → единый живой проход → синхронизация этого плана и taskdb. Документы
сами deploy не блокируют.

**Фактический замер retired-id перед удалением runtime-хвоста.** Один read-only запрос к именованным DEV/TEST
показал, что старые идентификаторы ещё лежат в данных: в DEV у `platform_users` заполнено `122/304`, у правил
напоминаний `29` (из них `2` без канонического UUID), у истории напоминаний `2619` (все с каноническим UUID),
у support-переписок `26` (из них `11` без канонического UUID); в TEST соответственно `144/328`, `32/2`,
`3905/0`, `44/11`; в content grants старых id нет. Поэтому активная очистка и post-purge audit больше не
читают retired-id, но сами старые колонки/значения не удаляются вслепую: они остаются только входом отдельного
backfill/reconcile до разбора orphan-строк.

**Разбор прав миграции `20260828T085822_anonymise_audit_actors_on_account_delete.sql`.** Она не создаёт новых
таблиц, функций, колонок или runtime-путей: меняет только три существующих внешних ключа журналов на
`ON DELETE SET NULL`. Все три DDL-блока исполняются владельцем таблиц `app_object_owner`; runtime-роли не
получают новых прав и не выполняют это действие — ссылку обнуляет сама БД при удалении пользователя.
Декларация прав не меняется, GRANT/REVOKE/политик в миграции нет. Новых горячих колонок и запросов нет, поэтому
новый индекс не требуется.

**Разбор прав миграции `20260828T092521_deliver_cron_isolation_operations.sql`.** Первый statement меняет только
существующий CHECK таблицы `saas_isolation_events` от её владельца `app_object_owner`; второй обновляет тело уже
существующей SECURITY DEFINER-функции от её действующего владельца `saas_telemetry_owner`. Сигнатура, владелец,
таблицы и операции функции не меняются: она по-прежнему читает/пишет те же `saas_isolation_events` и
`saas_isolation_event_hourly`, права на которые уже задекларированы в единственном privilege-источнике. Новых
runtime-ролей, GRANT/REVOKE/политик и индексов нет; runner временно даёт владельцу функции schema-create и
PL/pgSQL usage для `CREATE OR REPLACE`, затем снимает оба в той же транзакции. Добавляются только две допустимые пары закрытого словаря,
которые typed manifest уже эмитит. Overlay остаётся семантически тем же телом, а forward-миграция доставляет его
обычному DEV→TEST пути, где restore-only overlay раньше не исполнялся.

**Targeted-проверки собранного пакета.** Unit-контракт биллингового тика: `1` файл / `2` теста PASS; purge core:
`2` файла / `3` теста PASS; lifecycle registry: `1` файл / `6` тестов PASS; webapp typecheck PASS. Полный CI на
каждую локальную правку не запускался; он остаётся одним финальным интеграционным гейтом после миграционного
preflight и приземления audit-artifacts.

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

Повторный аудит результата фоновой операции нашёл две оставшиеся тихие ошибки: preview-route записывал зелёный
тик при retryable-ошибках, а media purge считал строку удалённой, даже если БД не подтвердила финальное удаление.
Обе ветки исправлены одним контрактом «обязательная операция не завершена → красный результат + сохранённый
ретрай». Terminal `skipped` у недоступной hosted-обложки остаётся нормальным завершённым исходом, а не аварией.
Таргетированный прогон 28.08: четыре файла, `26/26`; webapp typecheck и ESLint затронутых файлов — PASS.

Повторный живой проход 28.08 нашёл ещё один общий разрыв двух transcode-путей: для ролика короче секунды FFmpeg
мог вернуть `0`, но не создать кадр на отметке `1s`; воркер замечал это только по позднему `ENOENT poster.jpg`.
Оба caller теперь используют одну проверку фактического output с fallback `1s → 0s`, а первая же failed job
делает video-transcode health `degraded`. Коммит `1fc682380`, независимый аудит `PASS`; тот же односекундный
ролик после deploy обработан, прикреплён пациентом, прочитан врачом и очищен за один живой TEST-проход.

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

- полный public booking: путь начинается без заранее существующей кабинетной сессии; после подтверждения телефона
  сервер выдаёт сессию, и уже под ней проверяются создание, чтение, перенос, отмена и история;
- подтверждение контакта, подтверждение записи и реальное напоминание через узкие роли;
- media preview worker, очистки и короткое program-submission video подтверждены на TEST; YouTube hosted-preview
  подтверждён под doctor/patient, а VK остаётся owner-gated до сервисного токена VK API с `video` scope
  (пункт этапа 5 ниже);
- mTLS refusal с неправильным сертификатом подтверждён; просроченный/отозванный сертификат и overlap-ротация
  принадлежат отдельному операционному этапу `#1085`, а не текущему дефекту runtime;
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
- [x] Живые A/B clinic и patient onboarding/content probes на TEST; повтор на DEV снят более поздним
      owner-указанием не тратить текущий проход на DEV-права и проверять после выкатки на TEST. Штатный deploy
      дважды доказал tenant-wall (своя клиника / чужой контекст / отсутствие контекста), а rollback-only
      `account-self-service-actor-wall.devDbProof.test.mjs` на `bersoncarebot_test` дал `15/15`: три настоящих
      аккаунта владельца устанавливают свой класс контекста, пациент видит ровно свой активный content-grant
      своей клиники и не видит строки другой клиники, другого человека, отозванную и истёкшую.

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

**Операторские шаги, зафиксированные при реализации 27.08.**

1. Установить сгенерированные файлы в `/etc/cron.d` от root на PROD и TEST — до этого первый же deploy
   красит `--verify-installed`. Команды печатает сам гейт.
2. Переприменить `deploy/postgres/saas-isolation-telemetry.sql` на DEV/TEST/PROD, иначе новые операции
   `cron_maintenance`/`cron_saas_billing` отвергнет закрытый словарь БД.
3. Живая приёмка на TEST: свежий тик у каждой обязательной job и красный deploy-гейт при намеренно снятом
   расписании.

**Фактическое состояние TEST 28.08:** расписания из manifest установлены и `--verify-installed --env test`
проходит. Каноническим transport вручную выполнены `product_analytics_retention`, `hls_proxy_retention` и
`playback_retention`; все три записали `success`. Первая очистила 730 старых строк аналитики, после запуска строк
старше 90 дней осталось 0; playback очистил 118 строк; HLS нечего было удалять. Общий обязательный health всё
ещё не зелёный: для `backup.hourly` на хосте нет установленного расписания и age-recipient. Recovery private key
должен находиться вне этого сервера, поэтому агент не создаёт его локально ради зелёной карточки.

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

**Статус повторного аудита 28.08:** реестр и unit-тесты не доказывают полный strict purge на настоящей TEST-БД.
Публичный destructive route намеренно закрыт safety override и возвращает `account_purge_disabled`; это не
обходится ради приёмки. Нужен rollback-only DB-proof ядра на существующем TEST-пользователе и отдельное
согласование трёх policy-расхождений до включения полного потока: физическое удаление `message_log` против
заявленной анонимизации, удаление принадлежащих пользователю media rows против заявленной анонимизации автора,
и post-purge audit, который сейчас заново сохраняет raw user id и идентификаторы артефактов. Этап остаётся
открытым; mock SQL не считается живым доказательством.

**Rollback-only DB-proof ядра — сделано 28.08 (ветка `wt/account-purge-proof-20260828`).**
`apps/webapp/src/infra/platformUserFullPurge.devDbProof.test.ts`, opt-in
`RUN_PLATFORM_USER_PURGE_DB=1`, канонический admin socket (AGENTS §6), только `bersoncarebot_test`.
Каждый сценарий выполняет настоящий production-core внутри `REPEATABLE READ` и безусловно делает
`ROLLBACK`; route/CLI не включаются. Проба не повторяет алгоритм удаления: она берёт production advisory
lock, вызывает `collectPurgeArtifactKeys` и `runWebappPurgeCoreInTransaction`, а ожидания выводит из
`pg_constraint` живой TEST-БД и `JOURNAL_LIFECYCLE_REGISTRY`.

Независимый аудит `008e37f67` выполнил весь записанный blind kill-set без непойманных классов и сначала дал **FAIL**:
реестр продолжал объявлять уже удалённый дубль `be_appointment_events` как живой via-parent журнал;
rollback-oracle не перемерял phone-keyed/via-parent классы; непустой сбор внешних артефактов не был доказан;
план сохранял лишние runtime-ID. Аудитор оставил красную acceptance-проверку и отчёт
`docs/_TODO/runs/ACCOUNT_PURGE_CORE_DB_PROOF_AUDIT_2026-08-28.md`.

Коррекция ведущего закрыла ровно эти findings без нового цикла аудита: retired duplicate удалён из lifecycle
registry и записан в non-journal decisions как отсутствующий в target schema; rollback повторно измеряет
phone-keyed и via-parent; основной существующий client доказывает все DB-классы, а второй динамически выбранный
существующий client с реальными `media_files`/`patient_files` доказывает непустой сбор ключей до purge,
исчезновение исходных строк и их восстановление после rollback. Raw UUID/integrator ID в документации не
сохраняются. Команда
`RUN_PLATFORM_USER_PURGE_DB=1 pnpm --dir apps/webapp exec vitest run
src/infra/platformUserFullPurge.devDbProof.test.ts` → **9/9 PASS**; команда
`pnpm --dir apps/webapp exec vitest run src/modules/db-retention/journalLifecycleRegistry.contract.test.ts`
→ **6/6 PASS**; scoped ESLint, webapp typecheck и `git diff --check` — PASS.

Найдено пробой, НЕ исправлено, требует решения владельца — четвёртое расхождение помимо трёх выше:
реестр объявляет `anonymised` (то есть «FK `ON DELETE SET NULL`, строка выживает обезличенной») для
`public.system_settings_audit.changed_by`, `public.organization_slug_rename_events.actor_platform_user_id`
и `public.online_intake_status_history.changed_by`, а в живой TEST-БД все три FK — `NO ACTION`, и
`clearPlatformUserDeleteBlockers` их не снимает: база не обезличит строку, а ОТКАЖЕТ в удалении
учётки. Сегодня это не достигается только потому, что все три пишутся сотрудниками, а purge принимает
`role = 'client'`; объявленный жизненный цикл при этом ложен. Набор зафиксирован в самой пробе
(`RECORDED_REGISTRY_FK_DIVERGENCES`) как незакрытый дефект, чтобы новое расхождение не появилось молча.

Границы этого доказательства: только ядро транзакции и сбор ключей до него. Post-commit удаление строк
`media_files`, очистка S3/provider и запись audit не входят — два из трёх зафиксированных policy-расхождений
живут именно там и остаются открытыми. `message_log` пуст на TEST, поэтому живого факта для его policy-конфликта
нет. Публичный destructive route остаётся выключенным; проба его не включает.

**Исчерпывающий census — сделано 28.08 (ветка `wt/fix-lifecycle-purge-census-20260828`).** Приёмка «census не
допускает новую journal/temp таблицу без owner/retention/purge policy» закрыта не примерами, а классом:
эвристика по суффиксу имени (`JOURNAL_LIFECYCLE_TABLE_SUFFIXES`) и список исключений
(`JOURNAL_LIFECYCLE_EXTRA_CANDIDATES`) удалены целиком, кандидатом стала ВСЯ декларация. Каждая из 222
объявленных в `declaration.ts` физических таблиц лежит ровно в одном из двух множеств: 58 — в
`JOURNAL_LIFECYCLE_REGISTRY`, 164 — в `JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS`, где голая строка-причина
больше не принимается: обязательны `reason` + `userPurge` + `orgPurge` в той же грамматике, что у реестра
(`not-user-scoped` / `not-org-scoped` — законный ответ, но он должен быть НАПИСАН). Классификация выведена из
живого графа `pg_constraint` обеих управляемых баз, из `platformUserFullPurge.ts` и из call sites писателей, а
не из имён.

Fault injection (все инъекции откачены, дерево чистое): произвольно названная `public.bcb_probe_sms_deliveries` в
`declaration.ts` → гейт КРАСНЫЙ (`undecided = ["public.bcb_probe_sms_deliveries"]`), тогда как до правки та же
инъекция оставляла его зелёным (аудит F3, инъекция A2). Отдельно проверены ещё четыре класса: голая
строка-исключение, отсутствующая org-семантика, двойная классификация одной таблицы и window с недостижимым
prune root — каждый даёт красный. Команды:
`pnpm --dir apps/webapp exec vitest run src/modules/db-retention/journalLifecycleRegistry.contract.test.ts`
→ **9/9 PASS** после отката инъекций;
`RUN_PLATFORM_USER_PURGE_DB=1 pnpm --dir apps/webapp exec vitest run
src/infra/platformUserFullPurge.devDbProof.test.ts` → **10/11**, единственный красный —
`registryDivergences` с тем же набором из пяти строк, что и на HEAD до правки (замерено stash-прогоном), то есть
уже зафиксированный открытый дефект выше, а не регрессия этого прохода.

Сам census нашёл три ложные записи, которых не видел ни один прежний детектор (он сравнивал реестр только с
FK-графом, а колонка без FK для него не существует):

- `public.be_payment_history_events.platform_user_id` и `public.be_payments.platform_user_id` объявлялись
  `not-user-scoped`, но это ПАЦИЕНТ (`pgClientHistory.ts` читает историю платежей именно по ней;
  `pgPayments.createPaymentFromIntent` копирует её из intent). FK нет, purge их не касался. Исправлено
  существующим механизмом `ANONYMISE_ON_PURGE_COLUMNS`: денежная запись сохраняется, ссылка на человека
  обнуляется — ровно та политика, которая уже решена владельцем для колонки-источника
  `be_payment_intents.platform_user_id` (живой FK `ON DELETE SET NULL`). Живых строк на TEST — 0.
- `public.email_otp_locks.user_id` объявлялся `not-user-scoped`, хотя строка состоит ровно из
  `user_id, locked_until, lockout_cycle`. Поведение не менялось: запись снимается своим `locked_until` и
  подметается собственным expiry-таргетом; записано новым честным видом `self-expiring`.

**Открытый вопрос владельцу (единственный новый, поведение НЕ менялось): `OQ-DELIVERY-ATTEMPT-USER-PURGE`.**
`public.notification_delivery_attempts.user_id` — настоящая ссылка на platform user без FK и без шага purge;
замер на TEST (read-only): **11195 строк по 40 пользователям `role='client'`**. Текста сообщения строка не
несёт, `recipient_ref` уже дайджест (`tg:…1234`, `email:<digest>`), поэтому единственный персональный факт —
этот сырой id. Недостающее решение: при purge **обнулять `user_id`** (окно 180 дней диагностики доставки, ради
которого таблица существует, сохраняется; человек уходит) **или удалять строки** (диагностика за это окно по
удалённому пациенту теряется). Рекомендуемый safe default — обнулять, как уже решено для
`product_analytics_events_recent` (`anonymised`) по той же причине «сохранить агрегат, убрать человека».
Решение агентом не принято, записано в реестре как `userPurge.kind: 'owner-question'`.

**Исправление семантики census и purge — сделано 28.08 (та же ветка `wt/fix-lifecycle-purge-census-20260828`).**
Полный отчёт с обязательным письменным анализом привилегий миграции и всеми командами:
`docs/_TODO/runs/EXHAUSTIVE_LIFECYCLE_SEMANTICS_FIX_2026-08-28.md`. Закрыто одним связным проходом, каждый
пункт — расширением существующей точки, без второго ядра purge, второго реестра, второго лимитера, второго
сервиса удаления организации и второго стенда:

- `OQ-DELIVERY-ATTEMPT-USER-PURGE` снят решением из брифа: `notification_delivery_attempts` — удерживаемый
  180 дней факт доставки, поэтому при purge уходит личность, а не строка. Живых поверхностей оказалось три, а
  не одна: `user_id`, `integrator_user_id` и id внутри `metadata` (DEV 7044/36, 537/110, 1956/41; TEST
  11222/40, 536/110, 3616/44). Реализовано полями `alsoNullColumns` / `scrubJsonColumns` существующего
  `ANONYMISE_ON_PURGE_COLUMNS`.
- `auth.channel_link_start` получил настоящий ограниченный scope prune той же формы и на той же DB-функции,
  что `patient.client_boot_report`; ключ удалённого человека уносит сам purge через `CONTENT_TABLES`.
- Client hard purge падает ЗАКРЫТО, если у человека есть живой специалистский корень
  (`PurgeIdentityRootConflictError` → `error: 'identity_in_use'`): доказано живьём на DEV на настоящем
  человеке, специалист/расписание/приёмы целы. Данные врача не удаляются.
- Organization purge стал правдой в миграции `20260828T131900_organization_purge_reaches_every_named_class.sql`:
  каскад для `outgoing_delivery_queue` и `media_playback_stats_hourly` (FK не было вовсе), каскад
  `manual_patient_commands` через `org_enrollments` (+ ведущий индекс), `SET NULL`-tombstone для обоих
  slug-отношений, и расширение ДВУХ существующих стражей ровно на один переход «освобождение личности» —
  без него `SET NULL` переносил бы отказ с ограничения на триггер. Живая rollback-only демонстрация:
  queue 102→0, hourly 10→0, claims/renames 5/2 сохранены целиком как 2+2 несвязанных tombstone.
- Разрешающий ярлык prune-корня заменён проверкой против установленного callable, контракта планировщика и
  health signal (`staleAfterSec > 0`); запись оператора переведена на настоящий
  `app.prune_operator_health_failure_archive`. **Шестая инъекция — несуществующий корень с точкой — теперь
  КРАСНАЯ** (была зелёной, 9/9). Тем же гейтом найден новый экземпляр класса, см. вопрос владельцу ниже.
- Rollback-only проба расширена на все 164 структурированных решения, FK-free anonymise/delete классы,
  транзитивное замыкание `via-parent` и org-оракул; исправлено её собственное утверждение о полном числе
  строк. Пять записанных расхождений закрыты в продукте/схеме/реестре, а не приняты как красный baseline;
  восемь оставшихся приписаны ИМЕНОВАННЫМ ожидающим миграциям, сверенным с живым ledger.
- `public.user_email_setup_tokens` независимо признана мёртвой (нет ни в одной управляемой базе, нет писателя,
  читателя и человеческого пути) — объявление и решение удалены, таблица ради census не воссоздана.

Census: **221 объявленная таблица = 57 реестр + 164 структурированных решения** (было 222/58/164),
`missing`/`undeclared`/`overlap` пусты. Прогоны: contract 9/9; `RUN_PLATFORM_USER_PURGE_DB=1` DEV-проба
**16/16 без пропусков**; все шесть инъекций красные и откачены, baseline 9/9 восстановлен побайтно;
`generate-cli --check` побайтно; typecheck, scoped eslint, `pnpm --dir apps/webapp run lint` (через host lock),
`check-migration-privileges`, `check-no-new-raw-sql`, `check-c4-migration-owned-function-bodies`,
`migration-order` — зелёные; `migrate-dev.sh --preflight` **PASS** (`pending=9 total=102`, rollback-only).
Миграция к DEV/TEST НЕ применена; TEST только на чтение; hard purge остаётся выключенным гейтом PR-03.

Существующий красный ВНЕ скоупа, не вызванный этой работой: `passwordAuth.route.test.ts:312` (403 вместо 200),
воспроизводится на нетронутой ветке через `git stash`.

**Решения владельца по playback-retention исполнены:**

- `media_playback_stats_hourly` и `media_hls_proxy_error_events` хранятся 90 дней.
- `media_playback_resolution_events` и `media_playback_client_events` хранятся 400 дней.
- Один уже существовавший тик `media.playback_stats.retention` чистит все три свои ветки; отдельная фоновая задача не создана.
- **24 FK отказывают в `DELETE FROM be_organizations` ВНЕ четырёх названных брифом классов** (каталог клиники
  `be_clinic_services`/`reference_items`/`tests`/`lfk_exercises`, пациентские назначения, цепочка
  `saas_billing_*`, `media_folders`). Починить их — значит решить за владельца судьбу каталога клиники и
  пациентских назначений при её удалении; нужен отдельный пункт плана.
- Каталожная уборка: вместе с мёртвой таблицей ушла её запись `disp: REMOVED`; три оставшихся собрата с тем же
  `disp` свои записи сохранили — выносить ли их так же, здесь не решалось.

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

**Статус 28.08:** общий контракт применён к оставшимся media-preview и media-purge веткам: retryable/DB completion
ошибка даёт ненулевой HTTP, красный tick и сохранённый retry; normal terminal skip не красит job. Узкие проверки
`26/26`, typecheck и ESLint — PASS. Живой повтор на TEST выполняется один раз после следующей общей выкатки.

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
- [x] Ошибка в preview batch больше не маскируется зелёным cron tick, а неподтверждённое DB-удаление media row
      остаётся retryable; terminal hosted-video skip считается обработанным исходом. Доказательство 28.08:
      targeted route/worker/lifecycle `26/26`, webapp typecheck и ESLint — PASS.
- [x] Короткие video submissions не падают на отсутствующем кадре `@1s`: один helper проверяет созданный poster
      и повторяет `@0s` в program-submission и обычном HLS path. `1fc682380` развёрнут на TEST; живой ролик
      обработан и прикреплён за `3670 ms`, playback `200/mp4` с poster, врач увидел сообщение, cleanup прошёл.
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

**Первый связный TEST-проход 28.08 после `e090994dd5`.** Штатный route crawl под живыми owner-учётками
`doctor,patient,global_admin` завершился без отказавших страниц; команда:
`TEST_ACCEPTANCE_ROLES=doctor,patient,global_admin ... run-tests.sh "node runs/test-interactive-acceptance/crawl.mjs"`.
Живые изменяющие действия подтвердили создание/изменение/архивирование справочников врача, программы, задачи,
чата, визита и записи на приём с последующей отменой; глобальный администратор изменил и восстановил trial policy,
пациент изменил и восстановил напоминание и отправил сообщение. Временная диагностическая запись на 31.08 также
отменена после прогона.

Подтверждён один продуктовый разрыв общей причины: и CMS multipart upload, и файл пациента падали на записи
`media_files`. Runtime-журнал TEST показал `42501 permission denied for table media_files`; Drizzle называет в
`INSERT` все колонки схемы, а поколоночный грант `app_staff` отстал на `delete_claim_token`. Защита добавлена не
как второй ручной список: `relation-access.test.mjs` исполняет настоящую Drizzle-схему через `tsx` и сравнивает
полный набор колонок с единственной декларацией прав. До исправления тест краснел ровно на
`delete_claim_token`; после добавления колонки в `relation-access.ts` команда `pnpm test:db-privileges` дала
`314 tests / 0 fail`, `generate-cli.mjs --check` — побайтовое совпадение четырёх артефактов, `--census` — обе
управляемые базы без незаявленной runtime-поверхности. Независимый аудит `0fca9bb89` дал `PASS` и отдельно
покрасил guard удалением `delete_claim_token`; отчёт —
`docs/_TODO/runs/MEDIA_FILES_INSERT_GRANT_AUDIT_2026-08-28.md`.

Исправление вошло в интеграционный SHA `90a8d35ec`, `pnpm run push:checked` дождался зелёного GitHub Security,
а штатный `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild` завершился `PASS` с transcript
`/var/log/bersoncarebot/deploy-test/deploy-test.20260828T051842Z.IRh4vS.log`. Повторный живой проход под
owner-врачом командой
`TEST_ACCEPTANCE_PASSWORD=<owner-test-password> node runs/test-interactive-acceptance/out/media-retry.mjs`
дал четыре результата `PASS`: CMS upload/delete и patient-file upload/delete; итоговый локальный artifact —
`runs/test-interactive-acceptance/out/media-retry-2026-08-28T05-31-53.880Z.json`. После прохода команда
`sudo -n journalctl -u bersoncarebot-webapp-test.service -u bersoncarebot-api-test.service -u bersoncarebot-scheduler-test.service -u bersoncarebot-media-worker-test.service --since '2026-08-28 08:28:00' --no-pager | rg -i '42501|permission denied|status.?500|\b500\b|uncaught|unhandled|fatal|media_files|upload_failed|delete_failed'`
не вернула строк. Разрыв загрузки и удаления закрыт живьём; временные файлы обоих прогонов удалены через UI.

**Финальная общая выкатка и повторная проверка 28.08.** Накопленный пакет до `cc13a4ed4` прошёл полный
`pnpm run ci`, был запушен после зелёного GitHub gate и развёрнут штатным
`bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild --recover-stopped-access`. Recovery-флаг применён только
потому, что предыдущий неуспешный reconcile уже оставил все четыре TEST-сервиса остановленными; он требует
доказать это до обхода начального preflight, а финальная tenant-wall проверка остаётся обязательной. Transcript:
`/var/log/bersoncarebot/deploy-test/deploy-test.20260828T170223Z.0yh7sd.log`. Миграции и declaration/reconcile
применены, tenant wall `3/3 PASS`, manifest установленного расписания совпал, webapp/API/scheduler/media-worker
активны, `/api/health` вернул `ok`, старый адрес `https://test.bersoncare.ru/app` вернул `200` и непустую страницу.

После этой выкатки один route/API/console-crawl под настоящими TEST-учётками дал: doctor `74/74`, patient
`54/54`, global admin `21/21`; clinic admin после удаления из его матрицы намеренно doctor-only страницы —
`8/8`. Артефакты: `crawl-2026-08-28T17-14-26.797Z.json` и
`crawl-2026-08-28T17-15-16.811Z.json`. Правка матрицы обходчика — `7e00ef566`; runtime она не меняет и отдельной
выкатки не требует. Это повторно подтверждает чтение/рендер/API/console всех поверхностей после финального
reconcile; изменяющие действия подтверждены предыдущим связным проходом этого этапа и повторными media
upload/delete, а не выдаются за заново выполненные этим crawl.

Вне закрытого runtime-пакета остаются только явно названные внешние/операционные gates: полный anonymous
public-booking без заранее существующей сессии; реальная доставка подтверждения контакта, записи, напоминания и
operator digest только на owner TEST-аккаунты; VK preview до owner-токена с `video` scope; будущий PROD `A → B0`
только по отдельному разрешению. Расширенный mTLS host proof закрыт 28.08: expired/foreign-CA/revoked negatives,
overlap двух сертификатов, CRL reload, drain уже открытого backend, rollback-контроль штатного сертификата и
повторный shared readiness дали PASS; TEST-сервисы и health после проверки остались зелёными.

После этого прохода закрыты ещё два системных хвоста. Активная privilege-декларация больше не
несёт старые revoke/gate/code-change очереди и пустые diagnostic/config-reader роли; generated/census и
независимый аудит дали PASS (`3b7ea5860`). PROD-скрипты, которые ещё ссылались на старый C4 и могли
обойти будущий cutover, закрыты fail-closed до отдельного owner-approved `A→B0`; PROD не читался и не менялся.

**Окончательная выкатка внутреннего пакета 28.08.** После точечных проверок этих двух хвостов коммит
`7f29df6a1` запушен и развёрнут штатным `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild`; transcript —
`/var/log/bersoncarebot/deploy-test/deploy-test.20260828T182821Z.UlYp0n.log`. Deploy завершился `PASS`: pending
webapp/integrator migrations `0`, declaration/reconcile применён, tenant wall `3/3 PASS`, установленное
расписание совпало с manifest. После перезапуска `api`, `scheduler`, `webapp`, `media-worker` имеют состояние
`active`; source/origin/TEST HEAD совпадают с `7f29df6a135da527af72a11aed569141d338043b`; integrator и webapp
health вернули `{"ok":true,"db":"up"}`, `https://test.bersoncare.ru/` вернул `200` и непустое тело. В свежем
журнале четырёх TEST-сервисов после deploy нет `42501`, `permission denied`, `500`, `fatal`, `unhandled` или
`uncaught`. Полный CI накопленного multi-app пакета на `cc13a4ed4` переиспользован по `AGENTS.md` §9: более
поздние изменения — изолированная очистка декларации и deploy-wrapper — прошли свои targeted, live и
независимые audit-gates и не меняли непокрытый product contract.

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
