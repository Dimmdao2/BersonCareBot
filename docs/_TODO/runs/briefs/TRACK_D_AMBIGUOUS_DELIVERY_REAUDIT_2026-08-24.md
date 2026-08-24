# Track D — focused re-audit of ambiguous provider delivery

## Role and authority

You are the independent focused auditor for the new queue-state surface introduced by fix commit `9829bfced` after the original Track D audit finding `D987-F1` in:

- `docs/_TODO/runs/integrator-cleanup/TRACK_D_FINAL_CUTOVER_INDEPENDENT_AUDIT_2026-08-24.md`;
- owner decision: after the provider has accepted a notification, a later local bookkeeping failure must not create a false provider failure, schedule a retry, or cause a second external send;
- owner reminder model: one occurrence row carries the reminder lifecycle, a queue row carries delivery work, attempt rows record only real failed provider attempts, and successful final delivery is not duplicated in another journal.

Read `AGENTS.md` header map first, then §10a, §10b and §24 in full. This is a focused re-audit only because the fix created the new `dispatching` queue state. Reuse the existing kill-set and acceptance test. Do not repeat a blind audit of all Track D.

## Candidate and scope

- Worktree: `/home/dev/dev-projects/bcb-wt-track-d-final-cutover-20260823`
- Branch: `wt/track-d-final-cutover-20260823`
- Product fix under review: `9829bfced`
- Existing acceptance test: `apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.queueMarkSentFailure.d987audit.test.ts`
- Relevant implementation:
  - `apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts`
  - `apps/integrator/src/infra/db/repos/outgoingDeliveryQueue.ts`
  - `apps/webapp/db/drizzle-migrations/20260823T220000_consolidate_reminder_occurrence_stores.sql`
  - `docs/ARCHITECTURE/OUTGOING_DELIVERY_QUEUE.md`

Audit only closure of `D987-F1` and regressions caused by the new `dispatching` state. The chosen boundary is at-most-once after handoff to an external provider: an ambiguous crash may dead-letter one notification, but must never automatically resend it. Do not redesign this into a new table, journal, worker, outbox, or provider-idempotency project.

## Required checks

1. Inspect the final diff and prove that every branch which can actually call an external provider moves its claimed row from `processing` to `dispatching` immediately before the provider call, after local preparation that can still fail safely. Cover operator alerts, inbound replies, patient reminder dispatch, doctor broadcasts, specialist/appointment reminders and the generic transport path. A missing reachable provider branch is a finding.
2. Reuse the existing acceptance test/kill-set to prove the original failure is closed:
   - provider succeeds;
   - `queueMarkSent` fails afterward;
   - no failed-attempt row is written;
   - no retry is scheduled;
   - the row remains `dispatching`;
   - stale recovery dead-letters it with `failure_class = provider_outcome_unknown`;
   - a normal claimant cannot obtain it again;
   - the provider is called exactly once.
3. Prove normal paths were not broken:
   - stale `processing` rows are still reclaimed and may be retried;
   - explicit provider errors from `dispatching` still create real failure evidence and move to retry/dead according to the existing policy;
   - successful sends still become `sent` when bookkeeping succeeds.
4. Inspect the migration and repository guards:
   - the existing queue status constraint admits `dispatching`;
   - mark-sent, reschedule and dead-letter transitions accept the correct pre-final states without allowing an ordinary claimant to reclaim `dispatching`;
   - the migration changes no grants/roles and preserves the application owner marker;
   - no new table, result journal, duplicate worker or parallel delivery path was introduced.
5. Check retention/health consequences at the existing boundary: ambiguous rows become ordinary retained `dead` rows; automatic retention must not prune live `processing` or `dispatching` work.
6. Run only the smallest fresh checks needed for this new surface. Reuse already-green evidence where allowed by §10 strong reuse. A named DEV rollback-only check is permitted if migration inspection needs runtime confirmation; no disposable database and no historical migration replay.

## Forbidden scope

- Do not modify product code or fix findings.
- Do not touch, switch to, merge, delete, rebase, or edit any `therapysto-*`, `night-*`, `reaudit-*`, branding or backup branch/worktree.
- Do not use TEST or PROD, deploy, send real notifications, or run full CI.
- Do not broaden into the later branding integration conflict around `read_integrator_clinic_delivery_credential`; that will be resolved by the lead after the branding branch is complete.
- Do not create replacement architecture, extra persistence or new work from recommendations.

## Deliverable and gate

Write one audit artifact under `docs/_TODO/runs/integrator-cleanup/` with a binary `PASS` or `FAIL`.

- A finding requires a reachable owner/repo-rule violation, concrete impact and evidence.
- Recommendations or alternative architecture are not findings.
- On `PASS`, list exact commands and results and say how many named faults the reused acceptance test covers.
- On `FAIL`, preserve a failing acceptance test only when it demonstrates the real defect; otherwise provide exact inspection/runtime evidence. Do not fix it.

You may commit only your audit artifact and any intentional acceptance-test change required to expose a real defect. Stage explicit paths; never `git add -A`. Commit before ending the single agent turn. Run long commands in the foreground and wait for them to finish; do not end while a background process is pending.
