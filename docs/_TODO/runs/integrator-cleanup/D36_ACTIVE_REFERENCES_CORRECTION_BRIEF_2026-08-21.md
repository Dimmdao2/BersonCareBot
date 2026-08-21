# D36/D20 — correct active references after source-gate deletion

Authority: `AGENTS.md` §10a/§24.6, `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D20/D36, and the independent audit result `/home/dev/brain/runs/agent-port/test-hygiene-source-gates-audit-20260821.json`.

## Task

The independent audit accepted commit `15148db87`'s test deletions and retained coverage, but found exactly three active stale references to the deleted `deploy/postgres/privileges/port-context-callsite-catalog.test.mjs`:

- `apps/webapp/src/app/api/api.md` around former line 73;
- `deploy/HOST_DEPLOY_README.md` around former line 459;
- `apps/integrator/src/infra/db/repos/operatorDeliveryAttempts.ts` around former line 57.

Correct only those three active texts in the same branch. For the two docs, remove the false claim that the deleted exact-match test is why legacy routes remain; state only the real current operational/product reason already present in surrounding authority, without deciding health/web-push/materialization ownership beyond existing owner decisions. For the production comment, remove the false static-callsite-test explanation and describe the real surviving declaration/census fail-closed boundary only if confirmed in current code; otherwise keep a concise behavior-level comment without inventing a replacement gate.

Read `AGENTS.md` headings and §0/§10a/§12/§24 before editing, and search later owner decisions before acting. Do not touch product behavior, tests, gates, privilege declarations, generated SQL, historical audit records, or any other stale reference. No new abstraction or verification machinery is needed.

Run `git diff --check`, exact `rg` proving these three active false references are gone, and any syntax/type check only if the TypeScript comment edit somehow changes code (it must not). Commit explicit paths only. Do not push, deploy, run full CI, touch DB/DEV/TEST/PROD, create fixtures or disposable databases. This is the single bounded correction under the existing audit; no re-audit.

