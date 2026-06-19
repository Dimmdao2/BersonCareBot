# Code Audit 1 — QW-B7
agentId: audit1-qw-b7
Commit: 062433a8
Date: 2026-06-19

## Clause A1 — ReminderCreateDialog default
PASS

- `useState<"interval_window" | "slots_v1">("slots_v1")` at line 117 — default is `"slots_v1"`. Correct.
- The `else` branch (new-reminder path, line 168) unconditionally calls `setScheduleMode("slots_v1")` before branching on `linkedObjectType` for slot content. Not gated on `linkedObjectType`.
- `slotTimeRows` initial state (line 118) uses `[...DEFAULT_REHAB_DAILY_SLOTS.timesLocal]` as a lazy init — this is fine for the initial render; the `useEffect` resets it to `[DEFAULT_REMINDER_FORM_FIRST_SLOT_TIME]` for non-rehab new reminders (line 178) and `[...DEFAULT_REHAB_DAILY_SLOTS.timesLocal]` for rehab (line 174).

## Clause A2 — Route auth: GET/PATCH correctly gated
PASS

Both GET and PATCH:
- Call `getCurrentSession()` → 401 `{ ok: false, error: "unauthorized" }` if null.
- Call `canAccessDoctor(session.user.role)` → 403 `{ ok: false, error: "forbidden" }` if false.
- Validate `userId` with `z.string().uuid().safeParse(userId).success` → 400 `{ ok: false, error: "invalid_user" }` if invalid.
All three gates are present and in the correct order in both handlers.

## Clause A3 — PATCH: updateRule payload is type-correct
PASS

The `schedule` object passed to `updateRule`:
- `scheduleType: "slots_v1"` — correct.
- `scheduleData: { timesLocal: parsed.data.timesLocal, dayFilter: parsed.data.dayFilter ?? "weekdays" }` — correct shape.
- `intervalMinutes: warmupRule.intervalMinutes ?? 60` — correctly handles the `number | null` field from `ReminderRule` with a `?? 60` fallback before passing to the `schedule` field which requires `number`.
- Preserves `windowStartMinute`, `windowEndMinute`, `daysMask` from the existing rule.
- `dayFilter` values come from `z.enum(["weekdays", "weekly_mask", "every_n_days"])` which exactly matches `ReminderDayFilter`.

## Clause A4 — Route: no raw DB access, uses service layer
PASS

Both GET and PATCH build deps via `buildAppDeps()` and only call:
- `deps.reminders.listRulesByUser(userId)`
- `deps.reminders.updateRule(userId, warmupRule.id, {...})`
No drizzle/SQL calls, no direct DB imports.

## Clause A5 — isWarmupsContentSectionReminderRule usage
PASS

Both GET (line 38) and PATCH (line 85) call:
```
isWarmupsContentSectionReminderRule(r, DEFAULT_WARMUPS_SECTION_SLUG)
```
`DEFAULT_WARMUPS_SECTION_SLUG` is imported from `@/modules/patient-home/warmupsSection` (value: `"warmups"`). The function signature is `(rule, warmupsSectionSlug: string)` — arguments match correctly.

## Clause A6 — Panel: no hardcoded sensitive data, correct API URL
PASS

- API URL: `/api/doctor/clients/${encodeURIComponent(userId)}/warmup-schedule` — correct path, `encodeURIComponent` present.
- Add button: `disabled={times.length >= 10}` — enforces max 10 slots.
- Remove button: `disabled={times.length <= 1}` — enforces min 1 slot.
- `addSlot()` has a `if (times.length >= 10) return;` guard as well.
- `removeSlot()` has a `if (times.length <= 1) return;` guard as well.
- No hardcoded credentials, secrets, or admin-only paths.

## Clause A7 — DoctorClientOverviewTab: panel wired correctly
PASS

- `DoctorClientWarmupSchedulePanel` is imported from `"./DoctorClientWarmupSchedulePanel"`.
- Rendered as `<DoctorClientWarmupSchedulePanel userId={userId} />` — `userId` is a string prop matching `Props = { userId: string }`.
- No type mismatch.

## Clause A8 — TypeScript: 0 errors
PASS

`pnpm --filter @bersoncare/webapp exec tsc --noEmit` exited with code 0 (no output, no errors).

## OVERALL: PASS
