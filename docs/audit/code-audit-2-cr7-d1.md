# Code Audit 2 — CR-7 D1 catch-all fix (Opus, independent)

**File:** `apps/webapp/src/app/app/doctor/patients/[userId]/[...tabSlug]/page.tsx`
**Commit:** `38e7dcb3` on `feat/doctor-ui-rebuild`
**Method:** Independent re-derivation. Read the actual file, mapped the sibling
route tree, traced every execution path against Next.js App Router precedence
rules. Did NOT consult auditor-1 findings.

The fix:
```diff
- const tab = tabSlug[0];
- if (!tab || !VALID_TABS.has(tab)) {
+ // tabSlug may be ["karta"] or ["tabs", "karta"] — find first valid segment
+ const tab = tabSlug.find((seg) => VALID_TABS.has(seg));
+ if (!tab) {
    notFound();
  }
```

---

## Clause 1 — Trace all execution paths through find()

**PASS.**

VALID_TABS = {overview, karta, program, records, files, comms, finances, account}.

| URL | tabSlug array | `find()` result | Outcome |
|-----|---------------|-----------------|---------|
| `/patients/<uuid>/karta` | `["karta"]` | `"karta"` | redirect `?tab=karta` ✓ |
| `/patients/<uuid>/tabs/karta` | `["tabs","karta"]` | `"karta"` (skips "tabs" ∉ set) | redirect `?tab=karta` ✓ |
| `/patients/<uuid>/tabs` | `["tabs"]` | `undefined` ("tabs" ∉ set) | `notFound()` — correct, no valid tab |
| `/patients/<uuid>/karta/injected` | `["karta","injected"]` | `"karta"` (first match) | redirect `?tab=karta`, "injected" dropped ✓ |
| empty tabSlug | n/a — see note | n/a | unreachable |

**How verified:** Manually evaluated `Array.prototype.find` semantics on each
input against the literal `VALID_TABS` Set. `find` returns the first element
satisfying the predicate or `undefined`; `Set.has` is exact-string membership
(no coercion). The `if (!tab)` guard correctly treats `undefined` as the
not-found case. Empty-array case: a catch-all `[...tabSlug]` route in Next.js
only matches when there is **at least one** path segment after `[userId]`
(`[[...tabSlug]]` would be needed for zero segments). So `tabSlug` is always
length ≥ 1 here; the bare `/patients/<uuid>` is served by the sibling
`[userId]/page.tsx`, not this file. Even if length 0 were somehow reached,
`find` returns `undefined` → `notFound()`, which is safe.

Key independent confirmation that the `/tabs/` case is real and not dead code:
the sibling `[userId]/tabs/` directory contains ONLY component files
(`PatientTab*.tsx`) and colocation subfolders `karta/`, `program/` — **no
`page.tsx`/`route.ts`** (`find tabs -name page.tsx -o -name route.ts` → empty).
Therefore `tabs` is a non-routable colocation folder, and a literal
`/patients/<uuid>/tabs/karta` URL genuinely falls through to this catch-all with
`tabSlug=["tabs","karta"]`. The fix's premise is valid.

---

## Clause 2 — Security perimeter / `find` returning FIRST valid segment

**PASS.**

- The redirect target tab is constrained to a member of `VALID_TABS` (a closed
  allowlist of 8 literals). An attacker cannot inject an arbitrary `?tab=` value:
  any segment not in the Set is skipped by `find`, and if none match, `notFound()`.
- "First valid segment" does not weaken the perimeter. The only behavioral
  change vs. a hypothetical "tab must be `tabSlug[0]`" rule is that a leading
  junk/`tabs` prefix is now tolerated and trailing extra segments are ignored.
  In all cases the emitted `tab` is still a hardcoded allowlisted literal, so the
  redirect URL's query value is bounded to 8 known-safe strings.
- `/patients/<uuid>/karta/extra` → `["karta","extra"]` → redirects to
  `?tab=karta`. Not "surprising": "extra" is ignored, the user lands on the
  karta tab. No open redirect, no path traversal, no second-segment confusion
  (e.g. `["files","karta"]` deterministically yields `files` — the first match —
  which is a reasonable and predictable choice).
- No way to smuggle CRLF / extra query params: the interpolated value is one of
  8 fixed ASCII tokens, never raw user input.

**How verified:** Reasoned over the full input space. The output domain of the
interpolated `tab` is exactly `VALID_TABS` ∪ {nothing→notFound}; user-controlled
bytes never reach the redirect string. Confirmed `routePaths.doctorPatients` is a
constant `"/app/doctor/patients"` (paths.ts:120), not user-derived.

---

## Clause 3 — Redirect URL constructed safely / right page

**PASS.**

`redirect(\`${routePaths.doctorPatients}/${userId}?tab=${tab}\`)` →
`/app/doctor/patients/<uuid>?tab=<allowlisted>`.

- `routePaths.doctorPatients` = `"/app/doctor/patients"` (verified paths.ts:120),
  a leading-slash absolute internal path — `next/navigation`'s `redirect` treats
  it as a same-origin redirect; no open-redirect risk.
- `userId` is interpolated only AFTER passing `z.string().uuid()` validation
  (clause 4), so it is a syntactically valid UUID — no path-injection bytes.
- `tab` is an allowlisted literal (clause 2).
- Destination `[userId]/page.tsx` consumes `searchParams.tab` (`page.tsx:69`:
  `const initialTab = typeof sp.tab === "string" ? sp.tab : undefined`), so
  `?tab=` is the correct contract for selecting the client-side tab. Round-trip
  is coherent.

**How verified:** Resolved the route constant, inspected the destination page's
`searchParams` handling, confirmed the query-param key/shape matches what the
target page reads.

---

## Clause 4 — UUID guard position relative to find()

**PASS.**

Order in the function body:
1. `await params`
2. `z.string().uuid().safeParse(userId)` → `notFound()` on failure (lines 34–36)
3. `find()` for the tab (line 39)
4. `notFound()` if no valid tab (lines 40–42)
5. `redirect(...)` (line 44)

The UUID guard is BEFORE the redirect and before `userId` is interpolated, so a
malformed `userId` can never reach the redirect string. Ordering relative to
`find()` is immaterial to correctness (find has no dependency on userId), but the
guard-before-interpolation invariant holds. `notFound()`/`redirect()` both throw
(control never falls through), so no double-emit.

**How verified:** Line-by-line control-flow read; confirmed `notFound` and
`redirect` from `next/navigation` throw `NEXT_NOT_FOUND` / `NEXT_REDIRECT` and
short-circuit.

---

## Clause 5 — Next.js route precedence (catch-all loses to specific)

**PASS.**

Sibling tree under `[userId]/`:
- `page.tsx` (the patient card, served for bare `/patients/<uuid>`)
- `programs/[instanceId]/page.tsx` (specific dynamic route)
- `[...tabSlug]/page.tsx` (this catch-all)
- `tabs/` (colocation only, non-routable — no page/route)

Next.js App Router specificity order: static segment > dynamic `[x]` >
catch-all `[...x]`. `programs` is a literal static segment and `[instanceId]` a
single dynamic segment, both strictly more specific than `[...tabSlug]`.
Therefore `/patients/<uuid>/programs/<id>` is served by
`programs/[instanceId]/page.tsx`, and the catch-all only receives URLs that do
NOT match `programs/[instanceId]` — exactly as the file's header comment claims.
No conflict: even though `program` is in VALID_TABS, the URL prefix that hits a
program instance is `programs/` (plural) which is a distinct, more-specific
route; the catch-all's `program` tab handles only `/patients/<uuid>/program`
(singular).

**How verified:** Listed the directory tree, confirmed `programs/[instanceId]`
has a real `page.tsx` while `tabs/` has none, and applied Next.js's documented
segment-specificity ordering. No code change in this commit affects precedence
(routing is filesystem-derived, untouched).

---

## Clause 6 — No raw SQL / dreg / §6 violations

**PASS.**

The file imports only `next/navigation`, `zod`, and the routes constant. No DB
access, no query builder, no raw SQL, no `any`, no disabled lints, no dead code
introduced. Pure routing/redirect logic at the app edge — clean-architecture
appropriate for a page boundary.

**How verified:** Full file read (45 lines); inspected all three imports; grep of
the file content for SQL/db patterns — none present.

---

## OVERALL: CLEAN

All 6 clauses PASS, 0 defects. The fix is correct and minimal: `find` over the
allowlist properly handles both the bare `/<tab>` and the `/tabs/<tab>`
colocation-prefix forms, ignores trailing garbage, and `notFound()`s when no
valid tab is present. Security perimeter intact — the redirected `?tab=` value is
bounded to 8 hardcoded literals and `userId` is UUID-validated before
interpolation. Route precedence is filesystem-correct and unaffected by the
change. I independently confirmed auditor-1's CLEAN verdict and additionally
verified the load-bearing premise (that `tabs/` is a non-routable colocation
folder, making the `/tabs/<name>` fall-through real rather than dead code).
