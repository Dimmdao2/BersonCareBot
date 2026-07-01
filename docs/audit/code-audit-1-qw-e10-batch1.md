# Code Audit 1 — QW-E10/batch1
agentId: audit1-qw-e10-b1
Commit: b0c539dc
Date: 2026-06-19

## A1 — apiJson helper correctness
**verdict: PASS**

How verified: Read `apps/webapp/src/shared/lib/apiJson.ts` in full (22 lines).

- **HTTP error (non-ok response):** Handled. After JSON parse, `if (!res.ok || body.ok === false)` throws with `detail ?? \`http_${res.status}\``.
- **JSON parse failure:** Handled. `res.text()` is used (never throws), then `JSON.parse(text)` is wrapped in try/catch. On parse failure: if `res.ok` it throws `"invalid_json"`, otherwise `\`http_${res.status}\``. Note: using `res.text()` first is intentional — it avoids the double-consume problem and lets the parse error be detected.
- **body.ok === false (business error):** Handled. `if (!res.ok || body.ok === false)` catches both HTTP and API-level failures. Message preference: `body.message` (string) → `body.error` → `\`http_${res.status}\``.
- **Error message propagation:** Correct. The `detail` variable takes `body.message` (if string) before `body.error`, consistent with the broader codebase convention.
- **Edge case — server returns HTML (e.g. 502 gateway HTML):** Handled correctly. `res.text()` succeeds, `JSON.parse` throws, the catch block fires and throws `\`http_${res.status}\`` since `res.ok` is false for a 502.
- **Edge case — 200 OK with non-JSON body:** Throws `"invalid_json"`, which propagates to the caller's catch as `e.message`. Acceptable.
- **One minor observation (not a failure):** The TypeScript generic constraint `T extends { ok?: boolean; error?: string; message?: string }` forces callers to type-annotate the response shape. For endpoints that do NOT return `ok`/`error`/`message` fields the function still works, but type inference may require explicit casts. This is a style concern, not a correctness bug.

---

## A2 — Duplication: new apiJson vs existing in bookingSoloAdminApi.ts
**verdict: FAIL**

How verified: Read `apps/webapp/src/app/app/settings/bookingSoloAdminApi.ts` lines 1–62 and `apps/webapp/src/shared/lib/apiJson.ts` in full.

The two functions are **byte-for-byte identical** (same signature, same generic constraint, same logic, same error strings):

- `bookingSoloAdminApi.ts` lines 45–62: `export async function apiJson<T extends { ok?: boolean; error?: string; message?: string }>(url, init) { ... }`
- `shared/lib/apiJson.ts` lines 1–22: `export async function apiJson<T extends { ok?: boolean; error?: string; message?: string }>(url, init) { ... }`

The commit does NOT update `bookingSoloAdminApi.ts` to import from `@/shared/lib/apiJson`. Instead it introduces a new copy in `shared/lib/` and has the 8 new components import from there, while `bookingSoloAdminApi.ts` retains its own identical local export. The file still exports `apiJson` itself (line 45) and callers that import from `bookingSoloAdminApi.ts` (e.g. `ensureDefaultSpecialist`, `setServiceLocationAvailability`) continue to use that copy.

This violates the §6 no-duplication rule and the repo policy of single-chokepoint logic. The correct fix is to have `bookingSoloAdminApi.ts` re-export from `@/shared/lib/apiJson` (or import and use it), eliminating the duplicate definition.

---

## A3 — Correct error routing in each component
**verdict: PASS with one noteworthy gap**

How verified: `git show b0c539dc` diff for each file + reading key sections of current files.

### AppointmentReminderSettingsSection.tsx
- GET/load: no fetch call on load (settings passed as props) — N/A.
- PATCH (save toggle + save offsets): wrapped in try/catch, errors go to `setError(...)`.
- **Gap:** catch blocks use hardcoded Russian strings (`"Не удалось сохранить настройку"`, `"Не удалось сохранить смещения напоминаний"`) rather than `e instanceof Error ? e.message : "..."`. The actual error detail from apiJson (e.g. `"http_503"`) is discarded. For a settings panel this is acceptable UX, but it deviates from the pattern used in the other 7 components.

### BookingCatalogPackagesSection.tsx
- GET (load): try/catch, load errors silently swallowed (empty lists). Comment explains this is intentional.
- POST (create package): try/catch, error → `setError(e instanceof Error ? e.message : "save_failed")`. Correct.

### BookingCatalogProductsSection.tsx
- GET (load): try/catch, load errors silently swallowed. Intentional.
- POST (save product): try/catch → `setError(e instanceof Error ? e.message : "save_failed")`. Correct.
- POST (createPayLink): try/catch → `setError(e instanceof Error ? e.message : "pay_link_failed")`. Correct.

### BookingEventNotificationsSection.tsx
- GET (load): try/catch → `setError(e instanceof Error ? e.message : "load_failed")`. Correct.
- No save path visible in this diff (settings updated via `patchAdminSetting` helper — not changed here; not in scope).

### BookingFormFieldsSection.tsx
- GET (load): try/catch → `setError(e instanceof Error ? e.message : "load_failed")`. Correct.
- POST (saveField): try/catch → `setError(e instanceof Error ? e.message : "Ошибка сети")`. Correct.

### BookingManualLifecycleSection.tsx
- GET (client history): try/catch → silently sets empty list on error (intentional).
- POST (manual-cancel): try/catch → `setMessage(e instanceof Error ? e.message : "error")`. Correct.
- POST (manual-reschedule): try/catch → `setMessage(e instanceof Error ? e.message : "error")`. Correct.

### BookingPrepaymentSection.tsx
- GET (load): try/catch, load errors silently swallowed. Intentional.
- PUT (save policy): try/catch → `setError(e instanceof Error ? e.message : "save_failed")`. Correct.

### BookingWorkingHoursSection.tsx
- GET (loadCatalog): try/catch, silently swallowed. Intentional.
- GET (load rows): try/catch → `setError(e instanceof Error ? e.message : "load_failed")`. Correct.
- POST (createRow): try/catch → `setError(e instanceof Error ? e.message : "create_failed")`. Correct.
- DELETE (deactivate): **Still uses raw `fetch` (not apiJson).** The catch block only prevents unhandled rejection but swallows the error silently (`// ignore delete errors`). This means a failed DELETE causes no visible feedback — `load()` is still called after the catch, so the UI may appear to succeed. This is a minor UX regression from the goal of "all fetch failures → inline" — but the error is routed to catch rather than error-boundary, so it does not trigger error-boundary. Technically within the "no unhandled rejection" goal, but the silent swallow deviates from the stated goal of routing to toast/inline.

**Summary:** All 8 components correctly prevent unhandled rejections. 7/8 route errors to setError/setMessage with the error message. One (AppointmentReminderSettingsSection) discards the actual error detail. One DELETE in BookingWorkingHoursSection silently swallows without user feedback.

---

## A4 — Scope check
**verdict: PASS**

How verified: `git show --name-only b0c539dc`.

Commit b0c539dc modifies exactly 9 files:
- `apps/webapp/src/shared/lib/apiJson.ts` (new file)
- 8 settings components as specified

No unexpected files modified in this commit. (The `docs/audit/code-audit-2-qw-b7.md` file visible in the branch diff belongs to the preceding commit `3de16ee3`, not to `b0c539dc`.)

---

## A5 — TypeScript / tsc clean
**verdict: PASS**

How verified: `/home/dev/orch/run-tests.sh "cd /home/dev/dev-projects/BersonCareBot/apps/webapp && pnpm tsc --noEmit 2>&1 | head -50"` → exit code 0, no output (clean).

---

## A6 — Tests
**verdict: FAIL**

How verified: `find apps/webapp/src -name "*.test.ts*" | xargs grep -l "apiJson|AppointmentReminderSettings|BookingCatalog|..."` → no matches in the new or changed files.

No tests were added for:
- The new `shared/lib/apiJson.ts` helper (no `apiJson.test.ts` file exists).
- Any of the 8 wrapped components.

The DoD states "tests on at least 3 representative components." Zero tests are present. This is a FAIL.

A simple unit test for `apiJson` (mocking `fetch`) would be trivially straightforward and should cover: (a) HTTP error throws, (b) JSON parse failure throws, (c) `body.ok === false` throws, (d) happy path returns body.

---

## A7 — Completeness: batch vs DoD
**verdict: PARTIAL — acceptable for batch1, gap must be tracked**

How verified: Counted components in QW-E10 DoD list from `docs/QUICK_WINS_REVISION_2026-06-19.md §12`.

The DoD list names ~22 distinct components across three groups:
1. `settings/*` booking-engine: BookingFormFields, Policies (not found in this diff), Prepayment, CatalogPackages, Products, **ScheduleBlocks** (not wrapped), **StaffPaymentPanel** (not wrapped), AppointmentReminder, EventNotifications — 2 of 9 settings components still unpatched.
2. Doctor panels: DoctorNotesPanel, AdminDangerActions, DoctorClientLifecycleActions, SubscriberBlockPanel, DoctorSupplementaryContactsPanel, AppointmentStaffCommentsSection, DoctorGlobalTasksSection, treatment-program-templates/new/NewTemplateForm — none wrapped.
3. Patient/payment: PatientBookingPayClient, CabinetBookingActions, PublicBookingPayClient, PublicProductPayClient, PublicProductPurchaseClient — none wrapped.

This batch covers 8 of ~22 named components (~36%). Two `settings/*` components in the original list (`BookingScheduleBlocksSection`, `BookingStaffPaymentPanel`) remain unpatched despite being in scope for this `settings/*` pass.

The branch name `auto/qw-e10-batch1` correctly signals this is partial. However, the two skipped settings-group components (`BookingScheduleBlocksSection`, `BookingStaffPaymentPanel`) appear to have been overlooked within the batch's own stated scope (all `settings/*` components).

---

## Summary of findings

| # | Clause | Verdict | Issue |
|---|--------|---------|-------|
| A1 | apiJson helper correctness | PASS | Correct on all edges |
| A2 | Duplication: bookingSoloAdminApi.ts not updated | **FAIL** | Identical `apiJson` still in bookingSoloAdminApi.ts; not re-pointed to shared/lib |
| A3 | Error routing in 8 components | PASS* | All reach setError/setMessage; AppointmentReminder discards error.message; BookingWorkingHours DELETE silently swallows |
| A4 | Scope check | PASS | Exactly 9 files in commit |
| A5 | TypeScript clean | PASS | tsc --noEmit exit 0 |
| A6 | Tests | **FAIL** | Zero tests added; DoD requires ≥3 |
| A7 | Completeness | PARTIAL | 8/~22 components; 2 settings-group components skipped within batch scope |

## Overall verdict: FAIL+2 (2 hard failures: A2 duplication, A6 no tests; 1 partial: A7 batch completeness gap)

### Required before batch can be accepted
1. **A2:** Remove `apiJson` from `bookingSoloAdminApi.ts`; import from `@/shared/lib/apiJson` instead. Eliminates the duplicate.
2. **A6:** Add `shared/lib/apiJson.test.ts` with ≥3 test cases covering HTTP error, JSON parse error, `body.ok=false`, and happy path.

### Recommended (not blocking if owner decides to defer)
3. **A3/BookingWorkingHoursSection deactivate:** Use `apiJson` for the DELETE call so error is surfaced to `setError` rather than silently dropped.
4. **A7:** Wrap `BookingScheduleBlocksSection` and `BookingStaffPaymentPanel` before closing batch1, as they are in the same settings directory already targeted by this batch.
