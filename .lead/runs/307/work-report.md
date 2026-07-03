# Ф1 — Отчёт воркера

## Что сделано

### Новые файлы
| Файл | Назначение |
|------|-----------|
| `apps/integrator/src/infra/db/repos/notifTemplatePort.ts` | Порт чтения/записи/рендера шаблонов |
| `apps/integrator/src/infra/db/repos/notifTemplatePort.test.ts` | 16 юнит-тестов |

### Ключевые решения
- **Ключи**: `notif_template:<event>:<audience>` (event: created/cancelled/rescheduled; audience: patient/doctor) в `public.system_settings`, scope=admin
- **Чтение** (`getNotifTemplate`): `runIntegratorSql` → `SELECT value_json FROM public.system_settings` → фолбэк на `NOTIF_TEMPLATE_DEFAULTS` при отсутствии строки или DB-ошибке
- **Запись** (`setNotifTemplate`): `INSERT ... ON CONFLICT (key, scope) DO UPDATE`; `updated_by` не указываем — FK ссылается на `platform_users`, у integrator нет UUID
- **Интерполяция** (`renderNotifTemplate`): переиспользует `interpolateTemplate` из `kernel/orchestrator/templateInterpolation.ts` (уже экспортированная)
- **Переменные** шаблона: `{{date}} {{type}} {{city}} {{name}} {{phone}} {{reason}}`
  - `city` = ` (Москва)` или `''` (со скобками/пробелом, если есть) — caller pre-formats; чтобы дефолт `{{type}}{{city}}` давал `Онлайн (Москва)` или просто `Онлайн`
  - `reason` = `\nПричина: ...` или `''` — caller pre-formats

### Дефолты (из recordM2mRoute.ts)
| event | audience | шаблон |
|-------|----------|--------|
| created | patient | `Запись подтверждена: {{date}}\n{{type}}{{city}}` |
| created | doctor | `Новая запись: {{name}}, {{phone}}\nДата: {{date}}` |
| cancelled | patient | `Запись на {{date}} отменена.{{reason}}` |
| cancelled | doctor | `Отмена записи: {{name}}\nДата: {{date}}` |
| rescheduled | patient | `Запись перенесена на {{date}}\n{{type}}` |
| rescheduled | doctor | `Перенос записи: {{name}}, {{phone}}\nНовая дата: {{date}}` |

## Хэш коммита
`b60cbcd7` — ветка `feat/307-notif-templates`

## Проверки
- `npx tsc --noEmit` — 0 ошибок
- `npx vitest run notifTemplatePort.test.ts` — 16/16 passed
- `npx eslint` по обоим файлам — 0 замечаний

## Что осталось
- **Ф2**: API (admin) `GET/PUT /api/admin/notification-templates`
- **Ф3**: UI-секция в настройках доктора
- **Ф4**: Заменить хардкод в `recordM2mRoute.ts` на `getNotifTemplate` + `renderNotifTemplate`
  - При этом нужно передавать `city` как ` (${cityRaw})` или `''`, `reason` как `\nПричина: ${reason}` или `''`
