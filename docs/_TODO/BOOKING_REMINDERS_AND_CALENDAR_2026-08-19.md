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
