# Execution rules — TREATMENT_PROGRAM_INITIATIVE

Жёсткие ограничения для агентов и разработчиков.

## Источник правил

- **Между коммитами:** `.cursor/rules/test-execution-policy.md` (step / phase).
- **Перед пушем:** `.cursor/rules/pre-push-ci.mdc` (`pnpm install --frozen-lockfile && pnpm run ci`).
- **Архитектура модулей:** `.cursor/rules/clean-architecture-module-isolation.mdc`.
- **Интеграционные ключи:** `.cursor/rules/000-critical-integration-config-in-db.mdc` (в DB, не в env).
- **Схема логики системы (исторический эталон):** `docs/archive/2026-05-initiatives/TREATMENT_PROGRAM_INITIATIVE/SYSTEM_LOGIC_SCHEMA.md` — сверять при изменениях домена; расхождение оформлять явно в постановке / LOG.

## Абсолютные запреты

1. **Не писать raw SQL для новых сущностей.** Только Drizzle ORM. Миграции через `drizzle-kit generate`.
2. **Не импортировать `@/infra/db/client` или `@/infra/repos/*` из `modules/*`.** Порты — через `modules/*/ports.ts`, реализация — в infra, инжекция — через DI (`buildAppDeps` или фабрика сервиса).
3. **Не помещать бизнес-логику в `route.ts`.** Route handler: parse → validate → auth → call service → HTTP response. Всё.
4. **Каталог ЛФК и шаблоны комплексов.** Шаблон комплекса для врача — **группировка упражнений** для быстрого добавления в **программы лечения**, а не отдельная конкурирующая предметная область. **Изменение схемы** таблиц `lfk_exercises`, `lfk_exercise_media`, `lfk_complex_templates`, `lfk_complex_template_exercises`, `lfk_complexes`, `lfk_complex_exercises`, `lfk_sessions`, `patient_lfk_assignments` **допускается**, если оформлено **Drizzle-миграциями**, согласовано с задачей и сопровождается проверками (тесты, накат, обратная совместимость или явный план cutover). Ранее действовавший запрет «не менять LFK-таблицы» был **этапным** (сузить scope, не раздувать ЛФК в сторонние сущности) и **снят**. **Не** вводить параллельный «движок ЛФК» в обход программ назначений без отдельного продуктового решения.
5. **Не создавать отдельный «движок курсов»** с собственной логикой этапов. Курс = ссылка на шаблон программы.
6. **Не делать FK на `item_ref_id`** — полиморфная ссылка. Валидация только в сервисном слое.
7. **Не смешивать фазы.** Каждая фаза — отдельные коммиты. Не начинать фазу N+1 до gate фазы N.
8. **Не менять GitHub CI workflow** без отдельного решения.

## Правила Drizzle

- Schema files живут в `apps/webapp/db/schema/` (или согласованный путь после установки).
- Каждая доменная область — отдельный schema file (`treatmentProgram.ts`, `tests.ts`, `comments.ts`, `courses.ts`).
- Типы: инферить из schema (`typeof table.$inferSelect`, `typeof table.$inferInsert`). Минимум ручных type-дублей.
- Миграции: `drizzle-kit generate` → применение на БД: **`pnpm --dir apps/webapp run migrate`** (канонический вход: Drizzle через `scripts/run-webapp-drizzle-migrate.mjs`) или **`pnpm --dir apps/webapp run db:migrate:drizzle`** (тот же `drizzle-kit migrate`). Deploy вызывает `migrate` без изменений deploy-скриптов. Не ручной SQL для новых сущностей. Исключение: seed data. Если SQL из журнала уже накатан вручную, а `drizzle.__drizzle_migrations` пуст — `pnpm --dir apps/webapp run db:seed-drizzle-meta` (только метаданные, без повторного DDL).
- Legacy SQL из `apps/webapp/migrations/*.sql` больше не является частью канона `migrate`; при необходимости этого пути используй **`pnpm --dir apps/webapp run migrate:legacy`**. На **пустой** БД обычно: сначала `migrate:legacy`, затем `migrate` (Drizzle).
- Relations: описывать в schema (Drizzle `relations()`).
- **`drizzle-kit introspect`:** используй `pnpm --dir apps/webapp run db:introspect` — после introspect автоматически запускается скрипт исправления известного бага генератора (пустые string defaults). При необходимости только правка: `pnpm --dir apps/webapp run db:introspect:fix`.
- **Проверка снимка схемы `public` vs файлы:** при наличии `DATABASE_URL` — `pnpm --dir apps/webapp run db:verify-public-table-count` и при необходимости `pnpm --dir apps/webapp exec drizzle-kit check`.
- **Smoke Drizzle read** в полном виде не входит в обычный `pnpm test` webapp (БД обнулена в Vitest без `USE_REAL_DATABASE=1`). Для проверки с реальной БД: `USE_REAL_DATABASE=1 pnpm --dir apps/webapp exec vitest run src/app-layer/db/drizzle.smoke.test.ts` или `pnpm --dir apps/webapp run test:with-db` по необходимости — без обязательного включения в CI без отдельного решения.

## Правила модульной архитектуры

Для каждой новой сущности:

```
modules/<domain>/
  ├── service.ts     — use-cases (бизнес-логика)
  ├── ports.ts       — интерфейсы портов (DB contract)
  └── types.ts       — доменные типы (если Drizzle infer недостаточен)
```

- Сервис получает порт (или Drizzle db instance) через DI — **никогда** через прямой import infra.
- Порт описывает contract: `list`, `getById`, `create`, `update`, `delete`, domain-specific queries.
- При использовании Drizzle напрямую в сервисе — db instance инжектируется, не вызывается `getPool()`.

## Правила route handlers

```typescript
// Правильно:
export async function POST(request: NextRequest) {
  const session = await requireRole("doctor");
  const body = schema.parse(await request.json());
  const deps = buildAppDeps();
  const result = await deps.treatmentPrograms.assignToPatient(body);
  return NextResponse.json({ ok: true, data: result });
}

// Неправильно:
export async function POST(request: NextRequest) {
  const pool = getPool(); // ← ЗАПРЕТ
  const rows = await pool.query("SELECT ..."); // ← ЗАПРЕТ
  // бизнес-логика прямо в route ← ЗАПРЕТ
}
```

## Валидация (уровни)

- **Step:** Vitest по затронутым файлам + typecheck `apps/webapp`.
- **Phase:** полный `pnpm test:webapp` после закрытия логической фазы.
- **Full CI:** `pnpm install --frozen-lockfile && pnpm run ci` перед пушем.

## Отчётность

- Каждая фаза: дата, что сделано, gate verdict — в `LOG.md` (активная инициатива или архивная копия).
- Каждый аудит: отчёт в `AUDIT_PHASE_N.md` с MANDATORY FIX INSTRUCTIONS.
- Каждое изменение schema: зафиксировать в `LOG.md` (таблица, поля, индексы).

## Сверка с эталоном

Перед закрытием каждой фазы агент **по возможности** сверяет результат с историческим `SYSTEM_LOGIC_SCHEMA.md` (архив инициативы, путь выше):

1. Таблицы/поля соответствуют схеме или отклонение задокументировано?
2. Типы элементов (`item_type`) соответствуют перечню?
3. Статусы этапов соответствуют диаграмме?
4. Override комментариев работает по описанной логике?
5. Events записываются при каждой мутации?

При намеренных изменениях домена эталон обновляют в постановке / журнале, а не блокируют работу формулировкой «никогда не менять DDL ЛФК».
