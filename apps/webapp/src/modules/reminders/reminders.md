# reminders

Сервисные правила напоминаний в **webapp** (`public.reminder_rules` — источник истины для продуктовых правил), журнал действий (`reminder_journal`), API пациента и integrator M2M. **Фактическая отправка push** и планирование due-occurrence выполняются в **integrator**; диспетчер читает правила из локальной БД после upsert из webapp и учитывает `platform_users.reminder_muted_until`.

## Документация

- Инициатива UX / контракты: [`docs/PATIENT_REMINDER_UX_INITIATIVE/README.md`](../../../../../docs/PATIENT_REMINDER_UX_INITIATIVE/README.md)

## Ключевые точки кода

- `service.ts` — бизнес-логика; порты: `ReminderRulesPort`, опционально `ReminderJournalPort`.
- `buildReminderDeepLink.ts` — deeplink для payload integrator (в т.ч. `rehab_program` → `/app/patient/treatment/...`).
- `scheduleSlots.ts` — формат `slots_v1`, дефолт будни 12/15/17.
- Репозитории: `infra/repos/pgReminderRules.ts`, `pgReminderJournal.ts`; проекция для integrator GET: `infra/repos/pgReminderProjection.ts` (поля `schedule_data`, `reminder_intent`, `display_*` в ответе списка правил).
