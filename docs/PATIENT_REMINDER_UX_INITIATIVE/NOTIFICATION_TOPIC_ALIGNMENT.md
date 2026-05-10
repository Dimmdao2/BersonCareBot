# Выравнивание тем уведомлений и reminder-движка

Связка id тем из `notifications_topics` с доставкой integrator через колонку **`notification_topic_code`** на правиле (`public.reminder_rules` / `integrator.user_reminder_rules`), без расширения `REMINDER_CATEGORIES`.

## Полный план и аудит

- Полный текст плана (YAML + фазы + пост-аудит): [notification_topic_alignment_7fbdf2af.plan.md](./notification_topic_alignment_7fbdf2af.plan.md) в репозитории; зеркало в Cursor: `~/.cursor/plans/notification_topic_alignment_7fbdf2af.plan.md`.
- Краткий конспект: этот файл.
- Журнал: [LOG.md](./LOG.md) (§ 2026-05-10 пост-аудит).

## Миграции

| БД | Файл |
|----|------|
| Webapp `public.reminder_rules` | `apps/webapp/db/drizzle-migrations/0054_reminder_rules_notification_topic_code.sql` |
| Integrator `user_reminder_rules` | `apps/integrator/src/infra/db/migrations/core/20260510_0001_user_reminder_rules_notification_topic_code.sql` |

## Ключевые модули

- Маппинг webapp: `apps/webapp/src/modules/reminders/notificationTopicCode.ts`
- Диспатч integrator: `apps/integrator/src/kernel/domain/reminders/reminderNotificationTopicCode.ts`
- Rubitime слот-напоминания: `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts` (`topic=appointment_reminders`)
- Read-through HTTP: `apps/integrator/src/infra/adapters/remindersReadsPort.ts`

Архитектурный контекст: [CONFIGURATION_ENV_VS_DATABASE.md](../ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md) § «Уведомления: тема × канал».
