# MISSION: audit `2bf56b79f` — the door call moved off raw SQL (read-only, tests allowed)

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a — item **3.1d**; scope §1; policy §2.
- **Rule that was violated and must now hold:** `.cursor/rules/clean-architecture-module-isolation.mdc`, the section at the
  top («доступ к базе — оба приложения, без исключений»): database access only through the app's own drizzle layer, raw SQL
  banned for new code, the neighbouring file's style is not authority.
- **Worker claims (verify, do not trust):** `docs/_TODO/runs/tariff-mechanics/DOOR_PORT_REPORT.md`.
- **Owner's framing:** he objected to the phrase «порт делается» — the integrator already HAS a DB port
  (`apps/integrator/src/infra/db/drizzle.ts`, `getIntegratorDrizzleSession`). Nothing new should have been invented; the
  door must be one repository function on top of the existing port.

## Questions

1. **Did it use the existing port or invent a parallel one?** The new file must sit on `getIntegratorDrizzleSession` and add
   nothing that duplicates the existing DB port abstraction. If it introduced a second abstraction, that is a MUST FIX.
2. **Placement consistency.** The other drizzle repositories of the integrator live in `apps/integrator/src/infra/db/repos/`
   (there are many). The new file was put in `infra/db/` root. Say whether that breaks the layer's convention and should
   move — this is a legitimate finding, not a style preference, if every sibling repo lives in `repos/`.
3. **No raw SQL in our code.** Verify with your own search that the door is not called through `db.query` / `txDb.query`
   anywhere we own. The worker used drizzle's parameterised `sql` fragment via `.execute()` because the table DSL cannot
   express a parameterised set-returning function — confirm that is what the code actually does and that parameters are
   bound, not interpolated into the string.
4. **The guarantees survived.** Principal required; a missing, invalid or failing answer refuses the write; terminal state
   refuses; `терпение` allows. Check the three mutation results the worker reported by reasoning about the tests.
5. **The diary path changed by one call only.** Its own logic and SQL untouched; its existing tests still green. The owner
   is filing that whole path for deletion, so the port must survive its removal — verify nothing in the port depends on the
   diary module.
6. **Scope:** `git diff --stat` — four files only, nothing in the rest of the `directPublic` family (the owner rewrites that
   separately), no migration, no plan or canon edits.

## Run yourself

Integrator `typecheck`/`lint`, the two affected test files via exact `vitest run <file>`, webapp `typecheck`. Report real
numbers. **Never the full CI.**

## Output

`VERDICT: PASS | PASS WITH FIXES | FAIL`, the six answers with file:line evidence, numbered MUST FIX (empty is valid), and
confirmation the clone tree is clean.
