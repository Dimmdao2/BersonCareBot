# AUDIT_PHASE_5

## 1. Verdict: PASS

Phase 5 соответствует ТЗ инициативы ([README § Phase 5](README.md)) по проверенным пунктам ниже.

### 1.1. `patient_practice_completions` и Drizzle schema

| Требование README §5.1 | Реализация |
|------------------------|------------|
| `id`, `user_id`, `content_page_id`, `completed_at` timestamptz, `source`, `feeling`, `notes` | [`apps/webapp/db/schema/patientPractice.ts`](../../apps/webapp/db/schema/patientPractice.ts), миграция [`0010_patient_practice_completions.sql`](../../apps/webapp/db/drizzle-migrations/0010_patient_practice_completions.sql) |
| Индексы `(user_id, completed_at desc)` и `(user_id, content_page_id)` | `idx_ppc_user_completed_desc`, `idx_ppc_user_page` |
| FK на `content_pages(id)` ON DELETE CASCADE | Drizzle `.references(() => contentPages.id, { onDelete: "cascade" })` + SQL `ALTER TABLE … FOREIGN KEY (content_page_id)` |
| Без FK на `users` для `user_id` | В миграции только `user_id uuid NOT NULL`, FK на `users` **нет** |
| CHECK по `source` и `feeling` | `ppc_source_check` (`home` \| `reminder` \| `section_page` \| `daily_warmup`), `ppc_feeling_check` (NULL или 1–5) |

### 1.2. `pgPatientPracticeCompletions` — только Drizzle

[`apps/webapp/src/infra/repos/pgPatientPracticeCompletions.ts`](../../apps/webapp/src/infra/repos/pgPatientPracticeCompletions.ts): `getDrizzle()`, `insert` / `select` / `where` / `orderBy` / `limit`. Вызовов `getPool`, `pool.query`, `client.query` **нет**. Для календарных дней и стрика используется Luxon с переданным `tz` поверх строк `completed_at` — без сырого SQL вне Drizzle-builder.

### 1.3. Изоляция модулей

В [`apps/webapp/src/modules/patient-practice/`](../../apps/webapp/src/modules/patient-practice/) **нет** импортов `@/infra/db/*` и `@/infra/repos/*`. Порты и типы в модуле; реализация в `infra` и wiring в [`buildAppDeps.ts`](../../apps/webapp/src/app-layer/di/buildAppDeps.ts) (`patientPractice` ← `createPatientPracticeService` с `completions` + `contentPages` для валидации страницы).

### 1.4. API routes — тонкие

- [`POST …/practice/completion`](../../apps/webapp/src/app/api/patient/practice/completion/route.ts): guard → parse JSON → Zod → `deps.patientPractice.record` → ответ / `revalidatePath`.
- [`GET …/practice/progress`](../../apps/webapp/src/app/api/patient/practice/progress/route.ts): guard → `getAppDisplayTimeZone` + настройка цели → `deps.patientPractice.getProgress` → JSON.

Бизнес-логика (проверка страницы, подсчёт дней, стрик) — в [`service.ts`](../../apps/webapp/src/modules/patient-practice/service.ts) и порте.

### 1.5. Стрик и timezone

- [`streakLogic.ts`](../../apps/webapp/src/modules/patient-practice/streakLogic.ts): `computePracticeStreak` якорит «сегодня» / «вчера» в `tz`, идёт назад по календарным датам в зоне.
- PG-порт: `DateTime.now().setZone(tz)`, фильтрация по UTC-окну и маппинг `completed_at` → локальная дата в `tz` для `countToday` и множества дат для стрика.

### 1.6. UI: кнопка, прогресс, источник без slug из CONTENT_PLAN

- [`PatientContentPracticeComplete.tsx`](../../apps/webapp/src/app/app/patient/content/[slug]/PatientContentPracticeComplete.tsx): кнопка «Я выполнил(а) практику», диалог с оценкой 1–5 и «Пропустить», `POST /api/patient/practice/completion`.
- [`page.tsx`](../../apps/webapp/src/app/app/patient/content/[slug]/page.tsx): `practiceSource = from === "daily_warmup" ? "daily_warmup" : "section_page"` — маркер потока из query, **не** редакционный slug из [`CONTENT_PLAN.md`](CONTENT_PLAN.md).
- [`PatientHomeDailyWarmupCard.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeDailyWarmupCard.tsx): ссылка с `?from=daily_warmup`, slug страницы из данных блока (`page.slug`), не из CONTENT_PLAN.
- [`PatientHomeToday.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx): при `personalTierOk && session` — `getAppDisplayTimeZone()` + `deps.patientPractice.getProgress(…, tz, todayCfg.practiceTarget)`.
- [`PatientHomeProgressBlock.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeProgressBlock.tsx): реальные `todayDone` / цель (`practiceTarget`) / `streak`; гость и без tier — плашки без персональных данных.

### 1.7. Дневники симптомов / ЛФК

Изменения Phase 5 по текущему дереву не затрагивают артефакты дневников (например [`pgSymptomDiary.ts`](../../apps/webapp/src/infra/repos/pgSymptomDiary.ts), [`lfkDiary.ts`](../../apps/webapp/src/infra/repos/lfkDiary.ts), [`LfkDiarySectionClient.tsx`](../../apps/webapp/src/app/app/patient/diary/lfk/LfkDiarySectionClient.tsx)); последние коммиты по этим файлам не относятся к Phase 5. Связки completions ↔ LFK-сессии не добавлялись.

### 1.8. Нет хардкода slug-ов из CONTENT_PLAN.md

Выборочная проверка редакционных slug из таблиц CONTENT_PLAN по [`modules/patient-practice`](../../apps/webapp/src/modules/patient-practice), [`PatientHomeDailyWarmupCard.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeDailyWarmupCard.tsx), [`content/[slug]`](../../apps/webapp/src/app/app/patient/content): совпадений **нет**. Строка `daily_warmup` — допустимое значение поля `source` и query-параметра по README, не slug материала из CONTENT_PLAN.

---

## 2. Mandatory fixes

None.

---

## 3. Minor notes

1. **Guard в README §5.3:** указано `requirePatientAccessWithPhone`; в коде API используется [`requirePatientApiBusinessAccess`](../../apps/webapp/src/app/api/patient/practice/completion/route.ts) — единый паттерн patient API после Phase 4.5 (бизнес-доступ пациента). Функционально строже/шире по политике платформы; расхождение только в имени в README.

2. **README §5.5:** добавлен [`pgPatientPracticeCompletions.test.ts`](../../apps/webapp/src/infra/repos/pgPatientPracticeCompletions.test.ts) — smoke на отсутствие raw pool/query в PG-репозитории и базовые сценарии in-memory порта.

3. **Текст кнопки:** в README приведён вариант «Готово»; в UI — «Я выполнил(а) практику» (соответствует EXEC-промпту Phase 5).

---

## 4. Tests reviewed/run

### Reviewed (Phase 5)

- [`apps/webapp/src/modules/patient-practice/service.test.ts`](../../apps/webapp/src/modules/patient-practice/service.test.ts)
- [`apps/webapp/src/modules/patient-practice/streakLogic.test.ts`](../../apps/webapp/src/modules/patient-practice/streakLogic.test.ts)
- [`apps/webapp/src/infra/repos/pgPatientPracticeCompletions.test.ts`](../../apps/webapp/src/infra/repos/pgPatientPracticeCompletions.test.ts)
- [`apps/webapp/src/app/api/patient/practice/completion/route.test.ts`](../../apps/webapp/src/app/api/patient/practice/completion/route.test.ts)
- [`apps/webapp/src/app/api/patient/practice/progress/route.test.ts`](../../apps/webapp/src/app/api/patient/practice/progress/route.test.ts)
- [`apps/webapp/src/app/app/patient/home/PatientHomeProgressBlock.test.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeProgressBlock.test.tsx)
- [`apps/webapp/src/app/app/patient/home/PatientHomeDailyWarmupCard.test.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeDailyWarmupCard.test.tsx)
- [`apps/webapp/src/app/app/patient/home/PatientHomeToday.test.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeToday.test.tsx)
- [`apps/webapp/src/app/app/patient/content/[slug]/PatientContentPracticeComplete.test.tsx`](../../apps/webapp/src/app/app/patient/content/[slug]/PatientContentPracticeComplete.test.tsx)

### Executed during audit

Command:

`pnpm --dir apps/webapp exec vitest run src/modules/patient-practice/service.test.ts src/modules/patient-practice/streakLogic.test.ts src/infra/repos/pgPatientPracticeCompletions.test.ts src/app/api/patient/practice/completion/route.test.ts src/app/api/patient/practice/progress/route.test.ts src/app/app/patient/home/PatientHomeProgressBlock.test.tsx src/app/app/patient/home/PatientHomeDailyWarmupCard.test.tsx src/app/app/patient/home/PatientHomeToday.test.tsx "src/app/app/patient/content/[slug]/PatientContentPracticeComplete.test.tsx"`

Result:

- `Test Files 9 passed (9)`
- `Tests 24 passed (24)`

---

## 5. Confirmation checklist (audit prompt)

| Пункт | Статус |
|-------|--------|
| `patient_practice_completions` соответствует ТЗ | PASS (§1.1) |
| `pgPatientPracticeCompletions` — Drizzle, не pool/query | PASS (§1.2) |
| Нет FK на `users` | PASS (§1.1) |
| CHECK для `source` и `feeling` | PASS (§1.1) |
| Module isolation | PASS (§1.3) |
| API routes тонкие | PASS (§1.4) |
| Стрик учитывает timezone | PASS (§1.5) |
| Кнопка выполнения + feeling/skip | PASS (§1.6) |
| ProgressBlock — реальные данные | PASS (§1.6) |
| Дневники не изменены | PASS (§1.7) |
| Нет slug hardcode из CONTENT_PLAN | PASS (§1.8) |
| Тесты Phase 5 есть и проходят | PASS (§4) |

---

**Вывод:** Phase 5 проходит аудит. Обязательных исправлений нет.
