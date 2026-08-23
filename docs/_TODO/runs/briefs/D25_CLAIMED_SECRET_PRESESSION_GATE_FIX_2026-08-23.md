# D25 — claimed-secret pre-session gate deploy fix

## Authority

- Read `AGENTS.md` route and the complete sections for schema-B migrations, DB privilege boundaries,
  tests, commits, and §24 orchestration before acting.
- Owner decision in `docs/OWNER_DECISIONS.md`: the bot proves ownership of the user's phone through
  the messenger and delivers the code, but generic bot ingress never creates an account. This repair
  does not change that behavior.
- Named TEST deploy of integration commit `423f9d03a` applied all pending migrations, then
  `reconcile-access.mjs` stopped with:
  `pre-session exact gate missing or mismatched: app.phone_messenger_bind_claimed_secret(text,text,text)`.
- Source of oracle: `deploy/postgres/privileges/generate.mjs`,
  `generatePreSessionGateAssertionLines()`. A declared `pre_session` root must be PL/pgSQL and its first
  executable statement after `BEGIN` must be the exact `app.require_accepted_context(...)` call with
  the declared purpose, typed argument hash, and its own `regprocedure` identity.

## Measured break

`app.phone_messenger_bind_claim(text,text,text)` already has the exact first-statement gate. Its sibling
`app.phone_messenger_bind_claimed_secret(text,text,text)` is declared as the same `pre_session` class but
the landed migration `20260823T110000_phone_messenger_bind_claims_are_token_bound.sql` creates it as
`LANGUAGE sql`, so the live reconcile gate cannot accept it.

## Scope

1. Add one new timestamp forward migration. Do not edit or re-label the already-ledgered
   `20260823T110000_phone_messenger_bind_claims_are_token_bound.sql` migration.
2. `CREATE OR REPLACE` only
   `app.phone_messenger_bind_claimed_secret(text,text,text)` as PL/pgSQL under the existing
   `app_seam_phone_binding_owner` migration owner. Preserve its exact argument names, result columns,
   volatility, security-definer status, search path, filtering, ordering, and limit.
3. Make the exact declared gate the first executable statement after `BEGIN`, then return the existing
   query with `RETURN QUERY`. Use the declaration's current purpose
   `auth.phone-messenger-bind.claimed-secret.read`, typed-argument hash, and exact function identity.
4. No `GRANT`, `REVOKE`, role membership, policy, table/index/column DDL, declaration change, product
   code, or generated-artifact hand edit. Regenerate/check derived artifacts only if the repository's
   existing generator proves they changed.
5. Reuse or add the narrowest behavior/migration proof that demonstrates both: the exact pre-session
   gate shape is accepted, and the function's row-selection behavior is unchanged. Do not add a source-
   text/count guard in place of behavior.
6. Run targeted migration/generator/DB-privilege tests, webapp typecheck only if touched paths require it,
   and `git diff --check`. No full CI and no live DB command in the worker.
7. Commit only explicit task paths and report the SHA, paths, commands, and results.

## Lead and audit gates after worker

- An independent reviewer must audit the exact candidate against this brief and the owner decision.
- The lead, not the worker, runs the existing named-DEV rollback-only migration preflight from the exact
  candidate before landing.
- Only an audited candidate with green preflight may be landed and used for the TEST retry.

## Forbidden

- No DEV/TEST/PROD mutation, deploy, service command, raw recovery SQL, or disposable database.
- Do not touch, inspect, merge, delete, stage, or commit any Therapysto/night/reaudit/surface-map/
  flashcall branch, worktree, or content.
- No branch or worktree deletion. No push. No `git add -A`.

## Done

- The live reconcile failure class is removed by a forward migration, without broadening the caller's
  rights or changing the phone-confirmation product flow.
- Existing query semantics remain intact.
- Narrow validation is green, the candidate is committed, and the branch/worktree remain present.
