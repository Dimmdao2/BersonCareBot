# Code Audit 2b — QW-B7 (re-audit after fix)
agentId: audit2b-qw-b7
Commits: 062433a8 (pre-fix), b3764d2e (fix)
Date: 2026-06-19

File under audit:
`apps/webapp/src/app/api/doctor/clients/[userId]/warmup-schedule/route.ts`

## C1 — GET: scheduleData returned in full
**PASS**

The lossy projection was removed. GET now returns:
```ts
scheduleData: warmupRule.scheduleData ?? null,
```
`warmupRule.scheduleData` is typed `SlotsV1ScheduleData | null` (`modules/reminders/types.ts:42`),
so `dayFilter`, `daysMask`, `everyNDays`, `anchorDate` are all preserved verbatim. No projection,
no `?? "weekdays"` clobber. Correct.

## C2 — PATCH: dayFilter preservation (data semantics)
**PASS (logic), but see C4**

```ts
scheduleData: {
  ...(warmupRule.scheduleData ?? {}),
  timesLocal: parsed.data.timesLocal,
  ...(parsed.data.dayFilter !== undefined && { dayFilter: parsed.data.dayFilter }),
},
```
Runtime behaviour is correct:
- existing `dayFilter` / `daysMask` / `everyNDays` / `anchorDate` survive the spread;
- `timesLocal` is always overwritten with the request value;
- `dayFilter` is overridden ONLY when explicitly present in the request body
  (`parsed.data.dayFilter !== undefined`).
So a "times-only" PATCH on a `weekly_mask` or `every_n_days` rule no longer downgrades it to
`weekdays`. The original FAIL (always forcing `dayFilter: "weekdays"`) is fixed in terms of data flow.

## C3 — Edge case: warmupRule.scheduleData is null
**Latent risk (masked by C4)**

If `warmupRule.scheduleData === null` (legacy rule pre-slots_v1) AND the request omits `dayFilter`,
the produced object is `{ timesLocal: [...] }` with NO `dayFilter`.

`normalizeSlotsV1ScheduleData` (`modules/reminders/scheduleSlots.ts`) does NOT reject a
missing/`undefined` `dayFilter` — it only branches on `dayFilter === "weekly_mask"` and
`=== "every_n_days"`. A `dayFilter: undefined` passes through `{ ...data, timesLocal: sorted }`
unchanged, so an invalid `scheduleData` (no `dayFilter`) would be persisted. The normalizer is NOT
a backstop here. This is a real data-integrity gap, though it is currently unreachable because the
build fails first (C4). It would also become reachable if C4 were "fixed" by loosening the type.

## C4 — TypeScript: spread type correctness
**FAIL — the fix does not compile under `strict`**

`warmupRule.scheduleData` is `SlotsV1ScheduleData | null`; `SlotsV1ScheduleData.dayFilter` is
**required**. The spread `...(warmupRule.scheduleData ?? {})` widens to include the `{}` branch, and
`...(cond && { dayFilter })` makes `dayFilter` conditional, so TS infers the literal's `dayFilter` as
`ReminderDayFilter | undefined`. Assigning that to `schedule.scheduleData?: SlotsV1ScheduleData | null`
(`modules/reminders/service.ts:70`) is a type error.

Reproduced with the repo's own `tsc` (`node_modules/.bin/tsc --strict`), using the exact nested
contextual typing of the real call site:

```
error TS2322: Type '{ dayFilter?: ReminderDayFilter | undefined; timesLocal: string[]; ... }'
  is not assignable to type 'SlotsV1ScheduleData'.
    Types of property 'dayFilter' are incompatible.
      Type 'ReminderDayFilter | undefined' is not assignable to type 'ReminderDayFilter'.
```

`tsconfig.json` has `"strict": true` and there is no `typescript.ignoreBuildErrors` in
`next.config`, so this breaks `tsc` / the production build. Audit-1's "tsc exits 0" was run on
`062433a8`, which is the **pre-fix** ancestor (confirmed `git merge-base --is-ancestor`) and does NOT
contain the spread — that green check does not cover the fix commit `b3764d2e`.

Suggested corrected form (preserves the intent and compiles):
```ts
scheduleData: {
  ...(warmupRule.scheduleData ?? DEFAULT_WARMUP_PWA_PUSH_ONBOARDING_SLOTS),
  timesLocal: parsed.data.timesLocal,
  ...(parsed.data.dayFilter !== undefined ? { dayFilter: parsed.data.dayFilter } : {}),
},
```
Falling back to a concrete `SlotsV1ScheduleData` default (which has a real `dayFilter`) instead of
`{}` both satisfies the type checker and closes the C3 null-data gap in one move.

## OVERALL: FAIL

The original data-semantics bug (forced `dayFilter: "weekdays"`) is genuinely fixed (C1, C2 PASS).
However, the fix as committed in `b3764d2e` introduces a `strict`-mode TS2322 compile error (C4) at
the PATCH call site, which fails the build; and it leaves a latent invalid-`scheduleData` path when
`scheduleData` is null (C3). Both stem from spreading `(... ?? {})` instead of a concrete
`SlotsV1ScheduleData` default. Re-fix required.
