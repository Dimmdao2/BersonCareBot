# BersonCare — Анализ плана развития

> Дата анализа: 2026-03-22
> Источник: `RAW_PLAN.md`
> Контекст: текущая кодовая база (integrator + webapp), аудит хоста от 2026-03-19

---

## Содержание

1. [Блоки задач](#1-блоки-задач)
2. [Приоритеты по важности в моменте](#2-приоритеты-по-важности-в-моменте)
3. [Группировка по сложности](#3-группировка-по-сложности)
4. [Оценка объёма работ](#4-оценка-объёма-работ)
5. [Необходимые бэкенд-механизмы](#5-необходимые-бэкенд-механизмы)
6. [Рекомендуемые библиотеки](#6-рекомендуемые-библиотеки)
7. [Пропуски и недоописанные моменты](#7-пропуски-и-недоописанные-моменты)
8. [Противоречия в плане](#8-противоречия-в-плане)
9. [Архитектурные рекомендации (AI-friendly, PWA, ReactNative)](#9-архитектурные-рекомендации)
10. [Опасные места и риски](#10-опасные-места-и-риски)

---

## 1. Блоки задач

Весь план разбивается на 14 функциональных блоков:

| # | Блок | Пункты плана | Основная зона |
|---|------|-------------|---------------|
| 1 | **Критическая инфраструктура** | Перенос на российский сервер, бэкапы | DevOps / Infra |
| 2 | **Исправление багов и UX** | Баги привязки Max, кнопка «изменить», «задать вопрос», поиск в списке клиентов, фильтры | Webapp (frontend + backend) |
| 3 | **Авторизация и безопасность** | Пароль, сброс, длительная сессия, rate-limit OTP, email-верификация | Webapp + Integrator |
| 4 | **Дизайн-система и верстка** | Шапка, кнопки, отступы, шрифты, меню, адаптивность, пресеты | Webapp (CSS/компоненты) |
| 5 | **Клиентское приложение (Patient webapp)** | Главная, профиль, записи, уведомления, боковое меню, реферальная система | Webapp (patient) |
| 6 | **Кабинет врача (Doctor webapp)** | Дашборд, клиенты, подписчики, карточка пациента, статистика, настройки, админ-режим | Webapp (doctor) |
| 7 | **Модуль дневников** | Симптомы, расширенная модель (тип, регион, диагноз, стадия), статистика-графики, быстрое добавление | Webapp + Backend |
| 8 | **Модуль сообщений** | Переписка клиент↔врач, чат-UI, хранение, копирование из мессенджеров, файлы | Webapp + Integrator |
| 9 | **Модуль ЛФК** | Справочник упражнений, конструктор комплексов, назначение пациенту, журнал, статистика | Webapp + Backend |
| 10 | **CMS и контент** | WYSIWYG, медиа-файлы, разделы, уроки, новости, мотивашки, анонсы | Webapp (doctor) |
| 11 | **Напоминания (Reminders)** | Бот заботы, каналы, расписание, пуш-уведомления | Webapp + Integrator |
| 12 | **Интеграции** | Google Calendar, email (mailer), привязка мессенджеров через deep-link, Rubitime API (отмена/перенос), ВК | Integrator |
| 13 | **PWA и мобильные приложения** | Service Worker, manifest, offline, Cordova/RN, push notifications | Webapp (infra) |
| 14 | **Мультитенантность и платежи** | Tenant=врач, каталог специалистов, оплата, подписки, бонусы по реферальной программе | Вся платформа |

---

## 2. Приоритеты по важности в моменте

### 🔴 P0 — Первоочередные (критические баги + стабилизация)

| Задача | Блок | Почему первоочередное |
|--------|------|----------------------|
| Баг: привязка Max не работает | Bugfix | Пользователь не может подключить канал |
| Баг: кнопка «изменить» телефон перезагружает страницу | Bugfix | Базовый профиль сломан |
| Баг: кнопка «задать вопрос» — неверная логика видимости | Bugfix | Пользователь теряет возможность связи |
| Баг: поиск клиентов сбрасывает клавиатуру | Bugfix | Кабинет врача неработоспособен на мобильном |
| Баг: фильтры в списке клиентов глючат | Bugfix | Кабинет врача неработоспособен |
| Баг: авторизация доктора слетает | Bugfix | Врач теряет доступ |
| Баг: CMS — страницы не сохраняются | Bugfix | Врач не может управлять контентом |
| Баг: статистика — неверный подсчёт отмен | Bugfix | Данные в статистике некорректны |
| Дизайн: симптомы — кнопки не круглые, не подсвечиваются | Bugfix/UX | Дневник невозможно нормально использовать |

### 🟠 P1 — Верстка, дизайн, доработка существующего

| Задача | Блок |
|--------|------|
| Дизайн-система: пресеты кнопок (обычная, инверсия, синяя, красная) | Дизайн |
| Шапка: уменьшить, перенести заголовок, иконки сообщений, колокольчик | Дизайн |
| Отступы, шрифты заголовков, скругления — единообразие | Дизайн |
| Боковое меню: равные отступы, новые пункты | Дизайн |
| Шапка доктора: создать фиксированную шапку как у клиента | Дизайн |
| Правое меню доктора по механизму клиентского | Дизайн |
| Кнопки на страницах доктора: единообразие, убрать дублирование | Дизайн |
| Профиль: однотипные поля ФИО/телефон/email с кнопками «изменить» | Patient |
| Экран «Мои записи»: убрать мусорные заголовки, статусы, виджет Rubitime | Patient |
| Дневник: объединить в один пункт, вкладки «Симптомы»/«ЛФК» | Patient |
| Дневник симптомов: порядок блоков, попап «запись добавлена» | Patient |
| Главная страница клиента: структура блоков по плану | Patient |
| Дашборд доктора: плитка со статистикой | Doctor |

### 🟡 P2 — Новый функционал (ядро приложения)

| Задача | Блок |
|--------|------|
| Авторизация по паролю | Auth |
| Email-привязка и верификация | Auth + Integrator |
| Расширенная модель симптомов (тип, регион, диагноз, стадия, справочники) | Дневники |
| Графики статистики симптомов | Дневники |
| Расширенная модель ЛФК (длительность, сложность, боль, комментарий) | ЛФК |
| Справочник упражнений | ЛФК |
| Конструктор комплексов | ЛФК |
| Чат клиент↔врач (полноценный UI) | Сообщения |
| Привязка мессенджеров через deep-link секрет | Integrator |
| CMS: WYSIWYG, медиа, управление разделами | CMS |
| Напоминалки: UI настройки, интеграция с каналами | Reminders |
| OTP rate-limit (таймер, блокировка после 3 попыток) | Auth |

### 🟢 P3 — Расширения (будущие фичи)

| Задача | Блок |
|--------|------|
| Перенос на российский сервер | Infra |
| Бэкапы на несколько серверов | Infra |
| PWA (Service Worker, manifest, offline cache) | PWA |
| Push-уведомления | PWA + Integrator |
| Реферальная система | Patient |
| «Поделиться с другом» | Patient |
| Google Calendar интеграция | Integrator |
| Карта пациента (анамнез, осмотр, диагноз) | Doctor |
| Управление записями из приложения (перенос/отмена → Rubitime) | Doctor + Integrator |
| Перенос сценариев в БД + визуальный редактор | Integrator + Admin |
| Адаптивная десктопная верстка | Дизайн |
| Email-рассылки | Integrator |
| Модуль оплаты | Payments |
| Мультитенантность | Архитектура |
| Авто-сбор отзывов | Integrator |
| Дневники здоровья/психологии | Дневники |
| Cordova / React Native | Mobile |

---

## 3. Группировка по сложности

### Простые (1–3 файла, минимальный backend)

- Исправление визуальных багов (кнопки симптомов, круглые, цвета)
- Исправление отступов, шрифтов, скругления
- Убрать мусорные заголовки из «Мои записи»
- Добавить пункты в боковое меню
- Шапка: уменьшить, перенести заголовок
- Попап «запись добавлена»
- Пресеты кнопок в CSS
- Исправить порядок блоков на странице дневника
- Убрать иконки мессенджеров в профиле

### Средние (3–10 файлов, модульные изменения)

- Исправить баг привязки Max (отладка webhook flow)
- Исправить поиск клиентов (debounce / client-side filter)
- Исправить фильтры списка клиентов
- Исправить логику видимости «задать вопрос»
- Профиль: единообразные поля с inline-edit
- Шапка доктора (новый компонент)
- Правое меню доктора
- Дашборд доктора с плиткой
- Экран «Мои записи» с виджетом Rubitime
- Главная страница клиента (реструктуризация блоков)
- Настройки уведомлений: SMS/email каналы
- Дневник: вкладки симптомы/ЛФК
- OTP rate-limit и таймер
- Расширенные поля ЛФК-сессии

### Сложные (10+ файлов, новые модули, миграции БД)

- Авторизация по паролю (хэширование, сброс, UI, backend)
- Email-верификация (mailer в integrator, challenge flow)
- Расширенная модель симптомов (справочники, миграция, API, UI)
- Графики статистики (библиотека, API, агрегация данных)
- Чат клиент↔врач (WebSocket или polling, UI, backend, хранение)
- Справочник упражнений (новый модуль, CRUD, медиа)
- Конструктор комплексов (drag-and-drop, сложный UI)
- CMS с WYSIWYG (редактор, медиа-загрузка, хранение файлов)
- Привязка мессенджеров через deep-link (integrator + webapp)
- Карта пациента (новый домен, много таблиц)
- Назначение комплексов ЛФК пациенту (связь doctor↔patient)

### Архитектурно сложные (cross-cutting, длительные)

- Перенос на российский сервер
- Бэкапы на несколько серверов
- PWA (service worker, caching strategy, manifest)
- Push-уведомления (web push, FCM, интеграция с каналами)
- Google Calendar API интеграция
- Перенос сценариев из JSON в БД
- Мультитенантность
- Модуль оплаты

---

## 4. Оценка объёма работ

| Блок | Задач | Backend-миграций | Новых компонентов | Оценка сложности |
|------|-------|------------------|-------------------|-----------------|
| Критическая инфраструктура | 2 | 0 | 0 | Высокая (DevOps) |
| Исправление багов | 9 | 0–1 | 0–2 | Низкая–Средняя |
| Авторизация и безопасность | 5 | 2–3 | 4–6 | Высокая |
| Дизайн-система | 12 | 0 | 5–8 | Средняя |
| Patient webapp | 10 | 1–2 | 8–12 | Средняя–Высокая |
| Doctor webapp | 10 | 2–3 | 10–15 | Высокая |
| Дневники | 8 | 3–5 | 6–10 | Высокая |
| Сообщения | 5 | 2–3 | 4–6 | Высокая |
| ЛФК | 8 | 5–7 | 12–18 | Очень высокая |
| CMS | 5 | 2–3 | 5–8 | Средняя–Высокая |
| Напоминания | 3 | 1–2 | 3–5 | Средняя |
| Интеграции | 6 | 2–3 | 2–4 | Высокая |
| PWA/Mobile | 3 | 0 | 2–4 | Средняя |
| Мультитенант/Платежи | 5 | 5–10 | 10–15 | Очень высокая |

**Итого:** ~90 задач, ~25–45 миграций БД, ~70–110 новых компонентов.

---

## 5. Необходимые бэкенд-механизмы

### 5.1 Новые таблицы и модули (webapp DB)

```
-- Справочники (общие)
reference_categories     -- типы справочников
reference_items          -- значения справочников (регион, тип симптома, диагноз, стадия, тип нагрузки)

-- Расширение дневника симптомов
ALTER symptom_trackings ADD: symptom_type_ref_id, region_ref_id, side (left/right/both/null),
                            diagnosis_text, diagnosis_ref_id, stage_ref_id

-- Расширение ЛФК
ALTER lfk_sessions ADD: duration_minutes, difficulty_0_10, pain_0_10, comment,
                       recorded_at (вместо completed_at)
ALTER lfk_complexes ADD: symptom_tracking_id, region_ref_id, side, diagnosis_text,
                        diagnosis_ref_id, origin='assigned_by_specialist'|'manual'|'purchased'

-- Справочник упражнений
exercises                -- id, name, description, instructions, contraindications,
                        -- load_type_ref_id, region_ref_ids (jsonb), tags (jsonb)
exercise_media           -- id, exercise_id, type (video/photo), url, sort_order

-- Комплексы (шаблоны врача)
lfk_complex_templates    -- id, doctor_id, name, description, region_ref_id,
                        -- diagnosis_ref_ids (jsonb), stage_ref_id, difficulty_1_10,
                        -- purpose_ref_id, status (draft/published/archived),
                        -- schedule_json, recommendations
lfk_complex_template_exercises  -- id, template_id, exercise_id, sort_order,
                               -- reps, sets, left_reps, left_sets, right_reps, right_sets,
                               -- max_pain_0_10, comment

-- Назначение комплекса пациенту
patient_lfk_assignments  -- id, patient_user_id, template_id (nullable), complex_id,
                        -- stage_ref_id, rehab_step, schedule_json_override,
                        -- recommendations_override, assigned_by, assigned_at

-- Авторизация
user_passwords           -- user_id, password_hash, created_at, updated_at
password_reset_tokens    -- id, user_id, token_hash, expires_at, used_at

-- Email
ALTER platform_users ADD: email_verified_at
email_challenges         -- id, user_id, email, code_hash, expires_at, attempts, created_at

-- Реферальная система
referral_codes           -- user_id, code (unique), created_at
referral_visits          -- id, referral_code, visitor_fingerprint, visited_at
referral_conversions     -- id, referral_code, converted_user_id, converted_at, bonus_credited

-- Сообщения (webapp-native)
chat_messages            -- id, conversation_id, sender_user_id, sender_role,
                        -- text, media_url, media_type, channel_source,
                        -- external_message_id, read_at, delivered_at, created_at

-- Новости и мотивашки
news_items               -- id, title, body, importance (normal/important), is_visible,
                        -- created_by, views_count, created_at
motivational_quotes      -- id, text, is_active, created_at

-- Настройки системы
system_settings          -- key, value_json, scope (global/doctor/admin), updated_at, updated_by

-- Карта пациента (будущее)
patient_cards            -- id, user_id, date_of_birth, weight, height, bmi,
                        -- medical_history_json, created_at
patient_visits           -- id, patient_card_id, visit_type (initial/follow_up),
                        -- complaints, examination, diagnosis, recommendations,
                        -- appointment_record_id, visited_at
```

### 5.2 Новые API-эндпоинты (webapp)

```
-- Auth
POST   /api/auth/password/set
POST   /api/auth/password/login
POST   /api/auth/password/reset-request
POST   /api/auth/password/reset-confirm
POST   /api/auth/email/start
POST   /api/auth/email/confirm

-- References
GET    /api/references/:category         -- справочник по категории
POST   /api/doctor/references/:category  -- добавить значение (doctor)

-- Diary extensions
GET    /api/patient/diary/symptom-stats   -- агрегация для графиков
PATCH  /api/patient/diary/symptom-tracking/:id  -- редактирование симптома
DELETE /api/patient/diary/symptom-tracking/:id  -- soft-delete

-- LFK extensions
POST   /api/patient/diary/lfk-session    -- расширенные поля
GET    /api/patient/diary/lfk-stats      -- статистика ЛФК

-- Exercises (doctor)
GET    /api/doctor/exercises
POST   /api/doctor/exercises
PATCH  /api/doctor/exercises/:id
DELETE /api/doctor/exercises/:id

-- Complex templates (doctor)
GET    /api/doctor/lfk-templates
POST   /api/doctor/lfk-templates
PATCH  /api/doctor/lfk-templates/:id
POST   /api/doctor/lfk-templates/:id/publish
POST   /api/doctor/lfk-templates/:id/archive

-- Assignments (doctor → patient)
POST   /api/doctor/patients/:userId/assign-lfk
GET    /api/doctor/patients/:userId/lfk-assignments
GET    /api/patient/lfk-assignments

-- Messaging
GET    /api/messages/conversations
GET    /api/messages/conversations/:id
POST   /api/messages/conversations/:id/send
PATCH  /api/messages/conversations/:id/read

-- News / Motivational
GET    /api/patient/news
POST   /api/patient/news/:id/viewed
GET    /api/patient/motivational-quote

-- Doctor settings / admin
GET    /api/doctor/settings
PATCH  /api/doctor/settings
POST   /api/admin/settings

-- Referral
GET    /api/patient/referral-code
GET    /api/patient/referral-stats

-- System settings
GET    /api/settings/public    -- client-facing flags
```

### 5.3 Новые механизмы в интеграторе

1. **Email delivery adapter** — nodemailer (уже в зависимостях) → SMTP/API провайдер.
2. **Deep-link привязка** — генерация одноразового `link_secret`, сценарий `message.received` с match `/start link_*`, автоматическая привязка identity.
3. **Google Calendar connector** — OAuth2 → Calendar API v3 → CRUD событий при webhook из Rubitime.
4. **Webhook к Rubitime** (обратный) — отправка запросов на перенос/отмену записи.
5. **Push notification adapter** — Web Push (VAPID) через integrator → webapp SW.
6. **Сценарии в БД** — таблица `script_definitions` (JSON), runtime загрузка вместо файловых бандлов.

---

## 6. Рекомендуемые библиотеки

### Frontend (webapp, Next.js 16 / React 19)

| Библиотека | Назначение | Лицензия | Обоснование |
|------------|-----------|----------|-------------|
| **recharts** 2.x | Графики (симптомы, статистика) | MIT | Самая популярная React-библиотека для графиков, декларативная, SSR-совместима |
| **@tanstack/react-table** 8.x | Таблицы (журналы, статистика, админ) | MIT | Headless — не навязывает стили, отлично для кастомного CSS |
| **@tiptap/react** 2.x | WYSIWYG-редактор (CMS) | MIT | Модульный, на базе ProseMirror, легковесный, активно поддерживается |
| **date-fns** 4.x | Работа с датами | MIT | Tree-shakeable, без мутаций, лёгкий |
| **react-hot-toast** | Toast-уведомления | MIT | Минималистичный, 5 KB, без зависимостей |
| **@dnd-kit/core** + **@dnd-kit/sortable** | Drag-and-drop (комплексы, упражнения) | MIT | Модульный, accessible, React-нативный |
| **zod** (уже есть) | Валидация форм | MIT | Уже используется, отлично для form validation |
| **workbox** 7.x (Google) | Service Worker для PWA | MIT | Стандарт индустрии, стратегии кэширования |

### Backend (integrator, Fastify)

| Библиотека | Назначение | Лицензия | Обоснование |
|------------|-----------|----------|-------------|
| **nodemailer** (уже есть) | Отправка email | MIT | Уже в зависимостях |
| **web-push** | Web Push уведомления (VAPID) | MIT | Стандарт, 0 зависимостей к внешним сервисам |
| **googleapis** / **google-auth-library** | Google Calendar API | Apache-2.0 | Официальная библиотека Google |
| **argon2** | Хэширование паролей | MIT | Безопаснее bcrypt, рекомендован OWASP |
| **pg** (уже есть) | PostgreSQL | MIT | Уже используется |
| **p-retry** (уже есть) | Retry logic | MIT | Уже используется |

### Не рекомендуется добавлять

| Что | Почему |
|-----|--------|
| Tailwind CSS | Проект уже использует кастомный CSS, переход будет дорогим и бессмысленным |
| Prisma / Drizzle ORM | Проект построен на raw SQL + pg, ORM добавит сложность без пользы |
| Socket.IO | Для чата лучше SSE или long-polling — проще, не нужен отдельный WS-сервер |
| MUI / Ant Design | Проект имеет свой дизайн, тяжёлые UI-фреймворки создадут конфликты |
| Redux / Zustand | React 19 + Server Actions + `use` хватает для state management |

---

## 7. Пропуски и недоописанные моменты

### 7.1 Явно упущено в плане

1. **Загрузка и хранение файлов (media storage)** — упомянуто для упражнений и CMS, но не описано:
   - Где хранить файлы? (S3-совместимое хранилище / локальный диск / CDN)
   - Лимиты на размер файлов
   - Оптимизация изображений (thumbs, WebP)
   - Политика удаления

2. **Миграция данных при расширении модели дневников** — текущие `symptom_trackings` не имеют полей `region`, `diagnosis`, `stage`. Нужна стратегия: новые поля nullable? Обратная совместимость?

3. **Контракт сообщений между webapp и мессенджерами** — описано «копирование сообщений из чатов», но не определён механизм:
   - Интегратор уже пишет в `conversation_messages` — нужен ли отдельный поток?
   - Как синхронизировать `read` статус между каналами?

4. **Механизм уведомлений в webapp** (in-app) — описан колокольчик и непрочитанные, но нет:
   - Таблицы in-app notifications
   - Real-time доставки (SSE / polling)
   - Связи с push

5. **Права и роли** — упомянуты doctor, admin, client, но не описаны:
   - Может ли быть несколько врачей?
   - Разграничение doctor vs admin: какие именно действия доступны каждому?
   - Что видит doctor при мультитенантности?

6. **Offline-режим PWA** — упомянут кэш, но не описано:
   - Какие данные доступны offline?
   - Можно ли добавлять записи дневника offline (с последующей синхронизацией)?

7. **Логирование и аудит действий** — нет упоминания:
   - Аудит-лог действий врача/админа
   - Кто и когда менял данные пациента

8. **Удаление данных / GDPR** — не описано:
   - Может ли пациент удалить свой аккаунт?
   - Политика хранения данных

9. **Тестирование** — нет описания:
   - E2E-тесты для новых фич
   - Как тестировать интеграции (Google Calendar, Rubitime)?

10. **Валидация справочников** — описано много справочников, но не указано:
    - Кто наполняет справочники изначально (seed data)?
    - Можно ли врачу удалять значения, если они используются?

### 7.2 Неявные зависимости

1. **Email-канал** зависит от настройки mailer в integrator → нужен SMTP-провайдер (российский? Mailgun? SendGrid запрещён для .ru?).
2. **PWA push** зависит от VAPID-ключей и Service Worker → нужно сначала PWA.
3. **Виджет Rubitime** — сторонний JS-скрипт, может конфликтовать с CSP и Next.js.
4. **Deep-link привязка** — работает для Telegram (`?start=`), но для Max API нужно проверить поддержку deep links, для ВК — совсем другой механизм (VK Mini Apps / сообщества).

---

## 8. Противоречия в плане

### 8.1 Прямые противоречия

1. **«Клиент» vs «Пациент»** — в плане используются оба термина. В настройках предлагается выбор. Но в коде, именах таблиц, роутах используется `patient` / `client` вперемешку. **Решение:** в коде оставить `patient` как внутренний термин, в UI — настраиваемый label.

2. **Справочники «общие по терапевту»** vs **мультитенантность** — если справочник общий, то при появлении второго врача один будет видеть справочник другого. **Решение:** scope справочников = `tenant_id` с самого начала.

3. **«Убрать иконки мессенджеров»** в профиле (п. 9.1) vs **«Иконки привязанных мессенджеров»** в карточке клиента у врача (п. 7.2.3). **Решение:** убрать иконки именно слева от *названия* в блоке привязки, но оставить как индикаторы-статусы.

### 8.2 Потенциальные конфликты

1. **Длительная сессия** (п. 8.7) vs **безопасность** — бессрочная сессия противоречит безопасности медицинских данных. **Рекомендация:** refresh-token с TTL 90 дней + периодическое подтверждение (fingerprint / biometrics в PWA).

2. **Кнопка «задать вопрос» — только в браузере** vs **чат-UI на странице сообщений** — если чат доступен через меню, зачем ограничивать FAB? **Рекомендация:** FAB показывать всегда, но в мессенджере он открывает существующий чат, а не новый вопрос.

3. **Deep-link привязка без телефона** (п. 9.2) vs **записи требуют телефон** (п. 11) — пользователь может привязать мессенджер без телефона, но не увидит записи. **Рекомендация:** при привязке показывать предложение добавить телефон.

4. **Google Calendar sync** vs **Rubitime как source of truth** — при перемещении записи в Google Calendar, кто master? **Рекомендация:** Rubitime = master, Google Calendar = read-only проекция.

---

## 9. Архитектурные рекомендации

### 9.1 Принципы для AI-friendly кодовой базы

1. **Модульная файловая структура** — один модуль = одна папка с `index.ts`, `types.ts`, `actions.ts`, `components/`. AI-агент работает эффективнее с изолированными модулями.

2. **Colocated types** — типы рядом с кодом, не в общем `types/`. Уменьшает контекст для AI.

3. **Server Actions вместо API routes** — Next.js 16 Server Actions проще для AI: один файл, валидация Zod, нет fetch-бойлерплейта.

4. **Thin components** — компоненты не содержат бизнес-логику. Вся логика в actions/hooks. AI легче менять UI отдельно от логики.

5. **Explicit contracts** — каждый модуль экспортирует типы для входов/выходов. AI-агент может проверить типы при интеграции.

6. **Readme per module** — краткий `module.md` (уже есть в integrator). Продолжить практику для webapp modules.

### 9.2 Подготовка к PWA

1. **Next.js 16 App Router** — уже используется, хорошо совместим с PWA.
2. Добавить `manifest.json` и `<meta>` теги для standalone display.
3. **Workbox** для генерации Service Worker с стратегией:
   - App shell: `CacheFirst`
   - API данные: `NetworkFirst` с offline fallback
   - Медиа: `CacheFirst` с TTL
4. **`display: standalone`** в manifest — убирает строку браузера.
5. **Offline-first для дневников** — записи сохраняются в IndexedDB, синхронизируются при появлении сети.

### 9.3 Подготовка к React Native

1. **Вынести бизнес-логику из компонентов** — hooks и actions должны быть framework-agnostic.
2. **API-контракт зафиксировать** — webapp API = мобильное API. Не использовать Server Actions для мобильных вызовов.
3. **Абстрагировать навигацию** — `paths.ts` уже есть, добавить navigation service.
4. **Не использовать CSS-специфичные решения в логике** — стили отдельно от data flow.
5. **Shared types пакет** — в будущем вынести типы в общий пакет монорепо для web + mobile.

### 9.4 Скорость и производительность

1. **Server Components** (React 19) — все страницы по умолчанию серверные. Client Components только для интерактивных блоков.
2. **Streaming** — `loading.tsx` для каждого route segment.
3. **Кэширование запросов** — `unstable_cache` / `revalidateTag` для справочников.
4. **Оптимистичные обновления** — для дневника (записал → показал → подтвердил).
5. **Виртуализация списков** — для длинных списков (клиенты, упражнения) использовать `@tanstack/react-virtual`.

---

## 10. Опасные места и риски

### 🔴 Высокий риск

1. **Перенос сервера** — при переезде на российский сервер возможен даунтайм, потеря данных при неправильном бэкапе, смена IP (DNS propagation), возможная смена провайдера SSL. Нужен чёткий checklist.

2. **Виджет Rubitime** — вставка стороннего `<script>` в Next.js может:
   - Нарушить CSP (Content Security Policy)
   - Конфликтовать с React hydration
   - Ломаться при обновлениях Rubitime
   - **Рекомендация:** загружать через `next/script` strategy="lazyOnload", изолировать в iframe или отдельном компоненте.

3. **Бессрочная сессия** — при компрометации cookie злоумышленник получает постоянный доступ к медицинским данным. **Рекомендация:** refresh-token + device fingerprint + возможность отозвать все сессии.

4. **Google Calendar OAuth** — требует верификации приложения Google, без неё доступ ограничен 100 пользователями. Для production нужно пройти OAuth verification (может занять значительное время).

### 🟠 Средний риск

5. **Max Bot API** — API может не поддерживать deep links (`?start=`) как Telegram. Нужна проверка. VK ещё сложнее — нужно VK Mini Apps или группы.

6. **WYSIWYG контент** — хранение HTML в БД создаёт XSS-риск. Нужна санитизация на входе и выходе.

7. **Справочники и миграции** — при частом расширении модели дневников миграции могут стать сложными. Рекомендуется JSONB для расширяемых полей + строгие индексированные ключи для фильтрации.

8. **Файловое хранилище** — без S3 файлы будут на диске сервера. При переезде, масштабировании или сбое диска — потеря медиа.

### 🟡 Низкий риск (но следить)

9. **Размер бандла** — добавление recharts, tiptap, dnd-kit увеличит JS-бандл. Использовать dynamic import.

10. **Обратная совместимость API** — при расширении модели дневников существующие данные не должны ломаться. Все новые поля = nullable.

11. **Rate-limiting SMS** — при ошибке в логике таймера пользователь может заспамить SMS, что стоит денег.

12. **Мультитенантность позже** — если не заложить `tenant_id` / `doctor_id` в таблицы сейчас, рефакторинг будет болезненным. Рекомендуется добавлять поле `owner_id` в новые таблицы заранее.
