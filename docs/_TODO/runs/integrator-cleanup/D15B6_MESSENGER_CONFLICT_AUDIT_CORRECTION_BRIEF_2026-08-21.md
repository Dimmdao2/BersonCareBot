# D15b/6 — messenger conflict audit correction (2026-08-21)

## Источник оракула
> «attested pre-session транзакцию. Полномочие этой транзакции доказывает только ключ порта и ограничивается exact» — `docs/OWNER_DECISIONS.md`, owner decision 11.08.2026.

Authority: `D15B6_MESSENGER_PRESESSION_PROTOCOL_CORRECTION_BRIEF_2026-08-21.md` item 3 — preserve
conflict/manual-merge rules; `WORK_ORDER.md` D15b/6, D25 and D26; `AGENTS.md` §5 and §24. Candidate:
`613384d63`.

## Confirmed bounded defect

The candidate correctly returns `merge_blocked_ambiguous_candidates`, but its caller then executes
`port.withTransaction(recordMessengerBindBlocked)` under the same bootstrap principal. That transaction fails before
the first audit query and the caller silently swallows it. The user sees the conflict, but
`messenger_phone_bind_blocked` is absent from `admin_audit_log`; the existing admin presentation and manual-review
path therefore have no case/candidates to resolve. The candidate comment and commit claim that this path records the
case, so leaving it broken would also leave false readiness documentation.

## Work

1. Close only this reached conflict-audit gap. Prefer extending the existing exact
   `app.pre_session_messenger_channel_resolve(...)` operation so its conflict result and corresponding audit record
   are one boundary-honest operation. Do not create a second function/root unless the existing operation genuinely
   cannot carry its own rejection audit; explain that constraint before choosing another seam.
2. Preserve the existing `messenger_phone_bind_blocked` action/status, stable conflict key/repeat semantics and the
   candidate ids/details consumed by the admin UI/manual merge review. Do not expose raw phone/PII in logs or external
   responses. If full enrichment requires reads outside the exact pre-session seam, store the minimum complete case
   that the current admin path can actually resolve; do not broaden pre-session into arbitrary relation access.
3. Remove the now-dead best-effort bootstrap `withTransaction` call from this path. Keep
   `recordMessengerBindBlocked` for any other legitimate principal/callers unless exact search proves it dead.
4. Update the candidate's misleading comments and behavioral tests. Prove: conflict returns the same neutral failure,
   exactly one durable/repeat-aware audit case is produced by the exact operation, and the caller does not attempt a
   raw bootstrap transaction. Test behavior, not SQL/source strings or counts.
5. Re-run only affected targeted tests, typecheck/lint, generator byte/gap checks, migration checks and
   `git diff --check`. Do not run DEV/TEST/PROD, `migrate-dev.sh` in either mode, full CI, deploy or push. No fixtures,
   disposable DB, permanent one-off proof script, broad grant, duplicate store or HTTP hop.
6. Commit all task changes with explicit paths and report SHA/files/commands. Do not leave a foreground check running.

## Acceptance

This is one bounded correction before the already required focused messenger audit. The independent auditor will
inspect the combined surface once; do not create another audit round just for this correction.
