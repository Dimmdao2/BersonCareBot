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

## Очередь доставки: сторож не имел права читать свою очередь и не имел права её пополнять (19.08, ветка `wt/operator-queue-health-20260819`)

Предыдущая работа вылечила ОДНО чтение очереди из вебаппа (время прошлой сводки, миграция 0038) и
оставила переписью четыре места. Здесь они воспроизведены поштучно, и перепись оказалась верна не
целиком.

- [x] **Воспроизведение: `app_staff` и `app_worker` отказаны на очереди — да, оба.** На
      `bcb_webapp_dev`, транзакция откачена:

      BEGIN; SET LOCAL ROLE app_staff;  SELECT count(*) FROM public.outgoing_delivery_queue
        WHERE status in ('pending','failed_retryable');   -- 42501 permission denied for table
      BEGIN; SET LOCAL ROLE app_worker; (тот же запрос)   -- 42501 permission denied for table
      BEGIN; SET LOCAL ROLE app_staff;  INSERT INTO public.outgoing_delivery_queue
        (event_id,kind,channel,status) VALUES ('x','operator_health_digest','email','pending');
                                                          -- 42501 permission denied for table
      BEGIN; SET LOCAL ROLE app_tenant_service; (INSERT doctor_broadcast)  -- 42501
      BEGIN; SET LOCAL ROLE app_operational_delivery_worker; (INSERT reminder_dispatch) -- 42501

      Последняя строка — находка сверх переписи: у роли доставки на очереди есть SELECT и
      поколоночный UPDATE, но INSERT'а нет тоже. То есть пункт 4 переписи («интегратор пишет
      очередь сырым INSERT под принципалом вызывающего») сломан не только у арендных принципалов,
      а у ВСЕХ.

- [x] **Пункт 1 переписи реален, но последствие названо неверно, и настоящее — хуже.**
      `getOutgoingDeliveryQueueHealth` действительно отказан (в логе TEST виден весь залп из
      двенадцати запросов под `bcb_test_webapp_staff`). Но админская страница «Здоровье системы»
      его НЕ вызывает: числа очереди она берёт из курированного корня
      `app.read_curated_system_health()` (владелец `saas_system_health_owner`) через отдельный
      диагностический пул — `pgCuratedSystemHealthDiagnostics.ts`. Единственные два вызывающих
      отказанного метода:

      1. `collectCriticalHealthSignalsBase` — и вызов стоит в ГОЛОМ `Promise.all`, без `catch`.
         Значит 42501 роняет не панель, а ВЕСЬ пятиминутный критический тик
         (`runOperatorHealthCriticalTick`) и баннер здоровья в кабинете врача
         (`collectOperatorHealthBannerInput` идёт той же дорогой). Человеку это стоит НИ ОДНОГО
         критического операторского алерта: ни про мёртвую очередь, ни про backlog, ни про
         потерянный пульс доставки, ни про пробой изоляции арендаторов — весь классификатор
         `classifyCriticalHealthSignals` не доезжает до вызова.
      2. `collectOperatorHealthDigestInput.ts:55` — заглушено `.catch(() => null)`, поэтому в
         суточной сводке строки очереди просто молчат.

- [x] **Пункт 2 переписи НЕ реален.** `loadAdminReminderPipelineMetrics` не вызывает НИКТО:
      `grep -rn "loadAdminReminderPipelineMetrics"` по всему репозиторию даёт ровно две строки —
      объявление функции и цитату в этом плане. Воронка напоминаний в операторском виде
      наполняется из `curatedSnapshot.remindersPipeline` (тот же курированный корень), а код
      `reminder_pipeline_metrics_failed` в живом ответе не появляется вовсе: статус воронки берётся
      из `curatedResult.errorCode`. Это мёртвый код, а не живой разрыв; правка его не трогала —
      удаление мёртвого кода отдельным решением, см. «НЕ СДЕЛАНО».

- [x] **Снимок здоровья очереди переведён на объявленный корень; гранта рабочей роли не добавлено.**
      Двенадцать запросов отношением сведены в ОДИН корень
      `app.read_operator_delivery_queue_health()` — владелец шва `app_seam_telemetry_operator_owner`
      (тот же, что уже разбирает очередь в `app.archive_operator_health_failures` и отдаёт время
      прошлой сводки в 0038), `execute: ['app_worker']`, форма дословно по соседу из 0038. Миграция
      `apps/webapp/db/drizzle-migrations/0039_the_operator_watchman_may_not_read_its_own_queue.sql`,
      объявление — `deploy/postgres/privileges/declaration.ts`, вызов —
      `apps/webapp/src/infra/repos/pgOperatorHealthRead.ts`. **Рабочая роль получает EXECUTE и
      ничего больше**; на таблице к поколоночным грантам ШВА добавляются ровно две недостающие
      колонки — `next_retry_at` и `updated_at`. Весь дифф прав в сгенерированном артефакте — три
      строки: две `GRANT EXECUTE … TO "app_worker"` и один поколоночный `GRANT SELECT … TO
      "app_seam_telemetry_operator_owner"`.

- [x] **Постановка суточной сводки переведена на объявленный корень — это и был следующий разрыв.**
      `app.enqueue_operator_health_digest_delivery(text,text,text,integer)` — владелец шва доставки
      `app_seam_delivery_scope_owner` (тот же, что держит `app.enqueue_outbound_message`),
      `execute: ['app_worker']`. **Ни одного нового поколоночного гранта:** все десять колонок
      вставки у шва уже были. Универсальный корень исходящего для сводки НЕ подошёл и подменён не
      был: он жёстко ставит `kind='outbound_message'` и сам собирает payload, а сводку интегратор
      отбирает именно по `kind='operator_health_digest'` (`outgoingDeliveryScope.ts:40`) и по
      операторскому классу `operator_security`/`operator_alert`. Прямой путь снят, двух путей не
      оставлено: ветка `operator_health_digest` удалена из
      `pgOutgoingDeliveryQueue.enqueueReady`, а `OperatorHealthDigestReadyOutgoingDelivery` выведена
      из `ReadyOutgoingDelivery` — тем же приёмом, что 0034 применила к напоминанию о записи.

- [x] **Живое доказательство на `bcb_webapp_dev`** (настоящий логин `bcb_dev_webapp_staff`,
      настоящая установка порт-контекста тем самым infra-источником, которым ходит тик сводки —
      `api/integrator/operator-health/digest-wake:POST`; боевой код репозиториев; после
      `migrate-dev.sh --preflight` и `--execute`):

      principal: {"s":"bcb_dev_webapp_staff","c":"app_worker"}
      queue health snapshot: {"dueBacklog":91,"deadTotal":0,"blockedRecipientTotal":87,
        "oldestDueAgeSeconds":148142,"dueByChannel":{"email":3,"telegram":45,"web_push":43},
        "dueByKind":{"outbound_message":14,"reminder_dispatch":77},"deadByKind":{},
        "processingCount":0,"lastSentAt":"2026-08-04T10:53:20.833+03:00",
        "confirmedSentLast24h":0,"lastQueueActivityAt":"2026-08-19T07:44:59.461+03:00"}
      digest last sent at: null
      digest enqueue inserted: 1
      digest enqueue repeat inserted (idempotency): 0

      Строка сводки ДЕЙСТВИТЕЛЬНО появилась — раньше их не появлялось ни одной за всю историю:

      id                   | da3bd90c-5847-40ee-8b63-297af803b69e
      event_id             | operator-health-digest:2026-08-19:email:proof0001
      kind                 | operator_health_digest
      channel              | email
      status               | pending
      attempt_count/max    | 0 / 6
      organization_id NULL | t
      outboundCapability   | operator_alert

      Следующий прогон снимка увидел её сам: `dueByKind` стал
      `{"outbound_message":14,"reminder_dispatch":77,"operator_health_digest":1}` — то есть чтение и
      постановка сошлись на одном и том же живом ряде. Строка пробы после доказательства удалена с
      DEV, чтобы dev не инициировал доставку (§1b).

      Доказательство поведения в тестах:
      `apps/webapp/src/infra/repos/pgOperatorQueueHealthRoot.unit.test.ts` — «оператор видит
      настоящие числа очереди, а не пустую панель», «суточная сводка попадает в очередь: строка
      ставится, а не теряется на отказе», «повторный тик тех же суток не рождает второй сводки».
      Fault injection, два уровня: (1) в живой базе снял у шва единственную колонку
      (`REVOKE SELECT (updated_at) … FROM app_seam_telemetry_operator_owner`) → живая проба легла с
      `42501 permission denied for table outgoing_delivery_queue`, вернул грант → снимок снова
      настоящий; (2) вернул репозиторию чтение отношения → красным стал ровно тест «оператор видит
      настоящие числа», вернул корень → 3/3 зелёные.


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

- **Работа `wt/operator-queue-health-20260819`, что осталось за границей:**

  - **Живая проверка на TEST** — не моя: выкатывает ведущий. На DEV проверено всё, что на DEV
    проверяемо (доказательства у пунктов выше). До выкатки суточная сводка на TEST по-прежнему не
    уедет и критический тик по-прежнему падает.

  - **`pgDoctorBroadcastDelivery.commitAuditAndDeliveryQueue` — НЕ починена.** Отказ реален
    (`SET LOCAL ROLE app_tenant_service; INSERT … 'doctor_broadcast'` → 42501), но это не одна
    вставка: одна транзакция пишет `broadcast_audit`, N строк очереди и `broadcast_audit_recipients`
    и обязана быть атомарной, а объявленный корень по построению не может начинаться внутри
    транзакции отношений (`runWebappNamedRoot`: «Webapp named root must start before the relation
    transaction»). Значит корень должен принять ВЕСЬ пакет рассылки целиком и собрать все три
    записи у себя — это отдельная работа со своей приёмкой, а не попутная правка. Названо, а не
    залатано молча.

  - **`pgOutgoingDeliveryQueue.enqueueReady` для `specialist_task_reminder` — НЕ починена.** Тот же
    класс: вставка живёт внутри транзакции задачи специалиста (`pgSpecialistTasks.ts:119,155,280`)
    и вдобавок зовёт `app.refresh_specialist_task_reminder_materialization` тем же `tx`. Ветка
    `reminder_dispatch` того же метода — тоже. Оба требуют своего корня формы 0034
    (корень получает поколение целиком), не переезда вызова.

  - **Интеграторский `enqueueOutgoingDeliveryIfAbsent` — НЕ починена, и разрыв шире, чем в
    переписи.** INSERT на очередь не выдан НИ ОДНОЙ рабочей роли, включая
    `app_operational_delivery_worker` (замер выше). Значит комментарий в теле функции («каждый
    успешный продюсер уже имеет app_staff INSERT») неверен вдвойне, а вместе с постановкой падает
    и стоящая рядом ретенция (`deleteExpiredSentOutgoingDeliveries`). Через эту функцию идут
    операторские алерты (`reportOperatorFailure.ts:130,168`, `kind='operator_alert'`) и
    `inbound_reply` (`jobQueue.ts:105`) — то есть НИ ОДИН операторский алерт интегратора в очередь
    не попадает. Форма починки уже есть у соседа в том же файле:
    `enqueueAcceptedIncomingReplyIfAbsent` ходит объявленным корнем
    `app.enqueue_integrator_inbound_reply(text,text,text,integer,uuid)` под
    `runWithDbInfraPrincipal`. Это чужой контур (интегратор) и отдельная приёмка.

  - **`loadAdminReminderPipelineMetrics` — мёртвый код, оставлен как есть.** Вызывающих ноль
    (доказательство в чек-листе выше). Он читает очередь отношением и упрётся в 42501 у первого же,
    кто его оживит. Удалять мёртвый код или оживлять его через снимок очереди — решение владельца,
    а не попутная правка: в плане такого пункта нет.

  - **Сторож по-прежнему рапортует успех поверх молчащего механизма — эта правка того НЕ чинит.**
    Механизм: `/api/integrator/operator-health/digest-wake` зовёт
    `recordOperatorCronJobTickBestEffort(..., success: true)` на ЛЮБОЙ успешный возврат тика,
    включая `{sent:false, reason:'not_slot'}`. Планировщик будит сводку раз в час, поэтому тик в
    09:01 выходит по «не слот» и перезаписывает строку `health.operator_health_digest.tick` поверх
    настоящего отказа в 09:00. Моя правка убирает ПРИЧИНУ отказа, но не убирает затирание: любой
    следующий отказ в слоте будет так же закрашен соседним «не слот».
    **Наименьшая верная починка** (не построена, требует решения владельца): не писать тик вовсе,
    когда работы не было — то есть в `apps/webapp/src/app/api/integrator/operator-health/digest-wake/route.ts`
    пропускать `recordOperatorCronJobTickBestEffort` при `result.reason === 'not_slot'`. Строка
    состояния тогда описывает последнюю попытку СДЕЛАТЬ сводку, а не последний холостой опрос.
    То же самое место и в `/api/internal/operator-health-digest/tick/route.ts`.

    **Дополнено 19.08 (ветка `wt/tick-partial-failures-20260819`).** У КРИТИЧЕСКОГО тика нашёлся второй,
    независимый способ соврать: он писал `success`, пока один из его сигналов получал `42501` на
    `be_organization_members` (аудитория staff-веб-пуша операторского алерта), — отказ гасил `.catch` в
    `dispatchOperatorAlert`. Там починено ИНАЧЕ, чем предлагает абзац выше: отказ сделан НЕВОЗМОЖНЫМ —
    аудитория переведена на объявленный корень `app.list_operator_alert_staff_push_recipients()`
    (миграция 0040), а не сделан заметным ещё одной проверкой. Замер, воспроизведение и fault injection —
    `docs/_TODO/UNSCHEDULED_OPERATOR_JOBS_2026-08-19.md`, раздел «Тик рапортовал успех поверх отказанного
    сигнала». Затирание строки «не слотом», описанное выше, эта работа не трогала.
