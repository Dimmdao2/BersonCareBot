# Напоминания о записи и Google-календарь: один упавший шаг съедает следующие

Найдено 19.08.2026 при разборе «почему подтверждение записи идёт 12 секунд».

## Что сломано

Обработчик события записи выполняет шаги строго последовательно, и на `booking.created`
порядок такой: сообщение пациенту → сообщение врачу → web-push → **напоминания** →
**Google-календарь**. Напоминания падают — до календаря управление не доходит никогда.
Тот же порядок на `booking.rescheduled` и `booking.payment_captured`.
На `booking.cancelled` / `deleted` / `package_*` календарь стоит первым и работает.

Замерено на dev: в `outgoing_delivery_queue` строк вида `appointment_reminder` — **ноль
за всю историю**. `pgAppointmentReminderMaterialization.replaceGeneration` пишет прямым
INSERT, а INSERT на эту таблицу не выдан ни одной рабочей роли: он есть только у
`app_seam_delivery_scope_owner`, `app_seam_email_otp_owner`,
`app_seam_reminder_materialization_owner`, и объявленного корня, который вставлял бы
`appointment_reminder`, не заведено вовсе.

Падение уходит в 502, `postSignedWithRetry` повторяет ВСЁ событие 3 раза с паузами 1 с и 2 с.
Сообщения к этому моменту уже отправлены, дедупликации у отправки нет — значит до трёх
одинаковых сообщений пациенту и врачу на одну запись. Три секунды из наблюдаемых 12 —
это сон между повторами, а не работа.

## Слова владельца (19.08)

Про прод: «синхронизация с Google-календарём перестала работать и на проде, когда я отключил
рубитайм. Сегодня. Хотя там никаких rls». И: «там перестали приходить напоминания о записи
уже какое то время назад». И: «По напоминаниям и гугл-календарю и всему остальному — чини ТУТ,
прод не трогай».

Прод не трогать. Правка живёт в ветке и приезжает обычной выкаткой, когда владелец скажет.

## Чек-лист

- [x] Шаг, объявленный необязательным, не должен зависеть от падения предыдущего.
      Развязать шаги обработчика так, чтобы падение одного не отменяло остальные,
      и чтобы порядок перестал быть скрытой зависимостью.
      → `apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts`:
      ветка события теперь ОБЪЯВЛЯЕТ список шагов (`bookingLifecycleSteps`), а исполнитель
      (`runBookingLifecycleSteps`) гоняет каждый независимо и собирает отказы.
      Доказательство поведения: `bookingLifecycleRoute.stepIsolation.test.ts` —
      «напоминания не создались — запись всё равно попадает в календарь врача».
      Fault injection: `throw` на первом же отказе внутри исполнителя красит ровно этот тест.
- [x] Завести объявленный корень для материализации напоминаний — владельцем
      `app_seam_reminder_materialization_owner`, у которого INSERT уже есть.
      Форма — как у соседнего `app.enqueue_outbound_message`. Новых прав рабочим ролям не выдавать.
      → `app.replace_appointment_reminder_generation(uuid,uuid,timestamp with time zone,text,text)`,
      миграция `apps/webapp/db/drizzle-migrations/0034_one_declared_root_replaces_a_reminder_generation.sql`,
      объявление — `deploy/postgres/privileges/declaration.ts` (функция + возможность
      `appointment_reminder_generation_replace`), вызов —
      `apps/webapp/src/infra/repos/pgAppointmentReminderMaterialization.ts`.
      Прямой путь снят: `AppointmentReminderReadyOutgoingDelivery` больше не входит в
      `ReadyOutgoingDelivery`, `terminalizeUnsentAppointmentReminders` удалён — два пути не оставлены.
      Живое доказательство на `bcb_webapp_dev` (настоящий логин `bcb_dev_webapp_staff`, настоящая
      установка port-контекста, транзакция откачена):
      `root returned {"current":true,"inserted":1}`, а под ТОЙ ЖЕ ролью прямой
      `INSERT INTO public.outgoing_delivery_queue` → `42501 permission denied for table
      outgoing_delivery_queue` — то есть строк и не могло появляться раньше.
      Новых прав рабочим ролям нет: `has_column_privilege('app_tenant_service',
      'public.outgoing_delivery_queue','event_id','INSERT')` = `f` (то же для `app_staff`,
      `app_patient`); у шва — `t`.
- [x] Падение материализации сделать громким: сейчас оно тонет в 502 и повторах.
      Отказ должен открывать инцидент оператора, а не исчезать.
      → `scheduleBookingReminders` при `!result.ok` открывает инцидент через существующий
      `reportOperatorFailure` (`outbound_notification:booking_reminder_materialization:
      reminder_materialization_failed`) и только потом бросает: повтор шага остаётся, чинится тишина.
      Отдельно: каждый упавший шаг теперь виден сам по себе — в журнале строкой
      `booking_lifecycle_step_failed` со своим `step`, и в тексте 502
      (`doctor_message: admin_notification_targets_unavailable` вместо голого сообщения).
      Доказательство: `bookingLifecycleRoute.stepIsolation.test.ts` — «отказ материализации
      напоминаний открывает операторский инцидент, а не тонет в 502».
- [x] Убрать дубли сообщений при повторе события: отправка должна быть идемпотентной
      по тому же ключу, что и само событие.
      → Ключ дедупликации стал ПОШАГОВЫМ (`booking-lifecycle:<тип>:<запись>:<событие>:<шаг>`) и
      освобождается только у упавшего шага. Повтор доигрывает недоигранное и не шлёт второго
      сообщения ни пациенту, ни врачу.
      Доказательство: `bookingLifecycleRoute.stepIsolation.test.ts` — «повтор события после отказа
      не шлёт пациенту и врачу второго сообщения, но доигрывает упавший шаг».
- [ ] Живая проверка на TEST: создать запись, убедиться, что строки напоминаний появились,
      что повтор события не рождает второго сообщения, и что шаг календаря выполняется.

- [x] Отказ шага перестал быть только строкой журнала (добавлено 19.08 работой
      `wt/booking-event-off-request-20260819`, коммит `54c20db12`). Раньше упавший шаг уходил в 502,
      а вебапп выбрасывал 502 пустым `catch {}` — о том, что врач не получил сообщения, не узнавал
      никто. Теперь каждый упавший шаг открывает инцидент через существующий чокпоинт
      `recordOperatorFailureIncident` (инцидент БЕЗ немедленного алерта: громкий алерт по
      напоминаниям шлёт `scheduleBookingReminders` сам, второго на то же событие быть не должно).
      Доказательство поведения: `bookingLifecycleRoute.stepIsolation.test.ts` — «врач не получил
      сообщения о записи — оператор узнаёт об этом, а не только журнал». Fault injection: обернул
      вызов в `if (false)` → красный ровно этот тест, вернул → 4/4 зелёные.

## Громкость отказа была объявлена, но запрещена базой (19.08, ветка `wt/integrator-incident-denied-20260819`)

Предыдущий пункт чек-листа объявил, что упавший шаг открывает операторский инцидент. База это
запрещала. В логе PostgreSQL за окно после выкатки, роль `bcb_test_integrator`:
`permission denied for function open_or_touch_operator_incident` и
`permission denied for function read_integrator_google_calendar_setting`. В журнале сервиса рядом —
`booking lifecycle step incident could not be recorded`. То есть отказ шага назывался в журнале и
НЕ доходил до оператора ни разу.

- [x] **Инцидент оператора недостижим из арендного контекста — почему.** `bookingLifecycleRoute`
      выполняет событие внутри `runWithOrganizationPrincipal` (строка 903), а порт-контекст ставит
      `SET LOCAL ROLE app_tenant_service`. EXECUTE на `app.open_or_touch_operator_incident` держит
      ОДНА роль — `app_operational_delivery_worker`, и тело корня требует привилегированного
      контекста ровно для неё (`app.require_attested_context_for_roles`). Живое воспроизведение на
      `bcb_webapp_dev` настоящим логином `bcb_dev_integrator` и настоящей установкой контекста:

      session role in this context: {"u":"app_tenant_service","r":"app_tenant_service"}
      open_or_touch_operator_incident: DENIED code=42501
      read_integrator_google_calendar_setting(org): DENIED code=42501
      read_integrator_google_calendar_setting(global): DENIED code=42501

- [x] **Роль выбирает обёртка возможности, а не тот, кто сообщает об отказе.**
      `openOrTouchOperatorIncident` (`apps/integrator/src/infra/db/repos/operatorHealthDrizzle.ts`)
      теперь входит в `runWithDeliveryWorkerPrincipal` — существующий адаптер, чья собственная
      документация описывает ровно этот класс провала («…и никогда у каждого вызывающего — именно
      так `app.revalidate_patient_reminder_delivery_materialization` перестала работать на TEST»).
      Той же формы уже держится `readAvailabilityValueJson`
      (`apps/integrator/src/infra/db/platformIntegrationAvailability.ts`). **Ни одного нового права
      рабочей роли не выдано:** `app_operational_delivery_worker` уже имел EXECUTE, контур проб
      остался у `app_operational_scheduler` со своей узкой дверью.

- [x] **Перепись мест, где инцидент оператора не открывался.** Заперты были ВСЕ контуры, кроме
      воркера доставки и планировщика — девять мест: `bookingLifecycleRoute.ts:199, 290, 302, 357,
      366, 505` (то есть `reportEmptyNotificationAudience` в интеграторе не работал целиком),
      `writePort.ts:564`, `writePort.ts:931` — арендный принципал → 42501; `routes.ts:122` (отказ
      провайдера SMS/почты) и `relayOutboundRoute.ts:223` — принципала нет вовсе, вызов падал ещё
      до базы («An integrator principal is required in port-context mode»). Каждое место глушило
      ошибку в `logger.warn`. Один чокпоинт закрыл все девять.

- [x] **Календарь клиники: корень был выдан вызывающему, которого не существует.** EXECUTE на
      `app.read_integrator_google_calendar_setting(text,uuid)` держал `app_integrator_request`.
      Принципала класса `integrator` на пути календаря нет ни одного: шаг записи приходит с
      организацией (`app_tenant_service`), проба оператора — под планировщиком. Корень был
      недостижим для КАЖДОГО живого вызывающего, а пустой `catch` в `readConfigFromDb` превращал
      42501 в «календарь у клиники не подключён» — то же самое, что владелец видит на проде.
      Объявление исправлено в `deploy/postgres/privileges/declaration.ts`: `execute` →
      `['app_tenant_service']`, как у близнеца `app.read_integrator_clinic_delivery_credential(text,uuid)`
      (тот же точный org-скоуп в теле). `readConfigFromDb`
      (`apps/integrator/src/integrations/google-calendar/runtimeConfig.ts`) теперь читает
      конфигурацию в контексте ЭТОЙ клиники, поэтому и проба оператора попадает в ту же дверь.
      Сгенерированные артефакты перегенерированы, расхождение — ровно три строки на базу
      (attested-роль, GRANT EXECUTE, строка переписи); прав на таблицы не добавлено ни одного.

- [x] **Живое доказательство на `bcb_webapp_dev`** (настоящие логины, настоящий порт-контекст,
      боевой код интегратора; после `migrate-dev.sh --preflight` и `--execute`):

      — booking-lifecycle contour: organization principal (app_tenant_service) —
        operator incident for a failed lifecycle step: OK {"id":"748459a4-…","occurrenceCount":1}
        clinic calendar setting (google_calendar_id): OK "dev-proof@example.com"
        platform calendar identity (google_client_id): OK "1090999466397-….apps.googleusercontent.com"
      — bare HTTP handler contour: no ambient principal at all (routes.ts:122) —
        operator incident for an SMS provider failure: OK {"id":"3a61a3ca-…","occurrenceCount":1}
      — operator probe contour: infra principal scheduler:handle-tick-event —
        google calendar config for one clinic: OK {"clientIdRead":true,"calendarIdRead":true,"enabled":true}

      Доказательство поведения в тестах:
      `operatorHealthDrizzle.openOrTouchOperatorIncident.test.ts` — «шаг события записи упал под
      арендным принципалом → инцидент всё равно уходит в базу под ролью доставки», «отказ провайдера
      на хендлере вовсе без принципала → инцидент всё равно получает принципала», «тик проб под
      планировщиком → контур инцидента НЕ переключается на роль доставки»; и
      `runtimeConfig.principal.unit.test.ts` — «проба оператора под принципалом планировщика →
      конфигурация клиники читается в контексте ЭТОЙ клиники». Fault injection: снял оба скоупа
      (`runWithDeliveryWorkerPrincipal` и `runWithOrganizationPrincipal`) → красными стали ровно эти
      три теста и календарный; вернул → 7/7 зелёные.

## Очередь доставки: два чтения шли под принципалом, которому её читать нельзя (19.08, ветка `wt/delivery-queue-reads-20260819`)

Предыдущий пункт вернул воркеру доставки право ВЫЗВАТЬ корень ревалидации. Отказ переехал внутрь
тела корня, и в ту же ночь рядом обнаружилось второе, независимое чтение той же очереди — из
суточной сводки здоровья. Замер в логе PostgreSQL за 19.08: 18 отказов
`permission denied for table outgoing_delivery_queue`, две разные роли.

- [x] **Ревалидация напоминания падала уже под владельцем шва, а не у вызывающего.** Полная запись
      отказа называет место дословно:

      2026-08-19 09:01:03 bcb_test_integrator@bersoncarebot_test 42501
      ERROR:  permission denied for table outgoing_delivery_queue
      CONTEXT: SQL statement "SELECT *  FROM public.outgoing_delivery_queue AS candidate
                 WHERE candidate.id = p_queue_id AND candidate.kind = 'reminder_dispatch'
                   AND candidate.status = 'processing' FOR UPDATE"
               PL/pgSQL function app.revalidate_patient_reminder_delivery_materialization(uuid) line 14

      Принципал был правильный: `runWithDeliveryWorkerPrincipal` стоит на месте с 18.08, EXECUTE
      проходит. `SECURITY DEFINER` переводит тело на владельца шва
      `app_seam_reminder_materialization_owner`, а `SELECT *` / `%ROWTYPE` разворачивается в КАЖДУЮ
      колонку отношения на разборе — у шва же только объявленные поколоночные гранты. Живая
      проверка механизма на `bcb_webapp_dev`:

      SET ROLE app_seam_reminder_materialization_owner;
      SELECT * FROM public.outgoing_delivery_queue LIMIT 1;                      -- ERROR 42501
      SELECT id, event_id, kind, channel, status, organization_id ... LIMIT 1;   -- 1 row

      Ровно этот класс миграция 0020 уже вылечила у трёх соседних корней того же шва; четвёртый
      корень тогда пропустили. Миграция 0038 сужает все три чтения тела до колонок, которые оно
      использует. **Прав не выдано никому:** перечисленные колонки уже стоят в объявленных
      поверхностях, `FOR UPDATE` держится на поколоночном UPDATE, который у шва уже был.

- [x] **Чего это стоило человеку: напоминания пациентам не доставлялись, а умирали.** Состояние
      очереди на TEST (`kind='reminder_dispatch'`) на момент замера:

      status           | count | последняя ошибка
      -----------------+-------+-------------------------------------------------------
      dead             |   181 | permission denied for table outgoing_delivery_queue
      failed_retryable |     3 | permission denied for table outgoing_delivery_queue
      pending          |    83 |
      sent             |  2501 |

      Разбивка умерших за последние двое суток показывает обе стадии одного дефекта:
      86 строк умерли 18.08 с `permission denied for FUNCTION revalidate_patient_reminder_...`
      (12:20–19:24, это чинил предыдущий пункт), и сразу после той правки — 2 строки с
      `permission denied for TABLE outgoing_delivery_queue` (20:21 и 21:21). Каждая строка — это
      напоминание, которого пациент не получил: воркер бросает на ревалидации, строка уходит в
      retry и после шести попыток становится `dead`.

- [x] **Второй вызывающий — суточная сводка здоровья оператора, и она не уходила ни разу.**
      Отказ под ролью `bcb_test_webapp_staff`:

      select "sent_at" from "outgoing_delivery_queue"
       where ("kind" = $1 and "sent_at" is not null) order by "sent_at" desc limit $2

      Это `loadLatestSentOperatorHealthDigestAt` — ПЕРВЫЙ поход в базу `runOperatorHealthDigestTick`,
      из которого берётся начало окна сводки. Отказ не перехвачен, тик падает целиком.
      **Кто опрашивает.** Планировщик интегратора будит сводку раз в час
      (`DIGEST_WAKE_PERIOD_MS = 60*60*1000`), но до этого чтения тик доходит только в минуту
      `digestTime`: вне слота `isDigestSendSlot` отвечает «не слот» и тик выходит раньше. Внутри
      слота `runFixedCadenceWake` не помечает час выполненным, пока wake отдаёт ошибку, поэтому
      цикл планировщика повторяет попытку каждые ~5 секунд, пока минута не кончится — отсюда
      «каждые 5 секунд». В логе это ровно 10–12 отказов в минуту 09:00 каждый день, с 16.08
      (первое вхождение — `2026-08-16 09:00:02.321`), и ни одного в другое время суток.
      **Что видит человек:** ничего. Сводка не уходила ни разу —
      `select count(*) from public.outgoing_delivery_queue where kind='operator_health_digest'` → `0`,
      строки пульса `heartbeat.digest` в `operator_job_status` не существует вовсе. Хуже: карточка
      тика в операторском виде показывает УСПЕХ — `health.operator_health_digest.tick | success |
      2026-08-19 09:01:02`, потому что следующий же тик в 09:01 вышел по «не слот» и перезаписал
      строку. Отказ суток невидим, а молчащая сводка выглядит как спокойный день.

- [x] **Чтение сводки переведено на объявленный корень; гранта рабочей роли не добавлено.**
      Принципала, которому можно читать очередь, у порта webapp нет: логин состоит только в
      `app_worker`, а SELECT на очереди держит `app_operational_delivery_worker` — роль интегратора
      (`pg_auth_members`: `bcb_test_webapp_staff → app_worker`, `bcb_test_integrator →
      app_operational_delivery_worker`). Прямой грант запрещён решением, которое сторожит
      `reminder-materialization-declaration.test.mjs` («runtime roles cannot bypass … the queue
      root»). Поэтому миграция 0038 добавляет `app.read_operator_health_digest_last_sent_at()` —
      владелец шва `app_seam_telemetry_operator_owner` (тот же, что уже разбирает очередь в
      `app.archive_operator_health_failures`), `execute: ['app_worker']`, форма дословно по соседу
      `app.prune_operator_health_failure_archive(integer)`. Рабочая роль получает EXECUTE и ничего
      больше; на таблице к поколоночным грантам ШВА добавляется одна колонка `sent_at`.
      Зарегистрирован в обоих каталогах (`port-context-catalog.test.mjs`,
      `port-context-callsite-catalog.test.mjs`); `generate-cli.mjs --check` — побайтно.

- [x] **Живое доказательство на `bcb_webapp_dev`** (настоящие логины, настоящий порт-контекст,
      после `migrate-dev.sh --preflight` и `--execute`):

      — сводка: session_user=bcb_dev_webapp_staff, current_user=app_worker
        app.read_operator_health_digest_last_sent_at() → 2026-08-19 07:11:00+03
        (тем же логином прямое чтение отношения — по-прежнему отказ)
      — ревалидация: session_user=bcb_dev_integrator, current_user=app_operational_delivery_worker
        app.revalidate_patient_reminder_delivery_materialization(<строка reminder_dispatch>) → t

      Доказательство поведения в тестах: `pgOperatorHealthDigestLastSent.unit.test.ts` — «сводка
      получает время прошлой отправки, а не отказ очереди» и «сводки не было ни разу — это ответ
      NULL, а не ошибка». Fault injection, два уровня: (1) в живой базе вернул телу корня
      `SELECT * … FOR UPDATE` → тот же `42501 permission denied for table
      outgoing_delivery_queue`, вернул тело миграции → снова `t`; (2) вернул репозиторию чтение
      отношения → оба теста красные, вернул корень → 2/2 зелёные.

- [x] **Перепись остальных чтений очереди из-под принципала, которому нельзя.** Проверено
      исполнением `SET ROLE app_staff` на DEV — каждый запрос отвечает `42501`:

      1. `pgOperatorHealthRead.getOutgoingDeliveryQueueHealth` — 12 запросов отношением (`count` по
         статусам, `max(sent_at)`, `max(updated_at)`, разбивки по каналу и виду). Заглушено
         `.catch(() => null)`: панель «очередь доставки» в системном здоровье и строки очереди в
         сводке молчат. В логе TEST этот залп виден 16.08 01:52.
      2. `adminReminderPipelineMetrics.loadAdminReminderPipelineMetrics` — `count(*)` по
         `reminder_dispatch/processing`; отказ превращается в `{ok:false,
         errorCode:'reminder_pipeline_metrics_failed'}`, то есть операторская воронка напоминаний
         пуста целиком.
      3. ЗАПИСЬ той же очереди из webapp: `pgOutgoingDeliveryQueue.enqueueReady` (сводка здоровья и
         напоминания специалистам) и `pgDoctorBroadcastDelivery` — INSERT под `app_staff`, у
         которого на очереди нет ни одной привилегии. Значит, суточная сводка не уедет и после
         этой правки: чтение вылечено, постановка в очередь — следующий разрыв на том же пути.
      4. В интеграторе `enqueueOutgoingDeliveryIfAbsent` пишет очередь сырым INSERT под
         принципалом вызывающего, а комментарий в нём утверждает, что «каждый продюсер уже имеет
         app_staff INSERT» — это утверждение неверно с момента запирания прав.

      Пункты 1–4 — НЕ моя правка (см. «НЕ СДЕЛАНО»): у них своя дверь — универсальный корень
      постановки исходящего (`UNIVERSAL_OUTBOUND_2026-08-19.md`) и отдельный операторский корень
      здоровья очереди.

## НЕ СДЕЛАНО

- Почему напоминания падают на ПРОДЕ, где стен RLS нет, — причина там другая и не установлена.
  Нужен просмотр логов интегратора на проде на чтение; владельцу вопрос задан, ответа нет.

- **Живая проверка на TEST** (последний пункт чек-листа) — не моя: выкатывает ведущий. На DEV
  проверено то, что на DEV проверяемо (см. доказательства у пунктов выше).

- **НАХОДКА, не залатанная молча: `app.enqueue_outbound_message` НЕ ВЫЗЫВАЕТСЯ вообще.** Его
  аргумент `p_content` объявлен как `jsonb`, а `portTypedArgsForFunctionIdentity`
  (`packages/db-principal/src/portContext.ts:177-192`) типа `jsonb` не поддерживает — и не может:
  клиент обязан воспроизвести байты `jsonb_send`, то есть КАНОНИЧЕСКОЕ представление PostgreSQL,
  а не свою строку. Замерено:

  ```
  $ node -e "require('./packages/db-principal/dist/portContext.js')
      .portTypedArgsForFunctionIdentity('app.enqueue_outbound_message(uuid,text,text,text,text,jsonb,integer)',
        ['00000000-0000-4000-8000-000000000001','booking.confirmation','k','email','a@b.c','{}',3])"
  THROWS: app.enqueue_outbound_message(...) uses unsupported port argument type jsonb
  ```

  Отказ происходит в `runWebappNamedRoot` ДО обращения к базе, то есть письмо-подтверждение записи
  (`bookingCreatedEffects.ts:116` на живом пути создания записи) в очередь не попадает вовсе.
  Починка — та же, что применена здесь в 0034: аргумент типа `text`, разбор `::jsonb` внутри корня.
  Это чужой workstream (`docs/_TODO/UNIVERSAL_OUTBOUND_2026-08-19.md`), поэтому вынесено, а не
  исправлено по дороге.

- **`apps/webapp/.env.dev` главного дерева не знает новой возможности.** `migrate-dev.sh --execute`
  дописал `appointment_reminder_generation_replace` в `.env.dev` ЭТОГО worktree.
  `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` остался прежним — до слияния ветки
  запуск нового корня из главного дерева упрётся в «Missing declared webapp port capability».

- **Отказ синхронизации с Google-календарём по-прежнему только логируется**
  (`trySyncCanonicalBookingToGoogleCalendar` глотает ошибку в `logger.warn`). Теперь календарь хотя
  бы ВЫПОЛНЯЕТСЯ; сделать его отказ таким же громким, как отказ материализации, — отдельное решение,
  в чек-листе такого пункта нет.

  **Уточнение 19.08 (работа `wt/booking-event-off-request-20260819`).** `runBookingLifecycleSteps`
  теперь открывает операторский инцидент на КАЖДЫЙ упавший шаг (`recordOperatorFailureIncident`,
  направление `booking_lifecycle_step`, `integration` = имя шага). Календаря это НЕ касается именно
  из-за глотания выше: шаг `google_calendar` не может упасть, поэтому и инцидента по нему не бывает.
  Чтобы отказ календаря стал виден, надо снять `catch` внутри
  `trySyncCanonicalBookingToGoogleCalendar` — это по-прежнему отдельное решение.

  **Не сделано этой работой (`wt/integrator-incident-denied-20260819`):**

  - **Живая проверка на TEST** — выкатывает ведущий; в ветке правка доезжает обычным
    `reconcile-access.mjs`, тем же путём, что и на DEV.
  - **`app.read_integrator_platform_integration_availability()` выдана только
    `app_operational_delivery_worker`.** Это не дефект: её обёртка
    (`platformIntegrationAvailability.ts`) сама входит в контур доставки. Названо, чтобы следующий
    читатель не принял узкий грант за поломку.
  - **Данные календаря на DEV/TEST лежат глобальной строкой (`organization_id IS NULL`), а
    org-ветка корня требует ТОЧНУЮ строку клиники.** Даже с исправленным правом клиника, чьи
    `google_calendar_id`/`google_calendar_enabled` не перенесены в org-строку, читает `null`. Для
    доказательства на DEV строка клиники заведена вручную. Перенос данных — не эта работа.
  - **Легаси-оверлей `deploy/postgres/integrator-server-runtime-config.sql` по-прежнему пишет
    `GRANT EXECUTE … TO :"integrator_runtime_config_role"` на календарный корень.** Ни один
    deploy-скрипт его не применяет (права идут из объявления через `reconcile-access.mjs`), поэтому
    он не переспорит правку; но текст файла разошёлся с объявлением. Не трогал: чужой файл, и
    правка в нём — отдельное решение.
  - **Вебапп не проверялся.** Перепись выше — по интегратору, как и было поручено; у вебаппа своя
    реализация `reportEmptyNotificationAudience`, её стены не смотрел.

- **Очередь доставки, оставшиеся вызывающие** (перепись выше, пункты 1–4): панель здоровья очереди
  и воронка напоминаний в операторском виде по-прежнему пусты, а ПОСТАНОВКА сводки в очередь под
  `app_staff` по-прежнему запрещена — суточная сводка не уедет и с вылеченным чтением. Правка не
  моя: постановка принадлежит универсальному корню исходящего
  (`UNIVERSAL_OUTBOUND_2026-08-19.md`), а здоровью очереди нужен свой операторский корень —
  это 12 запросов, а не один. Владельцу решать порядок.

- **Живая проверка на TEST** для этой пары правок — не моя: выкатывает ведущий. На DEV проверено
  всё, что на DEV проверяемо (доказательства у пунктов выше).
