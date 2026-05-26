# LOG — daily warmup UX (rotation, layout, quick list, feedback)

## Сделано (2026-05-26)

### Pick / rotation
- Убрана weekday-ротация; `pickDailyWarmupFromOrderedList` — round-robin от последнего `daily_warmup` completion (patient tier).
- Guest / no tier → первая по `sortOrder`; без `patientPractice` для pick.
- Единый pick: главная, `/app/patient/go/daily-warmup`, push title.

### Warmup layout
- Membership в блоке `daily_warmup` задаёт `practiceSource`, warmup chrome, back matrix.
- Query `?from=daily_warmup` — только навигация back, не layout.

### Quick list
- `PatientDailyWarmupQuickList` на detail после rating; pager сохранён.

### Feedback (patient)
- Таблица `patient_content_rating_feedback` (migration `0079`).
- Модуль `material-rating-feedback`; `POST /api/patient/material-ratings/feedback`.
- Modal после star rating 1–3; skip/close/outside — без сохранения feedback.
- Feeling flow после completion не менялся.

### Feedback (doctor)
- Read-only блок на `/app/doctor/material-ratings/content_page/[id]`: counts по reason codes + recent comments.

### Cooldown cleanup
- Hero «Разминка выполнена» только при `dailyWarmupCount === 1` (`dailyWarmupHeroCooldownGate.ts`).
- Admin: подпись «только при одной разминке»; legacy `skip_to_next` не в UI и не в save action (ключ в DB/read-only compat).

### Polish (2026-05-26, финал)
- Удалены deprecated поля `allDailyWarmupsInCooldown` / aggregate hero без страницы.
- `savePatientHomeRepeatCooldownsAction` — только 2 cooldown-ключа.
- Тесты: gate n===1, CTA при n≥2 + cooldown, click-outside feedback dialog.

## Проверки

- Targeted vitest: pick, todayConfig, page.warmupMembership, quick list, feedback API/dialog/service, doctor panel, MaterialRatingBlock hook, dailyWarmupHeroCooldownGate.
- Финал: `pnpm run ci`

## Не делали

- Like/dislike/favorite; rotation по ratings.
- Изменение feeling modal.

## Предыдущий LOG (shell, pager, reminders)

1. **Напоминания → разминка дня:** `resolveReminderIntentForLinkedObject`, SQL `0077_reminder_warmup_intent_backfill`.
2. **Shell:** `from=daily_warmup` — back на `/app/patient`.
3. **Pager:** `listDailyWarmupPagesForHome`, `PatientDailyWarmupPager`.
