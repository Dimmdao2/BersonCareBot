# D15b/6 — final focused messenger audit (2026-08-21)

## Источник оракула
> «attested pre-session транзакцию. Полномочие этой транзакции доказывает только ключ порта и ограничивается exact» — `docs/OWNER_DECISIONS.md`, owner decision 11.08.2026.

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D15b/6, D25 and D26;
`docs/_TODO/runs/integrator-cleanup/D15B6_MESSENGER_PRESESSION_PROTOCOL_CORRECTION_BRIEF_2026-08-21.md`;
`docs/_TODO/runs/integrator-cleanup/D15B6_MESSENGER_CONFLICT_AUDIT_CORRECTION_BRIEF_2026-08-21.md`;
`AGENTS.md` §5, §10a, §10b and §24. Candidate product tip: `4b4331bee`; compare the combined
messenger correction from `75f3251f4..4b4331bee` and the final conflict correction from
`613384d63..4b4331bee`.

## Role and hard boundary

Independent code/evidence auditor. This is the one focused re-audit required because the worker added a new exact
messenger operation and then moved conflict-case recording into it. Do not invent product work or style findings.
Do not edit production code. Do not access any database, server, env file or secret; do not run `psql`,
`migrate-dev.sh` in either mode, deploy, full CI or push. No fixtures, disposable DB, source-text/count gate or
permanent one-off proof script. The lead already ran the exact-candidate named-DEV rollback-only preflight at
`4b4331bee` and got PASS (`pending=3`, `total=25`, `foreign-ledger-rows=0`).

## Audit method and kill-set

Before reading existing tests, derive the blind kill-set from the authority above. Classify one-time structure by
inspection and repeatable behavior by the existing targeted behavioral tests. Reuse the previous kill-set and tests;
do not start another broad Track-D audit and do not re-audit the already accepted browser `/phone/start` surface.

The final verdict must cover every item below:

1. Both pre-session roots reject calls whose first executable statement lacks the exact gate; no broad
   `app_pre_session` relation access or fake function identity can replace the capability.
2. Telegram/MAX pre-OTP and confirm paths use the named operation through the existing named-root port and resolve
   an existing canonical confirmed phone, create/enrich the legitimate new-user path, and fail closed on
   cross-account conflict.
3. Conflict keeps the neutral external result and atomically leaves one durable, repeat-aware
   `messenger_phone_bind_blocked` case with the candidates needed by the existing admin/manual-merge path; no raw
   bootstrap `withTransaction(recordMessengerBindBlocked)` remains.
4. Canonical contact semantics remain `public.user_contacts`; the change adds no legacy mirror, HTTP hop, duplicate
   merge engine, duplicate contact store or second conflict-recording root.
5. Declaration, relation surface and generated privilege artifacts grant only the exact operation and its minimum
   dependencies and remain generator-byte-consistent.
6. Existing targeted tests genuinely exercise behavior rather than guarding SQL/source strings or numeric counts.
   Run only the smallest missing targeted checks; reuse green worker evidence when it is on `4b4331bee`.

## Output

Return one line per item: `1..6 -> PASS|FAIL|BLOCKED -> exact evidence`, then a binary overall verdict. A `MUST FIX`
must name a reachable scenario, impact and violated authority/repo rule. Recommendations outside scope are not work.
Leave the candidate tree clean. If you create an audit artifact, commit only that explicit file; otherwise make no
commit. Do not finish while a foreground targeted check is still running.
