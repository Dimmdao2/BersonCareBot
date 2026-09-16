# C3M-08 independent audit — rehabilitation closure (#1098)

Date: 2026-09-07

Product candidate: `d77f7dbaf0a9231cbea239c97467343b1f77f59d`

Audited synchronized tree at the start of the interrupted run:
`3c1d58474` (includes synchronization commit `0e0234913`). The continuation tree before this audit commit was
`7dcb1fdd6187d57fe4b853b394370abb5d6cf308`; its only delta from the product candidate in
`workspaceModuleAccess.ts` is whitespace.

Authority: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M-08, and
`runs/c3m-rehabilitation-audit-brief-20260907.md` (recovered from the primary worktree after the interrupted
worktree's stash had already been restored).

## Oracle and blind fault model

C3M-08 requires `rehabilitation=OFF` to hide and deny the patient-card/program surfaces, the complete specialist
LFK catalog cluster, dependent program comments/media and rehabilitation-owned background work. Existing actor,
capability and tenant boundaries must remain upstream; unrelated notes, tasks, appointments, medical record and
encounters remain available; switching ON again must expose the same stored program/session/comment/media data.

The blind kill-set was fixed before the candidate tests were inspected:

1. Only the LFK tab disappears while direct catalog/program routes, actions or APIs remain reachable.
2. `program_comments` or `program_media` remains effective when its parent is OFF, or OFF overwrites a stored child
   preference.
3. A direct doctor/patient route, action or API bypasses the common resolver; an unavailable capability or another
   organization's preference expands access.
4. Hidden comment/media feeds, badges, unread work, reminders or notification materialization continue.
5. OFF suppresses notes/tasks/appointments/medical record/encounters, or destroys rehabilitation data.
6. OFF→ON does not restore the same stored state.
7. Desktop/mobile doctor or patient projections disagree.

Direct denial, dependency/tenant resolution and hidden work are durable behavior tests. Navigation, catalog/card
absence and responsive presentation were checked live. Data preservation and the one-resolver architecture were
inspected directly; no source/SQL-text, DOM/count, snapshot or formatting tests were retained or added.

## Durable acceptance oracles and fault injection

The audit changes only these test paths plus this artifact:

- `apps/webapp/src/app/app/doctor/workspaceRouteProjection.unit.test.ts` — all eight specialist catalog layouts
  fail closed while enabled children remain unchanged;
- `apps/webapp/src/app-layer/guards/workspaceModuleAccess.rehabilitation.audit.unit.test.ts` — doctor/patient API
  classification, independent surfaces, two-organization isolation, parent-child effective state and OFF→ON child
  restoration;
- `apps/webapp/src/app-layer/reminders/runPatientReminderMaterializationWake.audit.unit.test.ts` — hidden
  rehabilitation rules neither resolve delivery targets nor materialize occurrences, and ON restores the same rule;
- `apps/webapp/src/app-layer/guards/patientWorkspaceModules.devDbProof.test.ts` — opt-in named-DEV acceptance
  oracle for the patient application principal. This remains intentionally RED on the product defect below.

Recovered results from the pre-interruption run:

```bash
pnpm --dir apps/webapp exec vitest run \
  src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts \
  src/app-layer/guards/workspaceModuleAccess.rehabilitation.audit.unit.test.ts \
  src/app/app/doctor/workspaceRouteProjection.unit.test.ts \
  src/app-layer/reminders/runPatientReminderMaterializationWake.audit.unit.test.ts
# PASS: 4 files, 54 tests
```

Each temporary product fault was restored before continuing:

| Named temporary fault | Oracle result |
| --- | --- |
| Let a disabled specialist catalog layout render its child | `workspaceRouteProjection.unit.test.ts` RED, exit 1. |
| Ignore rehabilitation's parent dependency for comments/media | composition + workspace-access oracles RED, exit 1. |
| Remove a protected doctor/patient API classification | workspace-access oracle RED, exit 1. |
| Weaken two-org isolation or OFF→ON stored-child restoration | workspace-access oracle RED, exit 1. |
| Stop filtering rehabilitation reminder rules before target resolution/materialization | reminder-materialization oracle RED, exit 1. |

The patient port-context path is already RED on the unmodified candidate, so no artificial fault was introduced for
that class.

## Live isolated DEV acceptance

The interrupted auditor used isolated `127.0.0.1:5218`, desktop `1440×1000` and mobile `390×844`. Initial
`rehabilitation=true` was changed through the Settings UI; the OFF save returned `PATCH 200`.

- Doctor desktop/mobile: all specialist catalog links and the patient-card LFK tab were absent; independent
  `Обзор`, `Карта`, `Файлы`, `Учётка` remained; hidden comment/program-test requests did not start; no horizontal
  overflow was observed; representative protected APIs returned the typed `403` refusal.
- Patient desktop/mobile: `/app/patient` and the rehabilitation routes returned HTTP 500, so their OFF responsive
  presentation could not be accepted.
- Cleanup/restoration: the original `rehabilitation=true` was restored through the Settings UI with `PATCH 200`.
  The restored patient route still returned HTTP 500.

The continuation reproduced the restored-ON failure on a fresh server process at the same isolated port:

```text
GET /app/patient 500
digest: 2293250535
PatientLayout -> resolveOrganizationWorkspaceModules -> getDoctorWorkspaceComposition
PostgreSQL: 42501 permission denied for table system_settings
```

The matching named-DEV oracle uses the authenticated patient's real organization relationship and fails at the same
application seam:

```bash
set -a; . /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev; set +a
USE_REAL_DATABASE=1 RUN_PATIENT_WORKSPACE_MODULES_DB=1 \
  pnpm --dir apps/webapp exec vitest run \
  src/app-layer/guards/patientWorkspaceModules.devDbProof.test.ts
# FAIL: 1 file, 1 test; PostgreSQL 42501 permission denied for table system_settings
```

The isolated server was stopped. `runs/c3m-rehabilitation-live.tmp.mjs` was deleted, and no temporary production
mutation remains.

## Direct inspection

- The candidate adds no migration/schema file and no delete/truncate path. The Settings UI writes only the
  versioned `doctor_workspace_composition` setting; effective parent resolution does not rewrite child preferences.
  The two-org OFF→ON oracle confirms the stored child choices reappear.
- `resolveWorkspaceModuleEffective` remains the single formula for availability, preference and dependency folding.
  Doctor, patient/API and reminder adapters call the same composition service/resolver chain; no second effective
  formula or parallel registry was found.
- The finding is therefore not data loss or a second resolver. It is a reachable DB-port mismatch: the patient
  principal is sent through a canonical settings repository operation that its port-context role cannot execute.

## Validation

```bash
pnpm --dir apps/webapp run typecheck
# PASS

pnpm --dir apps/webapp exec eslint \
  'src/app/app/doctor/workspaceRouteProjection.unit.test.ts' \
  'src/app-layer/guards/workspaceModuleAccess.rehabilitation.audit.unit.test.ts' \
  'src/app-layer/guards/patientWorkspaceModules.devDbProof.test.ts' \
  'src/app-layer/reminders/runPatientReminderMaterializationWake.audit.unit.test.ts'
# PASS

node scripts/check-db-chokepoint.mjs
node scripts/check-no-new-raw-sql.mjs
node scripts/check-queue-port-boundary.mjs
node scripts/check-test-runner-visibility.mjs
node scripts/check-c4-migration-owned-function-bodies.mjs
# PASS; runner visibility: integrator 121/121, webapp 554/554, media-worker 10/10

git diff --cached --check
# PASS
```

The unchanged 54-test green set was reused rather than rerun. Full CI was not run, as required by the audit brief.

## Finding and verdict

### C3M08-A1 — BLOCKER: authenticated patient shell always returns 500

Reachable scenario: an enrolled authenticated patient opens `/app/patient` with rehabilitation either OFF or ON.
`PatientLayout` resolves the organization's workspace composition under the patient application principal. The
canonical repository directly reads `system_settings`; the patient port-context role has no table access, so the
common layout returns HTTP 500 before any patient page can render.

Impact: the entire authenticated patient cabinet is unavailable, not merely a hidden rehabilitation surface, and
OFF→ON cannot restore patient access. This violates the C3M-08 patient presentation/restoration requirement. Exact
failing acceptance oracle: `apps/webapp/src/app-layer/guards/patientWorkspaceModules.devDbProof.test.ts`.

No product fix was made by this audit.

**C3M-08 → FAIL** for product candidate `d77f7dbaf0a9231cbea239c97467343b1f77f59d`.
