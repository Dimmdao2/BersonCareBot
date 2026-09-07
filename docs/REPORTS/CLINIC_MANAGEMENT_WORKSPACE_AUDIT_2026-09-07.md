# Clinic management workspace audit — 2026-09-07

**Result: FAIL.** The candidate is not land-ready. It incorrectly sends two required clinic-composition states to solo and leaves two management navigation entries pointing to a Schedule Setup tab that clinic composition removes.

## Audited revisions

- Base: `f47da12d66c2c4249f001793ccc41b866e0bc5c7`
- Product commit: `457f745430486a6dfca8bd237d5f5168e23649fb`
- Candidate checkout: `487d39892a1da16f7b658d8b5763109feb980fd9` (product commit plus the subsequent `feat/doctor-ui-rebuild` merge)

## Blind fault table

| Authority / fault | Method | Evidence | Result |
| --- | --- | --- | --- |
| M1 §3.1: team entitlement must make the workspace `clinic`, and configured effective limit greater than one must do the same | unit acceptance test | `composition.unit.test.ts`: entitlement + one seat returns `solo`; no entitlement + limit 3 returns `solo` | FAIL |
| M2 / DoD: a bound clinic admin cannot widen `/app/doctor/**` to clinic or another specialist; management is the only widening surface | unit + route behavior tests | `_resolveDoctorScheduleScope.unit.test.ts` and `_doctorScheduleScope.route.test.ts`: 8 passing assertions | PASS |
| M3/M4 / DoD: management owns clinic catalog and online-booking writers; Schedule has no active clinic Setup UI | one-time source view | `managementNav.ts:10-11` links both entries to `schedule?tab=setup`; `DoctorScheduleShell.tsx:152,254,278` normalizes/hides that tab whenever `showPackagesTab=false`, which `schedule/page.tsx:131-133` sets for clinic | FAIL |
| M5 remains owner-blocked; no unlicensed resource calendar or substitute is introduced | candidate diff view | `git diff --name-only f47da12..457f745` contains no package/lockfile change and no management appointment surface | PASS (blocked as planned) |
| M1 migration/privilege seam | one-time migration/declaration view | timestamp migration has owner/verify markers and no `GRANT`/`REVOKE`; declaration includes both columns in both read seams and the staff `UPDATE` surface | PASS (static audit) |
| M6 timezone/UI isolation | candidate diff view | `DoctorTimezoneSelect.tsx` changes only doctor-control geometry; no second picker/data path or patient/doctor cross-import was added | PASS |

## Fault injection record

The first interrupted pass temporarily broadened `_resolveDoctorScheduleScope.ts`, then ran:

```bash
pnpm --dir apps/webapp exec vitest run --project unit --project route \
  src/app/api/doctor/booking-engine/_resolveDoctorScheduleScope.unit.test.ts \
  src/app/api/doctor/booking-engine/_doctorScheduleScope.route.test.ts
```

The saved raw run `/home/dev/brain/runs/codex-raw/2026-09-07T15-00-01-809Z-clinic-management-workspace-audit-20260907.jsonl` records three red assertions: bound clinic-admin doctor scope, management-only doctor denial, and the route-level calendar scope. The temporary production edit was restored. These are the only green acceptance tests retained. Other green tests from the saved stash lacked a completed raw fault-injection proof and were removed rather than retained as false protection.

The composition acceptance test is intentionally red on the candidate; its command and exact failing values are below.

## Commands and results

```bash
pnpm --dir apps/webapp typecheck
```

PASS (`tsc --noEmit`, run in this continuation).

```bash
pnpm --dir apps/webapp exec prettier --check \
  src/modules/doctor-workspace/composition.unit.test.ts \
  src/app/api/doctor/booking-engine/_resolveDoctorScheduleScope.unit.test.ts \
  src/app/api/doctor/booking-engine/_doctorScheduleScope.route.test.ts
```

PASS.

```bash
pnpm --dir apps/webapp exec vitest run --project unit --project route \
  src/modules/doctor-workspace/composition.unit.test.ts \
  src/app/api/doctor/booking-engine/_resolveDoctorScheduleScope.unit.test.ts \
  src/app/api/doctor/booking-engine/_doctorScheduleScope.route.test.ts
```

Expected FAIL: 2 files / 8 tests pass; `composition.unit.test.ts` fails because the observed vector is `[solo, solo, clinic, solo, clinic, solo]`, not `[clinic, clinic, clinic, solo, clinic, solo]`.

```bash
git diff --check
```

PASS before this artifact was added.

No full CI or live UI was run: this is a local audit surface, and the owner explicitly prohibited agent visual walkthrough before acceptance.

## Reachable findings

1. **MUST FIX — clinic composition rejects valid management states.**
   A clinic with `clinic_team` entitlement and one configured seat, or with a configured effective limit of three while entitlement is unavailable, resolves as `solo` in `resolveDoctorWorkspaceComposition`. The owner’s §3.1 requires either condition to resolve `clinic`; affected owners lose management mode and Team/management entry. Authority: `CLINIC_MANAGEMENT_WORKSPACE_2026-09-07.md` §3.1 and M1.

2. **MUST FIX — clinic management Catalog and Online booking are dead links.**
   `/app/manage` routes these entries to `tab=setup`, while clinic composition removes and normalizes that tab to calendar. A clinic manager therefore cannot reach the existing branch/service or public-form writers through management mode. Authority: the plan §3.3, M3/M4, and DoD “one writer path in management mode”.

## Interruption note

The first pass was interrupted by the system limit, not completed: `/home/dev/brain/runs/run-state/by-run-id/clinic-management-workspace-audit-20260907.json` records `phase: blocked_system` and `result: failed` at `2026-09-07T15:00:01.809Z`. Its saved changes were reapplied for this continuation; stash backups remain intact.
