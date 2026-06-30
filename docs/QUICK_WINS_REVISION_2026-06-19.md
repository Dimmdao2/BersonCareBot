# Ревизия quick-wins владельца — сверка с кодом (2026-06-19)

> Въедливая сверка списка `QUICK_WINS_USER_2026-06-17.md` с **реальным кодом** ветки `feat/doctor-ui-rebuild`
> (worktree-снимок `1622b450`). Статусы из списка от 17 июня НЕ учитывались — каждый пункт проверен по коду.
> Вердикты: ✅ готово · ◑ частично · ❌ не сделано · 🐞 баг. Файлы:строки — доказательства.
> Выжимка доработок отдана лупу через `docs/_INBOX/quick-wins-user.md`.

## Сводка
| # | Пункт | Вердикт |
|---|-------|---------|
| 1 | Отметка выполнения inline на странице (поля повт/подх/вес) | ◑ |
| 2 | Из плитки убрать кнопки, клик → страница | ◑ |
| 3 | В плитке — ряд иконок (комменты/новые/противопок./точки) | ❌ |
| 4 | Зелёные точки за день (мульти) | ✅ |
| 5 | Комментарии врача на странице (не в модалке) | ◑ |
| 6 | «Добавить запись в календарь» (Google/Yandex/.ics/почта) | ❌ |
| 7 | Push-кнопки «позже»/«пропустить» | ❌ |
| 8 | «Не напоминать в боте» не отключает напоминания | 🐞 |
| 9 | Напоминания по времени + редактор расписания разминок | ◑ |
| 10 | Большое видео → рендер 360/480 + удаление оригинала | ◑ |
| 11 | Доктор: индивидуальное упражнение + видео с пациентом | ◑ (≈❌) |
| 12 | Все фейлы — только в хинт, не ломать UI | ◑ |

**Готово полностью: только #4.** Остальное — на доработку.

---

## A. Упражнение / программа

### 1 — Отметка выполнения inline (◑)
- Кнопка «Отметить выполнение» на странице есть (`PatientProgramStageItemPageClient.tsx:815-838`), но **поля повторов/веса/сложности живут в модалке** `ProgramItemCompleteDialog.tsx:47-127` (`Dialog`), не в постоянном inline-блоке.
- Прошлые значения НЕ преднаполняются: инпуты `repsRaw`/`weightRaw` инициализируются пустыми (`ProgramItemCompleteDialog.tsx:44-45`); «в прошлый раз…» есть только текстом (`PatientProgramItemExecutionRow.tsx:84-88`, `programItemExecutionDisplay.ts:50-65`).
- Цель врача (reps×sets / «Инструкция от специалиста») в шапке страницы (`...PageClient.tsx:666-674, 866-878`), а **не над полями ввода** (в модалку цель не передаётся).
- **Доделать:** перенести поля (повт · подх · вес + сложность) из модалки в inline-блок страницы; цель врача — над полями; преднаполнять прошлыми значениями (`lastDoneSummary.reps/weightKg`); завершение без модалки.

### 2 — Плитка: убрать кнопки, клик → страница (◑)
- Клик по карточке уже ведёт на страницу: `PatientInstanceStageItemCard.tsx:186-190` (`router.push`). «Отправить видео» из плитки уже убрано ✅.
- **Но осталась inline-кнопка «Отметить выполненным»**: `PatientInstanceStageItemCard.tsx:344-382` (POST `progress/complete` прямо из плитки).
- `PatientStageCompositionList.tsx` — read-only модалка состава, кнопок не содержит.
- **Доделать:** удалить кнопку «Отметить выполненным» из карточки (`:344-382`).

### 3 — Ряд иконок в плитке (❌)
- Карточка НЕ использует `PatientProgramItemExecutionRow`, зелёных точек нет; вместо них текст «Отметок в журнале за сегодня: N» (`PatientInstanceStageItemCard.tsx:290-298`).
- Индикатора комментариев/новых комментариев в карточке нет (discussion грузится только на странице, `...PageClient.tsx:455-496`). Иконки противопоказаний в карточке нет (только на странице, `ModalDescriptionSection`). Статус — текстом (`:280-289`).
- **Доделать:** заменить текстовые строки на ряд иконок снизу плитки: комментарии · новые · противопоказания · зелёные точки (`PatientProgramItemExecutionRow` variant=tile). Прокинуть в карточку: unread/total комментариев, наличие противопоказаний (`snapshot.contraindications`), `lastDoneAtIso`/`todayCount`.

### 4 — Зелёные точки за день (✅ готово)
- `resolveProgramItemExecutionDots` (`programItemExecutionDisplay.ts:11-29`) корректна: последняя отметка сегодня → `dotCount=capped(todayCount)` зелёных, overflow >24 → «+N».
- `todayCount` = `countDoneByItemInWindow` (`pgProgramActionLog.ts:82-105`) — `count()` всех `done` за день без дедупа → N выполнений = N точек. На странице (`...PageClient.tsx:859`) и в составе этапа (`PatientStageCompositionList.tsx:147-189`) рисуется верно.
- Баг из списка по текущему коду **не воспроизводится**. (Точек нет в самой плитке — но это зона пункта 3, не 4.)

### 5 — Комментарии на странице (◑)
- На странице есть превью+счётчик новых (`...PageClient.tsx:880-914`), но **чтение/добавление — в модалке** `ProgramItemDiscussionDialog.tsx:169-283` (открывается `setDiscussionDialogOpen`).
- **Доделать:** встроить ленту комментариев + composer инлайном в страницу (сейчас в модалке). Если владельца устраивает превью+модалка — закрыть как ✅, но «не в модалке» сейчас не выполнено.

## B. Напоминания

### 8 (список B5) — «Не напоминать в боте» не отключает напоминания (🐞 подтверждён)
- «Не напоминать в боте» корректно пишет prefs (`disableReminderMessengerTopic.ts:105`) и учитывается в `resolveNotificationChannels.ts:125-128`.
- **Баг в integrator** `apps/integrator/src/kernel/domain/executor/handlers/reminders.ts:535-544`: фильтр каналов применяется только если `hasResolvedTopicBindings` (есть telegram/max id). Когда мессенджер выключен, bindings пустой → guard `false` → **фильтр не применяется**, `sendChannels` остаётся с исходными каналами → сообщение в бот всё равно уходит (скип лишь логируется, `:551`). Частичный случай (выключен один из двух мессенджеров) работает.
- **Доделать:** применять `resolution.selectedChannels` всегда, когда резолюция получена (а не по непустоте bindings); пустой selected для мессенджеров → `sendChannels=[]`. Тест: «все мессенджер-каналы темы выключены → 0 enqueue в telegram/max».

### 6 (список B6) — Push-кнопки «позже»/«пропустить» (❌)
- `apps/webapp/public/sw.js`: `showNotification` (`:52-57`) без `actions`; `notificationclick` (`:90-122`) не читает `event.action`. Payload (`sendWebPushToSubscriptions.ts`, `createTrackedWebPushPayload.ts`) без `actions` и без `occurrenceId`. Снуз/скип есть только для бот-инлайн-кнопок (`reminderInlineKeyboard.ts`).
- **Доделать:** `actions:[snooze,skip]` в payload+`showNotification`; обработка `event.action` в `notificationclick` (вызов API отложить/пропустить); прокинуть `occurrenceId` в `notificationData`.

### 9 (список B7) — Время вместо интервала + редактор разминок (◑)
- Модель времени есть: `scheduleSlots.ts` (`slots_v1`, `timesLocal`), планировщик `planDueReminderOccurrences.ts:200-230` (slots) рядом с legacy interval (`:242-265`). Дефолт реабилитации — `DEFAULT_REHAB_DAILY_SLOTS`; авто-разминки `ensureWarmupsReminderOnFirstPwaPush.ts:60-72` (slots_v1). Ротация разминок ✅.
- **Но:** дефолт UI создания — `interval_window` (`ReminderCreateDialog.tsx:117`, `reminderFormDefaults.ts`), не время. **Нет доктор-редактора расписания разминок** (поиск по `app/app/doctor/**` — только аналитика/broadcasts).
- **Доделать:** дефолт создания → time-based (slots_v1); доктор-интерфейс расписания разминок с сохранением в `reminder_rules.schedule_data`.

## C. Запись

### 6 (список C8) — Добавить запись в календарь (❌)
- Поиск `VCALENDAR|VEVENT|text/calendar|\.ics|webcal|addToCalendar|calendar.google|calendar.yandex` по `apps/` — **0 совпадений** (только в архивных docs). Функционала нет.
- **Доделать:** генератор `.ics` (VCALENDAR/VEVENT) + route `text/calendar`; кнопки Google/Yandex (`calendar.google.com/calendar/render`)/скачать `.ics`; вариант «на почту» через существующий SMTP-relay.

## D. Медиа

### 10 (список D9) — Большое видео → рендер 360/480 + удалить оригинал (◑)
- Транскод-пайплайн рабочий (`apps/media-worker/src/processTranscodeJob.ts`, `ffmpeg/hlsArgs.ts`): HLS 720p+480p, постер.
- Пациентский путь замкнут: presign → confirm (`program-submission/confirm/route.ts:114-119`) → `programSubmissionTranscodeEnqueue.ts` → `processProgramSubmissionTranscode.ts`; рендер **480p** (`:71`) + удаление оригинала (`:123-134`). Лимит 250 MiB single-PUT (`programSubmissionUploadLimits.ts:15`).
- **Разрывы:** (1) **360p нет нигде** (grep `360` пуст); (2) общий HLS-путь оригинал **не удаляет** (`processTranscodeJob.ts:223` — явный комментарий «source never deleted») — касается библиотечных/докторских видео через multipart; (3) multipart («по-настоящему большое») доступен только докторам (`media/multipart/complete/route.ts:55` — `canAccessDoctor`), пациент ограничен 250 MiB.
- **Доделать:** добавить 360p-рендицию, если «360/480» обязательно; решить удаление оригинала на общем HLS-пути.

### 11 (список flat-8) — Индивидуальное упражнение врача + видео с пациентом (◑, по букве ≈❌)
- Доктор создаёт упражнение и грузит видео, но **в глобальный каталог** (`modules/lfk-exercises/service.ts:30`, `app/app/doctor/exercises/actionsShared.ts:236`).
- Понятия «индивидуальное упражнение для пациента» в схеме нет: `lfk_exercises` (`schema.ts:858-885`) только `created_by`, без `patient_user_id`. «Индивидуальность» назначения = только текстовый override (`DoctorLfkComplexExerciseOverridesPanel.tsx:36`) — своё видео для пациента приложить нельзя. Добавление item в программу — только из библиотеки (`InstanceAddLibraryItemDialog.tsx`).
- Это **отдельная фича** `docs/_INBOX/patient-files-library-isolation.md` (системная папка «Пациенты» + изоляция). Ревизия подтверждает: пока не реализовано, ждёт той инициативы.

## E. Надёжность

### 12 (список E10) — Все фейлы только в хинт (◑)
- Сделано хорошо: единый `react-hot-toast` (`ClientToaster.tsx`), error-boundaries на всех уровнях (`app/error.tsx`, `app/app/.../error.tsx`, `global-error.tsx` ловит ChunkLoadError/stale-action), фоллбэк `SegmentRouteError.tsx:75-114` — нормальный экран, не белый. Эталон обработки — booking-хуки (`cabinet/useCreateBooking.ts:31-92`, `useRescheduleBooking.ts:45-70`): try/catch → setError. Намеренные `throw` в booking-engine ловятся в `useCatalogAction → onError`.
- **Не сквозной паттерн:** ~37 клиентских компонентов делают `await fetch`+`await res.json()` **без try/catch** — обрабатывают только `!res.ok` (бизнес-ошибку), но сетевой сбой/502 без JSON/невалидный JSON → unhandled rejection в `startTransition` → всплывает в error-boundary (экран раздела) вместо toast/inline. UI не белеет, но раздел подменяется экраном ошибки — нарушение «только в хинт».
- **Проблемные места (fetch без сетевого catch):** `settings/BookingWorkingHoursSection.tsx:80-160`, `settings/BookingManualLifecycleSection.tsx:65-84`, `patient/booking/pay/PatientBookingPayClient.tsx:19-56`, `patient/cabinet/CabinetBookingActions.tsx:58-69`, весь `app/app/settings/*` booking-engine (BookingFormFields/Policies/Prepayment/CatalogPackages/Products/ScheduleBlocks/StaffPayment/AppointmentReminder/EventNotifications), doctor-панели (`DoctorNotesPanel`, `AdminDangerActions`, `DoctorClientLifecycleActions`, `SubscriberBlockPanel`, `DoctorSupplementaryContactsPanel`, `AppointmentStaffCommentsSection`, `DoctorGlobalTasksSection`, `treatment-program-templates/new/NewTemplateForm`), публичные платёжные (`app/book/pay/PublicBookingPayClient`, `book/product/[token]/pay/PublicProductPayClient`, `PublicProductPurchaseClient`).
- **Доделать:** обернуть `fetch`/`res.json()` в try/catch (как в booking-хуках), направив сетевую/parse-ошибку в тот же `setError`/`toast.error`. Чистый путь — общий хелпер (по образцу `settings/bookingSoloAdminApi.ts:apiJson`) и прогнать через него `settings/*` + платёжные.
