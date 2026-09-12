# S0б exercise store — audit of the live-acceptance commit `4a7bc831b`

## Test or view (classification first — AGENTS.md §24.4)

Тест или взгляд: decide per surface and say so in the report.

- The **DEV seeder** is a repeatable action with a durable oracle (idempotency, owner of child rows, the
  DEV-only guard) → prove it by **running it**, twice, and by trying to make it misbehave.
- The **read-only platform card** is screen behaviour. There are **no automated UI tests in this repo**
  (AGENTS.md §10a) → verify it **live in a browser** or do not claim it.
- The **four `FOR SELECT` policies applied to DEV** are a live-database state change → read the live
  `pg_policy`, compare with `deploy/postgres/generated/privileges.bcb_webapp_dev.sql`, and prove the policies
  grant no more than the artifact declares.

## Authority (audit is a gate against the owner's plan, never a source of scope)

- Canon: `AGENTS.md` (§10a, §10b, §24).
- Plan: `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_PLAN.md` §5, stage **S0б**, whose live-verification line is
  «**Живая проверка:** то же, но для платформенного теста и платформенной рекомендации.» The commit under
  audit exists to make exactly that line performable.
- The previous confirmation audit — `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_S0B_CONFIRMATION_AUDIT.md`
  (PASS on the fix, «убито 7 / непойманных 1») — declared the stage NOT land-complete because the four
  platform-read policies were missing on DEV and there were zero platform rows. This commit answers that.
- Findings with no matching plan line are **questions to the owner**, not work. Put them in a separate
  section «Вопросы владельцу (не FAIL)».

## What is under audit

Clone `/home/dev/dev-projects/bcb-wt-exercise-store-shared-item-form`, branch `wt/exercise-store-s0b`,
commit **`4a7bc831b`** only (everything before it was audited by the two previous reports):

1. `deploy/postgres/dev-platform-lfk-demo-seed.sql` — extended with a platform clinical test and a platform
   recommendation plus their region links.
2. Doctor catalog UI — clinical tests and recommendations now mark a platform row («Базовая библиотека») and
   render its card read-only (banner, disabled fieldset, no save/archive), copying the exercises pattern
   (`ExerciseForm.tsx`, `ExercisesPageClient.tsx`, `ExerciseTileCard.tsx`).

## What you must prove (your own command, your own output)

1. **The seeder is safe and idempotent.** Run it twice against `bcb_webapp_dev`; counts must not grow and no
   child row may disagree with its parent's owner. Show that its DEV guard actually refuses another database
   (prove the guard, do not read it — e.g. run the guard block against a scratch database you create and drop
   yourself, never against `bersoncarebot_test` or `therapysto_prod`).
2. **The doctor sees platform rows and cannot change them — live, in a browser.** Start a server yourself from
   this clone on an alternative port; **never run `apps/webapp`'s `dev` script** (it hard-codes 5200 and kills
   the neighbouring chat's DEV server) — use `npx next dev -H 127.0.0.1 -p <alt>` after copying `.env.dev` and
   `.env` from `/home/dev/dev-projects/BersonCareBot`. Log in with
   `POST /api/auth/email-password/login` (`dimmdao@yandex.ru` / `123456testTEST`, `roleLoginPortal=doctor`,
   host `127.0.0.1`, Origin/Referer headers). Check both catalogs: platform card read-only, own card still
   fully editable and still saves (a real save, not just a visible button).
3. **The UI restriction is not the only wall.** Confirm the server refuses a write to a platform row
   regardless of the UI, and that nothing in this commit relaxed a server-side check.
4. **The four policies on DEV match the declaration and nothing else.** Compare live `pg_policy` bodies with
   the artifact; look for a policy that is broader than declared, or one applied to a relation that should not
   have it.
5. **The tariff switch still governs both catalogs.** With `exercise_catalog` disabled for the organization,
   platform rows must disappear from tests and recommendations alike. Restore whatever you toggle and prove
   the restoration with a count.

## Rules of engagement

- Model/effort are set by the launcher. **Provider note:** the codex quota is exhausted until 2026-09-15, so
  this audit runs on Claude, the same family as the author of the commit. Compensate: reproduce everything
  yourself, trust no commit message, prefer live evidence over reading code.
- DEV only (`bcb_webapp_dev`, socket `/var/run/postgresql`). **PROD and TEST must not be touched.**
- Do not fix product code — you are the gate (§24.1 gives localized corrections to the lead).
- Clean up your fixtures and prove the cleanup with a count.
- Commit your report before the turn ends to
  `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_S0B_LIVE_ACCEPTANCE_AUDIT.md`, ending with an explicit
  **«НЕ ПРОВЕРЕНО»** section (empty allowed, absent not) and a tally «убито N / непойманных M».
