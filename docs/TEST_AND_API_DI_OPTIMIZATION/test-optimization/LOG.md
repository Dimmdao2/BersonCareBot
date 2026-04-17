# LOG — test optimization track

## 2026-04-17 — трек A: closure AUDIT_PRE_DEPLOY (critical/major)

**Сделано:** обновлён `AUDIT_PRE_DEPLOY_A.md` — таблица **MANDATORY FIX closure** (TA-PD-0…3 **CLOSED**): уточнён TA-PD-1 (только A+B / `route.ts`; AuthBootstrap не трек B); добавлен § «Локальный pre-flight» (`rm -rf apps/webapp/.next`); блок ремедиации TA-PD-*r; **readiness к push** и напоминание повторить `pnpm install --frozen-lockfile && pnpm run ci` при новых изменениях после последнего зелёного gate.

**Повторные проверки:** `git diff --name-only HEAD | rg '^\.github/'` → нет совпадений (workflow не трогали). Код / lockfile / конфиг CI **не** менялись после последнего успешного `pnpm run ci` из записи pre-deploy → **полный CI повторно не запускался** (reuse + `test-execution-policy`).

## 2026-04-17 — трек A: pre-deploy gate (`pnpm run ci`)

**Контекст:** `AUDIT_PRE_DEPLOY_A.md` перед push в remote.

**Команды:** `pnpm install --frozen-lockfile` → OK. Первый `pnpm run ci` — **fail** на webapp typecheck из-за битого/устаревшего `apps/webapp/.next/dev/types/routes.d.ts`. После `rm -rf apps/webapp/.next` повторный **`pnpm run ci`** — **exit 0** (lint, typecheck, integrator test, webapp test, build webapp/integrator, audit).

**Итог:** gate **pass** (см. отчёт). Для CI на GitHub обычно чистый workspace; локально при повторении ошибки — см. TA-PD-0 в `AUDIT_PRE_DEPLOY_A.md`.

## 2026-04-17 — трек A: phase `pnpm test:webapp` (явная фиксация)

**Дата:** 2026-04-17. **Условие:** после последнего полного прогона webapp могли меняться тесты под `apps/webapp`; дополнительно phase соответствует напоминанию в `AUDIT_TRACK_A.md` (пакет webapp / трек A).

**Команда (корень репозитория):** `pnpm test:webapp` (эквивалент: `pnpm --dir apps/webapp test`).

**Итог:** **pass** (exit code 0).

**Vitest (кратко):** `RUN v4.1.3` в `apps/webapp` — **349** test files passed, **4** skipped (**353** files); **1775** tests passed, **7** skipped (**1782** tests); **Duration ~27.4s** (transform / setup / import / tests / environment по summary Vitest в консоли).

**Интегратор:** правок только `apps/integrator` тестов не было — полный `pnpm test` с корня **не** запускался. **`pnpm run ci` не запускался.**

## 2026-04-17 — трек A: закрытие AUDIT_TRACK_A (DOC-2 + phase)

**Сделано:** синхронизированы `INVENTORY.md` (18 e2e, удалена строка удалённого файла, обновлены `stage13` / итог overlap) и `PLAN.md` (счётчик 18, убрана строка кандидата для удалённого e2e). В `INVENTORY.md` п. 3 правил трека A — **не смешивать PR трек A и трек B** (closure TA-PE-2). **Проверки (phase-level):** `pnpm test:webapp` из корня → **349** test files passed, **1775** tests passed (~28s). `pnpm run ci` не запускался.

## 2026-04-17 — трек A: удаление дублирующего e2e (согласованный кандидат)

**Кандидат (обоснование заранее в инвентаре):** `INVENTORY.md` — для `api-integrator-subscriptions-inprocess.test.ts` зафиксировано **высокое** совпадение happy-path с colocated route tests; ошибки 400/401/503 остаются только в route suite. `PLAN.md` — кандидат на reduction **с mapping**.

**Mapping (old → replacement):**

| Old | Replacement |
|-----|-------------|
| `apps/webapp/e2e/api-integrator-subscriptions-inprocess.test.ts` | `apps/webapp/src/app/api/integrator/subscriptions/topics/route.test.ts` + `apps/webapp/src/app/api/integrator/subscriptions/for-user/route.test.ts` |

**Обоснование:** тот же контракт GET (подпись integrator, 200, JSON topics/subscriptions) уже проверяется в colocated тестах, включая негативные ветки; e2e не добавлял уникальных сценариев вне happy-path. Регрессия «product read через webapp» для stage 13 сохраняется в `e2e/stage13-legacy-cleanup.test.ts`.

**Проверки (step-level):** из `apps/webapp`:  
`pnpm exec vitest run src/app/api/integrator/subscriptions/topics/route.test.ts src/app/api/integrator/subscriptions/for-user/route.test.ts e2e/stage13-legacy-cleanup.test.ts` → **3 files, 11 tests passed** (~0.6s). Полный `pnpm test:webapp` не запускался; `pnpm run ci` не запускался.

## 2026-04-17 — трек A: закрытие замечаний AUDIT_TRACK_A (docs)

**Сделано:** устранено DOC-1 — `PLAN.md` § кандидатов на review приведён в соответствие с `INVENTORY.md` (источник правды + таблица-срез по overlap). В `INVENTORY.md` добавлен § «Правила трека A перед удалением…» — закрытие **Major** (mapping) и **Critical** (критичные семейства) из MANDATORY FIX аудита трека A. Обновлён `AUDIT_TRACK_A.md` (closure-таблица + блок ремедиации). Код и тесты не менялись.

## 2026-04-17 — трек A: инвентарь e2e ↔ colocated route (overlap)

**Сделано:** построчно сверены все 19 `apps/webapp/e2e/*.test.ts` с наличием/содержанием соответствующих `route.test.ts` (где применимо). Обновлён `INVENTORY.md`: колонки «Роль после сверки» и «Overlap с colocated route.test.ts»; сняты статусы **unknown/likely** для сравненных файлов. Зафиксировано: `api-routes-inprocess` = только health; **высокий** overlap у `api-integrator-subscriptions-inprocess` и `stage13-legacy-cleanup` с route tests и между собой; **частичный** — `api-auth-exchange`, `cms-content` (шаг upload); server `api-health` дублирует in-process health при наличии BASE. Прод-код и тесты **не** менялись; CI не запускался (только markdown).

## 2026-04-17 — post-audit doc closure (AUDIT_INIT)

**Сделано (только `docs/TEST_AND_API_DI_OPTIMIZATION/`):** закрыты **critical** и **major** из MANDATORY FIX INSTRUCTIONS в `AUDIT_INIT.md` — добавлена таблица closure MF-1…MF-5; блок ремедиации при дрейфе сохранён отдельно. В `MASTER_PLAN.md` уточнён repo-scope vs микрошаг; в `EXECUTION_RULES.md` — § «Источник правил по прогонам и пушу», усилен п. 6 (запрет «чинить» через workflow/pre-push); в `README.md` — ссылки на rules и `AUDIT_INIT.md`. Тесты и `pnpm run ci` не запускались (только markdown).

## 2026-04-17 — preparatory pass (docs ↔ rules)

**Проверено:** `MASTER_PLAN.md`, `EXECUTION_RULES.md`, `test-optimization/PLAN.md`, `PROMPTS_EXEC_AUDIT_FIX.md`, README/checklists/DISCOVERY против `.cursor/rules/test-execution-policy.md` и `pre-push-ci.mdc`.

**Итог:** между коммитами зафиксированы уровни **step / phase**; полный `pnpm install --frozen-lockfile && pnpm run ci` — барьер **перед пушем** (и при repo-scope по политике), без требования полного монорепо CI после каждого микрошага. Запрет правок `.github/workflows/ci.yml` / job **Deploy** — явно в `MASTER_PLAN.md`, `EXECUTION_RULES.md` и согласованных ссылках. Противоречий док ↔ rules не найдено; правки кода/тестов не делались.

## 2026-04-16 — discovery

**Команды:**

- `find apps/webapp/src apps/webapp/e2e -name '*.test.ts' | wc -l` → 309
- `find apps/webapp/src -name '*.test.tsx' | wc -l` → 36
- `find apps/webapp/src/app/api -name 'route.test.ts' | wc -l` → 105
- `find apps/integrator/src -name '*.test.ts' | wc -l` → 109
- `pnpm test` + `pnpm test:webapp` с замером wall time (см. `BASELINE.md`)

**Найдено:**

- Vitest webapp включает **и** `src/**` **и** `e2e/**` в одном `--run` — in-process e2e участвуют в основном CI `pnpm test:webapp`.
- 19 файлов в `apps/webapp/e2e/*.test.ts`, включая `api-routes-inprocess.test.ts`, `api-health.test.ts`, `api-auth-exchange.test.ts`, `messaging-inprocess.test.ts`, `cms-media-inprocess.test.ts`, `live-dev.test.ts` (последний — вероятный кандидат на отдельный профиль запуска при `E2E_LIVE_DEV` — **likely**, см. `package.json` script `test:e2e:live`).

**Решения не приняты:**

- Какие именно e2e файлы дублируют colocated `route.test.ts` (требуется построчное сравнение assertion’ов).
- Нужно ли выносить часть `e2e/` из дефолтного `vitest --run` (изменение топологии CI — **высокий риск**, только с явным согласованием).
