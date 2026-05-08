---
name: Warmup feeling + UX
overview: Компактная hero и порядок блоков на экране разминки; модалка «ощущения после разминки» без кнопки «Пропустить»; двухшаговый POST completion → PATCH feeling + запись symptom_entries через системный tracking warmup_feeling (как general_wellbeing в 0049); редирект на главную; без правил 10/60 мин.
todos:
  - id: ux-warmup-page
    content: "page.tsx: компактная hero + порядок видео → PatientContentPracticeComplete → описание; Markdown 14px #3a3f53 для разминки"
    status: pending
  - id: modal-flow
    content: "PatientContentPracticeComplete: POST→PATCH только daily_warmup; заголовок модалки; убрать Пропустить; редирект; защита от двойного клика CTA"
    status: pending
  - id: db-warmup
    content: "Миграция по образцу 0049_wellbeing_symptom_unify.sql: reference_items warmup_feeling + backfill symptom_trackings; дедуп completion↔symptом"
    status: pending
  - id: port-api
    content: "Расширить PatientPracticePort (updateFeelingById) + PATCH route + оркестрация diary ensure tracking + symptom insert в транзакции"
    status: pending
  - id: tests-docs
    content: "Тесты; patient-practice.md; pnpm run ci перед merge"
    status: pending
isProject: false
---

# План: самочувствие после разминки + UX экрана материала (редакция)

## Связь с унификацией mood → symptom

- Референс реализации в репозитории: миграция [`apps/webapp/db/drizzle-migrations/0049_wellbeing_symptom_unify.sql`](apps/webapp/db/drizzle-migrations/0049_wellbeing_symptom_unify.sql) — `reference_items` с `category_id` для `symptom_type`, код **`general_wellbeing`**, backfill **`symptom_trackings`** для `platform_users.role = 'client'` без `merged_into_id`, с **`NOT EXISTS`** дублей по `(platform_user_id, symptom_key)`.
- Для **`warmup_feeling`** повторить тот же шаблон: отдельная строка в `reference_items` (код `warmup_feeling`, заголовок продукта), затем **`INSERT ... SELECT ... WHERE NOT EXISTS`** в `symptom_trackings` с `symptom_key = 'warmup_feeling'` и `symptom_type_ref_id` на новый reference.
- Правила **10 / 60 мин** и **`intent`** из плана mood-to-symptom к разминке **не применять**.

## Продуктовые правила

| Тема | Решение |
|------|---------|
| Когда пишется симптом | Только если пользователь выбрал иконку после успешного второго шага (PATCH). |
| Дедуп | Одна строка [`patient_practice_completions`](apps/webapp/db/schema/patientPractice.ts) ↔ не более одной записи [`symptom_entries`](apps/webapp/db/schema/schema.ts), привязанной к этому completion (см. ниже технически). |
| Закрытие без оценки | Крестик / overlay Dialog — **без** обязательной записи ощущения; явную кнопку «Пропустить» убрать из [`PatientContentPracticeComplete.tsx`](apps/webapp/src/app/app/patient/content/[slug]/PatientContentPracticeComplete.tsx). |
| Редирект | После успешного выбора иконки — `router.push(routePaths.patient)` (главная пациента). |

## Часть A — UX страницы контента (`from=daily_warmup`)

Файлы: [`page.tsx`](apps/webapp/src/app/app/patient/content/[slug]/page.tsx), при необходимости константы рядом или в [`patientHomeCardStyles.ts`](apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts) **без** переноса home-only геометрии на другие экраны сверх обсуждённого.

1. **Hero ниже, обложка меньше**: компактная оболочка + колонка текста с уменьшенным `pr-*` под слот [`PatientDailyWarmupHeroCover.tsx`](apps/webapp/src/app/app/patient/content/[slug]/PatientDailyWarmupHeroCover.tsx); уменьшить резерв высоты при отсутствии summary.
2. **Порядок только для разминки**: Hero → видео → `PatientContentPracticeComplete` → тело (`MarkdownContent`). Для **`section_page`** оставить порядок hero → видео → описание → практика (минимальные изменения).
3. **Описание разминки**: передать в `MarkdownContent` классы `text-[14px] text-[#3a3f53]`, `[&_strong]:font-normal [&_b]:font-normal`, при необходимости `[&_h1]…[&_h3]:font-normal`, чтобы не повышать жирность сверх глобальных `.markdown-preview h1,h2,h3`.

Проверки: smoke `?from=daily_warmup`; при наличии — обновить/добавить узкий тест разметки.

## Часть B — Клиент: модалка и двухшаговый поток

Файл: [`PatientContentPracticeComplete.tsx`](apps/webapp/src/app/app/patient/content/[slug]/PatientContentPracticeComplete.tsx).

**Только `practiceSource === 'daily_warmup'`:**

1. По клику «Я выполнил(а) практику»: **`POST /api/patient/practice/completion`** с `feeling: null` → из ответа сохранить **`id`** ([уже возвращается](apps/webapp/src/app/api/patient/practice/completion/route.ts) `{ ok: true, id }`) → открыть модалку с заголовком вроде **«Как ощущения после разминки?»** (лаконично, без лишних подписей по правилам UI проекта).
2. По выбору иконки: **`PATCH`** (см. часть C) с `feeling` ∈ `{1,3,5}` (или текущая шкала из констант) → успех → закрыть модалку, toast при необходимости, **`router.push(routePaths.patient)`**, **`router.refresh()` не обязателен** после ухода со страницы.
3. Закрытие модалки без иконки: **не** слать второй запрос; completion уже создан с `feeling=null`.
4. **Гонки / UX**: пока первый `POST` в полёте — disabled основной CTA и/или спиннер; повторный клик не создаёт второй completion. Если первый POST упал — модалку не открывать, показать toast.

**Для остальных источников (`section_page`, …):** сохранить одношаговый сценарий (один POST с опциональным feeling), без редиректа на главную, если не оговорено отдельно — явный `if` в компоненте.

Тесты: [`PatientContentPracticeComplete.test.tsx`](apps/webapp/src/app/app/patient/content/[slug]/PatientContentPracticeComplete.test.tsx) — сценарии mock fetch, отсутствие «Пропустить», редирект для daily_warmup.

## Часть C — Сервер и данные

### C1. Миграция SQL

- Новый файл в `apps/webapp/db/drizzle-migrations/` по образцу **0049**: вставка в `reference_items` для категории `symptom_type` с кодом **`warmup_feeling`**, `ON CONFLICT (category_id, code) DO NOTHING`.
- Backfill `symptom_trackings` для клиентов — тот же шаблон WHERE / NOT EXISTS, что в 0049 для `general_wellbeing`.
- При необходимости синхронизировать Drizzle schema snapshot для reference (если проект генерирует схему из БД — следовать принятому процессу).

### C2. Дедуп симптом ↔ completion

Предпочтительно **явная связь в БД**: nullable колонка на `symptom_entries`, например `patient_practice_completion_id` UUID FK на `patient_practice_completions(id)` + **уникальный индекс** `(tracking_id, patient_practice_completion_id)` для NOT NULL (или уникальность по `(user_id, patient_practice_completion_id)` — уточнить при реализации с учётом существующих индексов). Альтернатива без DDL — строгая идемпотентность в сервисе: перед insert проверка по `notes`/JSON или отдельному запросу.

### C3. Расширение порта выполнения практики

Сейчас [`PatientPracticePort`](apps/webapp/src/modules/patient-practice/ports.ts) содержит только `record`. Добавить метод уровня домена, например **`updateFeeling`** или **`updateCompletionFeeling`**: по `completionId` и `userId` обновить `feeling`, если строка принадлежит пользователю.

Реализация: [`pgPatientPracticeCompletions.ts`](apps/webapp/src/infra/repos/pgPatientPracticeCompletions.ts) через Drizzle `update` с `where` по `id` и `userId`.

### C4. Оркестрация PATCH и симптом

- Новый route, например **`PATCH /api/patient/practice/completion/[id]/feeling`**: `requirePatientApiBusinessAccess`, Zod `{ feeling: z.union([z.literal(1), z.literal(3), z.literal(5)]) }` (или 1–5 если расширите шкалу единообразно).
- Загрузить completion по id: владелец = текущий пользователь; **`source === 'daily_warmup'`** — иначе 403 (не давать записывать «warmup» симптом к материалам из раздела без двухшагового контракта).
- В одной **транзакции** (желательно): `ensureWarmupFeelingTracking` (идемпотентно, как в 0049 для клиента уже есть tracking после миграции); проверка отсутствия записи симптома для этого `completionId`; `INSERT symptom_entries` (`value_0_10` = выбранное значение 1–5, `entry_type: instant`, `source: webapp`, `recorded_at` — время сервера или согласованное с completion); обновление `patient_practice_completions.feeling`.
- **`revalidatePath(routePaths.patient)`** как в POST completion.

Запретить повторный PATCH с тем же успешным симптомом или вернуть идempotent `{ ok: true, duplicate: true }` — зафиксировать в API контракте.

Модули: соблюдать слои — route тонкий; вызов через **`buildAppDeps()`**: сервис patient-practice + порт diaries; без новых env для конфигурации интеграций ([правило проекта](.cursor/rules/000-critical-integration-config-in-db.mdc) не про это напрямую, но новые ключи только через `system_settings` если появятся флаги).

### C5. Тесты

- Расширить / добавить рядом с [`route.test.ts`](apps/webapp/src/app/api/patient/practice/completion/route.test.ts) тесты PATCH: успех, чужой completion, не daily_warmup, двойной PATCH идемпотентность.
- Тест порта/репозитория на update feeling.

## Scope границы (разрешено трогать)

- `apps/webapp/db/drizzle-migrations/**`, при необходимости `db/schema/**`
- `apps/webapp/src/modules/patient-practice/**`, `apps/webapp/src/app/api/patient/practice/**`
- `apps/webapp/src/modules/diaries/**`, `infra/repos/pgSymptomDiary.ts` — точечно (`ensure`/`addEntry`/`transaction` если нужно)
- `apps/webapp/src/app-layer/di/buildAppDeps.ts` — регистрация зависимостей
- `apps/webapp/src/app/app/patient/content/[slug]/**`
- Документация: [`patient-practice.md`](apps/webapp/src/modules/patient-practice/patient-practice.md)

Не расширять scope без решения: интегратор, новые env для ключей, GitHub CI workflow.

## Definition of Done

1. Экран разминки: компактная hero, порядок видео → кнопка → описание; типографика описания как выше.
2. Модалка только для сценария разминки: текст заголовка; нет «Пропустить»; закрытие без симптома допустимо.
3. После иконки: в БД completion с заполненным `feeling`; ровно одна запись симптома на этот completion в tracking `warmup_feeling`; редирект на главную.
4. Закрытие без иконки: completion с `feeling null`, симптом не создан.
5. Тесты PATCH и ключевой клиентский сценарий; **`pnpm run ci`** перед merge по [правилам репозитория](.cursor/rules/pre-push-ci.mdc).
