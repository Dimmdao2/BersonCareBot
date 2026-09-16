# Acceptance ST-03 — E1 diagnostics

> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md

## Код и данные

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [x] Code/scratch — typed/redacted model покрывает missing principal, invalid signature/install, role/pool mismatch, RLS denial,
      cleanup failure и unclassified background operation.
- [x] Code/scratch — reporter failure не ломает основной запрос и не пишет через poisoned/scoped connection.
- [x] Code/scratch — storage true-global/INFRA; retention и aggregation bounded; unknown event class fail-closed.
- [x] Code/tests — shared API type/read service используются UI и report gate; admin guards единообразны.
- [x] Scratch/tests — fault injection даёт exact +1 отдельно для каждого из шести классов; redaction tests отвергают unsafe values/keys.
- [x] Code/tests — API/UI показывают trend последних 24 часов против предыдущих 24 часов и bounded 7-day series.
- [x] Code/scratch — reversible TEST-only scenario создаёт достижимые okay/zero, incomplete/warning и critical/unexplained states
      и после проверки возвращает diagnostics fixture в чистое состояние.
- [x] Deep audits, correction rounds and final independent code/scratch re-audit PASS.
- [ ] Live TEST — operator provisioned/rotated; scenarios and Global Admin/negative-role/visual behavior proven.

### Correction evidence after independent re-audit

- Privilege path: `0185` + `deploy/postgres/saas-isolation-telemetry.sql`; NOLOGIN/NOBYPASSRLS owner and operator
  group, direct table access revoked. Ambient app/bootstrap/API roles receive only the minimal closed event writer.
  Diagnostics read and coverage/resolve require a distinct LOGIN/INHERIT, NOSUPERUSER/NOBYPASSRLS operator
  credential from `SAAS_ISOLATION_OPERATOR_DATABASE_URL`; it cannot inherit app roles or write events.
- Executable scratch proof covers the effective role matrix, one initial write plus four concurrent exact increments,
  exact UUID retry idempotency, conflicting same-UUID payload rejection, and rejection of a non-isolation business
  failure before it reaches the telemetry writer.
- Runtime path: bounded queues (64 webapp / 32 background), one outstanding DB write per process, 200 ms
  query/statement timeout inside a 250 ms total timeout, and a 30 s circuit. Dedicated pools never reuse the failing
  request/job client. Every `new Pool` now lives in the app's named provider inventory: a dedicated webapp telemetry
  provider plus the existing integrator/media provider files. Reporter/singleton consumers construct no pools.
  Native hooks exist for webapp, integrator, worker, scheduler, media-worker and cron.
- Background and cron hooks emit only recognized principal/permission/RLS/cleanup failures. Unknown business
  failures are ignored instead of becoming `unclassified_background_operation`; cron reports only a recognized
  rejection caught from the operator-status DB write port, never `success=false` or the business-result error, and
  all persisted route/job-family keys come from a closed normalized inventory.
- Every direct membership edge into `saas_telemetry_operator` is enumerated and revoked except the discovered
  operator. This removes nested effective paths; the overlay then asserts that the operator is the sole
  non-superuser MEMBER/USAGE role. `app_owner` is explicitly denied read/coverage functions alongside ambient roles.
  Scratch proof seeds a stale LOGIN member and verifies both membership removal and read denial.
- Read path rejects every non-allowlisted DB service/operation/class/status before API/UI; complete E2 coverage
  requires all six process families and at least six checks. Coverage insert+scoped resolution is one DB function.
- UI/API: global admin + admin mode on both page and API; distinct critical/incomplete/stale/okay reasons; all six
  class totals, service/class/lifecycle/explanation filters, expandable detail and redacted Copy-for-AI payload.
- Targeted final evidence: 10 Vitest files / 88 tests PASS; webapp/integrator/media-worker/db-principal typechecks PASS;
  targeted ESLint PASS; full `check:saas-db-regression`, isolation/C2/strict/hard checkers PASS; PostgreSQL rehearsal
  PASS. The final schema inventory has 232 exact tier rows / TELEMETRY=5, including diagnostics storage; the broad
  P0.5b app_staff generator explicitly excludes them because their dedicated privilege overlay owns access.
- Independent deep re-audit PASS for the current code/scratch stage, including trend/state correction, is recorded
  in `ST-03-final-PASS.md`. Live TEST and visual acceptance remain pending.

### Trend/state-fixture correction evidence

- Schema/API version 3 stores redacted events in bounded hourly buckets (eight-day retention), reads two distinct
  24-hour bucket windows and an ordered seven-day UTC series through the operator-only SECURITY DEFINER API, and
  validates the closed shape before it reaches System Health.
- `scenario --state okay|incomplete|critical|clean` is operator-only and fail-closed on every database except exact
  `bersoncarebot_test`. It deletes/inserts only reserved `test-fixture:v3:*` rows and three reserved coverage UUIDs;
  `clean` never deletes or resolves genuine diagnostics. Genuine active failures therefore cannot be masked by the
  `okay` fixture.
- Executable scratch rehearsal proves exact `+1` storage for all six classes independently, concurrent accumulation,
  24-hour/seven-day totals, redaction/false-positive rules and non-TEST scenario denial. App tests separately inject
  representative failures for all six classifiers and prove only the four closed aggregate fields reach persistence.
- Integration contract: provision a dedicated random-secret TEST LOGIN referenced only by protected
  `SAAS_ISOLATION_OPERATOR_DATABASE_URL`; it must be LOGIN/INHERIT, NOSUPERUSER/NOBYPASSRLS, not inherit any app
  role, and receive only `saas_telemetry_operator`. Rotation changes the protected login credential and env value,
  reruns the idempotent telemetry overlay, then proves ambient write-only/operator read+coverage+scenario-only
  effective privileges without printing the URL. This is authorized work, not an owner blocker.
- The integration owner has now wired provisioning/rotation and normal/injected/final-clean scenarios into the
  canonical closure; code-stage evidence is in `ST-04-integration-PASS.md`. Still required: execute that closure on
  TEST, assert no reserved rows remain, and complete visual acceptance.

### Trend/state correction after bounded audit FAIL

- `read_saas_isolation_trend()` now derives one statement `as_of` anchor, returns it with the result, excludes every
  bucket after its current UTC hour from both rolling and daily windows, and emits exactly the seven UTC dates ending
  on the anchor date. Shared validation derives its expected dates from returned `asOf`, not the webapp clock, so a
  midnight boundary cannot reject a correct database result.
- Disposable PostgreSQL proof inserts distinct previous-window, current-window and future buckets, then proves
  previous24/current24 totals, future exclusion, the seven exact UTC date labels and daily total in one anchored read.
- `diagnostics:saas-isolation:test-scenarios` is the executable exact-TEST/operator wrapper. It verifies
  `okay → incomplete → critical`, and its module-level `finally` always calls `clean` and checks reserved event/hourly/
  coverage counts are all zero. The injected-failure mode stops after `incomplete` and must still return clean.
- Static checkers and mutation self-test pin the future upper bound and `finally`; unit tests prove success cleanup,
  injected-failure cleanup and fail-closed detection of a leftover reserved row.
- Live TEST execution and visual acceptance remain ST-04 work; no live database was touched by this correction.

## Визуальный сценарий

- Preliminary DEV URL: `http://127.0.0.1:5200/app/doctor/system-health`, ordinary login of a registered
  owner admin account (`AGENTS.md` §1a) + admin mode.
- Final TEST URL: `https://test.bersoncare.ru/app/doctor/system-health`, protected global-admin login + admin mode;
  doctor и clinic-admin получают отказ на страницу/API.
- Seed: deterministic safe diagnostic aggregates for zero, warning/incomplete и critical/unexplained states.
- Проверить отдельно: общую карточку, last-run coverage, каждый из шести классов, filters/drill-down,
  24h delta + 7-day trend, explained/unexplained × active/resolved, Copy-for-AI redaction,
  refresh/deep-link, desktop/mobile.
- Если отдельный detail route не вошёл в MVP, явно отметить code-only/follow-up; не имитировать несуществующий экран.
