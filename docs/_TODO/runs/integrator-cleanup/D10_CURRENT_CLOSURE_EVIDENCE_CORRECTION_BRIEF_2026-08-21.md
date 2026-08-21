# D10 closure evidence correction brief (2026-08-21)

## Источник оракула
«A number without the command that produced it is not a number» — root `AGENTS.md`; independent audit session `6282ca28-1385-46d6-9e73-e996265d2c5f` finding against `8be1dd3b6`; D10 owner requirement in `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`.

The audit accepts the D10 closure substance but requires repo-traceable commands for three later facts. Add one
short current evidence report under `docs/_TODO/runs/integrator-cleanup/` and link it from D10. Do not delete or
rewrite the older pre-apply audit reports; label their earlier state superseded by the later execute/deploy evidence.

The report must record exactly:

1. Historical integration gate: lead ran
   `/home/dev/brain/host-orch/run-tests.sh "pnpm run ci"` on SHA `f6c39c9a0`; exit `0`. Do not claim a preserved
   raw log if none exists.
2. Current live revalidation command for each named DB:
   `sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d <DB> -v ON_ERROR_STOP=1`, inside
   `BEGIN READ ONLY`, querying `drizzle.__drizzle_migrations` for tag
   `20260820T210709_retire_projection_outbox`, `to_regclass('integrator.projection_outbox') IS NULL`, and
   `to_regprocedure('app.read_integrator_projection_health(integer)') IS NULL`. On both `bcb_webapp_dev` and
   `bersoncarebot_test` the measured tuple is `1 / true / true`.
3. Current TEST runtime command/evidence: `git -C /opt/projects/bersoncarebot-test rev-parse HEAD` → full SHA
   `6fa2f6e1b4d22e7f0a7aefc15dae5870566fc1c4`; `systemctl is-active` for api/scheduler/webapp/media-worker →
   `active`, legacy worker → `inactive`; loopback webapp/api health → `{ok:true,db:"up"}`; and
   `git merge-base --is-ancestor f6c39c9a0 6fa2f6e1b` → exit `0`.

Update only the D10 evidence paragraph/link and, if needed, the matching handoff sentence. No product, tests,
DB action, full CI, deploy or push. `git diff --check`; commit. Existing audit is reused, no new audit pass.

