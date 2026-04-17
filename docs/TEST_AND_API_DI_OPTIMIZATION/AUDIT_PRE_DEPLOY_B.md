# Pre-deploy audit — Track B (API DI / import-boundary)

**Дата:** 2026-04-17. **Сценарий:** финальный пуш после закрытого **кластера G** (integrator GET → `assertIntegratorGetRequest`, тесты, `LOG.md` / `AUDIT_TRACK_B_CLUSTER.md`). **Метод:** чтение входных документов; `git status` / `git diff --stat`; выборочная сверка кода с `api.md` / `di.md`; `rg '@/infra/'` по `apps/webapp/src/app/api/**/route.ts`; отсутствие правок `.github/workflows`; полный CI как в `MASTER_PLAN.md` / `pre-push-ci`.

## Verdict

**PASS** — политика импортов для выполненного кластера согласована с `PLAN.md`; workflow не меняли; полный CI перед пушем зелёный. Документы **`apps/webapp/src/app/api/api.md`** и **`apps/webapp/src/app-layer/di/di.md`** синхронизированы с кластером G (`assertIntegratorGetRequest`, см. §2 и блок FIX closure ниже).

---

## Входные артефакты

| Источник | Использование |
|----------|----------------|
| `MASTER_PLAN.md` | Критерии трека B, запрет workflow, обязательность полного CI перед push, список доков для sync после инициативы |
| `api-di-boundary-normalization/CHECKLIST.md` | Контрольный список (часть пунктов остаётся на будущие кластеры B) |
| `api-di-boundary-normalization/LOG.md` | Cluster G parity, remediation, phase `pnpm test:webapp`, gate |
| `AUDIT_TRACK_B_CLUSTER.md` | Cluster G аудит + closure TB-MF-1/2 |
| `apps/webapp/src/app/api/api.md`, `app-layer/di/di.md` | Сверка формулировок с кодом (см. §2) |
| `git status` / `git diff --stat` | Scope изменений (webapp integrator GET + тесты + docs инициативы) |

**Рабочее дерево (индикатор на момент аудита):** ветка `main...origin/main`; изменены **26** отслеживаемых файлов + неотслеживаемые: `app-layer/integrator/*`, `integrator/communication/**/route.test.ts`, `integrator/testUtils/*`, `AUDIT_TRACK_B_CLUSTER.md`.

---

## 1) Исключения import-policy — перечислены и согласованы

**Источник правды:** `api-di-boundary-normalization/PLAN.md` § «Целевая import policy» и «Предварительный список accepted exceptions»: (1) verify webhook в infra **или** тонкая обёртка в app-layer; (2) structured logging из `@/infra/logging/*` при tradeoff.

**Кластер G (выполнено):** все **14** integrator **GET** `route.ts` из scope **не** импортируют `@/infra/*`. Подпись GET централизована в `apps/webapp/src/app-layer/integrator/assertIntegratorGetRequest.ts` → `verifyIntegratorGetSignature` (вариант обёртки в app-layer, явно разрешённый `PLAN.md`).

**Остаток `@/infra/*` в `apps/webapp/src/app/api/**/route.ts`:** **49** файлов (по `rg --files-with-matches`). Группы, согласуемые с политикой и `PLAN` / `LOG` до закрытия следующих кластеров:

- **Integrator POST / side-effect:** `events`, `messenger-phone/bind`, `channel-link/complete`, `reminders/dispatch`, `reminders/occurrences/{skip,snooze}` — ожидаемые прямые infra до кластеров **I** и др.
- **Media / internal / admin audit / merge / auth / health / support / booking / doctor rubitime** — вне scope G; многие совпадают с restricted/exception паттернами из `PLAN` (логирование, S3, idempotency, merge).

**Итог п.1:** **Согласовано** для текущего объёма трека B; явный allowlist-файл в репо (из `PLAN` § Enforcement) **ещё не внедрён** — остаётся задачей на хвост инициативы / отдельный PR (см. CHECKLIST).

---

## 2) Документация API/DI vs код (точечно)

| Документ | Наблюдение |
|----------|------------|
| `apps/webapp/src/app/api/api.md` | Обновлено: в § integrator добавлено описание подписанных GET и `assertIntegratorGetRequest` / заголовков. |
| `apps/webapp/src/app-layer/di/di.md` | Обновлено: явное разделение guard integrator GET (`app-layer/integrator`) от объекта `buildAppDeps()`. |

**Итог п.2:** **PASS** (док-синхронизация по `MASTER_PLAN.md` § «Документы для пересмотра» выполнена точечно для кластера G).

---

## 3) GitHub workflow

**Проверка:** `git diff .github/workflows/` и статус `.github/` — **пусто**, изменений нет.

**Итог п.3:** **PASS** (соответствует `MASTER_PLAN.md` и `CHECKLIST.md`).

---

## 4) Полный CI

**Команда (корень репозитория):**

```bash
pnpm install --frozen-lockfile && pnpm run ci
```

**Состав `ci` (как в корневом `package.json`):** `pnpm lint` → `pnpm typecheck` → `pnpm test` (integrator Vitest) → `pnpm test:webapp` → `pnpm build` → `pnpm build:webapp` → `pnpm run audit`.

**Итог:** **PASS**, exit code **0**. Кратко по этапам: integrator **109** test files passed (2 skipped); webapp **354** passed (4 skipped); сборки и `registry-prod-audit` без известных уязвимостей. Полный wall time порядка **~2.3–2.5 мин** на машине агента (лог обрезан по длине, итог успешный).

---

## CHECKLIST (`api-di-boundary-normalization/CHECKLIST.md`)

Часть чекбоксов относится ко **всему** треку B (инвентарь 58 роутов, enforcement, полный sync `api.md`/`di.md`). Для **pre-push после только кластера G:** критичные пункты «не трогать workflow» и «зелёный CI перед merge/push» — **выполнены**. Остальное — бэклог следующих кластеров.

---

## MANDATORY FIX INSTRUCTIONS

Использовать при **FAIL** любого раздела выше или регрессии после merge.

| ID | Severity | Условие | Действие |
|----|----------|---------|----------|
| PD-B-1 | **Critical** | `pnpm run ci` красный перед push | Не пушить; исправить по логу CI; повторить `pnpm install --frozen-lockfile && pnpm run ci`. |
| PD-B-2 | **Critical** | В diff попал `.github/workflows/ci.yml` (или другой deploy/workflow) без внешнего решения | Откатить изменения workflow; вынести в отдельный PR/обсуждение (`MASTER_PLAN.md`). |
| PD-B-3 | **Major** | Новый `@/infra/*` в `route.ts` в области, уже очищенной кластером B, без записи в `PLAN.md` / `LOG.md` | Вернуть композицию через `buildAppDeps` / app-layer wrapper; задокументировать parity и исключение. |
| PD-B-4 | **Major** | HTTP parity изменён, но не обновлён `api-di-boundary-normalization/LOG.md` | Дописать секцию с cluster id, статусами и JSON; обновить gate. |
| PD-B-5 | **Minor** | `api.md` / `di.md` расходятся с фактом после серии кластеров B | Точечно обновить по списку `MASTER_PLAN.md` § «Документы для пересмотра». |

**Closure (первичный прогон 2026-04-17):** PD-B-1 — **PASS**; PD-B-2 — **N/A** (workflow не меняли); PD-B-3 — **нет** регрессии G на момент аудита; PD-B-4 — **OK** для G в `LOG.md`; PD-B-5 — **открыт** → см. **FIX closure** ниже.

---

## FIX closure — docs sync + readiness (2026-04-17)

| ID | Уровень | Статус |
|----|---------|--------|
| PD-B-1 | Critical | **PASS** — повторный `pnpm install --frozen-lockfile && pnpm run ci` после правок доков (см. `LOG.md`) |
| PD-B-2 | Critical | **N/A** |
| PD-B-3 | Major | **PASS** — регрессий не вносилось |
| PD-B-4 | Major | **PASS** — parity кластера G уже в `LOG.md`; дописана запись pre-deploy |
| PD-B-5 | Minor | **CLOSED** — обновлены `api.md`, `di.md` |

**Readiness к пушу:** workflow GitHub не меняли; CI зелёный после синхронизации документов.

---

## MANDATORY FIX INSTRUCTIONS — ремедиация при дрейфе доков

| Условие | Действие |
|---------|----------|
| В `api.md` нет описания нового публичного шва API (например guard integrator GET) | Добавить короткий подпункт в § `integrator/` с отсылкой к `assertIntegratorGetRequest` и заголовкам подписи. |
| В `di.md` не отражены новые поля/фабрики `buildAppDeps` | Обновить список сервисов или явную ссылку «guard вынесен в `app-layer/integrator/*`». |
