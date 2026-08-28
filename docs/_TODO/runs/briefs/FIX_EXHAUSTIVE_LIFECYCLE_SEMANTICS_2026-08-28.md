# Fix exhaustive lifecycle and purge semantics (#987)

You are the implementation worker. Read the `AGENTS.md` heading map first, then §1 migration rules, §5,
§9–§10b and §24. Work only in the supplied clean clone and current `wt/fix-lifecycle-purge-census-20260828`
branch. This is one coherent systemic correction, not a series of micro-fixes. Do not touch UI, env, taskdb,
domains, PROD or other branches; do not deploy and do not run full CI. Use only named DEV for the existing
rollback-only proof and TEST read-only. Do not create a disposable database.

## Authority and accepted findings

The owner directed that all findings be fixed systemically. The oracle is stage 3 of
`docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`; the independent evidence and exact live facts are
`docs/_TODO/runs/FINAL_EXHAUSTIVE_LIFECYCLE_CENSUS_AUDIT_2026-08-28.md`. Preserve the candidate's accepted
structural result: every declared physical table is classified exactly once; arbitrary names and incomplete/bare/
duplicate decisions are rejected; the earlier F1/F2 purge mechanics stay present.

Implement all accepted findings in one pass:

1. **Delivery journal/account purge.** `notification_delivery_attempts` is a retained 180-day delivery fact, not a
   second account record. On hard account purge remove the person's raw identity from all three live surfaces:
   `user_id`, `integrator_user_id`, and person identifiers nested in `metadata`, while retaining the non-identifying
   delivery outcome until its normal retention sweep. Update the registry/OQ so it no longer falsely describes only
   `user_id`; do not delete unrelated delivery facts and do not create another journal.
2. **Auth limiter.** Give `auth.channel_link_start` real bounded scope pruning through the existing rate-limit
   function/configuration, and make account purge remove the deleted person's identity-bearing key. Reuse the
   existing rate-limit and purge roots; no parallel cleaner.
3. **Patient/staff identity collision.** A person with an active specialist/staff root must not pass strict client
   hard purge. Fail closed before destructive work with a clear reason and leave the specialist, schedule and
   appointments intact. Do not purge doctor data and do not invent a second identity model.
4. **Organization purge truth.** Make the existing organization deletion path actually handle every named live
   class: delete/cascade organization-owned outgoing queue rows and hourly playback aggregates; retain slug claim/
   rename history only as unlinked tombstone/audit facts by nulling the organization reference; make manual patient
   commands cascade or be explicitly removed by the same purge path. Correct the registry labels for relations
   whose FK already cascades. Do not add a second organization-purge service.
5. **Executable retention roots.** Replace the permissive dotted-name shortcut with validation against the actual
   installed callable/root, scheduler contract and health signal. Correct the operator archive entry to the real
   prune root. The existing nonexistent-dotted-root injection must turn red and the restored baseline green; do not
   write a source-text test or a second harness.
6. **Rollback-only proof.** Extend the existing DEV proof so it derives and physically verifies the structured
   decision surface, including FK-free anonymisation/delete operations and the earlier named specialist/accounting
   paths. Fix its own total-row assertion for the deliberately deleted platform user. It must not silently skip a
   live explicit-anonymise class and must continue to roll back every run. Resolve the five already-recorded
   registry/FK divergences in product/schema/registry rather than accepting a known-red baseline.
7. **Stale declaration.** Independently verify whether `user_email_setup_tokens` has a live writer/reader/human
   path. If none exists, remove the retired declaration and structured decision; do not recreate a dead table merely
   to satisfy the census. If a real live path exists, make the existing path/schema truthful without creating a
   parallel token store.

## Construction constraints

- Extend the single existing purge core, lifecycle registry, rate-limit root and organization-deletion seam. Before
  adding any function/wrapper/gate, prove the existing point cannot be parameterised; prefer expanding it.
- Migration SQL may create/replace objects and change FK behavior but contains no `GRANT`, `REVOKE`, role or policy
  statements. Declare/generate/reconcile privileges only through `deploy/postgres/privileges/`.
- Any forward migration uses a unique UTC timestamp name, statement-owner markers and a verification probe. Run the
  owner-aware candidate preflight against named DEV before calling the candidate ready. Provide the mandatory
  written privilege analysis for each migration: changed objects, executing owner/runtime role, body privileges,
  and declaration changes. Do not apply the migration to DEV/TEST.
- Keep hard purge disabled under the existing PR-03 product/legal gate. This stage makes the dormant machinery
  correct and fail-closed; it does not enable destructive production behavior or invent new retention periods.
- Preserve strict TypeScript and existing architecture boundaries. Do not change ordinary video upload/playback.

## Required validation and delivery

Reuse the accepted audit's exact kill-set and existing tests. Run the targeted lifecycle registry, account/org purge,
rate-limit and affected typecheck/lint gates through the host lock where required. Run all six lifecycle fault
injections one at a time and revert them; the nonexistent dotted prune target must now be caught. Run the expanded
named-DEV rollback-only proof in the foreground and report every class/result honestly. TEST stays read-only. No
full CI, deploy or push.

Update the active plan/audit queue only with facts established by this implementation. Commit all allowed product,
test, migration, generated privilege and documentation changes explicitly (no `git add -A`), leave the tree clean,
and report the final commit SHA plus exact commands/results. Do not finish while a foreground validation is running.
