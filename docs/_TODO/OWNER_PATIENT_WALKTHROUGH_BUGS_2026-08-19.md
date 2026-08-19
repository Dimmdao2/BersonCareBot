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

- [ ] Замерить подтверждение записи на живом TEST от нажатия до ответа. Назвать число и команду.
- [ ] Если осталось больше секунды — найти, на что уходит, и убрать.

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
