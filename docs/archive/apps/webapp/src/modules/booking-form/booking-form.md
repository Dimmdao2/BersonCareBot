# booking-form

Настраиваемые поля записи и валидация ответов (этап 2).

## Таблицы

`be_booking_form_fields`, `be_booking_form_submissions` (миграция `0089`).

## API

- Пациент: поля через `booking-form.listPatientFields` → `GET /api/booking/form-fields`.
- Admin: `listAdminFields` / `upsertAdminField` → `/api/admin/booking-engine/form-fields`.

## Валидация

`validateAnswers.ts` — обязательность, email/phone; учёт `profilePrefill` (имя/телефон из контактов create).

## Тесты

`validateAnswers.test.ts`.
