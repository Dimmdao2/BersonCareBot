# AUDIT_PHASE_6

## 1. Verdict: PASS

Phase 6 соответствует ТЗ инициативы ([README § Phase 6](README.md)) по проверенным пунктам ниже.

### 1.1. `patient_daily_mood` соответствует ТЗ

Реализация:

- Drizzle schema: [`apps/webapp/db/schema/patientDailyMood.ts`](../../apps/webapp/db/schema/patientDailyMood.ts).
- SQL migration: [`apps/webapp/db/drizzle-migrations/0011_patient_daily_mood.sql`](../../apps/webapp/db/drizzle-migrations/0011_patient_daily_mood.sql).

Проверено:

- Таблица называется `patient_daily_mood`.
- `user_id uuid NOT NULL`.
- `mood_date date NOT NULL`.
- `score smallint NOT NULL`.
- `created_at` / `updated_at` — `timestamp with time zone DEFAULT now() NOT NULL`.
- Primary key: `(user_id, mood_date)`.
- CHECK: `pdm_score_check` (`score >= 1 AND score <= 5`).
- FK на `users` не добавлен, что соответствует правилам инициативы.
- Rollback добавлен в [`ROLLBACK_SQL.md`](ROLLBACK_SQL.md).

### 1.2. `pgPatientDailyMood` использует Drizzle ORM

[`apps/webapp/src/infra/repos/pgPatientDailyMood.ts`](../../apps/webapp/src/infra/repos/pgPatientDailyMood.ts):

- использует `getDrizzle()`;
- использует Drizzle `insert`, `onConflictDoUpdate`, `returning`, `select`, `where`;
- не использует `getPool`, `pool.query`, `client.query`;
- upsert идёт по target `[patientDailyMood.userId, patientDailyMood.moodDate]`, поэтому повторная отметка за день перезаписывает score.

Статическая проверка через `rg` и тест [`pgPatientDailyMood.test.ts`](../../apps/webapp/src/infra/repos/pgPatientDailyMood.test.ts) подтверждают отсутствие raw pool/query.

### 1.3. `mood_date` считается по app timezone

Реализация:

- [`moodDate.ts`](../../apps/webapp/src/modules/patient-mood/moodDate.ts): `DateTime.now().setZone(tz).toISODate()`.
- [`service.ts`](../../apps/webapp/src/modules/patient-mood/service.ts): `upsertToday` и `getToday` сначала вычисляют `moodDate` через `getMoodDateForTimeZone(tz)`, затем вызывают порт.
- [`POST /api/patient/mood`](../../apps/webapp/src/app/api/patient/mood/route.ts) и [`GET /api/patient/mood/today`](../../apps/webapp/src/app/api/patient/mood/today/route.ts) получают timezone через `getAppDisplayTimeZone()`.
- [`PatientHomeToday.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx) также использует `getAppDisplayTimeZone()` для initial mood на главной.

Тест [`moodDate.test.ts`](../../apps/webapp/src/modules/patient-mood/moodDate.test.ts) проверяет разные календарные даты для `Europe/Moscow` и `America/New_York` на одном UTC timestamp.

### 1.4. Score `1..5` enforced

Enforcement слои:

- DB CHECK `pdm_score_check` в schema и migration.
- Типы: [`PATIENT_MOOD_SCORES`](../../apps/webapp/src/modules/patient-mood/types.ts) = `[1, 2, 3, 4, 5]`.
- Service validation: [`service.ts`](../../apps/webapp/src/modules/patient-mood/service.ts) отклоняет нецелые и вне диапазона значения.
- API validation: [`route.ts`](../../apps/webapp/src/app/api/patient/mood/route.ts) — `z.number().int().min(1).max(5)`.
- UI: [`PatientHomeMoodCheckin.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeMoodCheckin.tsx) рендерит ровно 5 score options.

### 1.5. Module isolation соблюдён

[`apps/webapp/src/modules/patient-mood/`](../../apps/webapp/src/modules/patient-mood/) содержит только:

- `ports.ts`;
- `service.ts`;
- `types.ts`;
- `moodDate.ts`;
- `patient-mood.md`;
- tests.

Статическая проверка не нашла импортов `@/infra/db/*`, `@/infra/repos/*`, `getPool`, `pool.query`, `client.query` внутри модуля. Порт определён в module layer, PG/in-memory реализации находятся в `infra/repos`.

### 1.6. API routes тонкие

[`POST /api/patient/mood`](../../apps/webapp/src/app/api/patient/mood/route.ts):

- guard `requirePatientApiBusinessAccess`;
- JSON parse;
- Zod validation;
- `getAppDisplayTimeZone`;
- service call `deps.patientMood.upsertToday`;
- `revalidatePath(routePaths.patient)`;
- JSON response.

[`GET /api/patient/mood/today`](../../apps/webapp/src/app/api/patient/mood/today/route.ts):

- guard;
- `getAppDisplayTimeZone`;
- service call `deps.patientMood.getToday`;
- JSON response.

Бизнес-логика даты и upsert находится в service/repo, не в route handlers.

### 1.7. UI сохраняет и перезаписывает score

[`PatientHomeMoodCheckin.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeMoodCheckin.tsx):

- для guest показывает login prompt;
- для пользователя без patient tier показывает activation copy;
- для patient tier рендерит 5 emoji-кнопок;
- подсвечивает `initialMood.score` через `aria-pressed`;
- отправляет `POST /api/patient/mood` с `{ score }`;
- делает optimistic update;
- на успешный ответ обновляет saved score и вызывает `router.refresh()`;
- на ошибку откатывает previous score и показывает toast.

Повторное сохранение того же дня идёт через API → service → `pgPatientDailyMood.upsertForDate` → `onConflictDoUpdate`, то есть score перезаписывается по `(user_id, mood_date)`.

### 1.8. Нет связи с symptom diary

В Phase 6 нет вызовов symptom diary / LFK diary из `modules/patient-mood`, mood API routes или `pgPatientDailyMood`.

Найденные broad-search совпадения по `symptom` относятся к существующим diary-сервисам и `buildAppDeps` до Phase 6; новые mood-файлы не пишут в symptom diary и не читают из него. Документация модуля явно фиксирует отсутствие связи: [`patient-mood.md`](../../apps/webapp/src/modules/patient-mood/patient-mood.md).

### 1.9. Нет slug hardcode из `CONTENT_PLAN.md`

Проверка по известным редакционным slug-ам (`office-work`, `face-self-massage`, `office-neck`, `neck-shoulders`, `back-low-back`, `pain-now`, `back-and-neck-recovery` и др.) не обнаружила совпадений в Phase 6 runtime-коде.

Broad-search по всему `apps/webapp/src` даёт только legacy/fixture совпадения вне Phase 6 (`breathing-reset` в старом content-catalog/lessons), не связанные с mood.

---

## 2. Mandatory fixes

None.

---

## 3. Minor notes

1. `GET /api/patient/mood/today` возвращает `200 { ok: true, mood: null }`, если за сегодня записи нет. Это не конфликтует с README §6.3, где контракт не детализирован, и упрощает клиентскую обработку.
2. `PatientHomeMoodCheckin` использует client component для всего блока. Это приемлемо: guest/onboarding copy остаётся неперсональным, а персональная загрузка initial mood выполняется в `PatientHomeToday` только при `personalTierOk && session`.

---

## 4. Tests reviewed/run

Reviewed:

- [`apps/webapp/src/modules/patient-mood/moodDate.test.ts`](../../apps/webapp/src/modules/patient-mood/moodDate.test.ts)
- [`apps/webapp/src/modules/patient-mood/service.test.ts`](../../apps/webapp/src/modules/patient-mood/service.test.ts)
- [`apps/webapp/src/infra/repos/pgPatientDailyMood.test.ts`](../../apps/webapp/src/infra/repos/pgPatientDailyMood.test.ts)
- [`apps/webapp/src/app/api/patient/mood/route.test.ts`](../../apps/webapp/src/app/api/patient/mood/route.test.ts)
- [`apps/webapp/src/app/api/patient/mood/today/route.test.ts`](../../apps/webapp/src/app/api/patient/mood/today/route.test.ts)
- [`apps/webapp/src/app/app/patient/home/PatientHomeMoodCheckin.test.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeMoodCheckin.test.tsx)
- [`apps/webapp/src/app/app/patient/home/PatientHomeToday.test.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeToday.test.tsx)

Executed during audit:

```bash
pnpm --dir apps/webapp exec vitest run src/modules/patient-mood/moodDate.test.ts src/modules/patient-mood/service.test.ts src/infra/repos/pgPatientDailyMood.test.ts src/app/api/patient/mood/route.test.ts src/app/api/patient/mood/today/route.test.ts src/app/app/patient/home/PatientHomeMoodCheckin.test.tsx src/app/app/patient/home/PatientHomeToday.test.tsx
```

Result:

- `Test Files 7 passed (7)`
- `Tests 20 passed (20)`

---

## 5. Confirmation checklist

- `patient_daily_mood` соответствует ТЗ: PASS.
- `pgPatientDailyMood` — Drizzle ORM, не pool/query: PASS.
- `mood_date` считается по app timezone: PASS.
- `score 1..5` enforced: PASS.
- Module isolation: PASS.
- API routes тонкие: PASS.
- UI сохраняет/перезаписывает score: PASS.
- Нет связи с symptom diary: PASS.
- Нет slug hardcode: PASS.
- Тесты Phase 6 есть и проходят: PASS.

---

**Вывод:** Phase 6 проходит аудит. Обязательных исправлений нет.
