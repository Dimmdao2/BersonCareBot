# Задачи специалиста (фаза 2C)

**Статус:** реализовано 2026-06-02.

## Модель

Таблица `specialist_tasks`: владелец (`owner_user_id`), опциональная привязка к пациенту (`patient_user_id` nullable), заголовок, описание, срок, `remind_at`, флаг важности, `completed_at`, `reminder_sent_at` (идемпотентность доставки).

Глобальные задачи: `patient_user_id IS NULL`. Не часть `treatment_program`.

## API

- `GET/POST /api/doctor/tasks` — глобальные задачи
- `GET/PATCH/DELETE /api/doctor/tasks/:taskId`, `POST …/complete`
- `GET/POST /api/doctor/clients/:userId/tasks`, `GET …/tasks/summary`
- `POST /api/internal/specialist-task-reminders/tick` — cron (Bearer `INTERNAL_JOB_SECRET`)

## Настройки

Doctor-scope `doctor_specialist_task_reminder_channels` в `/app/settings`: `{ value: { channels: ["telegram","max",…] } }`.

## UI

- Карточка пациента: секция «Задачи» на «Обзоре», сводка в Hero и чип Action Strip
- «Сегодня»: блок «Мои задачи» (глобальные)
