# reminders

Сервисные правила напоминаний в **webapp** (`public.reminder_rules` — источник истины для продуктовых правил), журнал действий (`reminder_journal`), API пациента и integrator M2M. **Фактическая отправка push** и планирование due-occurrence выполняются в **integrator**; диспетчер читает правила из локальной БД после upsert из webapp и учитывает `platform_users.reminder_muted_until`.

## Документация

- Инициатива UX / контракты: [`docs/archive/2026-05-initiatives/PATIENT_REMINDER_UX_INITIATIVE/README.md`](../../../../../docs/archive/2026-05-initiatives/PATIENT_REMINDER_UX_INITIATIVE/README.md)

## Наблюдаемость (admin)

- **Краткий срез в «Здоровье системы»:** [`GET /api/admin/system-health`](../../app/api/admin/system-health/route.ts) → поле **`remindersPipeline`** в теле ответа и проба **`reminders_pipeline`** в **`meta.probes`** (реализация: [`collectAdminSystemHealthData.ts`](../../app-layer/health/collectAdminSystemHealthData.ts), [`adminReminderPipelineMetrics.ts`](../../app-layer/health/adminReminderPipelineMetrics.ts)); UI — аккордеон «Напоминания» в [`SystemHealthSection.tsx`](../../app/app/settings/SystemHealthSection.tsx).
- **Детальная статистика за окно (`windowHours`):** [`GET /api/admin/reminder-stats`](../../app/api/admin/reminder-stats/route.ts) — [`loadAdminReminderStats.ts`](../../app-layer/stats/loadAdminReminderStats.ts); вкладка **`/app/settings?adminTab=reminder-stats`**, компонент [`ReminderStatsSection.tsx`](../../app/app/settings/ReminderStatsSection.tsx). Описание контракта: [`api.md`](../../app/api/api.md) (пункт **admin/reminder-stats**).

- `service.ts` — бизнес-логика; порты: `ReminderRulesPort`, опционально `ReminderJournalPort`.
- `buildReminderDeepLink.ts` — deeplink для payload integrator (в т.ч. `rehab_program` → `/app/patient/treatment/...`). Для `reminder_intent` **`warmup`** / **`exercises`** / **`stretch`** — стабильные пути `/app/patient/go/daily-warmup` и `/app/patient/go/plan-start-lesson` (RSC-редирект на тот же контент, что CTA «Начать разминку» / «Начать занятие» на главной пациента). Префикс `/app/patient/go/` учтён в `patientRouteApiPolicy` (в т.ч. без лишнего bind-phone в legacy snapshot, как у `/app/patient/content/`).
- `scheduleSlots.ts` — формат `slots_v1`, дефолт реабилитации `DEFAULT_REHAB_DAILY_SLOTS` (09:00 и 19:00, `weekly_mask` 7/7). Дефолты формы «офисный день» для не-rehab — `reminderFormDefaults.ts` (окно 12–18, интервал 180 мин, маска Пн–Пт).
- Репозитории: `infra/repos/pgReminderRules.ts`, `pgReminderJournal.ts`; проекция для integrator GET: `infra/repos/pgReminderProjection.ts` (поля `schedule_data`, `reminder_intent`, `display_*` в ответе списка правил).
