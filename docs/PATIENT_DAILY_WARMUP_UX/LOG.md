# LOG — daily warmup UX (rotation, layout, quick list, feedback)

**Канон runtime (pick, API, UI):** [`apps/webapp/src/modules/patient-home/patient-home.md`](../../apps/webapp/src/modules/patient-home/patient-home.md).

## Сделано (2026-05-28) — ротация после просмотра видео

### Поведение
- **Главная (patient tier):** показывается **presented** (`patient_daily_warmup_presentations.content_page_id`) или, если записи нет, **последняя выполненная** `daily_warmup` (та же страница, не «следующая» после completion).
- **Push-напоминание:** заголовок и deeplink — **следующая** разминка после текущей главной (`resolveDailyWarmupPickIndex` с consumer `push_reminder`); `/app/patient/go/daily-warmup?from=reminder` → push pick, без `from=reminder` / CTA с главной → home pick.
- **Сдвиг ротации:** после первого воспроизведения видео (событие `playing` в `PatientMediaPlaybackVideo`) или клика по hosted iframe — `POST /api/patient/daily-warmup/video-viewed` → presented = следующая после просмотренной страницы; `revalidatePath(/app/patient)` + `router.refresh` на клиенте.
- **Completion** по-прежнему пишет `patient_practice_completions`, но **не** меняет pick на главной.

### Код / DDL
- Таблица `patient_daily_warmup_presentations` (migration `0084_patient_daily_warmup_presentations.sql`).
- Модули: `resolveDailyWarmupHomePickIndex`, `advanceDailyWarmupPresentationAfterVideoView`, `recordDailyWarmupVideoView`, `buildPatientHomeWarmupPickContext`; порт `patientDailyWarmupPresentation` в `buildAppDeps`.
- UI: `PatientDailyWarmupVideoEngagement` на странице разминки (`isDailyWarmup`).

### Проверки
- Targeted vitest: `todayConfig`, `resolveDailyWarmupHomePickIndex`, `advanceDailyWarmupPresentationAfterVideoView`, `loadWarmupPushDynamicContext`, `resolvePatientReminderGoTargets`, `video-viewed/route`, `PatientHomeToday`.

## Сделано (2026-05-26)

### Pick / rotation (superseded для patient tier — см. 2026-05-28)
- Убрана weekday-ротация; round-robin от completion заменён на presented + video-viewed (2026-05-28).
- Guest / no tier → первая по `sortOrder`; без `patientPractice` для pick.
- `pickDailyWarmupFromOrderedList` — «следующая после anchor» (push pick и сдвиг после видео).

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
