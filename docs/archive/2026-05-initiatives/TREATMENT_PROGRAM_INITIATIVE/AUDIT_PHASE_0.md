# AUDIT — Фаза 0 (enforcement)

**Дата:** 2026-04-18.  
**Вход:** `MASTER_PLAN.md`, `EXECUTION_RULES.md`, `LEGACY_CLEANUP_BACKLOG.md`.  
**Проверено в репозитории:** `apps/webapp/eslint.config.mjs`, `.cursor/rules/clean-architecture-module-isolation.mdc`, сверка allowlist ↔ таблица A бэклога, прогон ESLint, точечный negative-test на новом файле в `modules/*`.

---

## Краткий вердикт

| Проверка | Статус |
|----------|--------|
| 1) ESLint: green на текущем коде + ловит новый `@/infra/db/*` / `@/infra/repos/*` в `modules/*` | **PASS** |
| 2) Cursor rule vs ключевые запреты `EXECUTION_RULES.md` | **PASS** — п. **1–8** «Абсолютные запреты» отражены в `.mdc` (в т.ч. **§1b** для п.7–8 после FIX). |
| 3) `LEGACY_CLEANUP_BACKLOG.md`: **29** legacy modules под allowlist; «48» в секции B — исторический счётчик | **PASS** |

---

## 1) ESLint: корректность и регрессия

### Verdict: **PASS**

| Критерий | Результат |
|----------|-----------|
| `pnpm --dir apps/webapp exec eslint .` | **exit 0** (на момент аудита). |
| Область `modules/**` | `no-restricted-imports`: `@/infra/db/*`, `@/infra/db/client`, `@/infra/repos/*`. Исключены тесты: `*.test.ts`, `*.test.tsx`. |
| Область `src/app/api/**/route.ts` | Тот же запрет **без** отдельного allowlist для routes (наследие track B закрыто в коде). |
| Allowlist legacy | **29** путей в `eslint.config.mjs` (блок `files: [...]`, `no-restricted-imports: "off"`) — **1:1** со строками 1–29 таблицы A в `LEGACY_CLEANUP_BACKLOG.md`. |
| Новый production-файл в `modules/**` | Временный файл с `import … from "@/infra/db/client"` и отдельно с `import type … from "@/infra/repos/..."` → **error** `no-restricted-imports` (проба после аудита файл удалён). |
| Прямые `@/infra/` в `**/route.ts` | `rg '@/infra/' apps/webapp/src --glob '**/route.ts'` → **пусто**. |

### Оговорка по формулировке «весь `@/infra`»

Правило фазы 0 целится **только** в `@/infra/db/*` (включая `client`) и `@/infra/repos/*`, как в `MASTER_PLAN.md` / `EXECUTION_RULES.md` §2. Импорты вроде `@/infra/s3/client`, `@/infra/logging/*` ESLint **не** режет; это сознательный scope (см. пояснение в `.mdc` §1). Расширение запрета — отдельное решение и синхронизация бэклога.

---

## 2) Cursor rule vs `EXECUTION_RULES.md`

### Источник: «Абсолютные запреты» (1–8)

| # | Тема | В `clean-architecture-module-isolation.mdc` |
|---|------|---------------------------------------------|
| 1 | Raw SQL для новых сущностей; только Drizzle | **Да** — §5 («New entities use Drizzle ORM»). |
| 2 | Не импортировать `@/infra/db/client` и `@/infra/repos/*` из `modules/*`; порты + DI | **Да** — §1, §3, §6, §7; уточнение scope ESLint в §1. |
| 3 | Не класть бизнес-логику в `route.ts` | **Да** — §4. |
| 4 | Не менять существующие LFK-таблицы | **Да** — §1a. |
| 5 | Не создавать отдельный «движок курсов» | **Да** — §1a. |
| 6 | Не делать FK на `item_ref_id` | **Да** — §1a. |
| 7 | Не смешивать фазы; отдельные коммиты | **Да** — §1b + ссылка на `test-execution-policy.md`. |
| 8 | Не менять GitHub CI workflow без решения | **Да** — §1b + ссылка на `pre-push-ci.mdc`. |

Дополнительно в `.mdc` отражены: направление зависимостей (§2), порты в modules (§3), инжекция (§6), где вызывать `buildAppDeps()` (§7). Правила Drizzle из `EXECUTION_RULES.md` (пути schema, `drizzle-kit`, smoke с БД и т.д.) **не** полностью продублированы в этом файле — они остаются в `EXECUTION_RULES.md`; для агентов это **обязательный** вторичный источник при работе по инициативе.

### Verdict: **PASS** для п. **1–8** после закрытия MANDATORY FIX #1 (§1b в `.mdc`).

---

## 3) `LEGACY_CLEANUP_BACKLOG.md` и цифры **29** / **48**

### Verdict: **PASS**

| Вопрос | Факт |
|--------|------|
| Сколько legacy production-файлов в секции A? | **29** — совпадает с allowlist в `eslint.config.mjs`. |
| Путаница с «23» | **23** — это **номер строки** в таблице A (файл `content-catalog/service.ts`), а не общее число файлов. Общее число — **29**. |
| «48» в секции B | **Исторический** счётчик маршрутов с нарушением boundary **до** нормализации (track B), **не** текущее число `route.ts`. Сейчас под `apps/webapp/src/app/api/**/route.ts` — **162** файла (инвентаризация `find … -name route.ts`); это отдельная метрика. |
| Восстановление списка 48 путей из git | **Не требуется.** Маршруты приведены к boundary; отдельный ESLint-allowlist для routes не используется. Полный перечень истории — в архивном треке, как в секции B. |

---

## Gate фазы 0 (из `MASTER_PLAN.md`)

| Критерий | Статус |
|----------|--------|
| ESLint green + новые нарушения db/repos в modules ловятся | **OK** |
| Cursor rule создан и согласован с ключевыми запретами | **OK** |
| Бэклог зафиксирован, allowlist полон | **OK** |

---

## MANDATORY FIX INSTRUCTIONS

1. **Процессовые абсолюты (EXECUTION_RULES п.7–8) в alwaysApply-контексте:**  
   **Закрыто (2026-04-18):** в `.cursor/rules/clean-architecture-module-isolation.mdc` добавлен **§1b** — два буллета (фазы; CI) + ссылки на `test-execution-policy.md` и `pre-push-ci.mdc`.

2. **Документация и чеклисты:**  
   **Закрыто:** `README.md`, `PROMPTS_EXEC_AUDIT_FIX.md` и таблица A бэклога уже задают **29** файлов и пояснение про **23** как номер строки / **48** как исторический счётчик; дополнительных правок не потребовалось.

3. **Опционально (не блокер фазы 0):** расширить ESLint на другие префиксы `@/infra/*` — только после явного решения и обновления бэклога (массовый охват).  
   **Defer (обоснованно):** см. §1 «Оговорка по формулировке „весь `@/infra`“» — текущий scope (`db` + `repos`) совпадает с `MASTER_PLAN` (задача 0.1) и п.2 «Абсолютные запреты» в `EXECUTION_RULES.md`; расширение = отдельная инициатива.

4. **Закрыто без действий:** восстановление из git полного списка из 48 путей маршрутов; контроль — ESLint на `route.ts` + `rg` (см. секцию B `LEGACY_CLEANUP_BACKLOG.md`).

---

## Статус закрытия (после FIX)

| # | Тип | Статус |
|---|-----|--------|
| 1 | Critical/major (п.7–8 в AI-контексте) | **Закрыт** — §1b в `clean-architecture-module-isolation.mdc` |
| 2 | Major (чеклисты 29/48) | **Закрыт** — документы инициативы согласованы |
| 3 | Minor (широкий `@/infra/*` в ESLint) | **Defer** — см. выше |
| 4 | Исторический список 48 маршрутов | **Закрыт без действий** |

**Сверка с `SYSTEM_LOGIC_SCHEMA.md`:** правки FIX касались только enforcement (cursor rule + аудит); эталон логики и код домена не менялись — отклонений от схемы нет.

---

## Команды для повторной проверки

```bash
pnpm --dir apps/webapp exec eslint .
rg '@/infra/' apps/webapp/src --glob '**/route.ts'
rg 'from ["'\'']@/infra/(db|repos)/' apps/webapp/src/modules --glob '*.ts'
# production-нарушения — без *.test.ts; сверить allowlist в eslint.config.mjs с таблицей A LEGACY_CLEANUP_BACKLOG.md (ожидается 29 строк).
find apps/webapp/src/app/api -name 'route.ts' | wc -l
```

Negative-test (ожидается ошибка ESLint, файл не коммитить):

```bash
# создать временно apps/webapp/src/modules/_eslint_probe.ts с запрещённым import, затем удалить
```

Запись о FIX и gate — в `LOG.md` (секция «AUDIT_PHASE_0 FIX»).
