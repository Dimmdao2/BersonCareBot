# PLANS — Инструкции по этапам

Каждая папка = один этап дорожной карты, пронумерован по порядку выполнения.
Внутри — файл `PLAN.md` с детальной инструкцией для авто-агента.
Отложенные задачи после стабилизации prod: `docs/FULL_DEV_PLAN/POST_PROD_TODO.md`.

## Структура

```
PLANS/
├── STAGE_00_TAILWIND_SETUP/     ← Установка Tailwind + shadcn/ui (ПЕРЕД всем)
├── STAGE_01_BUGFIXES/           ← Исправление критических багов
├── STAGE_02_DESIGN_SYSTEM/      ← Дизайн-система на Tailwind + shadcn
├── STAGE_03_PROFILE/            ← Профиль клиента, email, OTP, deep-link
├── STAGE_04_HOME_AND_APPOINTMENTS/ ← Главная, записи, уведомления
├── STAGE_05_AUTH_SYSTEM/        ← Авторизация (PIN, мессенджер, OAuth, SMS)
├── STAGE_06_DIARIES_EXTENSION/  ← Дневники: справочники, расширение модели
├── STAGE_07_CHARTS/             ← Графики и статистика
├── STAGE_08_MESSAGING/          ← Чат клиент↔врач
├── STAGE_09_DOCTOR_CABINET/     ← Дашборд, клиенты, подписчики
├── STAGE_10_CMS/                ← Markdown-редактор, медиа, новости
├── STAGE_11_LFK/                ← Упражнения, комплексы, назначения
│
│   >>> CHECKPOINT: CSS cleanup — дочистить остатки globals.css <<<
│
├── STAGE_12_REMINDERS/          ← Бот заботы, пуш (в будущем)
├── STAGE_13_INTEGRATIONS/       ← Email, deep-link, Google Calendar
├── STAGE_14_SETTINGS_ADMIN/     ← Настройки, режим админа
├── STAGE_15_PWA/                ← ⏸ ОТЛОЖЕН
├── STAGE_16_REFERRALS/          ← Реферальная система (ожидает декомпозицию)
├── STAGE_17_PATIENT_CARD/       ← Карта пациента (ожидает декомпозицию)
├── STAGE_18_SERVER_MIGRATION/   ← 🔒 Ответственность владельца
├── STAGE_19_SCENARIOS_DB/       ← Сценарии в БД (ожидает декомпозицию)
└── STAGE_20_MULTITENANT/        ← Мультитенант + платежи (пока пустой)
```

## Порядок выполнения

| # | Папка | Описание |
|---|-------|----------|
| 0 | `STAGE_00_TAILWIND_SETUP/` | Установка Tailwind 4 + shadcn/ui + bundle analyzer |
| 1 | `STAGE_01_BUGFIXES/` | 9 критических багов |
| 2 | `STAGE_02_DESIGN_SYSTEM/` | Шапки, меню, компоненты, иконки |
| 3 | `STAGE_03_PROFILE/` | Профиль, email, OTP, deep-link, BindPhoneBlock |
| 4 | `STAGE_04_HOME_AND_APPOINTMENTS/` | Главная, записи, уведомления, мини-статистика |
| 5 | `STAGE_05_AUTH_SYSTEM/` | Multi-method auth (PIN, мессенджер, OAuth, SMS) |
| 6 | `STAGE_06_DIARIES_EXTENSION/` | Справочники, расширение модели, вкладки, быстрое добавление |
| 7 | `STAGE_07_CHARTS/` | recharts, графики симптомов, таблица ЛФК |
| 8 | `STAGE_08_MESSAGING/` | Чат UI, список диалогов, real-time |
| 9 | `STAGE_09_DOCTOR_CABINET/` | Дашборд, клиенты/подписчики, карточки |
| 10 | `STAGE_10_CMS/` | Markdown-редактор, медиа (S3), новости, мотивашки |
| 11 | `STAGE_11_LFK/` | Справочник упражнений, конструктор комплексов |
| **✓** | **CSS CLEANUP** | **Дочистить globals.css, убрать все старые классы** |
| 12 | `STAGE_12_REMINDERS/` | Напоминания, колокольчик |
| 13 | `STAGE_13_INTEGRATIONS/` | Email, deep-link, Google Calendar, Rubitime |
| 14 | `STAGE_14_SETTINGS_ADMIN/` | Настройки, режим админа |
| 15 | `STAGE_15_PWA/` | ⏸ Отложен |
| 16–20 | Будущее | Рефералы, карта пациента, сервер, сценарии, мультитенант |

## Правило Tailwind

> **С этапа 0 весь новый и изменяемый код — только Tailwind + shadcn/ui.**
> При касании любого файла — переводить его CSS на Tailwind, удалять старые классы из globals.css.
> После этапа 11 — checkpoint: прошерстить и дочистить остатки globals.css.

## Как использовать

1. Агенту передаётся `PLAN.md` из конкретной папки.
2. Агент выполняет подэтапы последовательно.
3. После каждого подэтапа: `pnpm run ci`.
4. После всего этапа: проверка по чеклисту в конце файла.
5. Коммит и пуш после каждого подэтапа.
