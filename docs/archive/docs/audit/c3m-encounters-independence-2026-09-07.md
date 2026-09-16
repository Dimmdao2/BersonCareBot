# C3M-07b encounters independence — auditor-live

- Taskdb: `#1098`
- Candidate: `ba3152029b5106a46d7179a4940ce53e319b1687` (`feat(c3m): gate encounters independently (#1098)`), inspected in descendant worktree HEAD `839c1b938`
- Oracle: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M.1–C3M.8, especially C3M-07b
- Role: independent `auditor-live`; product fixes are out of scope

## Blind kill-set (fixed before intentional inspection of existing tests)

The following fault classes come from the roadmap and audit brief, not from the candidate implementation:

1. `encounters=OFF` still permits a direct start/history page or action. Impact: a specialist can use the disabled module through a deep link.
2. `encounters=OFF` still permits visit-bound examination, intervention, or prescription mutations. Impact: disabled encounter data can still be changed.
3. `medical_record=OFF` removes encounters. Impact: disabling longitudinal records also removes a separately enabled paid/workspace path.
4. `encounters=OFF` removes the medical record. Impact: disabling visits also removes separately enabled longitudinal records.
5. Either switch hides booking/appointments. Impact: the non-configurable booking path disappears contrary to C3M.1/C3M.4.
6. A direct encounter API bypasses the workspace guard. Impact: hidden UI does not prevent disabled mutations.
7. `encounters=OFF` still preloads visit/history/visit-bound data. Impact: hidden work and data access continue behind the disabled surface.
8. OFF→ON loses or rewrites stored encounter history. Impact: re-enable does not restore the specialist's existing clinical history.
9. Encounter enablement is recalculated by duplicated formulas instead of the application-layer resolver/guard. Impact: a newly added route can diverge and become a reachable bypass.

## Test-or-look classification

- Blind behavior tests: direct page/action/API denial; conditional encounter bootstrap; all four `medical_record × encounters` states.
- Live desktop/mobile: CTA, history and tab visibility; responsive layout; booking/appointments remaining visible.
- Service/repository/diff inspection: preserved stored history; no destructive OFF write; one-resolver architecture and absence of duplicated guard formulas.

## Evidence and verdict

### Targeted durable-behavior validation

The restored acceptance tests cover API denial and independence, conditional bootstrap, all four
`medical_record × encounters` states, and direct page denial. The one in-scope test that asserted removed UI
strings was deleted; CTA/history/tab shape remains a live acceptance concern.

Exact baseline command:

```text
pnpm --dir apps/webapp exec vitest run 'src/app/api/doctor/patients/[userId]/patientCardNeverGated.route.test.ts' 'src/app/app/doctor/patients/loadDoctorPatientCardPageBootstrap.workspaceProjection.unit.test.ts' 'src/app/app/doctor/workspaceRouteProjection.unit.test.ts' 'src/app/app/doctor/patients/[userId]/tabs/PatientTabKarta.ui.test.tsx'
```

Result: **PASS — 4 files, 28 tests**.

Fresh candidate evidence was reused rather than rerun: webapp typecheck, scoped ESLint, patient-card route,
encounter UI, tab registry, DB chokepoint, no-new-raw-SQL and diff-check were recorded on the candidate commit.

### Named fault injections

Every mutation below was temporary and reverted before live acceptance:

1. **FI-A — API shared guard fail-open:** `requireWorkspaceModuleForApi` forced to allow access. The encounter
   API independence test failed: history GET returned 200 instead of 403.
2. **FI-B — direct page guard bypass:** the new-encounter page guard was forced true. The direct-page denial test
   failed before dependencies were available instead of producing `NEXT_NOT_FOUND`.
3. **FI-C — hidden encounter preload:** Overview's `encountersEnabled` was forced true. The bootstrap test failed
   because visits loaded while encounters were OFF.
4. **FI-D — cross-wired module flags:** encounter loading was keyed to `medical_record`. Two of the four matrix
   rows failed, proving the switches are independently exercised.
5. **FI-E — booking coupled to encounters:** appointment loading was conditioned on encounters. The bootstrap
   test failed because appointments were not loaded while encounters were OFF.

Result: **PASS — each named fault produced its intended red signal; all production mutations were reverted.**

### Direct architecture and preservation inspection

- API routes and direct pages use the shared `resolveWorkspaceModulesForApi` / `requireWorkspaceModuleForApi`
  path, which delegates to the canonical `resolveWorkspaceModuleEffective`; no second enablement formula was
  found in the candidate diff.
- Candidate changes contain no encounter-history delete/update path and no workspace-preference write on OFF.
  OFF is a projection/guard change, not a data mutation.
- Appointment listing remains unconditional; only encounter-derived projection is suppressed while OFF.

### Isolated desktop/mobile live acceptance

Run on `127.0.0.1:5210` against named DEV data with normal specialist login. Patient used:
`0b7fadbd-25b8-4dba-a871-3c36b6c5537e`.

| Medical record | Encounters | Karte tab | History/start CTA | Appointments | Desktop 1440×900 | Mobile 390×844 |
| --- | --- | --- | --- | --- | --- | --- |
| ON | ON | present | present | present | PASS, no horizontal overflow | matrix behavior covered live on desktop |
| ON | OFF | present | absent | present | PASS, no horizontal overflow | PASS, no horizontal overflow |
| OFF | OFF | absent | absent | present | PASS, no horizontal overflow | PASS, no horizontal overflow |
| OFF | ON | present | present | present | PASS, no horizontal overflow | PASS, no horizontal overflow |

The full visible history for the selected patient was captured before OFF transitions and matched exactly after
re-enabling encounters, including the 2026-09-06 `AUDIT-OFF-Филиал` entry. Original
DEV settings were `medical_record=ON`, `encounters=ON`; the same values were verified after cleanup. The isolated
server was stopped and its temporary `.env.dev` symlink removed.

### Authority recovery note

The referenced `runs/c3m-encounters-audit-brief-20260907.md` was not present after stash restoration. Absence was
checked by its exact path, by
`find /home/dev/dev-projects /home/dev/brain/runs -name c3m-encounters-audit-brief-20260907.md`, by lexical
`code-search` for C3M-07b/encounters, by the roadmap back-reference, and by `taskdb find bcb` for `C3M-07b` and
`encounters`. The restored pre-inspection kill-set and the continuation brief supplied to this auditor were used
without expanding scope.

## Verdict

**PASS.** Candidate `ba3152029b5106a46d7179a4940ce53e319b1687` satisfies C3M-07b. No product defect or
owner question remains from this audit pass. No product fix was written.
