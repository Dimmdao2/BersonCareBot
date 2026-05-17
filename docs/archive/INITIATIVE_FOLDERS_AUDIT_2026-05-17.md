# Аудит папок инициатив (`docs/*`) — 2026-05-17

Цель: понять, что **уже в архиве**, что **активно**, что **указатели/заглушки**, и что **имеет смысл перенести** в `docs/archive/…` без потери смысла.

## Уже в `docs/archive/2026-05-initiatives/` (не трогать как «активные»)

Крупные закрытые patient/doctor треки: `PATIENT_HOME_REDESIGN_*`, `PATIENT_APP_*`, `PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE`, `PATIENT_REMINDER_UX_*`, `WEBAPP_MIGRATIONS_DRIZZLE_UNIFICATION_*`, `PROGRAM_PATIENT_SHAPE_*`, `ASSIGNMENT_CATALOGS_REWORK_*`, `VIDEO_HLS_DELIVERY`, `DEPENDENCY_CI_UPDATE_*`, и т.д. — перечислены в [`../README.md`](../README.md) §«Архив».

## Активные (остаются в корне `docs/`)

| Папка | Почему не в архив |
|--------|-------------------|
| `PWA_INITIATIVE/` | Активная базовая линия PWA. |
| `ONLINE_CONSULT_REHAB_NUTRITION_BOOKING_INITIATIVE/` | Открытый продуктовый контур. |
| `DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/` | Активный roadmap врача. |
| `APP_RESTRUCTURE_INITIATIVE/` | Главный IA/CMS roadmap. |
| `OPERATOR_HEALTH_ALERTING_INITIATIVE/` | Активный план + MVP. |
| `RULES/REMINDERS_SETTINGS_DRIZZLE_ONLY/` | Канон инициативы (корневой `docs/REMINDERS_*` — только указатель). |

## Отложенные / спецификации (не «закрытые», перенос не обязателен)

| Папка | Статус | Архив? |
|--------|--------|--------|
| `COURSES_INITIATIVE/` | Strawman, отложено владельцем; много ссылок из `APP_RESTRUCTURE_*` и `BACKLOG_TAILS.md`. | **Нет**, пока не решён перенос + массовое обновление ссылок. |

## Закрытые, но журнал остаётся в корне `docs/`

| Папка | Статус | Архив? |
|--------|--------|--------|
| `INTEGRATOR_DRIZZLE_MIGRATION/` | Инициатива закрыта **2026-05-15**, но `LOG.md` / `RAW_SQL_INVENTORY.md` — рабочие якоря для ссылок из `docs/README.md`, `docs/TODO.md`, `.cursor/plans/*`. | **Возможно** `git mv` → `docs/archive/2026-05-initiatives/INTEGRATOR_DRIZZLE_MIGRATION/` **только вместе** с обновлением всех ссылок (десятки файлов). До массового редиректа — оставить в корне. |

## Указатели (заглушки) в корне `docs/`

| Путь | Содержимое | Рекомендация |
|------|----------------|-------------|
| `docs/REMINDERS_SETTINGS_DRIZZLE_ONLY/README.md` | Редирект на `docs/RULES/REMINDERS_SETTINGS_DRIZZLE_ONLY/`. | Оставить для старых закладок **или** удалить после проверки внешних ссылок. |
| `docs/TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md` | Редирект на `docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md`. | Аналогично. |
| `docs/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/README.md` | Указатель на архив (инициатива закрыта). | **Удалён** 2026-05-17 — канон только [`2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/`](2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/README.md). |

## Итог

- **2026-05-17 (доп.):** папка **`docs/PATIENT_CALENDAR_TIMEZONE_INITIATIVE/`** удалена после закрытия работ; якоря по API и UI — [`apps/webapp/src/app/api/api.md`](../apps/webapp/src/app/api/api.md) (блок **patient/profile/calendar-timezone**), [`apps/webapp/src/app/app/patient/profile/profile.md`](../apps/webapp/src/app/app/patient/profile/profile.md), код `PatientCalendarTimezoneSection` / `PatientCalendarTimezoneBootstrap` / `pgPatientCalendarTimezone`.
- В архив **уже унесено** всё из списка в `docs/README.md` §«Архив» (`archive/2026-05-initiatives/`, `2026-04-initiatives/`).
- **Не переносить без отдельной задачи:** `COURSES_INITIATIVE`, `INTEGRATOR_DRIZZLE_MIGRATION` (пока не готов пакет обновления ссылок).
- **Убран лишний указатель:** `docs/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/` (дублировал архив).
