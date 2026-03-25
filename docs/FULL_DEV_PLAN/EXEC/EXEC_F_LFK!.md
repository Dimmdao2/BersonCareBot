# PACK F — LFK / ЛФК (Stage 11) !

> Сложность: **средне-высокий** — много нового кода, но паттерны хорошо определены  
> Агент: Auto (пул)  
> Зависимости: нет (Stage 6 и 10 уже готовы)  
> Миграции: `033_lfk_exercises.sql`, `034_lfk_templates.sql`  
> Source of truth: `PLAN.md` Stage 11

---

## Обязательные правила

- После каждого шага: `pnpm run ci`.
- При FAIL: починить → повторить (до 3 попыток). После 3 → СТОП.
- Новые модули в `modules/<name>/` по проектной конвенции.
- Все тексты UI на русском.
- DnD: `@dnd-kit/core` + `@dnd-kit/sortable` (уже в зависимостях или добавить).
- Не менять существующие миграции.
- Отчёт: `docs/FULL_DEV_PLAN/finsl_fix_report.md`.

---

## Шаг F.1 — Миграция `033_lfk_exercises.sql`

**Файлы:** `apps/webapp/migrations/033_lfk_exercises.sql` (новый)

**Действия:**
1. Проверить `ls apps/webapp/migrations/` — подтвердить что 033 свободен.
2. Таблица `lfk_exercises`:
   ```sql
   CREATE TABLE IF NOT EXISTS lfk_exercises (
     id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     title           TEXT NOT NULL,
     description     TEXT,
     region_ref_id   UUID REFERENCES reference_items(id),
     load_type       TEXT CHECK (load_type IN ('strength', 'stretch', 'balance', 'cardio', 'other')),
     difficulty_1_10 INT CHECK (difficulty_1_10 BETWEEN 1 AND 10),
     contraindications TEXT,
     tags            TEXT[],
     is_archived     BOOLEAN NOT NULL DEFAULT false,
     created_by      UUID REFERENCES platform_users(id),
     created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS idx_lfk_exercises_archived ON lfk_exercises(is_archived);
   CREATE INDEX IF NOT EXISTS idx_lfk_exercises_region ON lfk_exercises(region_ref_id) WHERE NOT is_archived;
   ```
3. Таблица `lfk_exercise_media`:
   ```sql
   CREATE TABLE IF NOT EXISTS lfk_exercise_media (
     id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     exercise_id  UUID NOT NULL REFERENCES lfk_exercises(id) ON DELETE CASCADE,
     media_url    TEXT NOT NULL,
     media_type   TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'gif')),
     sort_order   INT NOT NULL DEFAULT 0,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX IF NOT EXISTS idx_lfk_exercise_media_exercise ON lfk_exercise_media(exercise_id, sort_order);
   ```

**DoD:** Миграция идемпотентна. CI зелёный.

---

## Шаг F.2 — Миграция `034_lfk_templates.sql`

**Файлы:** `apps/webapp/migrations/034_lfk_templates.sql` (новый)

**Действия:**
1. Таблица `lfk_complex_templates`:
   ```sql
   CREATE TABLE IF NOT EXISTS lfk_complex_templates (
     id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     title        TEXT NOT NULL,
     description  TEXT,
     status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
     created_by   UUID REFERENCES platform_users(id),
     created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ```
2. Таблица `lfk_complex_template_exercises`:
   ```sql
   CREATE TABLE IF NOT EXISTS lfk_complex_template_exercises (
     id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     template_id  UUID NOT NULL REFERENCES lfk_complex_templates(id) ON DELETE CASCADE,
     exercise_id  UUID NOT NULL REFERENCES lfk_exercises(id),
     sort_order   INT NOT NULL DEFAULT 0,
     reps         INT,
     sets         INT,
     side         TEXT CHECK (side IN ('left', 'right', 'both', null)),
     max_pain_0_10 INT CHECK (max_pain_0_10 BETWEEN 0 AND 10),
     comment      TEXT,
     UNIQUE (template_id, exercise_id)
   );
   CREATE INDEX IF NOT EXISTS idx_template_exercises_order ON lfk_complex_template_exercises(template_id, sort_order);
   ```
3. Таблица `patient_lfk_assignments`:
   ```sql
   CREATE TABLE IF NOT EXISTS patient_lfk_assignments (
     id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     patient_user_id UUID NOT NULL REFERENCES platform_users(id),
     template_id     UUID NOT NULL REFERENCES lfk_complex_templates(id),
     complex_id      UUID REFERENCES lfk_complexes(id),
     assigned_by     UUID REFERENCES platform_users(id),
     assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
     is_active       BOOLEAN NOT NULL DEFAULT true
   );
   CREATE INDEX IF NOT EXISTS idx_assignments_patient ON patient_lfk_assignments(patient_user_id, is_active);
   ```

**DoD:** FK chain корректна. Миграция идемпотентна. CI зелёный.

---

## Шаг F.3 — Backend: модуль `lfk-exercises`

**Файлы:**
- `apps/webapp/src/modules/lfk-exercises/types.ts` (новый)
- `apps/webapp/src/modules/lfk-exercises/ports.ts` (новый)
- `apps/webapp/src/modules/lfk-exercises/service.ts` (новый)
- `apps/webapp/src/modules/lfk-exercises/service.test.ts` (новый)
- `apps/webapp/src/infra/repos/pgLfkExercises.ts` (новый)
- `apps/webapp/src/app-layer/di/buildAppDeps.ts`

**Действия:**
1. Типы: `Exercise`, `ExerciseMedia`, `ExerciseFilter`, `CreateExerciseInput`, `UpdateExerciseInput`.
2. Порт: `list(filter)`, `getById(id)`, `create(input)`, `update(id, input)`, `archive(id)`.
3. Сервис:
   - `listExercises(filter)` — фильтры: `region_ref_id`, `load_type`, `difficulty`, `tags`, `includeArchived`.
   - `getExercise(id)` — с медиа.
   - `createExercise(input, createdBy)` — валидация обязательных полей.
   - `updateExercise(id, input)`.
   - `archiveExercise(id)` — soft archive.
4. PG-репозиторий: SQL через `getPool()`, маппинг snake_case → camelCase.
5. Зарегистрировать `lfkExercises` в `buildAppDeps`.

**Тесты:**
- Unit: сервис — list с фильтрами, create валидация, archive.
- Integration: `pgLfkExercises` — CRUD cycle.

**DoD:** CRUD упражнений через сервис. CI зелёный.

---

## Шаг F.4 — Doctor UI: справочник упражнений

**Файлы:**
- `apps/webapp/src/app/app/doctor/exercises/page.tsx` (новый)
- `apps/webapp/src/app/app/doctor/exercises/new/page.tsx` (новый)
- `apps/webapp/src/app/app/doctor/exercises/[id]/page.tsx` (новый)
- `apps/webapp/src/app/app/doctor/exercises/ExerciseForm.tsx` (новый, client component)
- `apps/webapp/src/shared/ui/DoctorHeader.tsx` (добавить пункт меню)
- `apps/webapp/src/shared/ui/doctorScreenTitles.ts` (добавить)

**Действия:**
1. Список `/app/doctor/exercises`:
   - Server Component: загрузить упражнения через сервис.
   - Поиск по названию + фильтры (регион, тип нагрузки).
   - Карточки с названием, типом, сложностью, медиа-превью.
   - Кнопка "Создать упражнение".
2. Создание `/app/doctor/exercises/new`:
   - Form: название, описание, регион (ReferenceSelect), тип нагрузки, сложность (slider 1-10), противопоказания, теги.
   - Кнопка "Сохранить" → server action.
3. Редактирование `/app/doctor/exercises/[id]`:
   - Та же форма с текущими значениями.
   - Кнопка "Архивировать".
4. В `DoctorHeader` добавить пункт меню "Упражнения" → `/app/doctor/exercises`.
5. shadcn: `Card`, `Input`, `Select`, `Slider`, `Button`, `Badge`.

**Тесты:**
- E2E: create exercise → appears in list → edit → archive → disappears from list.
- Обновить `doctorScreenTitles.test.ts`.

**DoD:** Врач полностью управляет упражнениями через UI. CI зелёный.

---

## Шаг F.5 — Backend: модуль `lfk-templates`

**Файлы:**
- `apps/webapp/src/modules/lfk-templates/types.ts` (новый)
- `apps/webapp/src/modules/lfk-templates/ports.ts` (новый)
- `apps/webapp/src/modules/lfk-templates/service.ts` (новый)
- `apps/webapp/src/modules/lfk-templates/service.test.ts` (новый)
- `apps/webapp/src/infra/repos/pgLfkTemplates.ts` (новый)
- `apps/webapp/src/app-layer/di/buildAppDeps.ts`

**Действия:**
1. Типы: `Template`, `TemplateExercise`, `TemplateStatus`, `CreateTemplateInput`.
2. Порт: `list(filter)`, `getById(id)`, `create(input)`, `update(id, input)`, `updateExercises(templateId, exercises[])`, `publish(id)`, `archive(id)`.
3. Сервис:
   - `publish` — проверка: есть название, минимум 1 упражнение, статус `draft`.
   - `updateExercises` — принимает массив `{ exerciseId, sortOrder, reps, sets, side, maxPain, comment }`, транзакция DELETE + INSERT.
4. PG-репозиторий с `sort_order`.
5. Зарегистрировать в `buildAppDeps`.

**Тесты:**
- Unit: publish неполного шаблона → ошибка.
- Unit: updateExercises → порядок сохраняется.
- Integration: `pgLfkTemplates` — CRUD + publish.

**DoD:** Шаблоны ЛФК управляются через сервис. CI зелёный.

---

## Шаг F.6 — Doctor UI: конструктор шаблонов

**Файлы:**
- `apps/webapp/src/app/app/doctor/lfk-templates/page.tsx` (новый)
- `apps/webapp/src/app/app/doctor/lfk-templates/new/page.tsx` (новый)
- `apps/webapp/src/app/app/doctor/lfk-templates/[id]/page.tsx` (новый)
- `apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.tsx` (новый, client component)
- `apps/webapp/package.json` (если нет `@dnd-kit/core`, `@dnd-kit/sortable` — добавить)

**Действия:**
1. Список `/app/doctor/lfk-templates`:
   - Фильтр по статусу (draft/published/archived).
   - Карточки с названием, количеством упражнений, статусом.
2. Редактор `/app/doctor/lfk-templates/[id]`:
   - Название + описание.
   - Список упражнений с drag-and-drop reorder (dnd-kit sortable).
   - Для каждого упражнения: reps, sets, side, max pain, comment.
   - Кнопка "Добавить упражнение" → dialog с поиском из справочника.
   - Кнопки: "Сохранить черновик", "Опубликовать", "Архивировать".
3. В `DoctorHeader` добавить пункт "Шаблоны ЛФК" → `/app/doctor/lfk-templates`.

**Тесты:**
- Component: reorder сохраняет sort_order.
- E2E: create template → add exercises → reorder → publish.

**DoD:** Конструктор шаблонов работает с drag-and-drop. CI зелёный.

---

## Шаг F.7 — Назначение шаблона пациенту + проекция в дневник

**Файлы:**
- `apps/webapp/src/modules/lfk-assignments/types.ts` (новый)
- `apps/webapp/src/modules/lfk-assignments/service.ts` (новый)
- `apps/webapp/src/modules/lfk-assignments/service.test.ts` (новый)
- `apps/webapp/src/infra/repos/pgLfkDiary.ts` (расширить)
- `apps/webapp/src/modules/diaries/lfk-service.ts` (расширить)
- `apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx` (добавить кнопку)

**Действия:**
1. Сервис `lfk-assignments`:
   - `assignTemplateToPatient(templateId, patientUserId, assignedBy)`:
     - Транзакция: создать `patient_lfk_assignments` + создать `lfk_complexes` с `origin = 'assigned_by_specialist'`.
     - Скопировать упражнения из шаблона в комплекс пациента.
   - Идемпотентность: повторное назначение → обновить существующий assignment.
2. В `lfk-service.ts`:
   - `listComplexes` должен возвращать и assigned комплексы.
   - Пометка `origin` в UI.
3. В `ClientProfileCard`:
   - Кнопка "Назначить комплекс ЛФК" → dialog с выбором published шаблона.
4. Patient diary (`/app/patient/diary?tab=lfk`):
   - Назначенные комплексы показываются с меткой "Назначен врачом".

**Тесты:**
- Unit: `assignTemplateToPatient` — транзакция, идемпотентность.
- Integration: assign → patient listComplexes includes assigned.
- E2E: doctor assigns → patient diary shows complex → mark session.

**DoD:** Doctor→patient flow ЛФК работает end-to-end. CI зелёный.

---

## Финальный критерий Pack F

- [ ] Таблицы exercises, templates, assignments созданы.
- [ ] Backend CRUD упражнений и шаблонов.
- [ ] Doctor UI: справочник, конструктор с DnD, назначение.
- [ ] Назначение проецируется в дневник пациента.
- [ ] E2E: doctor creates → assigns → patient sees.
- [ ] `pnpm run ci` зелёный.
