# D25 TEST port-context artifact repair

## Authority

- Read `AGENTS.md` route and the full sections relevant to generated DB privileges, tests, commits, and §24 orchestration before acting.
- Runtime evidence from the named TEST deploy at integration SHA `34d681969e033cdf434af57a71bef7ee3bb7656f`: `reconcile-access.mjs` failed its committed-artifact check because `deploy/postgres/generated/port-context-capabilities.bersoncarebot_test.sql` still describes `auth.phone-messenger-bind.completion-state`, while the declaration now generates `auth.phone-messenger-bind.claim` for `app.phone_messenger_bind_claim(text,text,text)`.
- Owner requirement: bot confirms the user's own phone through the messenger and supplies the login code; bot commands do not create accounts. This task does not change that product behavior. It repairs the derived access artifact required to deploy the already accepted D25 implementation.
- Источник оракула: `deploy/postgres/privileges/reconcile-access.mjs` — «generator('--db', dbName, '--check', '--port-context-only');»; acceptance means the existing generator's committed-artifact check passes without editing the declaration or product behavior.

## Scope

1. Use the existing privilege generator and existing commands. Do not hand-edit generated SQL.
2. Regenerate only the derived port-context capability artifact(s) that are demonstrably stale because of the already-landed D25 declaration. Inspect all existing named DEV/TEST port-context artifact variants and keep them consistent if the same declaration change affects them.
3. Run the generator's `--check --port-context-only` for every artifact changed and the narrow existing DB-privilege/unit tests that cover generation determinism and port-context declarations. No live DB and no TEST deploy in this worker.
4. Commit only the explicit generated artifact path(s) changed by this repair. Do not stage any other file.

## Forbidden

- No product code, migration, declaration, grant policy, runtime config, docs, taskdb, DB, deploy, or service changes.
- Do not touch, inspect, merge, delete, stage, or commit any `wt/therapysto-*`, `wt/night-*`, `wt/reaudit-*`, `wt/surface-map-audit-*`, or `wt/flashcall-research-*` branch/worktree/content.
- Do not touch foreign files or staging in the integration worktree.
- No `git add -A`, no push, no branch deletion.

## Done

- Existing generator produces the committed artifact byte-for-byte.
- All changed variants pass `--check --port-context-only` and narrow generation tests.
- Diff contains only necessary generated SQL changes corresponding to the D25 declaration.
- Commit before ending the one allowed turn and report commit SHA, exact changed paths, exact validation commands, and results.
