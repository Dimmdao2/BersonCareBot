# Code Audit 4 (FINAL, Opus gate) — QW-E10/batch1

agentId: audit4-qw-e10-batch1 (Opus, adversarial gate)
Branch: auto/qw-e10-batch1
Commit: HEAD (8a0ffcc9); batch1 commits a3d26fa7 / b0c539dc / a133048d / 0014599a
Date: 2026-06-19
Standard: deep adversarial; supersedes the prior audit-4 spot-check (which was PASS)

## Overall Verdict: **FAIL**

One genuine batch1 regression, missed by both Sonnet audits (audit2/audit3) and the
audit-4 spot-check: converting `BookingPoliciesSection` to `apiJson` broke its
pre-existing companion test, and the test was never updated. DoD clause 4 ("Tests pass")
fails for an affected batch1 file.

Everything else (apiJson usage, error surfacing, no raw fetch in the 14, tsc, the other
two test files) is PASS.

---

## Defect (FAIL)

### D1 — `BookingPoliciesSection.test.tsx` fails: stale fetch-mock contract vs new `apiJson`

**Severity:** blocker for clause 4 (tests pass). Real regression, not pre-existing flake.

**How verified — deterministic, reproduced twice:**
```
pnpm -C apps/webapp exec vitest run BookingPoliciesSection
 ❯ src/app/app/settings/BookingPoliciesSection.test.tsx (2 tests | 2 failed)
   × saves cancellation policy without hardcoded overwrite
   × saves reschedule policy with full flags model
   findByRole("button", { name: "Сохранить отмену" }) — never appears (timeout)
```

**Root cause (data flow):**
- `BookingPoliciesSection.tsx` got its first `apiJson` conversion in batch1 commit
  `a3d26fa7` (`git log -S apiJson` on that file → a3d26fa7 only).
- `apiJson` (apps/webapp/src/shared/lib/apiJson.ts:9-10) calls **`res.text()`** then
  `JSON.parse`, and reads **`res.ok`**.
- The pre-existing test (BookingPoliciesSection.test.tsx:57-61, last touched in 304cde9e,
  long before QW-E10) mocks fetch with the OLD contract only:
  `{ json: async () => policiesResponse }` — **no `text()` method, no `ok` property**.
- In the component's load, `apiJson` → `res.text()` is `undefined`/not-a-function →
  throws → load catch fires (BookingPoliciesSection.tsx:113) → `setError(...)`, policies
  state stays empty → the "Сохранить отмену" / "Сохранить перенос" buttons never render →
  both `findByRole` assertions time out.

**Contrast that proves it's the contract mismatch:** the NEW
`BookingEventNotificationsSection.test.tsx` mock (line 22-25) DOES provide
`{ ok: isOk, text: () => Promise.resolve(body) }` and passes. The batch1 author wrote a
correct apiJson-shaped mock for the new test but did not update the older Policies test
mock that the same conversion broke.

**Fix (out of audit scope — for the fix agent):** update
`BookingPoliciesSection.test.tsx` fetch mock to the apiJson contract — give each resolved
value `ok: true` and `text: async () => JSON.stringify(<body>)` instead of
`json: async () => <body>`. No production-code change needed.

**Why Sonnet missed it:** audit3 + spot-check only ran `apiJson` and
`BookingEventNotificationsSection` (both new, apiJson-shaped). Neither ran the
pre-existing `BookingPoliciesSection.test.tsx`, which is the only other test among the 14
batch1 components and the only one with a legacy mock.

---

## Per-Clause Results

### C1 — Use `apiJson`, no raw `fetch + res.ok/json.ok` — PASS (14/14)
Per-file grep over all 14 files: `rawfetch=0`, `apiJson>=2`, `import=1` each. No raw
`fetch(` remains in any of the 14 batch1 components. (bookingSoloAdminApi.ts:49 is the one
remaining raw fetch — see O1, justified, and not one of the 14.)

### C2 — Fetch errors routed to setError/toast in every catch — PASS, with documented
non-critical silent catches
All **user-facing primary loads and all mutations** surface errors:
- ScheduleBlocks.load (115-132) setError + early return on missing blocks, resets error on
  success; createBlock/removeBlock catches setError.
- PublicWidget RESOLVE (73-95) resets branchServiceId/cityCode AND setResolveError on
  catch (O4 good).
- PatientProducts.fetchPurchases, PatientPackages mutations, CatalogProducts/Packages
  save, AppointmentReminder save, FormFields/Prepayment/ManualLifecycle/Merge — all
  setError in catch.

Empty `catch {}` blocks all fall into a single intentional class — non-critical
reference/catalog/overview loaders that only populate `<select>` options, plus one
clipboard copy — each carrying an explanatory comment and leaving the user's primary flow
unaffected:
- CatalogPackages:41, CatalogProducts:59, Prepayment:71, WorkingHours:98, Policies:113,
  PatientProducts:71, PatientPackages:78 (loadRefs), ManualLifecycle:100 (appointment
  options), PublicWidget:57 (OVERVIEW), ScheduleBlocks:110 (catalog) — all select
  pre-loads.
- PublicWidget:136 — `navigator.clipboard.writeText` copy; ignore is acceptable.
- AppointmentReminder:70/102 are `catch {}` but DO `setError("Не удалось…")` inside (just
  don't bind `e`). Not silent.

**Adversarial re-checks requested:**
- A1.4 (PublicWidget OVERVIEW silent catch): JUSTIFIED. Loads branch/service selects only;
  on failure selects stay empty, the save flow still surfaces its own errors. Not the
  user's primary action. Sonnet's "non-critical" claim holds.
- A1.3 (PatientPackages loadRefs silent catch): JUSTIFIED. Loads services/packages catalog
  for selects; the primary `loadPatientPackages` and all mutations setError. Holds.

### C3 — TypeScript clean — PASS
`npx tsc --noEmit` from apps/webapp → exit 0.
No `as any` in the 14 files. Non-null assertions present are guarded:
- WorkingHours:95 `json.branches![0]!.id` inside `if (json.specialists && json.branches && json.rooms)`.
- PublicWidget:54-55 `activeBranches[0]!` guarded by `if (activeBranches[0])`.
All catch blocks use `e instanceof Error ? e.message : "<fallback>"` — correct for
`unknown`. No type cast masks an error.

### C4 — Tests (>=3 representative) pass — **FAIL** (see D1)
- apiJson.test.ts — PASS
- BookingEventNotificationsSection.test.tsx — PASS
- BookingPoliciesSection.test.tsx — **FAIL (2/2)** → blocks the clause.

---

## Opus-level Additional Checks

- **O1 — fetchSoloOverview raw-fetch exception justified?** YES. bookingSoloAdminApi.ts:48-56
  must distinguish `booking_engine_unavailable` → `return null` (normal "DB not connected"
  state, surfaced to UI via SOLO_BOOKING_UNAVAILABLE_MESSAGE) from a real error → `throw`.
  `apiJson` throws in BOTH cases and cannot return null, so it genuinely cannot replace this
  function. It is a shared API helper, not one of the 14 batch1 components, and the file no
  longer duplicates apiJson (re-exports it, line 2). Minor latent nit (pre-existing, not a
  batch1 change, non-blocking): line 50 `await res.json()` will throw a raw SyntaxError on a
  non-JSON body, where apiJson would normalize it — out of scope.
- **O2 — any catch that calls `setError(null)` / clears error on failure?** NONE. All
  `setError(null)` calls are pre-flight resets at the start of a handler, never inside a catch.
- **O3 — setError in catch but continues without early return?** No harmful case.
  ScheduleBlocks.load returns early after `setError("load_failed")`. ScheduleBlocks.removeBlock
  intentionally runs `await load()` after the try/catch to reflect server state on delete
  failure (deliberate, error already shown).
- **O4 — stale data shown after error?** No. PublicWidget RESOLVE resets branchServiceId/
  cityCode before setting resolveError. Select pre-loaders that fail leave selects empty
  (acceptable). No component renders stale success-state alongside an error.
- **O5 — tsc --noEmit exit 0** — PASS.
- **O6 — run tests** — apiJson + EventNotifications PASS; **BookingPoliciesSection FAIL**.

---

## Summary

| Clause | Result |
|---|---|
| C1 apiJson / no raw fetch (14 files) | PASS |
| C2 errors surfaced | PASS |
| C3 tsc clean | PASS |
| C4 tests pass | **FAIL (BookingPoliciesSection.test.tsx 2/2)** |
| O1 fetchSoloOverview exception | PASS (justified) |
| O2 setError(null)-on-fail | PASS |
| O3 missing early return | PASS |
| O4 stale data after error | PASS |
| O5 tsc exit 0 | PASS |
| O6 tests run | FAIL |

**Verdict: FAIL.** One blocker (D1). Do NOT merge to feat/doctor-ui-rebuild until
`BookingPoliciesSection.test.tsx` is updated to the apiJson mock contract
(`ok: true` + `text: async () => JSON.stringify(...)`) and the 2 tests pass. The fix is
test-only; no production code change required. Re-run
`pnpm -C apps/webapp exec vitest run apiJson BookingEventNotificationsSection BookingPoliciesSection`
to confirm green before the next gate.
