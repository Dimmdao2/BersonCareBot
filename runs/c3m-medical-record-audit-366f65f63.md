# C3M-07a independent audit — medical record independence (#1098)

Date: 2026-09-07

Product candidate: `366f65f639ff76ec17ea67f92d7b7db8a88790fb`

Candidate parent: `fa8987e10a9792d238c5b1fa2d89c4b03f4f0c7a`

Salvaged acceptance commit: `c8974edacfdd9c5e6eb0b02b2eafd854068f68f5`

## Oracle and method

Roadmap C3M-07a requires `medical_record=OFF` to hide and deny longitudinal symptoms, complaints/problem
history, diagnoses, anamnesis and comorbidities independently from encounters, while preserving clients,
basic Overview notes/tasks/appointments, files/account and all stored history for re-enable. C3M.8 additionally
requires all four `medical_record × encounters` combinations.

This document completes the interrupted first blind auditor-live pass recorded at
`/home/dev/brain/runs/agent-port/c3m-medical-record-audit-20260907.json`; it does not repeat the live matrix or
fault injections. Stable API/bootstrap behavior is tested. Responsive composition is accepted by live view.
Stored-history preservation and the absence of a second access formula are accepted by live view plus diff and
architecture inspection, without source-text, SQL-text, DOM/count, snapshot or formatting tests.

The requested original brief path `runs/c3m-medical-record-audit-brief-20260907.md` is absent from this worktree
and all local refs. Evidence: exact `sed` returned `No such file or directory`; `find /home/dev/dev-projects
/home/dev/brain/runs -type f -name 'c3m-medical-record-audit-brief-20260907.md'`, `git log --all --name-only --
runs/c3m-medical-record-audit-brief-20260907.md`, and exact back-reference `rg` returned no rows; lexical
`code-search` returned only roadmap and implementation hits. The continuation brief in the launch request and the
complete prior run record preserve the required authority/evidence.

## Blind fault model fixed before test inspection

1. `medical_record=OFF` still loads or mutates symptoms, diagnoses, anamnesis, comorbidities or problem history.
2. `medical_record=OFF` also disables encounter read/start/update.
3. `encounters=OFF` also disables the longitudinal medical record.
4. A switch combination removes always-on clients, Overview notes/tasks/appointments, files or account.
5. A direct API/action bypasses the medical-record switch.
6. OFF→ON loses or rewrites stored longitudinal history.
7. Preference evaluation weakens the existing actor/capability/tenant boundary.
8. A new route or bootstrap path computes a second feature formula outside the accepted resolver/guard.

Expected matrix: ON/ON exposes both halves; OFF/ON exposes encounters only; ON/OFF exposes medical record only;
OFF/OFF exposes neither while all always-on surfaces remain.

## Acceptance-test inspection and fault injection

Commit `c8974edac` changes only:

- `apps/webapp/src/app/api/doctor/patients/[userId]/patientCardNeverGated.route.test.ts` — direct typed 403s,
  upstream boundary ordering, encounter independence and mixed encounter-payload denial;
- `apps/webapp/src/app/app/doctor/patients/loadDoctorPatientCardPageBootstrap.workspaceProjection.unit.test.ts`
  — all four bootstrap combinations and always-on Overview work.

The continuation corrected only the route test's local request helper: both GET and HEAD now construct a Request
without a body. No product code was changed.

Recovered fault-injection evidence from the prior run:

| Temporary production fault | Oracle outcome |
| --- | --- |
| Bypass the central `medical_record` route guard in `workspaceModuleAccess.ts` | Route oracle RED: `2/13` failed; `clinical GET` returned 200 instead of 403 and a visit carrying medical fields returned 201 instead of 403. Three guarded GET probes also reached intentionally absent data fakes, proving the deny no longer happened before reads. |
| Couple medical bootstrap loads to the wrong module state | Bootstrap oracle RED: `2/5` failed on `clinicalState` call presence in the mixed/off matrix. |
| Couple encounter bootstrap loads to the wrong module state | Bootstrap oracle RED: `2/5` failed on `visits` call presence in the mixed matrix. |
| Short-circuit the always-on Overview branch | Bootstrap oracle RED: `1/5`; `notes` was called 0 times instead of once (the first preserved-surface assertion stopped the test). |
| Execute longitudinal medical loaders while medical record is OFF | Bootstrap oracle RED: `2/5`; `clinicalState` was called where the matrix required no call. |
| Remove the mixed encounter-payload medical guard | Route assertion `denies medical-record fields smuggled through encounter creation` turned RED (201 instead of 403). |
| Put preference evaluation ahead of the existing actor/capability/tenant denial | Route assertion `keeps the existing actor/capability/tenant denial upstream of workspace preferences` turned RED. |

All temporary faults above were reverted before live work. Structural fault B8 is intentionally a diff/architecture
inspection rather than a source-text test. The candidate keeps the existing role/org gate first and routes module
decisions through the accepted workspace composition resolver/guard.

## Reused live 2×2 evidence

The prior auditor ran the candidate on isolated `127.0.0.1:5217` with the named DEV configuration. Initial state
was ON/ON. Each combination was viewed at desktop `1440×1000` and mobile `390×844`:

| medical_record | encounters | Observed result |
| --- | --- | --- |
| ON | ON | Both longitudinal record and encounter halves were present. |
| OFF | ON | Longitudinal record was absent; encounter history/start remained. |
| ON | OFF | Longitudinal record remained; encounter history/start was absent. |
| OFF | OFF | Direct `?tab=karta` resolved to 404; Overview, rehabilitation, Files and Account remained available. |

After OFF→ON, the original symptoms, diagnoses and anamnesis were visible again. The organization was restored to
ON/ON. The before and restored desktop Karte screenshots are byte-identical:

```text
sha256sum /tmp/c3m-on-on-desktop-karta.png /tmp/c3m-restored-on-on-desktop-karta.png
2ee5886593d50e86d451e5271e5313830b95ff76d7853a74580cccf48bd1b3a1  /tmp/c3m-on-on-desktop-karta.png
2ee5886593d50e86d451e5271e5313830b95ff76d7853a74580cccf48bd1b3a1  /tmp/c3m-restored-on-on-desktop-karta.png
cmp -s /tmp/c3m-on-on-desktop-karta.png /tmp/c3m-restored-on-on-desktop-karta.png
# exit 0
```

The isolated port is no longer listening. No live work was repeated in this continuation.

## Final commands and results

```bash
git show -s --format='candidate=%H parent=%P subject=%s' 366f65f63
# candidate=366f65f639ff76ec17ea67f92d7b7db8a88790fb parent=fa8987e10a9792d238c5b1fa2d89c4b03f4f0c7a

git diff --shortstat 366f65f63^..366f65f63
# 21 files changed, 568 insertions(+), 338 deletions(-)

git diff --name-only 366f65f63..c8974edac
# exactly the two acceptance-test files listed above

git diff --exit-code HEAD
# exit 0 before the test-helper correction; no temporary production mutation remained

pnpm --dir apps/webapp exec vitest run --project=route \
  'src/app/api/doctor/patients/[userId]/patientCardNeverGated.route.test.ts'
# PASS: 1 file, 14 tests

pnpm --dir apps/webapp exec vitest run --project=unit \
  'src/app/app/doctor/patients/loadDoctorPatientCardPageBootstrap.workspaceProjection.unit.test.ts' \
  'src/app/app/doctor/patients/[userId]/patientCardTabRegistry.unit.test.ts'
# PASS: 2 files, 10 tests

pnpm --dir apps/webapp typecheck
# PASS

git diff --name-only -z 366f65f63^..HEAD -- 'apps/webapp/**/*.ts' 'apps/webapp/**/*.tsx' \
  | sed -z 's#^apps/webapp/##' | xargs -0 pnpm --dir apps/webapp exec eslint
# PASS

node scripts/check-db-chokepoint.mjs
node scripts/check-no-new-raw-sql.mjs
node scripts/check-queue-port-boundary.mjs
node scripts/check-test-runner-visibility.mjs
node scripts/check-c4-migration-owned-function-bodies.mjs
# PASS; runner visibility: integrator 121/121, webapp 553/553, media-worker 10/10

git diff --check
# PASS
```

Full CI was not run: no shared package, root tooling, lockfile, multi-app or other uncovered repo-level contract
changed in this continuation.

## Findings and verdict

No reachable product failure remains in C3M-07a scope. All temporary production modifications are absent; the
only continuation change outside this artifact is the test-local GET/HEAD helper correction.

**C3M-07a → PASS** for product candidate `366f65f639ff76ec17ea67f92d7b7db8a88790fb` with acceptance oracle
`c8974edacfdd9c5e6eb0b02b2eafd854068f68f5` plus this continuation commit.
