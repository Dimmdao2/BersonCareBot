> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

# Rubitime retirement — execution plan

Статус: R1-R4 имели code/proof status `closed` в working branch 2026-07-14, но live owner reproduction на TEST
2026-07-18 обнаружил regression: создание пациента прошло, appointment упал с `Rubitime sync failed`. Поэтому
R3/R4 runtime acceptance **переоткрыт как incident taskdb `#839` / roadmap C0** до доказательства create/reschedule/
cancel без Rubitime и без partial patient write. Старые `[x]` ниже остаются provenance выполненных проходов, но не
являются текущим PASS пользовательского пути. R5-R7 продолжаются только как TEST-доказательства, удаление
runtime-зависимости и TEST archive/drop proof; destructive cleanup не опережает R1 gates.
Это план удаления Rubitime как runtime-зависимости. Код, миграции, БД и runtime-настройки меняются только
отдельными phase-коммитами с proof-документами ниже.

Provenance correction 2026-07-22 (`#981`): `RR-PROOF-05` remains valid for the narrow table-read cutover, but the
R3-CATALOG `branchServiceId` compatibility deadline `2026-07-21` expired while the input remains live, so final
R3-CATALOG closure is reopened. R6 route/code removal exists in the repository, but it was applied before the
mandatory cutoff/drain prerequisites; its rows below are now open with `PROVENANCE-only` evidence until
`RR-PROOF-09` exists. This correction does not restore routes, authorize deployment/cutoff, or erase implementation
history. Full row-level mapping: `RUBITIME_RETIREMENT_R5_R7_PROVENANCE_RECONCILIATION.md`.

**Точная taskdb-привязка после сверки 29.07:** этот файл — канонический execution plan самостоятельной
workstream-карточки `#981` «Rubitime R5-R7: provenance/cutoff integrity reconciliation». Перед следующим
Rubitime action требуется read-only reconciliation просроченного R3-CATALOG removal deadline и живой
`branchServiceId` compatibility; R6 route/connector/code removal остаётся provenance-only, пока cutoff/drain/
rollback rows открыты и нет `RR-PROOF-09`; R5-R7 taskdb mapping/provenance должен быть восстановлен через exact
atomic `row → code/test/runtime/owner-gate` matrix с классификацией restoration/defer/correction/owner decision.
Границы карточки: без code/routes/DB/data/host/TEST/PROD/deploy/cutoff/archive/drop.

`#987` сюда **не сворачивается**. Это отдельный Track D workstream прямых integrator → `public` writes и удаления
legacy HTTP projection transport; его канон —
[`UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`](../../../_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md)
§Track D, а approach decision — [`TRACK_D1_APPROACH_DECISION_2026-07-24.md`](../../../_TODO/SAAS_FOUNDATION/TRACK_D1_APPROACH_DECISION_2026-07-24.md).

**Старт для агентов:** сначала читать `docs/archive/2026-07-rubitime-retirement/RUBITIME_R1_FRESH_PROD_DUMP_AGENT_README.md`. Там
сведены правила старта, server conventions, orchestration, порядок свежего дампа, owner doctor/admin data-fix,
placeholder bookings Дмитрия Берсона, specialist consolidation, R1 aggregate audits и порядок R2-R7 gates. Этот
execution plan не заменяет runbook.

Sol audit `bcb-rubitime-retirement-plan-sol-audit-2026-07-14` вернул исходному черновику `BLOCKED`. Этот документ обновлён с учётом обязательных P0/P1 правок: dual-source history, provider-neutral lifecycle, tenant-safe public booking, table-by-table catalog disposition, cutoff/drain и запрет удаления живых canonical maps.

Clean-dump rehearsal `R1-CLEAN-DUMP-REHEARSAL-sol-2026-07-14` вернул `FAIL` только для старого локального dump: он не проходил текущую migration chain и не имел точного cutoff CSV. Этот fail superseded более поздним `R1-CLEAN-DUMP-REHEARSAL-codex-2026-07-14-fresh-0415`: свежий current prod dump прошел approved sequence по `docs/archive/2026-07-rubitime-retirement/RUBITIME_R1_FRESH_PROD_DUMP_AGENT_README.md` с pre-migration owner doctor/admin data-fix, `scripts/deploy-saas-667.sh`, placeholder cleanup, specialist consolidation, exact cutoff CSV и aggregate preflight/audits. Детали: `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_CLEAN_DUMP_REHEARSAL.md`.

**Current canon:** fresh Rubitime CSV decides record preservation. `integrator.rubitime_records` is audit-only when
the CSV exists. Integrator-only rows absent from the fresh CSV must not be imported/resurrected and must not block
R1/R2. Counts like `legacy-only=290/312` are archive deltas between `appointment_records` and
`integrator.rubitime_records`, not a list of dirty visible records. The owner-approved export is one-specialist
context (`89643805480` / tail `9643805480`) matched through existing city/branch mappings; do not invent an
integrator-led second reconciliation path. Extra rows present only in `integrator.rubitime_records` do not expand the
preservation set and are not a reason to run a new backfill.
If the fresh CSV exists, integrator-led reconciliation is forbidden: integrator raw state may explain archive deltas,
but it cannot add preservation requirements, create a new backfill backlog, or block R1/R2/R6/R7 for rows absent from
the CSV.

## 1. Verdict

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Rubitime должен быть полностью удалён из целевой SaaS-архитектуры. Это можно сделать быстрее, чем полный Tenant Hard Mode, но нельзя делать через blind drop таблиц: сначала нужно перенести историю записей в canonical, убрать runtime-переключатели на Rubitime/legacy, перевести downstream-процессы на canonical events и только затем удалять integrator Rubitime code/tables.

Минимальный безопасный путь:

1. Fresh Rubitime CSV сверена с `appointment_records` и canonical mappings; все CSV-present записи перенесены/смэпплены в `be_appointments`, а `integrator.rubitime_records` используется только как audit signal. Integrator-only строки, отсутствующие в CSV, не являются import/drop blockers.
   Integrator-led reconciliation is forbidden when the fresh CSV exists: raw integrator state cannot expand the
   preservation set or create a new backfill backlog.
2. `booking_doctor_appointments_read_source` permanently `canonical`.
3. `booking_slots_read_source` permanently `canonical`.
4. Google Calendar, reminders, notifications, payment/package lifecycle и booking events больше не читают raw Rubitime webhook/records.
5. Legacy v1 profile resolve выключен.
6. Rubitime routes/workers/webhook/code удалены или переведены в недоступный retirement stub.
7. Legacy Rubitime tables archived/dropped after proof; provider-neutral canonical maps остаются live.

## 2. Why this is prerequisite for hard mode

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Archived `TENANT_HARD_MODE_EXECUTION_PLAN.md` recorded that full enforce would otherwise keep hitting Rubitime quarantine:

- `integrator.rubitime_records`, `integrator.rubitime_events`, `public.appointment_records` исторически unscoped/legacy.
- Rubitime inbound сейчас использует default-org compatibility, а не полноценный multi-org contract.
- `booking_doctor_appointments_read_source=rubitime_legacy` и `booking_slots_read_source=rubitime` оставляют doctor/client reads/writes вне canonical org-owned модели.

После retirement эти исключения исчезают: booking становится обычным `SCOPED` domain через `be_*` таблицы и tenant hard mode можно включать без Rubitime-specific carve-outs.

## 3. Current source facts

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Основано на:

- `docs/archive/2026-07-rubitime-retirement/BOOKING_CANONICAL_CUTOVER.md`
- `docs/archive/2026-07-rubitime-retirement/APPOINTMENTS_PARITY_S0.md`
- `docs/_TODO/SAAS_FOUNDATION/T0_4_PRE_SCHEMA_CLEANUP_INVENTORY.md`
- `docs/_TODO/SAAS_FOUNDATION/T0_4_PRE_SCHEMA_CLEANUP_ADR.md`
- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/T0_4_RUBITIME_APPOINTMENT_ORG_AUDIT.md`
- `docs/archive/2026-07-rubitime-retirement/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md`
- `docs/_TODO/SAAS_FOUNDATION/scope-derivation/t0-4-pre-table-matrix.tsv`

Current known facts:

- `be_appointments` is canonical booking data.
- `appointment_records` is deprecated but live until doctor read-source cutover.
- Existing script `apps/webapp/scripts/backfill-canonical-from-legacy-appointments.ts` imports Rubitime history from `appointment_records` into `be_appointments`. Fresh Rubitime export CSV is the owner-approved canon for what must exist: records present in the export are needed; records absent from the export are not needed. `integrator.rubitime_records` is audit-only when the fresh export exists and must not override the export.
- `integrator.rubitime_records/events` are legacy raw provider/projection tables that may remain until R6/R7 for drain/archive proof, but they are not the preservation canon when a fresh Rubitime CSV exists.
- `integrator.rubitime_booking_profiles/branches/services/cooperators` are deprecated v1 profile catalog and can be frozen before full Rubitime deletion.
- Google Calendar currently has Rubitime raw webhook path and a canonical booking-event path under a Rubitime-named route.
- Reminders, notifications, payment/package lifecycle and booking lifecycle may still depend on integrator/Rubitime projection/route naming and must be proven provider-neutral canonical-only before deletion.
- Some canonical/public booking code still uses default-org fallback and public `booking_*` catalog tables; these are not removable Rubitime tables until separate tenant/catalog cutovers finish.

## 4. Target state

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### 4.1. Booking runtime

- Doctor appointments, KPI, list, calendar: canonical `be_appointments`.
- Patient/public slots: canonical scheduling only.
- Patient/public create: canonical booking engine only.
- Staff/admin create/reschedule/cancel/delete: canonical lifecycle only.
- Booking events, notifications, GCal, payments/package side effects and reminders: emitted from provider-neutral canonical lifecycle, not Rubitime projection or a Rubitime-named endpoint.
- No runtime `Rubitime-first` or `Rubitime-best-effort` behavior remains.

### 4.2. Integrator

- No Rubitime webhook route mounted.
- No Rubitime M2M slots/create/update/remove routes mounted.
- Canonical booking lifecycle endpoint exists outside `integrations/rubitime` and is called by webapp through a provider-neutral URL.
- No `rubitime_api_throttle`, raw `rubitime_records/events`, or v1 profile catalog consumers. (`rubitime_create_retry_jobs`
  was renamed to `message_retry_jobs` 2026-07-24 -- generic message-delivery infra, not a Rubitime retirement target.)
- Google Calendar receives canonical lifecycle commands/events.
- Reminder scheduler receives canonical booking lifecycle events.

### 4.3. Settings

These keys are removed from runtime decision-making only after their consumers are migrated:

- `booking_doctor_appointments_read_source`
- `booking_slots_read_source`
- `booking_rubitime_bridge_enabled`
- `booking_default_organization_id` after public/patient booking derives exact tenant from trusted host/link/resource context

Final code should not keep a UI choice between Rubitime and canonical. Migrations may leave retired settings rows temporarily for rollback/audit, but active code must not branch on them. `booking_default_organization_id` must not be removed until all canonical booking consumers stop using it as default tenant fallback.

### 4.4. Tables

Final drop/archive candidates after proof:

- `public.appointment_records`
- `integrator.rubitime_records`
- `integrator.rubitime_events`
- `integrator.rubitime_api_throttle`
- `integrator.rubitime_booking_profiles`
- `integrator.rubitime_branches`
- `integrator.rubitime_services`
- `integrator.rubitime_cooperators`
- public same-name Rubitime homonym tables if metadata inventory proves they are not runtime-owned

`integrator.rubitime_create_retry_jobs` is not in this list: it was already repurposed generic message-delivery
infra, not Rubitime raw provider history, and was renamed to `integrator.message_retry_jobs` 2026-07-24 rather than
scheduled for archive/drop.

Not drop candidates during Rubitime retirement unless a separate migration proves replacement:

- `integrator.booking_calendar_map`: migrate/rename to provider-neutral canonical calendar map if GCal remains active; do not drop while GCal updates/deletes use it.
- `public.patient_bookings`: compatibility/business table, not Rubitime-owned.
- `be_external_entity_mappings`: keep table; Rubitime rows can be retired later only after all mapping/history needs are resolved.
- public `booking_cities`, `booking_branches`, `booking_branch_services`, `booking_services`, `booking_specialists`: currently live patient catalog and must move table-by-table to `be_*` before any drop.

Drop must be migration-backed and preceded by archive/export decision. No ad hoc SQL drop.

## 5. Owner decisions

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Resolved or explicit engineering inputs:

1. **History source — confirmed by owner 2026-07-15.** Fresh Rubitime export is the R1 canon. The export is the one-specialist owner context (`89643805480` / tail `9643805480`) and is matched through existing city/branch mappings. `public.appointment_records` plus canonical mappings are checked against the export; `integrator.rubitime_records` is audit-only and non-authoritative when the fresh export exists. Acceptance: every CSV-present record is in application history; extra cancelled rows are allowed; missing real records block completion.
2. **Archive window.** Decide whether legacy Rubitime raw tables are archived to SQL/CSV before drop, and how long archives are retained.
3. **Google Calendar ownership.** Confirm provider-neutral canonical lifecycle becomes the only source of GCal writes and `booking_calendar_map` is migrated/kept as canonical infrastructure.
4. **Downstream ownership.** Confirm canonical booking lifecycle becomes the only source for booking reminders, patient/staff notifications, Web Push, payment capture, package link/unlink and booking delete side effects.
5. **Archive horizon.** Required only for a TEST archive/drop proof; record the retention choice in the proof.
6. **Timing.** Engineering sequencing on TEST; no external-environment timing decision is requested.
7. **Catalog model.** Confirm public booking catalog moves from legacy `booking_*` to `be_*` before dropping any public booking catalog table.

## 6. Execution phases

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

> **Supersession boundary, 2026-07-15.** Any fragment below that describes an action outside TEST is historical
> evidence only and is not executable. The binding work for R5-R7 is the TEST checklist in
> `RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_RUNBOOK.md`,
> `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_RUNBOOK.md`, and
> `RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md`. Fresh CSV preservation remains mandatory.

### Phase R0 — freeze new Rubitime dependency

Goal: stop increasing the Rubitime surface while current flows still run.

Work:

- Add a code-review/static guard: no new imports from `apps/integrator/src/integrations/rubitime/**` outside retirement/deletion work.
- Mark Rubitime settings UI as deprecated/internal-only.
- Block new routes/features from choosing `rubitime` or `rubitime_legacy`.
- Record current code inventory and route map.

Acceptance:

- Static search report lists all remaining Rubitime references.
- New code cannot introduce new Rubitime read-source branching without failing a check.
- No runtime behavior changed yet.

Suggested checks:

```bash
node /home/dev/brain/tools/code-search.mjs "rubitime" --repo bcb -k 100
rg -n "booking_doctor_appointments_read_source|booking_slots_read_source|booking_rubitime_bridge_enabled|rubitime_legacy|booking_slots_read_source=rubitime|RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED" apps docs
```

### Phase R1 — dual-source history reconciliation and canonical backfill

Goal: preserve appointment history in canonical before any Rubitime removal, using the fresh Rubitime CSV export as canon and checking `public.appointment_records`/canonical mappings against it. `integrator.rubitime_records` is audit-only when the fresh export exists.

Step 1: run dual-source audit before any commit.

Required comparisons:

- `appointment_records.integrator_record_id` vs `integrator.rubitime_records.rubitime_record_id` / equivalent external id, only as diagnostic input for CSV reconciliation.
- live appointment count and max `record_at` in both sources.
- raw-only records not present in `appointment_records` as audit evidence only; if they are absent from the fresh Rubitime CSV, they are not canonical import targets.
- legacy-only records not present in raw, only as diagnostic/archive classification when CSV coverage is closed.
- status/freshness mismatches for the same external id.
- canonical mapping coverage in `be_external_entity_mappings`.

If raw-only rows exist, first compare them to the fresh Rubitime CSV. Import only CSV-present records that are missing from canonical; do not import integrator-only rows that are absent from the owner-approved export.

Step 2: use the existing script for `appointment_records` history:

```bash
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments
```

After owner review of dry-run:

```bash
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --commit --delete-test --collapse-dups --drop-stale-from-csv
```

If owner-confirmed stale ext-ids are needed:

```bash
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments -- \
  --commit --delete-test --collapse-dups --drop-stale-from-csv \
  --drop-legacy=<comma-separated-ext-ids>
```

Rules:

- Always run dry-run first.
- On TEST, use only the approved TEST configuration.
- Use a fresh Rubitime CSV if `--drop-stale-from-csv` is used.
- Do not use ad hoc SQL for import or cleanup.
- Do not delete `admin_manual` conflicts via this script; use the proper UI/flow.
- Do not enter R2 until the CSV-present missing delta is zero or explicitly imported/waived in the execution log. Raw-vs-legacy deltas absent from the fresh CSV are audit-only and do not block R2.
- Do not enter R2 until a current-schema clean-copy rehearsal passes. The rehearsal copy must pass:

```bash
DATABASE_URL='<loopback-rehearsal-url>' \
node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-clean-dump-preflight.mjs \
  --csv=<fresh-rubitime-csv>
```

- Full replay is not self-contained on arbitrary clean DBs. If replay cannot be proven on a fully seeded current dump, use the transfer-final-state contract from `RUBITIME_RETIREMENT_R1_CLEAN_DUMP_REHEARSAL.md`: transfer `appointment_records.deleted_at`, `be_appointments` rows with `source='rubitime_projection'`, Rubitime appointment mappings, and related canonical event/history rows through a secured transactional bundle with FK/tenant/deletion invariants.

Acceptance:

- CSV-present missing delta = 0, or imported/waived by owner with ids and reason.
- CSV-present live legacy rows are mapped to canonical or owner-waived; `unmapped_real_active = 0`.
- `appointment_records` vs `integrator.rubitime_records` deltas such as `legacy-only` are source-archive diagnostics only. They are not R1/R2 blockers when the rows are absent from the fresh CSV and live rows are already canonical-mapped or soft-deleted.
- Integrator-only rows absent from the fresh CSV are audit-only and must not be imported/resurrected into canonical.
- `DUPLICATE clusters = 0`.
- `STALE vs Rubitime CSV = 0`.
- `CONFLICTS = 0` or owner-approved list is explicitly documented.
- clean-copy rehearsal passes on a fresh current unified dump with the exact cutoff CSV, or owner records an explicit transfer-final-state exception/runbook before R2.
- Doctor calendar/list/KPI still show expected records.

### Phase R1-HISTORY-CONTRACT — state history vs raw provider archive

Goal: avoid confusing two different kinds of "history" before dropping Rubitime raw state.

Canonical appointment state history:

- Product-visible current appointment state lives in `be_appointments`.
- Product-visible lifecycle/history must live in canonical booking history/event tables, not in Rubitime raw payloads.
- Imported historical appointments must have enough canonical traceability for doctor UI, analytics, packages/memberships, audit and future hard-mode reads.
- If a legacy Rubitime row cannot reconstruct full lifecycle, create a canonical baseline/import event and keep raw provider archive for trace-only review.

Raw provider event archive:

- `integrator.rubitime_events` is provider raw audit/replay material, not product state history.
- Raw payloads may contain patient context and must have restricted access, retention and export location approved by owner.
- Raw archive is not queried by doctor/client runtime after retirement.
- Raw archive is not a bypass around Tenant Hard Mode.

Required work:

1. Define the canonical event/history table set used to represent imported appointment lifecycle.
2. For each imported appointment, write or verify a durable canonical baseline/import event.
3. Preserve cancellation/reschedule/status semantics where the legacy projection has enough data.
4. For unreconstructable provider-only details, archive raw events and record the limitation.
5. Add a read-only proof that doctor UI, patient history, memberships/packages and analytics no longer need raw provider events.

Acceptance:

- Every imported Rubitime appointment has canonical current state and at least one canonical import/history event.
- Canceled/rescheduled/imported states are visible from canonical state/history, not from `rubitime_events`.
- Raw provider archive exists only for audit/trace and is not runtime-read.
- Destructive drop of raw provider tables is blocked until archive/export and access policy are approved.

### Phase R2 — doctor read-source canonical-only

Goal: remove doctor-facing dependency on `appointment_records`.

Work:

1. Set `booking_doctor_appointments_read_source=canonical` through the Settings service/UI, not direct SQL.
2. Verify doctor list, Today, KPI, schedule, analytics surfaces.
3. Replace runtime branching with canonical-only code.
4. Remove `rubitime_legacy` option from UI/API validation after a release window.
5. Convert tests that expected legacy switch to canonical-only behavior.

Important code areas:

- `apps/webapp/src/infra/repos/doctorAppointmentsReadSwitch.ts`
- `apps/webapp/src/app-layer/di/buildAppDeps.ts`
- doctor appointments/KPI/calendar routes and components
- admin booking overview/settings UI
- tests around `doctorAppointmentsReadSwitch`

Acceptance:

- No doctor UI reads `appointment_records` for active appointment surfaces.
- All non-switch consumers of `appointment_records` are inventoried and migrated before table drop, including client history, memberships and analytics.
- Setting `booking_doctor_appointments_read_source` no longer changes runtime behavior.
- Backward rollback plan is explicit: either revert code or temporarily keep old branch behind a short-lived branch-only rollback.

### Phase R3 — patient/public slots and create canonical-only

Goal: remove Rubitime from booking slots/create path.

Work:

1. Set `booking_slots_read_source=canonical` through Settings service/UI.
2. Verify patient/public slots from canonical scheduling.
3. Verify booking create uses canonical booking engine and overlap checks.
4. Remove Rubitime-first create path.
5. Remove Rubitime rollback path from normal create.
6. Remove M2M calls from webapp to integrator Rubitime slots/create.
7. Remove UI choice for slots read source.
8. Remove fail-open fallback from canonical mode: if canonical scheduling/engine DI is missing, fail as configuration error rather than calling Rubitime.
9. Disable best-effort Rubitime mirror in canonical create before runtime removal.

Important code areas:

- `apps/webapp/src/modules/patient-booking/**`
- `apps/webapp/src/app/api/booking/**`
- `apps/webapp/src/app/api/booking/public/**`
- `apps/webapp/src/modules/booking-scheduling/**`
- `apps/webapp/src/modules/booking-engine/**`
- `apps/webapp/src/modules/integrator/bookingM2mApi.ts`
- `apps/webapp/src/app-layer/booking/**`

Acceptance:

- Patient/public slots work with canonical scheduling.
- Create/reschedule/cancel all work without integrator Rubitime.
- Attempt to book occupied canonical slot is rejected.
- No TEST application path calls `/api/bersoncare/rubitime/slots` or `/create-record`.
- Test with integrator/Rubitime unavailable still passes patient/public slots/create.

### Phase R3-TENANT — exact tenant for public/patient booking

Goal: remove default-org compatibility from canonical booking before Tenant Hard Mode full-enforce.

Work:

1. Inventory all consumers of `booking_default_organization_id`.
2. Replace default-org fallback with trusted tenant derivation:
   - public host/custom domain;
   - booking link/token;
   - selected branch/service if already scoped;
   - authenticated workspace/enrollment context;
   - explicit platform-admin operation only for backoffice tools.
3. For ambiguous/missing tenant, fail closed before DB business query.
4. Ensure patient/client booking flows set org principal before canonical reads/writes.
5. Keep `booking_default_organization_id` only as temporary migration fallback until all consumers are gone.

Important code areas:

- `apps/webapp/src/infra/repos/pgBookingEngine.ts`
- `apps/webapp/src/modules/patient-booking/canonicalCreate.ts`
- `apps/webapp/src/app/api/booking/public/**`
- public slots/create route guards and principal setup
- booking catalog routes

Acceptance:

- Public slots/create cannot proceed with ambiguous org.
- Authenticated patient booking uses selected/enrolled org.
- No runtime booking path depends on hardcoded default org.
- Tenant Hard Mode H6 exact-org requirement is satisfied for booking.

### Phase R3-CATALOG — public booking catalog migration

Goal: stop treating public `booking_*` tables as Rubitime adapter tables while they are still live patient catalog.

Work:

1. Produce table-by-table disposition for:
   - `booking_cities`
   - `booking_branches`
   - `booking_branch_services`
   - `booking_services`
   - `booking_specialists`
2. Move patient/public catalog reads to `be_*` equivalents or explicit compatibility views.
3. Replace legacy branch/service ids in public APIs and UI with canonical `be_*` ids.
4. Keep compatibility adapters only through a bounded release window.

Acceptance:

- Public catalog, slots and create work from `be_*`.
- No patient/public path reads public `booking_*` tables.
- Only then may public `booking_*` rows/tables enter drop/archive planning.

### Phase R4 — provider-neutral canonical downstream events

Goal: ensure removing Rubitime does not break side effects or delete the current canonical lifecycle endpoint by mistake.

Work:

1. Inventory all GCal writes currently triggered by Rubitime raw webhook/post-create projection.
2. Identify canonical lifecycle handler currently mounted under Rubitime-named route (`/api/bersoncare/rubitime/booking-event`) and move it to a provider-neutral integration namespace.
3. Replace raw Rubitime webhook source with canonical lifecycle event source:
   - create
   - reschedule
   - cancel
   - delete
   - package link/unlink if applicable
4. Inventory booking reminder triggers currently depending on Rubitime/integrator projection.
5. Replace with canonical booking lifecycle events.
6. Preserve all current canonical side effects:
   - patient/staff Telegram/MAX notifications;
   - Web Push;
   - payment capture;
   - package link/unlink;
   - booking delete;
   - reschedule request flows;
   - patient notification text/openUrl behavior.
7. Add durable idempotency keys based on canonical appointment id and lifecycle version/event id.
8. Migrate `booking_calendar_map` to provider-neutral canonical naming/keying; do not drop it while GCal is active.

Important code areas:

- `apps/integrator/src/integrations/google-calendar/**`
- `apps/integrator/src/integrations/rubitime/webhook.ts`
- `apps/integrator/src/integrations/rubitime/postCreateProjection.ts`
- `apps/integrator/src/integrations/rubitime/recordM2mRoute.ts`
- `apps/webapp/src/modules/booking-appointment-lifecycle/**`
- `apps/webapp/src/modules/integrator/events.ts`
- `apps/webapp/src/modules/integrator/bookingM2mApi.ts`
- notification/reminder event emitters

Acceptance:

- GCal event create/update/delete is fully driven by canonical lifecycle.
- Booking reminders are fully driven by canonical lifecycle.
- No GCal/reminder path requires `rubitime_record_id` or `integrator.rubitime_records`.
- Idempotency proof for repeated lifecycle events.
- Provider-neutral lifecycle endpoint replaces Rubitime-named booking-event route, with compatibility alias only for a bounded rollout window.
- Existing GCal events are updated/deleted without duplicate recreation after map rekey/migration.

### Phase R5 — disable legacy v1 profile resolve

Goal: cut off the deprecated v1 catalog path before deleting it.

Current switch:

```bash
RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED=false
```

Work:

1. Confirm no webapp path still sends v1 Rubitime slots/create.
2. Confirm online LFK/nutrition legacy flow is retired or unrelated.
3. Set the flag only in the declared TEST configuration.
4. Verify v2/current canonical paths unaffected.
5. Record aggregate TEST v1 request counts for the declared evidence window.

Acceptance:

- v1 Rubitime requests return `legacy_resolve_disabled`.
- No user-facing booking path depends on v1 profiles.
- No errors spike after flag.

### Phase R6 — remove Rubitime runtime routes and code

Goal: integrator no longer exposes or runs Rubitime.

Precondition: provider cutoff/drain complete.

Cutoff/drain work:

- announce provider cutoff time;
- disable outbound Rubitime bridge and external webhook ingress;
- drain `projection_outbox`;
- confirm no pending/dead Rubitime projection jobs (`rubitime_create_retry_jobs` was renamed to `message_retry_jobs`
  2026-07-24 -- it is permanent generic message-delivery infra now, not drained/archived here);
- rerun fresh Rubitime CSV reconciliation after cutoff;
- verify no late CSV-present rows are missing from canonical;
- only then unmount routes/remove code.

Work:

- Remove/unmount Rubitime webhook route.
- Remove/unmount Rubitime M2M routes:
  - slots
  - create-record
  - update-record
  - cancel/remove-record
  - keep provider-neutral booking lifecycle route; remove only Rubitime compatibility alias after rollout
- Remove Rubitime connector/api2/throttle code.
- Remove post-create projection code.
- Remove Rubitime env/config keys except migration/ops archive references.
- Remove tests that assert Rubitime runtime behavior; replace with canonical booking/GCal/reminder tests.

Acceptance:

- `rg "integrations/rubitime|rubitime_records|rubitime_events|rubitime_api_throttle|rubitime_booking_profiles"` returns only docs/archive/migrations scheduled for drop.
- Integrator typecheck/lint/test pass.
- Webapp typecheck/lint/test pass for booking paths.
- No mounted route accepts Rubitime provider traffic.
- Provider-neutral booking lifecycle traffic continues to work.

### Phase R7 — archive and drop legacy tables

Goal: remove Rubitime schema from runtime DB after proof.

Prerequisites:

- R1-R6 complete.
- Fresh metadata inventory says no runtime references.
- Owner archive/drop decision recorded.
- Backup/export done if required.

Archive before drop:

- `public.appointment_records`
- `integrator.rubitime_records`
- `integrator.rubitime_events`
- populated public shadow `rubitime_records/rubitime_events`, if any

Migrate/keep live:

- `integrator.booking_calendar_map` or its renamed replacement while GCal is active
- `public.patient_bookings`
- `be_external_entity_mappings` as table; only Rubitime rows are removable after separate traceability decision
- public `booking_*` catalog tables until R3-CATALOG is complete

Drop candidates after archive/drain/proof:

- `integrator.rubitime_api_throttle`
- `integrator.rubitime_booking_profiles`
- `integrator.rubitime_branches`
- `integrator.rubitime_services`
- `integrator.rubitime_cooperators`

`integrator.rubitime_create_retry_jobs` is not a drop candidate: renamed to `integrator.message_retry_jobs`
2026-07-24 (repurposed generic message-delivery infra, not Rubitime raw provider history).

Rules:

- Generate migrations; do not use ad hoc `DROP TABLE`.
- Run the drop proof in TEST/disposable copy first.
- Run full DB restore/migration proof.
- Keep rollback backup available through the agreed horizon.

Acceptance:

- Fresh install/restore applies migrations.
- No code references dropped tables.
- SaaS T0/Tenant Hard Mode checks no longer need Rubitime quarantine.

## 7. Validation matrix

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### Booking UI/API

- Doctor schedule calendar day/week/month.
- Doctor Today/KPI.
- Doctor appointments list.
- Patient booking slots.
- Public booking slots.
- Patient create/reschedule/cancel.
- Public create/cancel if supported.
- Staff manual create/reschedule/cancel/delete.
- Booking merge/canonical patient identity flows.

### Data parity

- `appointment_records` live rows all mapped or intentionally dropped.
- Fresh Rubitime CSV has no record missing from canonical, or every CSV-present missing record is imported/waived with owner-approved ids. `integrator.rubitime_records` remains audit-only when it disagrees with the export.
- `be_external_entity_mappings` has expected Rubitime appointment mappings until table drop.
- `be_appointments` has no duplicate active rows by specialist/slot.
- Deleted/test/stale rows do not appear in UI.

### Downstream

- Google Calendar create/update/delete from canonical lifecycle.
- Reminder scheduling from canonical lifecycle.
- Patient notification lifecycle unchanged.
- Payment/membership/package/product side effects unchanged.
- Provider-neutral booking lifecycle endpoint works after Rubitime routes are unmounted.
- Existing GCal events are not duplicated during map migration/rekey.

### SaaS hard mode

- Booking reads/writes have `organization_id`.
- Patient/client flows are scoped by org and patient user.
- No Rubitime default-org compatibility path remains.
- Public/patient booking fails closed on ambiguous org.
- RLS descriptors do not list Rubitime exceptions except historical migrations/docs.

## 7a. Required proof/test matrix

These are not optional acceptance notes; each proof must produce a saved artifact before entering the destructive phases R6/R7.

| Proof id                               | Phase gate                         | Owner                         | Required artifact                               | Minimum checks                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ---------------------------------- | ----------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RR-PROOF-01-DUAL-SOURCE`              | before R2                          | R1 worker + reviewer          | Rubitime CSV reconciliation report              | Fresh Rubitime CSV is canon; `appointment_records` + canonical mappings are checked against it. `integrator.rubitime_records` anti-joins are audit-only and non-authoritative.                                                                                                                                                                   |
| `RR-PROOF-02-STATE-HISTORY`            | before R2                          | booking data worker           | `RUBITIME_RETIREMENT_R1_STATE_HISTORY_PROOF.md` | every imported appointment has canonical state + baseline/history event; raw events archived with retention/access policy; runtime no longer needs raw provider event history.                                                                                                                                                                   |
| `RR-PROOF-03-NO-RUBITIME-SLOTS-CREATE` | before R5                          | booking implementation worker | automated test output + route trace             | patient/public slots and create pass with integrator/Rubitime unavailable; canonical DI missing fails as config error, not provider fallback.                                                                                                                                                                                                    |
| `RR-PROOF-04-EXACT-TENANT`             | before Tenant Hard Mode enforce    | tenant worker                 | integration test + negative cases               | public/patient booking derives exact org from trusted host/link/resource/enrollment; conflicting contexts deny; missing/ambiguous org denies before DB query.                                                                                                                                                                                    |
| `RR-PROOF-05-CATALOG-CUTOVER`          | before any public `booking_*` drop | catalog worker                | table-by-table disposition + tests              | public catalog/slots/create read `be_*`; no patient/public runtime reads legacy public `booking_*`; compatibility views/adapters bounded.                                                                                                                                                                                                        |
| `RR-PROOF-06-LIFECYCLE-PARITY`         | before R6                          | lifecycle/integrator worker   | parity test suite output                        | provider-neutral lifecycle endpoint preserves notifications, Web Push, reminders, payment capture, package link/unlink, delete, reschedule request semantics.                                                                                                                                                                                    |
| `RR-PROOF-07-GCAL-REKEY`               | before R6                          | GCal worker                   | migration/rekey report + tests                  | existing GCal events update/delete without duplicates; `booking_calendar_map` or replacement is canonical/provider-neutral and remains live.                                                                                                                                                                                                     |
| `RR-PROOF-08-IDEMPOTENCY`              | before R6                          | lifecycle/integrator worker   | restart/idempotency test output                 | repeated lifecycle events and process restarts do not duplicate GCal/reminders/notifications/payments/package effects.                                                                                                                                                                                                                           |
| `RR-PROOF-09-CUTOFF-DRAIN`             | before R6                          | ops worker                    | cutoff/drain report                             | provider cutoff timestamp, webhook/outbound bridge disabled, `projection_outbox` drained (`message_retry_jobs`, renamed from `rubitime_create_retry_jobs` 2026-07-24, is permanent generic message-delivery infra and is not drained here), CSV-present missing delta zero or owner-waived; integrator-only rows absent from CSV are audit-only. |
| `RR-PROOF-10-DROP-RESTORE`             | before R7                          | DB worker + Sol audit         | migration restore proof                         | archive/export completed as raw archive is archive-only; migrations drop only approved tables; fresh restore + migrate + typecheck/static checks pass; no runtime references to dropped tables.                                                                                                                                                  |

Minimum command families:

```bash
node /home/dev/brain/tools/code-search.mjs "rubitime booking_calendar_map appointment_records booking_slots_read_source" --repo bcb -k 100
rg -n "appointment_records|rubitime_records|rubitime_events|booking_calendar_map|booking_slots_read_source|booking_doctor_appointments_read_source|booking_default_organization_id" apps docs
pnpm --dir apps/webapp backfill-canonical-from-legacy-appointments
pnpm --dir apps/webapp test
pnpm --dir apps/integrator test
pnpm --dir apps/webapp typecheck
pnpm --dir apps/integrator typecheck
pnpm run check:saas-db-regression
```

The exact test commands may be narrowed by the implementation worker, but every proof id above must have a recorded result.

Proof index / manifest:

- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_RR_PROOF_INDEX.md`
- `pnpm run check:rubitime-retirement-proofs`
- final all-proofs gate after R6/R7: `node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-retirement-proofs.mjs --require-complete`

Current status: `RR-PROOF-01`..`RR-PROOF-08` have saved artifacts. `RR-PROOF-09` and `RR-PROOF-10` are prepared
runbook/static-inventory gates and remain pending until owner-approved cutoff/drain and archive/drop operations.

## 8. Rollback strategy

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Release boundaries:

1. **Flip period.** Settings are changed to canonical, old branches still exist.
2. **Observation period.** Runtime monitors prove no Rubitime calls; rollback can restore settings.
3. **Freeze period.** Settings choices are hidden/frozen, branches still present for code rollback.
4. **Removal period.** Branches/routes are removed; rollback requires code redeploy.
5. **Schema drop period.** Rollback requires DB restore/archive import.

Before branch removal:

- Settings rollback is possible:
  - `booking_doctor_appointments_read_source=rubitime_legacy`
  - `booking_slots_read_source=rubitime`
  - `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED=true`
- Data backfill is additive; soft-deletes are reversible.

After branch/route removal:

- Rollback requires redeploying prior integrator/webapp code.
- Keep retired settings rows through the agreed rollback window.

After R7:

- Rollback requires DB restore or archive import.
- Do not enter R7 until owner accepts this rollback cost.

## 9. Risks

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- Historical data loss if R1 is skipped or CSV is stale/incomplete.
- Historical data loss if CSV-present Rubitime rows are not imported/mapped to canonical.
- GCal breakage if raw webhook path is removed before canonical lifecycle replacement.
- Reminder/notification/payment/package breakage if booking lifecycle endpoint is removed because it is currently Rubitime-named.
- Hidden v1 online path if legacy resolve is disabled too early.
- Tenant hard mode false sense of safety if Rubitime unscoped tables are left live under broad exceptions.
- Direct SQL cleanup risk if operators bypass existing scripts/runbooks.
- Cross-tenant public booking if default-org fallback survives canonical-only mode.
- Public booking outage if `booking_*` catalog tables are dropped before `be_*` catalog migration.

## 10. Required plan/doc updates

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Update these docs as retirement proceeds:

- `docs/archive/legacy-underscore/SAAS_FOUNDATION/TENANT_HARD_MODE_EXECUTION_PLAN.md` — historical reasoning only; do not reopen it as
  an execution plan. Its Rubitime quarantine note remains a record, while current work follows the roadmap.
- `docs/_TODO/SAAS_FOUNDATION/T0_4_PRE_SCHEMA_CLEANUP_INVENTORY.md` — update Rubitime classification after R6/R7.
- `docs/_TODO/SAAS_FOUNDATION/scope-derivation/t0-4-pre-table-matrix.tsv` — move Rubitime rows from retain/quarantine to retired/drop.
- `docs/archive/2026-07-rubitime-retirement/ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md` — archive or mark retired.
- `docs/archive/2026-07-rubitime-retirement/BOOKING_CANONICAL_CUTOVER.md` — historical background only; no operation is planned here.
- `docs/ARCHITECTURE/DB_STRUCTURE.md` — update table inventory after drops.

Section-10 manifest / follow-up assignment:

- `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_SECTION10_DOCS_MANIFEST.md`
- `pnpm run check:rubitime-section10-docs`

Current status: all six docs above either have current Rubitime retirement context or an explicit post-R6/R7 follow-up
assignment. Docs that depend on actual route removal, archive/export or drop/restore proof must not be rewritten as
completed before those proofs exist.

## 11. Suggested implementation batches

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### R1-DUAL-SOURCE-HISTORY

Owner: 5-5/Sonnet ops worker.

Scope:

- Run dry-run script.
- Run fresh Rubitime CSV vs `appointment_records`/canonical reconciliation.
- Import/map CSV-present deltas before TEST route/table removal proof.
- Collect output.
- If conflicts, prepare owner review list.
- Run commit only after approval.
- Verify `UNMAPPED/DUPLICATE/STALE/CONFLICTS`.

No code changes expected unless script breaks on current schema.

### R2-READSOURCE-CANONICAL

Owner: 5-5 design + Sonnet implementation.

Scope:

- Switch doctor read source to canonical.
- Remove runtime branch after release gate.
- Update tests and settings UI/API.

### R3-SLOTS-CANONICAL + R3-TENANT + R3-CATALOG

Owner: 5-5 design + Sonnet implementation.

Scope:

- Switch slots/create to canonical.
- Remove Rubitime-first create and rollback path.
- Validate overlap and booking policies.
- Remove default-org fallback for public/patient booking.
- Move public catalog from `booking_*` to `be_*` before table drops.

### R4-PROVIDER-NEUTRAL-LIFECYCLE

Owner: 5-5 architecture + specialist implementation.

Scope:

- Provider-neutral booking lifecycle endpoint.
- GCal canonical lifecycle source with migrated map.
- Reminders/notifications/payment/package canonical lifecycle source.
- Idempotency and parity tests.

### R5-RUNTIME-REMOVAL

Owner: Sonnet implementation, audited by Sol/5-5.

Scope:

- Disable legacy v1 resolve.
- Run cutoff/drain/final-delta gate.
- Remove/unmount Rubitime integrator runtime.
- Remove dead Rubitime code and tests.

Final gate manifest: `RUBITIME_RETIREMENT_FINAL_GATE_MANIFEST.md`.
Current-state check: `pnpm run check:rubitime-final-gate`.
Final completion check: `node docs/_TODO/SAAS_FOUNDATION/scripts/check-rubitime-final-gate.mjs --require-complete`.
The completion check must fail until R5 live-disable proof, R6 cutoff/drain proof and R7 archive/drop proof
exist with real owner decisions and command output.

### R7-SCHEMA-DROP

Owner: DB/migration worker, audited by Sol.

Scope:

- Metadata proof.
- Archive/export.
- Migration-backed drops.
- Restore proof.

## 12. Sol review questions

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Ask Sol to verify:

1. Does the plan consistently enforce the owner decision that fresh Rubitime CSV is the preservation canon and `integrator.rubitime_records` is audit-only when CSV exists?
2. Are GCal, reminders, notifications, payment/package lifecycle and provider-neutral booking-event routing fully covered before Rubitime runtime removal?
3. Are any public/patient booking paths still forced through Rubitime v1/v2 after `booking_slots_read_source=canonical`?
4. Is it safe to remove `booking_rubitime_bridge_enabled`, or does it also gate non-Rubitime mirror behavior?
5. Which tables must be archived, migrated or kept live rather than dropped immediately?
6. Does this plan preserve the archived Tenant Hard Mode reasoning without adding unsafe RLS exceptions to the
   current roadmap?

## 13. Next agent assignment prompts

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### Prompt: Sol audit

Audit `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_EXECUTION_PLAN.md` against real code and existing docs. Focus on missing blockers, wrong assumptions about history source, GCal/reminder downstreams, settings removal safety, and whether the plan safely unblocks Tenant Hard Mode. Do not edit code. Return P0/P1 findings with file evidence and recommended plan changes.

### Prompt: 5-5 architecture pass

Turn the reviewed retirement plan into implementation batches with exact route/service/repo/test file lists. Split work so Sonnet workers can implement without changing product decisions. Do not implement; produce assignment cards.

### Prompt: Sonnet R1 worker

Run the existing canonical backfill dry-run in the approved environment, collect `UNMAPPED/DUPLICATE/STALE/CONFLICTS`, and prepare an owner review report. Do not run `--commit` until approved.

## 14. Phase checklists

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Use these checklists as the operational tracker. A phase is not complete until every required checkbox is either checked or explicitly moved to an owner-approved exception log with reason, owner and rollback impact.

### R0 — freeze new Rubitime dependency

- [x] Static search report for current Rubitime references is saved.
- [x] No-new-Rubitime-dependency guard is added or explicitly assigned.
- [x] Rubitime settings UI is marked deprecated/internal-only or hidden from ordinary clinic flows.
- [x] New route/feature work is blocked from adding `rubitime` / `rubitime_legacy` branches.
- [x] New plain read-source literal `"rubitime"` / `'rubitime'` is blocked by the R0 guard.
- [x] New matching occurrences inside existing high-risk baseline files are blocked by frozen per-file counts; post-R0 setting declarations and the R3C-11 exact-org availability mapping are exempted only by exact reviewed source context, not by an open-ended count increase. _(`RUBITIME_RETIREMENT_R0_FREEZE_REPORT.md`, guard-drift correction 2026-07-22.)_
- [x] Current Rubitime route map is recorded.
- [x] Current Rubitime table/reference map is recorded.
- [x] R0 review confirms no runtime behavior changed.

### R1 — dual-source history reconciliation and canonical backfill

Execution note 2026-07-14: `R1-DUAL-SOURCE-HISTORY-codex-2026-07-14` saved draft/blocker artifact
`docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R1_DUAL_SOURCE_REPORT.md` and added sanitized read-only
diagnostic script `docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-dual-source-audit.mjs`. No R1 data-proof
checkbox is closed yet: this worktree has no allowed local dev `DATABASE_URL`, and the existing legacy backfill
dry-run output is not PII-safe.

Execution note 2026-07-14: `R1-DUAL-SOURCE-HISTORY-codex-2026-07-14-proof-runner` used the approved dev env
from `/home/dev/dev-projects/BersonCareBot`, saved sanitized aggregate dual-source JSON to
`RUBITIME_RETIREMENT_R1_DUAL_SOURCE_RESULT.json`, added a PII-safe `--summary-only` backfill output mode, and
saved the dry-run summary to `RUBITIME_RETIREMENT_R1_BACKFILL_DRY_RUN_SUMMARY.txt`. No `--commit` was run; R2
was not started.

Execution note 2026-07-14: `R1-CLEANUP-codex-2026-07-14` used the approved dev env and owner-approved
narrow cleanup flags only: `--commit --cleanup-only --delete-test --collapse-canceled-dups --summary-only`.
It did not use `--collapse-dups`, `--drop-stale-from-csv`, `--drop-legacy`, or run R2. Aggregate results were
saved to `RUBITIME_RETIREMENT_R1_CLEANUP_RUN.md`; post-cleanup diagnosis still has unmapped real active rows,
duplicate clusters, no stale CSV proof, unresolved mismatch classifications, and no doctor smoke.

Execution note 2026-07-14: `R1-STALE-CSV-PROOF-codex-2026-07-14` used the owner-provided CSV attachment in
summary-only dry-run mode and saved aggregate-only proof to
`RUBITIME_RETIREMENT_R1_STALE_CSV_PROOF.md`. The CSV proof reports 29 stale-vs-owner-CSV rows. No `--commit`,
`--drop-stale-from-csv`, `--drop-legacy`, production env, `/opt`, or R2 work was used.

Execution note 2026-07-14: `R1-NON-CONFIRMED-CLEANUP-codex-2026-07-14` implemented and ran the owner-approved
non-confirmed status cleanup with `--commit --cleanup-only --delete-non-confirmed --summary-only` against dev DB only.
It soft-deleted 47 legacy rows and 34 mapped canonical `rubitime_projection` rows; affected normalized statuses were
`canceled` and `moved_awaiting` only. The post-run summary has non-confirmed cleanup candidates `0`; stale-vs-owner-CSV
is now 28. No `--drop-stale-from-csv`, `--drop-legacy`, production env, `/opt`, Rubitime runtime/table removal, or R2
work was used. This early blocked state is superseded by the later owner-approved cleanup/import replay on a fresh
current dump.

Execution note 2026-07-14: owner-approved fallback import, strict canceled cleanup, and stale-vs-owner-CSV cleanup were completed in dev DB only and are recorded in `RUBITIME_RETIREMENT_R1_CLEANUP_RUN.md`, `RUBITIME_RETIREMENT_R1_OWNER_REVIEW_PACKET.md`, and `RUBITIME_RETIREMENT_R1_BLOCKER_CLASSIFICATION.md`. Current dev aggregate blockers for stale/unmapped/duplicates are closed: `stale=0`, `unmapped_real_active=0`, `duplicate_clusters=0`. This older dev-only note is superseded by the fresh-dump replay and owner source-of-truth decision below.

Execution note 2026-07-14: `R1-CLEAN-DUMP-REHEARSAL-sol-2026-07-14` restored the best locally readable prod-like dump into an isolated user-owned PG16 on `127.0.0.1:55432`; rehearsal result was `FAIL`. The dump has canonical Rubitime seed, but `pnpm run migrate` fails at `0143_seed_staff_organization_members.sql`, required current columns/tables are missing before migration, and the exact cutoff CSV is not locally present. No current `bcb_webapp_dev`, production DB, `/opt/env`, or live channels were touched. `RUBITIME_RETIREMENT_R1_CLEAN_DUMP_REHEARSAL.md` defines the required transfer-final-state contract and next rehearsal commands.

Execution note 2026-07-14: `R1-CLEAN-DUMP-REHEARSAL-codex-2026-07-14-fresh-0415` superseded the failed old-dump attempt. Fresh dump `/opt/backups/postgres/hourly/unified_bcb_webapp_prod_20260714_041501.dump` was restored into disposable DB `bcb_webapp_dev_rubitime_fresh_20260714_041501_owner2`. `scripts/deploy-saas-667.sh` passed after `p0-data-fix-doctor-admin-split.sql` archived 2 identifier-less active admin stubs before membership seeding. The R1 cleanup/import sequence from `RUBITIME_RETIREMENT_R1_CLEANUP_RUN.md` replayed successfully on that clean copy: `stale=0`, `unmapped_real_active=0`, `duplicate_clusters=0`, preflight PASS. Owner then set fresh Rubitime export as canon, which resolves the legacy-only/raw mismatch policy.

Execution note 2026-07-14: `R1-DOCTOR-UI-SMOKE-codex-2026-07-14` closed the doctor calendar/list/KPI smoke gate. The smoke used current local `bcb_webapp_dev` after read-only aggregate re-check because disposable clean-dump mirrors had already been removed by owner request. Aggregate risks remained closed against the owner CSV: `stale=0`, `unmapped_real_active=0`, `duplicate_clusters=0`, `raw_only=0`. Doctor calendar API returned `readSource=canonical` with 301 events over the CSV span; schedule KPI returned 200; appointments list API returned 200; `/app/doctor`, `/app/doctor/schedule?tab=cal`, and legacy `/app/doctor/appointments` (redirect to schedule tab) returned 200. Details: `RUBITIME_RETIREMENT_R1_DOCTOR_UI_SMOKE.md`.

Execution note 2026-07-14: `R2-DOCTOR-READ-SOURCE-codex-2026-07-14` made doctor-facing appointment reads canonical-only in the working branch. `booking_doctor_appointments_read_source` no longer changes runtime behavior; the admin UI no longer offers Rubitime legacy for doctor appointment reads; the settings API rejects `rubitime_legacy`; doctor analytics ignores the retired resolver and uses canonical SQL. Remaining `appointment_records` consumers are inventoried and assigned to later table-drop/canonicalization phases. Details: `RUBITIME_RETIREMENT_R2_DOCTOR_READ_SOURCE_PROOF.md`.

Execution note 2026-07-14: `R2-PATIENT-HISTORY-codex-2026-07-14` removed the patient booking history dependency on
`appointment_records`. `/app/patient/booking/new` now renders past visits from `patientBooking.listMyBookings`
(`patient_bookings` / canonical-native history) and no longer calls `patientCabinet.getPastAppointments`; the
dead `patientCabinet` DI surface and `cabinetPastBookingsMerge` projection merge helper were removed. Doctor client
fallbacks and clinical visit legacy links remain assigned to R7 table-drop preparation.

Execution note 2026-07-14: `R2-DOCTOR-CONTACT-BREAKDOWN-codex-2026-07-14` moved doctor analytics
patients-vs-subscribers contact breakdown from `appointment_records` to canonical `be_appointments`. This note is
superseded by the later `R2-DOCTOR-CLIENT-NO-LEGACY-READS` verifier for the full doctor/client runtime path.

Execution note 2026-07-14: `R2-DOCTOR-DASHBOARD-PATIENT-METRICS-codex-2026-07-14` moved doctor dashboard patient
metrics buckets for visited-this-month, new/former/subscriber and cancellations from `appointment_records` to canonical
`be_appointments`. This does not close patient card fallbacks, appointment tab legacy rows, clinical links or
memberships.

Execution note 2026-07-14: `R2-DOCTOR-CLIENT-LIST-codex-2026-07-14` moved doctor client-list appointment badges and
filters from `appointment_records` to canonical `be_appointments`; 30-day reschedule badges now use
`be_appointment_reschedules`, the existing canonical lifecycle source of truth. This does not close patient card
fallbacks, appointment tab legacy rows, clinical links or memberships.

Execution note 2026-07-14: `R2-DOCTOR-PATIENT-CARD-HEADER-codex-2026-07-14` moved doctor patient-card header
appointment stats and first/last/next appointment dates from `appointment_records` to canonical `be_appointments`;
reschedule totals now use `be_appointment_reschedules`. This still does not close the appointment tab / "create visit
from booking" path because `clinical_visit.appointment_record_id` remains a separate clinical-link migration problem.

Execution note 2026-07-14: `R2-DOCTOR-PATIENT-APPOINTMENT-TAB-CLINICAL-LINK-codex-2026-07-14` added nullable
`clinical_visit.canonical_appointment_id`, backfilled it from existing legacy links through the established `be:`
/ `be_external_entity_mappings` resolution, and moved doctor patient appointment tab + new clinical visit linking to
canonical `be_appointments`. The old `appointment_record_id` column is retained only as nullable compatibility/archive
state for R7; new doctor runtime links use canonical appointment ids.

Execution note 2026-07-14: `R2-MEMBERSHIPS-CANONICAL-APPOINTMENT-STATUS-codex-2026-07-14` moved memberships/package
session appointment verdicts from the old doctor projection lookup to canonical `be_appointments`. Package session
accounting no longer reads `appointment_records`; `CanonicalAppointmentStatus` remains the service-level verdict type
but is now derived from canonical appointment rows.

Execution note 2026-07-14: `R2-DOCTOR-ANALYTICS-METRIC-ACCOUNTS-codex-2026-07-14` removed the dead Rubitime legacy
branches from doctor analytics metric-account list SQL. Appointment metric lists now use canonical `be_appointments`,
`be_appointment_cancellations`, and `be_appointment_reschedules`; the only remaining `appointment_records` presence in
those SQL strings is the separately assigned staff-purge tombstone filter.

Execution note 2026-07-14: `R2-CANONICAL-PURGE-FILTER-codex-2026-07-14` moved the staff/admin purge visibility filter
from legacy `appointment_records` tombstones to canonical `be_appointments.deleted_at`. Staff/admin delete now stamps
canonical `deleted_at` when a canonical appointment id or Rubitime mapping resolves; `appointment_records` tombstones
remain archive/compat state only.

Execution note 2026-07-14: `R2-DOCTOR-LEGACY-PORT-DECOMPOSE-codex-2026-07-14` removed the legacy
`pgDoctorAppointments` port from PG runtime DI. This note is superseded by
`R2-DOCTOR-CLIENT-NO-LEGACY-READS-codex-2026-07-14`: the read-switch no longer accepts or falls back to a legacy
doctor appointment port in any runtime mode; missing canonical wiring fails closed.

Execution note 2026-07-14: `R2-DOCTOR-CLIENT-NO-LEGACY-READS-codex-2026-07-14` added
`check-rubitime-doctor-client-no-appointment-records.mjs` and package command
`pnpm run check:rubitime-doctor-client-no-legacy-reads`. The verifier scans doctor/patient routes, UI, modules and
doctor appointments DI wiring for `appointment_records`, `appointmentRecords`, `createPgDoctorAppointmentsPort`, and
`doctorAppointmentsLegacyPort`; it passed on 924 runtime files. Remaining legacy table references are
projection/archive/backfill/admin compatibility, tests, or R6/R7 inventory, not doctor/client runtime reads. Details:
`RUBITIME_RETIREMENT_R2_DOCTOR_READ_SOURCE_PROOF.md`.

Execution note 2026-07-14: `R3-SLOTS-CREATE-codex-2026-07-14` made patient/public slots and create canonical-only in the working branch. `booking_slots_read_source` no longer changes runtime behavior; the admin UI no longer offers Rubitime slots source; the settings API rejects `rubitime`; slots fail closed without canonical scheduling/booking engine deps; create fails closed without canonical deps; normal create no longer calls Rubitime-first/create mirror; reschedule always performs canonical overlap checks. Cancel/reschedule Rubitime mirror and downstream lifecycle/GCal/reminders remain R4/R6 scope. Details: `RUBITIME_RETIREMENT_R3_SLOTS_CREATE_PROOF.md`.

Owner source-of-truth decision 2026-07-14: fresh Rubitime export is the R1/R2 canon. Anything present in the
fresh Rubitime CSV is needed; anything absent from it is not needed. `integrator.rubitime_records` is
non-authoritative when it disagrees with the fresh export / `appointment_records` history, and integrator-only
rows absent from the CSV must not be resurrected into canonical. The export is matched through existing city/branch
mappings and the owner-approved single-specialist export context.

- [x] `appointment_records` vs `integrator.rubitime_records` anti-join is run.
- [x] max `record_at` / freshness comparison is recorded for both sources.
- [x] CSV-present missing records are imported to canonical or owner-waived with ids and reason. _(Missing delta is zero in the current audit; integrator-only rows absent from CSV are not canonical import targets.)_
- [x] legacy-only records are classified. _(Not a cleanup blocker: live rows are mapped to canonical; unmapped rows are already soft-deleted; fresh Rubitime export is canon, not integrator raw.)_
- [x] status/freshness mismatches are classified. _(Resolved by owner source-of-truth policy: fresh Rubitime export / canonical projection wins over raw integrator disagreement.)_
- [x] canonical mapping coverage is recorded.
- [x] `backfill-canonical-from-legacy-appointments` dry-run output is saved.
- [x] owner-provided CSV stale dry-run proof is saved and owner-approved stale cleanup completed in dev. _(current stale-vs-owner-CSV is 0.)_
- [x] owner reviews `UNMAPPED`, `DUPLICATE`, `STALE`, `CONFLICTS`. _(Owner decision: fresh Rubitime export is canon; cleanup buckets are closed after replay.)_
- [x] commit run is approved before any `--commit`. _(approved only for the narrow cleanup flags in `RUBITIME_RETIREMENT_R1_CLEANUP_RUN.md`; other commit modes remain gated.)_
- [x] commit run completes, if approved. _(Initial narrow cleanup was later superseded by the owner-approved fresh-dump replay; R1 proof is no longer blocked by stale/unmapped/duplicate cleanup buckets.)_
- [x] post-run cleanup diagnosis shows `UNMAPPED 0`, `DUPLICATE 0`, and `STALE 0` in dev.
- [x] `CONFLICTS` / mismatch / mapping anomaly policy is owner-reviewed or explicitly waived. _(Owner decision: fresh Rubitime export is canon; remaining live native mappings are not cleanup targets unless UI smoke exposes a visible issue.)_
- [x] clean-dump rehearsal was attempted on the best locally readable prod-like dump.
- [x] clean-dump rehearsal passes on a fresh current unified dump with exact cutoff CSV.
- [x] transfer-final-state bundle/runbook is implemented and rehearsed, if replay remains non-self-contained. _(Replay is now self-contained for the owner-approved cleanup/import sequence; no transfer bundle required for this proof.)_
- [x] doctor calendar/list/KPI smoke confirms expected historical records. _(See `RUBITIME_RETIREMENT_R1_DOCTOR_UI_SMOKE.md`; legacy `/app/doctor/appointments` redirects to the canonical schedule tab.)_

### R1-HISTORY-CONTRACT — canonical state history vs raw provider archive

- [x] Canonical event/history tables for imported appointments are named. _(See `RUBITIME_RETIREMENT_R1_STATE_HISTORY_PROOF.md`: `be_appointments`, `be_appointment_events`, `be_appointment_history_events`, lifecycle detail tables.)_
- [x] Every imported appointment has canonical current state. _(Proof script PASS: 356 `rubitime_projection` canonical rows, 287 live.)_
- [x] Every imported appointment has at least one canonical import/baseline/history event. _(Proof script PASS: live missing events/history/baseline = `0/0/0`; `projected_from_rubitime` count = 356.)_
- [x] canceled/rescheduled/status semantics are represented where legacy data allows. _(Canonical event/history buckets include `cancelled`, `rescheduled`, `rubitime_projection_synced`; provider-only details remain archive-only.)_
- [x] unreconstructable provider-only details are documented as raw-archive-only.
- [x] raw provider archive/export location is approved. _(R1/R2 location: retain in-place in `integrator.rubitime_events`; destructive export/drop remains R7-gated.)_
- [x] raw provider archive retention is approved. _(Accepted T0.4-pre disposition: `retain_with_retention`; no R1/R2 purge/drop; exact destructive archive/export/drop policy remains R7-gated.)_
- [x] raw provider archive access policy is approved. _(No runtime product reads; no payload samples in docs/logs; static proof shows webapp source only has purge-path reference.)_
- [x] read-only proof confirms doctor UI, patient history, memberships/packages and analytics do not need raw provider events. _(Scope is raw `integrator.rubitime_events`, not deprecated `appointment_records`; `appointment_records` consumers remain R2/R3 work.)_

### R2 — doctor read-source canonical-only

- [x] `booking_doctor_appointments_read_source` is set to canonical behavior through the app layer. _(The old row may remain for audit, but UI/API/runtime no longer allow it to switch doctor reads back to Rubitime legacy; direct prod DB writes were not performed.)_
- [x] doctor appointments list reads canonical.
- [x] doctor Today/KPI reads canonical.
- [x] schedule/calendar surfaces read canonical.
- [x] analytics surfaces using appointment data are checked.
- [x] all non-switch `appointment_records` consumers are inventoried.
- [x] client history reads are migrated or explicitly assigned. _(Patient booking history UI, doctor patient card/list and clinical link are migrated off `appointment_records`; remaining legacy references are archive/projection/drop-prep or separate analytics/purge consumers.)_
- [x] membership/package appointment status reads are migrated or explicitly assigned. _(Assigned to package lifecycle canonicalization before table drop.)_
- [x] runtime `rubitime_legacy` branch is removed or frozen behind rollback horizon.
- [x] tests expecting legacy switch are updated.
- [x] rollback boundary for R2 is documented.

### R3 — patient/public slots and create canonical-only

- [x] `booking_slots_read_source` is set to canonical behavior through the app layer. _(The old row may remain for audit, but UI/API/runtime no longer allow it to switch patient/public slots/create back to Rubitime.)_
- [x] patient slots work from canonical scheduling. (✓ evidence: `slotsReadSource` canonical; no patient/public runtime read of public `booking_*` tables)
- [x] public slots work from canonical scheduling. (✓ evidence: same; incident #839 concerns create, not slot reads)
- [ ] patient create works without Rubitime. _(REOPENED 2026-07-23: falsified by live incident #839 — appointment create fails 'Rubitime sync failed'. `canonicalCreate.ts`/`patient-booking/service.ts` still carry live Rubitime coupling (`isRubitimeBridgeEnabled`, post-create projection, `markConfirmed(..., rubitimeId)`); D0 census `rubitime-r6-r7-static-inventory.mjs --expect-post-r6` = ready:false, `rubitimeBookingUpsertRuntime=35`, `projectionOutboxRuntime=52`.)_
- [ ] public create works without Rubitime. _(REOPENED 2026-07-23: same as above — incident #839 + D0 census show live Rubitime create-path coupling still present.)_
- [~] reschedule/cancel work without Rubitime. _(code-done, awaiting live cutover — canonical overlap checks exist, but `mirrorPatientCancelToRubitime`/`mirrorPatientRescheduleToRubitime` outbound mirror is still wired in `patient-booking/service.ts`; live acceptance blocked by incident #839.)_
- [x] occupied canonical slot is rejected. (✓ evidence: canonical overlap check in create/reschedule path)
- [x] Rubitime-first create path is removed or frozen behind rollback horizon. (✓ evidence: bridge/mirror gated by `isRubitimeBridgeEnabled` default-false)
- [x] Rubitime rollback path is removed from normal create. (✓ evidence)
- [x] webapp no longer calls integrator Rubitime `/slots` in normal runtime. (✓ evidence: D0 census `mountedRubitimeRouteLiterals=0`, webapp M2M client retired)
- [x] webapp no longer calls integrator Rubitime `/create-record` in normal runtime. (✓ evidence: D0 census `mountedRubitimeRouteLiterals=0`, `bookingM2mApi` legacy methods fail closed)
- [x] canonical DI missing fails as config error, not Rubitime fallback. (✓ evidence)
- [~] test with integrator/Rubitime unavailable passes slots/create. _(code-done, awaiting live cutover — isolated test only; live path contradicted by incident #839 and D0 census showing 35 live `rubitimeBookingUpsertRuntime` hits.)_

### R3-TENANT — exact tenant for public/patient booking

- [x] all `booking_default_organization_id` consumers are inventoried. _(See `RUBITIME_RETIREMENT_R3_TENANT_PROOF.md`; scoped runtime inventory has no booking route matches.)_
- [x] public booking derives org from trusted host/link/resource. _(Current public runtime derives org from branch-service, product/purchase, package, or payment intent resources; missing/ambiguous online tenant fails closed.)_
- [x] authenticated patient booking derives org from enrollment/context. _(Catalog/history list endpoints use active patient enrollment; detail/payment paths use owned resource or payment intent.)_
- [x] branch/service based org derivation is validated where used. _(In-person slots/create and product/package availability derive org from canonical branch-service context.)_
- [x] conflicting org contexts deny before DB query. _(Branch/service org mismatch and explicit org mismatch fail as `ambiguous_booking_tenant`.)_
- [x] missing org denies before DB query. _(Online slots/create without trusted org fail as `ambiguous_booking_tenant`; enrollment/resource/intent misses fail before business query.)_
- [x] ambiguous org denies before DB query. _(Duplicate branch-service mapping and unscoped online booking fail closed.)_
- [x] DB principal is set before canonical booking reads/writes. _(Implemented for in-person slots/create, product/membership catalogs and purchases, history, payment status, and mock-complete captures.)_
- [x] no runtime booking path depends on hardcoded default org.
- [x] Tenant Hard Mode H6 exact-org proof is saved for booking. _(`RUBITIME_RETIREMENT_R3_TENANT_PROOF.md`.)_

Execution note 2026-07-14: `R3-TENANT-PAYMENT-ENTRYPOINTS-codex-2026-07-14` removed default-org fallback from two
runtime payment entrypoints outside the original R3-TENANT grep scope. Patient product payment page now resolves org
from the product purchase row; booking payment provider webhook resolves org from verified payment intent/provider ref
and ignores unknown provider events instead of processing them under `booking_default_organization_id`.

### R3-CATALOG — public booking catalog migration

- [x] table-by-table disposition exists for `booking_cities`. _(See `RUBITIME_RETIREMENT_R3_CATALOG_PROOF.md`.)_
- [x] table-by-table disposition exists for `booking_branches`. _(See `RUBITIME_RETIREMENT_R3_CATALOG_PROOF.md`.)_
- [x] table-by-table disposition exists for `booking_branch_services`. _(See `RUBITIME_RETIREMENT_R3_CATALOG_PROOF.md`; legacy `branchServiceId` remains bounded compatibility.)_
- [x] table-by-table disposition exists for `booking_services`. _(See `RUBITIME_RETIREMENT_R3_CATALOG_PROOF.md`.)_
- [x] table-by-table disposition exists for `booking_specialists`. _(See `RUBITIME_RETIREMENT_R3_CATALOG_PROOF.md`.)_
- [x] public catalog reads `be_*` or approved compatibility views. _(Authenticated patient catalog reads `be\__`; generic public catalog fails closed until host/link org source exists.)\*
- [x] public slots use canonical catalog ids. _(Primary contract is `branchId+serviceId`; legacy `branchServiceId` is compatibility input.)_
- [x] public create uses canonical catalog ids. _(Primary contract is `branchId+serviceId`; legacy `branchServiceId` is compatibility input.)_
- [x] legacy branch/service ids are removed from primary public API contract. _(Deprecated `branchServiceId` remains only compatibility.)_
- [x] no patient/public runtime read remains on public `booking_*`. _(Create path now builds snapshots from canonical `resolveInPersonContext` + `be_branches` + `be_clinic_services`; deprecated `branchServiceId` is mapping-only through `be_external_entity_mappings`, not a `booking\__` read.)\*
- [ ] compatibility adapters are removed by the bounded deadline or explicitly rebaselined by owner. _(The
      `2026-07-21` deadline expired while patient/public `branchServiceId` compatibility remains live. Removing it now
      requires old-link/row drain evidence plus an exact owner-approved cutoff, or an explicit defer/rebaseline with
      date, reason and rollback boundary.)_

### R4 — provider-neutral canonical downstream events

- [x] current Rubitime raw webhook GCal writes are inventoried. _(See `RUBITIME_RETIREMENT_R4_LIFECYCLE_PROOF.md`: raw webhook/post-create still call Rubitime-keyed GCal sync.)_
- [x] current Rubitime raw webhook reminder triggers are inventoried. _(No direct raw webhook reminder trigger found; reminders are lifecycle-driven.)_
- [x] current Rubitime-named `booking-event` side effects are inventoried. _(See `RUBITIME_RETIREMENT_R4_LIFECYCLE_PROOF.md`.)_
- [x] provider-neutral lifecycle endpoint is implemented or assigned. _(`/api/bersoncare/booking/lifecycle-event`; Rubitime-named route remains alias only.)_
- [x] webapp calls provider-neutral lifecycle endpoint.
- [x] Rubitime-named lifecycle route is only a bounded compatibility alias.
- [x] GCal create/update/delete is canonical lifecycle driven. _(Raw Rubitime webhook/post-create/remove no longer call raw GCal sync; canonical lifecycle always syncs by `be:<appointmentId>` with Rubitime id only as fallback adoption input.)_
- [x] reminders are canonical lifecycle driven. _(Raw webhook has no direct reminder trigger; lifecycle tests cover create/reschedule/payment reminder scheduling.)_
- [x] patient/staff Telegram/MAX notifications are preserved. _(Lifecycle tests cover create/cancel/reschedule/payment channel behavior and doctor notification path.)_
- [x] Web Push behavior is preserved. _(Lifecycle tests cover created no-push, cancelled suppress/no-suppress, and rescheduled push behavior.)_
- [x] payment capture side effects are preserved. _(Lifecycle parity test covers notifications, reminders and GCal update.)_
- [x] package link/unlink side effects are preserved. _(Lifecycle parity tests cover GCal update without patient notifications.)_
- [x] booking delete side effects are preserved. _(Lifecycle parity test covers GCal cleanup through canonical appointment key with Rubitime fallback.)_
- [x] durable idempotency is based on canonical appointment/event version. _(DB-backed key includes event type, canonical appointment id when available, and lifecycle event id.)_
- [x] `booking_calendar_map` is migrated/kept as provider-neutral canonical map. _(Table is kept while GCal is active; canonical lifecycle primary key is `be:<appointmentId>`.)_
- [x] existing GCal events update/delete without duplicates after rekey/migration. _(Canonical sync adopts legacy Rubitime map fallback before upserting `be:_` key.)\*

### R5 — disable legacy v1 profile resolve

2026-07-22 Track C supersession: the legacy resolver source was removed; it is not a live TEST switch and must not
be set, recorded, or restored. The current R5 acceptance is TEST proof that retired v1 routes are negative/unmounted
while canonical booking paths remain healthy. `RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_RUNBOOK.md` is retained as a
historical/final-reference filename only and is non-executable for this milestone. The nine rows below remain the R5
denominator; an `[x]` is repository provenance only unless a row explicitly has TEST/owner evidence.

- [x] no webapp path still sends Rubitime v1 slots requests. _(Runtime inventory: patient/public slots use canonical scheduling, not `syncPort.fetchSlots`.)_
- [x] no webapp path still sends Rubitime v1 create requests. _(Runtime inventory: Rubitime-first/mirror switches are hardcoded false; normal create is canonical.)_
- [x] online LFK/nutrition legacy path is retired or proven unrelated. _(Categories feed the same canonical online booking path; no separate Rubitime profile path found.)_
- [ ] TEST proves retired v1 routes are negative/unmounted. _(SUPERSEDES the removed
      `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED=false` flag contract; no TEST host/env flag exists to test.)_
- [ ] retired v1 slots/create requests have the declared negative/unmounted result. _(SUPERSEDES the historical
      `legacy_resolve_disabled` response contract; record the actual TEST result without inferring a response code.)_
- [x] canonical/current booking paths are unaffected. _(v2 explicit-id slots/create still pass with legacy resolve disabled.)_
- [ ] TEST evidence window shows no v1 requests.
- [ ] TEST negative/unmounted observation and aggregate route/error counts are recorded. _(SUPERSEDES a TEST flag
      change record; declare the TEST window and exact integrated SHA.)_
- [ ] TEST rollback boundary is recorded without re-enabling a removed resolver. _(SUPERSEDES the flag restore
      instruction; an incremental code rollback keeps external Rubitime ingress/outbound disabled.)_

Next routine TEST evidence, not yet performed: freeze the integrated SHA; run the accumulated repo gate and
forward-migration compatibility check; deploy only with `deploy/host/deploy-test.sh`; then record a declared TEST
window, negative/unmounted v1 route evidence, canonical slots/create/reschedule/cancel and doctor
Today/KPI/calendar/list smoke, plus aggregate-only route/error counts. This routine path never pulls a fresh PROD
dump, resets TEST, repeats backfill/cutover, or drops R7 tables.

### R6 — remove Rubitime runtime routes and code

Prepared runbook: `RUBITIME_RETIREMENT_R6_CUTOFF_DRAIN_RUNBOOK.md`. It is not proof of completed cutoff; it defines
the required read-only drain snapshots, fresh CSV reconciliation and owner-approved disable steps for `RR-PROOF-09`.
It is a production/final reference and is explicitly non-executable for the current Track C incremental TEST
milestone; do not substitute TEST paths or execute its commands without a separate owner-approved TEST runbook.
Prepared static inventory: `RUBITIME_RETIREMENT_R6_R7_STATIC_INVENTORY.md` +
`docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r6-r7-static-inventory.mjs`. The inventory is pre-cutoff evidence
only; post-R6 it must pass with `--expect-post-r6`.

- [ ] provider cutoff time is announced.
- [ ] outbound Rubitime bridge is disabled.
- [ ] external Rubitime webhook ingress is disabled.
- [ ] `projection_outbox` is drained.
- [x] `rubitime_create_retry_jobs` renamed to `message_retry_jobs` 2026-07-24; permanent generic message-delivery
      infra, not drained/archived here (see `RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md`).
- [ ] no pending/dead Rubitime projection jobs remain.
- [ ] final dual-source reconciliation after cutoff is run.
- [ ] final CSV-present missing delta is zero or owner-waived; integrator-only rows absent from the fresh export are audit-only and must not be imported/resurrected.
- [ ] old webapp doctor Rubitime proxy routes are removed. _(PROVENANCE-only: source removal exists, but R6 phase
      acceptance remains open until the preceding cutoff/drain rows and `RR-PROOF-09` pass; do not restore routes by
      inference.)_
- [ ] staff/admin manual create skips legacy Rubitime mapping resolution when bridge is disabled. _(PROVENANCE-only;
      same R6 gate.)_
- [ ] patient/public create has no hard-disabled Rubitime-first/create-mirror branch. _(PROVENANCE-only; same R6
      gate.)_
- [ ] patient cancel/reschedule skips outbound Rubitime mirror when bridge is disabled. _(PROVENANCE-only; same R6
      gate.)_
- [ ] Rubitime webhook route is unmounted from integrator app wiring. _(PROVENANCE-only: static route inventory is
      zero, but external ingress disable and `RR-PROOF-09` are absent.)_
- [ ] Rubitime `/slots` route is unmounted from integrator app wiring. _(PROVENANCE-only; same R6 gate.)_
- [ ] Rubitime `/create-record` route is unmounted from integrator app wiring. _(PROVENANCE-only; same R6 gate.)_
- [ ] Rubitime update/cancel/remove routes are unmounted from integrator app wiring. _(PROVENANCE-only; same R6
      gate.)_
- [ ] provider-neutral booking lifecycle route remains working. _(PROVENANCE-only: route-split proof exists, but
      final lifecycle-only acceptance remains gated by `RR-PROOF-09`.)_
- [ ] provider-neutral booking lifecycle handler/schema live outside Rubitime registrar ownership.
      _(PROVENANCE-only; same R6 gate.)_
- [ ] Rubitime connector/api2/throttle code is removed. _(PROVENANCE-only: static runtime-token category is zero;
      historical migrations/docs remain and R6 acceptance is still gated.)_
- [ ] Rubitime post-create projection code is removed. _(PROVENANCE-only: source/tests were removed, but this does
      not close the phase before cutoff/drain proof.)_
- [ ] runtime Rubitime env/config keys are removed or archived.
- [ ] integrator typecheck/lint/tests pass.
- [ ] webapp booking typecheck/lint/tests pass.

Execution note 2026-07-14: `R6-INTEGRATOR-RUNTIME-WIRING-codex-2026-07-14` removed active integrator app wiring for
Rubitime record M2M routes, Rubitime admin M2M routes, Rubitime webhook registrar default injection, Rubitime
integration registry capability, and the operator-health outbound Rubitime schedule probe. The provider-neutral
`/api/bersoncare/booking/lifecycle-event` route remains registered. Validation: integrator targeted test/lint/typecheck
passed; `rubitime-r6-r7-static-inventory.mjs` now reports `integratorRubitimeRuntimeImports=0`. This is not
`RR-PROOF-09`: R6 cutoff/drain owner gates, legacy Rubitime source module deletion, webapp Rubitime M2M client cleanup,
and final post-R6 inventory are still open.

Execution note 2026-07-14: `R6-WEBAPP-M2M-CLIENT-RETIRE-codex-2026-07-14` retired the webapp Rubitime M2M/admin
clients without removing the provider-neutral lifecycle emitter. `createBookingSyncPort().emitBookingEvent` still posts
signed events to `/api/bersoncare/booking/lifecycle-event`; legacy slots/create/update/cancel/delete methods now fail
closed without HTTP. The admin Rubitime M2M facade now fails closed without calling integrator. Validation:
`bookingM2mApi.test.ts`, targeted eslint and webapp typecheck passed; `rubitime-r6-r7-static-inventory.mjs` no longer
reports webapp files under `mountedRubitimeRouteLiterals`. Remaining post-R6 blockers are legacy integrator Rubitime
source modules and API client/throttle/post-create tokens, plus the real owner-gated R6 cutoff/drain proof.

Execution note 2026-07-14: `R6-INTEGRATOR-LEGACY-SOURCE-DELETE-codex-2026-07-14` removed the legacy Rubitime route
source, external API client, throttle, post-create projection and related tests from
`apps/integrator/src/integrations/rubitime`. The old compare/resync ops scripts no longer import the live Rubitime API
client and fail closed with `rubitime_external_api_retired` for external fetch attempts. Validation: integrator
typecheck passed and `rubitime-r6-r7-static-inventory.mjs --expect-post-r6` reports zero R6 runtime blockers. This is
still not `RR-PROOF-09`: owner-approved provider cutoff/drain, fresh post-cutoff CSV reconciliation and final R6 proof
file are still required.

Execution note 2026-07-14: `R6-INTEGRATOR-RUBITIME-SOURCE-LAYER-DELETE-codex-2026-07-14` removed the remaining unused
Rubitime integration source layer, Rubitime webhook e2e scenario, autoloaded Rubitime orchestrator content bundle and
stale raw booking event journal writer to `integrator.rubitime_events`. Historical SQL migrations under
`apps/integrator/src/integrations/rubitime/db/migrations` remain for fresh migration chain compatibility until R7
drop/defer. Validation: integrator typecheck and test suite passed; post-R6 static inventory still reports zero
Rubitime route/import/API blockers and raw-table references are reduced to R7 archive/drop/defer scope. CSV remains
the only preservation canon; integrator-only rows absent from the CSV are not resurrected.

### R7 — archive and drop legacy tables

Prepared runbook: `RUBITIME_RETIREMENT_R7_ARCHIVE_DROP_RUNBOOK.md`. It is not proof of completed archive/drop; it
defines the required audit, archive/export, migration and fresh restore proof for `RR-PROOF-10`.
Repo-first DB cleanup handoff for SaaS Foundation: `RUBITIME_RETIREMENT_DB_CLEANUP_SEQUENCE.md`. It prepares the
TEST/disposable archive/drop/defer order and validation contract without requiring current live-environment work.
Prepared table disposition: `RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md` +
`pnpm run check:rubitime-r7-table-disposition`.
Prepared non-final static reference audit: `RUBITIME_RETIREMENT_R7_STATIC_REFERENCE_AUDIT.md`.

- [ ] R1-R6 are complete.
- [ ] fresh metadata inventory finds no runtime references to drop candidates.
- [ ] owner archive/drop decision is recorded.
- [ ] raw provider archive/export is completed if required.
- [ ] `public.appointment_records` archive decision is completed.
- [ ] `integrator.rubitime_records` archive decision is completed.
- [ ] `integrator.rubitime_events` archive decision is completed.
- [x] `integrator.booking_calendar_map` or replacement is explicitly kept/migrated. _(Explicit `keep_until_replacement` in `RUBITIME_RETIREMENT_R7_TABLE_DISPOSITION.md`; active while GCal sync is live.)_
- [x] `public.patient_bookings` is explicitly kept. _(Explicit `keep`; canonical patient booking history/runtime table.)_
- [x] `be_external_entity_mappings` table is explicitly kept. _(Explicit `keep`; only Rubitime rows are later traceability policy scope.)_
- [x] public `booking_*` tables are not dropped until R3-CATALOG is complete. _(Explicit `defer_drop`; legacy catalog compatibility is outside Rubitime raw-table drop.)_
- [ ] drop migration is generated.
- [ ] drop migration is tested in TEST/disposable copy.
- [ ] fresh restore + migrate proof passes.
- [ ] no code references dropped tables.
- [ ] rollback backup/archive is available through approved horizon.

## 15. Final retirement checklist

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Rubitime is retired only when all items below are checked.

Machine gate:

```bash
pnpm run check:rubitime-retirement-current
pnpm run check:rubitime-final-gate
pnpm run check:rubitime-retirement-complete
```

Current mode verifies the active non-destructive Rubitime retirement gates. `check:rubitime-retirement-complete` is
the final acceptance command and must stay red until R5/R6/R7 final proof files exist; it runs every final sub-gate
and reports all blockers in one pass.
Owner/ops packet for the remaining decisions: `RUBITIME_RETIREMENT_OWNER_GATE_PACKET.md`.

- [x] R0 freeze complete.
- [x] R1 dual-source history complete.
- [x] R1-HISTORY-CONTRACT complete.
- [x] R2 doctor canonical read-source complete.
- [~] R3 patient/public canonical slots/create complete. _(code-done, awaiting live cutover — code milestone landed, but runtime create acceptance is reopened by incident #839 'Rubitime sync failed'; D0 census `--expect-post-r6` = ready:false.)_
- [x] R3-TENANT exact tenant complete.
- [ ] R3-CATALOG catalog migration complete. _(The no-legacy-table-read proof remains valid, but the bounded
      `branchServiceId` compatibility removal deadline expired; see `RUBITIME_RETIREMENT_R5_R7_PROVENANCE_RECONCILIATION.md`.)_
- [x] R4 provider-neutral lifecycle complete.
- [ ] R5 TEST retired v1 routes negative/unmounted; canonical booking healthy.
- [ ] R6 runtime routes/code removed.
- [ ] R7 archive/drop complete or explicitly deferred with no runtime references.
- [ ] No runtime code calls Rubitime API.
- [ ] No runtime route accepts Rubitime webhook/provider traffic.
- [x] No doctor/client path reads `appointment_records`. _(`pnpm run check:rubitime-doctor-client-no-legacy-reads` scans doctor/patient routes, UI, modules and DI wiring; PASS on 924 runtime files.)_
- [x] Patient booking history UI no longer reads `appointment_records`.
- [x] No patient/public path reads public legacy `booking_*`.
- [x] No canonical booking path uses `booking_default_organization_id` as fallback. _(Patient/public booking, product payment page, booking payment mock-complete/status and provider webhook resolve organization from resource/payment intent; remaining default-org uses are admin/doctor/integrator compatibility scope.)_
- [x] GCal works from canonical lifecycle.
- [x] reminders work from canonical lifecycle.
- [x] notifications/Web Push/payment/package side effects work from canonical lifecycle.
- [ ] provider-neutral booking lifecycle route is the only live lifecycle integration route.
- [ ] all `RR-PROOF-*` artifacts are saved. _(`RR-PROOF-01`..`08` saved; `RR-PROOF-09`/`10` remain gated. See `RUBITIME_RETIREMENT_RR_PROOF_INDEX.md` and `pnpm run check:rubitime-retirement-proofs`.)_
- [ ] live rollback boundary is accepted by owner.
- [x] docs listed in section 10 are updated or have assigned follow-up tasks. _(See `RUBITIME_RETIREMENT_SECTION10_DOCS_MANIFEST.md`; `pnpm run check:rubitime-section10-docs` passes.)_

## 16. Tenant Hard Mode unblock checklist

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Tenant Hard Mode can remove Rubitime quarantine only when this gate is complete.

- [ ] Rubitime runtime is retired or no longer reachable from doctor/client/clinic flows.
- [ ] Booking domain has exact `organization_id` principal before DB reads/writes.
- [ ] Public booking derives org from trusted host/link/resource and denies ambiguity.
- [ ] Patient booking is scoped by org and patient user/enrollment.
- [x] No booking path uses default-org compatibility.
- [ ] No active RLS descriptor requires Rubitime-specific exception.
- [ ] No active DB role grants broad access to Rubitime legacy tables for doctor/client/clinic roles.
- [ ] Any remaining Rubitime archive tables are platform/admin-only and not product runtime.
- [ ] Archive table access has audit logging and retention.
- [ ] `appointment_records`, raw Rubitime rows and provider archives are not used for doctor/client runtime reads.
- [ ] SaaS DB regression check passes without Rubitime carve-out.
- [ ] Tenant wall tests include booking, media, broadcasts and references after Rubitime retirement.
- [ ] Owner accepts that full Tenant Hard Mode may proceed without Rubitime quarantine.
