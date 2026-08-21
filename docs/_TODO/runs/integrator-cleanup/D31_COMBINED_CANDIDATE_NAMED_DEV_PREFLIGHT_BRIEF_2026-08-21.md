# D31 + landed D15 — combined rollback-only named-DEV preflight

Role: `auditor-live`. Verify the exact candidate branch `wt/d31-vk-channel-20260821` before D31 landing. This is
the mandatory owner-aware rollback-only gate for the ordered pending set already present in the candidate: landed
D15 at `20260821T040000` followed by D31 at `20260821T050000`. It is not a new blind audit, product fix or
migration apply.

Источник оракула: `AGENTS.md` §1 — «До аудита и landing кандидат миграции обязан пройти owner-aware rollback-only
preflight против именованной DEV из точного candidate checkout».

Тест или взгляд (§24.4): one-time owner-aware rollback-only runtime look. No new test, kill-set, fault injection,
product correction or documentation rewrite.

Before action read the `AGENTS.md` heading map, then §1/§1b, §5/§6, §9–§10 and §24; read
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`,
`deploy/HOST_DEPLOY_README.md` and `deploy/host/migrate-dev.sh`. Search `OWNER_DECISIONS.md`,
`OWNER_PRODUCT_RULES.md`, the current Track D `WORK_ORDER.md`, the Track D handoff and later dated D31/D15
documents. A later owner ruling replaces this brief. Current applicable owner decision remains Р-D31: «делать API
для VK, инсту удалять»; no later ruling permits fixture data, a disposable database or landing before candidate
preflight.

## Exact candidate

- Prove commit `9f3953ecd9a2bd187bc628d87e1adee129a2c100` is an ancestor of launch HEAD and the tracked tree is clean
  before temporary env copies.
- Prove integration commit `da204db05` is an ancestor of launch HEAD; only the accepted D31 factual-report/brief
  and merge commits may follow the accepted product correction.
- Exact D15 migration blob must be
  `eef3e05c62b29aba3d3919efeda599e0e3c5ef12` for
  `apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql`.
- Exact D31 migration blob must be
  `d46fdec559c10078028c60783f54a4b742ddcc3e` for
  `apps/webapp/db/drizzle-migrations/20260821T050000_add_vk_messenger_settings.sql`.
- Target only named DEV `bcb_webapp_dev` on DEV/TEST host `151.241.228.122`.

## Only DB operation allowed

Run exactly from this candidate worktree:

```bash
bash deploy/host/migrate-dev.sh --preflight
```

The canonical wrapper must identify and validate the pending ordered set in one rollback-only transaction. The
result must explicitly name the observed pending count/tags or otherwise prove that both exact blobs were the
candidate inputs. It must reach explicit `ROLLBACK`, write no ledger row and apply nothing.

Forbidden: `--execute`, `--reapply`, direct `psql`, manual SQL, fixture/seed/account/clinic/data creation,
disposable database, historical replay, TEST/PROD, landing, deploy, push and full CI. Do not fix a failure as
`auditor-live`.

## Detached mechanics and cleanup

First prove no TEST deploy, full CI, other migration process or migration lock is active. If one is active, wait a
bounded maximum of 15 minutes with checks no more frequent than every 5 minutes; if still active, report BLOCKED
without starting the wrapper.

The candidate stores no env. In a detached child create regular non-symlink mode-0600 copies of canonical
`/home/dev/dev-projects/BersonCareBot/.env` and
`/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` at the corresponding candidate paths. Use a runner with
an EXIT trap that removes only those two copies. Launch it with `setsid`, log to
`/tmp/d31-combined-candidate-preflight-20260821.log`, PID file
`/tmp/d31-combined-candidate-preflight-20260821.pid`, and wait for terminal exit in this single turn.

Never read or print env values, URLs, passwords, contacts or PII. After terminal result prove the child stopped,
both env copies and PID file are gone, no migrate lock is held, and tracked tree is clean.

## Result contract

Create and commit only
`docs/_TODO/runs/integrator-cleanup/D31_COMBINED_CANDIDATE_NAMED_DEV_PREFLIGHT_RESULT_2026-08-21.md` with launch
HEAD, both exact blobs, command, exit code, safe last lines, PASS|FAIL|BLOCKED, explicit rollback/ledger evidence,
pending-set evidence, cleanup and:

`NOT DONE: landing / execute migrations / live VK delivery gate / TEST / deploy / push / full CI`.

Stage only that result path, never `git add -A`; commit before ending the turn. Do not end while a detached child is
still running.
