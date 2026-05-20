# LOG — разминка дня: напоминания, shell, pager

## Сделано

1. **Напоминания → разминка дня:** `resolveReminderIntentForLinkedObject`, `createObjectReminder` пишет `warmup` для раздела warmups; fallback в `buildReminderDeepLink` (webapp + integrator); SQL `0077_reminder_warmup_intent_backfill`.
2. **Shell:** `from=daily_warmup` — back на `/app/patient`, без «Назад к разделу»; убран `SectionWarmupsReminderBar` с `/sections/warmups`.
3. **Pager:** `listDailyWarmupPagesForHome`, `PatientDailyWarmupPager` под hero («Разминка дня n/N», список блока `daily_warmup`).

## Аудит (доработки)

- Напоминания: `warmupsSectionSlug` в `RemindersPageBody` / `ReminderRulesClient` (`isWarmupsContentSectionReminderRule`).
- Deeplink: `warmupsSectionSlugs` / `buildReminderDeepLinkAsync`, projection + web-push tick.
- Pager: `sticky top-0 z-[5]`.

## Проверки

- `vitest`: `resolveReminderIntentForLinkedObject.test.ts`, `buildReminderDeepLink.test.ts`, `service.test.ts` (warmup create), `todayConfig.dailyWarmupList.test.ts`, `PatientDailyWarmupPager.test.tsx`, `page.warmupsGate.test.tsx`, integrator `buildPatientReminderDeepLink.test.ts`
- Финал: `pnpm run ci`

## Backlog (не в scope)

- Настройка «K разминок в день» (отдельный ключ, не `patient_home_daily_practice_target`)
- Pager только по «сегодняшнему» подмножеству / рандом / регионы у материалов
