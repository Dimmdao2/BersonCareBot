# Final independent audit — public identity cutover (#987)

## Тест или взгляд — классификация (`AGENTS.md` §24.4)

- **Read-only inspection:** exhaustively classify every remaining live `integrator_user_id` / `integratorUserId`
  occurrence and trace actual callers, database roots, writers and generated privilege declarations.
- **Behavioral fault injection:** bot authentication must never create an account; reminder ownership and callbacks
  must use the canonical UUID; ordinary notifications and login codes must keep working for both platform and
  branded bots while broadcasts remain branded-only.
- **Owner-aware rollback-only preflight:** inspect and, where useful, rerun the existing candidate migration
  preflight on named DEV. Do not apply migrations, deploy or mutate TEST/PROD.

You are the independent `auditor-live`. Read the `AGENTS.md` heading map first, then §1 migration rules, §5,
§9–§10b and §24. Work only in the fresh audit clone supplied by the launcher. Audit implementation commit
`212c7d6e83473799b23c9e6bdd25bfd9cf945113` as merged with the current integration head at
`c297911a6`. Do not edit product code, UI, env, taskdb or other branches; do not deploy, run full CI, create a
disposable database or touch PROD. Commit only the report and any genuinely necessary acceptance-test artifact
allowed by §10a–§10b, and revert every fault injection.

## Product authority

The owner's current decisions are the oracle:

- bot traffic does not create accounts; registration happens in the web application;
- both the ordinary platform bot and a branded clinic bot confirm the phone through the messenger, issue login
  codes and may deliver ordinary notifications; only branded clinic bots may send broadcasts;
- public messenger identity belongs in canonical user/channel bindings, not in a duplicate integrator identity;
- the retired public `integrator-ID` is to be removed completely from live patient/account/reminder/support paths;
- one generated privilege declaration/reconciler owns rights; migration SQL never grants or revokes rights. This
  does **not** prohibit adding/replacing a function whose rights are declared and reconciled by that generator.

The worker itself reported three unfinished surfaces that must be audited as candidate blockers, not accepted as
out-of-scope by narrative: nullable orphan reminder owners, reminder action DB roots that still resolve a patient
through `current_integrator_user_id`, and the live `support_conversations.integrator_user_id` projection.

## Blind kill-set and required verification

Write your compact blind kill-set before reading candidate tests. Then verify the following independently:

1. A generic Telegram/MAX webhook and a signed entry token can resolve only an existing canonical account through
   an exact channel binding. Missing/mismatched binding creates zero `platform_users` rows. Numeric retired-id token
   payloads are rejected. Token-bound messenger phone proof and login-code issuance remain intact.
2. Platform and branded bots both retain login codes and ordinary notifications. Broadcast intent/link delivery is
   still possible only through the branded clinic bot; the cutover must not widen it to the platform bot.
3. Create/read/update/delete/list/history/statistics and Telegram/MAX callback actions for reminders authorize the
   same canonical `platform_users.id`. A canonical user with a channel binding but no retired public id works; a
   different user or org is denied. Trace both TypeScript adapters and the installed SQL roots, including
   done/skip/snooze/mute/topic-disable/notification-settings.
4. Exhaustively classify every remaining production occurrence of the retired public id. An internal service
   principal is acceptable only where it identifies the integrator process/request itself and can never stand for a
   patient. A diagnostic delivery-attempt value may remain only if it is explicitly non-authoritative. Any live
   patient, support-conversation, reminder or account lookup/projection through the retired id is a blocker.
5. Challenge the worker's claim that a needed canonical DB root could not be added because it would need a grant.
   `AGENTS.md` forbids `GRANT`/`REVOKE` inside migration files; it requires the generated privilege declaration and
   reconcile to own those rights. Determine the minimal single-root/parameterized form consistent with §5, and
   report any missing declaration/generated artifact or runtime table access as a blocker.
6. Inspect migration `20260828T160000_reminder_rules_belong_to_the_canonical_person.sql`: backfill and assertion
   must see rows despite FORCE RLS; no grant/revoke; statement owners correct; generated schema and declaration
   synchronized; function runtime reads/writes have sufficient generated rights; timestamp/order/verify contract
   valid. The final product claim cannot be `PASS` while canonical ownership is nullable or a retired column remains
   authoritative. Measure the orphan state read-only and state the safe deterministic consequence; do not delete or
   guess data in the audit.
7. Verify no deleted test hid an active behavior. Existing targeted auth/reminder/integrator/privilege tests must be
   honestly green on the merged candidate; distinguish a pre-existing environment-fixture failure with an exact
   baseline command rather than hand-waving it away.
8. Required fault injections, using existing seams where possible: restore bot-side account creation; accept a
   numeric token id; authorize reminder callback against the retired numeric owner; remove canonical reminder
   ownership from one read; widen broadcasts to the platform bot; remove the canonical function right/declaration.
   Each must make an appropriate existing/acceptance gate red. Revert all injections and restore green baseline.

## Verdict and artifact

Return exactly `PASS, FOR LAND` or `FAIL, NOT FOR LAND`. Every finding must name a reachable consequence, exact
evidence and violated owner/repository authority. Style, speculative hardening and alternative architecture are not
findings. Report exact commands beside every number, all missed kill-set classes (including zero), candidate SHA,
whether every injection was reverted, and any genuine owner decision that remains.

Write the report to `docs/_TODO/runs/FINAL_PUBLIC_IDENTITY_CUTOVER_AUDIT_2026-08-28.md`, append one verdict row to
`docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`, commit only allowed audit files and leave the tree clean. Write
progress notes to `/home/dev/brain/runs/agent-port/final-public-identity-cutover-audit-20260828.md`; do not end while
a foreground command is still running.
