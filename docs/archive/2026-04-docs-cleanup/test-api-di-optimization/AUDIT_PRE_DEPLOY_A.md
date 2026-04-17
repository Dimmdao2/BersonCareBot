# Pre-deploy audit — трек A (перед push в remote)

**Дата:** 2026-04-17. **Цель:** готовность изменений трека A к push; merge далее запускает GitHub CI → deploy по процессу команды (`MASTER_PLAN.md`). **Входы:** `MASTER_PLAN.md`, `test-optimization/CHECKLIST.md`, `test-optimization/LOG.md`, `AUDIT_TRACK_A.md` (актуальная версия), `git status` / `git diff`.

**Политика:** `.cursor/rules/test-execution-policy.md` — аудит начат с **диффа и scope**, не с полного CI; полный **`pnpm run ci`** выполнен **один раз** как барьер перед push (`pre-push-ci.mdc`).

---

## 1) Дифф и scope (трек A vs B)

### `git status --short` / `git diff --name-only HEAD` (сводка)

| Путь | Тип |
|------|-----|
| `apps/webapp/e2e/api-integrator-subscriptions-inprocess.test.ts` | Удалён (трек A) |
| `docs/TEST_AND_API_DI_OPTIMIZATION/**` (в т.ч. `test-optimization/*`, `EXECUTION_RULES`, `MASTER_PLAN`, `README`) | Доки инициативы |
| `apps/webapp/src/shared/ui/AuthBootstrap.tsx` | Прод-код webapp (**вне** формулировки «только тесты» трека A) |
| `apps/webapp/src/shared/ui/AuthBootstrap.test.tsx` | Тест webapp (**вне** инициативной папки docs) |
| `docs/archive/2026-04-docs-cleanup/test-api-di-optimization/AUDIT_INIT.md`, `AUDIT_TRACK_A.md` | Новые/обновлённые отчёты |

### Трек B (`apps/webapp/src/app/api/**/route.ts`, DI-boundary)

В диффе **нет** изменений `route.ts` под API и нет правок DI-boundary из трека B.

**Итог п. 1:** трек B **не затронут**. Правки **AuthBootstrap** — вне инициативы трека A, **не** являются треком B; пункт **TA-PD-1** (Major) относится **только** к смешению трека A с правками `app/api/**/route.ts`. Здесь `route.ts` **нет** → **нарушения TA-PD-1 нет** (см. closure ниже). По желанию команды: вынести AuthBootstrap в отдельный коммит/PR для более узкого review — **опционально**, не блокер gate.

---

## 2) GitHub workflows / семантика CI

Проверка: `git diff --name-only HEAD | rg '^\.github/'` → **пусто**.

**Итог п. 2:** `.github/workflows/**` **не** менялись; семантика CI jobs из диффа **не** затронута (соответствует `MASTER_PLAN` / `EXECUTION_RULES` — workflow не «чинить» в инициативе).

---

## 3) Удаления / слияния тестов и `LOG.md`

Единственное удаление тестового файла:  
`apps/webapp/e2e/api-integrator-subscriptions-inprocess.test.ts`.

В **`test-optimization/LOG.md`** (§ «2026-04-17 — трек A: удаление дублирующего e2e») зафиксированы: **mapping** old → replacement, **обоснование**, ссылки на `INVENTORY.md` / `PLAN.md`.

**Итог п. 3:** **Соответствует** (`CHECKLIST.md`: replacement mapping в `LOG.md`).

---

## 4) Критичные контракты (`PLAN.md`)

Ссылка: § «Обязательные контракты» и «Критерии нельзя удалять» — auth (exchange, telegram/max, OAuth, …), integrator (signed POST/GET, idempotency, channel-link, messenger-phone bind, …), messaging/reminders, media (upload/presign/multipart/confirm/get, …), merge/purge.

Удалённый e2e дублировал только happy-path **subscriptions** `topics` / `for-user`; замена — colocated `integrator/subscriptions/topics/route.test.ts` и `…/for-user/route.test.ts` (включая негативные ветки). Остальные семейства остаются в существующих `route.test.ts` и e2e; suite после `pnpm run ci` прошла целиком (см. п. 5).

**Итог п. 4:** критичные семейства **не сняты** с покрытия этим диффом.

---

## 5) Gate: `pnpm install --frozen-lockfile && pnpm run ci`

| Шаг | Результат |
|-----|-----------|
| `pnpm install --frozen-lockfile` | **OK** (lockfile up to date) |
| Первый `pnpm run ci` | **FAIL** на `apps/webapp` typecheck: ошибки в сгенерированном `apps/webapp/.next/dev/types/routes.d.ts` (артефакт dev-сборки, не из диффа трека A) |
| Действие для честного gate | Удалён каталог `apps/webapp/.next`, повторно запущен **`pnpm run ci`** (без повторного install — зависимости уже зафиксированы) |
| Повторный `pnpm run ci` | **OK**, exit code **0** |

**Состав успешного прогона (кратко):** `lint` → `typecheck` (workspace) → `pnpm test` (integrator: 109 files passed, …) → `pnpm test:webapp` (349 files passed, …) → `build` / `build:webapp` → `registry-prod-audit` (no known vulnerabilities).

**Длительность полного CI (успешный):** порядка **~2.5 min** на машине аудита (лог обрезан в консоли; полный проход завершён успешно).

---

## CHECKLIST (`test-optimization/CHECKLIST.md`)

| Пункт | Статус |
|-------|--------|
| INVENTORY / overlap | Заполнено (18 e2e после reduction) |
| BASELINE «after» | Не обязателен для этого pre-deploy (не замер производительности) |
| Justification + mapping | Есть в `LOG.md` |
| Контракты проверены | Да (логика диффа + зелёный `pnpm run ci`) |
| step / phase ранее | Зафиксированы в `LOG.md` |
| `pnpm run ci` перед push | **Выполнен** (успешно после очистки `.next`) |
| workflow не меняли | **N/A** — не трогали |
| INDEX / цифры after | Опционально для финала трека; не блокер pre-deploy |

---

## Verdict

**PASS** (после удаления устаревшего `apps/webapp/.next` перед финальным `pnpm run ci`). **Closure 2026-04-17:** critical/major из MANDATORY FIX закрыты (см. таблицу ниже); workflow GitHub **не** менялись.

**Readiness к pushу в remote:** при текущем дереве (тесты + доки + AuthBootstrap) и **уже зафиксированном** зелёном `pnpm run ci` — **готово**, если не появлялось новых коммитов с кодом/конфигом после того прогона. Перед фактическим push повторить **`pnpm install --frozen-lockfile && pnpm run ci`** на актуальном HEAD, если с последнего зелёного CI менялись файлы, влияющие на gate (см. `pre-push-ci.mdc`). Локально при ошибках `tsc` в `.next/**` — сначала **«Локальный pre-flight»** ниже.

---

## Локальный pre-flight (закрытие TA-PD-0)

Перед `pnpm run ci` на dev-машине, если ранее запускался `next dev` / сборки с артефактами:

```bash
rm -rf apps/webapp/.next
pnpm install --frozen-lockfile && pnpm run ci
```

GitHub Actions обычно использует чистый checkout → битый `.next` там не воспроизводится; шаг выше — для локального совпадения с gate.

---

## MANDATORY FIX INSTRUCTIONS — closure

| ID | Уровень | Тема | Статус | Как закрыто |
|----|---------|------|--------|-------------|
| TA-PD-0 | Minor | Ошибки typecheck из `apps/webapp/.next/**` | **CLOSED** | Зафиксирован pre-flight `rm -rf apps/webapp/.next` + успешный `pnpm run ci` в `LOG.md`; раздел «Локальный pre-flight» выше |
| TA-PD-1 | Major | Смешение трека A и **трека B** (`route.ts`) в одном PR | **CLOSED** | В диффе **нет** `app/api/**/route.ts`; AuthBootstrap ≠ трек B |
| TA-PD-2 | Critical | Удаление теста без mapping | **CLOSED** | `LOG.md` § удаление e2e с таблицей old → replacement |
| TA-PD-3 | Critical | Пуш без зелёного `pnpm run ci` | **CLOSED** | Успешный gate зафиксирован в `LOG.md` (pre-deploy); повтор перед push при новых изменениях — по `pre-push-ci.mdc` |

---

## MANDATORY FIX INSTRUCTIONS — ремедиация при дрейфе

| ID | Severity | Условие | Действие |
|----|----------|---------|----------|
| TA-PD-0r | **Minor** | Снова падение `tsc` на файлах под `apps/webapp/.next/**` локально | `rm -rf apps/webapp/.next`, повторить `pnpm run ci`; workflow не менять. |
| TA-PD-1r | **Major** | В PR с треком A появились правки `app/api/**/route.ts` (трек B) | Разделить PR по `MASTER_PLAN.md` / `INVENTORY.md` п. 3. |
| TA-PD-2r | **Critical** | Удалён/отключён тест без записи в `LOG.md` | Mapping или откат; **не пушить**. |
| TA-PD-3r | **Critical** | Пуш без успешного `pnpm run ci` на актуальном дереве | `pnpm install --frozen-lockfile && pnpm run ci` (`pre-push-ci.mdc`). |
