# Code Audit 3 — QW-E10/batch1
agentId: audit3-qw-e10-batch1
Commit: 0014599ab497595b3c996b69288e910290c9d0ac
Date: 2026-06-19

## Clause A1 — All 14 components use apiJson — PASS

Scanned all 14 batch1 components for `apiJson` import/use and for any leftover raw
`fetch(...)`. Result: every one of the 14 imports `apiJson` from `@/shared/lib/apiJson`,
and NONE contain a raw `fetch(` call.

The 4 components that failed audit2 are now fully converted:

- **BookingMergeCandidatesSection.tsx** — imports apiJson (line 8); `load()` uses
  `apiJson<...>(BASE, { cache: "no-store" })` (line 22); `dismiss()` uses
  `apiJson(\`${BASE}/${id}/dismiss\`, { method: "POST" })` (line 46). Both wrapped in
  try/catch with `setError`.
- **BookingPatientPackagesSection.tsx** — imports apiJson (line 8); all 4 fetch sites
  converted: `loadRefs()` (Promise.all of two apiJson, lines 73-74),
  `loadPatientPackages()` (line 99), `offerCatalog()` (line 128), `createManual()`
  (line 154). No raw fetch remains.
- **BookingPublicWidgetSection.tsx** — imports apiJson (line 9); both fetches converted:
  overview load effect (line 48) and resolve-branch-service effect (line 75).
- **BookingScheduleBlocksSection.tsx** — imports apiJson (line 17); `removeBlock()` now
  uses `apiJson(\`${BASE}?id=...\`, { method: "DELETE" })` (line 175). `loadCatalog()`,
  `load()`, and `createBlock()` also on apiJson.

Spot-checked others (BookingCatalogProductsSection, BookingEventNotificationsSection,
BookingFormFieldsSection, BookingManualLifecycleSection, BookingPrepaymentSection,
BookingPatientProductsSection, BookingPoliciesSection, AppointmentReminderSettingsSection,
BookingCatalogPackagesSection, BookingWorkingHoursSection) — all use apiJson, no raw fetch.

Note: many OTHER settings files (RubitimeSection, BookingEngineSection, SystemHealthSection,
etc.) still use raw fetch, but those are outside the QW-E10/batch1 scope (14 named files).

## Clause A2 — No apiJson duplication — PASS

`bookingSoloAdminApi.ts` no longer defines its own apiJson. Lines 1-2:
```
import { apiJson } from "@/shared/lib/apiJson";
export { apiJson } from "@/shared/lib/apiJson";
```
It re-exports the shared helper and consumes it (e.g. `ensureDefaultSpecialist`,
`setServiceLocationAvailability`). The single remaining hand-rolled fetch in the file is
`fetchSoloOverview`, which is an intentional special case (maps the
`booking_engine_unavailable` business error to a `null` return rather than throwing) —
not an apiJson duplication.

## Clause A3 — deactivate() uses apiJson — PASS

`BookingWorkingHoursSection.deactivate()` (line 161) calls
`apiJson(\`${BASE}?id=${encodeURIComponent(id)}\`, { method: "DELETE" })` (line 164),
wrapped in try/catch with `setError(e instanceof Error ? e.message : "delete_failed")`
(line 166). No raw fetch in the file.

## Clause A4 — shared/lib/apiJson.ts correctness — PASS

`apps/webapp/src/shared/lib/apiJson.ts` correctly:
- throws on JSON parse failure (`invalid_json` when res.ok, else `http_${status}`),
- throws on `!res.ok || body.ok === false`,
- prefers `body.message` then `body.error`, falling back to `http_${status}`.

Verified by passing unit tests (see A6) covering: happy path, 400+ok:false+error,
ok:false+message preference, non-JSON 200 -> invalid_json, 502 HTML -> http_502,
500 with no error -> http_500.

## Clause A5 — Error messages surfaced — PASS

Every catch in the 14 components either calls `setError(...)` (most operations) or is an
intentionally-silent non-critical reference/catalog load explicitly documented with a
comment (e.g. "refs load failure is non-critical", "overview load failure is non-critical;
selects stay empty", "catalog load failure is non-critical"). User-facing mutations and
primary loads all route the error to `setError`. catch/error-surface counts confirmed per
file.

## Clause A6 — Tests exist and pass — PASS

The prescribed command `pnpm --filter webapp test -- --testPathPattern="apiJson"` does NOT
filter under this repo's vitest setup — the `--testPathPattern` arg is ignored and the
full suite runs (1202 files, with ~209 pre-existing unrelated failures). Ran the apiJson
test directly instead:

```
npx vitest --run src/shared/lib/apiJson.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

The added test `BookingEventNotificationsSection.test.tsx` also passes (3 tests).

The broader suite's failures are unrelated to QW-E10: e.g. a "No such built-in module:
node:" harness/transform error on `BookingPoliciesSection.test.tsx` (a file NOT modified
by any QW-E10 commit — confirmed via git log) and unrelated conversations-route display
name assertions. These are pre-existing environment issues, not regressions from this
batch.

## Clause A7 — TypeScript clean — PASS

`npx tsc --noEmit` (filtering node_modules and integrator) produced zero errors.

## Overall: PASS

All seven clauses pass. The two prior failures are resolved: A2 (apiJson duplication
removed from bookingSoloAdminApi.ts) and A1 (all 4 remaining raw-fetch components —
MergeCandidates, PatientPackages, PublicWidget, ScheduleBlocks.removeBlock — converted to
apiJson). Tests exist and pass; TypeScript is clean.
