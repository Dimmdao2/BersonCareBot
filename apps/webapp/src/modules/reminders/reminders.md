# reminders

Сервисные правила напоминаний в **webapp** (`public.reminder_rules` — источник истины для продуктовых правил), журнал действий (`reminder_journal`), API пациента и integrator M2M. **Фактическая отправка push** и планирование due-occurrence выполняются в **integrator**; диспетчер читает правила из локальной БД после upsert из webapp и учитывает `platform_users.reminder_muted_until`.

## Документация

- Инициатива UX / контракты: [`docs/archive/2026-05-initiatives/PATIENT_REMINDER_UX_INITIATIVE/README.md`](../../../../../docs/archive/2026-05-initiatives/PATIENT_REMINDER_UX_INITIATIVE/README.md)

## Наблюдаемость (admin)

- **Краткий срез в «Здоровье системы»:** [`GET /api/admin/system-health`](../../app/api/admin/system-health/route.ts) → поле **`remindersPipeline`** в теле ответа (в т.ч. **`patientReminderM2mIdempotencyKeysActive`** — активные ключи idempotency M2M push/email) и проба **`reminders_pipeline`** в **`meta.probes`** (реализация: [`collectAdminSystemHealthData.ts`](../../app-layer/health/collectAdminSystemHealthData.ts), [`adminReminderPipelineMetrics.ts`](../../app-layer/health/adminReminderPipelineMetrics.ts)); UI — аккордеон «Напоминания» в [`SystemHealthSection.tsx`](../../app/app/settings/SystemHealthSection.tsx).
- **Детальная статистика за окно (`windowHours`):** [`GET /api/admin/reminder-stats`](../../app/api/admin/reminder-stats/route.ts) (admin mode) и **`GET /api/doctor/content-stats`** (doctor/admin без admin mode) — один загрузчик **`loadContentEngagementStats`** ([`loadAdminReminderStats.ts`](../../app-layer/stats/loadAdminReminderStats.ts)); вкладка **`/app/settings?adminTab=reminder-stats`**, компонент [`ReminderStatsSection.tsx`](../../app/app/settings/ReminderStatsSection.tsx). Контракт и поля (в т.ч. **`reminderRulesEnabledCount`**) — [`api.md`](../../app/api/api.md) (**admin/reminder-stats**, **doctor/content-stats**).
- **M2M fan-out после `dispatchDue`:** `POST /api/integrator/patient-reminders/notify-channels` — реализация [`integratorNotifyChannels.ts`](integratorNotifyChannels.ts) (web push + transactional SMTP; **List-Unsubscribe** при валидном `From`; сглаживание частоты email — `email_send_cooldowns`, ключ **`!reminder_txn_v1`**).

## Бот (Telegram / MAX): «Выполнить»

- Кнопка с `callback_data` `rem_done:<occurrenceId>` в пуш-напоминании подписана **«Выполнить»** (отметка без миниаппа). Клавиатура в репозитории: `apps/integrator/src/kernel/domain/reminders/reminderInlineKeyboard.ts`.
- **Integrator** (`reminders.done.callback`, сценарии `telegram.reminder.done` / `max.reminder.done`): после **`ok: true`** от webapp **`POST /api/integrator/reminders/occurrences/done`** — `callback.answer` → **`message.delete`** исходного сообщения (у MAX `message_id` — строка). Если **`firstDoneForOccurrence`**, **`dayFullyDone`**, **`daySentTotal > 0`** — отдельное **`message.send`** с шаблоном **`reminder.dayAllDone`** (`{{done}}`, `{{total}}` в `apps/integrator/src/content/{telegram,max}/user/templates.json`). При ошибке webapp колбэк завершается **failed**, удаления нет.
- **Webapp:** день для агрегатов считается по локальной дате **`reminder_occurrence_history.occurred_at`** в IANA-зоне **`app_display_timezone`** (`getAppDisplayTimeZone`), в той же транзакции что запись `done` в `reminder_journal` — `pgReminderJournal.recordDone`, вызов из `doneOccurrence` в `service.ts`.
- Ответы **200** с полями **`firstDoneForOccurrence`**, **`dayDoneCount`**, **`daySentTotal`**, **`dayFullyDone`**: маршруты [`occurrences/done/route.ts`](../../app/api/integrator/reminders/occurrences/done/route.ts) (integrator) и [`patient/reminders/[id]/done/route.ts`](../../app/api/patient/reminders/[id]/done/route.ts) (пациент).

- `service.ts` — бизнес-логика; порты: `ReminderRulesPort`, опционально `ReminderJournalPort`.
- `buildReminderDeepLink.ts` — deeplink для payload integrator (в т.ч. `rehab_program` → `/app/patient/treatment/...`). Для `reminder_intent` **`warmup`** / **`exercises`** / **`stretch`** — стабильные пути `/app/patient/go/daily-warmup` и `/app/patient/go/plan-start-lesson` (RSC-редирект на тот же контент, что CTA «Начать разминку» / «Начать занятие» на главной пациента). Префикс `/app/patient/go/` учтён в `patientRouteApiPolicy` (в т.ч. без лишнего bind-phone в legacy snapshot, как у `/app/patient/content/`).
- `scheduleSlots.ts` — формат `slots_v1`, дефолт реабилитации `DEFAULT_REHAB_DAILY_SLOTS` (09:00 и 19:00, `weekly_mask` 7/7). Дефолты формы «офисный день» для не-rehab — `reminderFormDefaults.ts` (окно 12–18, интервал 180 мин, маска Пн–Пт).
- Репозитории: `infra/repos/pgReminderRules.ts`, `pgReminderJournal.ts`; проекция для integrator GET: `infra/repos/pgReminderProjection.ts` (поля `schedule_data`, `reminder_intent`, `display_*` в ответе списка правил).
