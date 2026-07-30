> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md
> STATUS (verified 2026-07-23, code-reconciled): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md
> verified 2026-07-23: Phase 0-2 largely integrated; 28 open = genuine remaining backend (D1 session-revoke [blocked on owner TTL], E3 Zod SSOT #980, A4 RLS cutover, A2 matrix, E1 lint boundary, C3/F2/F3 post-launch); 1 owner-gated (D1 TTL decision).

# План: безопасность, стабильность и проверяемость (2026-07-21)

**Статус:** owner-activated subordinate execution artifact. Порядок относительно Product UX, privacy/readiness и
коммерческих этапов задаёт только
[`SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`](SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md).
Этот файл не создаёт второй roadmap и не является разрешением на TEST/PROD/host/database actions.

Источник: аудит архитектуры по 8 осям (изоляция слоёв, БД-доступ, контракты, когезия/стабильность,
качество тестов, наблюдаемость, устойчивость/конкурентность, безопасность+зависимости).

## Цель

Замкнуть критичные гарантии системы — **изоляцию тенантов** и **целостность денег/данных** —
сквозным ТЕСТОМ в CI и сквозным ДЕТЕКТОМ в проде, и снять остаточный долг по безопасности,
наблюдаемости и контрактам. Не «полировать структуру» (она здоровая), а сделать несущие
гарантии _проверяемыми_, а не держащимися на честном слове.

## Definition of Done (жёстко)

Пункт считается технически закрытым только при: (1) галочка в этом файле; (2) риск-соразмерные targeted checks;
(3) один full CI на phase/milestone gate, а не после каждого мелкого слайса; (4) живая проверка, где она действительно
нужна и достижима. TEST-проверка/deploy выполняется только после отдельного разрешения владельца. «Audit PASS» и
«зелёные моканые тесты» сами по себе — НЕ «готово». Обычная работа идёт repository/DEV-only; pending DEV migrations
применяются только каноническим недеструктивным `deploy/host/migrate-dev.sh`, без dump/reset. TEST/PROD/host и
production activation остаются отдельными owner gates.

## Правило источника скоупа

Скоуп берётся ТОЛЬКО из этого файла (владелец авторизовал его findings→план явно). Находки аудиторов,
которых здесь нет, — вопрос владельцу, а не новая работа. >2 correction-раундов на одном этапе без закрытия
его чек-листа = СТОП + эскалация.

## Нулевой reconciliation gate — до новых задач и кода

План возник после большого объёма уже интегрированной SaaS/Foundation-работы, поэтому ни один пункт нельзя считать
автоматически новым долгом. Перед первым worker оркестратор сопоставляет каждый пункт с текущим кодом, taskdb и
актуальными evidence:

- `#770` — locked/FORCE runtime coverage;
- `#797` — tenant-wall diagnostics в System Health;
- `#933` — milestone CI и locked-mode test harness;
- `#934` — актуальный dependency audit;
- `#881` — отдельный канон Security CI, который здесь не дублируется.

Статус каждого подпункта: `covered`, `residual_gap`, `dependency_waiting`, `owner_gate` или `post_launch`. Новая
Доказанный `residual_gap` добавляется в канонический план существующего workstream. Новая taskdb-карточка
допустима только для отдельного цельного owner-requested/approved workstream по `docs/TASKDB_RULES.md`;
точный file scope остаётся в плане, существующие карточки не дублируются.
В частности, A1/A3/A4/F1 не запускаются как «переписать заново» до этой сверки.

### Reconciliation result — current branch, reconciled 2026-07-22

Эта таблица является текущим launch selector, а не исходным снимком до исполнения. Закрытые пункты нельзя брать
повторно из старого `residual_gap/dependency_waiting`; точные evidence ниже и в фазах являются authority.

| Item | Status               | Current truth / exact residual                                                                                                                                                                                                                                                                                                            |
| ---- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A0   | `covered`            | `#938` закрыт интеграционными коммитами `dd4241f65` + `b6222cd40`: versioned PII-free schema baseline, repo-bound ledger manifest, synthetic `.test` seed, disposable restore/pending-migration proof и fail-closed signal cleanup прошли полный независимый re-audit. A0 доказывает DDL/migration reproducibility, не RLS от owner-role. |
| A1   | `covered`            | `#937`, `296ec6e33` + `14c9b7ca7`: canonical non-owner runtime roles и locked/FORCE two-org/no-principal/principal-full PostgreSQL proof; full re-audit PASS.                                                                                                                                                                             |
| C2   | `covered`            | `#940`, `693c10d98` + `7055287ba`: bounded correlation + trusted organization context webapp→integrator→worker; terminal audit PASS.                                                                                                                                                                                                      |
| F1   | `covered`            | `#942`, `03c1dfac1`: bounded Dependabot updater, `shadcn` dev-only, production graph proof; audit PASS. Fresh later advisories закрыты отдельно `#955`.                                                                                                                                                                                   |
| D3   | `covered`            | `#941`, `a70b7ce4a`: production+dev-bypass startup hard guard и invite-path negatives; audit PASS.                                                                                                                                                                                                                                        |
| A3   | `covered`            | `#946`, `3f684d135` + `7bc938e03`: existing isolation signals и bounded went-dark canary подключены к current critical tick; audit PASS.                                                                                                                                                                                                  |
| B1   | `covered`            | `#949`, integration through `ba6a9242b`: least-privilege bootstrap lookup и atomic/replay-safe payment UoW; private PostgreSQL proofs and audit PASS.                                                                                                                                                                                     |
| B2   | `covered`            | `#947`, `ff11d416a` + `3f484ea60`: bounded payment/OAuth request and body-consumption deadlines; audit PASS.                                                                                                                                                                                                                              |
| B3   | `covered`            | `#948`, `fdbea3b0e` + `d640d93b9`: full-range ordered advisory locks and atomic online slot recheck/insert; concurrency proof and audit PASS.                                                                                                                                                                                             |
| C1   | `covered`            | `#969` integrated through `ad398fe36`; terminal full-checklist re-audit PASS (`0/0/0`). Repository dark launch закрыт; host/backend/production activation остаётся отдельным `SEC-02/PR-04` owner gate.                                                                                                                                   |
| D1   | `residual_gap`       | `#919`/migration `0215` уже дают staff `session_version`, но doctor TTL остаётся 90 дней. Нужны короткий doctor TTL и revocation без per-request DB round-trip с p95 proof.                                                                                                                                                               |
| D2   | `covered`            | `#973` заморозил census/contract; `#974` интегрирован через `2d3c98acc`: central Origin/Sec-Fetch guard, exact exemptions, Server Action/GET compatibility, regression/load proof и один risk-sized audit закрыты. Full CI остаётся phase milestone.                                                                                      |
| E2   | `residual_gap`       | Source contract/census `#975` закрыт; implementation `#976` берёт только pure helper + exact `11` launch-risk routes после TEST-checkpoint, без массовой косметической миграции.                                                                                                                                                          |
| E3   | `residual_gap`       | Integrator↔webapp event contract продублирован вручную и JSON artifact расходится. Нужен один shared Zod SSOT и runtime validation на обоих концах.                                                                                                                                                                                       |
| A4   | `dependency_waiting` | Большой chokepoint уже в основном закрыт `#770/#797`; после ранних фаз выводится только exact launch-critical exception/manual-NULL matrix. Старое число файлов не является автоматическим scope.                                                                                                                                         |
| A2   | `dependency_waiting` | `#652` и существующие real-policy proofs репрезентативны, но не покрывают каждый чувствительный домен через live RLS route. Ждёт A1/A4 matrix.                                                                                                                                                                                            |
| C3   | `post_launch`        | Prometheus exporter отсутствует; раньше запуска допускается только точный low-cardinality signal, если его требует C6/release gate.                                                                                                                                                                                                       |
| F2   | `post_launch`        | God-components остаются, но их structural split идёт после UX stabilization.                                                                                                                                                                                                                                                              |
| F3   | `post_launch`        | Booking/notifications фрагментированы; сначала ownership map, без pre-launch behavioral rewrite.                                                                                                                                                                                                                                          |

**Текущий исполнимый порядок после закрытых Phase 0 и A3/B1/B2/B3:** C1 error tracking и Phase 2 D1/D2/E2/E3
открыты как независимые stages; запускаются не более трёх одновременно после exact file-scope manifest. D1 и E3
получают high-risk audit, D2/E2 — один risk-sized audit. Dependency install/audit, heavy lint/CI и единственный DEV
server сериализуются. A4/A2/E1 остаются Phase 3 и не стартуют до Phase 2 и exact residual reconciliation.

---

## 🔀 Развилки владельца — РЕШЕНО (владелец, 21.07)

| #   | Развилка                    | Решение                                                               |
| --- | --------------------------- | --------------------------------------------------------------------- |
| F-1 | Глубина RLS-cutover (A4)    | **Fail-closed + детект СЕЙЧАС**; полный cutover — отдельный follow-up |
| F-2 | Трекинг ошибок              | **Self-hosted**, dark-launch (данные не покидают бокс)                |
| F-3 | Сессии                      | **Ревокация + короткий TTL врача** (low-overhead дизайн, см. ниже)    |
| F-4 | Метрики                     | **Phase 4**, только pull-модель + низкая кардинальность               |
| F-5 | Матрица cross-tenant тестов | Стартовый тир: patients/PII, payments, bookings, messaging, diaries   |

## ⚡ Сквозной load-бюджет (жёсткий критерий приёмки, владелец 21.07)

Каждый пункт обязан доказать **околонулевую стоимость в steady-state hot-path**. «Работает» без «не грузит» = НЕ done.
Общие запреты: (1) никакого нового per-request DB round-trip; (2) никакой синхронной сети в request-path;
(3) метки метрик — только низкой кардинальности (НЕ orgId/userId); (4) новые фоновые задачи цепляем к
существующему 5-мин operator-health тику, а не плодим шедулеры. На тесте — замер до/после (latency p95, DB-pool,
RSS) как часть приёмки этапа.

**Классификация пунктов по нагрузке:**

- _Снижают нагрузку:_ B2 (таймауты освобождают зависшие коннекты), B1 (tx дешевле recovery орфанов).
- _Нулевая hot-path:_ A1 (CI-only), A3/C2 (переиспользуют уже собираемые in-process счётчики и principal-ALS),
  B3 (advisory-lock только на booking-create, редкий путь; ещё лучше — partial constraint = 0 рантайма),
  D2/D3/E2 (string-compare / build-time / init-time), C1 (событие только на ошибке, async, traces sample=0).
- _Bounded per-event:_ E3 выполняет Zod-валидацию на producer и receiver для каждого M2M event. Это не init-time:
  приёмка требует трёх одинаковых baseline→after прогонов для exact `4 096 B` representative и
  `57 671 679 B` repository-target-max body; p95 after ≤ baseline × `1.05` в каждом fixture/run, bounded RSS без
  monotonic post-GC growth и доказательство нулевых дополнительных DB/network вызовов. Это покрывает intended
  `55m` repo config, но не доказывает active PROD nginx value.
- _Load-чувствительные (делать по cheap-дизайну ниже):_ **D1 сессии**, **C3 метрики**, и присущая цена **RLS (A4)**.

---

## Фазы (секвенированы по риску и зависимостям)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### Phase 0 — Фундамент проверяемости (keystone, разблокирует всё)

- [x] **A0. PII-free greenfield baseline для CI (`#938`, prerequisite A1).** Версионированный структурный baseline
      из текущей подготовленной DEV-схемы (`pg_dump --schema-only --no-owner --no-privileges`, без строк данных),
      точный manifest обоих migration ledgers и минимальный детерминированный seed на зарезервированных
      недоставляемых `.test` идентичностях, достаточный для data-state migration guards. Disposable verifier обязан:
      восстановить baseline в приватный ephemeral PostgreSQL, проверить отсутствие data rows до seed, применить seed,
      прогнать все pending current migrations и доказать ledger completeness/drift. Historical migrations не
      переписываются; raw DEV dump, TEST/PROD, runtime DB и synthetic partial schema запрещены. Baseline обновляется
      только отдельным осознанным schema-stage, не каждым code deploy.
      Размер: **M** · Аудит: **полный адверсарный** (migration integrity + PII-free artifact).
      **Закрыто 2026-07-21:** интеграционные коммиты `dd4241f65` + `b6222cd40`; static gate `6/6`, обычный и
      append-only disposable restore, SIGTERM-during-migration cleanup и полный независимый re-audit — PASS.
- [x] **A1. RLS-conformance harness в CI.** Поднять Postgres-сервис в `ci.yml`, прогнать миграции в `locked`-режиме,
      посеять org A + org B, три ассерта: (а) принципал видит только свою орг; (б) **запрос без принципала под
      FORCE-RLS → пусто/ошибка, но НЕ строки чужой орг**; (в) principal-full видит строки. Завести в мерж-гейт.
      _Почему keystone: без этого A2/A4/B1/B3 нечем верифицировать против реальности._
      Файлы: `.github/workflows/ci.yml`, `apps/webapp/vitest.setup.ts:30`, `vitest.globalSetup.ts`, `package.json:test:with-db`.
      Размер: **M** · Аудит: **полный адверсарный** (это про изоляцию).
      **Закрыто 2026-07-21:** интеграционные коммиты `296ec6e33` + `14c9b7ca7`; dedicated CI gate поднимает
      приватный ephemeral PostgreSQL из A0 baseline, применяет актуальные миграции и доказывает own-org access,
      cross-org denial, principal-full access и буквальный FORCE-RLS fail-closed без signed principal для обоих
      canonical non-owner runtime login. Независимый полный re-audit — PASS; итоговый verifier — PASS (`5/5`).
- [x] **C2. `orgId` + сквозной correlation-id в стандартный контекст pino** (webapp→integrator→worker).
      Разблокирует трассировку и A3. Файлы: `apps/*/src/**/logger.ts`, request-middleware/proxy. Размер: **S-M** · Аудит: один.
      **Закрыто 2026-07-21:** интеграционные коммиты `693c10d98` + `7055287ba`; существующий principal ALS и
      pino переиспользованы для bounded UUID correlation и trusted organization context через webapp, integrator,
      outgoing-delivery и media worker. Первый независимый аудит нашёл два P1: часть webapp ingress генерировала
      второй id, а raw legacy auth header мог переопределить безопасное log-поле. Один coherent correction закрыл
      оба finding и добавил полный request-bound route census; terminal re-audit — PASS `0/0/0`. Milestone CI
      дополнительно закрыл stale partial mocks и deterministic shared-package typecheck ordering (`564e26b9f`,
      `40904546a`).
- [x] **F1. dependabot/renovate + `shadcn` → devDependencies** (снимает 2 high из прод-дерева). Размер: **S** · Аудит: один.
      **Закрыто 2026-07-21:** `03c1dfac1`; выбран один bounded GitHub Dependabot updater для root pnpm workspace
      (weekly, максимум 5 PR, без auto-merge/deploy), `shadcn@4.7.0` перенесён в devDependencies без lock/resolution
      drift и отсутствует в production graph всех workspaces. Один независимый аудит — PASS `0/0/0`; offline frozen
      install, manifest/config proofs и CLI proof — PASS. Реальный Dependabot schedule начнёт работать только после
      попадания конфига в default branch; это не симулируется локально.
- [x] **D3. Hard-guard `ALLOW_DEV_AUTH_BYPASS`** — throw при `NODE_ENV=production` на этапе парсинга env.
      Файлы: `apps/webapp/src/app/api/clinic/invites/route.ts:70`, `config/env`. Размер: **S** · Аудит: один.
      **Закрыто 2026-07-21:** `a70b7ce4a`; exact boolean parser отклоняет неоднозначные значения, production с
      включённым bypass падает на config/startup boundary, оба dev-auth route остаются fail-closed, а production
      invite не раскрывает token и не смягчает delivery failure. Один независимый security-аудит — PASS `0/0/0`;
      targeted tests, typecheck, scoped lint и реальный production config-import proof — PASS.

**Phase 0 milestone status (2026-07-21): [x] green.** Lint/static security gates, all workspace typechecks, HLS
sync, integrator tests (`177` files; `1319` passed), webapp full suite plus exact resumed failures (`1498` initially
passed and all `8` failed files then passed `76/76`), media-worker (`14` files; `61` passed), backend/webapp builds,
SaaS/migration audits and registry audit all passed. CI was resumed from each failing command instead of restarting
already-green expensive steps. Working DEV migration `0224` remained fail-closed with SQLSTATE `42501`; no database
apply, TEST/PROD or deploy is claimed.

### Phase 1 — Максимальное снижение риска (параллельно, независимые file-scope)

- [x] **A3. Замкнуть детект в проде.** Завести isolation-события (`missing_principal`) в 5-минутный
      `collectCriticalHealthSignals` алерт-тик + добавить per-org «went-dark» канарейку (падение row-count/активных орг в ноль).
      Файлы: `app-layer/health/collectCriticalHealthSignals.ts`, `infra/db/saasIsolationDbFailureReporting.ts`,
      `infra/db/webappPoolProvider.ts`. Размер: **S-M** · Аудит: полный (детект изоляции).
      **Закрыто 2026-07-21:** интеграционные коммиты `3f684d135` + `7bc938e03`; существующие in-process
      missing-principal/role counters, persisted isolation diagnostics и bounded per-org went-dark canary подключены
      только к существующему 5-минутному critical tick. Первый полный аудит нашёл два P1: новые чтения попадали в
      doctor/Today request-path, а lifetime state рос при churn. Один coherent correction выделил lightweight banner
      collector, ввёл hard cap `4096` и доказал active-set→zero/churn semantics. Terminal re-audit — PASS `0/0/0`;
      targeted suite `66/66`, typecheck и scoped lint — PASS. Production activation/deploy не выполнялись.
- [x] **B1. Атомарность захвата платежа.** СНАЧАЛА verify-spike (доказать окна краша живьём), затем: обернуть
      record-event + capture + mark-processed в одну транзакцию ЛИБО сделать capture полностью replay-safe
      (повторная доставка `duplicate` доводит незавершённый захват). Файлы: `payments/service.ts:330-461`.
      Размер: verify **S** + fix **M** · Аудит: **полный** (деньги).
      **Исторический terminal hard stop 2026-07-21 (superseded):** изолированный кандидат `1a07bc2e3` закрывает прежние crash/replay,
      lifecycle-event, changed-body, delivery и product-UoW findings; executable old-base и private PostgreSQL
      proofs, `85` targeted tests, typecheck/lint/migration gates зелёные. После второго correction-pass финальный
      аудит всё же нашёл `0 P0 / 1 P1`: locked bootstrap principal публичного webhook не имеет grant/RLS path для
      pre-org lookup в `be_payment_provider_events`/`be_payment_intents`, поэтому production route не может узнать
      organization до exact-org signature verification. По hard ceiling третья коррекция не открыта; `#949`
      blocked/owner-waiting. Возможное продолжение требует отдельного owner gate на узкую least-privilege authority
      capability, возвращающую только `organization_id`, а не общий доступ bootstrap к payment tables.
      **Закрыто 2026-07-21:** owner clarification разрешило продолжить ясное направление без нового продуктового
      решения. Интеграционные коммиты до `ba6a9242b` добавили узкий least-privilege authority resolver, который
      возвращает только `organization_id`, не открывает bootstrap-чтение payment tables/сумм/payload/PII, имеет
      фиксированный search path и fail-closed semantics для unknown/ambiguous key. После установки exact-org
      principal webhook проверяет organization-specific authority/signature и использует атомарный replay-safe UoW.
      Private PostgreSQL lifecycle/rollback/concurrency proofs, focused tests, typecheck/lint, D3.4/static gates и
      terminal independent audit прошли без findings. Общий milestone gate зелёный на `c6a8930c2`; рабочая БД,
      внешние провайдеры, TEST/PROD и deploy на этапе реализации не затрагивались.
- [x] **B2. `fetchWithTimeout` на все платёжные/OAuth-вызовы** (Yookassa/Tinkoff/Apple/Google) — переиспользовать
      существующий `fetchWithTimeout` из `operatorHealthProbeRunner.ts`. Размер: **S** · Аудит: один.
      **Закрыто 2026-07-21:** интеграционные коммиты `ff11d416a` + `3f484ea60`; единая webapp-граница ограничивает
      YooKassa/Tinkoff и Apple/Google/Yandex OAuth-вызовы до полного чтения тела ответа, различает timeout и caller
      abort и сохраняет прежние HTTP/idempotency/nullable-контракты. Первый независимый аудит нашёл один P1 —
      deadline снимался после заголовков; один coherent correction добавил bounded body-consumption и adversarial
      stalled-body proof. Terminal re-audit — PASS `0/0`; targeted suite `46/46`, typecheck и scoped lint — PASS.
      Три integrator Google Calendar delivery-callsite остаются P2 owner recommendation вне payment/OAuth scope,
      а не автоматически созданной задачей.
- [x] **B3. Закрыть онлайн-слот TOCTOU** — advisory-lock на `(org, slotStart)` вокруг `assertSlotAvailable`+insert
      ИЛИ partial exclusion/unique на онлайн-ёмкость (паритет с очным GiST-констрейнтом).
      Файлы: `canonicalCreate.ts:161-203`. Размер: **S-M** · Аудит: полный (конкурентность+деньги).
      **Закрыто 2026-07-21:** интеграционные коммиты `fdbea3b0e` + `d640d93b9`; online/null-capacity writer
      валидирует bounded minute-aligned chain, берёт ordered per-minute organization keys одним SQL-вызовом,
      повторно читает busy intervals и вставляет всю цепочку в той же Drizzle-транзакции. Первый полный аудит нашёл
      один P1: exact-start keys не закрывали off-grid overlapping starts. Один coherent correction перешёл на весь
      half-open range; private PostgreSQL proofs закрывают same/distinct-start, chain, adjacent, reverse/deadlock и
      cross-org случаи. Terminal re-audit — PASS `0/0/0`; targeted suite `31/31`, disposable verifier, typecheck и
      scoped lint — PASS. Schedule-block linearization остаётся owner question вне утверждённого B3, не новой задачей.
- [x] **C1. Трекинг ошибок** (self-hosted per F-2) в 3 сервиса + release-теги (`#969`). Размер: **M**
      (repository dark launch; host-инфра отдельно) · Аудит: один.

  Exact repository/DEV checklist (authority для worker/auditor; host activation в него не входит):
  - [x] Один backend-neutral shared package инкапсулирует Sentry protocol SDK и экспортирует только typed
        `init/capture/flush/close/release` contract; SDK динамически загружается только после enabled + valid DSN.
  - [x] Конфигурация `error_tracking_enabled` + `error_tracking_dsn` хранится как global/admin/server-only
        `system_settings`, сохраняется через canonical service/mirror и читается всеми процессами через существующие
        bounded runtime-setting accessors. Новые integration env vars и односторонняя запись mirror запрещены.
  - [x] Disabled/missing/invalid config fail-closed: никакого SDK import, startup failure, network или per-request DB
        read. Включение в global-admin UI сохраняет DSN + enabled атомарно и требует valid `http(s)` Sentry DSN.
  - [x] Error-only config: `tracesSampleRate=0`, logs/profiles/replays/session tracking/breadcrumbs/local variables/
        source-map upload/browser SDK отключены; `captureException` не await-ится в request/loop path, bounded flush
        разрешён только на graceful/fatal shutdown.
  - [x] Closed PII sanitizer пересобирает event из allowlist: exception type, redacted value, очищенные repo-relative
        stack frames и фиксированные `service/process_role/capture_point/release` tags. Request URL/path/headers/body,
        user/org/patient/correlation IDs, payload/provider response, contexts/extra/modules/attachments не уходят.
  - [x] Release определяется один раз при startup (`BUILD_ID` → bounded git SHA → dev/unknown) и получает
        process-specific tag для webapp, integrator API/worker/scheduler и media-worker.
  - [x] Webapp Node instrumentation сохраняет startup guards и передаёт в `onRequestError` только exception + fixed
        capture point; request/context objects, client boundaries и Next config не подключаются.
  - [x] Integrator API/worker/scheduler и media-worker инициализируются один раз на процесс; capture покрывает
        unexpected 5xx/startup/fatal/loop errors, но не ожидаемые 4xx. Existing safe pino/isolation telemetry
        сохраняются; raw error logging не добавляется.
  - [x] Migration/runtime overlays добавляют только disabled/empty defaults и server-reader allowlists, без записи
        `system_settings`, новых RLS/policies/roles или live DB apply. Alerting занял интегрированную migration
        `0229`; C1 проверяет актуальный journal и использует следующий свободный номер `0230`. Blocked UI-7 больше
        не является migration dependency и при возобновлении сам выбирает следующий свободный номер.
  - [x] Tests рекурсивно доказывают отсутствие уникального PII marker во всём serialized envelope, disabled no-import,
        invalid config, release fallback, success/4xx zero capture, 5xx/fatal one sanitized capture и все пять process
        hooks. Static audit запрещает `SENTRY_*`, browser SDK, traces/logs/uploads и пропущенные entrypoints.
  - [x] Loopback fake receiver принимает 0 envelopes на success и ровно 1 sanitized envelope на synthetic error;
        успешный `/health` с disabled/enabled остаётся в пределах 5% p95 noise, DB-pool counts не меняются, RSS после
        error burst не растёт монотонно. Frozen install, 3 typechecks, scoped lint/builds и milestone CI проходят.
  - [x] `docs/ARCHITECTURE/ERROR_TRACKING.md` фиксирует privacy/load/runtime contract и явный activation gate.
        Installation/backend/DB/nginx/TLS/DNS/systemd/retention/backups/PROD DSN запрещены до owner-approved
        `SEC-02/PR-04`; GlitchTip пока только инженерная рекомендация, не принятое owner решение.

### Phase 2 — Остаточная безопасность + контракты (параллельно)

- [ ] **D1. Ревокация сессий** (per F-3, task `#970`): существующий `session_version` + bounded staff cache → точечный «выйти везде»
      без глобального разлогина; TTL врача заметно ниже 90д. Файлы: `modules/auth/sessionCookie.ts:10-97`.
      Размер: **M** · Аудит: полный (auth).
      **Load-дизайн (обязателен):** НЕ добавлять DB read на каждый запрос. Текущий auth уже делает identity/bindings
      reads; D1 заменяет staff resolution bounded process-local cache полного `SessionUser + session_version` с TTL
      30с, single-flight, cap `2048` и monotonic invalidation. На cache hit = 0 DB; максимум один refresh на активного
      staff user/process/30с. Локальная revoke немедленна, другие процессы fail closed не позднее 30с. `jti` denylist
      отклонён: без registry всех выданных jti он не реализует logout-everywhere. Приёмка: p95 auth не вырос.

      ✅ **ГЕЙТ ЗАКРЫТ 24-26.07 — РЕШЕНО И РЕАЛИЗОВАНО, не спрашивать заново.** Итоговые значения:
      **idle 12 ч staff / 30 д пациент, абсолютный потолок 7 д / 90 д** (`NIGHT_PLAN_2026-07-26.md:241`).
      В коде: `apps/webapp/src/modules/auth/sessionCookie.ts:12-13,27-37`; врач и глобал-админ в одной
      корзине `staff` (`:52-65`). Отзыв сессий строже, чем требовал план: не кэш с задержкой ≤30 с, а сверка
      `platform_users.session_epoch` на каждый запрос (миграция `0244`, `auth/service.ts:992-1003`).
      ~~**Owner gate до worker:** выбрать sliding inactivity TTL врача и global admin (рекомендация `7` дней обоим)~~
      и подтвердить bounded межпроцессный revoke SLA `≤30с`; patient остаётся `90` дней.

      Exact checklist после source-backed discovery:

      - [ ] Patient TTL остаётся 90 дней; doctor/clinic staff и global-admin TTL соответствуют owner ruling;
            TEST visual global-admin остаётся 5–60 минут без sliding.
      - [ ] Signed cookie получает backward-compatible `renewedAt` (legacy fallback = `issuedAt`); sliding renewal
            обновляет marker и больше не переподписывает cookie на каждом запросе после первых суток.
      - [ ] `getCurrentSession` не создаёт фиктивно новый doctor expiry и возвращает срок подписанной cookie.
      - [ ] Staff cache хранит resolved canonical `SessionUser + securityVersion`, TTL 30с, cap 2048, single-flight,
            expired/oldest eviction и monotonic race protection; user/org IDs не попадают в metric labels/logs.
      - [ ] Cache invalidation знает requested и canonical alias; DB failure/null staff miss fail closed, valid hit
            живёт только до expiry. Patient path/cache не меняются.
      - [ ] TOTP enrollment, recovery-code login, logout-everywhere, password reset и `setSessionFromUser` после
            успешного commit немедленно seed/update cache без понижения уже известной version.
      - [ ] Logout-everywhere сохраняет текущий браузер, отвергает остальные cookies этого user немедленно локально
            и не позднее 30с в другом процессе; другой staff user и patient не затронуты.
      - [ ] Tests: role TTLs, legacy/renewal/operator cookie, cache hit/miss/single-flight/expiry/eviction/race/alias,
            outage/deletion/demotion, все version writers, current-session survival и patient unchanged.
      - [ ] Dependency-free benchmark `/api/menu`: три прогона concurrency 16 после warm-up, 0 non-2xx,
            p95 after ≤ baseline ×1.05; записаны p50/p99/throughput, DB pool waits/connections и RSS без monotonic growth.
      - [ ] Live TEST использует два production-like doctor browser profiles без dev-bypass: revoke A сохраняет A,
            инвалидирует B ≤30с; другой doctor/patient не затронут; Max-Age соответствует ruling.

- [x] **D2. CSRF/Origin-проверка** на мутирующих роутах как defense-in-depth поверх `SameSite=lax`.
      Размер: **S-M** · Аудит: один.

      **Source contract (`#973`, census на `3e9d27490`):** всего `518` API route-файлов; unsafe methods имеют
      `353` mutating route-файла / `392` mutating handlers; отдельно существуют `28` Server Action files. Все
      mutating route-файлы должны оставаться в исчерпывающей классификации: cookie/public browser, `18` integrator
      HMAC, `13` internal Bearer jobs, `2` provider webhook patterns и Apple `form_post`. Девять stateful GET
      являются отдельными proof-bound exceptions и не переводятся молча в unsafe-method policy.

      Exact checklist после source-backed discovery:

      - [x] **D2-01 — frozen census.** Текущая post-C1 перепись всех `519` `app/api/**/route.ts` доказывает unsafe
            subset `354` mutating route files / `393` mutating handlers, включая `320` browser files / `359`
            browser handlers. Добавленный global-admin `platform/error-tracking` PUT остаётся обычной browser
            mutation; special exemptions не расширены. Census исчерпывающе распределяет unsafe subset по
            browser/integrator/internal/webhook/Apple классам и отдельно фиксирует девять stateful GET и `28`
            Server Action files; новая, потерянная или осиротевшая route ломает gate.
      - [x] **D2-02 — pure shared helper.** Один синхронный helper в `src/middleware/` возвращает `allow | reject`
            и proof-class; не импортирует DI, auth, DB, runtime settings, logging или network.
      - [x] **D2-03 — fail-closed browser policy.** Для browser `POST/PUT/PATCH/DELETE` под `/api/**` и `/app/**`:
            present `Sec-Fetch-Site` допускает только `same-origin`; валидный одиночный non-null `Origin` обязан
            точно совпадать с canonical scheme+host+port; только при отсутствии Origin допустим валидный
            same-origin Referer. Missing both, malformed/multiple/null Origin, sibling `same-site`, scheme/port и
            localhost/127.0.0.1 alias mismatch отвергаются.
      - [x] **D2-04 — proxy chokepoint.** Guard вызывается в `proxy.ts` сразу после bounded correlation-id и до
            redirects/platform cookies/session renewal/dispatch. Reject = `403`, `Cache-Control: no-store`,
            `{ok:false,error:"csrf_origin_forbidden"}` и только bounded correlation response header; observed и
            expected origins не логируются и не возвращаются.
      - [x] **D2-05 — exact runtime exemptions.** Typed exact allowlist/pattern registry содержит только `18`
            integrator routes, `13` internal jobs, два payment webhook patterns и Apple callback. Prefix-wide,
            cookie-presence и `NODE_ENV` bypass запрещены; public/auth browser routes не являются exemptions.
      - [x] **D2-06 — stronger-proof assertions.** Static tests доказывают вызов `verifyIntegratorSignature` в
            каждом integrator exemption, constant-time `INTERNAL_JOB_SECRET` во всех internal jobs, provider
            verification в обоих webhook routes и signed state + ID-token nonce в Apple callback.
      - [x] **D2-07 — Server Actions и GET exceptions.** Same-origin Server Action POST проходит, cross-site и
            missing-Origin/Referer fail до Next handler. Девять stateful GET и их proofs/reasons заморожены;
            OAuth callbacks, reminder deep-links, dev helpers и logout semantics этим этапом не меняются.
      - [x] **D2-08 — proxy/localhost compatibility.** `127.0.0.1` и `localhost` разрешены только при точном Host;
            `X-Forwarded-Host` игнорируется, first `X-Forwarded-Proto` принимается только как `http|https`.
            Известные direct Node/browser smoke callers передают точный Origin; WebView DEV smoke включён.
      - [x] **D2-09 — regression matrix.** Safe methods не меняются; покрыты authenticated/public booking/browser
            API, Server Actions, Origin и Referer success, все negative header cases, каждый exemption без browser
            headers, lookalike paths и отсутствие session-cookie renewal/set на reject.
      - [x] **D2-10 — load/validation gate.** Helper делает только sync string/URL comparison, `0` DB/network calls.
            Три loopback-прогона no-session browser POST, concurrency `16`: стабильный ожидаемый status и `0`
            неожиданных transport failures, p95 after `<= baseline x 1.05`, stable RSS/DB-pool. Focused Vitest,
            webapp typecheck, scoped ESLint и
            `git diff --check` проходят; full CI остаётся phase milestone, не повторяется для D2.

      **Exact implementation manifest:** `apps/webapp/src/middleware/csrfOrigin.ts{,.test.ts}`,
      `apps/webapp/src/proxy.ts{,.test.ts}`, `apps/webapp/e2e/api-auth-exchange.test.ts`,
      `deploy/host/test-visual-global-admin-session.mjs`, `apps/webapp/src/app/api/api.md`. Запрещены массовые
      route rewrites, CORS/schema/migration/config/env/session redesign, webhook rewrite, GET conversion,
      TEST/PROD/host/deploy и E2 response-builder scope.

      **Отдельный owner question, не D2 scope:** пять `mock-complete` routes фактически не имеют общего dev-only
      runtime gate. D2 защищает их как обычные browser mutations; решение об их retirement/environment gate не
      создаётся audit finding-ом внутри D2.

      **Закрыто 2026-07-22:** source contract `#973`, implementation `7e192629f` и bounded audit correction
      `2d3c98acc`. Один независимый risk-sized audit подтвердил D2-01/02/04/05/06/07/08/10 и нашёл ровно один P1:
      объединённые duplicate `Referer` могли выглядеть same-origin. Fail-closed parser и adversarial regression
      закрыли D2-03/09 без второго audit-round; integration focused suite `26 passed / 4 opt-in live skipped`.
      Worker typecheck/scoped lint/diff/node checks прошли; interleaved load proof дал p95 ratio `1.0021`, zero
      transport/status failures, zero DB pool и RSS spread `655360` bytes. Full CI остаётся accumulated phase gate;
      DB, TEST/PROD, deploy и второй server не использовались.

<a id="e2-source-contract-975"></a>

- [x] **E2. Общий `jsonOk/jsonError` builder + маппер ошибка→HTTP.** Внедрение инкрементальное; новые роуты обязаны,
      старые мигрируют волной. Размер: **M** (helper) + постепенная адаптация · Аудит: один.

      **Source contract (`#975`, census на `252d54636`):** в `apps/webapp/src/app/api/**/route.ts` есть
      `518` route-файлов и `2 751` вызов `NextResponse.json` на `2 750` source-строках.
      Same-line census нашёл `1 993` начала `{ ok: false, error: ... }` и `47` direct
      `NextResponse.json({ error: ... })`; структурный source-pass считает соответственно
      `2 024` и `51` object literals. Ещё `161` route-строка читает `error.message`. Эти
      числа разделены по единицам подсчёта и не являются вечным global gate. Текущее распределение
      status-ответов: `401=74`, `403=107`, `404=366`, `409=89`, `422=13`, `429=16`, `500=68`,
      `502=20`, `503=207`; `Retry-After` встречается `22` раза в `20` route-файлах, явный
      `no-store` — в `7` route-файлах.
      Это provenance-цифры, а не вечный total-file gate: implementation-карточка после интеграции
      предшественников повторно считает aggregate, но не расширяет frozen волну из `11` routes.

      Общего server response builder и safe error mapper сейчас нет. `shared/lib/apiJson.ts`
      — только client fetch/parser (`51` name-bearing файл, включая tests). Суженные server helpers
      остаются в своих границах: booking-catalog `_httpErrors` (`7`/для catalog-id `6`
      name-bearing файлов), booking-engine UUID (`4`), membership mapper (`8`), system-settings org-context
      response (`4`), integrator request assertion (`36`) и auth/role/entitlement guards. Их PG/domain/auth semantics
      не сливаются в глобальный string mapper. `proxy.ts` остаётся единственным SSOT
      для bounded correlation ID; E2 не генерирует и не отражает request identifiers.

      **Exact checklist после source-backed discovery:**

      - [x] **E2-01 — source census и contract freeze.** Зафиксированы aggregate provenance,
            existing helper/type/callsite families, exact `11`-route adoption wave, current status/body/header
            compatibility matrix, intended redactions и protected sibling-stage scope. `#975` не пишет код;
            implementation получает отдельную карточку только после integration/rebase preflight.
      - [x] **E2-02 — pure typed builder.** Один server-only `jsonOk/jsonError` helper принимает
            только JSON-serializable payload, типами запрещает caller override `ok`/`error`, сохраняет
            `ResponseInit`/headers/cookies и не импортирует DI, auth, DB, settings, logging или network.
      - [x] **E2-03 — safe error mapper.** Mapper различает только typed errors и exact closed
            literal rules, возвращает `status + stable error code + allowlisted public fields/headers`, а unknown
            всегда сводит к fixed route fallback. Произвольные `Error.message`, SQL/provider payload,
            request data и PII не попадают в body; общий PG-code/string-sniff registry запрещён.
      - [x] **E2-04 — identity/signup wave.** Адаптированы specialist-signup `start`/`confirm`
            и OAuth `start`; текущие signup recovery, rollout-lock, proxy, rate-limit и fixed-message contracts
            сохранены без auth/session redesign; OAuth feature-disabled сохраняет точный
            `501 oauth_disabled` contract.
      - [x] **E2-05 — invite wave.** Адаптированы clinic invite list/create и accept `start`/`confirm`;
            guard/entitlement, email mismatch, seat-limit, delivery failure, retry fields и DEV-only preview не меняются.
      - [x] **E2-06 — booking wave.** Адаптированы authenticated/public create routes; все known
            literal/domain status mappings сохранены, а unknown fallback больше не возвращает
            `error.message` и даёт fixed `create_failed` с прежним status `503`.
      - [x] **E2-07 — payment wave.** Адаптированы оба provider webhook routes; exact-org verification,
            signature masking, replay/UoW и success acknowledgements не меняются. Unknown catches возвращают
            fixed `webhook_failed` / `webhook_verification_failed` с прежним status `400`; request-derived
            `payment_provider_unavailable:${providerId}` становится fixed `payment_provider_unavailable`.
      - [x] **E2-08 — tenant wave.** Адаптирован patient organization-context route; `private, no-store`,
            cookie/revalidation behavior, activation guard и tenant-existence masking сохранены. Redirecting `/open`
            не входит в JSON-builder wave.
      - [x] **E2-09 — static adoption/leak/boundary gate.** Exact `11` routes импортируют helper;
            в них нет direct `NextResponse.json` и returned caught/request-derived messages. Helper и route delta не
            добавляют `@/infra/db`, `@/infra/repos`, `drizzle-orm`, DB/network/runtime imports. Static script
            имеет adversarial self-test на missing route/import/raw-message/boundary cases.
      - [x] **E2-10 — regression/load/validation gate.** Helper tests, существующие exact route tests и новый
            patient-acquiring webhook test доказывают matrix, `501 oauth_disabled`, current
            `503 rubitime_projection_not_ready` и unknown redaction. Три in-process
            benchmark-прогона после warm-up, concurrency `16`: p95 after `<= baseline x 1.05`, записаны
            p50/p99/throughput, DB/network invocation count `0`, RSS после error burst не растёт монотонно.
            Focused Vitest, webapp typecheck, scoped ESLint, static script и `git diff --check` проходят;
            full CI остаётся accumulated Phase 2 milestone. Один terminal audit, без serial nit-picking rounds.

      **Worker evidence (`#976`, 2026-07-22).** E2-02…E2-09 реализованы в закрытом manifest. Focused Vitest
      прошёл: `15` files, `82` passed, `1` штатно skipped до отдельного benchmark opt-in; webapp typecheck,
      scoped ESLint, static gate, его `5` adversarial self-test mutations и `git diff --check` зелёные. Отдельный
      warm benchmark выполнил три interleaved run при concurrency `16`: median p95 ratio `0.968399`, DB/network
      invocation count `0/0`, RSS samples `132804608` bytes остались плоскими и не показали monotonic growth;
      p50/p95/p99/throughput каждого before/after run записаны в Product UX LOG. E2-10 и общий E2 остаются
      незакрытыми только до обязательного terminal independent audit; full CI не запускался и остаётся milestone gate.

      **FAIL-audit correction (`#976`, 2026-07-22).** Literal lookup теперь требует own property одинаково для
      обычных и typed rule maps; унаследованные `toString`, `constructor` и `__proto__` доказанно дают fixed
      `503 create_failed` в helper и обоих booking routes. Benchmark теперь проверяет лимит `<=1.05` для каждого
      из трёх run, а DB/network counters измеряются spies на `pg.Pool.query` и `fetch`, блокирующими любое обращение,
      вместо констант. Correction run ratios: `1.001997`, `0.986968`, `0.969491`; instrumented DB/network `0/0`,
      RSS `132149248` bytes flat. Affected Vitest (`3` files, `26` passed, `1` opt-in skip), отдельный benchmark
      (`6` passed), typecheck, scoped ESLint, static+self-test и diff-check зелёные.

      **Independent re-audit PASS (`#976`, 2026-07-22).** Fresh auditor verified every E2-02…E2-10 row and the
      exact `21`-file manifest with `0 P0 / 0 P1 / 0 P2`. Re-run focused tests passed (`3` files, `26` passed,
      `1` opt-in skip); the opt-in benchmark passed `6/6` with per-run p95 ratios `0.980419`, `0.994567`,
      `1.015103`, instrumented DB/network counts `0/0`, and five flat RSS samples of `137310208` bytes. Both
      booking routes returned exact `503 create_failed` for `toString`, `constructor` and `__proto__`; static gate,
      adversarial self-test and diff-check passed. E2 is repository-complete. Accumulated Phase 2 full CI later
      passed on integrated HEAD `63de21030`: lint/typecheck/HLS, `1,352` integrator, `8,938` webapp and `67`
      media-worker tests, both production builds and the full audit chain were green. The webapp test globalSetup
      received `permission_denied` for migration `0229` and degraded to in-memory, so this is not DB evidence;
      no explicit DB/server/network/deploy/TEST/PROD action ran.

      **Compatibility matrix (внешний HTTP contract):**

      | Класс | Frozen E2 contract |
      |---|---|
      | Success | Точные status, `ok: true` и текущие route-specific fields сохраняются; builder не добавляет implicit payload. |
      | `400` / `401` / `403` | Validation/proof, unauthenticated/invalid authority, forbidden/tenant masking сохраняют текущие status и stable code; payment signature unknown-authority остаётся неразличимым `401 invalid_webhook_signature`. |
      | `404` / `409` / `422` / `423` | Same-tenant missing, conflict, существующий domain/payment unprocessable и rollout lock сохраняются route-by-route; новые normalization rules не вводятся. |
      | `429` | Status, body и `retryAfterSeconds` сохраняются; имеющееся presence/absence `Retry-After` не нормализуется этой волной. |
      | `501` | Текущий OAuth `oauth_disabled` сохраняет status `501` и стабильное body; E2 не меняет feature-disabled semantics. |
      | `500` / `502` / `503` | Internal, malformed-upstream и dependency/timeout/unavailable statuses сохраняются; `504` не вводится. Unknown body получает fixed route code. |
      | Headers/cookies | Explicit `Cache-Control`, `Retry-After`, redirect/cookie/revalidation и custom headers сохраняются; no-store остаётся explicit, correlation — только `proxy.ts`. |

      **Exact implementation manifest:**

      - new shared/gate files: `apps/webapp/src/shared/http/apiResponse.ts`,
        `apps/webapp/src/shared/http/apiResponse.test.ts`,
        `apps/webapp/scripts/check-e2-api-response-contract.mjs` (со встроенным `--self-test`) и
        `apps/webapp/src/app/api/payments/patient-acquiring-webhook/[provider]/route.test.ts`;
      - exact routes: `apps/webapp/src/app/api/auth/specialist-signup/start/route.ts`,
        `apps/webapp/src/app/api/auth/specialist-signup/confirm/route.ts`,
        `apps/webapp/src/app/api/auth/oauth/start/route.ts`, `apps/webapp/src/app/api/clinic/invites/route.ts`,
        `apps/webapp/src/app/api/clinic/invites/accept/start/route.ts`,
        `apps/webapp/src/app/api/clinic/invites/accept/confirm/route.ts`,
        `apps/webapp/src/app/api/booking/create/route.ts`,
        `apps/webapp/src/app/api/booking/public/create/route.ts`,
        `apps/webapp/src/app/api/payments/webhook/[provider]/route.ts`,
        `apps/webapp/src/app/api/payments/patient-acquiring-webhook/[provider]/route.ts` и
        `apps/webapp/src/app/api/patient/organization-context/route.ts`;
      - existing regression files: `apps/webapp/src/app/api/auth/specialist-signup/start/route.test.ts`,
        `apps/webapp/src/app/api/auth/specialist-signup/confirm/route.test.ts`,
        `apps/webapp/src/app/api/auth/oauth/start/route.test.ts`,
        `apps/webapp/src/app/api/auth/oauth/start/route.proxy-configuration.test.ts`,
        `apps/webapp/src/app/api/clinic/invites/route.test.ts`,
        `apps/webapp/src/app/api/clinic/invites/route.entitlement.test.ts`,
        `apps/webapp/src/app/api/clinic/invites/accept/start/route.test.ts`,
        `apps/webapp/src/app/api/clinic/invites/accept/confirm/route.test.ts`,
        `apps/webapp/src/app/api/booking/create/route.test.ts`,
        `apps/webapp/src/app/api/booking/public/create/route.test.ts`,
        `apps/webapp/src/app/api/payments/webhook/[provider]/route.replay.test.ts`,
        `apps/webapp/src/app/api/patient/organization-context/route.test.ts`; API contract doc
        `apps/webapp/src/app/api/api.md`.

      Это закрытый writable manifest: package manifests/lockfile не меняются. Всё прочее защищено,
      особенно active C1 `packages/error-tracking/**`, webapp instrumentation/observability, platform error-tracking
      API/UI/system-settings, migration `0230`/journal, integrator/media-worker entrypoints, runtime overlays,
      package/workspace files, C1 check/load scripts и `docs/ARCHITECTURE/ERROR_TRACKING.md`; D1 session TTL/cookie,
      staff cache, TOTP/recovery/revoke/password-reset/version-writer scope; D2 `csrfOrigin`, `proxy`, exemption/static/
      load/e2e files; Phase 3 E1 `eslint.config.mjs` и boundary-refactor payments/webhooks/integrations/infra/drizzle.
      Существующие `getPool`/infra-registry imports в public booking, invite и payment routes — уже
      запланированный E1 debt; E2 не ухудшает и не рефакторит эту границу.

      **Три инженерные рекомендации, не owner blockers и не новые stages:** (1) при redaction
      unknown errors сохранить текущие HTTP statuses; (2) не нормализовать пропущенный
      `Retry-After` в старых `429` в этой волне; (3) оставить pre-existing boundary debt для Phase 3 E1.
      Эти safe defaults уже вшиты в checklist/matrix и не блокируют следующую implementation-карточку.

- [ ] **E3. Единая Zod-схема границы integrator↔webapp** — заменить фактические дубли transport-envelope одним
      shared runtime SSOT, валидировать им producer и receiver и удалить только подтверждённо осиротевший
      `contracts/integrator-events-body.json`. Размер: **M** · Аудит: полный независимый
      (кросс-сервисный контракт).

      **Source-backed correction (`#980`, census на `63de21030`).** Старая ссылка на
      `apps/integrator/src/kernel/contracts/schemas.ts:56` была ошибочной: `incomingEventSchema` описывает внутренний
      channel/pipeline envelope `{ type, meta, payload }` и вызывается `EventGateway` в
      `apps/integrator/src/kernel/eventGateway/index.ts:31-43`. Он не является transport-contract
      `POST /api/integrator/events`, поэтому `incomingEventSchema`, `domainContextSchema`, EventGateway и их tests —
      **protected/non-target** E3.

      Фактические outgoing definitions/artifacts:
      `contracts/integrator-events-body.json:1-17`;
      `apps/integrator/src/kernel/contracts/ports.ts:382-389` (`WebappEventBody`);
      `apps/integrator/src/infra/adapters/jsonStableStringify.ts:38-60` (дублированный builder input);
      `apps/webapp/src/app/api/integrator/events/route.ts:18-32` (`eventBodyFromParsed`);
      `apps/webapp/src/modules/integrator/events.ts:65-71` (`IntegratorEventBody`). JSON уже расходится с runtime:
      он не знает `idempotencyKey`, заявляет `occurredAt` как `date-time`, а current receiver принимает любую строку.

      Receiver dispatch содержит **23** event variants: `diary.symptom.tracking.created`,
      `diary.lfk.complex.created`, `diary.lfk.session.created`, `diary.symptom.entry.created`, `user.upserted`,
      `contact.linked`, `preferences.updated`, `support.conversation.opened`,
      `support.conversation.message.appended`, `support.conversation.status.changed`, `support.question.created`,
      `support.question.message.appended`, `support.question.answered`, `support.delivery.attempt.logged`,
      `reminder.rule.upserted`, `reminder.occurrence.finalized`, `reminder.delivery.logged`,
      `content.access.granted`, `appointment.record.upserted`, `mailing.topic.upserted`,
      `user.subscription.upserted`, `user.email.autobind`, `mailing.log.sent`. У **21** есть текущие producer paths;
      `contact.linked` и `user.email.autobind` остаются consumer/legacy compatibility variants без найденного active
      exact-string producer. E3 унифицирует transport envelope, а не переписывает event-specific domain validation.

      **Compatibility freeze.** Shared unversioned envelope сохраняет:
      `eventType` как open string, непустую после `trim`, но без transform; optional string `eventId`, `occurredAt`,
      `idempotencyKey`; optional plain JSON object `payload` с рекурсивно JSON-safe значениями; дополнительные
      top-level JSON-поля через passthrough/catchall. `eventType` не превращается в enum: generic content action,
      legacy outbox и текущий unsupported-event fallback используют open string. `occurredAt` не ужесточается до ISO
      без отдельного compatibility/migration решения. Обязательный wire `version` не добавляется: queued legacy rows
      его не имеют. Payload-array, bigint/function/symbol/non-finite number/cycle на producer отвергаются до wire;
      receiver принимает только результат `JSON.parse`. Event-specific payload guards остаются в
      `apps/webapp/src/modules/integrator/events.ts` и не становятся новым discriminated union в E3.

      **Source-backed request-size boundary и exact load fixtures.** Repo-managed TEST apply path фиксирует
      `client_max_body_size 55m` (`deploy/host/apply-test-nginx-webapp.sh:117`). Production repository
      **target/template/recommendation** также `55m` (`deploy/nginx/bersoncarebot-webapp.vhost.template.conf:21`,
      `deploy/HOST_DEPLOY_README.md:372-378`), но active PROD value в этом repository-only проходе **не проверялся и
      остаётся unconfirmed**. M2M production/test домены source-backed проходят через loopback nginx
      (`docs/ARCHITECTURE/SERVER CONVENTIONS.md:84`), а upstream webapp `127.0.0.1:6200/6300` не открыт публично
      (`deploy/HOST_DEPLOY_README.md:364`). Поэтому repository load design использует conservative
      intended-config/TEST worst-case target `55 × 1 024 × 1 024 = 57 671 680` raw body bytes, но это **не runtime
      evidence active PROD ceiling**.

      E3 не добавляет route-specific request-size guard или новый JSON/HTTP error contract: у route нет меньшего
      application-level limit, а source/outbox не доказывают backward compatibility нового cap. Load PASS на
      `55 MiB` покрывает repository target. PROD acceptance всё равно требует отдельного owner-authorized effective
      config fact через `sudo nginx -T` для vhost `bersoncare.ru`; этот author/worker scope host-команду не запускает.
      Если effective PROD limit отличается от expected `55m`, равен `0`/unlimited или не может быть подтверждён,
      это config-drift/owner gate: E3 не заявляет PROD readiness и не выбирает новый cap/status молча.

      Load proof строит оба raw UTF-8 JSON body **реальным**
      `apps/integrator/src/infra/db/buildAppointmentRecordUpsertedFanout.ts:33-72`, затем current
      `buildIntegratorEventsHttpBody`; byte-equivalent mirror допустим только если отдельный test сравнивает его exact
      output с builder. Exact `BookingUpsertFanoutSource` fixture:

      ```ts
      {
        externalRecordId: "rec-e3-load",
        phoneNormalized: "+79990000000",
        recordAt: "2026-07-22T10:00:00.000Z",
        status: "updated",
        payloadJson: {
          name: "Synthetic Patient",
          email: "synthetic@example.invalid",
          link: "https://example.invalid/manage/rec-e3-load",
          note: "<ASCII x-padding>",
        },
        lastEvent: "updated",
        updatedAt: "2026-07-22T09:00:00.000Z",
        patientFirstName: "Synthetic",
        patientLastName: "Patient",
        patientEmail: "synthetic@example.invalid",
        integratorBranchId: "branch-e3",
        branchName: "Synthetic Branch",
        dateTimeEnd: "2026-07-22T11:00:00.000Z",
        serviceId: "service-e3",
        serviceName: "Synthetic Service",
        rubitimeCooperatorId: "cooperator-e3",
        integratorUserId: "100",
      }
      ```

      `status:"updated"` принадлежит допустимому builder union `created|updated|canceled|deleted`; все current source
      fields присутствуют. Полученный payload обязан содержать полный current output:
      `integratorRecordId`, `phoneNormalized`, `recordAt`, `status`, `payloadJson`, `lastEvent`, `updatedAt`,
      `patientFirstName`, `patientLastName`, `patientEmail`, `integratorBranchId`, `branchName`, `dateTimeEnd`,
      `serviceId`, top-level `serviceName`, `rubitimeCooperatorId`, `integratorUserId`, `rubitimeManageUrl`;
      envelope — current `eventType`, derived `idempotencyKey`, `occurredAt`, `payload`, без выдуманного `eventId`.
      Все значения fixed synthetic ASCII; меняется только `payloadJson.note=<ASCII x-padding>`. После builder + wire
      serialization обязательны asserts `Buffer.byteLength(body,"utf8")`: representative ровно `4 096 B`,
      repository-target-max ровно `57 671 679 B` (`55 MiB − 1`). Handler/DB не вызываются.

      Каждый из **трёх identical runs** после warm-up измеряет interleaved baseline/current envelope path против
      after/shared-Zod path для обоих fixtures: representative `1 280` samples/path,
      repository-target-max `16` samples/path,
      alternating `AB/BA` order. Baseline фиксирует текущие builder/stable serialization + HMAC/raw JSON parse +
      ручной envelope guard; after выполняет тот же путь и добавляет shared schema на producer и receiver. Для каждого
      из `3 × 2` fixture-runs отдельно: `p95_after ≤ p95_baseline × 1.05`; записываются обе стороны
      `p50/p95/p99/throughput`, median-only PASS запрещён. Baseline/after RSS запускаются в изолированных child
      processes под `node --expose-gc`: after peak и max из пяти post-GC samples не выше
      `max(baseline × 1.05, baseline + 8 MiB)`, пять after post-GC samples не строго монотонно растут. Blocking spies
      на `globalThis.fetch` и `pg.Pool.prototype.query` обязаны дать `0/0`; любой вызов немедленно роняет proof.

      **Compatibility / error / retry / load matrix:**

      | Boundary / case | Frozen result | Evidence / invariant |
      |---|---|---|
      | Producer, valid event | Текущие stable bytes, normalized header/body idempotency, подпись и fallback-key semantics | `webappEventsClient.ts:126-151`, `jsonStableStringify.ts:1-60` |
      | Producer, invalid envelope | Fixed permanent `{ ok:false, status:422, error:"invalid integrator event envelope" }` до `getAppBaseUrl`, подписи, fetch и любого нового I/O; Zod paths/payload не логируются | Новый shared-schema/client test |
      | Receiver auth order | headers/key → signature над raw body → JSON parse → shared schema → tenant specialization → idempotency → DI/handler | `route.ts:35-110`; invalid signature остаётся `401` до schema |
      | Receiver malformed/schema-invalid | Fixed `400`; без raw body, Zod details, payload, secret или arbitrary message; idempotency/DI/handler не вызываются | Route adversarial tests |
      | Header/body idempotency mismatch | Точный текущий `400`; non-Latin producer key сначала нормализуется, затем body совпадает с header | `route.ts:63-65`, `webappEventsClient.test.ts:163-184` |
      | Semantic replay | Hash считается по passthrough parsed object; `occurredAt` и body idempotency исключены; accepted `202` cache, mismatch `409`, transient `503` не cache | `integratorEventSemanticHash.ts:109-126`, route replay tests |
      | Handler permanent / unknown | Текущий permanent handler result остаётся `422`; unknown open-string event сохраняет `durable ingest is not implemented`, а не превращается в schema `400` | `route.ts:233-260`, `events.ts:1329-1332` |
      | Tenant specialization | `support.delivery.attempt.logged` по-прежнему требует UUID `payload.organizationId` и ставит verified organization principal до idempotency/handler; tenant model остальных событий не меняется | `route.ts:67-81`, route principal tests |
      | Immediate emit failure | Существующий outbox fallback сохраняется для наблюдаемости; E3 не меняет projection payloads/transactions | `projectionFanout.ts:12-44` |
      | Worker retry / DLQ | `status=0`, `5xx`, `408`, `429` retry; permanent `4xx`, включая local schema `422`, уходит в DLQ без retry burn | `projectionEmitFailure.ts:4-15`, `projectionWorker.ts:30-58` |
      | Request-size boundary | TEST apply и PROD repository target = `55m`; active PROD value unconfirmed, не runtime evidence. Меньший route cap/status не добавляется без compatibility evidence; PROD acceptance owner/host-gated | TEST apply `:117`, PROD template `:21`, HOST recommendation `:372-378`, Server Conventions `:84` |
      | Appointment load fixture | Actual `buildAppointmentRecordUpsertedFanout` либо test-proven byte-equivalent mirror; status `updated`, все source/output fields, `serviceName` top-level, padding только `payloadJson.note`, без `eventId` | Builder `:5-23,33-72` + current wire serializer; exact `4 096 B`/`57 671 679 B` asserts |
      | Load | Baseline/current envelope path против after с двумя shared-schema validations; никаких новых DB/network вызовов, scheduler или high-cardinality metrics | Три identical runs × representative/repository-target-max; каждый p95 ratio ≤ `1.05`; обе стороны p50/p95/p99/throughput; RSS ≤ `max(baseline×1.05, baseline+8 MiB)`, five-sample non-monotonic post-GC, DB/network `0/0`; не active-PROD proof |

      **Exact checklist после source-backed discovery:**

      - [x] **E3-01 — source correction/freeze.** Исправлена неверная plan-ссылка; `incomingEventSchema` и
            EventGateway объявлены protected; зафиксированы пять реальных дублей, 23 consumer variants,
            21 active + 2 legacy-only, compatibility/error/retry/load matrix, exact writable manifest и protected
            sibling scope; TEST/PROD-repository `55m` target отделён от unconfirmed active PROD; exact builder-backed
            `4 096 B`/`57 671 679 B` fixtures и числовые latency/RSS/zero-I/O gates заморожены. `#980` пишет только
            source contract; implementation получает отдельный worker pass.
      - [ ] **E3-02 — dedicated runtime SSOT.** Создать минимальный workspace package
            `@bersoncare/integrator-webapp-event-contract` с одной Zod-схемой и inferred type; JSON-safe recursive
            payload, passthrough top-level, без wire version/enum/domain payload union.
      - [ ] **E3-03 — package graph.** Подключить package к обоим apps, workspace/lock и существующему
            build/ensure graph. Root `package.json#scripts.test` обязан последовательно запускать
            exact `pnpm --dir packages/integrator-webapp-event-contract test && pnpm --dir apps/integrator test`;
            current root `ci` уже вызывает `pnpm test`, поэтому workflow/CI-файл не меняется. Доказать fresh-clone
            в новом clean isolated worktree командами `test ! -e packages/integrator-webapp-event-contract/dist/index.js`,
            `pnpm install --frozen-lockfile`, `pnpm test`; pre-existing/stale package `dist` запрещён как proof input.
      - [ ] **E3-04 — producer validation.** `emit` выполняет `safeParse` до `getAppBaseUrl`, подписи, fetch и прочего
            I/O. Невалидный event возвращает fixed permanent result
            `status:422,error:"invalid integrator event envelope"`, без Zod paths/payload в логах.
      - [ ] **E3-05 — wire stability.** Для валидного события сохранить normalized body/header idempotency,
            stable serialization/signature bytes, fallback-key derivation и `200/202 + {ok:true}` contract.
      - [ ] **E3-06 — receiver validation/order.** Порядок остаётся headers/key → signature over raw body → JSON
            parse → shared schema → tenant specialization → idempotency → DI/handler. Invalid schema: fixed `400`,
            без Zod details, payload или raw body; DI/idempotency/handler не вызываются.
      - [ ] **E3-07 — idempotency/error semantics.** Сохранить body/header mismatch `400`, semantic hash на
            passthrough object, cached `202`, uncached `503` retry, `409` mismatch, handler permanent `422` и
            unknown-event behavior.
      - [ ] **E3-08 — tenant/auth/correlation protection.** Сохранить special principal для
            `support.delivery.attempt.logged` до idempotency/handler; не менять signature secret, timestamp policy,
            correlation/idempotency logging и tenant model остальных событий.
      - [ ] **E3-09 — retry/DLQ proof.** Invalid producer event не вызывает network; immediate fanout сохраняет
            существующий наблюдаемый fallback, а worker переводит permanent `422` в DLQ без retry burn. Не менять
            retry classes без отдельного owner scope.
      - [ ] **E3-10 — JSON retirement/docs.** Обновить обе текущие docs-ссылки и module comment, затем удалить только
            `contracts/integrator-events-body.json`; остальные три `contracts/*.json` protected. Exact current refs
            в runtime/current contract docs после удаления = `0` (owning plan/LOG и archived history не считаются
            live consumers и не переписываются).
      - [ ] **E3-11 — validation/load.** Shared schema valid/invalid/adversarial tests; producer/receiver order и
            redaction tests; targeted integrator/webapp tests, package test/typecheck/build, app typecheck/lint/build.
            Unit package suite постоянно включён в root `pnpm test`, а значит и в existing root `pnpm run ci` без
            workflow edit; fresh-clone/frozen-lock/no-dist proof обязателен. Три identical baseline→after runs на
            exact builder-backed `4 096 B` representative и `57 671 679 B` repository-target-max JSON: в каждом
            fixture/run `p95_after ≤ p95_baseline × 1.05`, записаны обе стороны p50/p95/p99/throughput, RSS ограничен
            `max(baseline×1.05, baseline+8 MiB)` и не растёт монотонно по пяти post-GC samples, blocking DB/network
            counters = `0/0`. PASS покрывает repository target, но не заменяет owner-authorized effective PROD
            `nginx -T` fact/check; active PROD limit остаётся отдельным acceptance gate.
      - [ ] **E3-12 — high-risk acceptance.** Worker отдаёт матрицу по `E3-01…E3-11`. Независимый auditor проверяет
            тот же полный набор. При `FAIL` — один integrated correction + fresh re-audit; второй correction только
            после классификации полноценного провала; после двух correction rounds жёсткий stop и owner question.
            Самоаудит и общий `PASS` недействительны.

      **Exact writable implementation manifest:**
      - new `packages/integrator-webapp-event-contract/package.json`,
        `packages/integrator-webapp-event-contract/tsconfig.json`,
        `packages/integrator-webapp-event-contract/src/index.ts`,
        `packages/integrator-webapp-event-contract/src/integratorWebappEvent.ts`,
        `packages/integrator-webapp-event-contract/src/integratorWebappEvent.test.ts`;
      - package/build graph: `pnpm-workspace.yaml`, `pnpm-lock.yaml`, root `package.json`,
        `scripts/ensure-booking-sync-built.sh`, `apps/integrator/package.json`, `apps/webapp/package.json`;
      - producer: `apps/integrator/src/kernel/contracts/ports.ts`,
        `apps/integrator/src/infra/adapters/jsonStableStringify.ts`,
        `apps/integrator/src/infra/adapters/jsonStableStringify.test.ts`,
        `apps/integrator/src/infra/adapters/webappEventsClient.ts`,
        `apps/integrator/src/infra/adapters/webappEventsClient.test.ts`,
        `apps/integrator/src/infra/db/repos/projectionFanout.test.ts`;
      - receiver: `apps/webapp/src/app/api/integrator/events/route.ts`,
        `apps/webapp/src/app/api/integrator/events/route.test.ts`,
        `apps/webapp/src/modules/integrator/events.ts`;
      - docs/artifact: `apps/webapp/INTEGRATOR_CONTRACT.md`,
        `apps/webapp/src/modules/integrator/integrator.md`, delete `contracts/integrator-events-body.json`;
      - load proof: new `scripts/prove-integrator-webapp-event-contract-load.mjs` и соответствующая root script entry.
        Root `package.json#scripts.test` также входит в этот manifest: package unit suite запускается перед current
        integrator suite, а существующий root `ci` наследует её через `pnpm test`; `.github/workflows/**` не меняется.

      Dedicated package — минимальный существующий workspace pattern: оба приложения уже потребляют `packages/*`;
      direct cross-app import нарушит границы и integrator `rootDir`, а `operator-db-schema`/`error-tracking`
      семантически чужие. Поэтому package/workspace/lock/build changes являются dependency E3, а не scope expansion.
      Канонический Stability plan/LOG/taskdb обновляет оркестратор при integration/closure, не implementation worker.

      **Protected scope:** `apps/integrator/src/kernel/contracts/schemas.ts`, EventGateway и channel `IncomingEvent`;
      event-specific payload handlers/projection domain services; writePort producer payloads и content scripts;
      DB schema/migrations/outbox data; signature implementation/secrets, idempotency algorithms и общий principal
      model; C1/D1/D2/E1/E2 manifests; остальные `contracts/*.json`; env/deploy/TEST/PROD/data actions. Обязательная
      wire version, closed enum/discriminated union всех payloads или общий `organizationId` для остальных событий —
      только отдельный owner question, не автоматический E3 scope.

### Phase 3 — Большой cutover (длинный полюс, высший риск, приёмка владельца по кускам)

- [ ] **A4. Довести класс #821/#815** (объём per F-1): «нет принципала → fail-closed», ретайр несущих ручных
      `org_id … OR IS NULL`-фильтров (~87 файлов) по мере покрытия A1/A2. Свести отдельные пулы (migrator/media-worker/
      integrator) к принципал-aware доступу или явно задокументировать их как infra-исключения.
      Размер: **XL** (10-20+ dd, высокий риск) · Аудит: **полный адверсарный, по каждому куску** · Приёмка: поэтапная.
      **Load-заметка (честно):** RLS-энфорсмент — единственный слой с ПРИСУЩЕЙ per-request ценой (`SET ROLE` +
      `install_signed_context` на каждый checkout пула), и A4 делает её универсальной. Это дешёвые GUC/функц-вызовы,
      амортизируются пулом, но не ноль. Обязательно: **бенчмарк p95 на тесте под нагрузкой ДО раскатки** (locked-режим
      уже на dev — есть с чем сравнить), и оптимизация checkout (кэш подготовленного контекста на коннекте, чтобы
      не переустанавливать роль без смены принципала). Если замер покажет заметный рост — это owner-gate, не молчком.
- [ ] **A2. Матрица cross-tenant регрессий** (тир per F-5): через настоящие route-handlers под живым RLS
      (не in-memory), по одному тесту на чувствительную таблицу. Размер: **L** · Аудит: полный.
- [ ] **E1. Расширить eslint-границу** на `page.tsx`/RSC + остальной `infra` (payments/webhooks/integrations) +
      запрет прямого `drizzle-orm` в роутах; выжечь legacy-allowlist (~24 файла) по мере рефактора сервисов на порты.
      Файлы: `apps/webapp/eslint.config.mjs`. Размер: **L** (ongoing) · Аудит: один на волну.

### Phase 4 — Дальнейшее (по ёмкости, не блокирует)

- [ ] **C3. Метрики** (per F-4): latency, насыщение пула БД, глубина очереди → экспорт/скрейп.
      **Load-дизайн (обязателен):** только **pull-модель** (Prometheus скрейпит `/metrics` раз в 15-30с) —
      в hot-path лишь инкремент атомарного счётчика в памяти (наносекунды), никакой сети на запрос.
      Переиспользуем уже существующие in-process счётчики (`webappPoolProvider`: missingPrincipalSelections,
      poolRoleMismatches) — не добавляем новую инструментацию на горячий путь. **Метки только низкой кардинальности**
      (route-class, status, provider) — НИКОГДА orgId/userId (иначе взрыв кардинальности → рост RSS и медленный скрейп).
      Гистограммы latency — с ограниченными бакетами, не на каждый вызов. Итог: метрики — самый ДЕШЁВЫЙ слой
      наблюдаемости при таком дизайне; «нагрузка» возникает только от плохой кардинальности, которую тут запрещаем.
- [ ] **F2. Разбор UI god-компонентов** (2000-2500 строк: TreatmentProgram\*, ScheduleCalendarTab, PatientTabKarta).
- [ ] **F3. Де-фрагментация модулей** (нотификации по ≥6 модулям, booking по 4 слоям) — консолидация владения.

---

## Карта параллелизации

- **Phase 0**: A0 сначала делает полную ephemeral DB воспроизводимой без PII; затем A1 доказывает current conformance.
  Только после этого
  подтверждённые residual C2/F1/D3 могут идти параллельно друг другу. Старая схема «запустить всё рядом с A1» не
  применяется, потому что могла дублировать уже закрытый Foundation scope.
- **Phase 1**: A3, B1, B2, B3, C1 — независимые file-scope → до 3 воркеров одновременно, каждый в своём worktree.
- **Phase 2**: D1, D2, E2, E3 — независимы от Phase 1 и друг от друга → параллельно.
- **Phase 3**: A4 — длинный полюс, гонится своим темпом с приёмкой по кускам; A2 и E1 цепляются к прогрессу A4.
- Сериализуется только конкуренция за общий ресурс (heavy CI под mutex, живой dev-сервер под скрин).

## Приёмка в середине

После Phase 1 — только при отдельном прямом разрешении владельца выкатить накопленное на ТЕСТ (code-only) и
передать владельцу на click-through до старта Phase 3. Без такого разрешения фиксируется готовый DEV/evidence packet,
а TEST deploy остаётся pending owner gate. Не полировать A4, пока Phase 0-1 не приняты живьём либо владелец явно не
перенёс этот checkpoint.

## Оценка объёма (честно)

- **Risk-closing спина (Phase 0 + Phase 1)**: ~**2.5–4 недели** сфокусированной работы с параллелью.
  Даёт ~80% снижения риска: инвариант изоляции становится проверяемым в CI и детектируемым в проде,
  деньги — атомарны, внешние вызовы — с таймаутами, ошибки — видимы.
- **+ Phase 2** (безопасность+контракты): ещё ~**2–3 недели**, хорошо параллелится.
- **+ Phase 3** (полный RLS-cutover A4 + матрица + границы): **длинный полюс, ~4–8 недель**, доминирует риском и объёмом.
- **Итого «максимально bulletproof»**: программа масштаба **~1 квартала** сфокусированного темпа,
  НО тиированная: критичное закрывается в первые ~1 мес, остальное — управляемый долг с приёмкой по кускам.

Короткий ответ на «большой ли объём»: **да, полная программа — квартал**, но она не монолит —
львиная доля риска снимается фундаментом Phase 0-1 за ~месяц, а самый тяжёлый и рискованный кусок (A4)
изолирован в конце и гонится отдельным темпом под адверсарным аудитом.
