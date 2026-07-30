# MISSION: correction after the seam audit — a migration that may never apply, and two red tests

Sol failed the seam audit on three points, Opus passed it structurally but could not run a single command and raised one
operational warning that outranks everything else. Fix in this order.

## Fix 1 — the door may never reach DEV or TEST (highest priority)

The 3.1c door SQL was **appended to the already-existing stage-2 migration file** `0276_access_lifecycle_ladder_local.sql`.
The drizzle migrator applies by tag/watermark, not by content hash: wherever `0276` was already applied, `pnpm migrate`
skips the file, the function never gets created, and both new deploy gates FATAL because `expected_secdef_count` will not
match. Move the door into its own NEW migration file (next free number, temporary — the lead assigns the final one at
merge), leaving `0276` as it was when it may have already run. Make the new file idempotent-safe (`create or replace`,
grants re-applied) so it is harmless where the object already exists.

## Fix 2 — two red tests

`vitest run` on the stage-2 UI surfaces gives 0/2: the fake port used by those tests does not implement
`resolveMechanicAccess`. Implement it in the fake so the tests exercise the real contract, and get both back to green.
Do not weaken the tests to make them pass.

## Fix 3 — the rehearsal proves too little

The private-PostgreSQL rehearsal currently proves the function exists and returns policy columns. Extend it with the
behaviours that only a real database can show, because both contract tests are mock-based (`writeDiaryLfkDirect.test.ts`
stubs `db.query` by SQL substring):

- a mismatched or absent organization principal raises instead of returning a permissive row;
- `только чтение` allows reading and refuses mutation;
- a critical mechanic stays full-access even with a stored `false`;
- `payments` and `branding` traverse the ladder with no special case.

Each case must fail if the corresponding SQL branch is removed. Report the exact failure text you saw for at least two of
them.

## Not a defect — do not "fix" it

Sol's point 2 asked that adding a NEW ladder state require neither code nor migration. The lead rejected it and narrowed
the canon (§4a, item 2): durations, warning count, terminal choice and whether a step applies at all are data; the SET of
states and their meaning stay in code, exactly as Stripe fixes its three end behaviours and configures only the choice and
the timings. Do not build a data-driven state catalogue.

## Constraints

- Do not touch billing or the mock-payment routes; do not edit the plan or the canon.
- Targeted runs only: webapp `typecheck`/`lint`, integrator checks, exact `vitest run <file>`, the rehearsal. **No full CI.**
- Never `git add -A`. Commit in this clone; no push, no merge. Live DEV migration stays with the lead.

## Report

Per fix: `what was wrong → what you changed (file:line) → what you ran → what you saw`. For fix 1 state explicitly why the
new file is safe both where `0276` already ran and where it did not.
