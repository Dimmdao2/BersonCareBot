# Аудит структуры приложения (immutable baseline)

**Статус:** **immutable snapshot** — фиксируется на старте инициативы и не редактируется.
**Дата:** 2026-05-01.
**Назначение:** baseline для последующего редизайна UI/IA. Любое сравнение «до/после» делается относительно этого снимка. Оценки и рекомендации вынесены в [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md).
**Операционная дельта (2026-05-04):** факт маршрутизации legacy `/app/patient/diary/symptoms` | `/diary/lfk` (включая слэш) и канон единой страницы дневника — в [`ROADMAP_2.md`](ROADMAP_2.md) §1.2 и [`LOG.md`](LOG.md); таблица §I.3.4 ниже дополнена строкой «как сейчас в коде» без пересъёмки всего документа.

**Источник фактов:** кодовая база `apps/webapp/src/app/app/patient/`, `apps/webapp/src/app/app/doctor/`, `apps/webapp/src/app-layer/routes/paths.ts`, `apps/webapp/src/shared/ui/doctorNavLinks.ts`, `apps/webapp/src/app-layer/routes/navigation.ts`, `apps/webapp/src/modules/patient-home/ports.ts`, `home/PatientHomeToday.tsx`, `apps/webapp/src/infra/repos/pgContentSections.ts`.

---

# Часть I — Пациентское приложение

## I.1. Верхняя навигация (`PatientTopNav`)

Пять вкладок:

| Подпись | Путь |
|---------|------|
| Сегодня | `/app/patient` |
| Запись | `/app/patient/booking` → редирект на `/booking/new` |
| Дневник | `/app/patient/diary` |
| План | `/app/patient/treatment-programs` |
| Профиль | `/app/patient/profile` |

## I.2. Главная «Сегодня» — `/app/patient`

Витрина дня. Для авторизованного пользователя с tier patient — персональные блоки; для гостя — non-personal часть.

Блоки задаются в БД (`patient_home_blocks` / `patient_home_block_items`), порядок и видимость конфигурируемы. Канонические коды (`PatientHomeBlockCode`):

| Код | Смысл |
|-----|--------|
| `daily_warmup` | Карточка дневной разминки |
| `useful_post` | Полезный пост из CMS |
| `booking` | Запись на приём |
| `situations` | Ряд «ситуаций» (чипы из контента) |
| `progress` | Прогресс практики (цель дня, streak) |
| `next_reminder` | Ближайшее напоминание |
| `mood_checkin` | Чек-ин настроения |
| `sos` | Карточка SOS |
| `plan` | Карточка активной программы лечения |
| `subscription_carousel` | Карусель подписок |
| `courses` | Ряд курсов |

Дополнительно: приветствие (`PatientHomeGreeting`).

**Примечание:** в `navigation.ts` есть legacy список `HomeBlockId` / `patientHomeBlocksCanonical` (`appointments | cabinet | materials | assistant | news | mailings | motivation | channels`) — он **не** соответствует текущей сборке главной.

## I.3. Таблица страниц по маршрутам

### I.3.1 Ядро продукта

| Название (шапка) | URL | Содержание | Задача |
|------------------|-----|------------|--------|
| Сегодня | `/app/patient` | См. I.2 | Домашний экран |
| Дневник | `/app/patient/diary` | Вкладки «Симптомы» / «ЛФК» | Учёт симптомов и ЛФК |
| Программы лечения | `/app/patient/treatment-programs` | Список назначенных | Обзор плана |
| Программа | `/app/patient/treatment-programs/[instanceId]` | Детальный клиент | Прохождение программы |
| Курсы | `/app/patient/courses` | Каталог; запись = инстанс программы | Запись на курсы |
| Мои приёмы | `/app/patient/cabinet` | Активные/прошедшие записи, intake-история | Кабинет визитов |
| Запись на приём | `/app/patient/booking/new` | Wizard, формат | Старт записи |
| Город | `/app/patient/booking/new/city` | Wizard | Выбор города |
| Услуга | `/app/patient/booking/new/service` | Wizard | Выбор услуги |
| Слот | `/app/patient/booking/new/slot` | Wizard | Выбор времени |
| Подтверждение | `/app/patient/booking/new/confirm` | Wizard | Подтверждение |
| Запись (legacy) | `/app/patient/booking` | Редирект на `/booking/new` | Совместимость |

### I.3.2 Контент CMS

| Название | URL | Содержание | Задача |
|----------|-----|------------|--------|
| Уроки и тренировки | `/app/patient/sections` | Сетка разделов CMS | Каталог разделов |
| Раздел CMS | `/app/patient/sections/[slug]` | Карточки страниц раздела | Материалы раздела |
| Материал | `/app/patient/content/[slug]` | Markdown/медиа/видео + CTA курса | Одна статья |
| Уроки (legacy) | `/app/patient/lessons` | → `/sections/lessons` | Совместимость |
| Скорая помощь (legacy) | `/app/patient/emergency` | → `/sections/emergency` | Совместимость |

### I.3.3 Профиль, напоминания, коммуникации

| Название | URL | Содержание | Задача |
|----------|-----|------------|--------|
| Мой профиль | `/app/patient/profile` | Аккордеоны: личные данные, PIN, OTP, каналы, уведомления, purge | Настройки аккаунта |
| Подписки на уведомления | `/app/patient/notifications` | Каналы доставки + темы | Уведомления |
| Напоминания | `/app/patient/reminders` | Правила (ЛФК, разделы, кастом) | Напоминания |
| Журнал напоминания | `/app/patient/reminders/journal/[ruleId]` | События по правилу | Аналитика |
| Сообщения | `/app/patient/messages` | Чат с поддержкой | Переписка |
| Поддержка | `/app/patient/support` | Форма администратору | Обращение |
| Справка | `/app/patient/help` | Краткая справка + ссылки | FAQ |
| Привязка телефона | `/app/patient/bind-phone` | Привязка номера | Tier patient |

### I.3.4 Дневник — журналы и legacy URL

| Название | URL | Содержание |
|----------|-----|------------|
| Журнал симптомов | `/app/patient/diary/symptoms/journal` | Записи по месяцам |
| Журнал ЛФК | `/app/patient/diary/lfk/journal` | Журнал занятий |
| Симптомы (legacy) | `/app/patient/diary/symptoms` (+ вариант со слэшем) | → `diary?tab=symptoms` через `next.config` `redirects` (308) |
| ЛФК (legacy) | `/app/patient/diary/lfk` (+ вариант со слэшем) | → `diary?tab=lfk` через `next.config` `redirects` (308) |

### I.3.5 Прочее

| Название | URL | Содержание | Задача |
|----------|-----|------------|--------|
| Мои покупки | `/app/patient/purchases` | Empty state до биллинга | Покупки (заглушка) |
| Адрес кабинета | `/app/patient/address` | iframe сайта клиники | Как добраться |
| Установить приложение | `/app/patient/install` | Инструкции PWA | Установка |
| Онлайн-запрос: нутрициология | `/app/patient/intake/nutrition` | Client-форма без `AppShell` | Online intake |
| Онлайн-запрос: ЛФК | `/app/patient/intake/lfk` | Client-форма без `AppShell` | Online intake |

---

# Часть II — Кабинет врача / админа

## II.1. Меню (`DOCTOR_MENU_ENTRIES`)

Текущий плоский список из 16 пунктов:

```
Обзор | Клиенты и подписчики | Записи | Сообщения
‑‑‑
Упражнения | Комплексы | Клинические тесты | Наборы тестов | Рекомендации | Шаблоны программ | Курсы
‑‑‑
Справочники | Главная пациента | CMS | Рассылки | Статистика
```

## II.2. Карта маршрутов

| Группа | URL | Назначение |
|--------|-----|------------|
| Дашборд | `/app/doctor` | Метрики-плитки + ближайший приём |
| Клиенты | `/app/doctor/clients` | Список + master-detail; query `scope=appointments\|all\|archived` |
| Карточка клиента | `/app/doctor/clients/[userId]` | Аккордеон с 13 секциями |
| Подписчики (legacy) | `/app/doctor/subscribers`, `/subscribers/[userId]` | Полные redirect-ы на `/clients?scope=all` |
| Hint admin | `/app/doctor/clients/name-match-hints` | Admin-debug |
| Записи | `/app/doctor/appointments` | Расписание; `view=future\|month\|cancellationsMonth` |
| Сообщения | `/app/doctor/messages` | Чат поддержки с пациентами (журнал массовых рассылок — на `/broadcasts`) |
| Рассылки | `/app/doctor/broadcasts` | Категории + аудитории + предпросмотр (число/имена, `dev_mode`) + подтверждение + `broadcast_audit`; см. [`../ARCHITECTURE/DOCTOR_BROADCASTS.md`](../ARCHITECTURE/DOCTOR_BROADCASTS.md) |
| Онлайн-заявки | `/app/doctor/online-intake`, `/online-intake/[requestId]` | Inbox онлайн-запросов от пациентов |
| Упражнения | `/app/doctor/exercises`, `/[id]`, `/new`, `/auto-create` | Каталог упражнений ЛФК |
| Комплексы ЛФК | `/app/doctor/lfk-templates`, `/[id]`, `/new` | Сборки упражнений |
| Клинические тесты | `/app/doctor/clinical-tests`, `/[id]`, `/new` | Каталог тестов |
| Наборы тестов | `/app/doctor/test-sets`, `/[id]`, `/new` | Сборки тестов |
| Рекомендации | `/app/doctor/recommendations`, `/[id]`, `/new` | Каталог рекомендаций |
| Шаблоны программ | `/app/doctor/treatment-program-templates`, `/[id]`, `/new` | Конструктор программ лечения |
| Курсы | `/app/doctor/courses`, `/[id]`, `/new` | Каталог курсов (= программ для пациента) |
| Программа клиента | `/app/doctor/clients/treatment-programs/[instanceId]` | Параллельный путь к экземпляру программы |
| Справочники | `/app/doctor/references`, `/[categoryCode]` | Зоны тела / типы нагрузок |
| CMS — обзор страниц | `/app/doctor/content` | Все страницы с фильтром по разделу |
| CMS — разделы | `/app/doctor/content/sections`, `/new`, `/edit/[slug]` | Управление разделами |
| CMS — страница | `/app/doctor/content/new`, `/edit/[id]` | Редактор страницы |
| CMS — новости | `/app/doctor/content/news` | `news_items` |
| CMS — мотивации | `/app/doctor/content/motivation` | `motivational_quotes` |
| CMS — библиотека | `/app/doctor/content/library`, `/library/delete-errors` | Файлы |
| CMS — главная пациента | `/app/doctor/patient-home` | Блоки + items |
| Статистика | `/app/doctor/stats` | Агрегаты |

## II.3. Карточка пациента — `ClientProfileCard.tsx`

`apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx` — **423 строки, 13 аккордеонов** в одной колонке:

```
Контакты и каналы | Учётная запись и архив | Ближайшие записи | История записей |
Дневник симптомов | Дневник ЛФК (+ назначить комплекс) | Программа лечения (+ назначить) |
Заметки врача | Блокировка подписчика | Коммуникации (отправить + история) |
[Опасные действия] | [Объединение УЗ] | [История операций]
```

При открытии раскрыт `contacts`. Аккордеон `Опасные действия`, `Объединение УЗ`, `История операций` — admin-only.

---

# Часть III — Архитектурные находки (факты)

1. **`pool.query` напрямую из RSC** в `apps/webapp/src/app/app/doctor/content/news/page.tsx` и `motivation/page.tsx`. Нарушение `.cursor/rules/clean-architecture-module-isolation.mdc` §1.
2. **Хардкод slug** `LESSON_CONTENT_SECTION = "lessons"` / `LESSON_CONTENT_SECTION_LEGACY = "course_lessons"` в `modules/treatment-program/types.ts` — противоречит `PATIENT_HOME_REDESIGN_INITIATIVE/README.md §2.1` (slug ≠ контракт).
3. **`patient_home_block_items.target_ref=slug`** — runtime-ссылка на slug без FK. Защищена историей переименований (`contentSectionSlugHistory`).
4. **`SUBSCRIPTIONS` хардкодом** в `apps/webapp/src/app/app/patient/notifications/page.tsx` — нарушение `runtime-config-env-vs-db.mdc` (operational values → `system_settings`).
5. **Хардкод тем рассылок** в коде — должны быть в DB.
6. **Orphan-компоненты:** `PatientHomeNewsSection.tsx`, `PatientHomeMailingsSection.tsx` (+ их тесты) — не используются в текущем `PatientHomeToday.tsx`. На новой главной нет блоков `news` и `mailings` (`PatientHomeBlockCode` их не содержит).
7. **Legacy `HomeBlockId`** в `navigation.ts` (`appointments | cabinet | materials | assistant | news | mailings | motivation | channels`) — не отражает текущую модель `PatientHomeBlockCode`.
8. **`news_items`** — отдельная таблица, не интегрированная с `content_pages`. На новой главной не отображается.
9. **`motivational_quotes`** — отдельная таблица, не интегрированная с `content_pages`. На новой главной не отображается.
10. **`broadcasts`** — рабочая инфраструктура: 8 категорий (`service / organizational / marketing / important_notice / schedule_change / reminder / education / survey`), 8 аудиторий (`all / active_clients / with_upcoming_appointment / without_appointment / with_telegram / with_max / sms_only / inactive`), preview + двухшаговое подтверждение, audit log; канал отправки — через интегратор (бот / SMS, по факту).

---

# Часть IV — Связанные артефакты

- Инициатива переноса стиля (контекст до этой реформы): [`../PATIENT_APP_STYLE_TRANSFER_INITIATIVE/`](../PATIENT_APP_STYLE_TRANSFER_INITIATIVE/) — `PLAN_INVENTORY.md`, `GLOBAL_AUDIT.md`.
- Редизайн «Сегодня» пациента: [`../PATIENT_HOME_REDESIGN_INITIATIVE/README.md`](../PATIENT_HOME_REDESIGN_INITIATIVE/README.md), [`VISUAL_SYSTEM_SPEC.md`](../PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md), [`CONTENT_GUIDE.md`](../PATIENT_HOME_REDESIGN_INITIATIVE/CONTENT_GUIDE.md).
- Правила репозитория: `.cursor/rules/clean-architecture-module-isolation.mdc`, `runtime-config-env-vs-db.mdc`, `system-settings-integrator-mirror.mdc`, `000-critical-integration-config-in-db.mdc`.
