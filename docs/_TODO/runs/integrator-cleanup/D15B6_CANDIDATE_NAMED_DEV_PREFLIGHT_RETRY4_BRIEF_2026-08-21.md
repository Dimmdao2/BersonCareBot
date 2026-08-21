# D15b/6 — rollback-only named-DEV preflight retry 4

Role: `auditor-live`. Verify exact candidate
`84de240b8ad113cd9bc7333313c0dbb22fd3fc32` in `wt/d15b6-audit-20260821` before landing. This is the
same saved runtime gate after the exact language-usage metadata fix, not a new blind audit, product fix or migration
apply.

Источник оракула: `AGENTS.md` §1 — «До аудита и landing кандидат миграции обязан пройти owner-aware rollback-only
preflight против именованной DEV из точного candidate checkout».

Classification under §24.4: one-time owner-aware rollback-only runtime look. No new test, kill-set, fault injection
or product correction.

Before action read the `AGENTS.md` map, then §1/§1b, §5/§6, §9–§10 and §24; read
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`,
`deploy/HOST_DEPLOY_README.md` and `deploy/host/migrate-dev.sh`. Repeat code-search and exact search across later
owner decisions, current Track D handoff/WORK_ORDER and previous preflight reports. A later owner ruling replaces
this brief.

## Exact candidate

- Prove `84de240b8` is an ancestor of HEAD and tracked tree is clean before temporary env copies.
- Exact migration blob on candidate:
  `eef3e05c62b29aba3d3919efeda599e0e3c5ef12` for
  `apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql`.
- After the product SHA only orchestration/result/merge commits are permitted; no later migration diff.
- Target only named DEV `bcb_webapp_dev` on DEV/TEST host `151.241.228.122`.

## Only DB operation allowed

Run exactly from this candidate worktree:

```bash
bash deploy/host/migrate-dev.sh --preflight
```

The canonical wrapper executes pending owner-marked statements in one transaction and rolls back; it must not write
the migration ledger/apply. Its built-in declaration-derived registry seed is the only permitted transient setup.
Forbidden: `--execute`, `--reapply`, direct `psql`, manual SQL, fixture/seed/account/data creation, disposable DB,
historical replay, TEST/PROD, landing, deploy, push and full CI. Do not fix a failure as auditor-live.

## Detached mechanics and cleanup

Candidate stores no env. In the detached child create regular non-symlink mode-0600 copies of canonical
`/home/dev/dev-projects/BersonCareBot/.env` and
`/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` at the corresponding candidate paths. Use a runner with
an EXIT trap that removes only those two copies. Launch it with `setsid`, log to
`/tmp/d15b6-candidate-preflight-retry4-20260821.log`, PID file
`/tmp/d15b6-candidate-preflight-retry4-20260821.pid`, and wait for terminal exit in this single turn.

Never read or print env values, URLs, passwords, contacts or PII. After terminal result prove the child stopped,
both env copies and PID file are gone, no migrate lock is held, and tracked tree is clean.

## Result contract

Create and commit only
`docs/_TODO/runs/integrator-cleanup/D15B6_CANDIDATE_NAMED_DEV_PREFLIGHT_RETRY4_RESULT_2026-08-21.md` with exact
SHA/blob, command, exit code, safe last lines, PASS|FAIL, rollback/ledger evidence, cleanup and:

`NOT DONE: landing / execute migration / D31 combined preflight / live login-bind-delivery gate / TEST / deploy / push / full CI`.

Stage only that result path, never `git add -A`; commit before ending the turn.
