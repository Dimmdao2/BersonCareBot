# AUDIT — Фаза 8 (курсы, `courses`)

**Дата аудита:** 2026-04-18.  
**Дата FIX closure:** 2026-04-18.  
**Эталон:** `docs/TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md` **§ 9** (сущность курс, покупка → тот же сервис назначения), **§ 10** (уроки в `content_pages`, секции `lessons` / `course_lessons`, типично `requires_auth = true`).  
**Scope:** `apps/webapp/db/schema/courses.ts`, миграция `db/drizzle-migrations/0007_courses.sql`, экспорт в `db/schema/index.ts`; `src/modules/courses/**`; `infra/repos/pgCourses.ts`, `inMemoryCourses.ts`; `buildAppDeps` (связка `courses` + `assignTemplateToPatient`); API `app/api/patient/courses/**`, `app/api/doctor/courses/**`; UI `app/app/patient/courses/**`; тесты `modules/courses/service.test.ts`, `app/api/patient/courses/[courseId]/enroll/route.test.ts`.  

**Вне scope:** полный прогон CI монорепозитория (по запросу — только файлы фазы).

---

## 1) Таблица `courses` через Drizzle и связь `course → treatment_program_templates`

### Verdict: **PASS**

| Требование § 9 / проверка | Реализация |
|---------------------------|------------|
| Drizzle | `export const courses = pgTable("courses", …)` в `db/schema/courses.ts` |
| `program_template_id` → `treatment_program_templates.id` | FK `courses_program_template_id_fkey`, `foreignColumns: [treatmentProgramTemplates.id]`, **`ON DELETE restrict`** |
| `intro_lesson_page_id` → `content_pages` (nullable) | FK `courses_intro_lesson_page_id_fkey`, **`ON DELETE set null`** |
| `access_settings` JSONB | `accessSettings`, default `'{}'::jsonb` |
| `status` | CHECK: `draft` \| `published` \| `archived` (Drizzle + `0007_courses.sql`) |
| `price_minor`, `currency` | Есть; defaults `0`, `RUB` |
| Миграция | `0007_courses.sql` согласована с Drizzle (колонки, FK, CHECK, индексы `idx_courses_status`, `idx_courses_program_template`) |

---

## 2) «Покупка» курса = сервис назначения фазы 4, без дублирования логики

### Verdict: **PASS**

| Шаг § 9 | Реализация |
|---------|------------|
| Проверить access | `enrollPatient`: курс найден, `status === "published"`, `access_settings.enrollment !== "closed"` |
| Тот же сервис назначения | `buildAppDeps`: `assignTemplateToPatient: (input) => treatmentProgramInstanceService.assignTemplateToPatient(input)` — единая точка с фазой 4 |
| `template_id = course.program_template_id` | `assignTemplateToPatient({ templateId: course.programTemplateId, patientUserId, assignedBy: null })` |
| Deep copy / этапы | Не дублируются в `modules/courses`: копирование дерева только в `assignTemplateToPatient` / `createInstanceTree` |

**API:** `POST /api/patient/courses/[courseId]/enroll` → `deps.courses.enrollPatient` после `requirePatientApiBusinessAccess`.

**Семантика:** `assignedBy: null` для самозаписи пациента — согласовано с сценарием без врача.

---

## 3) Курс не хранит этапы и не вводит отдельную state-machine прохождения

### Verdict: **PASS**

| Проверка | Результат |
|----------|-----------|
| Схема `courses` | Нет колонок этапов/элементов/прогресса; только метаданные курса и ссылки |
| Модуль `courses` | Нет статусов «прохождения курса»; после записи прогресс в `treatment_program_*` (фазы 4–6) |

---

## 4) Уроки: `content_pages`, секции `lessons` / `course_lessons`, `requires_auth`

### Verdict: **PASS** (соответствие § 10)

| Пункт § 10 | Реализация |
|------------|------------|
| Секции `lessons` и `course_lessons` | `COURSE_LESSON_SECTIONS = ["lessons", "course_lessons"]` в `modules/courses/types.ts`; проверка в `assertValidIntroLessonPage` |
| `requires_auth = true` для вступительного урока | `assertValidIntroLessonPage` отклоняет `requiresAuth === false` при создании/обновлении курса с `introLessonPageId` |
| Публикация / архив | Проверка `isPublished`, отсутствие `archivedAt` / `deletedAt` |
| Формулировка «непубличная секция» | В эталоне — две допустимые секции каталога CMS; **ограничение доступа к контенту** для урока курса задаётся **`requires_auth`** (и общими правилами выдачи `content_pages` пациенту). Отдельного поля «публичная/нет» в коде курса нет — согласовано с § 10 |

**Замечание:** чеклист «только `course_lessons`» **уже**, чем § 10; реализация следует **SYSTEM_LOGIC_SCHEMA** (обе секции).

---

## 5) Patient UI: каталог курсов; тесты сценария назначения

### Verdict: **PASS**

| Аспект | Реализация |
|--------|------------|
| Каталог | `app/app/patient/courses/page.tsx`: `listPublishedCatalog()`, `PatientCoursesCatalogClient` — заголовок, цена, описание, ссылка на intro по `introContentSlug` при валидной опубликованной странице |
| Запись | `POST .../enroll`, редирект на программу пациента после успеха |
| Тесты сервиса | `service.test.ts`: вызов `assignTemplateToPatient` с `templateId`, `assignedBy: null`; отказ для неопубликованного курса и `enrollment: "closed"`; валидация intro (секция, `requires_auth`) |
| Тесты HTTP enroll | `enroll/route.test.ts`: gate, невалидный UUID, успех с моком `enrollPatient`, ошибка сервиса |

---

## Сверка с `SYSTEM_LOGIC_SCHEMA.md` § 9–10 (итог)

| Пункт эталона | Статус |
|----------------|--------|
| § 9 состав `course`, покупка через сервис фазы 4 | OK |
| § 9 курс без этапов и без собственной логики прохождения | OK |
| § 10 уроки как `content_pages`, `lessons` / `course_lessons`, типично `requires_auth` | OK |
| § 10 метрика «пройдено» на уровне экземпляра | OK (курс не меняет модель; движок программ) |

---

## Gate (фаза 8, аудит 2026-04-18)

| Критерий | Статус |
|----------|--------|
| Drizzle + `0007_*` + FK на шаблон | OK |
| Назначение только через `assignTemplateToPatient` | OK |
| Нет этапов/FSM в сущности курса | OK |
| Валидация intro (§ 10) | OK |
| UI каталог + тесты сервиса + HTTP enroll | OK |
| Миграции на стендах | Операционно |

**Gate verdict:** **PASS**

---

## MANDATORY FIX INSTRUCTIONS

### Critical / Major

| Статус FIX (2026-04-18) | Деталь |
|-------------------------|--------|
| **Закрыто (N/A)** | Блокирующих отклонений от § 9–10 **не выявлено**; изменений кода для «исправления» critical/major **не требовалось**. Регрессия: при правках `courses`, `enrollPatient`, `buildAppDeps`, `assignTemplateToPatient` — повторить чек-лист § 1–5 и тесты ниже. |

### Minor

| ID | Описание | Статус FIX (2026-04-18) |
|----|----------|-------------------------|
| **8-M-1** | HTTP `POST .../enroll`: тесты route → `courses.enrollPatient` | **Закрыто без доработки кода** — файл `src/app/api/patient/courses/[courseId]/enroll/route.test.ts` присутствует и покрывает gate / UUID / успех / ошибку сервиса. |

### Informational (defer с обоснованием)

| ID | Тема | Обоснование defer |
|----|------|---------------------|
| **8-I-1** | Оплата | § 9 задаёт цену как метаданные; платёжный контур в эталоне как обязательный шаг записи **не** фиксирован — отдельная продуктовая инициатива. |
| **8-I-2** | Повторная запись | § 9 не ограничивает число экземпляров на пациента; политика дублей — продуктовое решение. |
| **8-I-3** | Intro в каталоге | Каталог не дублирует полную валидацию intro; при сохранении курса врачом правила уже применены — усиление каталога опционально. |
| **8-I-4** | Doctor UI | Минимальный scope фазы 8 — API; экраны — отдельная задача при необходимости. |

---

## AUDIT_PHASE_8 FIX — перепроверка связи и назначения (2026-04-18)

**Связь `course → treatment_program_template`**

- `db/schema/courses.ts`: `programTemplateId` → FK `courses_program_template_id_fkey` на `treatmentProgramTemplates.id`, `ON DELETE restrict`.
- Миграция `0007_courses.sql`: то же имя ограничения и ссылка на `treatment_program_templates`.

**Назначение через сервис фазы 4**

- `buildAppDeps.ts`: `createCoursesService({ … assignTemplateToPatient: (input) => treatmentProgramInstanceService.assignTemplateToPatient(input) })` — **единственный** путь записи из модуля курсов; альтернативного копирования шаблона в `modules/courses` **нет**.
- `enrollPatient` передаёт `templateId: course.programTemplateId`, `assignedBy: null` (самозапись пациента).

**Курс не дублирует прохождение и не хранит этапы**

- Таблица `courses`: только метаданные, `program_template_id`, intro, access, status, цена — **без** stage/item/progress.
- `modules/courses/service.ts`: нет логики статусов прохождения курса; после `enrollPatient` состояние — в `treatment_program_instances` и связанных таблицах.

---

## AUDIT_PHASE_8 FIX — верификация (команды, scope фазы)

Выполнено при FIX (без полного `pnpm run ci` по монорепе):

- `pnpm --dir apps/webapp exec vitest run src/modules/courses/service.test.ts src/app/api/patient/courses/\[courseId\]/enroll/route.test.ts` — **PASS** (**2** files, **11** tests).
- `pnpm --dir apps/webapp run typecheck` — **PASS**

Полный CI репозитория **не** гонялся (ограничение scope).

**Gate verdict (AUDIT_PHASE_8 FIX):** **PASS**

---

## Рекомендуемые проверки при будущих правках фазы 8

- `pnpm --dir apps/webapp exec vitest run src/modules/courses/service.test.ts src/app/api/patient/courses/\[courseId\]/enroll/route.test.ts`
- `pnpm --dir apps/webapp run typecheck` (и при необходимости `lint` для `apps/webapp`)

Полный `pnpm run ci` — по политике репозитория перед пушем (`EXECUTION_RULES.md` / `pre-push-ci.mdc`).
