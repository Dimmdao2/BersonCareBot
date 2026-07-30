# MISSION: audit stage 2 — the access lifecycle mechanism (`380b7aa39`, `297bd0bfb`). You MAY run tests; you may NOT change files.

This is the core of the rewrite: the owner forbade the agent from deciding what is limited and for how long. Judge whether
the mechanism really moved those decisions into his hands, and whether it works.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a — stage 2 (2.1–2.7, 2.6a, 2.6b) and 3.1a, 3.1b.
  Item 2.6c is an open question to the owner — it must NOT be implemented; flag it if it was.
- **Canon:** `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §4a, §1 (owner quotes), §3, §5.
- **Worker claims (verify, do not trust):** `docs/_TODO/runs/tariff-mechanics/STAGE2_REPORT.md`, including its section
  «что осталось не настраиваемым и почему».

## Questions

1. **Does the owner now decide?** For each of the four fields (grace days, warning count, read-only days, terminal state)
   on both levels: can he set it, is «не настроено» a real state rather than a silent default, and does the mechanic level
   really beat the system level? Then hunt for what the worker may have left as his own choice: search the runtime for any
   duration, threshold, count or terminal state that is still a literal. The worker claims a static search found none —
   repeat it independently, including migrations, seeds, SQL and the constructor.
2. **Is the ladder correct where it matters?** `терпение` must behave exactly like enabled plus a dated warning;
   `только чтение` must allow reading and exporting and refuse creating and changing; `выключено` must hide the section
   for the specialist AND for his patients without deleting anything, and data must return unchanged when switched back on.
   Verify the last part specifically — that nothing is destructive.
3. **Is the read gate really open no more?** `requireEntitlement.ts` used to return `{ ok: true }` for every read, which
   made seven registry rows toothless, including the patient course list. Confirm the early return is gone and that reads
   now follow the ladder — and that no read got gated in a state where it must stay allowed (`терпение`, `только чтение`).
4. **Critical mechanics.** Patient card, patient app, reminders and notifications, two-factor authentication, the
   operations log, export, emergency help: prove they cannot be laddered even with a stored `false` or a tariff policy.
5. **Migrations and deploy contract.** The new migration is temporary (`0276_..._local.sql`) — the lead assigns the final
   number. Check it is forward-only, that removing the historical `7/3/21` seed cannot break an existing organization,
   and that no `SECURITY DEFINER` was added without the deploy counter and contract tests.
6. **Not out of scope:** billing (`SAAS_BILLING_PLAN.md`), the mock-payment routes, the plan and canon files must be
   untouched. `git diff --stat` against canonical `feat`.
7. **Test sensitivity.** For the three most load-bearing tests, name the code change that would slip past them.

## Run yourself

`pnpm --filter webapp typecheck`, `lint`, the affected test files with exact `vitest run <file>`, and the concurrency
proof if one exists. Report the numbers you saw. **Never the full CI.**

## Output

`VERDICT: PASS | PASS WITH FIXES | FAIL`, a per-item table, numbered MUST FIX (empty is valid), «что теперь верно», «что
осталось за лидом на живом DEV», commands with results, and confirmation the clone tree is clean.
