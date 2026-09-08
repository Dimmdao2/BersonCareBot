# TEST acceptance defect batch: booking runtime

Role: WORKER. Read the AGENTS.md heading map first, then fully read sections 1/1b, 4a, 5, 9-10b and 24, including
all migration and privilege subsections. Read deploy/HOST_DEPLOY_README.md, SERVER CONVENTIONS, and active booking,
prepayment and reminder plans that own the touched code. Owner authority is the current full TEST acceptance task:
fix the accumulated reachable runtime failures without inventing new behavior.

Источник оракула: текущая owner-задача полной приёмки TEST — «найти все ошибки, которые за этот проход вылились
где-то у нас в базе данных, в системе, в логах, ну везде ... всё собрать суммарно».

Work only in this branch/worktree. Do not push, deploy, restart services, mutate named TEST/DEV data, create a
temporary database, or touch PROD.

Observed failures after TEST deploy of 6102a732d498:

1. Every minute, `app.expire_due_booking_prepayments(integer)` fails for `bcb_test_webapp_staff` with SQLSTATE
   42883: `function pg_catalog.greatest(integer, integer) does not exist`. The failing body explicitly qualifies
   `least/greatest` under `pg_catalog`. Find the owning migration/source and repair the function using the
   repository's established safe SQL pattern. Preserve limits and transaction semantics.
2. A real booking creation at 03:33:42 logged deferred lifecycle delivery failure:
   `appointment_reminders: APPOINTMENT_REMINDER_MATERIALIZATION_FAILED:403`. Trace the exact webapp→integrator
   call, TEST runtime contract, service logs and privilege/authorization path. Fix it only if it is a code,
   declaration, migration, or runtime-contract defect in this delivery; if it is missing external configuration
   or intended policy, report the exact named operational blocker instead of weakening authorization.

Migration rule: migrations contain no GRANT/REVOKE/role/policy statements. Any created/replaced function requires
the full privilege-body analysis and declaration/generator updates in the same workstream. Never replay migration
history or create a disposable DB; use static/generated checks and named environment read-only evidence only.

Testing discipline: WORKER DOES NOT WRITE OR MODIFY TESTS. Run existing targeted tests and the exact migration /
privilege generator checks required by the touched paths. No full CI. Do not hide runtime errors or convert them
to success.

Commit all and only this workstream's files with explicit paths. Final report: root cause for each finding,
reachable impact, exact files, checks with PASS/FAIL, commit SHA, and anything that remains an operational blocker.
