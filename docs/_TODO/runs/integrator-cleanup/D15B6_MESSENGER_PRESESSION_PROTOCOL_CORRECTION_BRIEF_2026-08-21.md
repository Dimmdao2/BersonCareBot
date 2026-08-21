# D15b/6 — messenger pre-session protocol correction (2026-08-21)

## Источник оракула
> «Она не получает tenant/medical table access и может вызвать только поимённые швы, необходимые, чтобы начать или завершить вход, регистрацию, восстановление и привязку канала.» — `docs/OWNER_DECISIONS.md`, owner decision 11.08.2026, вариант A.

> «После опознания любая работа с пользовательскими данными требует уже human principal.» — там же.

> «Интегратору остаётся только доставка входа, а создание учётки, доверие к телефону и синхронизация личности — вебаппу». — `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, Р-D25.

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D15b/6 and D25;
`docs/OWNER_DECISIONS.md` decisions 11.08 and 21.08; `AGENTS.md` §1 migrations/DEV safety, §5, §10/§10a/§10b
and §24. Previous focused audit:
`/home/dev/brain/runs/agent-port/d15b6-phone-confirm-correction-independent-audit-20260821.json`.

## Proven reachable defects

Candidate commit `75f3251f4` fixes browser phone confirmation but leaves both messenger paths broken:

1. Telegram/MAX confirmation still reaches the old raw `bindInTransaction` / `withPoolTransaction` path while the
   bootstrap principal is active, so relation capability resolution fails before useful work.
2. Signed pre-OTP `applyMessengerContactPreOtpImpl` has the same raw-bootstrap defect. It writes channel/trust state
   without establishing the canonical `public.user_contacts` holder, so bypassing it at confirmation can create a
   duplicate identity instead of completing one coherent protocol.
3. `app.pre_session_phone_confirm_resolve` declares `v_was_created boolean := false` before
   `require_accepted_context`; the reconcile verifier therefore rejects the exact seam and never grants the intended
   `app_pre_session` EXECUTE capability.

Browser start/confirm was already audited. Do not rewrite or re-audit it except where a shared correction genuinely
requires a minimal change.

## Work

1. Before editing, trace the complete Telegram and MAX path from trusted/signed contact input through
   `applyMessengerContactPreOtpImpl`, OTP confirmation, `createOrBind`, channel binding, phone trust, merge/conflict
   handling and session result. Inspect the already existing exact roots and principal transitions, especially
   `phoneMessengerBind`, `phoneMessengerBindSelfSufficient`, `auth_phone_bind_*` and the identity-self/human-principal
   wrappers. Reuse or parameterize the existing common path; do not create a parallel merge/bind engine.
2. Implement one boundary-honest protocol: before identity exists, the known webapp port may invoke only the minimum
   exact named pre-session resolve/create seam with bound purpose and typed args; as soon as identity is resolved or
   created, continue all user-data/channel/contact/merge work under the existing human/identity-self principal and
   existing bind/merge seams. A label or fake `functionIdentity` around raw relation DML is not a function boundary.
3. Make canonical `public.user_contacts` the sole phone authority throughout messenger login/bind. Preserve trusted
   messenger provenance, one-contact-one-account uniqueness, Telegram/MAX channel ownership, current conflict/manual
   merge rules, analytics and neutral external responses. Do not restore `platform_users.phone/email`, a reverse
   mirror, second store/port, HTTP hop or integrator-side identity decision.
4. Fix the exact-gate verifier failure by ensuring the first executable statement in every exact pre-session function
   is the accepted-context gate. Keep migrations timestamp-forward and owner-marked. Privileges/context live only in
   `deploy/postgres/privileges`; no migration `GRANT`, `REVOKE`, role or policy statements.
5. Do not broaden `app_pre_session` to relation access, do not duplicate the merge engine, and do not add fixture
   frameworks, test users/clinics, disposable databases, source-text/count guards or permanent one-off proof scripts.
6. Extend only behavioral tests necessary for Telegram/MAX existing identity, new identity, conflict, invalid proof
   and exact purpose/typed-args fail-closed behavior. Reuse the already accepted browser tests and existing kill-set.
7. Run targeted tests, webapp typecheck, scoped lint, privilege generator/gap/byte checks, migration self-check and
   `git diff --check`. No full CI, DB execute, deploy, push, TEST or PROD. Do not run `migrate-dev.sh --execute` under
   any circumstance; the lead owns all live DB commands after candidate acceptance.
8. Commit all task changes with explicit paths. Report SHA, exact files, exact commands/results, the chosen existing
   seam/principal transition and any remaining blocker. Do not finish while a foreground check is still running.

## Acceptance

The lead will run the candidate owner-aware rollback-only named-DEV preflight. A separate Sonnet reviewer, without
candidate DB credentials, will inspect only the changed messenger surface, exact-gate ordering and the existing
behavioral evidence. Landing is forbidden until both pass. After landing, the lead repeats the integration preflight,
then alone performs the canonical DEV execute; TEST remains a later deployment/live gate.
