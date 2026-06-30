# Code Audit 3 (Final Gate) — QW-E10/batch2

- **Branch:** `auto/qw-e10-batch2` @ `b1329f96`
- **Diff base:** `feat/doctor-ui-rebuild` @ `da008982`
- **Auditor:** Final Code-auditor (Opus), READ-ONLY
- **Date:** 2026-06-19

## Verdict: **PASS**

Prior chain: audit1 FAIL (D1/D2 raw fetch) → audit2 FAIL (TS2559) → audit2b PASS (`& { ok?: boolean }`).
This final adversarial gate confirms all defects resolved and no new issues.

---

## Per-clause results

### O1 — Completeness — PASS
- `grep "await fetch("` over `apps/webapp/src/app/app/settings/` → **0 matches**.
- Broader `fetch(` sweep (incl. non-await, excl. tests/apiJson) → only `SettingsForm.tsx:44/49/54/62`. **Out of scope** (not in the 15-file batch2 list, not in the diff vs `da008982`); pre-existing. No batch2 file contains a raw fetch.

### O2 — fetchSoloOverview correctness — PASS
`bookingSoloAdminApi.ts:48-55` uses `apiJson<SoloOverview & { ok?: boolean }>`.
Overview route (`api/admin/booking-engine/overview/route.ts` via `_requireAdminBookingEngine.ts:31`) returns `{ ok:false, error:"booking_engine_unavailable" }` status 503. Traced against `apiJson.ts:17-21`:
- `{ ok:true, organizationId, ... }` → `res.ok && body.ok !== false` → returns body. Correct.
- `{ ok:false, error:"booking_engine_unavailable" }` (503) → `!res.ok` true → `detail = body.error` → throws `Error("booking_engine_unavailable")` → catch `e.message === "booking_engine_unavailable"` → returns `null`. Correct.
- `{ ok:false, error:"some_other_error" }` → throws non-matching message → rethrown to caller. Correct.

Logic chain sound. The `& { ok?: boolean }` intersection makes `body.ok` accessible without TS2559 and does not alter the `SoloOverview` success shape.

### O3 — patchAdminSetting return-value pattern — PASS
`patchAdminSetting` returns `false` in catch (`patchAdminSetting.ts:14-16`); `patchAdminSettingsBatch` returns `{ ok:false, error }` (`:41-43`). These are documented (JSDoc) error-signaling return values, not silent swallows. Verified real callers surface them:
- `EmailSmtpSection.tsx:52-63` — `if (!ok) setError("Не удалось сохранить")`.
- `AdminSettingsSection.tsx:148-173` — `if (!batchResult.ok)` surfaces `atIndex`/`key`/`error`.
- Plus broad fan-out (AccessLists, AppParameters, AuthProviders, VideoSystem, etc.) all consume the boolean.

### O4 — BookingEngineSection local apiJson copy removed — PASS
No `function apiJson` / `const apiJson` / `fetchJson` defined in the file. Imports shared `apiJson` (`BookingEngineSection.tsx:25`). Local copy removed, not shadowed.

### O5 — BookingEngineCatalogLists local copy removed — PASS
No local apiJson/fetchJson definition. Imports shared `apiJson` (`BookingEngineCatalogLists.tsx:12`). Removed, not shadowed.

### O6 — RubitimeSection multi-fetch — PASS
Full read (915 lines). Every network call uses `apiJson` + try/catch routed to `setLoadError`/`setActionError`/`setErr`:
- `loadAll` (114-141, Promise.all of 5 GETs; catch → setLoadError); `deleteEntity` (147-160).
- `CityForm.save` (358-375), `BranchTimezoneEditor.saveTz` (438-450), `BranchForm.save` (492-514), `ServiceEditor.save` (645-663, via `mapBookingCatalogApiError`), `ServiceForm.save` (754-775, mapped), `SpecialistForm.save` (847-867).
All six named sub-components covered.

### O7 — Silent catch legitimacy — PASS
Audited every catch in batch2. None silently swallow a primary load or mutation. All set an error state (`setError`/`setLoadError`/`setActionError`/`setErr`/`setCalError`/`setClearError`/`setCredsError`). Bare `catch {}` instances:
- `EmailSmtpSection.tsx:66` → `setError("Ошибка при сохранении")`.
- `GoogleCalendarSection.tsx:50` → local `patchSetting` returns `false` (same documented signaling pattern as patchAdminSetting; caller `:100-104` surfaces via `setCredsError`).
- `GoogleCalendarSection.tsx:106` → `setCredsError`.
- `RubitimeSection.tsx:417` (`clientValidateIanaTimezone`) → pure validation predicate returning bool, not a network catch. Legitimate.

Note (non-blocking): `GoogleCalendarSection` keeps a local `patchSetting` helper instead of importing shared `patchAdminSetting`. Functionally identical (uses apiJson, no raw fetch). Minor duplication, not a defect for this gate.

### O8 — TypeScript — PASS
`npx tsc --noEmit` (filtered, in `apps/webapp`) → exit **0**, no diagnostics.

---

## Defects
None.

## Overall: **PASS** — clear to merge to `feat/doctor-ui-rebuild`.
