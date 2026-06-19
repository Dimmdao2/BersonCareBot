# Code Audit 2b — QW-B7
agentId: audit2b-qw-b7
Commit: 65d0b70cf00cb761d364cb6108166362ad8b0bd4
Date: 2026-06-19
Re-audit after B1 fix (commits b3764d2e+de471ba2+65d0b70c)

## Clause B1 — PATCH scheduleData roundtrip — PASS

Verified against `apps/webapp/src/app/api/doctor/clients/[userId]/warmup-schedule/route.ts`
and `apps/webapp/src/app/app/doctor/clients/DoctorClientWarmupSchedulePanel.tsx`.

- `patchSchema` now accepts the full field set, not just `timesLocal`+`dayFilter`:
  ```
  daysMask: z.string().regex(/^[01]{7}$/).optional(),
  everyNDays: z.number().int().min(1).optional(),
  anchorDate: z.string().optional(),
  ```
- PATCH no longer rebuilds `scheduleData` from scratch. It merges over the existing rule's
  data (or onboarding defaults if the rule pre-dates slots_v1):
  ```
  const existingBase = warmupRule.scheduleData ?? DEFAULT_WARMUP_PWA_PUSH_ONBOARDING_SLOTS;
  const scheduleData = {
    ...existingBase,
    ...parsed.data,
    dayFilter: parsed.data.dayFilter ?? existingBase.dayFilter,
  };
  ```
  So `daysMask`/`everyNDays`/`anchorDate` are preserved when the doctor does not change
  them, and any field the panel does send overrides correctly.
- Panel sends `daysMask` only when relevant, via spread:
  ```
  const body: Record<string, unknown> = {
    timesLocal: times,
    dayFilter,
    ...(dayFilter === "weekly_mask" ? { daysMask } : {}),
  };
  ```
- Panel no longer hardcodes `dayFilter: "weekdays"`. It sends the current `dayFilter` state,
  which is initialized from the loaded rule in `load()`.
- GET returns all stored fields (`timesLocal`, `dayFilter`, and conditionally `daysMask`,
  `everyNDays`, `anchorDate`), so the round-trip is non-lossy.

Edge note (not a defect): when switching from `weekly_mask` back to `weekdays`, the panel
omits `daysMask`, leaving a stale `daysMask` in the merged object — but
`normalizeSlotsV1ScheduleData` (service layer) only retains `daysMask` for `weekly_mask`,
so the stale value is stripped before persistence. No corruption.

## Clause B2 — patchSchema dayFilter enum — PASS

`patchSchema.dayFilter` is `z.enum(["weekdays", "weekly_mask", "every_n_days"]).optional()`.
This exactly matches `ReminderDayFilter = "weekdays" | "weekly_mask" | "every_n_days"`
defined in `apps/webapp/src/modules/reminders/scheduleSlots.ts`.

## Clause B3 — GET field availability — PASS

`ReminderRule.scheduleData` is typed `SlotsV1ScheduleData | null`
(`apps/webapp/src/modules/reminders/types.ts:42`), so all fields are accessible.
GET conditionally spreads each optional field and supplies a `"weekdays"` fallback for
`dayFilter` only when the stored value is nullish. Response is non-lossy.
`npx tsc --noEmit` produces no error for this file.

## Clause B4 — Default change regression — PASS

`ReminderCreateDialog.tsx:117`:
`const [scheduleMode, setScheduleMode] = useState<"interval_window" | "slots_v1">("slots_v1");`
Default is `slots_v1`. The reset path (line 168 `setScheduleMode("slots_v1")`) and the
edit path (line 135-136, derives mode from `existingRule.scheduleType`) are consistent.
No regression introduced.

## Clause B5 — Panel React state — PASS

`load` is `useCallback(async () => {...}, [userId])`; its body references only `userId`
plus stable state setters, so the dep array is complete. `useEffect(() => { void load(); },
[load])` re-runs `load` whenever it changes. `onSave` calls `await load()` after a
successful PATCH, so the panel re-reads persisted state after save.

## Clause B6 — updateRule ownership — PASS

PATCH derives `userId` from the route path param (the patient the doctor selected), not
from the request body. Access is gated by `canAccessDoctor(session.user.role)`.
`updateRule(platformUserId, ruleId, data)` in `service.ts:180` scopes by
`listByPlatformUserWithObjects(platformUserId)` and requires the target rule to belong to
that user (`not_found` otherwise) — so the body cannot redirect the write to another user's
rule. This matches the documented IDOR posture (per-patient ownership checks across
`/api/doctor/patients|clients/*` are an accepted, SaaS-deferred item, not a QW-B7 regression).

## Overall: PASS

All six clauses pass. The audit2 HARD FAIL on B1 is resolved: PATCH now merge-preserves the
full `scheduleData`, the panel sends `daysMask` for `weekly_mask` and no longer hardcodes
`dayFilter: "weekdays"`, and GET is non-lossy. `npx tsc --noEmit` over the worktree yields a
single pre-existing, unrelated error (`../integrator/.../normalizeToUtcInstant.ts` — missing
`luxon` types, an install artifact); no QW-B7 file produces a type error.
