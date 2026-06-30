# Фиксы ботов Telegram + MAX (2026-05-30)

Закрытая инициатива: врач из `doctor_*_ids` получает admin-сценарии в боте, надёжный `program_reply`, автологин PWA после контакта, сброс contact-клавиатуры, MAX-паритет.

| Документ | Назначение |
|----------|------------|
| [`LOG.md`](LOG.md) | Журнал исполнения и проверок |
| [`.cursor/plans/archive/bot_fixes_staff_auth.plan.md`](../.cursor/plans/archive/bot_fixes_staff_auth.plan.md) | План (закрыт) |
| [`ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md`](../ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md) | Program note reply, § `isAdmin` |
| [`OPERATIONS/PHONE_MESSENGER_AUTH_RUNBOOK.md`](../OPERATIONS/PHONE_MESSENGER_AUTH_RUNBOOK.md) | Runbook `auth_*`, open-app URL, refetch |
| [`apps/webapp/INTEGRATOR_CONTRACT.md`](../../apps/webapp/INTEGRATOR_CONTRACT.md) | M2M и UX bind (`urlFact`, staff lists) |
| [`apps/integrator/src/content/telegram/admin/admin.md`](../../apps/integrator/src/content/telegram/admin/admin.md) | Admin-сценарии integrator |

## Ключевая механика `isAdmin`

`facts.isAdmin` в webhook = **env-admin** ∪ id из `admin_telegram_ids` / `doctor_telegram_ids` (Telegram) или `admin_max_ids` / `doctor_max_ids` (MAX) в `system_settings` (scope `admin`).

Списки кешируются в памяти integrator **60 с**; кеш **сбрасывается** при `POST /api/integrator/settings/sync` для этих ключей (сразу после сохранения в админке webapp).

Код: `apps/integrator/src/infra/db/messengerStaffIds.ts`, инъекция в `apps/integrator/src/app/routes.ts`.
