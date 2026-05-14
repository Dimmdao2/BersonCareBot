---
name: Warmup feeling + UX
overview: Компактная hero и порядок блоков на экране разминки; модалка «ощущения после разминки» без кнопки «Пропустить»; двухшаговый POST completion → PATCH feeling + запись symptom_entries через системный tracking warmup_feeling (по паттерну 0049); редирект на главную; без правил 10/60 мин.
status: completed
todos:
  - id: ux-warmup-page
    content: "page.tsx: компактная hero + порядок видео → PatientContentPracticeComplete → описание; Markdown 14px #3a3f53 для разминки"
    status: completed
  - id: modal-flow
    content: "PatientContentPracticeComplete: POST→PATCH только daily_warmup; заголовок модалки; убрать Пропустить; редирект; защита от двойного клика CTA"
    status: completed
  - id: db-warmup
    content: "Миграция по образцу 0049_wellbeing_symptom_unify.sql: reference_items warmup_feeling + backfill symptom_trackings; дедуп completion↔symptom"
    status: completed
  - id: port-api
    content: Расширить PatientPracticePort (updateFeelingById/getByIdForUser) + PATCH route + оркестрация ensure tracking + symptom insert в транзакции
    status: completed
  - id: tests-docs
    content: Тесты (UI/API/repo), docs + LOG; финальный pnpm run ci перед merge
    status: completed
isProject: false
---

# План: самочувствие после разминки + UX экрана материала

## Связь с унификацией mood → symptom

- Референс реализации в репозитории: [`apps/webapp/db/drizzle-migrations/0049_wellbeing_symptom_unify.sql`](apps/webapp/db/drizzle-migrations/0049_wellbeing_symptom_unify.sql).
- Для `warmup_feeling` повторяем паттерн 0049:
  - системный `reference_items` с категорией `symptom_type`;
  - backfill `symptom_trackings` для `platform_users.role='client'` и `merged_into_id IS NULL`;
  - идемпотентность через `NOT EXISTS`.
- Правила **10 / 60 мин** и **`intent`** из плана mood-to-symptom к разминке **не применять**.

## Продуктовые правила

- Симптом пишется только после выбора иконки и успешного `PATCH`.
- Дедуп: одна строка [`patient_practice_completions`](apps/webapp/db/schema/patientPractice.ts) соответствует максимум одной строке в [`symptom_entries`](apps/webapp/db/schema/schema.ts) для `warmup_feeling`.
- Закрытие модалки без выбора (крестик/overlay) не создаёт symptom entry.
- После успешного выбора иконки — `router.push(routePaths.patient)`.

## Часть A — UX страницы контента (`from=daily_warmup`)

Файлы:
- [`apps/webapp/src/app/app/patient/content/[slug]/page.tsx`](apps/webapp/src/app/app/patient/content/[slug]/page.tsx)
- [`apps/webapp/src/app/app/patient/content/[slug]/PatientDailyWarmupHeroCover.tsx`](apps/webapp/src/app/app/patient/content/[slug]/PatientDailyWarmupHeroCover.tsx)

Шаги:
- Сделать hero для `daily_warmup` компактнее (ниже высота, меньше текстовая колонка и image-slot).
- Переставить блоки только для `daily_warmup`: hero → видео → `PatientContentPracticeComplete` → описание.
- Для описания разминки использовать `MarkdownContent` с `text-[14px] text-[#3a3f53]` и нормальным весом `strong/b`.

Проверки этапа:
- `rg "daily_warmup" apps/webapp/src/app/app/patient/content/[slug]/page.tsx`
- UI smoke маршрута `/app/patient/content/[slug]?from=daily_warmup`.

## Часть B — Клиент: модалка и двухшаговый поток

Файл:
- [`apps/webapp/src/app/app/patient/content/[slug]/PatientContentPracticeComplete.tsx`](apps/webapp/src/app/app/patient/content/[slug]/PatientContentPracticeComplete.tsx)

Шаги (только `practiceSource === 'daily_warmup'`):
- Клик по CTA: `POST /api/patient/practice/completion` с `feeling: null`, сохранить `completionId`, открыть модалку.
- Выбор иконки: `PATCH /api/patient/practice/completion/[id]/feeling`.
- Успех `PATCH`: закрыть модалку, редирект на `routePaths.patient`.
- Убрать кнопку «Пропустить»; оставить закрытие крестиком/overlay.
- Защитить от двойного POST (disabled/saving state).

Для других источников (`section_page`, `home`, `reminder`) оставить текущий одношаговый сценарий.

Проверки этапа:
- Обновить [`apps/webapp/src/app/app/patient/content/[slug]/PatientContentPracticeComplete.test.tsx`](apps/webapp/src/app/app/patient/content/[slug]/PatientContentPracticeComplete.test.tsx):
  - нет кнопки «Пропустить»;
  - два fetch для `daily_warmup`;
  - редирект после выбора иконки.

## Часть C — Сервер и данные

### C1. Миграция SQL

- Новый migration-файл по образцу 0049:
  - insert `reference_items` (`symptom_type`, `warmup_feeling`);
  - backfill `symptom_trackings` (`symptom_key='warmup_feeling'`) для client пользователей;
  - идемпотентность через `ON CONFLICT`/`NOT EXISTS`.

### C2. Дедуп симптом ↔ completion

- Предпочтительный вариант: nullable колонка `patient_practice_completion_id` в `symptom_entries` + FK на `patient_practice_completions(id)` + unique индекс для NOT NULL.
- Запасной вариант (если DDL отложен): идемпотентность в сервисе, но как временная мера с явным TODO на схему.

### C3. Расширение порта выполнения практики

- В [`apps/webapp/src/modules/patient-practice/ports.ts`](apps/webapp/src/modules/patient-practice/ports.ts) добавить:
  - `getByIdForUser(completionId, userId)` для авторизации/проверки `source`;
  - `updateFeelingById(completionId, userId, feeling)`.
- Реализация в [`apps/webapp/src/infra/repos/pgPatientPracticeCompletions.ts`](apps/webapp/src/infra/repos/pgPatientPracticeCompletions.ts) через Drizzle.

### C4. Оркестрация PATCH и симптом

- Новый route:
  - [`apps/webapp/src/app/api/patient/practice/completion/[id]/feeling/route.ts`](apps/webapp/src/app/api/patient/practice/completion/[id]/feeling/route.ts)
  - Guard: `requirePatientApiBusinessAccess`
  - Zod: `feeling` (1/3/5 или 1..5 по финальному UX)
- На сервере:
  - проверить владельца completion и `source === 'daily_warmup'`;
  - в транзакции: update `patient_practice_completions.feeling` + ensure tracking + insert `symptom_entries` с дедупом;
  - `revalidatePath(routePaths.patient)`.
- Повторный PATCH должен быть идемпотентным (`ok` + метка duplicate или same_result).

### C5. Тесты

- API:
  - [`apps/webapp/src/app/api/patient/practice/completion/route.test.ts`](apps/webapp/src/app/api/patient/practice/completion/route.test.ts) — текущий POST без регрессий;
  - новый `route.test.ts` для PATCH: success/foreign/not_daily_warmup/double_patch.
- Repo:
  - тесты `getByIdForUser` и `updateFeelingById`.
- UI:
  - тест модалки для `daily_warmup`.

## Scope границы (разрешено трогать)

- `apps/webapp/db/drizzle-migrations/**`, при необходимости `db/schema/**`
- `apps/webapp/src/modules/patient-practice/**`, `apps/webapp/src/app/api/patient/practice/**`
- `apps/webapp/src/modules/diaries/**`, `infra/repos/pgSymptomDiary.ts` — точечно (`ensure`/`addEntry`/`transaction` если нужно)
- `apps/webapp/src/app-layer/di/buildAppDeps.ts` — регистрация зависимостей
- `apps/webapp/src/app/app/patient/content/[slug]/**`
- Документация: [`patient-practice.md`](apps/webapp/src/modules/patient-practice/patient-practice.md)

Вне scope:
- интегратор и bot-flows;
- новые env переменные;
- изменения GitHub workflow;
- общее `general_wellbeing` поведение.

## Execution log (обязательно в ходе реализации)

- Вести лог в [`docs/APP_RESTRUCTURE_INITIATIVE/LOG.md`](docs/APP_RESTRUCTURE_INITIATIVE/LOG.md):
  - что сделано по каждому этапу;
  - какие проверки выполнены;
  - какие решения приняты (например выбор варианта дедупа);
  - что сознательно не делали и почему.

## Definition of Done

1. Экран разминки: компактная hero, порядок видео → кнопка → описание; типографика описания как выше.
2. Модалка только для сценария разминки: текст заголовка; нет «Пропустить»; закрытие без симптома допустимо.
3. После иконки: в БД completion с заполненным `feeling`; ровно одна запись симптома на этот completion в tracking `warmup_feeling`; редирект на главную.
4. Закрытие без иконки: completion с `feeling null`, симптом не создан.
5. Тесты PATCH и ключевой клиентский сценарий; **`pnpm run ci`** перед merge по [правилам репозитория](.cursor/rules/pre-push-ci.mdc).
