# Скопинг больших задач — 2026-06-28

Цель: быстрое решение по приоритетам при возвращении владельца.
Все оценки — read-only анализ кода без запуска. Подход и объём — авторская оценка на основе кодовой базы.

---

## #190 — Пресеты напоминаний: доктор создаёт пресет, клиент правит личный вариант

### Текущее состояние

Уже существует:
- Полная модель `reminder_rules` (schema.ts 1709–1757): `scheduleType = 'interval_window' | 'slots_v1'`, `scheduleData` (JSON), `intervalMinutes / windowStart / windowEnd / daysMask / quietHours`, `reminderIntent`, `linkedObjectType / linkedObjectId`.
- `user_reminder_rules` (schema.ts 2087–2110) — отдельная таблица-копия на integrator-стороне (те же поля). Синхронизируется через проекции.
- Два schedule-типа уже поддержаны в planning policy: `interval_window` (legacy) и `slots_v1` (время суток, список `timesLocal[]`).
- Доктор может редактировать расписание разминок клиента — panel `DoctorClientWarmupSchedulePanel`, API `PATCH /api/doctor/clients/:userId/warmup-schedule`. Это уже «прото-пресет» — доктор пишет конкретному клиенту расписание через slots_v1.
- Пресеты-константы в integrator (`REMINDER_SCHEDULE_PRESETS`: `daily / twice_daily / every_3_hours`), но они hard-coded, не редактируемые.

Чего **нет**:
- Таблицы пресетов («шаблон, который доктор сохраняет и назначает группе/клиенту»).
- UI доктора для создания, именования и массового применения пресета.
- Механизма «клиент видит пресет → правит личный вариант, доктор видит отклонения».
- Привязки пресета к категории или диагнозу пациента.

### Предлагаемый подход

1. **БД**: новая таблица `reminder_presets` (owner = specialist/global, `name`, `scheduleType`, `scheduleData` JSONB, `category`, `linkedObjectType`). Связь `reminder_rules.preset_id FK → reminder_presets.id` — опциональная (null = пользовательский).
2. **Backend**: CRUD API пресетов для доктора. При применении пресета к клиенту — создаёт/обновляет `reminder_rule` с `preset_id`; клиент может «отвязать» (очистить `preset_id`) и настроить своё.
3. **Doctor UI**: список пресетов в разделе настроек + кнопка «Применить пресет» в карточке клиента (рядом с warmup-panel).
4. **Patient UI**: если правило привязано к пресету — показывать «Базовое расписание от врача» + кнопку «Настроить своё».

### Оценка объёма

**M** — 3 фазы (~4–6 дней реализации):
- Фаза 1: БД + backend CRUD пресетов (2 дня).
- Фаза 2: Doctor UI — создание и применение (1.5 дня).
- Фаза 3: Patient UI — отображение «от врача» + переключение (1.5 дня).

### Что нужно от владельца

- **Решение по модели**: пресеты — глобальные (один для всей клиники) или per-specialist?
- **Сценарий правки клиентом**: клиент отвязывается и теряет связь с пресетом, или доктор видит «клиент изменил»?
- **Область применения**: только разминки (warmup) или все категории напоминаний (lfk, rehab_program, custom)?

### Зависимости и риски

- Зависит от: ничего критического — таблица новая, существующий warmup-panel остаётся рабочим.
- Риск: если нужны пресеты для категорий `rehab_program` / `lfk` — больше сложности с `linkedObjectId` (нужно выбирать, к какому объекту привязан пресет у конкретного клиента).

---

## #191 — Напоминания по умолчанию — время (не интервал); доктор настраивает расписание разминок в БД

### Текущее состояние

Уже существует:
- `slots_v1` schedule type — полностью реализован в integrator planning policy (`planSlotsV1DueOccurrences`), webapp scheduler и webapp reminder module. Поддерживает список `timesLocal: ["09:00", "19:00"]` + `dayFilter: weekdays | weekly_mask | every_n_days`.
- `DEFAULT_WARMUP_PWA_PUSH_ONBOARDING_SLOTS` = `{ timesLocal: ["11:00", "14:00", "17:00"], dayFilter: "weekdays" }` — в коде, не в БД.
- `DoctorClientWarmupSchedulePanel` — доктор УЖЕ может задать конкретному клиенту расписание разминок (slots_v1) через UI.
- System settings: `patient_home_daily_warmup_rotation_times` (глобальное расписание ротации разминок), `patient_home_morning_ping_local_time` (время пинга). Есть, но это не то же самое что расписание reminder_rule.
- `userReminderRules` (integrator-side) держит такие же поля но без `scheduleData` — **важный gap**: integrator-сторона не умеет работать со `slots_v1` scheduleData напрямую, mapping через webapp.

Чего **нет**:
- Глобального «дефолтного пресета по времени» — сейчас дефолт `daily` = interval 1440min / окно 9:00–9:00. Нового клиента можно было бы инициировать сразу с `slots_v1`.
- Системной настройки «дефолтные слоты напоминаний для новых клиентов» (не только warmup, но и lfk, rehab_program). Warmup-дефолт есть хардкодом.
- Возможности для доктора задать **глобальный** дефолт (для всех клиентов сразу), а не только per-patient.

### Предлагаемый подход

Три независимые части (можно делать отдельно):
1. **Сменить дефолт**: при создании нового reminder_rule использовать `slots_v1` вместо `interval_window`. Требует: добавить system_setting `reminder_default_warmup_slots_v1` (JSON) или просто изменить `DEFAULT_WARMUP_PWA_PUSH_ONBOARDING_SLOTS` в коде + константу в integrator. Простой рефакторинг.
2. **Глобальные дефолты в системных настройках**: AdminSettingsSection получает поле «Слоты по умолчанию для новых клиентов» — JSON/визуальный редактор. Достаточно system_setting ключа + чтения в `ensureWarmupsReminderOnFirstPwaPush`.
3. **Doctor UX**: `DoctorClientWarmupSchedulePanel` уже готов — но нет «применить ко всем клиентам» (bulk). Это отдельный опциональный scope.

### Оценка объёма

**S** (смена дефолта) или **M** (с admin UI для глобальных слотов) — 2–4 дня:
- Фаза 1: смена дефолта с hard-code на `slots_v1` с временами (1 день).
- Фаза 2: system_setting для глобального дефолта + admin UI (1.5 дня).
- Опционально Фаза 3: bulk «применить расписание ко всем активным клиентам» (2 дня, риски — нужна миграция правил).

### Что нужно от владельца

- **Конкретные дефолтные времена**: какое расписание по умолчанию хочет получить новый клиент? (например: 9:00 и 14:00 в рабочие дни)
- **Bulk**: нужно ли «применить новый дефолт ко всем существующим клиентам» или только к новым?
- **Scope categories**: только разминки (`warmup`) или и LFK, и rehab_program?

### Зависимости и риски

- Зависит от: #190 (пресеты) — если делать вместе, Фаза 1 обоих задач объединяется.
- Риск: миграция существующих `interval_window` правил на `slots_v1` — затрагивает existing users (нужно owner OK).

---

## #192 — Сжатие видео клиента на сервере (360/480p) + удаление оригинала

### Текущее состояние

Уже существует:
- Полный media-worker pipeline (HLS + FFmpeg): для **врачебных видео** (контент, упражнения) — 3 rendition: 720p/480p/360p HLS + постер + удаление оригинала. Реализован в `processTranscodeJob.ts`.
- Для **клиентских видео** (`usage_purpose = 'program_item_submission'`): отдельный pipeline в `processProgramSubmissionTranscode.ts` — уже транскодирует в 480p progressive MP4 + постер + **удаляет оригинал** (`DeleteObjectCommand`). **Это уже СДЕЛАНО для program submission.**
- Очередь `media_transcode_jobs`, worker polling, retry/backoff, S3 upload — всё есть.
- `programSubmissionTranscodeEnqueue.ts` — вызывается из `confirm` route при подтверждении загрузки.

Чего **нет**:
- 360p rendition для submission (есть только 480p).
- Транскода для клиентских видео **в поддержке** (support messages / чат с врачом) — там видео идут напрямую в integrator без прохождения через media-worker.
- Каких-либо других «клиентских видео» в UI, кроме program submission.

Если #192 про program submission — **основная часть (480p + удаление) уже реализована**. Осталось только:
- Добавить 360p rendition параллельно с 480p (minor change в `processProgramSubmissionTranscode.ts`).

Если #192 про **другие клиентские видео** (например видео в поддержке через Telegram) — это вне webapp, в integrator side и/или в потоке прямых Telegram uploads. Webapp не контролирует эти файлы.

### Предлагаемый подход

**Если scope = program submission**:
- Добавить 360p в `processProgramSubmissionTranscode.ts` — параллельно с 480p (50 строк кода), обновить `available_qualities_json`, добавить 360p стрим в плейлист.
- Опционально: добавить выбор качества в плеере (сейчас всегда 480p).

**Если scope = поддержка / чат**:
- Архитектурно другая задача: клиент присылает видео в Telegram → integrator получает file_id → надо скачать → поставить job в webapp queue → transcodить → хранить в S3. Значительно сложнее (новый flow).

### Оценка объёма

- **XS** если добавить только 360p к существующему program_submission pipeline (0.5 дня).
- **L** если scope = видео в поддержке/чате (новый integrator→webapp video pipeline, 4–6 дней).

### Что нужно от владельца

- **Уточнение scope**: только program submission или также видео в чате поддержки?
- **Нужен ли 360p**: 480p уже есть, оригинал уже удаляется — что конкретно не устраивает?
- Если нужно видео в чате: это требует принципиального решения (хранить ли чат-видео в S3 или оставить Telegram-hosted).

### Зависимости и риски

- Program submission — независимая задача, без рисков.
- Чат-видео — зависит от integrator side: нужен эндпойнт «получить URL Telegram file → скачать → поставить в очередь»; риски: большие файлы, Telegram file_id TTL, хранилище.

---

## #201 — Протоколы осмотра в карточке (шаблон, выбор по диагнозу/симптому)

### Текущее состояние

Уже существует:
- Модуль `patient-clinical` полностью реализован (ports, infra, UI):
  - `CreateVisitInput` включает `exam`, `manipulations`, `trialResults`, `recommendations` — свободные текстовые поля.
  - `VisitSection` (`{title, body}`) — структурированные разделы визита.
  - Справочник диагнозов (`DiagnosisCatalogSuggestion`) с autocomplete через `searchDiagnosisCatalog`.
  - Жалобы + severity, диагнозы с клиническими статусами — всё есть.
- В UI: «Новый визит» форма, история визитов.

Чего **нет**:
- Таблицы шаблонов протоколов осмотра (`protocol_templates` с `exam_template`, `manipulations_template`, etc.).
- Привязки шаблонов к диагнозу/симптому (mapping `diagnosis_catalog_id → protocol_template_id`).
- UI выбора шаблона при создании визита («Выбрать шаблон по диагнозу»).
- Механизма заполнения шаблона (variable substitution / заполнение полей).

### Предлагаемый подход

4 фазы:
1. **БД + backend**: таблица `protocol_templates` (`name`, `exam`, `manipulations`, `trial_results`, `recommendations`, `diagnosis_catalog_ids[]` FK — теги по диагнозам/симптомам). CRUD API (doctor only).
2. **Справочник шаблонов**: admin/doctor UI для создания и редактирования шаблонов (аналог редактора диагнозов).
3. **Интеграция в CreateVisit UI**: при открытии «Новый визит» — selectable dropdown «Выбрать протокол» (опционально: автопредложение по активным диагнозам пациента). Выбор заполняет поля формы.
4. **Заполнение и правка**: шаблон применяется как черновик, врач правит вручную. История визита сохраняет итоговый текст, не шаблон.

### Оценка объёма

**L** — 5–8 дней, 4 фазы:
- БД + API (2 дня).
- Admin UI для шаблонов (1.5 дня).
- Интеграция в CreateVisit форму (2 дня).
- Тесты + шлифовка (1.5 дня).

### Что нужно от владельца

- **Контент шаблонов**: кто заполняет шаблоны (доктор сам через UI или предзагружены)? Сколько примерных шаблонов нужно на старт?
- **Привязка к диагнозу**: обязательная (шаблон требует привязки к коду МКБ/справочнику) или свободная (шаблон может быть «общим»)?
- **Variable substitution**: нужны ли переменные в шаблоне типа `{{имя_пациента}}`, `{{дата}}` — или только статичный текст?
- **Приоритет vs #190**: эти задачи независимы, можно делать параллельно.

### Зависимости и риски

- Зависит от: наличия справочника диагнозов (уже есть), формы CreateVisit (уже есть).
- Риск: low — не меняет существующие данные, только добавляет новый optional flow. Риск только в UX сложности формы создания визита если шаблонов много.

---

## #206 — Ошибки/фейлы не должны ломать UI — все фейлы только в хинт

### Текущее состояние

**Обнаруженные нарушители** (по результатам grep по кодовой базе):

#### Категория A — `window.confirm()` / `window.alert()` (блокирующий браузерный диалог)
Найдено **17 мест** в production-коде:

| Файл | Контекст |
|------|---------|
| `patient/cabinet/CabinetBookingActions.tsx:95` | Отмена бронирования |
| `patient/diary/symptoms/journal/SymptomsJournalClient.tsx:165` | Удаление записи |
| `patient/diary/QuickAddPopup.tsx:97` | Дубликат записи |
| `patient/diary/symptoms/SymptomTrackingRow.tsx:117` | Дубликат записи |
| `patient/diary/lfk/journal/LfkJournalClient.tsx:166` | Удаление записи |
| `doctor/clients/AdminDangerActions.tsx:26` | Удаление записи приёма |
| `doctor/clients/DoctorClientLifecycleActions.tsx:98,125,147` | Архивация/блокировка клиента |
| `doctor/clients/DoctorClientLifecycleActions.tsx:195` | `window.alert()` — объявление admin-notice |
| `doctor/clients/AdminMergeAccountsPanel.tsx:451` | Мерж аккаунтов |
| `doctor/clients/[userId]/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx:1466` | Применение шаблона |
| `doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx:966,1101,1362` | Удаление этапа/группы/элемента |
| `doctor/appointments/DoctorAppointmentActions.tsx:89,110` | Статус приёма / удаление |
| `doctor/calendar/DoctorCalendarEventPanel.tsx:491` | Удаление из календаря |
| `doctor/content/ContentForm.tsx:244` | Несохранённые изменения |
| `components/comments/CommentBlock.tsx:146` | Удаление комментария |

#### Категория B — Blocking error Dialog (модальный диалог об ошибке)
- `doctor/references/[categoryCode]/ReferenceItemsTableClient.tsx:510–511` — ошибка через `<Dialog>`.
- `doctor/references/measure-kinds/MeasureKindsTableClient.tsx:253–257` — ошибка через `<Dialog>`.

#### Категория C — Inline `setError` (приемлемо, но нужно проверить верстку)
Многие компоненты используют `const [error, setError] = useState<string | null>(null)` и рендерят inline-текст — это в целом OK, но нужно убедиться что они не перекрывают контент или не блокируют взаимодействие:
- `AdminClientProfileEditPanel`, `DoctorClientWarmupSchedulePanel`, `DoctorSupplementaryContactsPanel`, `SpecialistTaskFormDialog`, `MaterialRatingDetailClient`, `MaterialContentStatsClient` и другие (~10 файлов).

### Предлагаемый подход

1. **Заменить `window.confirm`**: создать компонент `ConfirmDialog` (использует существующий `Dialog` из primitives) — поочерёдно мигрировать 17 мест (механически, можно через sonnet-агент).
2. **Заменить `window.alert`**: `DoctorClientLifecycleActions.tsx:195` → toast-уведомление (если toast-система есть) или inline notice.
3. **Error Dialog → inline hint**: 2 места в `references/` — заменить `<Dialog>` на inline error banner.
4. **Аудит inline `setError`**: 10 компонентов — проверить что рендер не блокирует (low priority, вероятно уже OK).

### Оценка объёма

**M** — 3–4 дня:
- Фаза 1: создать переиспользуемый `ConfirmDialog` (0.5 дня).
- Фаза 2: механически мигрировать 17 `window.confirm` (1.5–2 дня, sonnet-агент).
- Фаза 3: 2 blocking error dialogs + `window.alert` (0.5 дня).
- Фаза 4: аудит и шлифовка inline errors (1 день).

### Что нужно от владельца

- **Toast-система**: есть ли в проекте toast/snackbar (не нашлось в grep)? Если нет — нужно решить: добавить библиотеку (sonner/react-hot-toast) или делать inline hints.
- **Приоритет**: все 17 мест или только user-facing (patient app) первыми?
- **UX для «несохранённые изменения»**: `ContentForm.tsx:244` — browser confirm перед уходом. Альтернатива: use `beforeunload` + кастомный баннер. Решение по UX?

### Зависимости и риски

- Независима от других задач.
- Риск: `window.confirm` синхронный — заменить на async dialog меняет flow (нужно `await`). Требует внимания при мигарции.

---

## #90 — Рассылки: отложенная отправка по датам + фикс-темы + подписки клиента + форс критичного

### Текущее состояние

Уже существует:
- Полная система рассылок: `BroadcastForm`, 5 каналов (Telegram/MAX/Push/SMS/Email), категории, черновик, markdown, картинка, аудитория, журнал.
- `broadcast_audit` таблица — без `scheduled_at`.
- `mailings` + `mailing_topics` + `user_subscriptions` + `mailingTopicsWebapp` + `userSubscriptionsWebapp` — в БД есть `scheduled_at` в `mailings` (legacy таблица), но **broadcast_audit** его не использует.
- Топики уведомлений: `user_notification_topics` + `user_notification_topic_channels` — клиент управляет per-topic через `/patient/notifications` (PatientNotificationsTopicMatrix).
- Web-push broadcast уже учитывает `topicCode` (через `broadcastNotificationTopicCode(category)`).
- `fanOutBroadcastWebPush` + `resolveBroadcastWebPushEligibleUserIds` — фильтрует по topicChannelPrefs.

Чего **нет**:
1. **Отложенная отправка** (`send_at` / `scheduled_at`): `BroadcastCommand` не имеет поля даты отправки. `executeBroadcastAction` шлёт немедленно. В `broadcast_audit` нет `scheduled_at`. Нет UI "Отправить в..." / datetimepicker.
2. **Фикс-темы**: сейчас `category` (organizational/service/important_notice/...) — но нет возможности задать «фиксированную тему» как отдельный независимый топик для клиентских подписок. Вопрос: что имеется в виду? Фиксированное subject для email? Или «тема» как subscription topic?
3. **Подписки клиента**: topicChannelPrefs уже есть (матрица per topic × channel), но не все broadcast категории отображаются как выбираемые топики на стороне пациента (пациент управляет web-push отдельно от broadcast). Связь `broadcast_category → notificationTopicCode` есть в `broadcastNotificationTopicCode()` но не полная: не все категории маппятся на known topics.
4. **Форс критичного**: нет bypass «отправить всем независимо от preferences» (кроме SMS который уже использует `sms_only` force-mode).

### Предлагаемый подход

4 независимых подзадачи (можно делать отдельно):

**A. Отложенная отправка** (M, 3–4 дня):
- Добавить `scheduled_at` в `broadcast_audit`.
- Изменить `BroadcastCommand` → добавить `scheduledAt?: string`.
- Добавить UI элемент (дата+время выбора) в `BroadcastForm`.
- Добавить background job/cron: `SELECT * FROM broadcast_audit WHERE scheduled_at <= NOW() AND sent = false` → dispatch.
- Добавить в журнал статус «Запланировано» / отмена.

**B. Подписки клиента** (S–M, 1–2 дня):
- Достроить маппинг `BroadcastCategory → notificationTopicCode` для всех категорий.
- Добавить broadcast-категории как выбираемые топики в PatientNotificationsTopicsSection.
- Нужен registry топиков в system_settings (или статичный).

**C. Форс критичного** (S, 1 день):
- Добавить флаг `forceDelivery?: boolean` в `BroadcastCommand`.
- При `force=true` — bypass topic prefs (как SMS уже делает через `sms_only`).
- UI: чекбокс «Отправить всем, даже отписавшимся» + предупреждение.

**D. Фикс-темы** (требует уточнения scope):
- Если это email subject: добавить `emailSubject` поле в форму и команду (S, 1 день).
- Если это subscription topic binding: нужно owner-уточнение.

**Блокер CI (#207)**: `BroadcastForm.test.tsx` уже сломан на текущей ветке `feat/doctor-ui-rebuild`. Надо починить до начала добавления новой функциональности.

### Оценка объёма

**L** (все 4 подзадачи) — 7–10 дней, или **M** по частям (подзадачи A и C — 4–5 дней).

### Что нужно от владельца

- **Приоритет подзадач**: что важнее — отложенная отправка, форс критичного или подписки?
- **Фикс-темы**: уточнить что означает — subject email или нечто другое?
- **Job storage для отложенных**: использовать `broadcast_audit` с новым статусом, или отдельную очередь `broadcast_scheduled`?
- **Кто может форсировать**: только owner-admin или любой specialist?
- **Починить BroadcastForm.test.tsx** (#207): или снять с CI? Это блокер для тестирования функциональности рассылок.

### Зависимости и риски

- Зависит от: #207 (починить тест) — без него CI будет красным на feat ветке.
- Риск: отложенная отправка требует reliable background job execution (cron/outbox pattern). В проекте уже есть `integrator_push_outbox` (polling outbox) — можно использовать тот же паттерн для webapp broadcast.

---

## Сводная таблица оценок

| # | Задача | Объём | Фаз | Статус пред. | Что нужно от владельца |
|---|--------|-------|-----|--------------|------------------------|
| **#190** | Пресеты напоминаний (доктор → клиент) | **M** | 3 | Нет пресетов, есть per-client warmup | Scope (глобальные/per-specialist?), поведение при правке клиентом |
| **#191** | Напоминания по времени суток; доктор настр. расписание | **S–M** | 2–3 | slots_v1 есть, warmup-panel есть; нет глобал. дефолта | Конкретные дефолтные времена, нужен ли bulk на существующих |
| **#192** | Сжатие видео клиента 360/480p + удаление ориг. | **XS–L** | 1–3 | 480p + удаление УЖЕ сделано для program_submission | Уточнить scope: только submission (уже почти готово) или также чат? |
| **#201** | Протоколы осмотра: шаблоны по диагнозу/симптому | **L** | 4 | Visit есть, полей нет, справочник диагнозов есть | Контент шаблонов, привязка к диагнозу, variable substitution? |
| **#206** | Все фейлы — только в хинт (не блокирующие алерты) | **M** | 4 | 17 window.confirm, 2 error dialogs, 1 alert | Есть ли toast? Patient-first или всё сразу? UX «несохр. изменения»? |
| **#90** | Рассылки: отложенная + подписки + форс критичного | **L** (все) / **M** (частично) | 4 | Нет scheduling, нет force; subscriptions частично | Приоритет из 4 подзадач, смысл «фикс-темы», починить BroadcastForm.test (#207) |

---

*Анализ проведён 2026-06-28. Read-only: код, схема, UI. Без запуска приложения, без изменений.*
