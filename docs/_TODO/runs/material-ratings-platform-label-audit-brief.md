# Audit of `2a4d63110` — a rated platform material arrived without a title

## Test or view (classification first — AGENTS.md §24.4)

Тест или взгляд: decide per surface and say so in the report.

- **The label of a rated platform material** is repeatable behaviour with a durable oracle (with the tariff on
  it has a title, with the tariff off it has none) → prove it by **running it live**, on both doors: the API
  `GET /api/doctor/material-ratings/summary` and the page `/app/doctor/material-ratings`.
- **The extraction into a shared reader** is a one-off quality question — did the page's behaviour change? →
  read, and back it with a live comparison.
- The **added test** is a claim, not proof → attack it by breaking the production code.

## Authority (audit is a gate against the owner's plan, never a source of scope)

- Canon: `AGENTS.md` (§10a — no automated UI tests in this repo, §10b, §24).
- Plan: `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_PLAN.md` §7 item 8, which records this defect and states it
  is fixed **after** S0б landed, separately from the branch that was under audit. S0б itself landed as
  `c4de1da2d`.
- Findings with no matching plan line are **questions to the owner**, not work. Put them in
  «Вопросы владельцу (не FAIL)».

## What is under audit

Clone `/home/dev/dev-projects/bcb-wt-exercise-store-shared-item-form`, branch
`wt/material-ratings-platform-label`, exactly one commit **`2a4d63110`** on top of `db25b578d`:

- `api/doctor/material-ratings/summary/route.ts` passed a hard-coded `includePlatformBase: false` into the
  title reads, while `app/doctor/material-ratings/page.tsx` computed the flag from the tariff. Same rows, two
  doors, different answers — a rated platform exercise or complex came back with `label: null` in the
  analytics tab («Материалы» → `MaterialsAnalyticsTab.tsx`) while the page showed its title.
- The fix is not only the flag: the title reading lived twice, in the page and in the door. It is extracted
  into `app/app/doctor/material-ratings/materialRatingTitles.ts`; both doors now go through it, and the tariff
  decision stays with the caller. New test `materialRatingTitles.test.ts`.

## What you must prove (your own command, your own output)

1. **The defect was real and the fix closes it — live, both doors.** Create your own rating for a platform
   material (`public.material_ratings`, `target_kind='lfk_exercise'` or `'lfk_complex'`, a user of
   organization `a0000000-0000-4000-8000-000000000001`), then compare the door and the page **before** the
   commit and **after** it. Start a server yourself from this clone on an alternative port; **never run
   `apps/webapp`'s `dev`/`dev:turbo`/`dev:visual` script** (it hard-codes 5200 and kills the neighbouring
   chat's DEV server) — use `NODE_ENV=development npx next dev -H 127.0.0.1 -p <alt>` after copying `.env.dev`
   and `.env` from `/home/dev/dev-projects/BersonCareBot`. Log in with `POST /api/auth/email-password/login`
   (`dimmdao@yandex.ru` / `123456testTEST`, host `127.0.0.1`, send `Origin`/`Referer`).
   **Environment trap — do not repeat it:** Turbopack in this checkout serves a **stale compiled module**
   after an edit. Restart the dev server before every conclusion about the code; the lead lost half an hour
   to this twice. Also note the page paginates at 40 rows — a row can be on page 2.
2. **The tariff still governs.** With `exercise_catalog` disabled for the organization, the platform material
   must lose its title again (or the door must refuse earlier — say which, and prove it). Restore what you
   toggle and prove the restoration.
3. **The page did not change behaviour.** It used to build the three title maps inline and now calls the
   shared reader. Prove equivalence — same titles for content pages, own exercises, own complexes, same
   handling of a blank template title (`title?.trim()` → `null`), same pagination.
4. **The test is real.** Break the production code (one place at a time) and show which cases go red; then
   find, if you can, a change the test does NOT catch. A test that stays green under fault injection is a
   FAIL of this commit.
5. **The same class elsewhere in this surface.** `loadDoctorAnalyticsAudience`, the other analytics doors and
   `material-ratings/[kind]/[id]/page.tsx` — does any other pair of doors answer the same question with
   different flags? Report what you find as a finding only if the plan covers it; otherwise as a question.

## Rules of engagement

- Model/effort are set by the launcher. **Provider note:** the codex quota is exhausted until 2026-09-15
  04:22, so this audit runs on Claude — the same family as the author. Cross-provider independence is lost;
  compensate by reproducing everything yourself, trusting no commit message and no test name, and preferring
  live evidence over reading code.
- DEV only (`bcb_webapp_dev`, socket `/var/run/postgresql`). **PROD and TEST must not be touched.**
- Do not fix product code — you are the gate (§24.1 gives localized corrections to the lead).
- Clean up your fixtures and prove the cleanup with a count: `public.material_ratings` must end at **114**
  rows, the number it holds now.
- Commit your report before the turn ends to
  `docs/_TODO/SAAS_FOUNDATION/MATERIAL_RATINGS_PLATFORM_LABEL_AUDIT.md`, ending with an explicit
  **«НЕ ПРОВЕРЕНО»** section (empty allowed, absent not) and a tally «убито N / непойманных M».
