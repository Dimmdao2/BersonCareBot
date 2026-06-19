# Code Audit 1 — CR-7 D1 catch-all fix

**Commit:** 38e7dcb3  
**File:** `apps/webapp/src/app/app/doctor/patients/[userId]/[...tabSlug]/page.tsx`  
**Date:** 2026-06-19  
**Auditor:** CODE-AUDITOR #1 (Sonnet)

---

## Clause 1 — Execution trace: `tabSlug.find()` correctness

**PASS**

**как проверено:** Full file read (lines 1–45). The change replaces `tabSlug[0]` with `tabSlug.find((seg) => VALID_TABS.has(seg))`. Tracing all cases:

- `/patients/<uuid>/karta` → tabSlug=`["karta"]` → `find` returns `"karta"` ∈ VALID_TABS → `redirect(…?tab=karta)` ✅
- `/patients/<uuid>/tabs/karta` → tabSlug=`["tabs","karta"]` → `find` skips `"tabs"` (not in Set), returns `"karta"` ∈ VALID_TABS → `redirect(…?tab=karta)` ✅
- `/patients/<uuid>/unknown` → tabSlug=`["unknown"]` → `find` returns `undefined` → `notFound()` ✅
- `/patients/<uuid>/tabs/unknown` → tabSlug=`["tabs","unknown"]` → `find` returns `undefined` → `notFound()` ✅
- Empty segment (would require `/patients/<uuid>/` — Next.js would route to `[userId]/page.tsx` not catch-all; if somehow reached) → tabSlug=`[]` → `find` returns `undefined` → `notFound()` ✅

VALID_TABS Set (line 16–25) contains exactly: `"overview"`, `"karta"`, `"program"`, `"records"`, `"files"`, `"comms"`, `"finances"`, `"account"` — 8 entries. These match exactly the `TabId` union and `PATIENT_TABS` array in `PatientCardClient.tsx` (lines 55, 57–65).

---

## Clause 2 — Security: can attacker bypass VALID_TABS check?

**PASS**

**как проверено:** `VALID_TABS` is a `const` module-level `Set` of 8 literal strings (file lines 16–25). The `find` predicate calls `VALID_TABS.has(seg)` — a Set membership test. Each `seg` comes from the URL catch-all segment array, which is a `string[]` parsed by Next.js. There is no mutation of the Set, no dynamic addition, no prototype pollution path. The only valid output of `find` is one of the 8 member strings or `undefined`. An attacker cannot inject a value into the Set, and the redirect target is constructed as:

```
`${routePaths.doctorPatients}/${userId}?tab=${tab}`
```

where `userId` is already validated as a UUID (see Clause 4) and `tab` is constrained to one of 8 known strings. No open redirect possible.

---

## Clause 3 — Redirect destination correctness

**PASS**

**как проверено:** `routePaths.doctorPatients` is defined in `apps/webapp/src/app-layer/routes/paths.ts` line 120 as the string literal `"/app/doctor/patients"`. The redirect constructs:

```
/app/doctor/patients/<userId>?tab=<tab>
```

This targets `[userId]/page.tsx` (confirmed present at `apps/webapp/src/app/app/doctor/patients/[userId]/page.tsx`). That page reads `sp.tab` at line 69 (`const initialTab = typeof sp.tab === "string" ? sp.tab : undefined`) and passes it to `PatientCardClient` as `initialTab`. `PatientCardClient` validates `initialTab` against `PATIENT_TABS` (line 104) before using it as initial state, defaulting to `"overview"` on invalid value. The full round-trip is correct.

---

## Clause 4 — UUID validation still present and correct

**PASS**

**как проверено:** File lines 34–36:
```ts
if (!z.string().uuid().safeParse(userId).success) {
  notFound();
}
```
UUID check executes before the `find` logic (lines 39–42). Order is correct: invalid userId triggers `notFound()` before any redirect is attempted. Zod's `.uuid()` validator is the canonical repo-wide pattern for UUID validation.

---

## Clause 5 — Route precedence: `programs/[instanceId]` over `[...tabSlug]`

**PASS**

**как проверено:** Directory structure confirms (from `find` output):
```
[userId]/
  page.tsx                        (exact match: /patients/<id>)
  programs/[instanceId]/page.tsx  (static segment "programs" takes precedence)
  [...tabSlug]/page.tsx           (catch-all, lowest precedence)
```

Next.js App Router resolution order: exact routes beat dynamic segments beat catch-alls. A URL like `/patients/<uuid>/programs/<instanceId>` matches `programs/[instanceId]/page.tsx` (static `programs` prefix + dynamic `[instanceId]`) before it ever reaches `[...tabSlug]`. The fix touches no routing logic and does not alter segment precedence. The comment in the file (lines 9–10) correctly documents this: "The specific /patients/[userId]/programs/[instanceId] route takes precedence over this catch-all for valid program instance links."

There is also a `tabs/` directory with component files only (no `page.tsx`), so URLs like `/patients/<uuid>/tabs/karta` correctly fall through to `[...tabSlug]` as intended.

---

## Clause 6 — §6 compliance

**PASS**

**как проверено:** No SQL in this file. No drizzle calls. No cross-layer violations (this is an App Router page — pure routing logic). No duplication introduced. The fix is a 3-line change: add comment, change `tabSlug[0]` to `tabSlug.find(...)`, collapse the two-condition guard to a single `!tab` check. TSC rc=0 already confirmed by the task brief.

---

## Summary table

| Clause | Verdict | Key evidence |
|--------|---------|--------------|
| 1. Execution trace — all 5 cases | PASS | Logic trace on file lines 39–42 |
| 2. Security — VALID_TABS bypass | PASS | Set is const, 8 literals, no mutation |
| 3. Redirect destination correctness | PASS | `routePaths.doctorPatients` = `/app/doctor/patients`; page.tsx reads `?tab=` |
| 4. UUID validation present and ordered | PASS | Lines 34–36, executes before find |
| 5. Route precedence preserved | PASS | `programs/[instanceId]` static-prefix wins; no `page.tsx` in `tabs/` |
| 6. §6 compliance | PASS | No SQL, no drizzle, no duplication, TSC clean |

---

## OVERALL: PASS
