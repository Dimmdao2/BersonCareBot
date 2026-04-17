# Схема логики системы программ лечения

**Статус:** зафиксированная спецификация. Любое отклонение при реализации — REWORK.

---

## 1. Общий поток данных

```
┌─────────────────────────────────────────────────────────────┐
│                    БИБЛИОТЕКА БЛОКОВ                         │
│                                                             │
│  ┌──────────┐ ┌──────────────┐ ┌───────────┐ ┌───────────┐ │
│  │ exercise │ │ lfk_complex  │ │   test    │ │recommenda-│ │
│  │          │ │  _template   │ │           │ │   tion    │ │
│  └──────────┘ └──────────────┘ └─────┬─────┘ └───────────┘ │
│                                      │                      │
│                               ┌──────┴──────┐              │
│  ┌──────────┐                 │  test_set   │              │
│  │ lesson   │                 │  (набор)    │              │
│  │(CMS page)│                 └─────────────┘              │
│  └──────────┘                                              │
└─────────────────────────┬───────────────────────────────────┘
                          │ ссылки (item_type + item_ref_id)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              ШАБЛОН ПРОГРАММЫ (конструктор)                  │
│                                                             │
│  treatment_program_template                                 │
│  ├── stage 1 (sort_order=1)                                 │
│  │   ├── stage_item: lfk_complex (ref→tpl_id)              │
│  │   ├── stage_item: test_set (ref→set_id)                 │
│  │   └── stage_item: recommendation (ref→rec_id)           │
│  ├── stage 2 (sort_order=2)                                 │
│  │   ├── stage_item: exercise (ref→ex_id)                  │
│  │   ├── stage_item: exercise (ref→ex_id_2)                │
│  │   ├── stage_item: test_set (ref→set_id) ← повтор OK    │
│  │   └── stage_item: lesson (ref→page_id)                  │
│  └── stage 3 ...                                            │
└─────────────────────────┬───────────────────────────────────┘
                          │ копирование (snapshot)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│         ЭКЗЕМПЛЯР ПРОГРАММЫ (программа пациента)            │
│                                                             │
│  treatment_program_instance (patient_user_id FK)            │
│  ├── instance_stage 1 (status: completed)                   │
│  │   ├── instance_stage_item: lfk_complex                  │
│  │   │   comment: "из шаблона" | local_comment: "для Иванова"│
│  │   │   snapshot: { title, exercises: [...] }              │
│  │   ├── instance_stage_item: test_set                     │
│  │   └── instance_stage_item: recommendation               │
│  ├── instance_stage 2 (status: available)                   │
│  │   ├── instance_stage_item: exercise                     │
│  │   ├── ...                                               │
│  │   └── instance_stage_item: lesson                       │
│  └── instance_stage 3 (status: locked)                      │
│       └── ...                                              │
└──────────────────┬──────────────────────────────────────────┘
                   │
          ┌────────┼──────────┐
          ▼        ▼          ▼
   ┌────────┐ ┌────────┐ ┌────────────────────────┐
   │test_   │ │comments│ │treatment_program_events │
   │attempts│ │(единая │ │(история изменений)      │
   │+ results│ │таблица)│ └────────────────────────┘
   └────────┘ └────────┘
```

---

## 2. Жизненный цикл программы

```
         ┌────────────────┐
         │  ШАБЛОН (draft)│
         └───────┬────────┘
                 │ publish
                 ▼
         ┌────────────────┐
         │ШАБЛОН (published)│──── Курс ссылается на шаблон
         └───────┬────────┘
                 │ назначить пациенту / покупка курса
                 │ (deep copy: stages → items → snapshot)
                 ▼
         ┌────────────────┐
         │  ЭКЗЕМПЛЯР     │
         │  (active)      │◄──── врач редактирует
         └───────┬────────┘      (добавляет/удаляет/заменяет)
                 │                каждая мутация → event
                 │ прохождение
                 ▼
         ┌────────────────┐
         │  ЭКЗЕМПЛЯР     │
         │  (completed)   │
         └────────────────┘
```

---

## 3. Статусы этапа (instance_stage)

```
locked ──► available ──► in_progress ──► completed
                │                            │
                └──► skipped ◄───────────────┘
                      (врач может пропустить)
```

Переход `locked → available`: автоматически при `completed` предыдущего этапа **ИЛИ** вручную врачом.

Переход `available → in_progress`: при первом взаимодействии пациента с элементом этапа.

Переход `in_progress → completed`: все обязательные элементы пройдены **ИЛИ** вручную врачом.

Переход `→ skipped`: только вручную врачом + обязательный `reason`.

---

## 4. Типы элементов (item_type)

| item_type | Ссылается на | Что хранится в snapshot |
|-----------|-------------|------------------------|
| `exercise` | `lfk_exercises.id` | title, description, media URLs, difficulty, load_type |
| `lfk_complex` | `lfk_complex_templates.id` | title, description, список упражнений с reps/sets/side/comment |
| `test_set` | `test_sets.id` | title, description, список тестов с scoring_config |
| `recommendation` | `recommendations.id` | title, body_md, media URLs |
| `lesson` | `content_pages.id` (section=course_lessons) | title, summary, body preview |

**Повторение элементов:** один и тот же `item_ref_id` может встречаться в разных этапах без ограничений. Внутри одного этапа — допускается (разные `sort_order`).

**Валидация `item_ref_id`:** в сервисном слое при создании/копировании. БД не имеет FK (полиморфная ссылка).

---

## 5. Копирование шаблона → экземпляр

При назначении программы пациенту:

```
treatment_program_template
  └── template_stage (N штук)
       └── template_stage_item (M штук)

         ──── DEEP COPY ────►

treatment_program_instance (patient_user_id = X)
  └── instance_stage (N штук, status = locked/available)
       └── instance_stage_item (M штук)
            ├── comment = скопирован из шаблона
            ├── local_comment = NULL (пока врач не переопределит)
            ├── settings = скопированы
            └── snapshot = JSON с данными блока на момент копирования
```

Первый этап получает `status = available`. Остальные — `locked`.

После копирования экземпляр **независим** от шаблона. Изменения шаблона не влияют на существующие экземпляры.

---

## 6. Override комментариев

```
При отображении элемента программы пациента:

  IF instance_stage_item.local_comment IS NOT NULL
    → показать local_comment
  ELSE
    → показать instance_stage_item.comment (скопирован из шаблона)

При редактировании врачом:
  1. Если local_comment пуст — скопировать comment в local_comment
  2. Врач редактирует local_comment
  3. Записать event: comment_changed
```

---

## 7. Единая таблица комментариев

```
comments
  ├── author_id → platform_users
  ├── target_type: 'exercise' | 'lfk_complex' | 'test' | 'test_set' |
  │                'recommendation' | 'lesson' | 'stage_item_instance' |
  │                'stage_instance' | 'program_instance'
  ├── target_id: UUID (без FK — полиморфная ссылка)
  ├── comment_type: 'template' | 'individual_override' | 'clinical_note'
  ├── body: TEXT
  └── created_at, updated_at
```

Индекс: `(target_type, target_id)`.

При мультитенанте: `tenant_id` + индекс `(tenant_id, target_type, target_id)`.

---

## 8. История изменений (events)

```
treatment_program_events
  ├── instance_id → treatment_program_instances
  ├── actor_id → platform_users
  ├── event_type: TEXT
  ├── target_type: TEXT (stage | stage_item | program)
  ├── target_id: UUID
  ├── payload: JSONB (детали изменения)
  ├── reason: TEXT (обязателен для stage_skipped, item_removed)
  └── created_at
```

Типы событий:
- `item_added` — добавлен элемент в этап
- `item_removed` — удалён элемент из этапа
- `item_replaced` — заменён элемент
- `comment_changed` — изменён комментарий
- `stage_added` — добавлен новый этап
- `stage_removed` — удалён этап
- `stage_skipped` — этап пропущен (обязательный reason)
- `stage_completed` — этап завершён
- `status_changed` — изменён статус программы
- `test_completed` — завершён тест (ссылка на test_result в payload)

Запись — **только через сервисный слой**. Не триггеры. Не middleware.

---

## 9. Курс

```
course
  ├── title, description
  ├── program_template_id → treatment_program_templates
  ├── intro_lesson_page_id → content_pages (nullable)
  ├── access_settings JSONB
  ├── status (draft / published / archived)
  └── price_minor, currency

При покупке:
  1. Проверить access
  2. Вызвать тот же сервис назначения из фазы 4
  3. Создать treatment_program_instance с template_id = course.program_template_id
```

Курс **не хранит** этапы. Курс **не имеет** своей логики прохождения. Всё через движок программ.

---

## 10. Уроки (lessons)

Уроки = `content_pages` в непубличной секции (`slug = 'course_lessons'`, `is_visible = false`, `requires_auth = true`).

- `stage_item` с `item_type = 'lesson'` ссылается на `content_pages.id`
- Между курсами/программами уроки переиспользуются (одна и та же страница)
- Метрика «пройдено/не пройдено» — на уровне `instance_stage_item` (не CMS)
- Теги и метаданные — на уровне `content_pages` (расширяется при необходимости)

---

## 11. Взаимодействие с существующими LFK-сущностями

```
СУЩЕСТВУЮЩИЕ ТАБЛИЦЫ (не трогаем):        НОВЫЕ ТАБЛИЦЫ:

lfk_exercises                         ──► stage_item (item_type='exercise')
lfk_exercise_media                         ссылается через item_ref_id

lfk_complex_templates                 ──► stage_item (item_type='lfk_complex')
lfk_complex_template_exercises             ссылается через item_ref_id

content_pages (lessons)               ──► stage_item (item_type='lesson')
                                           ссылается через item_ref_id
```

`patient_lfk_assignments` + `lfk_complexes` + `lfk_complex_exercises` — legacy. Тестовые данные можно удалить. Таблицы оставить; в будущем мигрировать или deprecated.

---

## 12. Архитектурные слои (для каждой новой сущности)

```
app/api/**/route.ts          ← HTTP: parse, validate, auth, call service
  ↓
modules/treatment-program/   ← бизнес-логика, orchestration
  ├── service.ts             ← use-cases
  ├── ports.ts               ← интерфейсы портов (repository contract)
  └── types.ts               ← доменные типы
  ↓
db/schema/                   ← Drizzle schema (source of truth для таблиц)
  ↓
infra/repos/ (или inline в service через Drizzle)
                             ← data access (Drizzle queries)
```

**Запреты:**
- `modules/*` не импортирует `@/infra/db/client`
- `modules/*` не импортирует `@/infra/repos/*` (кроме типов портов из `modules/*/ports.ts`)
- `route.ts` не содержит бизнес-логику
- Типы портов живут в `modules/*/ports.ts`, не в `infra/repos/pg*.ts`

---

## 13. Контрольная таблица соответствия ТЗ

| Требование из ТЗ | Покрыто фазой | Проверка |
|---|---|---|
| Создавать библиотеку: упражнения | Уже есть | `lfk_exercises` |
| Создавать библиотеку: комплексы | Уже есть | `lfk_complex_templates` |
| Создавать библиотеку: тесты | Фаза 2 | `tests` + `test_sets` |
| Создавать библиотеку: рекомендации | Фаза 2 | `recommendations` |
| Создавать библиотеку: уроки | Уже есть (CMS) | `content_pages` |
| Собирать шаблоны программ | Фаза 3 | `treatment_program_templates` + stages + items |
| Назначать программу пациенту | Фаза 4 | `treatment_program_instances` |
| Редактировать после назначения | Фаза 4 + 9 | API мутаций + events |
| Поддерживать прохождение | Фаза 6 | Статусы этапов + test_attempts |
| Фиксировать результаты тестов | Фаза 6 | `test_results` |
| Продавать (курс → программа) | Фаза 8 | `courses` |
| Хранить историю изменений | Фаза 7 | `treatment_program_events` |
| Хранить результаты тестов | Фаза 6 | `test_results` |
