# LOG — daily warmup UX (rotation, layout, quick list, feedback)

**Канон runtime (pick, API, UI):** [`apps/webapp/src/modules/patient-home/patient-home.md`](../../apps/webapp/src/modules/patient-home/patient-home.md).

## Сделано (2026-06-09) — scheduled rotation + completion advance

### Поведение
- **Автосмена:** 1–3 слота/сутки (`patient_home_daily_warmup_rotation_*`), TZ пациента; lazy sync при pick/read.
- **Manual:** видео или completion `daily_warmup` сдвигают круг (CAS: только если anchor === presented); skip одной следующей scheduled-смены.
- **Fallback:** без presented — следующая после last completed (не та же).
- **Деплой:** backfill `last_rotation_at` без ретро-слотов.

### Код
- Migration `0110_patient_daily_warmup_rotation_state.sql`; `ensureDailyWarmupPresentationSynced`, `advanceDailyWarmupPresentationManually`, `PatientHomeDailyWarmupRotationPanel`.
- Legacy `advanceDailyWarmupPresentationAfterVideoView` удалён; runtime — только `advanceDailyWarmupPresentationManually`.

### Пост-аудит (тот же день)
- JSDoc `todayConfig`, deprecated-комментарий `skip_to_next` в `types.ts`, `api.md` §completion, doctor UI панелей на `/app/doctor/patient-home`.
- `buildPatientHomeWarmupPickContext` без legacy `getPresentedContentPageId`; push loader опирается на `presentationSyncDeps`.

### Проверки
- Targeted vitest: slot/sync/CAS modules, `todayConfig` (с `presentationSyncDeps`), go/push, completion/video-viewed routes, admin settings PATCH; `pnpm run ci`.

## Сделано (2026-05-28) — ротация после просмотра видео *(superseded 2026-06-09)*

Исторический baseline до scheduled rotation. Актуальное поведение — §2026-06-09 и [`patient-home.md`](../../apps/webapp/src/modules/patient-home/patient-home.md).

### Поведение (на момент 2026-05-28)
- Presented после `video-viewed`; fallback без строки — last completed (та же страница).
- Completion не сдвигал pick.

### Код / DDL (на момент 2026-05-28)
- Migration `0084`; `advanceDailyWarmupPresentationAfterVideoView` (удалён в 2026-06-09), `recordDailyWarmupVideoView`, `PatientDailyWarmupVideoEngagement`.

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
