# Промпты для агентов (copy-paste)

Контекст инициативы:

- Master plan: `docs/TREATMENT_PROGRAM_INITIATIVE/MASTER_PLAN.md`
- Правила исполнения: `docs/TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md`
- Эталон логики системы: `docs/TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md`
- Legacy backlog: `docs/TREATMENT_PROGRAM_INITIATIVE/LEGACY_CLEANUP_BACKLOG.md`
- LOG: `docs/TREATMENT_PROGRAM_INITIATIVE/LOG.md`

Общие правила для всех запусков:

1. Фазы **строго последовательны**: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. Не параллельно.
2. Новый код — **только Drizzle ORM**. Запрещён raw SQL для новых сущностей.
3. Модули изолированы: `modules/*` не импортирует `@/infra/db/client` и `@/infra/repos/*`.
4. Route handlers — тонкие: parse → validate → auth → call service → HTTP response.
5. Проверки между коммитами: step/phase по `.cursor/rules/test-execution-policy.md`.
6. Пуш: `pnpm install --frozen-lockfile && pnpm run ci` (`.cursor/rules/pre-push-ci.mdc`).
7. GitHub CI и деплой: **не менять** `.github/workflows/ci.yml`.
8. После каждого EXEC/FIX обновляй `LOG.md`.
9. Каждый AUDIT содержит **MANDATORY FIX INSTRUCTIONS** (severity: critical/major/minor).
10. **Перед закрытием фазы** — сверить результат с `SYSTEM_LOGIC_SCHEMA.md`.

Файлы аудита (создавай в каталоге инициативы):

| Назначение | Файл |
|------------|------|
| Аудит фазы N | `docs/TREATMENT_PROGRAM_INITIATIVE/AUDIT_PHASE_N.md` (где N — номер фазы) |
| Pre-deploy | `docs/TREATMENT_PROGRAM_INITIATIVE/AUDIT_PRE_DEPLOY_PHASE_N.md` |
| Финальный | `docs/TREATMENT_PROGRAM_INITIATIVE/AUDIT_FINAL.md` |

---

## ФАЗА 0 — EXEC (enforcement)

```text
Выполни фазу 0 инициативы TREATMENT_PROGRAM_INITIATIVE (enforcement).

Вход:
- docs/TREATMENT_PROGRAM_INITIATIVE/MASTER_PLAN.md
- docs/TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md
- docs/TREATMENT_PROGRAM_INITIATIVE/LEGACY_CLEANUP_BACKLOG.md

Сделай:
1) Убедись что ESLint rule `no-restricted-imports` для `@/infra/db/client` и `@/infra/repos/*` уже добавлен в конфиг webapp.
2) Убедись что cursor rule `clean-architecture-module-isolation.mdc` существует.
3) Убедись что LEGACY_CLEANUP_BACKLOG.md содержит полный allowlist.
4) Проверки: step — lint pass на текущем коде.

Обнови LOG.md.
```

## ФАЗА 0 — AUDIT

```text
Проведи аудит фазы 0.

Проверь:
1) ESLint rule корректен — lint проходит на текущем коде, но ловит новый `@/infra` в modules/*.
2) Cursor rule содержит все ключевые запреты из EXECUTION_RULES.md.
3) LEGACY_CLEANUP_BACKLOG.md полон — все 23 файла modules/* и 48 route.ts.

Сохрани: docs/TREATMENT_PROGRAM_INITIATIVE/AUDIT_PHASE_0.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

---

## ФАЗА 1 — EXEC (Drizzle ORM)

```text
Выполни фазу 1 инициативы TREATMENT_PROGRAM_INITIATIVE (Drizzle ORM setup).

Вход:
- docs/TREATMENT_PROGRAM_INITIATIVE/MASTER_PLAN.md (фаза 1)
- docs/TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md

Сделай:
1) Установи drizzle-orm и drizzle-kit в apps/webapp.
2) Создай drizzle.config.ts с подключением к существующему pool.
3) Выполни drizzle-kit introspect для генерации schema из текущей БД.
4) Помести schema файлы в apps/webapp/db/schema/.
5) Smoke-тест: выполни один простой read-запрос через Drizzle (не ломая старый код).
6) Проверки: step — typecheck + lint; phase — pnpm test:webapp.

Обнови LOG.md.
```

## ФАЗА 1 — AUDIT

```text
Проведи аудит фазы 1.

Проверь:
1) drizzle-orm и drizzle-kit в зависимостях apps/webapp/package.json.
2) drizzle.config.ts корректен и ссылается на правильный DATABASE_URL.
3) Schema files отражают все существующие таблицы.
4) Smoke-тест работает.
5) Существующие тесты не сломаны.

Сверь с SYSTEM_LOGIC_SCHEMA.md § 12 (архитектурные слои).

Сохрани: docs/TREATMENT_PROGRAM_INITIATIVE/AUDIT_PHASE_1.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

---

## ФАЗА 2 — EXEC (библиотека блоков)

```text
Выполни фазу 2 инициативы TREATMENT_PROGRAM_INITIATIVE (библиотека блоков).

Вход:
- docs/TREATMENT_PROGRAM_INITIATIVE/MASTER_PLAN.md (фаза 2)
- docs/TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md (§ 4 типы элементов)
- docs/TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md

Сделай:
1) Создай Drizzle schema: tests, test_sets, test_set_items, recommendations.
2) Сгенерируй миграции: drizzle-kit generate.
3) Создай модуль modules/tests/ (service.ts, ports.ts, types.ts).
4) Создай модуль modules/recommendations/ (service.ts, ports.ts, types.ts).
5) Подключи к buildAppDeps.
6) Создай API endpoints (CRUD) для doctor.
7) Создай doctor UI (формы по аналогии с exercises).
8) Тесты на сервисный слой.
9) Проверки: step после каждого модуля; phase — pnpm test:webapp.

Обнови LOG.md. Сверь с SYSTEM_LOGIC_SCHEMA.md.
```

## ФАЗА 2 — AUDIT

```text
Проведи аудит фазы 2.

Проверь:
1) Таблицы tests, test_sets, test_set_items, recommendations созданы в Drizzle schema.
2) Модули modules/tests/ и modules/recommendations/ изолированы (нет @/infra/*).
3) Route handlers тонкие (нет бизнес-логики).
4) CRUD работает (тесты проходят).
5) Doctor UI отображает и позволяет CRUD.

Сверь с SYSTEM_LOGIC_SCHEMA.md § 4 (типы элементов, snapshot).

Сохрани: docs/TREATMENT_PROGRAM_INITIATIVE/AUDIT_PHASE_2.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

---

## ФАЗА 3 — EXEC (шаблон программы)

```text
Выполни фазу 3 инициативы TREATMENT_PROGRAM_INITIATIVE (шаблон программы).

Вход:
- docs/TREATMENT_PROGRAM_INITIATIVE/MASTER_PLAN.md (фаза 3)
- docs/TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md (§ 1-4)

Сделай:
1) Создай Drizzle schema: treatment_program_templates, treatment_program_template_stages, treatment_program_template_stage_items.
2) Сгенерируй миграции.
3) Создай модуль modules/treatment-program/ (service.ts, ports.ts, types.ts).
4) Реализуй: создание шаблона, добавление этапов, добавление элементов в этапы.
5) item_type ∈ (exercise, lfk_complex, recommendation, lesson, test_set).
6) item_ref_id — UUID без FK, валидация в сервисе.
7) Подключи к buildAppDeps.
8) API endpoints для doctor.
9) Doctor UI: конструктор этапов (список этапов, список элементов, picker из библиотеки).
10) Тесты на сервисный слой.

Обнови LOG.md. Сверь с SYSTEM_LOGIC_SCHEMA.md.
```

## ФАЗА 3 — AUDIT

```text
Проведи аудит фазы 3.

Проверь:
1) Таблицы шаблона созданы по SYSTEM_LOGIC_SCHEMA.md § 1.
2) item_type перечень соответствует § 4.
3) Повторение элементов между этапами работает без конфликтов.
4) Модуль modules/treatment-program/ изолирован.
5) Конструктор позволяет: добавить этап, добавить элемент, переупорядочить, удалить.

Сохрани: docs/TREATMENT_PROGRAM_INITIATIVE/AUDIT_PHASE_3.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

---

## ФАЗА 4 — EXEC (экземпляр программы)

```text
Выполни фазу 4 инициативы TREATMENT_PROGRAM_INITIATIVE (экземпляр программы).

Вход:
- docs/TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md (§ 5-6, 11)

Сделай:
1) Создай Drizzle schema: treatment_program_instances, treatment_program_instance_stages, treatment_program_instance_stage_items.
2) Реализуй deep copy из шаблона: stages → items → snapshot + comment.
3) local_comment = NULL при создании; comment = скопирован из шаблона.
4) snapshot JSONB — данные блока на момент копирования.
5) Первый этап: status=available, остальные: locked.
6) API: назначить шаблон пациенту, просмотр программы, редактирование.
7) Doctor UI: просмотр программы пациента, override комментария.
8) Тесты на копирование, на override логику.

Обнови LOG.md. Сверь с SYSTEM_LOGIC_SCHEMA.md § 5-6.
```

## ФАЗА 4 — AUDIT

```text
Проведи аудит фазы 4.

Проверь:
1) Deep copy работает: snapshot, comment, local_comment, settings.
2) После копирования экземпляр независим от шаблона (изменение шаблона не влияет).
3) Override комментариев: local_comment приоритет над comment — по § 6.
4) Статусы этапов: первый available, остальные locked — по § 3.
5) Модуль изолирован.

Сверь с SYSTEM_LOGIC_SCHEMA.md § 3, 5, 6, 11.

Сохрани: docs/TREATMENT_PROGRAM_INITIATIVE/AUDIT_PHASE_4.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

---

## ФАЗА 5 — EXEC (комментарии)

```text
Выполни фазу 5 инициативы TREATMENT_PROGRAM_INITIATIVE (единая таблица комментариев).

Вход:
- docs/TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md (§ 7)

Сделай:
1) Создай Drizzle schema: comments (author_id, target_type, target_id, comment_type, body, timestamps).
2) Индекс (target_type, target_id).
3) Модуль modules/comments/ (service.ts, ports.ts).
4) Переиспользуемый UI-компонент <CommentBlock targetType="..." targetId="..." />.
5) API endpoints (CRUD по target).
6) Тесты.

Обнови LOG.md. Сверь с SYSTEM_LOGIC_SCHEMA.md § 7.
```

---

## ФАЗА 6 — EXEC (прохождение и тесты)

```text
Выполни фазу 6 инициативы TREATMENT_PROGRAM_INITIATIVE (прохождение).

Вход:
- docs/TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md (§ 3)

Сделай:
1) Создай Drizzle schema: test_attempts, test_results.
2) Реализуй логику статусов этапов: locked → available → in_progress → completed/skipped.
3) Автопереход: completed текущего → available следующего.
4) Ручной override: врач может открыть/пропустить (reason обязателен для skip).
5) test_results: raw_value JSONB, normalized_decision (passed/failed/partial), decided_by.
6) Patient UI: отображение статусов, прохождение тестов.
7) Doctor UI: результаты тестов, управление статусами.
8) Тесты на переходы статусов, на запись результатов.

Обнови LOG.md. Сверь с SYSTEM_LOGIC_SCHEMA.md § 3.
```

---

## ФАЗА 7 — EXEC (история)

```text
Выполни фазу 7 инициативы TREATMENT_PROGRAM_INITIATIVE (история изменений).

Вход:
- docs/TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md (§ 8)

Сделай:
1) Создай Drizzle schema: treatment_program_events.
2) Реализуй запись событий при каждой мутации (добавление, удаление, замена, skip, complete, comment_changed).
3) reason обязателен для stage_skipped, item_removed.
4) Doctor UI: таймлайн изменений программы пациента.
5) Тесты на запись событий.

Обнови LOG.md. Сверь с SYSTEM_LOGIC_SCHEMA.md § 8.
```

---

## ФАЗА 8 — EXEC (курс)

```text
Выполни фазу 8 инициативы TREATMENT_PROGRAM_INITIATIVE (курс).

Вход:
- docs/TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md (§ 9, 10)

Сделай:
1) Создай Drizzle schema: courses.
2) Курс ссылается на treatment_program_templates.id.
3) При «покупке» — вызвать тот же сервис назначения из фазы 4 (создать treatment_program_instance).
4) Курс НЕ хранит этапы, НЕ имеет своей логики прохождения.
5) Уроки: непубличная секция content_pages (course_lessons), requires_auth=true.
6) Patient UI: каталог курсов.
7) Тесты.

Обнови LOG.md. Сверь с SYSTEM_LOGIC_SCHEMA.md § 9, 10.
```

---

## ФАЗА 9 — EXEC (гибкие правки + интегратор)

```text
Выполни фазу 9 инициативы TREATMENT_PROGRAM_INITIATIVE (гибкие правки + интеграторная проекция).

Вход:
- docs/TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md (§ 8, 11)

Сделай:
1) API для мутаций после начала прохождения: заменить элемент, добавить/удалить этап, реордер.
2) Мутации не ломают прошлые результаты (completed stage_items сохраняются).
3) Все мутации пишут event в treatment_program_events (фаза 7).
4) Проекция в интегратор: endpoint или расширение /api/integrator/diary/lfk-complexes.
5) Тесты на мутации + event recording.

Обнови LOG.md. Сверь с SYSTEM_LOGIC_SCHEMA.md.
```

---

## PRE-DEPLOY (перед пушем после любой фазы)

```text
Проведи pre-deploy аудит перед пушем после фазы N.

Проверь:
1) Нет @/infra/* в новых modules/* файлах (ESLint должен ловить).
2) Все новые таблицы через Drizzle schema.
3) SYSTEM_LOGIC_SCHEMA.md соответствует реализации.
4) Нет правок GitHub workflow.
5) Выполни: pnpm install --frozen-lockfile && pnpm run ci.

Сохрани: docs/TREATMENT_PROGRAM_INITIATIVE/AUDIT_PRE_DEPLOY_PHASE_N.md
```

---

## FINAL AUDIT

```text
Проведи финальный аудит инициативы TREATMENT_PROGRAM_INITIATIVE.

Проверь:
1) Все фазы 0-9 закрыты (gate verdict PASS в LOG.md).
2) Результат соответствует SYSTEM_LOGIC_SCHEMA.md (контрольная таблица § 13).
3) Нет нарушений module isolation (ESLint clean для нового кода).
4) Все таблицы через Drizzle.
5) Документация обновлена (api.md, di.md, DB_STRUCTURE.md).
6) CI green.

Сохрани: docs/TREATMENT_PROGRAM_INITIATIVE/AUDIT_FINAL.md
```

---

## Порядок использования (кратко)

```
ФАЗА 0: EXEC → AUDIT → FIX → gate
ФАЗА 1: EXEC → AUDIT → FIX → gate
ФАЗА 2: EXEC → AUDIT → FIX → PRE-DEPLOY → push → gate
...
ФАЗА 9: EXEC → AUDIT → FIX → PRE-DEPLOY → push
FINAL AUDIT → FINAL FIX
```

Каждая фаза: EXEC → AUDIT → FIX (закрыть critical/major) → PRE-DEPLOY перед пушем.
