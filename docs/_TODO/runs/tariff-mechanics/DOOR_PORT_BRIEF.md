# MISSION: move OUR door call to a proper drizzle port — and only our code

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a — item **3.1d**; scope §1; policy §2.
- **Canon:** `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §4a.
- **Owner rulings 30.07 that shape this task, verbatim:** «вся семья directPublic написана сырым SQL — значит я отдам это
  переписывать всё» · «а ты сейчас переписывай СВОЙ код весь через правильный порт. НЕ ЛФК-ДНЕВНИК» · «лфк-дневник я тоже
  сейчас заведу на удаление».

## What to do

The lifecycle door is currently called with raw SQL inside the integrator's diary writer
(`apps/integrator/src/infra/db/directPublic/writeDiaryLfkDirect.ts:171`). `AGENTS.md:493` bans raw SQL for new code, and
drizzle is available in the integrator (`apps/integrator/package.json`, `src/infra/db/drizzle.ts`,
`integratorDrizzleSchema.ts`).

1. **Create a dedicated port for the door** on the integrator side, implemented with drizzle, whose single job is: given
   an organization and a mechanic, return the ladder state and whether mutation is allowed. It must be usable from any
   integrator write path, not just the diary one.
2. **The diary path calls that port in one line.** The diary's own logic, its SQL and its behaviour stay untouched — the
   owner is filing that whole path for deletion, so deleting it later must remove only the call, never the port.
3. **Do not touch the rest of the `directPublic` family** (seven files). Their raw SQL is the owner's separate workstream.
   Rewriting them here would silently widen scope and duplicate his work.
4. The port must keep the guarantees the audit already proved: the call requires the organization principal and cannot
   return a permissive result without one; a missing or failed answer refuses the write rather than allowing it.

## Acceptance

- No raw SQL in our code: show the search proving the door is no longer called via `db.query`/`txDb.query` anywhere we own.
- A test on the new port: with the mechanic in the terminal state the write is refused; in `терпение` it is allowed; with
  no principal the call fails closed. Prove each by removing the check by hand and reporting the exact failure.
- The diary path's existing tests stay green — you changed one call, not its logic.
- Targeted runs only: integrator `typecheck`/`lint`, webapp `typecheck`, exact `vitest run <file>`, and the private
  PostgreSQL rehearsal if it covers the door. **No full CI.**

## Constraints

- Never `git add -A`. Commit in this clone; no push, no merge. Do not edit the plan or the canon. Keep migration numbers
  as they are — this task adds no migration.

## Report

`what the port looks like (file:line) → how the diary path calls it → the search output proving no raw SQL in our code →
the three mutation results`. If the drizzle layer cannot express the function call, say so plainly with the reason instead
of falling back to raw SQL quietly.
