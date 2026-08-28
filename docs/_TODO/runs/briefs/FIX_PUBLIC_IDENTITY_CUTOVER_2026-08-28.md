# Fix final public identity cutover (#987)

You are the implementation worker. Read the `AGENTS.md` heading map first, then §1 migration rules, §5,
§9–§10b and §24. Work only in the supplied clean clone and current
`wt/retire-public-integrator-id-runtime-20260828` branch. Deliver one coherent correction of the whole public
identity path; do not split it into local symptoms. Do not touch styles, domains, env, taskdb, PROD or other
branches; do not deploy or run full CI. Use named DEV only for rollback-only/preflight verification and TEST only
read-only. Do not create a disposable database.

## Authority and accepted findings

Источник оракула: `docs/_TODO/runs/briefs/FINAL_PUBLIC_IDENTITY_CUTOVER_AUDIT_2026-08-28.md` — «public
messenger identity belongs in canonical user/channel bindings, not in a duplicate integrator identity» и «the
retired public `integrator-ID` is to be removed completely from live patient/account/reminder/support paths».

The independent evidence and exact commands are in
`docs/_TODO/runs/FINAL_PUBLIC_IDENTITY_CUTOVER_AUDIT_2026-08-28.md`; its acceptance-test commit is now part of the
integration head. Implement every accepted F1–F5 finding in one pass:

1. **Reminder callbacks and settings.** Resolve the canonical `platform_users.id` from the exact channel binding
   once, then pass it to the existing done/skip/snooze/mute/topic-disable/notification-settings DB roots together
   with the organization/occurrence context. Parameterize the existing roots rather than adding parallel roots.
   Authorization and mutation must be atomic inside the SECURITY DEFINER boundary; remove the direct relation
   precheck as an authorization seam. The exact canonical user works without any retired numeric id; another user
   or organization is denied.
2. **Canonical reminder ownership.** The two named DEV legacy rules with no canonical owner are disabled, resolve
   to no existing person and have zero occurrence history. Do not guess or assign them: delete only that
   deterministically ownerless/inactive/unused class in the forward migration, fail closed on any other unresolved
   row, then make `platform_user_id` mandatory with a deletion action compatible with mandatory ownership. Remove
   retired reminder ownership from writers, readers, declaration/generated column capabilities and active schema.
3. **Support identity.** Canonicalize conversations from an exact channel binding or already trustworthy
   `platform_user_id`; where a retained historical conversation has no deterministic canonical person, preserve
   the conversation unlinked rather than guessing or deleting it. A disagreement keeps the canonical UUID and
   discards the retired projection. Remove retired-id lookup, merge, write and exposed port fields from all live
   support paths and retire the old support column after the deterministic backfill.
4. **Account/merge/phone-bind identity.** Remove retired-id search, ranking, blockers, carry/conflict logic,
   realignment and writes from the live doctor merge UI/API, platform merge package, user-by-phone and messenger
   phone-bind paths. Phone confirmation remains the canonical webapp-initiated flow and may create the exact channel
   binding; generic bot entry and a signed entry token never create an account or attach a missing binding.
5. **Signed entry tokens.** Reject a correctly signed token that contains the retired numeric identity. Accept
   messenger entry only through the current canonical token shape and an already exact binding. Preserve
   messenger-proved phone confirmation and login-code issuance.
6. **Bot product matrix.** Both the ordinary platform bot and branded clinic bots still confirm phone, issue login
   codes and deliver ordinary notifications. Only a branded clinic bot may deliver broadcasts. Do not narrow or
   widen that matrix while removing the retired id.
7. **Physical/runtime retirement.** Exhaustively reclassify all production occurrences after the correction.
   Remove the retired public account columns/contracts from live `platform_users`, reminder and support schemas once
   their deterministic migration is complete; update generated schema/declarations in the same stage. Historical
   migrations, one-time reconcile evidence and the internal integrator process/request principal may remain.
   Delivery-attempt diagnostics are non-authoritative and belong to the separate lifecycle/retention contract; do
   not turn them into identity or duplicate that cleanup here.

## Construction constraints

- Reuse the single existing identity resolver/channel binding, reminder roots, support repository and merge core.
  Before adding a function/wrapper/gate, prove the existing chokepoint cannot be parameterized.
- Migration SQL may create/replace/drop objects and backfill data but contains no `GRANT`, `REVOKE`, role or policy
  statement. All function execution and relation/column rights live in the single privilege declaration and its
  generated artifacts.
- Every forward migration has a unique UTC timestamp, statement-owner markers and verification probes. Run the
  owner-aware candidate preflight against named DEV without applying it. For each migration write the mandatory
  privilege analysis: objects changed, owner/runtime role, body privileges and declaration/generated changes.
- Keep strict TypeScript and architecture boundaries. Do not change ordinary video/media paths or UI styling.

## Required validation and delivery

Reuse the audit's two acceptance tests and full blind kill-set. Make the numeric-token test green. Re-run the exact
targeted auth, identity-resolution, reminder callback/read/write, support, merge, bot-dispatch, privilege generation,
relation/function and typecheck/lint gates. Repeat the existing required fault injections one at a time and revert
them: bot-side account creation, numeric retired token, retired callback authorization, retired reminder read,
platform-bot broadcast widening and missing canonical function right. The callback/ownership proof must exercise
actual DB/RLS behavior, not SQL source text. Run candidate migration preflight in the foreground; do not apply it.
No full CI, deploy or push.

Update the active plan/audit queue only with established facts. Commit all allowed product, test, migration,
generated privilege and documentation files explicitly (no `git add -A`), leave the tree clean and report the final
SHA plus exact commands/results. Do not finish while a foreground validation is running.
