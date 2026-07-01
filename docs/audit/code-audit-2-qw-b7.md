# Code Audit 2 — QW-B7
agentId: audit2-qw-b7
Commit: 062433a8
Date: 2026-06-19

Adversarial re-audit. Audit-1 PASSED all 8 clauses. This audit found a real
data-corruption flaw that audit-1 missed.

## Clause B1 — PATCH scheduleData roundtrip — **FAIL** (HARD)

The warmup reminder rule (`linkedObjectType=content_section`, slug = warmups) is a
`slots_v1` rule whose `scheduleData` may legitimately carry any of three `dayFilter`
shapes plus their dependent fields:

```
SlotsV1ScheduleData = {
  timesLocal: string[];
  dayFilter: "weekdays" | "weekly_mask" | "every_n_days";
  daysMask?: string;     // REQUIRED when dayFilter === "weekly_mask"
  everyNDays?: number;   // REQUIRED when dayFilter === "every_n_days"
  anchorDate?: string;   // REQUIRED when dayFilter === "every_n_days"
}
```

The patient can set the warmup rule to `weekly_mask` or `every_n_days` from the
patient reminders UI — confirmed in
`apps/webapp/src/app/app/patient/reminders/LegacyReminderScheduleDialog.tsx`
(lines 114–121, 238–239) and `ReminderRulesClient.tsx` (lines 60–66), which both
read/write `dayFilter` = `weekly_mask` / `every_n_days` and the `daysMask` companion.

The QW-B7 doctor PATCH route (`warmup-schedule/route.ts`) rebuilds `scheduleData`
from scratch as:

```ts
scheduleData: {
  timesLocal: parsed.data.timesLocal,
  dayFilter: parsed.data.dayFilter ?? "weekdays",
}
```

It does NOT read the existing `warmupRule.scheduleData` to preserve
`daysMask` / `everyNDays` / `anchorDate`. The doctor panel
(`DoctorClientWarmupSchedulePanel.tsx`) only edits the times and always sends
`dayFilter: "weekdays"`. Net effect: **a doctor changing only the reminder TIMES
silently overwrites the patient's day-filter to "weekdays" and drops
`daysMask` / `everyNDays` / `anchorDate`.**

This is not cosmetic. `planDueReminderOccurrences.ts` (the slots_v1 dispatcher,
lines 174–201) reads `data.dayFilter`, `data.daysMask`, and the every-n-days fields
directly out of `scheduleData` to decide which days fire. So a patient who had, e.g.,
warmups on Mon/Wed/Fri (`weekly_mask` "1010100") or every-3-days would, after the
doctor nudges a time, be silently switched to firing every weekday. Real behavior
change, real data loss, no warning. **FAIL.**

Secondary symptom on the read side: GET also returns only `{ timesLocal, dayFilter }`
and drops `daysMask`/`everyNDays`/`anchorDate`, so even the doctor's view of the
schedule is lossy and the panel can never round-trip a non-weekdays rule.

## Clause B2 — patchSchema dayFilter enum vs ReminderDayFilter — PASS
`z.enum(["weekdays","weekly_mask","every_n_days"])` matches `ReminderDayFilter`
exactly (scheduleSlots.ts). No drift. (Note: B1's bug is that the route ignores the
dependent fields, not the enum itself.)

## Clause B3 — GET ReminderRule field availability — PASS (with B1 caveat)
`ReminderRule.scheduleData` exists and is typed `SlotsV1ScheduleData | null`
(types.ts:42). `warmupRule.scheduleData.dayFilter` is non-optional
`ReminderDayFilter`, so the GET `?? "weekdays"` fallback is a dead/tautological
branch (never null) — harmless, compiles. The lossy projection is covered under B1.

## Clause B4 — Default change regression — PASS
ReminderCreateDialog default `interval_window` → `slots_v1` is isolated to the create
dialog's initial state; not implicated in the warmup-schedule panel/route. No
regression found in scope.

## Clause B5 — Panel React state — PASS
`useCallback([userId])` dep array is complete; `load()` is re-run after save
(`await load()`). A `load()` racing an in-flight save is not reachable from the UI
(no concurrent trigger). Acceptable.

## Clause B6 — updateRule ownership — PASS
`updateRule(platformUserId, ruleId, …)` calls
`port.listByPlatformUserWithObjects(platformUserId)` then
`rules.find(r => r.id === ruleId)`, returning `not_found` if the rule isn't owned by
that user (service.ts ~185). Plus the route independently re-derives `warmupRule`
from `listRulesByUser(userId)`. Ownership is enforced. PASS.

## Clause B7 — TS strictness — PASS (assumed)
Per audit-1, `tsc --noEmit` exits 0; types in the route line up
(`UpdateRuleData.schedule.scheduleData?: SlotsV1ScheduleData | null`). The B1 defect
is a runtime/logic data-loss bug, NOT a type error, so it passes the compiler while
still being wrong.

## OVERALL: FAIL

Root cause: the PATCH route treats `scheduleData` as write-only-from-times and
discards the existing day-filter configuration (`dayFilter` + `daysMask` /
`everyNDays` / `anchorDate`). Fix: load `warmupRule.scheduleData` and merge —
preserve the existing `dayFilter` and its dependent fields when the request omits
them (the panel always omits them), only overriding `timesLocal` (and `dayFilter`
when the client explicitly sends one). GET should likewise return the full
`scheduleData` so the round-trip is lossless.
