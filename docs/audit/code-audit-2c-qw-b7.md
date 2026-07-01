# Code Audit 2c — QW-B7 (final pass)

- **Item:** QW-B7 — doctor warmup-schedule PATCH: typed fallback for null `scheduleData`
- **Auditor:** audit2c-qw-b7
- **Branch:** `auto/qw-b7` (3 commits atop `feat/doctor-ui-rebuild`)
- **Final commit:** `de471ba2`
- **File:** `apps/webapp/src/app/api/doctor/clients/[userId]/warmup-schedule/route.ts`
- **Verdict:** **PASS**

## Clause results

### D1 — TS type correctness of the spread — PASS
Final PATCH code (verified via `git show auto/qw-b7:…route.ts`):
```ts
scheduleData: {
  ...(warmupRule.scheduleData ?? DEFAULT_WARMUP_PWA_PUSH_ONBOARDING_SLOTS),
  timesLocal: parsed.data.timesLocal,
  dayFilter: parsed.data.dayFilter ?? warmupRule.scheduleData?.dayFilter ?? DEFAULT_WARMUP_PWA_PUSH_ONBOARDING_SLOTS.dayFilter,
},
```
- `warmupRule.scheduleData` is `SlotsV1ScheduleData | null` (types.ts:42).
- `DEFAULT_WARMUP_PWA_PUSH_ONBOARDING_SLOTS` is `SlotsV1ScheduleData` (scheduleSlots.ts:22).
- `warmupRule.scheduleData ?? DEFAULT_…` narrows to `SlotsV1ScheduleData` (non-null). ✓
- Spread yields `timesLocal`, `dayFilter` + optional `daysMask`/`everyNDays`/`anchorDate`.
- `timesLocal` overridden with `parsed.data.timesLocal: string[]`. ✓
- `dayFilter`: `(ReminderDayFilter | undefined) ?? (ReminderDayFilter | undefined) ?? ReminderDayFilter` → final fallback `DEFAULT.dayFilter` is concrete `"weekdays"`, so result is `ReminderDayFilter`, never `undefined`. ✓ (Override appears AFTER the spread in the literal, so it correctly wins.)
- Result has both required fields (`timesLocal`, `dayFilter`) → assignable to `SlotsV1ScheduleData`. **TRUE.**

`UpdateRuleData['schedule'].scheduleData` is typed `SlotsV1ScheduleData | null | undefined` (service.ts:70). A `SlotsV1ScheduleData` is assignable. ✓
Sibling schedule fields also typecheck: `intervalMinutes` expects `number`, code supplies `warmupRule.intervalMinutes ?? 60` (rule field `number | null` → `number`); `daysMask` expects `string`, rule field is `string`. ✓

### D2 — Import added — PASS
Line 11: `import { DEFAULT_WARMUP_PWA_PUSH_ONBOARDING_SLOTS } from "@/modules/reminders/scheduleSlots";` — correct symbol, correct path.

### D3 — Runtime behavior when scheduleData is null — PASS
Null `scheduleData` spreads the default `{ timesLocal: ["11:00","14:00","17:00"], dayFilter: "weekdays" }`, then `timesLocal` is overridden by the request and `dayFilter` resolves to `"weekdays"`. A previously-null rule receives a valid, complete `SlotsV1ScheduleData`. Safe.

### D4 — normalizeSlotsV1ScheduleData accepts the result — PASS
The constructed object always sets `dayFilter`. For `dayFilter === "weekly_mask"`, `daysMask` is preserved from the existing `scheduleData` via the spread; a doctor PATCHing only `timesLocal` keeps the existing `dayFilter` ("weekly_mask") and existing `daysMask`. `normalizeSlotsV1ScheduleData` (scheduleSlots.ts:44) validates `daysMask` (`/^[01]{7}$/`) for weekly_mask and `everyNDays`/`anchorDate` for every_n_days — both carried through the spread. Correct.

### D5 — TS compile (manual analysis) — PASS
- `updateRule` `schedule.scheduleData` field accepts `SlotsV1ScheduleData | null` (service.ts:70).
- Constructed object is `SlotsV1ScheduleData` (required fields present, correct member types).
- No excess-property risk: object-literal excess-property checks would only fire on *extra* keys; the literal's keys (`timesLocal`, `dayFilter`) are members of `SlotsV1ScheduleData`, and spread-introduced keys (`daysMask` etc.) are all declared optional members. No indexing failure.
- Downstream: service.ts:226-237 — `scheduleType: "slots_v1"` path requires non-null `scheduleData` (guard `if (!raw)` at line 228), which the constructed object always satisfies, then runs `normalizeSlotsV1ScheduleData(raw)` and persists `norm.data`.

## Overall
All clauses D1–D5 pass. The earlier TS error (`?? {}` producing a non-`SlotsV1ScheduleData` fallback with a possibly-`undefined` `dayFilter`) is fully resolved by the typed `DEFAULT_WARMUP_PWA_PUSH_ONBOARDING_SLOTS` fallback. No source modified.

**VERDICT: PASS**
