# LOG — TREATMENT_PROGRAM_INITIATIVE

## 2026-04-17 — инициатива создана

**Сделано:**
- Создана папка `docs/TREATMENT_PROGRAM_INITIATIVE/` с полным комплектом документации.
- `MASTER_PLAN.md` — 10 фаз, критерии, порядок.
- `SYSTEM_LOGIC_SCHEMA.md` — эталон логики: таблицы, потоки, статусы, типы элементов, копирование, override, events, курсы.
- `EXECUTION_RULES.md` — жёсткие правила для агентов.
- `PROMPTS_EXEC_AUDIT_FIX.md` — промпты EXEC/AUDIT/FIX для каждой фазы.
- `LEGACY_CLEANUP_BACKLOG.md` — allowlist 28 файлов modules/* + 48 route.ts.
- ESLint rule `no-restricted-imports` добавлен в `apps/webapp/eslint.config.mjs` — lint проходит на текущем коде; новые нарушения ловятся.
- Cursor rule `.cursor/rules/clean-architecture-module-isolation.mdc` — запрет прямого infra-доступа из модулей.

**Проверки:**
- `npx eslint src/modules/` — PASS (0 errors) — allowlist корректен.
- Ручная проверка: `channelLink.ts` без allowlist даёт 4 ошибки (getPool + 3 infra imports) — rule работает.

**Следующий шаг:** Фаза 0 EXEC (верификация enforcement) → Фаза 1 (Drizzle).
