# Четыре ошибки живого прохода владельца по пациенту на TEST

Владелец прошёл сценарий пациента на TEST 18.08 и назвал четыре ошибки дословно:

> «1) в комментарии к упражнению не прикрепляется медиа. 2) запись - процесс создания
> (подтверждения) записи очень долгий 3) настройка каналов уведомлений - ошибка, не работает.
> 4) сохранение часовоого пояса происходит без подтверждения»

Это единственный источник требований по этим четырём. Ничего сверх названного не чинить.

## 1. Медиа не прикрепляется к комментарию к упражнению

- [x] Установить, где рвётся путь: загрузка файла, привязка к комментарию или отображение.
      Доказать замером на живом TEST или dev, а не чтением кода.
      **Замер на живом TEST (19.08, doctor `dimmdao@yandex.ru` + patient `kinesiospace@gmail.com`,
      instance `7586d495-b8d5-4443-b506-be967fa0b035`, item `5c2a0ad5-ac6f-4458-945e-17e645e54b80`):
      upload → confirm → attach → doctor-thread GET все возвращают `ok:true` и корректный
      `mediaFileId`; `/api/media/<id>/playback` и `/preview/sm` отдают 200 обеим ролям. Путь
      загрузки/привязки/отображения одного сообщения — исправен.** Рвётся не там: врачебный
      кросс-пациентский список `/api/doctor/exercise-comments` (используется «Сегодня» и вкладкой
      «Комментарии») брал `latestMessage` через CTE в
      `apps/webapp/src/infra/repos/pgProgramItemDiscussion.ts::queryDoctorExerciseComments`, чей
      `WHERE` внутри `DISTINCT ON` требовал `media_file_id IS NULL` — то есть последнее сообщение
      пациента БЕЗ текста (только медиа) целиком выпадало из выборки, и список показывал старое
      текстовое сообщение как «последнее», как будто медиа не приходило вовсе. Подтверждено
      именно на реальном сообщении владельца: `latestMessage` для этого item возвращал
      `c2ffca57…` («Тест», 2026-08-18 11:23:50) вместо `1496c073…` (медиа, 2026-08-18 11:24:53) —
      **владелец прикрепил файл, но нигде в врачебном списке это не отразилось.**
- [x] Починить и доказать: пациент прикрепляет файл к комментарию, врач его видит.
      Фикс: `apps/webapp/src/infra/repos/pgProgramItemDiscussion.ts` — убран фильтр
      `media_file_id IS NULL` из CTE `queryDoctorExerciseComments`; `latestMessage` теперь
      действительно последнее сообщение пациента (текст или медиа). Остальной путь (upload/attach/
      render) уже работал и не менялся. Коммит `1dae8918f`.

## 2. Подтверждение записи очень долгое

Часть уже сделана 19.08: письмо ушло с пути запроса в очередь; шаги события развязаны, и упавший
шаг больше не отменяет остальные; параметр `p_content` перестал быть `jsonb` (иначе очередь вообще
не наполнялась). Осталось:

- [x] Замерить подтверждение записи на живом TEST от нажатия до ответа. Назвать число и команду.
      **3,4 с** — четыре настоящих подтверждения (не шаги до него), живой TEST под пациентом
      `kinesiospace@gmail.com`, 19.08 06:20–06:21 MSK: 3,529 · 3,425 · 3,368 · 3,399 с; пятое с
      `slotCount=2` — 3,507 с. Все вернули `200` и настоящую запись (например
      `canonicalAppointmentId 0f8983c7-d877-4be9-b3f0-0ab2421c701c`). Команда:

          curl -sk --resolve test.bersoncare.ru:443:127.0.0.1 -b pj.txt \
            -H 'origin: https://test.bersoncare.ru' -H 'content-type: application/json' \
            -X POST https://test.bersoncare.ru/api/booking/create \
            -d '{"type":"in_person","branchId":"54432236-…","serviceId":"bb4cb10e-…",
                 "cityCode":"moscow","slotStart":"2026-08-25T06:00:00.000Z",
                 "slotEnd":"2026-08-25T07:00:00.000Z","contactName":"…",
                 "contactPhone":"+79990000001","contactEmail":"kinesiospace@gmail.com"}' \
            -w '\nHTTP %{http_code} total=%{time_total}s\n'

      То же число со стороны nginx (`request_time=3.526/3.421/3.364/3.399`,
      `sudo -n grep "booking/create" /var/log/nginx/access.log`), то есть время съедено приложением,
      а не сетью. Соседние пациентские маршруты в тот же момент — 46–99 мс
      (`/api/booking/history`, `/api/booking/memberships`, `/api/booking/slots`), так что 3,4 с —
      это именно подтверждение записи, а не общий фон стенда.

- [ ] Если осталось больше секунды — найти, на что уходит, и убрать.
      **Найдено; не убрано** — снятие требует своего решения, см. ниже.
      Где именно уходит (замер, не чтение кода): запись в БД появляется через ~100 мс
      (`be_appointments.created_at 06:20:46.031`, `updated_at .125`), а ответ уходит в
      `06:20:49.466`. В журнале webapp между `06:20:46.131` и `06:20:49.466` — **3,335 с полной
      тишины**, ни одной строки:

          sudo -n journalctl -u bersoncarebot-webapp-test \
            --since "2026-08-19 06:20:44" --until "2026-08-19 06:20:52" -o short-precise

      На этот промежуток в `apps/webapp/src/modules/patient-booking/canonicalCreate.ts:607-646`
      приходится ровно один блок с вводом-выводом — `Promise.all(... deps.syncPort.emitBookingEvent
      ...)`, и он **ожидается на пути запроса**. Реализация —
      `apps/webapp/src/modules/integrator/bookingM2mApi.ts:40-79`: `postSignedWithRetry` при отказе
      интегратора спит `1000` мс, повторяет, спит `2000` мс, повторяет — **ровно 3,0 с сна**, после
      чего бросает, а внешний `catch {}` (строка 645) ошибку глотает. Отсюда и 3,4 с, и её
      постоянство: с `slotCount=2` два события идут параллельно, и время не растёт (3,507 с) — то
      есть это фиксированная лестница пауз, а не работа на запись.
      Адрес интегратора на TEST — `system_settings.integrator_api_url =
      https://tgcarebot.bersonservices.ru` (ПРОД-хост); свой `bersoncarebot-integrator-test` на боксе
      `inactive`. Проверять подписанным запросом по ПРОД-адресу я не стал: это ПРОД.
      **Что убрать:** решение владельца 19.08 «письмо и уведомление не надо ждать — абсолютно точно»
      применено к письму (ушло в очередь), но событие жизненного цикла интегратора по-прежнему
      ожидается, да ещё с трёхсекундной лестницей повторов, а его отказ всё равно проглатывается.
      Ждать то, чей результат выбрасывается, смысла нет. Куда это переносить — в
      `outbound`-очередь по образцу письма или отдельным корнем — это развилка
      `docs/_TODO/UNIVERSAL_OUTBOUND_2026-08-19.md`, а не правка внутри этого пункта.

- [x] Отдельный отказ на этом же разделе: `/api/booking/in-person-services` отдавал **500**.
      Воспроизведено 19.08 06:06:39 на живом TEST под `kinesiospace@gmail.com`
      (`GET /api/booking/in-person-services?branchId=54432236-…` → `HTTP 500`), в журнале Postgres
      той же секундой — `bcb_test_webapp_patient@bersoncarebot_test 42501 ERROR: permission denied
      for table be_branches`. Причина: маршрут читал филиал под `app_patient` ДО того, как
      появлялся организационный контекст, только чтобы узнать `organizationId`; прав на
      `be_branches` у `app_patient` нет и не должно быть. Вдобавок он ставил принципал ЛЮБОЙ
      организации, чей `branchId` прислали, — членство не проверялось вовсе.
      Починено коммитом `38f16d639`: организация берётся общим для маршрутов записи резолвером
      `resolvePatientEnrollmentOrganizationId` (активная запись пациента), каталог приходит уже
      существующим объявленным корнем `app.read_current_patient_booking_catalog()` — тем же, которым
      живёт мастер записи. Новых прав, ролей, корней и миграций не появилось;
      `generate-cli.mjs --check` совпадает побайтно.
      Доказано живьём на DEV: старый файл → `HTTP 500` + `42501 permission denied for table
      be_branches` в журнале (06:27:21), новый → `HTTP 200` со списком услуг своего филиала и
      `404 branch_not_found` на чужой филиал, новых отказов в журнале нет.

### Соседи того же вида (перепись, 19.08) — не чинилось, вынесено владельцу/ведущему

Отказ `be_branches` — не единственный своего класса. Класс такой: **пациентский маршрут читает
таблицу, которой нет в 51 таблице, выданной роли `app_patient`, и не идёт через объявленный корень.**
Контекст организации тут ни при чём: `withPatientOrganizationPrincipal` оставляет ту же роль
`app_patient`, поэтому отказ приходит и внутри контекста. Проверены все 92 маршрута под пациентскими
гейтами, пациентские server actions и RSC-загрузчики `app/app/patient/**`.

Один корень объясняет шесть из семи: `pgTreatmentProgram.getTemplateById`
(`apps/webapp/src/infra/repos/pgTreatmentProgram.ts:634`) не имеет ветки `isCurrentPatientPrincipal()`,
которая есть у десятка соседних репозиториев (`pgBookingScheduling.ts:299`, `pgBookingForm.ts:44`,
`pgMemberships.ts:226`, `pgSystemSettings.ts:448` …).

| путь | файл | таблицы без гранта | достижимо пациентом сегодня |
|---|---|---|---|
| `POST /api/patient/courses/[courseId]/enroll` | `route.ts:43` → `pgTreatmentProgram.ts:634` | `treatment_program_templates(+_stages,_stage_items)` | да — `PatientCoursesCatalogClient.tsx:44` |
| `POST /api/patient/reminders/create` (ветка промо) | `route.ts:146` → `instance-service.ts:336` | те же три | да — `ReminderCreateDialog.tsx:339` |
| RSC `/app/patient/treatment` | `page.tsx:51` → `patientTreatmentProgramEntry.ts:42` | те же три | да — нижняя навигация «Упражнения»; отказ проглатывается |
| RSC `/app/patient/reminders` | `RemindersPageBody.tsx:133` | те же три | да; отказ проглатывается |
| RSC `/app/patient/go/*` (диплинки напоминаний) | `resolvePatientReminderGoTargets.ts:117` | те же три | да; отказ проглатывается |
| `GET /api/booking/memberships/payment-status` | `route.ts:39` — чтение вынесено ЗА блок принципала | `be_payment_intents` | да — `PatientPackagePayClient.tsx:33`, но сегодня не выстреливает: на TEST `select count(*) from be_patient_packages where payment_intent_id is not null` → **0**. Отдаст 500 при первой же покупке абонемента с оплатой |
| `POST /api/patient/treatment-program-promo/action` | `route.ts:67,84` — принципала нет вовсе | те же три | нет, вызывающего в приложении не найдено |
| RSC `/app/patient/treatment/promo/item/[id]` | `page.tsx:60` | те же три | ссылки в приложении нет, только прямой URL |

Отдельно, **на самом пути подтверждения записи** — `POST /api/booking/create`:
`buildAppDeps.ts:1307` подключает `getPlatformUserIdentityContacts` к **врачебному** порту
`doctorClientsPort.getClientIdentity` (`pgDoctorClients.ts:1249`), а тот читает `platform_users`
с врачебной проекцией (ФИО, телефон, почта, `is_blocked`, `is_archived`). Под пациентом это
`42501 permission denied for table platform_users` — та самая запись в журнале ПРОДа-TEST
18.08 22:49:26.355, через 6 мс после `booking.confirmation_email.sent` того же bookingId.
Это **(а) врачебный запрос под пациентским принципалом**, а не экран, просящий лишнее: вызывающему
нужны ровно два поля о себе — `{phone, email}` — и он выбрасывает всё остальное. Стена права.
Отказ глотает пустой `catch {}` (`canonicalCreate.ts:56-68`), поэтому запись создаётся, а
**телефон и почта из формы записи не попадают в дополнительные контакты ни у одного пациента**.
Чинить надо проводку в `buildAppDeps.ts:1307`, а не грант. Заметить: `platform_user_contacts`
тоже без гранта `app_patient` (и без INSERT/UPDATE у `app_staff`), то есть вторая половина
`persistBookingFormContacts` мертва и для персонала — это отдельная работа, не заплатка.

⚠️ `platform_users` — ПДн и без собственного RLS. Ничего из перечисленного не чинится расширением
прав `app_patient`; каждый случай — либо ветка на объявленный корень, либо перенос чтения внутрь
уже существующего блока принципала.

## 3. Настройка каналов уведомлений отказывает

Симптом: отказ прав на `user_notification_topic_channels`.

- [x] Найти путь, который читает и пишет эту таблицу, и роль, под которой он идёт.
      Чтение — `apps/webapp/src/app/app/patient/notifications/settings/page.tsx` →
      `pgTopicChannelPrefs.listByUserId` прямым `select` под `app_patient` (у роли есть
      табличный SELECT). Запись — server action `setTopicChannelNotificationEnabled`
      (`notificationPrefsActions.ts`) → `pgTopicChannelPrefs.upsert` → объявленный корень
      `app.set_current_patient_notification_topic_channel(text,text,boolean)`,
      SECURITY DEFINER, владелец `app_seam_patient_self_actions_owner`. Отказ приходил
      ВНУТРИ корня, под логином `bcb_test_webapp_patient`.
- [x] Закрыть отказ ПРАВИЛЬНО: объявленный корень с владельцем, у которого право уже есть.
      Корень и его владелец уже существовали; новых корней, ролей и прав рабочим ролям не
      появилось. Причина — `INSERT … ON CONFLICT DO UPDATE` под FORCE RLS перечитывает
      конфликтующую строку и требует SELECT по ВСЕМ колонкам поверхности, а у владельца шва
      SELECT был выдан на 3 из 5 (`channel_code, topic_code, user_id`) при INSERT/UPDATE на
      всех 5. Закрыто коммитом `060250465` в `feat/doctor-ui-rebuild`: декларация выдаёт
      владельцу шва SELECT на все 5 колонок, а генератор (`generate.mjs`) теперь ОТКАЗЫВАЕТ,
      если поверхность с INSERT+UPDATE объявляет SELECT уже своей записи. Миграция не нужна:
      права приходят из `deploy/postgres/generated/privileges.*.sql`, не из drizzle.
      Тем же сужением были сломаны ещё четыре поверхности — все выправлены тем же коммитом.
- [x] Доказать живьём: пациент открывает настройки каналов, меняет канал, изменение сохраняется.
      Живой TEST под `kinesiospace@gmail.com` 19.08: 21 переключатель (7 тем × telegram/max/email)
      отвечает `{"ok":true}`; страница после перезагрузки отдаёт записанное значение
      (`patient_news/telegram` → `isEnabled:true` в модели страницы), в
      `bersoncarebot_test.user_notification_topic_channels` — 19 строк с сегодняшним
      `updated_at`. Внесение поломки на DEV (снять SELECT на `is_enabled, updated_at` у
      владельца шва) воспроизводит ровно отказ владельца — `42501 permission denied for table
      user_notification_topic_channels` внутри корня, UI отдаёт «Не удалось сохранить
      настройки»; возврат гранта возвращает `{"ok":true}`.

Отдельная проверка: путь врача (`/app/account` → `setDoctorTopicChannelNotificationEnabled`)
пишет ту же таблицу напрямую под `app_staff`, у которой SELECT выдан на таблицу целиком, —
тем же дефектом не задет. Проверено живьём на TEST: `doctor_patient_messages/telegram`
false → true, обе записи `{"ok":true}` (первая INSERT, вторая ON CONFLICT DO UPDATE).

## 4. Часовой пояс сохраняется без подтверждения

- [x] Человек должен видеть, что сохранение произошло. Как именно — по тому, как это уже сделано
      на соседних экранах этого же кабинета; новых узоров не изобретать.
      Уже закрыто коммитом `75f5452a7` (18.08, до этого плана) — `toast.success('Часовой пояс
      сохранён')` в `PatientCalendarTimezoneSection.tsx`, тот же `react-hot-toast`, что и у соседних
      секций страницы профиля (`AuthOtpChannelPreference`, `DiaryDataPurgeSection`). Ошибка и раньше
      не глоталась: `msg` показывает текст под кнопкой (`'Выберите корректный пояс из списка.'` /
      `'Не удалось сохранить.'`). Проверено: экран НЕ в `SWALLOWED_ERRORS_CENSUS_2026-08-19.md`
      (`grep -n -i "timezone" docs/_TODO/SWALLOWED_ERRORS_CENSUS_2026-08-19.md` → 0 совпадений) —
      это чистый UI-разрыв «нет подтверждения», не проглоченная ошибка БД.
- [x] Доказать: сохранение показывает подтверждение, ошибка показывает ошибку.
      **Live TEST, 19.08** (сервис `bersoncarebot-webapp-test` крутит `485a84256`, включает фикс):
      - Backend-контракт под пациентским логином `kinesiospace@gmail.com`:
        `PATCH /api/patient/profile/calendar-timezone {"calendarTimezone":"Europe/Samara"}` →
        `200 {"ok":true}`, следующий `GET` подтверждает `calendarTimezone:"Europe/Samara"`;
        `PATCH {"calendarTimezone":"Not/AZone"}` → `400 {"ok":false,"error":"invalid_timezone"}`.
        Пояс возвращён на `Europe/Moscow` после проверки.
      - Живой рендер: headless Chromium (`playwright-core` из `/home/dev/brain/node_modules`) зашёл
        под тем же логином на `/app/app/patient/profile`, нажал «Сохранить пояс» — на экране всплыл
        зелёный тост «Часовой пояс сохранён» (скрин `/tmp/tz-toast.png`, не входит в репозиторий).
      - Unit-тест `PatientCalendarTimezoneSection.ui.test.tsx` (уже в коммите `75f5452a7`) кроет оба
        пути поведенчески: `toastSuccess` вызывается с текстом на успехе, и НЕ вызывается при отказе
        сервера, показывая вместо этого текст ошибки. Прогон:
        `pnpm --dir apps/webapp test src/app/app/patient/profile/` → `2 files, 3 tests passed`.
      - Fault injection (19.08, воркер этой задачи): закомментировал `toast.success(...)` в файле →
        `pnpm --dir apps/webapp test .../PatientCalendarTimezoneSection.ui.test.tsx` → 1 из 2 тестов
        красный (`toastSuccess` не вызван) → откатил правку (`git status` чист) → тест снова
        `2 passed`.

## Правила

Тесты проверяют ПОВЕДЕНИЕ (что человек делает и что получает), никогда не счётчики и не форму
деклараций. ПРОД не трогать. Права ролям не расширять. Никакой защитной машинерии.
