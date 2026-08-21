# D15b/6 — phone confirm port-context correction (2026-08-21)

## Источник оракула

> «Равноправный вход переводится на эту таблицу.» — `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D15b/6.

> «Оставшаяся работа — перевести всех писателей/читателей на `public.user_contacts` через DB-порты и удалить дублирующие contact-колонки из `platform_users`.» — `docs/OWNER_DECISIONS.md`, owner decision 21.08.2026.

Independent finding: `/home/dev/brain/runs/agent-port/d15b6-pre-session-phone-lookup-independent-audit-20260821.json`.
Original implementation brief:
`docs/_TODO/runs/integrator-cleanup/D15B6_PRE_SESSION_PHONE_LOOKUP_FIX_BRIEF_2026-08-21.md`. Rules:
`AGENTS.md` §1 migrations/DEV safety, §5, §10/§10a/§10b and §24.

## Confirmed defect

The current candidate repairs `/api/auth/phone/start` but not the required whole phone-login path. After successful
OTP verification `/api/auth/phone/confirm` still holds the bootstrap principal and calls
`pgUserByPhone.createOrBind`. Its `withPoolTransaction` tries to resolve an unnamed `pre_session` relation capability
before the first query and throws `Missing declared webapp port capability: pre_session`. This is reachable for both
existing-user login and new-user registration and remains in scope; it is not a future D15b/7 task.

## Work

1. Trace `phone/confirm → confirmPhoneAuth → createOrBind` and every read/write/merge/bind operation reached under
   successful OTP for: existing canonical phone holder, new registration, channel binding, profile bind and conflict
   merge. Use later owner decisions above; do not narrow the stage to the first failing line.
2. Repair the complete confirm transaction through the existing identity DB-port and port-context machinery. Reuse or
   parameterize an existing operation/root/seam where honest. A mere `runWithWebappPortOperation` label around raw
   relation DML is not an exact function boundary: do not declare a function identity that is never called, and do not
   grant a broad multi-table relation door to `app_pre_session`.
3. Allowed target shapes are only boundary-honest ones: extend an existing exact SECURITY DEFINER identity/auth root,
   or add the minimum timestamp-forward exact root(s) needed to perform the atomic verified-phone create/bind/merge
   operation. Reuse existing owner roles, merge engine and contact mutation rules; do not duplicate algorithms or add a
   second linkage/store/port. If the existing transaction cannot be moved behind exact roots without a materially
   unsafe rewrite, stop with a concrete architecture blocker instead of broadening pre-session rights.
4. Preserve canonical `public.user_contacts` as sole phone/email authority, contact confirmation/provenance,
   one-contact-one-account uniqueness, merge behavior, channel binding, session result, registration analytics and
   neutral external responses. Never restore `platform_users.phone/email`, reverse mirror or HTTP fallback.
5. Migration changes are timestamp-forward and owner-marked. Never edit the existing candidate migration after it has
   been applied anywhere; first prove its ledger state on named DEV. Privileges/context stay only in
   `deploy/postgres/privileges` declaration/generator — no `GRANT`/`REVOKE`/role/policy in migration.
6. Tests prove observable behavior/security only: successful start→confirm for existing and new identities reaches a
   session result; invalid/expired OTP remains neutral; exact context/purpose/typed args fail closed; channel/profile
   conflicts retain current semantics. Do not restore the deleted D36 callsite catalog or add source/SQL/count gates,
   fixture frameworks, users, clinics or disposable DBs.
7. Run targeted tests, webapp typecheck, scoped lint, privilege generator/gap/byte checks, migration self-check and
   `git diff --check`; no full CI, deploy, push, TEST or PROD.
8. Do not work around the clone's missing canonical `.env` files. Prepare the exact candidate preflight/live commands
   for the lead. Commit all task changes with explicit paths and report SHA, touched files, commands/results and any
   remaining live gate.

## Acceptance after worker

Because this correction changes the confirm/write surface, a focused independent Sonnet live re-audit will check only
the new confirm surface plus named-DEV owner-aware rollback-only preflight. The already accepted phone-start behavior
is not re-audited. Landing remains forbidden until that candidate preflight passes without disposable DB/fixture and
the branch is merged with current integration without resurrecting deleted gates.
