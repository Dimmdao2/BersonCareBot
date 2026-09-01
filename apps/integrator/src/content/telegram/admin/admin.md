# admin

> **SUPERSEDED AS TARGET — 2026-07-27.** The patient-dialogue/reply scenarios below must not authorize a doctor to reply inside Telegram/MAX. Current authority is the **«Уведомления»** row in [`CURRENT_AUTHORITY_MAP.md`](../../../../../../docs/CURRENT_AUTHORITY_MAP.md): `OWNER_PRODUCT_RULES.md` §15 (doctor Telegram is notifications only; reply in cabinet).

Сценарии и шаблоны для служебных команд в Telegram и MAX. Сообщения пациента и комментарии к программе приходят врачу как уведомления; врач читает и отвечает только в кабинете.

## Кто считается admin в боте

> ⚠️ **УСТАРЕЛО (26.07.2026).** Выдача прав через объединение списков `admin_*_ids`/`doctor_*_ids` —
> устаревшая схема. Канон: [ADMIN_ACCESS_MODEL.md](../../../../../../docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md).

- **`isAdmin`** в facts webhook = env-admin (`TELEGRAM_ADMIN_ID` / MAX admin) **∪** id из `admin_telegram_ids` / `doctor_telegram_ids` (Telegram) или `admin_max_ids` / `doctor_max_ids` (MAX) в `system_settings` (scope `admin`).
- Резолвер: `apps/integrator/src/infra/db/messengerStaffIds.ts` (TTL-кеш списков 60 с).
- Канон: [`docs/ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md`](../../../../../../docs/ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md) §«Админ-бот».

## Комментарий к упражнению

[`notifyDoctorPatientProgramNote`](../../../../../webapp/src/modules/messaging/notifyDoctorPatientProgramNote.ts)
доставляет только уведомление. Врач открывает программу пациента и отвечает в webapp; бот не создаёт режим
ответа. Канон: [`docs/ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md`](../../../../../../docs/ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md).

## Прочие команды

- `/dialogs`, `/admin_bookings`, … — см. `scripts.json`, priority выше unmatched.
- Свободный текст **без** режима ответа: `telegram.admin.message.unmatched` / `max.admin.message.unmatched` (priority 2) — шаблон `admin.reply.hintUnmatched`.

**Удалено (dev):** catch-all `admin.test.commandReceived` («Тест: команда получена»).
