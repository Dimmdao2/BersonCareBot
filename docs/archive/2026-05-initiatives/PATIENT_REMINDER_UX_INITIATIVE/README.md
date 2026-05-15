# Patient Reminder UX Initiative

**Статус: закрыта (2026-05-09).** Документы остаются в `docs/archive/2026-05-initiatives/PATIENT_REMINDER_UX_INITIATIVE/` как нормативка по контракту напоминаний.

Напоминания для программы реабилитации: расписание `slots_v1`, intent/CTA, snooze 15/30, done, mute-all, синхронизация главной (`n из N`).

**Пациентский UX (после усиленного плана, 2026-05-09):** на `/app/patient/reminders` — блоки «Программа реабилитации» и «Разминки» (якоря `#patient-reminders-rehab`, `#patient-reminders-warmups`), сводка «Сегодня» через `summarizeReminderForCalendarDay`; модалка — слоты построчно (`type=time`), интервал 30…659 мин с колёсами `PatientDurationHmWheels`; на активном плане лечения — карточка «Напоминания сегодня» над hero со ссылкой на напоминания с hash. Общее форматирование минут суток: `modules/reminders/reminderScheduleFormat.ts`.

## Документы

- [ROADMAP.md](./ROADMAP.md) — этапы и статус
- [LOG.md](./LOG.md) — журнал исполнения

## ADR (кратко)

- **Источник правил:** `public.reminder_rules` (webapp); integrator `user_reminder_rules` — для dispatch/planning; снят `UNIQUE(user_id, category)` — конфликт по `id` (PK).
- **Mute:** `platform_users.reminder_muted_until`
- **Расписание:** `schedule_type` + `schedule_data` JSONB (`slots_v1`)
- **Тихие часы:** `quiet_hours_start_minute` / `quiet_hours_end_minute` (минуты локального дня правила; учитываются при планировании и на главной в счётчиках/«следующее»)
- **Rehab:** `linked_object_type=rehab_program`, `reminder_intent`, опционально `display_title` / `display_description`
- **Главная `n/N`:** граница календарного дня — **часовой пояс отображения приложения** (как на главной); слоты каждого правила считаются в его **`timezone`**; **`n`** — записи журнала `done` / `skipped` с `created_at` в том же календарном дне приложения.
- **Главная — цель прогресса за день (`practiceTarget`, patient tier):** если есть **включённое** напоминание на CMS-раздел разминок (`content_section`, slug после резолва как на экране напоминаний), знаменатель цели = сумма запланированных домашних напоминаний за календарный день; иначе знаменатель = **`patient_home_daily_practice_target`** (`system_settings`, см. [`CONFIGURATION_ENV_VS_DATABASE.md`](../../../ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md)). При активном **`reminder_muted_until`** план на день и цель для блока прогресса обнуляются, строки разбивки «разминок / ЛФК» не показываются. Детали реализации: [`patient-home.md`](../../../../apps/webapp/src/modules/patient-home/patient-home.md).
- **Telegram callback ≤64B**; custom snooze/mute — deeplink в webapp

## Cross-links

- План реализации (базовый): `.cursor/plans/archive/reminder_ux_full.plan.md` (не редактировать здесь)
- **Дефолты rehab / офисный день / цель на главной / разбивка прогресса (2026-05-15):** [`.cursor/plans/archive/reminder_defaults_and_home_goal.plan.md`](../../../../.cursor/plans/archive/reminder_defaults_and_home_goal.plan.md) — журнал в [LOG.md](./LOG.md) §2026-05-15
- Усиленный UX-план (блоки, план, интервал): см. выполнение в [LOG.md](./LOG.md) §2026-05-09 — аудит
- **Темы рассылок × reminder-движок (`notification_topic_code`):** [NOTIFICATION_TOPIC_ALIGNMENT.md](./NOTIFICATION_TOPIC_ALIGNMENT.md) и [LOG.md](./LOG.md) §2026-05-10
- Оглавление docs: [docs/README.md](../../README.md)
