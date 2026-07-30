# MISSION: slice A, correction round 2 — the enumeration is still incomplete, and the hardest case is "a read that writes"

This is the escalated pass with wider freedom: the previous two rounds each closed real paths and each time the audit
found more. Treat the **class** of defect, not the individual lines, and do it once for all three mechanics.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a` — items 5.1, 5.2, 5.9; scope §1; policy §2.
- **Verdict you are fixing:** `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_REAUDIT_RESULT.md` — every MUST FIX and
  the completeness diff table.
- **Your previous enumeration:** `docs/_TODO/runs/tariff-mechanics/STAGE5_SLICE_A_CORRECTION_RESULT.md`.
- **Canon:** `QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §5.1 (block creating and changing; never block reading), §5.6
  (a refusal is always visible), §7 (wording), §8.

## The hard part — a read path that writes

Opening the diary calls `ensure*` upserts (`loadPatientDiaryWeekWellbeing.ts:115`, reached from
`PatientDiaryAuthenticatedMain.tsx:45`); `GET /api/patient/mood/today`, `GET /api/patient/mood/week` and the patient
home call writing `getCheckinState` / sparkline helpers (`wellbeingMoodService.ts:119`, `PatientHomeToday.tsx:280`). So a
patient merely opening a page creates `general_wellbeing` or `warmup_feeling` rows even with the mechanic off.

**Both naive answers are wrong.** Gating the read breaks canon §5.1 and hides content already assigned to a patient.
Leaving it as is means the toggle does not hold. The fix is to make those helpers **not create** when the mechanic is
off: return the read-only view of what exists, create nothing. Apply the same shape everywhere a read path lazily
materialises a row for these three mechanics — that is one decision, not five patches.

## The rest of the verdict

- **Doctor PATCH on a patient's LFK diary row** (`.../lfk-complex-exercises/[exerciseRowId]/route.ts:11`) has no
  entitlement check. This is a diary object, not an LFK template — guard it. Do not touch LFK templates.
- **Diary purge** (`POST /api/patient/diary/purge`) deletes all diary data with no check. Existing data must stay
  changeable only in the ways canon allows: reading and exporting always, and deleting is allowed — but an irreversible
  mass purge while the mechanic is off is a mutation of state that the toggle is supposed to freeze. Decide and state
  your reading in the report: either guard it like other mutations, or argue from the canon why deletion must stay open.
  A wrong silent choice here is worse than asking.
- **Interface entries that are still visible** for a disabled mechanic, and **new CMS refusals that are swallowed** —
  close them the same way as the five earlier ones: surface the backend message, name the action, invent no numbers.
- Re-check every exemption you rely on. A wrong exemption makes the coverage run green over an open door.

## How to enumerate this time — mechanically, not by memory

For each of the three mechanics: start from the tables its data lives in, find every repository method that writes them,
then find every caller of those methods (API routes, server actions, integrator entry points, the shared settings
endpoint, CMS actions, page-level loaders). List them all, then say guarded / not-needed / left-open with a reason. The
next audit will diff its own list against yours, so an honest gap costs less than a missed one.

## Constraints

- Never gate reading. Never delete or hide existing data.
- Do not touch: the registry key list, migration `0275`, the seat chokepoint, the file write port, billing, the support
  system, the patient card, the patient app, treatment-program and LFK templates.
- Targeted runs only (`typecheck`, `lint`, affected tests). **No full CI.** Never `git add -A`. Commit in this clone; no
  push, no merge. Do not edit the plan file — the lead owns it.
- Every fix needs a test that goes red when the fix is removed. Prove at least the three most important ones by hand and
  report what you saw.

## Report

The full enumeration table (mechanic → write path → guarded/not-needed/open + reason), then per fix
`what changed (file:line) → what the user sees → test → what you saw when you re-broke it`. State plainly anything you
chose not to close and why.
