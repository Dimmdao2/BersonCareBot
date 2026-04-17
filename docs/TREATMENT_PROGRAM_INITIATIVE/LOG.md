# LOG — TREATMENT_PROGRAM_INITIATIVE

## 2026-04-17 — инициатива создана

**Сделано:**
- Создана папка `docs/TREATMENT_PROGRAM_INITIATIVE/` с полным комплектом документации.
- `MASTER_PLAN.md` — 10 фаз, критерии, порядок.
- `SYSTEM_LOGIC_SCHEMA.md` — эталон логики: таблицы, потоки, статусы, типы элементов, копирование, override, events, курсы.
- `EXECUTION_RULES.md` — жёсткие правила для агентов.
- `PROMPTS_EXEC_AUDIT_FIX.md` — промпты EXEC/AUDIT/FIX для каждой фазы.
- `LEGACY_CLEANUP_BACKLOG.md` — allowlist legacy modules/* + исторический перечень routes в архиве.
- ESLint rule `no-restricted-imports` добавлен в `apps/webapp/eslint.config.mjs` — lint проходит на текущем коде; новые нарушения ловятся.
- Cursor rule `.cursor/rules/clean-architecture-module-isolation.mdc` — запрет прямого infra-доступа из модулей.

**Проверки:**
- `npx eslint src/modules/` — PASS (0 errors) — allowlist корректен.
- Ручная проверка: `channelLink.ts` без allowlist даёт 4 ошибки (getPool + 3 infra imports) — rule работает.

**Следующий шаг:** Фаза 0 EXEC (верификация enforcement) → Фаза 1 (Drizzle).

---

## 2026-04-18 — Фаза 0 (enforcement) — закрыта

**Сделано:**
- Проверено: ESLint `no-restricted-imports` в `apps/webapp/eslint.config.mjs` — для `src/modules/**/*.ts(x)` паттерны `@/infra/db/*`, `@/infra/db/client`, `@/infra/repos/*`; allowlist legacy-файлов синхронизирован с документом.
- Добавлено то же ограничение для `src/app/api/**/route.ts` (MASTER_PLAN 0.1); на текущем коде нарушений нет — отдельный allowlist для routes не используется.
- Проверено: `.cursor/rules/clean-architecture-module-isolation.mdc` существует (`alwaysApply: true`).
- `LEGACY_CLEANUP_BACKLOG.md` — таблица A дополнена строкой `modules/lessons/service.ts` (29 файлов = список в ESLint overrides); секция B уточнена: исторический allowlist в архиве + регрессия через ESLint для API routes.

**Gate (Фаза 0):** `pnpm --dir apps/webapp run lint` — PASS.

**Следующий шаг:** Фаза 1 (Drizzle ORM) по MASTER_PLAN.

---

## 2026-04-18 — FIX аудита фазы 0: defer по списку 48 маршрутов

**Сделано:** в `AUDIT_PHASE_0.md` и `LEGACY_CLEANUP_BACKLOG.md` (секция B) зафиксировано: маршруты с историческим нарушением boundary **уже исправлены**; **восстановление формального списка 48 путей из git не делаем** — опциональный план аудита **устарел**, defer окончательный. MANDATORY FIX #4 и gate-строка обновлены согласно этому.

**Gate (документация):** согласовано с фактом: `rg` по `**/route.ts` без прямых `@/infra/*`, ESLint на routes без allowlist.

---

## 2026-04-18 — Фаза 1 (Drizzle ORM setup) — выполнено

**Сделано:**
- Зависимости: `drizzle-orm`, dev `drizzle-kit` в `apps/webapp/package.json` (+ lockfile).
- `apps/webapp/drizzle.config.ts` — PostgreSQL, `DATABASE_URL` из `.env.dev` / `.env` (как `loadEnv`), schema `./db/schema`, артефакты миграций Drizzle `./db/drizzle-migrations` (**отдельно** от существующих SQL `apps/webapp/migrations/`).
- `pnpm exec drizzle-kit introspect` → снимок схемы `public`; таблицы и связи в `apps/webapp/db/schema/schema.ts`, `relations.ts`, реэкспорт `index.ts`.
- После генерации исправлены сломанные литералы **пустых строк по умолчанию** (`drizzle-kit` вывел `.default(')` вместо `.default('')`) — массовая замена в `schema.ts`.
- Обёртка **`getDrizzle()`** в `src/app-layer/db/drizzle.ts` использует тот же `Pool`, что и `getPool()` (без второго подключения).
- Smoke: `src/app-layer/db/drizzle.smoke.test.ts` — `SELECT 1` через `sql`; в обычном CI пропуск (`it.skipIf` без `USE_REAL_DATABASE`); с `USE_REAL_DATABASE=1` выполняется и проходит локально.
- Скрипт `pnpm --dir apps/webapp run db:introspect` → `drizzle-kit introspect`.

**Проверки:**
- Step: `pnpm --dir apps/webapp run typecheck`, `pnpm --dir apps/webapp run lint` — PASS.
- Phase: `pnpm test:webapp` — PASS (`355 passed | 5 skipped`).
- Smoke с БД: `USE_REAL_DATABASE=1 pnpm --dir apps/webapp exec vitest run src/app-layer/db/drizzle.smoke.test.ts` — PASS.

**Gate verdict (Фаза 1):** PASS по lint + typecheck + полным тестам webapp; перед пушем по регламенту репозитория — полный `pnpm install --frozen-lockfile && pnpm run ci`.

**Следующий шаг:** Фаза 2 (библиотека блоков) после gate/аудита по промптам инициативы.
