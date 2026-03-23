# Этап 11: Модуль ЛФК (справочник + конструктор)

> Приоритет: P2–P3
> Зависимости: Этап 6 (справочники, расширенные дневники)
> Риск: высокий (сложный UI, drag-and-drop, много таблиц)

---

## Подэтап 11.1: DB — exercises, media

**Задача:** таблицы для справочника упражнений.

**Файлы:**
- Миграция: `apps/webapp/migrations/025_exercises.sql`

**Действия:**
```sql
CREATE TABLE IF NOT EXISTS exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  instructions TEXT,
  contraindications TEXT,
  load_type_ref_id UUID REFERENCES reference_items(id),
  region_ref_ids JSONB NOT NULL DEFAULT '[]',
  tags TEXT[] DEFAULT '{}',
  difficulty_1_10 SMALLINT CHECK (difficulty_1_10 BETWEEN 1 AND 10),
  created_by UUID NOT NULL REFERENCES platform_users(id),
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_exercises_archived ON exercises(is_archived) WHERE NOT is_archived;

CREATE TABLE IF NOT EXISTS exercise_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  media_file_id UUID REFERENCES media_files(id),
  url TEXT,
  media_type TEXT NOT NULL CHECK (media_type IN ('video', 'photo')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_exercise_media ON exercise_media(exercise_id, sort_order);
```

**Критерий:** таблицы созданы, миграция идемпотентна.

---

## Подэтап 11.2: DB — complex templates

**Задача:** таблицы для шаблонов комплексов.

**Файлы:**
- Миграция: `apps/webapp/migrations/026_lfk_templates.sql`

**Действия:**
```sql
CREATE TABLE IF NOT EXISTS lfk_complex_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  region_ref_id UUID REFERENCES reference_items(id),
  diagnosis_ref_ids JSONB NOT NULL DEFAULT '[]',
  stage_ref_id UUID REFERENCES reference_items(id),
  purpose_ref_id UUID REFERENCES reference_items(id),
  difficulty_1_10 SMALLINT CHECK (difficulty_1_10 BETWEEN 1 AND 10),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  schedule_json JSONB,
  recommendations TEXT,
  contraindications TEXT,
  max_pain_0_10 SMALLINT CHECK (max_pain_0_10 BETWEEN 0 AND 10),
  time_of_day TEXT CHECK (time_of_day IN ('morning', 'afternoon', 'evening')),
  created_by UUID NOT NULL REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lfk_complex_template_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES lfk_complex_templates(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id),
  sort_order INT NOT NULL DEFAULT 0,
  reps INT,
  sets INT,
  left_reps INT,
  left_sets INT,
  right_reps INT,
  right_sets INT,
  max_pain_0_10 SMALLINT CHECK (max_pain_0_10 BETWEEN 0 AND 10),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_template_exercises ON lfk_complex_template_exercises(template_id, sort_order);

CREATE TABLE IF NOT EXISTS patient_lfk_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  template_id UUID REFERENCES lfk_complex_templates(id),
  complex_id UUID REFERENCES lfk_complexes(id),
  stage_ref_id UUID REFERENCES reference_items(id),
  rehab_step TEXT,
  schedule_json_override JSONB,
  recommendations_override TEXT,
  max_pain_override SMALLINT,
  time_of_day_override TEXT,
  assigned_by UUID NOT NULL REFERENCES platform_users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assignments_patient ON patient_lfk_assignments(patient_user_id, is_active);
```

**Критерий:** таблицы созданы, связи корректны.

---

## Подэтап 11.3: API — упражнения CRUD

**Задача:** серверные действия для справочника упражнений.

**Файлы:**
- Модуль: `apps/webapp/src/modules/exercises/`

**Действия:**
1. `listExercises(filters)` — с фильтрацией по региону, типу, диагнозу, тегам.
2. `getExercise(id)` — полная информация + медиа.
3. `createExercise(data)` — doctor-only.
4. `updateExercise(id, data)` — doctor-only.
5. `archiveExercise(id)` — soft-delete.
6. Валидация через Zod.

**Критерий:** CRUD работает, фильтры корректны.

---

## Подэтап 11.4: UI — справочник упражнений

**Задача:** страница со списком упражнений.

**Файлы:**
- Страница: `/app/doctor/exercises`
- Компоненты

**Действия:**
1. Наверху: строка поиска + фильтры (регион, тип, диагноз, период) — через `ReferenceSelect`.
2. Список: карточки с названием, регионом, типом, тегами, сложностью.
3. Клик → детальная страница упражнения.
4. Кнопка «Создать упражнение» → форма.

**Критерий:** список с поиском и фильтрами, навигация.

---

## Подэтап 11.5: UI — форма упражнения

**Задача:** создание/редактирование упражнения.

**Файлы:**
- Компонент `ExerciseForm.tsx`

**Действия:**
1. Поля: название, описание (RichTextEditor), инструкция, противопоказания.
2. Тип нагрузки (`ReferenceSelect` category=`load_type`).
3. Регионы (мульти-выбор из справочника).
4. Теги (текстовый ввод с chips).
5. Сложность (ползунок 1–10).
6. Медиа: `MediaUploader` для видео и фото.
7. Кнопка «Сохранить».

**Критерий:** форма сохраняет упражнение с медиа.

---

## Подэтап 11.6: API — комплексы CRUD

**Задача:** серверные действия для шаблонов комплексов.

**Файлы:**
- Модуль: `apps/webapp/src/modules/lfk-templates/`

**Действия:**
1. `listTemplates(filters)` — с фильтрацией.
2. `getTemplate(id)` — с упражнениями.
3. `createTemplate(data)` — включая список упражнений с порядком.
4. `updateTemplate(id, data)` — обновление порядка, добавление/удаление упражнений.
5. `publishTemplate(id)` — проверка обязательных полей.
6. `archiveTemplate(id)`.
7. `assignToPatient(templateId, patientId, overrides)`.

**Критерий:** полный CRUD + назначение.

---

## Подэтап 11.7: UI — конструктор комплекса

**Задача:** создание комплекса с выбором упражнений и drag-and-drop.

**Файлы:**
- `pnpm --filter webapp add @dnd-kit/core @dnd-kit/sortable`
- Компоненты конструктора

**Действия:**
1. Форма комплекса: название, описание, регион, диагноз, стадия, сложность, назначение.
2. Список упражнений в комплексе — drag-and-drop (@dnd-kit/sortable).
3. Попап выбора упражнений:
   - Почти на весь экран, затемнённые края.
   - Поиск + фильтры (как на странице справочника).
   - Галочки для мульти-выбора.
   - Кнопки: «Добавить выбранные», «Создать новое».
   - Выбор сохраняется при смене фильтров.
4. Для каждого упражнения в комплексе: повторения, подходы, лево/право, боль.
5. Рекомендации: расписание, время суток, макс боль, текстовые рекомендации.
6. Кнопки: «Сохранить черновик», «Опубликовать».

**Критерий:**
- Drag-and-drop работает.
- Попап выбора не сбрасывает состояние при фильтрации.
- Публикация требует заполнения всех полей.

---

## Подэтап 11.8: API + UI — назначение пациенту

**Задача:** врач назначает комплекс пациенту.

**Файлы:**
- Страница назначения в карточке клиента
- API

**Действия:**
1. В карточке пациента: кнопка «Назначить комплекс ЛФК».
2. Экран назначения — вкладки:
   - «Готовые комплексы» — список с фильтрами → выбор.
   - «Конструктор» — создание индивидуального.
3. Поля назначения: стадия/цели, этап реабилитации, расписание, рекомендации.
4. Кнопка «Назначить» → `patient_lfk_assignments` + создание `lfk_complexes` у пациента.
5. У пациента: комплекс появляется в дневнике ЛФК (origin='assigned_by_specialist').

**Критерий:**
- Назначение создаётся.
- Пациент видит назначенный комплекс.
- Расписание отображается.

---

## Подэтап 11.9: UI — список комплексов

**Задача:** страница со всеми комплексами.

**Файлы:**
- Страница `/app/doctor/lfk-templates`

**Действия:**
1. Список: название, краткое описание, статус (draft/published/archived).
2. Клик → две вкладки: «Информация» (настройки + метрики) и «Состав» (упражнения).
3. Метрики: назначен клиенту (N), куплен (N), выполнен (N), % пропусков.
4. Править/архивировать — только снятые с публикации.

**Критерий:**
- Список отображается с метриками.
- Управление статусом работает.

---

## Общий критерий завершения этапа 11

- [ ] Таблицы: exercises, exercise_media, lfk_complex_templates, template_exercises, assignments.
- [ ] Справочник упражнений с поиском и фильтрами.
- [ ] Конструктор комплексов с drag-and-drop.
- [ ] Назначение пациенту.
- [ ] Пациент видит назначенные комплексы.
- [ ] `pnpm run ci` проходит.
