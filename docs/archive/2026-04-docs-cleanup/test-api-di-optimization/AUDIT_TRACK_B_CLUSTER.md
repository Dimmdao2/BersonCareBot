# Audit — Track B (API DI / import-boundary), по кластерам

Журнал точечных аудитов после выполнения кластера из `api-di-boundary-normalization/PLAN.md`. Не заменяет `api-di-boundary-normalization/LOG.md` (там parity и gate по кластеру).

---

## 2026-04-17 — Cluster G (integrator GET / sigGet only)

### Scope

- Handlers: 14× `GET` под `apps/webapp/src/app/api/integrator/**/route.ts` (subscriptions, appointments, reminders read, communication read, delivery-targets, diary read).
- Новый слой: `apps/webapp/src/app-layer/integrator/assertIntegratorGetRequest.ts`.

### 1) `@/infra/*` в `route.ts` (политика `PLAN.md`)

**Вердикт: PASS для маршрутов кластера G.**

Проверка: `rg '@/infra/'` по каждому затронутому дереву с фильтром `route.ts` — **совпадений нет** в:

- `integrator/subscriptions/**/route.ts`
- `integrator/appointments/**/route.ts`
- `integrator/reminders/history/**/route.ts`
- `integrator/reminders/rules/**/route.ts`
- `integrator/communication/**/route.ts`
- `integrator/delivery-targets/**/route.ts`
- `integrator/diary/**/route.ts` — в scope G только **GET**: `symptom-trackings/route.ts`, `lfk-complexes/route.ts` (других `route.ts` в этом дереве нет)

В **`integrator/**/route.ts` вне G** по-прежнему есть прямые `@/infra/*` (POST: events, bind, channel-link, dispatch, skip/snooze) — ожидаемо до кластеров I и др.; это не регрессия G.

Согласованные исключения для подписи (`PLAN.md`): verify остаётся в **app-layer** (`assertIntegratorGetRequest` → `verifyIntegratorGetSignature`), не в теле route — соответствует варианту «тонкая обёртка в app-layer».

### 2) Раздувание бизнес-логики в `route.ts`

**Вердикт: PASS.**

Изменение: замена ~12 строк дублирующего guard на два вызова (`assertIntegratorGetRequest` + ранний return). Порты, маппинг DTO, валидация query/params — **без переноса новой логики в route** относительно состояния до кластера G.

### 3) Parity в `LOG.md` трека B

**Вердикт: PASS.**

Файл: `docs/TEST_AND_API_DI_OPTIMIZATION/api-di-boundary-normalization/LOG.md`, секция **«2026-04-17 — Cluster G»**.

Зафиксировано: перечень path prefix, статусы 400/401 guard, JSON-ключи `ok`/`error`, canonical подписи, read-side идемпотентность, ссылка на gate (typecheck/lint/Vitest).

### Итог кластера G (аудит)

| Критерий                         | Результат |
|----------------------------------|-----------|
| Импорты `@/infra` в GET routes G | Нет       |
| Раздувание логики в route        | Нет       |
| Parity в `LOG.md`                | Да        |

### FINDINGS → FIX (post-audit, тот же Cluster G)

| ID        | Уровень   | Тема | Статус после FIX |
|-----------|-----------|------|------------------|
| TB-MF-0   | Critical  | Не выявлено при первичном аудите (маршруты G без `@/infra`, parity в `LOG.md`) | **N/A** |
| TB-MF-1   | Major     | Под `integrator/communication/**` отсутствовали colocated `route.test.ts` для GET — расхождение с checkpoint `PLAN.md` (все integrator GET в кластере с якорными тестами) | **CLOSED** — добавлены 4× `route.test.ts` |
| TB-MF-2   | Major     | Colocated тесты кластера G (и stage13 e2e) мокали `@/infra/webhooks/verifyIntegratorSignature` вместо публичного шва `assertIntegratorGetRequest` | **CLOSED** — `testUtils/wireAssertIntegratorGetForRouteTests.ts` + мок `@/app-layer/integrator/assertIntegratorGetRequest` |

**Проверки (FIX):** step — `pnpm run typecheck`, `pnpm run lint`, `pnpm exec vitest --run src/app/api/integrator e2e/stage13-legacy-cleanup.test.ts src/app-layer/integrator/assertIntegratorGetRequest.test.ts`; phase — полный `pnpm exec vitest --run` в `apps/webapp`. `pnpm run ci` не запускался.

**Verdict после FIX:** **PASS**.

---

## MANDATORY FIX INSTRUCTIONS

Использовать при **FAIL** любого из трёх критериев аудита трека B (или при регрессии после merge).

1. **Новый или вернувшийся `@/infra/*` в затронутом `route.ts`**
   - Убрать импорт из handler; вынести в `buildAppDeps` / узкую фабрику в `app-layer/di/*` / порт в `modules`, либо в уже одобренный wrapper (как `assertIntegratorGetRequest` для GET-подписи).
   - Не менять крипто-поведение подписи в route: только делегирование в app-layer/infra по `PLAN.md`.
   - Прогнать таргетированный `route.test.ts` и при необходимости обновить mock-путь (если цепочка импорта сменилась).

2. **Бизнес-логика разрослась в `route.ts`** (условия, SQL, маппинг домена, циклы обогащения)
   - Вынести use-case в `modules/*` с инжекцией портов; в route оставить: guard, `buildAppDeps()`, вызов одной функции/use-case, маппинг в `NextResponse`.
   - Если меняется HTTP-контракт — **сначала** зафиксировать parity в `api-di-boundary-normalization/LOG.md` (и версионирование с ботом при необходимости).

3. **Parity не отражён в `LOG.md`**
   - Добавить/обновить секцию с датой и **cluster id** из `PLAN.md`: success/error статусы, минимальный набор JSON keys, подпись/идемпотентность для затронутых endpoint.
   - Обновить gate-строку (какие команды тестов реально выполнялись).

4. **Перед закрытием PR кластера B**
   - Повторить `rg '@/infra/' apps/webapp/src/app/api --glob '**/route.ts'` и сопоставить с allowlist исключений из `PLAN.md` / этого аудита.
   - Не подменять полный `pnpm run ci` точечными проверками без осознанной причины (см. `.cursor/rules/test-execution-policy.md` при наличии).

---

## MANDATORY FIX INSTRUCTIONS — closure (Cluster G, 2026-04-17)

| ID      | Уровень  | Статус   | Где зафиксировано |
|---------|----------|----------|-------------------|
| TB-MF-0 | Critical | N/A      | — |
| TB-MF-1 | Major    | **CLOSED** | Новые `communication/**/route.test.ts`; `LOG.md` § remediation |
| TB-MF-2 | Major    | **CLOSED** | `integrator/testUtils/wireAssertIntegratorGetForRouteTests.ts`; обновлённые `route.test.ts` + `e2e/stage13-legacy-cleanup.test.ts` |

---

## MANDATORY FIX INSTRUCTIONS — ремедиация при нарушении

| ID       | Severity | Условие | Действие |
|----------|----------|---------|----------|
| TB-MF-1r | **Major** | Новый integrator GET в кластере без colocated `route.test.ts` | Добавить минимальные кейсы 400/401 guard + happy/ошибка порта по образцу существующих G-тестов; обновить `LOG.md`. |
| TB-MF-2r | **Major** | В тестах снова появился прямой `vi.mock('@/infra/...')` для guard integrator GET | Вернуть мок на `@/app-layer/integrator/assertIntegratorGetRequest` и общий wire-утилиту; сохранить отдельный тест на реальную крипто-логику в `assertIntegratorGetRequest.test.ts` / `verifyIntegratorSignature.test.ts`. |
