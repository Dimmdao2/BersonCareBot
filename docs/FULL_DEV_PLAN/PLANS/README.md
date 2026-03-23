# PLANS — Инструкции по этапам

Каждая папка соответствует функциональному блоку проекта. Внутри — файлы с детальными инструкциями для каждого этапа, декомпозированными до уровня авто-агента.

## Структура

```
PLANS/
├── 01_CRITICAL_INFRA/          ← Перенос сервера, бэкапы
│   └── STAGE_18_SERVER_MIGRATION.md
├── 02_BUGFIXES_AND_UX/         ← Исправление критических багов
│   └── STAGE_01_BUGFIXES.md
├── 03_AUTH_AND_SECURITY/       ← Авторизация, email, OTP, PIN, OAuth, deep-link
│   ├── STAGE_03_PROFILE.md
│   └── STAGE_05_AUTH_SYSTEM.md
├── 04_DESIGN_SYSTEM/           ← CSS, шапка, меню, компоненты
│   └── STAGE_02_DESIGN_SYSTEM.md
├── 05_PATIENT_WEBAPP/          ← Главная, записи, уведомления
│   └── STAGE_04_HOME_AND_APPOINTMENTS.md
├── 06_DOCTOR_WEBAPP/           ← Дашборд, клиенты, подписчики, настройки
│   ├── STAGE_09_DOCTOR_CABINET.md
│   └── STAGE_15_SETTINGS_ADMIN.md
├── 07_DIARIES_MODULE/          ← Дневники: справочники, расширение, графики
│   ├── STAGE_06_DIARIES_EXTENSION.md
│   └── STAGE_07_CHARTS.md
├── 08_MESSAGING/               ← Чат клиент↔врач
│   └── STAGE_08_MESSAGING.md
├── 09_LFK_MODULE/              ← Упражнения, комплексы, назначения
│   └── STAGE_11_LFK.md
├── 10_CMS_AND_CONTENT/         ← WYSIWYG, медиа, новости
│   └── STAGE_10_CMS.md
├── 11_REMINDERS/               ← Бот заботы, пуш
│   └── STAGE_12_REMINDERS.md
├── 12_INTEGRATIONS/            ← Email, deep-link, Google Calendar, Rubitime
│   └── STAGE_13_INTEGRATIONS.md
├── 13_PWA_AND_MOBILE/          ← PWA, offline, push
│   └── STAGE_14_PWA.md
└── 14_MULTITENANT_AND_PAYMENTS/ ← Будущие этапы 16–20
    └── STAGE_20_MULTITENANT.md
```

## Порядок выполнения

1. **Этап 1** → `02_BUGFIXES_AND_UX/STAGE_01_BUGFIXES.md`
2. **Этап 2** → `04_DESIGN_SYSTEM/STAGE_02_DESIGN_SYSTEM.md`
3. **Этап 3** → `03_AUTH_AND_SECURITY/STAGE_03_PROFILE.md`
4. **Этап 4** → `05_PATIENT_WEBAPP/STAGE_04_HOME_AND_APPOINTMENTS.md`
5. **Этап 5** → `03_AUTH_AND_SECURITY/STAGE_05_AUTH_SYSTEM.md`
6. **Этап 6** → `07_DIARIES_MODULE/STAGE_06_DIARIES_EXTENSION.md`
7. **Этап 7** → `07_DIARIES_MODULE/STAGE_07_CHARTS.md`
8. **Этап 8** → `08_MESSAGING/STAGE_08_MESSAGING.md`
9. **Этап 9** → `06_DOCTOR_WEBAPP/STAGE_09_DOCTOR_CABINET.md`
10. **Этап 10** → `10_CMS_AND_CONTENT/STAGE_10_CMS.md`
11. **Этап 11** → `09_LFK_MODULE/STAGE_11_LFK.md`
12. **Этап 12** → `11_REMINDERS/STAGE_12_REMINDERS.md`
13. **Этап 13** → `12_INTEGRATIONS/STAGE_13_INTEGRATIONS.md`
14. **Этап 14** → `13_PWA_AND_MOBILE/STAGE_14_PWA.md`
15. **Этап 15** → `06_DOCTOR_WEBAPP/STAGE_15_SETTINGS_ADMIN.md`
16. **Этапы 16–20** → `14_MULTITENANT_AND_PAYMENTS/STAGE_20_MULTITENANT.md`

## Как использовать

1. Агенту передаётся файл конкретного этапа.
2. Агент выполняет подэтапы последовательно.
3. После каждого подэтапа: `pnpm run ci`.
4. После всего этапа: проверка по чеклисту в конце файла.
5. Коммит и пуш после каждого подэтапа.
