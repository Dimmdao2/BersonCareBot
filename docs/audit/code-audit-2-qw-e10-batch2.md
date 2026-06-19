# Code Audit 2 — QW-E10/batch2 (re-audit)
agentId: audit2-qw-e10-batch2
Commit: 34415dff
Date: 2026-06-19

## D1 — fetchSoloOverview — FAIL

**Raw fetch gone:** Yes — `bookingSoloAdminApi.ts` has no `await fetch(` call in `fetchSoloOverview`.

**apiJson import:** Correct — `import { apiJson } from "@/shared/lib/apiJson"` at line 1.

**booking_engine_unavailable → null:** Correct — catch checks `e instanceof Error && e.message === "booking_engine_unavailable"` → returns `null`; other errors are rethrown.

**TypeScript — FAIL:** `apiJson` has a generic constraint `T extends { ok?: boolean; error?: string; message?: string }`. `SoloOverview` has none of these optional properties, so `apiJson<SoloOverview>(...)` violates the constraint.

```
src/app/app/settings/bookingSoloAdminApi.ts(50,26): error TS2559:
  Type 'SoloOverview' has no properties in common with type
  '{ ok?: boolean | undefined; error?: string | undefined; message?: string | undefined; }'.
```

**Caller null-safety:** Structurally intact — `fetchSoloOverview` still returns `Promise<SoloOverview | null>` and callers (e.g., `ensureDefaultSpecialist`) guard on `if (!overview)`. However the TS error blocks compilation.

**Fix needed:** Cast the return type or use `apiJson` without a type parameter and assert the type separately, e.g.:

```ts
return await apiJson(`${BASE}/overview`) as unknown as SoloOverview;
```

Or relax the `apiJson` constraint if architecturally appropriate.

## D2 — patchAdminSetting/Batch — PASS

**Raw fetch gone:** Yes — `patchAdminSetting.ts` has no `await fetch(` call.

**apiJson import:** Correct — `import { apiJson } from "@/shared/lib/apiJson"` at line 1.

**patchAdminSetting returns boolean:** Correct — returns `true` on success, `false` in catch. `apiJson<{ ok: boolean }>` satisfies the constraint.

**patchAdminSettingsBatch return shape:** Correct — returns `{ ok: true }` on success; returns `{ ok: false, error: e.message }` in catch. Note: `atIndex` and `key` are no longer populated on error (acceptable per audit spec — they were implementation-level fields available only when inspecting individual items in the old raw-fetch path).

**Catch blocks not silent:** Confirmed — callers surface the boolean/result to UI. Example: `VideoSystemSettingsSection.tsx` lines 62 and 84 both check `if (!ok)` and call `setPatchError(...)` to show a user-visible error message.

## A2 — raw fetch grep — PASS

```
grep -n "await fetch(" bookingSoloAdminApi.ts  → 0 matches
grep -n "await fetch(" patchAdminSetting.ts    → 0 matches
```

## A3 — tsc — FAIL

```
src/app/app/settings/bookingSoloAdminApi.ts(50,26): error TS2559:
  Type 'SoloOverview' has no properties in common with type
  '{ ok?: boolean | undefined; error?: string | undefined; message?: string | undefined; }'.
```

Root cause: `apiJson<T>` generic constraint requires `T` to have at least one of `{ ok?, error?, message? }`. `SoloOverview` has none. Only one TS error total; all other in-scope files compile cleanly.

## Overall: FAIL

**Blocking defect:** D1/A3 — `apiJson<SoloOverview>` violates the generic constraint causing a TS compilation error. D2 is fully correct.

**Required fix:** Change line 50 of `bookingSoloAdminApi.ts` from:
```ts
return await apiJson<SoloOverview>(`${BASE}/overview`);
```
to either:
```ts
return await apiJson(`${BASE}/overview`) as unknown as SoloOverview;
```
or add `{ ok?: boolean }` (or similar) to `SoloOverview` if the API actually returns it (note: the existing check `body.ok === false` in apiJson means the overview endpoint must NOT return `ok: false` on success — adding an optional `ok?: true` to the type would be safe and self-documenting).
