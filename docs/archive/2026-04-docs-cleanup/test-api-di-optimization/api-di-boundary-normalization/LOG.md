# LOG — API DI / import-boundary track

## 2026-04-17 — Доп. проверка: health вне `app/api`

**Пропуск:** `apps/webapp/src/app/health/projection/route.ts` и `apps/webapp/src/app/app/health/projection/route.ts` остались с `@/infra/...` (вне scope первого grep только по `app/api`). Исправлено: тот же фасад `@/app-layer/health/proxyIntegratorProjectionHealth`, что и в `app/api/health/projection`. Проверка: `rg '@/infra/' apps/webapp/src --glob '**/route.ts'` → пусто.

---

## 2026-04-17 — Wave: все `route.ts` без прямого `@/infra/*`

**Цель:** закрыть оставшиеся «38 planned-cluster» маршрутов по смыслу трека B — убрать прямой импорт `@/infra/*` из всех `apps/webapp/src/app/api/**/route.ts`, сохранив поведение (parity не менялся: те же вызовы, но через `@/app-layer/**` фасады или `buildAppDeps()`).

**Сделано:**

- Добавлены тонкие модули-посредники под `@/app-layer/` (`logging/*`, `db/client`, `health/proxyIntegratorProjectionHealth`, `integrator/verifyIntegratorSignature`, `integrations/*`, `admin/auditLog`, `merge/*`, `idempotency/*`, `media/*`, `locks/*`, `lfk/*`, `platform-user/*` и др.) — re-export на существующий `@/infra/*` / модули.
- OAuth callbacks `google` / `apple` используют `buildAppDeps().oauthBindings` вместо прямого выбора `pg` / `inMemory` портов.
- Colocated `route.test.ts` переведены на моки `@/app-layer/...` там, где менялся импорт у SUT; где модуль под капотом всё ещё тянет `@/infra/db/client` из `@/modules/*`, оставлен мок `@/infra/db/client` (напр. `doctor/clients/[userId]/archive/route.test.ts`). Для `apple/route.test.ts` восстановлен `webappReposAreInMemory` в mock `@/config/env`, т.к. статический импорт `buildAppDeps` инициализирует ветку репозиториев при загрузке модуля.
- Документ allowlist заменён на описание **текущей политики** (ноль `@/infra` в `route.ts`), обновлены `api.md`, `di.md`.

**Проверки:** `pnpm exec tsc --noEmit` в `apps/webapp`; `pnpm exec vitest --run` в `apps/webapp` — зелёный (354 files passed, 1798 tests). **Полный gate:** `pnpm install --frozen-lockfile && pnpm run ci` из корня репозитория → **PASS** (exit 0).

---

## 2026-04-17 — final closure (AUDIT_FINAL critical/major)

**Цель:** закрыть `MF-FINAL-1` (Critical), `MF-FINAL-2` (Major), `MF-FINAL-3` (Major) из `AUDIT_FINAL.md`.

**Сделано:**

- Добавлен формальный allowlist-артефакт: `ALLOWLIST_REMAINING_INFRA_ROUTE_IMPORTS.md` (snapshot после Cluster G).
- В allowlist классифицированы все текущие `@/infra`-маршруты `app/api/**/route.ts`:  
  `approved-exception=10`, `planned-cluster=38`, `violation=0`.
- Зафиксированы owner/ETA для deferred-маршрутов (`H/L/O/R/I/M/D` кластеры).
- В `AUDIT_FINAL.md` добавлены:
  - полная matrix `docs sync/defer` по списку из `MASTER_PLAN.md`,
  - единый блок `Final CI evidence`,
  - таблица closure `MF-FINAL-*`.

**Docs sync/defer rationale (вне code change этого шага):**

- `apps/webapp/src/app-layer/app-layer.md` → `deferred` (текущее описание корректно; новых composition-root правил в closure step нет).
- `docs/ARCHITECTURE/LOW_LEVEL_ARCHITECTURE_AUDIT_AND_REORG.md` → `deferred` (отдельная архитектурная задача, вне текущего closure PR).
- `docs/ARCHITECTURE/ARCHITECTURE_GUARDRAILS.md` → `N/A` (новых runtime guardrails в Cluster G не вводилось).

**Проверки этого шага:**

- `rg '@/infra/' apps/webapp/src/app/api --glob '**/route.ts' --files-with-matches` (snapshot для allowlist).
- `pnpm run ci` на этом подшаге **не** запускался (будет выполнен отдельным gate-командой в финале задачи).

---

## 2026-04-17 — Pre-deploy FIX (`AUDIT_PRE_DEPLOY_B.md`): docs + полный CI

**Цель:** закрыть PD-B-5 (drift `api.md` / `di.md`) и зафиксировать повторный полный CI перед пушем после трека B.

**Сделано:** в `apps/webapp/src/app/api/api.md` § integrator добавлено описание подписанных integrator GET и `assertIntegratorGetRequest`; в `apps/webapp/src/app-layer/di/di.md` — явное разделение guard от `buildAppDeps()`. Обновлён `AUDIT_PRE_DEPLOY_B.md` (FIX closure).

**Команда (корень репозитория):** `pnpm install --frozen-lockfile && pnpm run ci`.

**Итог:** **PASS** (exit code 0) — `lint`, `typecheck`, `pnpm test` (integrator: 109 test files passed, 2 skipped), `pnpm test:webapp` (354 passed, 4 skipped), `build` + `build:webapp`, `registry-prod-audit`; wall time ~141s.

---

## 2026-04-17 — Phase: полный Vitest `apps/webapp` (трек B)

**Дата:** 2026-04-17.

**Команда (из корня репозитория):** `pnpm test:webapp` → `pnpm --dir apps/webapp test` → `vitest --run` в каталоге `apps/webapp`.

**Итог:** **PASS** — 354 test files passed (4 skipped), 1798 tests passed (7 skipped), длительность ~30s.

**Примечание:** phase-level по `.cursor/rules/test-execution-policy.md` после существенного куска трека B; `pnpm run ci` **не** запускался.

---

## 2026-04-17 — Cluster G (integrator GET / sigGet only)

**Cluster id:** `G` (per `PLAN.md`).

**Goal:** Убрать прямой `@/infra/webhooks/verifyIntegratorSignature` из integrator **GET** `route.ts`; единая точка `assertIntegratorGetRequest` в `@/app-layer/integrator/assertIntegratorGetRequest` (внутри по-прежнему `verifyIntegratorGetSignature` — допустимое исключение по политике, не в теле route).

**Затронутые HTTP handlers (parity не менялся):**

| Path prefix | Notes |
|-------------|--------|
| `GET /api/integrator/subscriptions/{topics,for-user}` | |
| `GET /api/integrator/appointments/{record,active-by-user}` | |
| `GET /api/integrator/reminders/{history,rules,rules/by-category}` | |
| `GET /api/integrator/communication/{conversations,conversations/[id],questions,questions/by-conversation/...}` | |
| `GET /api/integrator/delivery-targets` | |
| `GET /api/integrator/diary/{symptom-trackings,lfk-complexes}` | |

**Parity — общий префикс для всех перечисленных GET:**

- **Статусы:** `400` — нет `x-bersoncare-timestamp` и/или `x-bersoncare-signature`; `401` — подпись не проходит `verifyIntegratorGetSignature`; далее без изменений специфичные `400`/`404`/`503`/`200` каждого handler.
- **JSON (ошибки guard):** `{ "ok": false, "error": "missing webhook headers" }` и `{ "ok": false, "error": "invalid signature" }` — те же строки и ключи.
- **Подпись:** canonical string неизменна: ``GET ${pathname}${search}`` (как в `verifyIntegratorGetSignature`); неверный timestamp/signature → `401` + `invalid signature`.
- **Идемпотентность:** только read-side; повтор того же подписанного GET остаётся без побочных эффектов на уровне контракта (как до рефактора).

**Остаточные `@/infra/*` в `integrator/**/route.ts`:** POST/side-effect маршруты (cluster I и др.) — вне G.

**Remediation (FIX после `AUDIT_TRACK_B_CLUSTER.md`, тот же кластер G):**

- Добавлены colocated `route.test.ts` для **всех** integrator GET под `communication/**` (раньше не было — расхождение с checkpoint в `PLAN.md`: «все `route.test.ts` integrator GET зелёные» подразумевает наличие якорей на каждый handler в кластере).
- Colocated тесты кластера G и `e2e/stage13-legacy-cleanup.test.ts` переведены на мок **`@/app-layer/integrator/assertIntegratorGetRequest`** через общий util `apps/webapp/src/app/api/integrator/testUtils/wireAssertIntegratorGetForRouteTests.ts` (значение заголовка подписи `"bad"` → `401` с тем же JSON, что и production guard). Крипто-поведение по-прежнему покрывается `assertIntegratorGetRequest.test.ts` и `verifyIntegratorSignature.test.ts`.

**Parity — communication GET (дополнение к общему guard выше):**

| Route file | Доп. ошибки / success |
|------------|------------------------|
| `communication/conversations/route.ts` | `503` `support communication not available`; `200` `{ ok, conversations }` |
| `communication/conversations/[id]/route.ts` | `400` `conversation id required`; `503`; `404` `{ ok:false, error:"not_found" }`; `200` `{ ok, conversation }` |
| `communication/questions/route.ts` | `503`; `200` `{ ok, questions }` |
| `communication/questions/by-conversation/[conversationId]/route.ts` | `400` `conversation id required`; `503`; `200` `{ ok, question }` (`null` если нет) |

**Gate (обновлено):** PASS — `pnpm run typecheck`, `pnpm run lint`, `pnpm exec vitest --run` (полный suite `apps/webapp`, phase-level по `.cursor/rules/test-execution-policy.md` после изменений в нескольких деревьях тестов): **354** test files passed (4 skipped), **1798** tests passed (7 skipped).

---

## 2026-04-16 — discovery

**Кластеры** (по путям, без глубокого чтения тел handlers):

1. **Integrator GET (read-only)** — `integrator/subscriptions/*`, `integrator/appointments/*`, `integrator/reminders/*` (кроме dispatch), `integrator/communication/*`, `integrator/delivery-targets`, `integrator/diary/*`: в основном `verifyIntegratorGetSignature` из `@/infra/webhooks/verifyIntegratorSignature`.
2. **Integrator POST / side effects** — `integrator/events`, `integrator/messenger-phone/bind`, `integrator/channel-link/complete`, `integrator/reminders/dispatch`, `integrator/reminders/occurrences/{skip,snooze}`.
3. **Media** — `media/*`, `admin/media/*`, `internal/media-*`.
4. **Doctor admin merge/purge** — `doctor/clients/*`, `admin/users/*`, `admin/audit-log`.
5. **Auth** — `auth/oauth/callback/{google,apple}`, `auth/{max-init,telegram-init}` (logger), `menu` (server runtime log).
6. **Support / misc** — `public/support`, `patient/support`, `patient/diary/purge`, `booking/catalog/*`, `booking/slots`, `me`, `health/projection`, `doctor/appointments/rubitime/*`.

**Нарушения целевой политики** (гипотеза для рефакторинга, не автоматический список «плохих»):

- Любой прямой `@/infra/*` в `route.ts`, кроме явно одобренных исключений (будут перечислены в `PLAN.md` после согласования).

**Гипотезы / needs verification:**

- Можно ли централизовать `verifyIntegratorGetSignature` через тонкий helper в `app-layer` без циклов импорта.
- Фактическое использование `inMemoryOAuthBindingsPort` в callback routes — только test vs prod ветвление.
