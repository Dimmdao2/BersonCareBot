# S0б exercise store — confirmation audit of the lead's fix

## Test or view (classification comes first — AGENTS.md §24.4)

Тест или взгляд: decide this yourself, per surface, and say so in the report. Guidance:

- The **privilege wall** (who may insert/read which column of `public.tests`, `public.recommendations`,
  `public.clinical_test_regions`, `public.recommendation_regions`) is behaviour with a durable oracle →
  **test**, plus a live HTTP run through the real doctor route.
- The **static gates** the lead added are themselves claims about what would redden → prove them by
  **fault injection**, not by reading them.
- There is **no automated UI test** in this repo (AGENTS.md §10a) — anything about screens is verified live
  in a browser or not claimed at all.

## Authority (audit is a gate against the owner's plan, never a source of scope)

- Canon: `AGENTS.md` — the single normative text; read §10a/§10b and §24 before starting.
- Plan / checklist: `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_PLAN.md` §5, stage **S0б** (lines ~346-365).
  Its live-verification line: «**Живая проверка:** то же, но для платформенного теста и платформенной
  рекомендации.»
- A finding with no matching line in that plan is a **question to the owner**, not work. Write such findings
  in a separate section «Вопросы владельцу (не FAIL)».

## What is under audit

- Clone: `/home/dev/dev-projects/bcb-wt-exercise-store-shared-item-form`, branch `wt/exercise-store-s0b`,
  head `372d35479` (a merge of current `feat/doctor-ui-rebuild`).
- Candidate commits: `c04f748df` (product), `36af599dc` (lead's test correction), `13ef014bd` (live proof
  test + a correction that turned out to be **wrong**), `36fff528e` (the previous independent audit report),
  **`fb046e96e` — the lead's fix that this audit must confirm**.
- The previous audit's report: `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_S0B_AUDIT.md` — verdict FAIL,
  «убито 6 / непойманных 2».

## The two findings the fix claims to close

**F1 — missing `INSERT(owner_kind)` grants.** The lead had claimed drizzle omits defaulted columns absent
from `.values(...)`, so the previous auditor's `42501` was a false positive. That claim was wrong: drizzle
NAMES every insertable column and PostgreSQL checks INSERT privilege on every NAMED column. `fb046e96e` adds
`owner_kind` to the `app_staff` INSERT grants of the four relations, plus a column-scoped
`SELECT(owner_kind)` on `clinical_test_regions` (the only one of the four whose SELECT is column-scoped, so
a new column is not covered automatically).

**F2 — the tenant wall gate was blind to removal of `org: true`.** `fb046e96e` makes the flag agree with a
census of the drizzle schema's own columns, freezing the 30 pre-existing gaps in `ORG_FLAG_CENSUS_BASELINE`.

## What you must prove (each item: your own command, your own output)

1. **F1 is really closed, live.** Log in as the DEV doctor (`dimmdao@yandex.ru` / `123456testTEST`, host
   `127.0.0.1`, NOT `localhost`; `/api/auth/dev-bypass` no longer exists — use
   `POST /api/auth/email-password/login` with `roleLoginPortal=doctor` and Origin/Referer headers) against a
   dev server you start yourself from this clone on an alternative port. **Do not touch the shared DEV on
   5200 and do not run `apps/webapp`'s `dev` script** — it hard-codes 5200 and kills the neighbouring chat's
   server; run `npx next dev -H 127.0.0.1 -p <alt port>` directly after copying `.env.dev` and `.env` from
   `/home/dev/dev-projects/BersonCareBot` (they are gitignored). Create a clinical test and a recommendation
   through the real HTTP routes, archive both, and read them back. Anything other than 200 is a FAIL.
2. **The fix did not open the tenant wall.** Show that a doctor still cannot write a platform-owned row
   (`owner_kind='platform'`) and cannot write into another organization, and that reading platform rows
   still obeys the single tariff switch `exercise_catalog`. Rollback transactions are the right instrument
   here, as they were on S0а.
3. **Both new static gates actually bite.** Fault-inject and show the exact failing line:
   `deploy/postgres/privileges/tenant-predicate-invariant.test.mjs` (remove `org: true` from `public.tests`)
   and `deploy/postgres/privileges/staff-drizzle-insert-grant-coverage.test.mjs` (remove the `owner_kind`
   grant). Revert every injection — a production break must not survive your run (only deliberate acceptance
   tests and audit artifacts may stay).
4. **The declaration is the only truth.** Confirm `GRANT` statements live in
   `deploy/postgres/privileges/declaration.ts`, that the three generated artifacts agree byte-for-byte
   (`pnpm run check:db-privileges-generated`), and that nothing tries to grant from inside a migration.
5. **The live-proof test is honest.** `RUN_PLATFORM_TESTS_RECOMMENDATIONS_READ_DB=1 node --test
   deploy/postgres/privileges/platform-tests-recommendations-read.devDbProof.test.mjs` must pass, and its
   policy fault matrix (`S0B_PLATFORM_POLICY_FAULT` ∈ `using_true|for_all|omit_org_null|omit_current_user`)
   must kill each injected policy. Report your own kill count, not the lead's.

## Known environment fact — read before calling F1 a regression

The DEV grants are applied by targeted `GRANT` because the standard `reconcile-access.mjs` currently rolls
back whole-cluster on foreign drift (`app.read_booking_payment_check(uuid)` is declared only in the unlanded
branch `bcb-wt-cold-source`). Anyone running a reconcile from `feat`'s declaration wipes them, because the
declaration change lives only in this branch — that already happened once during this session. So: if all
four INSERTs fail with `42501` at once, first check
`information_schema.column_privileges` as the `postgres` superuser. If the grants are absent from the live DB
while present in `deploy/postgres/generated/privileges.bcb_webapp_dev.sql`, that is the environment, not the
candidate — re-apply exactly those generated lines and say so in the report. If the grants ARE present and
the write still fails, that is a real FAIL.

## Rules of engagement

- Model/effort are set by the launcher; you are not weaker than the author.
- DEV only (`bcb_webapp_dev`, socket `/var/run/postgresql`). **PROD and TEST must not be touched.**
- Do not fix product code — you are the gate. Localized mechanical corrections belong to the lead (§24.1).
- Clean up your fixtures and say how you proved the cleanup (a count, not a claim).
- Commit your report before the turn ends, to
  `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_S0B_CONFIRMATION_AUDIT.md`, and end it with an explicit
  **«НЕ ПРОВЕРЕНО»** section (empty is allowed, absent is not) and a tally «убито N / непойманных M».

## Provider substitution — read this, it changes how hard you must push

The first launch of this audit died in 2.5 s with `quota_exhausted`: the codex account is spent until
2026-09-15 04:22, so `gpt-5.6-sol` is unavailable. The lead decided EXPLICITLY (not by silent failover) to
run this audit on the Claude provider instead, because waiting three days for a verification of an already
live-broken-and-fixed privilege wall is worse than a same-family audit. The consequence you must compensate
for: **the author of the fix under audit is also Claude**, so the usual cross-provider independence is
absent. Behave accordingly — trust nothing in the candidate's commit messages, reproduce every claim with
your own command and your own output, and prefer the live database and the live HTTP route over reading code
that looks correct.
