# AUDIT — Фаза 5 (единая таблица `comments`)

**Дата аудита:** 2026-04-18.  
**Дата FIX (закрытие MANDATORY / верификация):** 2026-04-18.  
**Вход:** `SYSTEM_LOGIC_SCHEMA.md` § 7 (структура `comments`, индекс по target, примечание о мультитенанте).  
**Scope:** `apps/webapp/db/schema/entityComments.ts`, миграция `db/drizzle-migrations/0004_entity_comments.sql`; `apps/webapp/src/modules/comments/*`; `buildAppDeps().comments`; `apps/webapp/src/infra/repos/pgComments.ts`, `inMemoryComments.ts`, `app-layer/testing/commentsInMemory.ts`; `apps/webapp/src/app/api/doctor/comments/**`; `apps/webapp/src/components/comments/CommentBlock.tsx`; встраивание в экран экземпляра программы.

**Метод:** статический обзор кода и сигнатур тестов модуля/API; **полный прогон тестов репозитория не выполнялся**.

---

## Краткий вердикт

| # | Проверка | Статус |
|---|-----------|--------|
| 1 | Таблица `comments` в Drizzle: `author_id`, `target_type`, `target_id`, `comment_type`, `body`, timestamps (§ 7) | **PASS** |
| 2 | Индекс `(target_type, target_id)` и выборки по target | **PASS** |
| 3 | Изоляция `modules/comments/` (без `@/infra/*`) | **PASS** |
| 4 | CRUD: создание, чтение списка/одной строки, обновление, удаление | **PASS** |
| 5 | `<CommentBlock />` переиспользуемый, дублирования логики API на экранах нет | **PASS** |

---

## 1) Таблица `comments` в Drizzle — § 7

### Verdict: **PASS**

| Требование § 7 | Реализация |
|----------------|------------|
| `author_id` → `platform_users` | `author_id` NOT NULL, FK `comments_author_id_fkey`, `ON DELETE restrict` (`entityComments.ts`, `0004_entity_comments.sql`). |
| `target_type` (перечисление § 7) | `text` + CHECK `comments_target_type_check` — набор значений совпадает с эталоном (`exercise`, `lfk_complex`, `test`, `test_set`, `recommendation`, `lesson`, `stage_item_instance`, `stage_instance`, `program_instance`). |
| `target_id` UUID, без FK | `uuid("target_id").notNull()`, полиморфная ссылка. |
| `comment_type` | CHECK: `template` \| `individual_override` \| `clinical_note`. |
| `body` | `text().notNull()`. |
| `created_at`, `updated_at` | `timestamp with time zone`, `defaultNow()`, режим `string` в Drizzle. |

**Дополнительно:** суррогатный **`id` UUID PK** (`defaultRandom`) — в § 7 в дереве не назван явно; необходим для адресации строк при PATCH/DELETE.

**Источник правды:** `apps/webapp/db/schema/entityComments.ts`; SQL — `0004_entity_comments.sql`.

---

## 2) Индекс `(target_type, target_id)` и выборки

### Verdict: **PASS**

| Проверка | Результат |
|----------|-----------|
| Индекс в DDL | `CREATE INDEX "idx_comments_target_type_target_id" ON "comments" ... ("target_type", "target_id")`. |
| Индекс в Drizzle | `index("idx_comments_target_type_target_id").using("btree", table.targetType, table.targetId)`. |
| Запрос по target | `pgComments.listByTarget`: `where(and(eq(targetType), eq(targetId)))`, сортировка `createdAt`, `id`. |

Предикат равенства по **обоим** столбцам индекса соответствует типичному использованию btree по префиксу `(target_type, target_id)`; принудительный `EXPLAIN` в CI не зафиксирован (см. optional в MANDATORY).

---

## 3) Изоляция `modules/comments/`

### Verdict: **PASS**

| Проверка | Результат |
|----------|-----------|
| `rg '@/infra' apps/webapp/src/modules/comments` | **Нет совпадений** (на дату аудита). |
| Структура | `types.ts`, `ports.ts`, `service.ts` — контракт и валидация; реализации портов в `infra/repos/*`, подключение через `buildAppDeps`. |

Согласовано с `SYSTEM_LOGIC_SCHEMA.md` § 12 (бизнес-логика в `modules/*`, доступ к БД в infra).

---

## 4) CRUD по target и по `id`

### Verdict: **PASS**

| Операция | Сервис | Порт PG | API doctor |
|----------|--------|---------|------------|
| Create | `create(input, authorId)`, проверка enum/UUID/непустой `body` | `insert` + `returning` | `POST /api/doctor/comments`, `authorId` из сессии |
| List по target | `listByTarget(targetType, targetId)` | см. §2 | `GET /api/doctor/comments?targetType=&targetId=` |
| Read one | `getById` | `select` по `id` | `GET /api/doctor/comments/[id]` |
| Update | `update(id, patch)` | `update`, обновление `updatedAt` | `PATCH .../[id]`, автор комментария или `admin` |
| Delete | `delete(id)` | `delete` | `DELETE .../[id]`, автор или `admin` |

**Тесты:** `modules/comments/service.test.ts` (в т.ч. изоляция `listByTarget` по `target_type` + `target_id`); `app/api/doctor/comments/route.test.ts`; `app/api/doctor/comments/[id]/route.test.ts` — прогон в цикле FIX, см. «AUDIT_PHASE_5 FIX — верификация».

---

## 5) `<CommentBlock />`: переиспользуемость

### Verdict: **PASS**

| Критерий | Оценка |
|----------|--------|
| Единая реализация | `CommentBlock.tsx` — загрузка списка, POST/PATCH/DELETE к `/api/doctor/comments`; типы из `modules/comments/types`. |
| Контракт | Пропсы `targetType`, `targetId`, `currentUserId`, опционально `isAdmin`, `title` — покрывают любой target из § 7. |
| Дублирование на экранах | Поиск по репозиторию: **единственный** импорт `CommentBlock` — `TreatmentProgramInstanceDetailClient.tsx`; отдельных обходных вызовов того же CRUD для doctor comments **нет**. |
| Практика на будущее | JSDoc на экспорте: новые экраны должны подключать **этот** компонент, а не копировать fetch. |

На дату аудита блок подключён к **одному** экрану; это не противоречит требованию переиспользуемости.

---

## 6) Сверка с `SYSTEM_LOGIC_SCHEMA.md` § 7 (прочее)

| Пункт § 7 | Статус |
|-----------|--------|
| Структура и enum’ы | **OK** |
| Индекс `(target_type, target_id)` | **OK** |
| `tenant_id` и индекс `(tenant_id, target_type, target_id)` | **Не реализовано** — в § 7 явно «при мультитенанте»; **defer** |
| Связь с `comment_changed` / § 8 | Таблица `comments` **не заменяет** события программы; события по элементам экземпляра — фаза 7 |

---

## Gate (фаза 5)

| Критерий | Статус |
|----------|--------|
| Drizzle + миграция `0004_*` | **OK** |
| Индекс и `listByTarget` | **OK** |
| Изоляция `modules/comments` | **OK** |
| CRUD + маршруты | **OK** |
| `CommentBlock` без дублирования логики | **OK** |
| Миграция на окружениях | **Defer (операционно)** |

---

## MANDATORY FIX INSTRUCTIONS

**Critical / major:** **нет** — по результатам аудита блокирующих расхождений с § 7 (поля, CHECK, индекс, полиморфный target, слой модуля) не выявлено. **Статус FIX:** закрыто формально **N/A** (исправлять нечего).

| # | Severity | Инструкция | Статус |
|---|----------|------------|--------|
| 1 | informational | **ACL по `target_id`:** § 7 не задаёт права доступа; при продуктовом требовании «врач видит только своих пациентов» добавить проверку владения целью в `GET/POST .../comments` (и при необходимости при `GET` по `[id]` через target строки). Сейчас паттерн сопоставим с другими doctor API экземпляра программы. | **Defer (продукт)** — не расхождение с § 7; вне scope FIX. |
| 2 | informational | **`tenant_id`** (§ 7): ввести колонку и индекс `(tenant_id, target_type, target_id)` при мультитенанте; фильтрация во всех запросах. | **Defer** — § 7: «при мультитенанте»; вне scope фазы 5. |
| 3 | informational | **События § 8:** при необходимости аудита в `treatment_program_events` — фаза 7. | **Defer фаза 7** |
| 4 | informational | Миграция **`0004_entity_comments.sql`** на окружениях: `pnpm --dir apps/webapp run db:migrate:drizzle` или процесс DevOps. | **Defer (операционно)** — см. `EXECUTION_RULES.md`, `LOG.md`. |
| 5 | optional (minor) | **Наблюдаемость:** при росте объёма — на стенде `EXPLAIN (ANALYZE, BUFFERS)` для `listByTarget`; ожидается использование `idx_comments_target_type_target_id`. | **Defer (обоснованно)** — индекс и предикат `listByTarget` уже согласованы; ручной EXPLAIN не входит в gate § 7 и не требуется без нагрузочного триггера. |

**Уже усилено в коде (не требует повторного FIX):** тест изоляции `listByTarget` в `service.test.ts`; JSDoc у `CommentBlock` о политике переиспользования.

---

## AUDIT_PHASE_5 FIX — верификация (2026-04-18)

| Пункт | Результат |
|-------|-----------|
| Critical / major | **N/A** — в MANDATORY не заводились; повторная сверка `entityComments.ts`, `0004_entity_comments.sql`, `pgComments.ts` с § 7 — без отклонений. |
| #1–#4 informational | **Defer** — зафиксировано в таблице MANDATORY; код не менялся. |
| #5 optional (minor) EXPLAIN | **Defer (обоснованно)** — см. статус в таблице. |

**Перепроверка после FIX:**

- **Схема § 7:** поля, CHECK `target_type` / `comment_type`, FK `author_id`, `idx_comments_target_type_target_id` — совпадение Drizzle и миграции.
- **CRUD по target:** `listByTarget` с `eq(targetType)` + `eq(targetId)`; остальные операции — см. § 4.
- **`CommentBlock`:** единственный импорт в `TreatmentProgramInstanceDetailClient.tsx`; вызовы `/api/doctor/comments` только в `CommentBlock.tsx` среди TSX.

**Проверки в цикле FIX (без `pnpm test:webapp` / полного CI):**

- `rg '@/infra' apps/webapp/src/modules/comments` — **пусто**
- `pnpm --dir apps/webapp exec vitest run` — `service.test.ts`, `comments/route.test.ts`, `comments/[id]/route.test.ts` — **16 passed** (3 files)
- `pnpm --dir apps/webapp run lint` — **PASS**
- `pnpm --dir apps/webapp run typecheck` — **PASS**
- `pnpm run build:webapp` — **PASS**
- `pnpm run audit` — **FAIL** (`esbuild`, `drizzle-orm` — известный класс lockfile, не следствие фазы 5)

---

## Команды для повторной проверки (точечно)

```bash
rg '@/infra' apps/webapp/src/modules/comments
rg 'CommentBlock' apps/webapp/src --glob '*.tsx'
pnpm --dir apps/webapp exec vitest run src/modules/comments/service.test.ts src/app/api/doctor/comments/route.test.ts src/app/api/doctor/comments/\[id\]/route.test.ts
```

---

## Заключение

Фаза 5 **соответствует** **`SYSTEM_LOGIC_SCHEMA.md` § 7** по составу таблицы `comments`, ограничениям CHECK, индексу на `(target_type, target_id)` и использованию этого предиката в `listByTarget`. Модуль **`modules/comments`** не импортирует `@/infra/*`. CRUD реализован в сервисе и doctor API; **`CommentBlock`** — единая точка UI для тех же эндпоинтов без дублирования на других экранах. **FIX:** critical/major **N/A**; **minor** (optional EXPLAIN) — **обоснованный defer**; остальное MANDATORY — **informational defer** (ACL, мультитенант, события, миграция на стендах). Продуктовый gate: **PASS** при точечных тестах и `build:webapp`; **`pnpm run audit`** — отдельная политика зависимостей.
