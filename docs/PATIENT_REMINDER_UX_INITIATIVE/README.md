# Patient Reminder UX Initiative

**Статус: закрыта (2026-05-09).** Документы остаются в `docs/PATIENT_REMINDER_UX_INITIATIVE/` как нормативка по контракту напоминаний.

Напоминания для программы реабилитации: расписание `slots_v1`, intent/CTA, snooze 15/30, done, mute-all, синхронизация главной (`n из N`).

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
- **Telegram callback ≤64B**; custom snooze/mute — deeplink в webapp

## Cross-links

- План реализации: `.cursor/plans/reminder_ux_full.plan.md` (не редактировать здесь)
- Оглавление docs: [docs/README.md](../README.md)
