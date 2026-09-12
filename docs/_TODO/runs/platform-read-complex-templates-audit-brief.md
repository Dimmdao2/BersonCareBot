# Audit of `9b7857f45` — the platform complex template was invisible to staff (code built the branch, RLS did not return the row)

## Test or view (classification first — AGENTS.md §24.4)

Тест или взгляд: decide per surface and say so in the report.

- **Whether a platform complex template reaches the doctor** is repeatable behaviour with a durable oracle
  (policies on → the row is there; policies off → it is not) → prove it by **running it live** on the page
  `/app/doctor/lfk-templates` and on the card `/app/doctor/lfk-templates/<id>`, and in SQL as `app_staff`.
- **Whether the new policies open anything they should not** (writes, foreign organizations, the unprincipled
  session) is a security boundary → attack it directly in SQL, do not read the generator and believe it.
- **The added DB proof test** is a claim, not proof → break the policy it installs and show which cases go red;
  then look for a change it does NOT catch.

## Authority (audit is a gate against the owner's plan, never a source of scope)

- Canon: `AGENTS.md` (§10a — no automated UI tests in this repo, §10b, §24), and the privileges canon:
  the ONLY declaration is `deploy/postgres/privileges/declaration.ts`; generated SQL is an artifact.
- Plan: `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_PLAN.md` — S0а/S0б and §7 item 10а, which records exactly
  this gap («у `public.lfk_complex_templates` политика чтения для `app_staff` одна — `rev10_saas_org_dormant_p0_8_3`,
  и платформенной ветки в ней НЕТ»). The owner ordered it fixed rather than filed as a question.
- Findings with no matching plan line are **questions to the owner**, not work. Put them under
  «Вопросы владельцу (не FAIL)».

## What is under audit

Clone `/home/dev/dev-projects/bcb-wt-exercise-store-shared-item-form`, branch
`wt/platform-read-complex-templates`, exactly one commit **`9b7857f45`** on top of `648b858c9`:

- `deploy/postgres/privileges/declaration.ts` — `public.lfk_complex_templates` and
  `public.lfk_complex_template_exercises` added to `REV10_PLATFORM_LFK_READ_RELATIONS`;
- three regenerated artifacts (dev/test/prod), two lines each: `rev10_platform_lfk_read_95` / `_96`;
- `deploy/postgres/privileges/platform-complex-templates-read.devDbProof.test.mjs` (new, 7 cases);
- `deploy/postgres/dev-platform-lfk-demo-seed.sql` — a platform complex template built из платформенных
  упражнений (without it there is nothing to look at: platform complexes are authored only in S0в).

Context you will need: since S0а, `apps/webapp/src/infra/repos/pgLfkTemplates.ts` (≈`:411`, `:609`, `:695`)
already builds the platform branch in SQL, and the page gates the platform layer on the `exercise_packages`
entitlement (NOT `exercise_catalog` — that one gates the exercise catalogue). The DEV tariff
«ПОЛНЫЙ ДОСТУП — РАЗРАБОТЧИК» has both on.

## What you must prove (your own command, your own output)

1. **The defect was real and the fix closes it — live.** Drop the two policies inside a transaction (or on DEV
   and re-create them), reload `/app/doctor/lfk-templates` as `dimmdao@yandex.ru` and count the platform
   complex; then restore and count again. The lead measured 0 → 1. Reproduce it yourself; a count you did not
   take does not exist.
2. **Read only, staff only, and no wider than the platform layer.** As `app_staff` with an organization
   context: the platform template and its items are readable; a FOREIGN organization's template is NOT; INSERT
   / UPDATE / DELETE on a platform-owned row is refused; with no `app.current_org_id()` set nothing comes back.
   `app_staff` is the only grantee — check no other role gained anything (`--port-context-only` artifact too).
3. **The generator is the only source.** `pnpm run check:db-privileges-generated` must be clean, and a
   hand-edit of a generated file must make it fail — prove the gate actually bites.
4. **The proof test is real.** `RUN_PLATFORM_COMPLEX_TEMPLATES_READ_DB=1 node --test deploy/postgres/privileges/platform-complex-templates-read.devDbProof.test.mjs`
   and the four fault injections `S0_COMPLEX_POLICY_FAULT=using_true|for_all|omit_org_null|omit_current_user`.
   Then find, if you can, a policy change the test does NOT catch. A test green under fault injection is a FAIL.
   Note the test installs its policies by exact name **inside a rolled-back transaction** — verify it really
   rolls back: `public.lfk_complex_templates` must hold the same rows before and after your run.
5. **The card cannot be edited.** `app/app/doctor/lfk-templates/[id]/page.tsx` must render the read-only panel
   for `ownerKind === 'platform'`. Prove it from the door, not from the JSX: try to save a platform template
   through the API as the doctor and show what comes back.
6. **The seed is idempotent and honest.** Run it twice; the second run must insert nothing. Its items must
   reference PLATFORM exercises — `app.enforce_lfk_child_owner()` raises `lfk_template_exercise_owner_mismatch`
   otherwise.
7. **The same class elsewhere.** Which other relations does `pgLfkTemplates.ts` / the exercise store read on the
   platform path, and does each have a `rev10_platform_lfk_read_*` policy? Name any that do not. Report as a
   finding only where the plan covers it; otherwise as a question.

## Rules of engagement

- Model/effort are set by the launcher. **Provider note:** the owner has forbidden codex outright
  («Кодекс не трогаешь — работай на клоде»), so this audit runs on Claude — the same family as the author.
  Cross-provider independence is lost; compensate by reproducing everything yourself, trusting no commit
  message and no test name, and preferring live evidence over reading code.
- DEV only (`bcb_webapp_dev`, socket `/var/run/postgresql`). **PROD and TEST must not be touched.**
  Beware: a reconcile from feat wipes policies declared only on this branch — it already happened once. If the
  platform complex disappears mid-audit, check `pg_policies` before concluding anything about the code.
- A dev server is already up on `127.0.0.1:5216` from this clone. If you need your own, use
  `NODE_ENV=development npx next dev -H 127.0.0.1 -p <alt>`; **never** run `apps/webapp`'s `dev`/`dev:turbo`
  script (hard-codes 5200 and kills the neighbouring chat's server). Log in with
  `POST /api/auth/email-password/login` (`dimmdao@yandex.ru` / `123456testTEST`, host `127.0.0.1`, send
  `Origin`/`Referer`).
  **Environment trap:** Turbopack in this checkout serves a **stale compiled module** after an edit — restart
  the server before any conclusion about the code.
- Do not fix product code — you are the gate (§24.1 gives localized corrections to the lead).
- Clean up after yourself and prove it with counts (policies present, seeded rows unchanged).
- Commit your report before the turn ends to
  `docs/_TODO/SAAS_FOUNDATION/PLATFORM_READ_COMPLEX_TEMPLATES_AUDIT.md`, ending with an explicit
  **«НЕ ПРОВЕРЕНО»** section (empty allowed, absent not) and a tally «убито N / непойманных M».
