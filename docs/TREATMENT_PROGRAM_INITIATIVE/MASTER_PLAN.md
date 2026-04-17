# Master plan — TREATMENT_PROGRAM_INITIATIVE

**Статус:** документация инициативы (код не менялся). **Дата:** 2026-04-17.

## Общая цель

Внедрить единый движок программ лечения:

**Библиотека блоков → Шаблон программы → Экземпляр программы пациента → Прохождение**

Отдельно: **Курс → выдаёт экземпляр программы**.

Без альтернативных веток. Без отдельного «движка курсов». Один движок — для всего.

## Принципы (нарушение = REWORK)

1. Один движок программ — для всего (назначение врачом, курс, продажа).
2. Курс **не имеет** своей логики этапов — он ссылается на шаблон программы.
3. Программа пациента — **всегда копия** (snapshot), не ссылка на шаблон.
4. Любой элемент может иметь локальный комментарий (override шаблонного).
5. Нет универсального «super entity» для всего контента.
6. Нет сложного rule engine на старте.
7. История — через события (`treatment_program_events`), не через версии целиком.
8. Каждому пациенту при назначении чего-либо — создаётся `treatment_program_instance`.
9. Комплекс ЛФК (`lfk_complex_templates`) **не трогаем** — это готовый блок библиотеки.
10. Весь новый код — на **Drizzle ORM**, с чистыми module boundaries.

## Что НЕ делать на старте

- ❌ отдельный «движок курсов»
- ❌ универсальный polymorphic content entity
- ❌ сложные правила переходов (if/and/or)
- ❌ versioning всей программы целиком
- ❌ raw SQL для новых сущностей (только Drizzle)
- ❌ прямой `getPool()` или `@/infra/repos/*` из `modules/*`

## Prerequisite: Drizzle ORM

Перед началом фазы 2 (библиотека блоков) должен быть завершён переход на Drizzle:

1. Установить `drizzle-orm` + `drizzle-kit`.
2. `drizzle-kit introspect` — сгенерировать schema из существующей БД.
3. Настроить `drizzle.config.ts`.
4. Проверить что существующие тесты проходят.
5. Все новые таблицы — через Drizzle schema + `drizzle-kit generate`.

## Фазы реализации

### Фаза 0 — Фиксация legacy + enforcement

**Цель:** не дать legacy-паттернам проникнуть в новый код.

| # | Задача | Тип |
|---|--------|-----|
| 0.1 | ESLint rule `no-restricted-imports` для `@/infra/db/client` и `@/infra/repos/*` в `modules/**` и `app/api/**/route.ts` | config |
| 0.2 | Cursor rule `clean-architecture-module-isolation` | config |
| 0.3 | `LEGACY_CLEANUP_BACKLOG.md` — allowlist всех текущих нарушений в `modules/*` и `route.ts` | docs |

**Gate:** ESLint rule проходит на текущем коде (allowlisted файлы в overrides). Новый файл без override получает lint error при `@/infra` import.

### Фаза 1 — Drizzle ORM

**Цель:** единый типобезопасный data-access слой.

| # | Задача |
|---|--------|
| 1.1 | `pnpm add drizzle-orm drizzle-kit` (webapp) |
| 1.2 | `drizzle-kit introspect` → `db/schema/*.ts` |
| 1.3 | `drizzle.config.ts` с подключением к pool |
| 1.4 | Smoke-тест: один существующий read-запрос через Drizzle (не ломая старый код) |
| 1.5 | Gate: `pnpm run ci` green |

**Результат:** Drizzle настроен, schema отражает текущую БД, новые сущности можно описывать в schema.

### Фаза 2 — Библиотека блоков

**Цель:** переиспользуемые клинические элементы.

Что **уже есть** (не трогаем):
- `lfk_exercises` + `lfk_exercise_media` — упражнения
- `lfk_complex_templates` + `lfk_complex_template_exercises` — комплексы ЛФК
- `content_pages` (section=lessons) — уроки

Что **создаём**:

| Сущность | Таблица | Поля (ключевые) |
|----------|---------|-----------------|
| Тест | `tests` | id, title, description, test_type, scoring_config JSONB, media, tags, is_archived, created_by |
| Набор тестов | `test_sets` | id, title, description, is_archived, created_by |
| Элемент набора | `test_set_items` | id, test_set_id FK, test_id FK, sort_order |
| Рекомендация | `recommendations` | id, title, body_md, media, tags, is_archived, created_by |

**Gate:** CRUD + doctor UI для каждой сущности. Тесты на сервисный слой.

### Фаза 3 — Шаблон программы (конструктор)

**Цель:** врач собирает план лечения.

| Таблица | Поля (ключевые) |
|---------|-----------------|
| `treatment_program_templates` | id, title, description, status (draft/published/archived), created_by, timestamps |
| `treatment_program_template_stages` | id, template_id FK, title, description, sort_order |
| `treatment_program_template_stage_items` | id, stage_id FK, item_type, item_ref_id UUID, sort_order, comment, settings JSONB |

`item_type` ∈ (`exercise`, `lfk_complex`, `recommendation`, `lesson`, `test_set`)

`item_ref_id` — UUID без FK constraint (полиморфная ссылка; валидация в сервисном слое).

**Gate:** конструктор этапов в doctor UI. Тесты на создание/редактирование шаблона.

### Фаза 4 — Экземпляр программы (назначение)

**Цель:** живая программа пациента.

| Таблица | Поля (ключевые) |
|---------|-----------------|
| `treatment_program_instances` | id, template_id nullable, patient_user_id FK, assigned_by FK, title, status, created_at, updated_at |
| `treatment_program_instance_stages` | id, instance_id FK, source_stage_id nullable, title, sort_order, description, local_comment, status (locked/available/in_progress/completed/skipped) |
| `treatment_program_instance_stage_items` | id, stage_id FK, item_type, item_ref_id, sort_order, comment, local_comment, settings JSONB, snapshot JSONB |

`snapshot JSONB` — замороженные данные блока на момент назначения.

`local_comment` — nullable TEXT, заполняется врачом для индивидуализации.

**Логика override комментариев:**
- Если `local_comment IS NOT NULL` → показываем `local_comment`.
- Иначе → показываем `comment` (из шаблона, скопированный при назначении).

**Gate:** назначение шаблона пациенту, просмотр программы, редактирование после назначения.

### Фаза 5 — Комментарии (единая таблица)

**Цель:** универсальный механизм комментариев для любых сущностей.

| Таблица | Поля |
|---------|------|
| `comments` | id, author_id FK, target_type TEXT, target_id UUID, comment_type TEXT, body TEXT, created_at, updated_at |

`target_type` ∈ (`exercise`, `lfk_complex`, `test`, `test_set`, `recommendation`, `lesson`, `stage_item_instance`, `stage_instance`, `program_instance`)

`comment_type` ∈ (`template`, `individual_override`, `clinical_note`)

Индекс: `(target_type, target_id)`.

Для мультитенанта: добавить `tenant_id` + индекс `(tenant_id, target_type, target_id)` при переходе.

**Gate:** UI-компонент `<CommentBlock>` переиспользуемый; тесты на CRUD.

### Фаза 6 — Прохождение и тесты

**Цель:** фиксация реального выполнения.

| Таблица | Поля |
|---------|------|
| `test_attempts` | id, instance_stage_item_id FK, patient_user_id FK, started_at, completed_at |
| `test_results` | id, attempt_id FK, test_id FK, raw_value JSONB, normalized_decision (passed/failed/partial), decided_by FK nullable, created_at |

Статусы этапов:
- `locked` → `available` → `in_progress` → `completed` / `skipped`
- При `completed` текущего → следующий становится `available`
- Ручной override через API (врач может открыть/пропустить этап)

**Gate:** трекинг прохождения, фиксация результатов тестов, переходы статусов.

### Фаза 7 — История изменений

**Цель:** клинически значимый audit trail.

| Таблица | Поля |
|---------|------|
| `treatment_program_events` | id, instance_id FK, actor_id FK, event_type TEXT, target_type TEXT, target_id UUID, payload JSONB, reason TEXT, created_at |

`event_type` ∈ (`item_added`, `item_removed`, `item_replaced`, `comment_changed`, `stage_added`, `stage_removed`, `stage_skipped`, `stage_completed`, `status_changed`, `test_completed`)

Запись событий — через сервисный слой при каждой мутации.

**Gate:** таймлайн изменений в doctor UI.

### Фаза 8 — Курс (коммерческий слой)

**Цель:** продажа программ без дублирования логики.

| Таблица | Поля |
|---------|------|
| `courses` | id, title, description, program_template_id FK, intro_lesson_page_id FK nullable, access_settings JSONB, status, price_minor, currency, timestamps |

При покупке: → создаётся `treatment_program_instance` (тот же движок из фазы 4).

Курс **не хранит** этапы. Курс **не дублирует** программу.

**Gate:** каталог курсов, покупка → создание экземпляра программы.

### Фаза 9 — Гибкие правки + интеграторная проекция

**Цель:** система становится клинически пригодной.

Что добавляем:
- API для мутаций программы пациента после начала прохождения
- Замена элемента, добавление/удаление этапа, реордер
- Все мутации пишут event в `treatment_program_events`
- Проекция в интегратор для бота

**Gate:** врач может менять программу после начала; история сохраняется; бот получает данные.

## Порядок (строго последовательно)

```
Фаза 0 (enforcement)
  ↓
Фаза 1 (Drizzle)
  ↓
Фаза 2 (библиотека блоков)
  ↓
Фаза 3 (шаблон программы)
  ↓
Фаза 4 (экземпляр программы)
  ↓
Фаза 5 (комментарии)
  ↓
Фаза 6 (прохождение)
  ↓
Фаза 7 (история)
  ↓
Фаза 8 (курс)
  ↓
Фаза 9 (гибкие правки)
```

**Не наоборот. Не параллельно.**

## Критерии входа / выхода

| Фаза | Вход | Выход |
|------|------|-------|
| 0 | — | ESLint rule green, cursor rule создан, backlog зафиксирован |
| 1 | Фаза 0 done | Drizzle работает, introspect done, CI green |
| 2 | Фаза 1 done | CRUD для tests/test_sets/recommendations, doctor UI, тесты |
| 3 | Фаза 2 done | Конструктор шаблонов, doctor UI, тесты |
| 4 | Фаза 3 done | Назначение, копирование, редактирование, doctor UI, тесты |
| 5 | Фаза 4 done | Единая таблица comments, UI-компонент, тесты |
| 6 | Фаза 4 done | Прохождение, тесты, статусы этапов |
| 7 | Фаза 4 done | Event log, таймлайн UI |
| 8 | Фаза 3 + 4 done | Каталог курсов, покупка → instance |
| 9 | Фаза 4 + 7 done | Мутации, события, проекция в интегратор |

## Что будет самым сложным

1. **Фаза 4** — копирование шаблона + snapshot + редактирование после назначения.
2. **TestResult** — универсальная модель оценки (raw JSONB + normalized decision).
3. **UI конструктора этапов** (фаза 3) — drag-and-drop, picker из библиотеки, preview.
4. **Фаза 9** — гибкие правки без поломки прошлых результатов.

## Документы для пересмотра по завершении

| Документ | Почему |
|----------|--------|
| `apps/webapp/src/app/api/api.md` | Новые API endpoints программ |
| `apps/webapp/src/app-layer/di/di.md` | Новые сервисы в deps |
| `docs/ARCHITECTURE/DB_STRUCTURE.md` | Новые таблицы |
| `docs/README.md` | Добавить ссылку на инициативу |
