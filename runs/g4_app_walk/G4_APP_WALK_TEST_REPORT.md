# G-4 — Full-app page walk against TEST, five roles, no-redirect-following

Date: 2026-07-27 (run generated 2026-07-26T21:03:42.732Z / 21:04 UTC = 00:04 MSK)
Target: `http://127.0.0.1:6300` (TEST webapp, loopback)
Tool: `docs/_TODO/SAAS_FOUNDATION/scripts/walk-app-pages-no-redirect.mjs`, `--auth=fixture`
Raw evidence: `runs/g4_app_walk/walk-test-5role-2026-07-27.{json,csv}`, `runs/g4_app_walk/legacy-admin-redirects-2026-07-27.txt`

## Identities used (owner-authorized, per owner ruling relayed 2026-07-26/27, taskdb #1017)

All five roles were exercised using the **operator smoke fixture** at
`/run/bersoncarebot/saas-smoke.fixture` (root:deploy, 0640), which already held session cookies for
the owner's own named accounts:

- `doctor` / `clinic_admin`: Точка здоровья clinic accounts
- `patient`: Дмитрий Берсон (phone `9189000782`)
- `global_admin`: `dimmdao@gmail.com` (admin-mode session, captured separately per the fixture's own contract)
- `public`: no cookie

**No credential was created, changed, or reset by this walk.** The fixture already existed
(last modified 2026-07-26 15:16, well before this walk started) and was read-only for this task —
the walk made GET requests using the cookies it already contained; nothing in this walk calls
`regenerate-saas-smoke-fixture.mjs` or writes to `user_password_credentials`. The fixture file
itself was read via `sudo cat` into a session-local scratch copy (0600, session-scratchpad only,
never committed, deleted after the run) purely to work around its `root:deploy` file permission —
its *contents* were never altered. Session-cookie **values** were never printed to any log, the
JSON/CSV output, or this report — verified by grepping the output artifacts for the session cookie
name before writing anything to the repo (no hits).

## Coverage

- 140 `page.tsx` files discovered under `apps/webapp/src/app/app`; 114 concrete (non-dynamic) paths.
- All 5 roles active, 0 unavailable (unlike this morning's DEV pre-check, where TEST/DEV dev-bypass
  had no seeded `clinic_admin`/`patient` accounts — fixture auth doesn't have that gap).
- 570 total probes (114 paths × 5 roles), **zero** fetch errors/timeouts.
- 26 dynamic routes (`:id`, `:slug`, `:userId`, etc.) were **not** rendered with concrete values and
  are itemized below under "What this walk cannot see" — deliberately, not a gap I ran out of time
  on. See that section for why.
- Additionally probed by direct URL, per the task: `/app/patient/diary/lfk/journal` (in-scope,
  concrete route, covered by the main walk too) and all 26 legacy `/app/doctor/admin/*` +
  `/app/platform/*` paths that no longer have a `page.tsx` (checked separately, unauthenticated,
  since the redirect fires before any session check — see below).

## Result totals

| judgement | count |
|---|---|
| OK (200, not a disguised login page) | 134 |
| REDIRECT (3xx, not followed) | 433 |
| LOGIN-PAGE-AS-200 (expected, public entry points only) | 3 |
| 4xx / 5xx / timeout / fetch error | **0** |

Per role: doctor 35 OK / 79 redirect · clinic_admin 35 OK / 79 redirect · patient 43 OK / 71
redirect · global_admin 18 OK / 96 redirect · public 3 OK(login-page, expected) / 108 redirect.

**The 200-is-not-proof trap, checked directly**: every one of the 134 "OK" responses was re-fetched
and its *body* scanned for a Next.js error digest, an "Application error" string, a generic React
error-boundary marker, an HTTP-500-style string, or a suspiciously tiny payload (<2KB) that would
indicate a shell rendering with nothing inside. **Zero hits.** This does not prove every page's
content is *correct*, only that none of them silently swallowed a server-side exception into a
200 — the specific failure mode the task called out (analytics shell / branding contract / settings
toggle from earlier today).

## Ranked findings

### 1. Genuine breaks

**None found by this walk.** Zero non-2xx/3xx statuses, zero body-content error markers, across
570 probes covering every concrete page in the app for all five roles.

This is a meaningfully narrower claim than "the app works" — see "What this walk cannot see" below.

### 2. Known, pre-existing defect this walk could NOT confirm or deny

**`/app/patient/diary/lfk/journal` (taskdb #1032) — inconclusive, not fixed-and-verified.**//
The task asked me to confirm whether this route surfaces `permission denied for table
lfk_exercise_media` as a server error. It returned a clean `200 OK`, 30382 bytes, no error markers.
But this is **not** evidence the bug is fixed: I traced the page's server component
(`apps/webapp/src/app/app/patient/diary/lfk/journal/page.tsx:59-68`) — when the patient account has
zero LFK complexes it returns an early "create a complex to start a journal" empty state and never
calls `listLfkSessionsInRange` or anything touching `lfk_exercise_media`. The owner's test patient
account (Дмитрий Берсон) has no LFK complexes, so this GET never reached the code path in question.
Per taskdb #1032, the actual failing joins live in `pgLfkDiary.ts` / `pgPlatformLfkMediaAccess.ts`,
reached from `apps/webapp/src/app/app/patient/diary/lfk/actions.ts` — i.e. a **server action**
(mutation-shaped), not a plain page GET. A GET-only, no-interaction walk structurally cannot
exercise it either way. **Status: still open per taskdb #1032, unverified by this walk, needs an
account with LFK complex data or a direct action-level check.**

### 3. Correct-by-design refusals (pass, not a defect)

- **Patient wall**: patient role gets `REDIRECT->/app/patient?app_access_denied=1` on every
  doctor-only page tested (`/app/doctor/patients`, `/app/doctor/schedule`, `/app/doctor/exercises`,
  etc.) — refused, not broken.
- **Admin console gate (C-4 result, confirmed live)**: all 14 concrete `/app/admin/*` pages return
  `200 OK` for `global_admin` only; doctor/clinic_admin/patient/public all get
  `REDIRECT->/app` on every one of them. This is the exact behavior the allowlist-removal fix
  (C-4, commit `5f81febc4`) was meant to produce, and it holds on TEST right now.
- **Legacy admin URL migration — single-hop, confirmed for all 26 old paths** (task requirement
  #3): every `/app/doctor/system-health`, `/app/doctor/admin/*`, and `/app/platform/*` /
  `/app/platform/admin/*` path 308-redirects straight to its final `/app/admin/*` URL in **one**
  hop — no bounce through the deleted `/app/platform/*` shell. Checked unauthenticated (the redirect
  fires in `proxy.ts` before any session/role check — `apps/webapp/src/proxy.ts:37`, so it applies
  identically regardless of role). Full table in
  `runs/g4_app_walk/legacy-admin-redirects-2026-07-27.txt`.
- **Two admin/booking sub-pages self-redirect rather than render** (`/app/admin/booking/catalog`,
  `/app/admin/booking/integrations` → `/app/admin/booking`, for `global_admin`) — this is an
  in-page `redirect()` call, single hop, not a crash. Two siblings (`form-public`, `payments`)
  instead render `200 OK` with roughly a third of the byte size of the other admin pages (~53KB vs
  ~90-140KB) — consistent with the `doctorRouteRedirects.ts` code comment that these "now render
  null" pending an **open owner decision** (`OWNER_QUESTIONS_2026-07-26.md #6`). Not a new defect;
  flagging because it's visible in this data and already has an owner question attached.
- **Public role**: only unauthenticated-appropriate pages return OK
  (`/app/auth/email-setup`, `/app/clinic/invites/accept`, `/app/contact-support` — all
  intentionally auth-optional utility flows); every `/app/doctor/*`, `/app/patient/*`, `/app/admin/*`
  page redirects to the login screen. `/app`, `/app/tg`, `/app/max` correctly show the login screen
  itself as a 200 (`LOGIN-PAGE-AS-200`, marked `expected: true` by the tool's own design).

### 4. Needs an owner call, not a code defect

- **`clinic_admin` and `doctor` get byte-for-byte identical access on every one of the 114 routes
  tested** (diffed directly — 0 differences). Every `/app/doctor/*` clinical/content page that a
  doctor can reach, `clinic_admin` can reach too, with the same status and redirect target on every
  single row. This may be exactly the intended "clinic_admin by capability" model (memory:
  `tenant-role-model-clinic-admin-capability.md` — clinic_admin is meant to be a capability tier,
  not a walled-off role), in which case this is correct. But since a page-walk can't tell "intended
  superset access" from "wall never checks the clinic_admin/doctor distinction at all," this is
  worth an explicit owner confirmation rather than being asserted as a pass by this report.

## What this walk cannot see

- **26 dynamic routes were not rendered with concrete IDs** (`/app/doctor/patients/:userId`,
  `/app/doctor/exercises/:id`, `/app/patient/treatment/:instanceId`, etc. — full list in the JSON's
  `summary.skipped`). The operator fixture's `refs` block only supplies three of the many entity
  types these routes need (`doctorClientUserId`, `patientProgramInstanceId`,
  `patientProgramItemId`); the rest (`id`, `slug`, `kind`, `requestId`, `categoryCode`, `auditId`,
  `ruleId`, `templateStageItemId`) would need real TEST-database lookups per entity type. I chose
  not to improvise values for these: the operator packet is explicit that "the `refs` values are
  opaque TEST identifiers" and that evidence must never store "the rendered ref values" — guessing
  or minting IDs for entity types the fixture doesn't cover risks probing another tenant's row by
  accident. These 26 routes are the single biggest gap in this walk's coverage and are exactly where
  a permission/ownership bug (like #1032) is most likely to live, since they're the routes that
  actually touch a specific record.
- **Server actions / mutations are entirely untested** — this walk is GET-only by design (task hard
  prohibition + the script's own contract). Anything that only fails on a POST-shaped server action
  (like the confirmed #1032 code path) is invisible to it.
- **Client-side-only failures are invisible.** The walk checks the initial HTML response; it does
  not execute JavaScript, so a page that server-renders fine but throws in a `useEffect`, a broken
  client-side data fetch, or a hydration mismatch would show as "OK" here regardless.
- **Body-scan is a heuristic, not a content audit.** The error-marker scan on all 134 "OK" rows
  catches crash-shaped failures (error boundaries, 500-flavored text, tiny payloads) but does not
  confirm the *correct* data is present — e.g. it cannot tell a populated dashboard from one
  correctly showing an empty state vs one that should have data but silently doesn't.
- **No interaction-gated content** (modals, tabs that fetch on click, wizards past step 1) is
  exercised.

## Comparison to the previous walk

The only prior walk on disk (`walk-dev.json` / `walk-dev-3.json` in this session's scratchpad,
generated 2026-07-26 ~08:10 local) targeted **DEV** (`127.0.0.1:5200`), **not TEST**, using
`--auth=dev-bypass`, and predates today's admin-console rename (commit `49f19b120`, 20:03 today) and
several other same-day fixes (C-4, OTP hardening, reminder RLS). It also only had 3 of 5 roles
available (DEV has no seeded `clinic_admin`/`patient` dev-bypass account) — 342 probes vs today's
570. Given the different server, different auth mechanism, and same-day architecture changes
between the two runs, a route-by-route diff would mostly reflect the admin-URL rename rather than
real regressions/fixes, so I did not force one. What **is** comparable and meaningful: that morning
DEV walk *also* found zero 4xx/5xx/timeout responses (55 OK / 284 redirect / 3 expected-login-page
out of 342). So both the pre-change DEV snapshot and today's post-change TEST snapshot agree on the
one thing that matters most: no raw HTTP-level breakage, then or now.

## Deploy-closure gate note

Per the task brief, the one red deploy-closure gate (`app_owner` UPDATE on `operator_incidents`) is
a gate failure, not a live outage, and TEST was reachable and responsive throughout this walk
(confirmed `GET /app` → `200` before and after).
