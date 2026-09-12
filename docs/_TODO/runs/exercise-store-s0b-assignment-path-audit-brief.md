# S0б exercise store — audit of the two assignment-path commits `b560235a3` and `3b4c4c176`

## Test or view (classification first — AGENTS.md §24.4)

Тест или взгляд: decide per surface and say so in the report.

- **Assigning a platform material** (into a test set, into a program stage) is repeatable behaviour with a
  durable oracle: with the tariff on it must succeed, with the tariff off it must not → prove it by **running
  it live** against a server you start yourself, and by trying to make it misbehave.
- The **unit tests added by the commits** are claims about the read boundary, not proof of it. Attack them:
  break the production code and confirm the test goes red; weaken the test and confirm it still passes when
  it should not.
- **Code-only questions** (does the lead's `itemRefOwnershipPredicate` refactor change behaviour for
  `exercise`/`lfk_complex`, which were already correct?) are a view — read and say so.

## Authority (audit is a gate against the owner's plan, never a source of scope)

- Canon: `AGENTS.md` (§10a — no automated UI tests in this repo, §10b, §24).
- Plan: `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_PLAN.md` §5, stage **S0б**. Its live-verification line
  requires the platform clinical test and platform recommendation to be usable by the doctor; the read-only
  card that stage landed promises in the interface «Материал доступен для назначения, но изменяется только
  администратором платформы». Both commits exist to make that promise true.
- Prior reports on this branch: `EXERCISE_STORE_S0B_AUDIT.md`, `EXERCISE_STORE_S0B_CONFIRMATION_AUDIT.md`,
  `EXERCISE_STORE_S0B_LIVE_ACCEPTANCE_AUDIT.md` (the last one recorded «НЕ ПРОВЕРЕНО» exactly on that
  promise — these two commits are the lead's answer to that gap).
- Findings with no matching plan line are **questions to the owner**, not work. Put them in a separate
  section «Вопросы владельцу (не FAIL)».

## What is under audit

Clone `/home/dev/dev-projects/bcb-wt-exercise-store-shared-item-form`, branch `wt/exercise-store-s0b`,
exactly two commits — everything before `e7362efa4` is already landed and already audited:

1. **`b560235a3`** — a test set could not actually receive a platform clinical test. The page offered it
   (`includePlatformBase` on the read), but `setTestSetItems` re-read each test через `testsPort.getById(id)`
   without the flag and threw «Тест не найден: <uuid>»; the set was created empty. Fix: `TestSetWriteOptions`
   gained `includePlatformBase`, passed from the three server actions and the API route (each of which has
   already made the tariff decision via `requireEntitlementForMutation`). Test:
   `apps/webapp/src/modules/tests/testSetsPlatformItem.test.ts`.
2. **`3b4c4c176`** — a program stage could not receive a platform recommendation or a platform clinical test.
   `assertItemRefExists` narrowed those two types to `organization_id = <own>`, while `exercise` and
   `lfk_complex` already honoured the platform layer. Fix: the ownership condition is extracted into
   `itemRefOwnershipPredicate` and applied in all four catalog branches. Test:
   `apps/webapp/src/infra/repos/pgTreatmentProgramItemRefValidation.platformLayer.unit.test.ts`.

## What you must prove (your own command, your own output)

1. **A platform material can actually be assigned — live.** Start a server yourself from this clone on an
   alternative port; **never run `apps/webapp`'s `dev`/`dev:turbo`/`dev:visual` script** (it hard-codes 5200
   and kills the neighbouring chat's DEV server) — use `NODE_ENV=development npx next dev -H 127.0.0.1 -p
   <alt>` after copying `.env.dev` and `.env` from `/home/dev/dev-projects/BersonCareBot`. Log in with
   `POST /api/auth/email-password/login` (`dimmdao@yandex.ru` / `123456testTEST`, host `127.0.0.1`, send
   `Origin`/`Referer` or the request is refused `csrf_origin_forbidden`). Prove all four:
   platform test into a test set; platform test into a program stage; platform recommendation into a program
   stage; own rows unchanged.
   **Environment trap the lead hit — do not repeat it:** Turbopack in this checkout served a **stale compiled
   module** after an edit, so a fixed code path kept failing 500. If a code change appears to have no effect,
   restart the dev server before concluding anything about the code.
2. **The tariff still governs.** With `exercise_catalog` disabled for the organization, the same four
   assignments must fail — the fix must not have turned the flag into a constant. Restore what you toggle and
   prove the restoration.
3. **The write path is not wider than the read path in the other direction.** The flag is passed as a literal
   `true` at four call sites in `b560235a3` on the argument that the entitlement guard above already decided.
   Verify that claim at each site: find a route into `setTestSetItems` that reaches it without an
   entitlement decision, or state that none exists and how you searched.
4. **The tests are real.** For each of the two test files: break the production code (one branch at a time)
   and show which cases go red; then show a change to the production code that the test does NOT catch, if
   you can find one. A test that stays green under fault injection is a FAIL of that commit.
5. **The refactor changed nothing for the two types that were already correct.** `exercise` and
   `lfk_complex` went through a hand-written condition before and go through
   `itemRefOwnershipPredicate` now — prove the predicate is equivalent (rendered SQL or live behaviour), or
   name the difference.
6. **Nothing else was quietly widened.** Look for other places where a write re-reads a catalog row without
   the platform layer (the same class as both defects). Report what you find as a finding only if the plan
   covers it; otherwise as a question to the owner.

## Rules of engagement

- Model/effort are set by the launcher. **Provider note:** the codex quota is exhausted until 2026-09-15
  04:22, so this audit runs on Claude — the same family as the author of the commits. The cross-provider
  independence is lost; compensate by reproducing everything yourself, trusting no commit message and no test
  name, and preferring live evidence over reading code.
- DEV only (`bcb_webapp_dev`, socket `/var/run/postgresql`). **PROD and TEST must not be touched.**
- Do not fix product code — you are the gate (§24.1 gives localized corrections to the lead).
- Clean up your fixtures and prove the cleanup with a count. The lead's own probe rows were deleted; the demo
  template stage `c117da6c-fd06-4823-8997-0e64895aaed5` must end with as many items as it had when you
  started.
- Commit your report before the turn ends to
  `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_S0B_ASSIGNMENT_AUDIT.md`, ending with an explicit
  **«НЕ ПРОВЕРЕНО»** section (empty allowed, absent not) and a tally «убито N / непойманных M».
