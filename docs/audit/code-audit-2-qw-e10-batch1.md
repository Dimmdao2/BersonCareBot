# Code Audit 2 — QW-E10/batch1
agentId: audit2-qw-e10-batch1
Commit: a133048da297d3233a973aace1964d4ff00ef0e6
Date: 2026-06-19

## Clause A1 — All 14 components use apiJson — FAIL

Tabulated apiJson-import / apiJson-call / raw-fetch / `res.ok|json.ok` checks across all 14 files:

| Component | apiJson import | apiJson calls | raw fetch | res.ok/json.ok checks | verdict |
|---|---|---|---|---|---|
| AppointmentReminderSettingsSection | yes | 1 | 0 | 0 | OK |
| BookingCatalogPackagesSection | yes | 3 | 0 | 0 | OK |
| BookingCatalogProductsSection | yes | 3 | 0 | 0 | OK |
| BookingEventNotificationsSection | yes | 1 | 0 | 0 | OK |
| BookingFormFieldsSection | yes | 2 | 0 | 0 | OK |
| BookingManualLifecycleSection | yes | 3 | 0 | 0 | OK |
| BookingPrepaymentSection | yes | 3 | 0 | 0 | OK |
| BookingWorkingHoursSection | yes | 4 | 0 | 0 | OK |
| BookingPatientProductsSection | yes | 3 | 0 | 0 | OK |
| BookingPoliciesSection | yes | 5 | 0 | 0 | OK |
| **BookingMergeCandidatesSection** | **no** | **0** | **2** | **2** | **NOT CONVERTED** |
| **BookingPatientPackagesSection** | **no** | **0** | **3** | **3** | **NOT CONVERTED** |
| **BookingPublicWidgetSection** | **no** | **0** | **2** | **1** | **NOT CONVERTED** |
| **BookingScheduleBlocksSection** | yes | 3 | **1** | 0 | **PARTIAL — 1 raw fetch left** |

10 of 14 are fully converted. Four fail the clause:

1. **BookingMergeCandidatesSection.tsx** — still raw `fetch` in both `load()` (lines 21-35: `const res = await fetch(BASE…)`, then `if (!res.ok || !json.ok)`) and `dismiss()` (line 51: `const res = await fetch(...); if (res.ok) {...}`). The a3d26fa7 diff only wrapped `dismiss()` in a try/catch around the SAME raw fetch — it did not convert to apiJson. The implementer's own commit message admits this: "add network-error guards to 4 of the 6 'possibly needing fix' files" — i.e. a try/catch wrapper, not apiJson.

2. **BookingPatientPackagesSection.tsx** — three raw `fetch` calls (lines 106, 144, 179), each followed by manual `if (!json.ok) setError(json.error ?? "failed")` (lines 121-122, 159-160, 199-200) plus manual `response_parse_failed` handling. No apiJson import. Not converted at all.

3. **BookingPublicWidgetSection.tsx** — raw `fetch(OVERVIEW)` (line 47/diff) plus a second raw fetch at line 79 (`fetch(RESOLVE…)`) with `if (!json.ok || !json.branchServiceId)`. a3d26fa7 only added a `try/catch` around the overview fetch. Not converted.

4. **BookingScheduleBlocksSection.tsx** — mostly converted (load/createBlock use apiJson), but `removeBlock()` (lines 172-180) still calls raw `fetch(`${BASE}?id=…`, { method: "DELETE" })` inside a try/catch that swallows the error silently (`// ignore delete errors`). This is exactly the anti-pattern the A3 fixer corrected in BookingWorkingHoursSection.deactivate — but the identical pattern in ScheduleBlocks.removeBlock was missed.

The DoD clause A1 explicitly lists these as in-scope and states "No component should still use raw `fetch + res.ok` check." Four components violate this.

## Clause A2 — No apiJson duplication — PASS

`apps/webapp/src/app/app/settings/bookingSoloAdminApi.ts` lines 1-2:
```
import { apiJson } from "@/shared/lib/apiJson";
export { apiJson } from "@/shared/lib/apiJson";
```
No local `apiJson` function definition remains. It imports and re-exports the shared helper. The component test (`BookingEventNotificationsSection.test.tsx`) even asserts `fromApi === fromShared` (same function identity), confirming it is a true re-export, not a copy. PASS.

Note: `fetchSoloOverview` (lines 48-56) still uses raw fetch, but this is a legitimate exception — it needs to translate `booking_engine_unavailable` into a `null` return, which apiJson's throw-on-error contract cannot express. Out of scope for A2 (A2 is only about the apiJson helper itself).

## Clause A3 — deactivate() uses apiJson — PASS

`BookingWorkingHoursSection.tsx` `deactivate()` (lines 161-171):
```js
function deactivate(id: string) {
  startTransition(async () => {
    try {
      await apiJson(`${BASE}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete_failed");
      return;
    }
    await load();
  });
}
```
Uses apiJson + try/catch, surfaces the error message, and does NOT reload on failure (early return). PASS for this specific function.

(Caveat: the structurally-identical `removeBlock()` in BookingScheduleBlocksSection was NOT given the same treatment — see A1.)

## Clause A4 — shared/lib/apiJson.ts correctness — PASS

Helper (lines 5-22) correctly handles all required cases:
- Reads `res.text()` first, then attempts `JSON.parse`.
- On parse failure: throws `invalid_json` when `res.ok`, else `http_${status}` — so an HTML server-error page (e.g. 502 `<html>Bad Gateway</html>`) yields a clean `http_502` rather than a confusing JSON-parse stack trace. HTML on a 200 yields `invalid_json`.
- On `!res.ok || body.ok === false`: throws `body.message ?? body.error ?? http_${status}`, preferring `message` over `error`.

Verified by the unit tests (all 6 pass), which explicitly cover HTML-on-502 → http_502 and HTML-on-200 → invalid_json. PASS.

## Clause A5 — Error messages surfaced — PASS (for converted components)

The 10 fully-converted components consistently use `setError(e instanceof Error ? e.message : "<fallback>")` (verified in BookingWorkingHoursSection load/createRow/deactivate and BookingScheduleBlocksSection load/createBlock). No `setError(null)` on error and no silent swallow in those paths.

Exception in the NOT-converted files (these are A1 failures, listed here for completeness):
- BookingScheduleBlocksSection.removeBlock: silent `// ignore delete errors` — error never surfaced.
- BookingMergeCandidatesSection.dismiss / BookingPublicWidgetSection: catch blocks set a generic "Ошибка сети" or silently leave selects empty.

For the components that were actually converted, A5 holds. PASS, scoped to the converted set.

## Clause A6 — Tests exist and pass — PASS

- `apps/webapp/src/shared/lib/apiJson.test.ts` exists with 6 meaningful unit tests (happy path, body.ok===false+error, body.ok===false+message precedence, non-JSON on 200 → invalid_json, HTML on 502 → http_502, 500 no-error → http_500). ≥3 satisfied.
- `BookingEventNotificationsSection.test.tsx` exists with 3 tests (re-export identity, http_503 on HTML, body.error passthrough). Note: it does not render the component; it re-tests apiJson + the re-export. Thin but valid.

Test runs (vitest 4 — note: `--testPathPattern` is NOT supported by vitest 4; used positional filter instead):
- `vitest --run apiJson` → Test Files 1 passed, Tests 6 passed.
- `vitest --run BookingEventNotificationsSection` → Test Files 1 passed, Tests 3 passed.

Both green. PASS.

## Clause A7 — TypeScript clean — PASS

`cd apps/webapp && npx tsc --noEmit` (filtering node_modules/integrator) → exit 0, zero diagnostics. PASS.

## Overall: FAIL

A2, A3, A4, A5 (scoped), A6, A7 all PASS. The build is type-clean and tests are green.

**A1 FAILS.** The DoD requires all 14 batch1 components to use apiJson with no remaining raw `fetch + res.ok` checks, but 4 do not:

1. **BookingMergeCandidatesSection.tsx** — convert `load()` and `dismiss()` to `apiJson` + try/catch (currently raw fetch with manual res.ok/json.ok; dismiss only got a try/catch wrapper, not apiJson).
2. **BookingPatientPackagesSection.tsx** — convert all 3 fetch calls (lines ~106, 144, 179) to apiJson; remove manual `response_parse_failed` / `!json.ok` handling, route errors through `catch (e) { setError(e instanceof Error ? e.message : …) }`.
3. **BookingPublicWidgetSection.tsx** — convert both fetches (OVERVIEW ~line 47 and RESOLVE ~line 79) to apiJson; currently only a try/catch was added around the raw overview fetch.
4. **BookingScheduleBlocksSection.tsx** — `removeBlock()` (lines 172-180) still uses raw `fetch(... DELETE)` with a silent `// ignore delete errors` catch. Convert to apiJson and surface the error via `setError`, mirroring the A3 fix applied to BookingWorkingHoursSection.deactivate.

The previous fix commit (a133048d) addressed A2/A3/A6 but A3's pattern fix was applied only to WorkingHours, not to the identical ScheduleBlocks.removeBlock, and A1's full conversion of MergeCandidates/PatientPackages/PublicWidget was never completed — those three got try/catch wrappers around raw fetch rather than apiJson conversion (per the implementer's own commit message for a3d26fa7).
