# D15b/6 phone-confirm correction — focused independent audit (2026-08-21)

## Источник оракула
> «до опознания порт вправе выполнить только минимальный протокол опознания» and the attested pre-session transaction «может вызвать только поимённые швы, необходимые, чтобы начать или завершить вход, регистрацию, восстановление и привязку канала» — `docs/OWNER_DECISIONS.md`, variant A, 11.08/updated 21.08.

> «Равноправный вход переводится на эту таблицу.» — `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D15b/6.

Original audit finding:
`/home/dev/brain/runs/agent-port/d15b6-pre-session-phone-lookup-independent-audit-20260821.json`; correction brief:
`docs/_TODO/runs/integrator-cleanup/D15B6_PHONE_CONFIRM_PORT_CONTEXT_CORRECTION_BRIEF_2026-08-21.md`. Rules:
`AGENTS.md` §1/§1b/§5/§6/§10/§10a/§10b/§24.

## Тест или взгляд

- Function/migration ownership, exact relation surfaces, declaration/generated artifacts and port-context transition
  are inspected by view, generator checks and owner-aware named-DEV rollback-only preflight.
- Successful OTP browser/messenger/profile-bind/merge behavior and denial/neutrality are behavior: use existing
  targeted tests plus focused rollback-only named-DEV calls. Do not add a source/SQL/count gate or fixture machinery.

## Candidate and audit boundary

Audit correction commit `75f3251f4` on top of the original `9f2a4f3f2`, after merge with current integration. This
is a focused re-audit only of the newly changed confirm/write surface and its migration/preflight; the prior audit's
accepted phone-start mapping/neutrality is reused, not repeated.

The worker reports ordinary browser existing/new phone confirm fixed but explicitly leaves Telegram/MAX channel-context
confirm broken under bootstrap because existing binding roots reject `app_pre_session`. That is not acceptable as a
partial stage: owner variant A explicitly includes completion of login, registration and channel binding, and D25 keeps
the integrator as delivery while webapp owns account/contact/binding decisions.

## Required verdict

1. Before candidate tests, record a kill-set for successful OTP confirmation in all reachable existing paths:
   ordinary browser existing holder, browser new registration, Telegram/MAX channel context with no binding, binding
   conflict/merge, profile bind, ambiguous/archived holder and invalid/expired OTP. Each reachable required path must
   either complete under an exact named seam or fail with its existing intentional product conflict — never with the
   missing unnamed `pre_session` capability.
2. Verify the worker's claimed messenger blocker against actual code. Explicitly inspect existing
   `phoneMessengerBind`/self-sufficient binding flow, `auth_phone_bind_*` roots, identity-self principal transitions,
   merge engine and the owner rule that after identity proof ordinary user data requires a human principal. Determine
   whether a split sequence is already available: exact pre-session resolve/create after OTP → establish the existing
   identity-self principal → invoke existing bind/merge seams. Do not accept a false dichotomy between broadening
   `app_pre_session` and moving the whole merge engine into SQL. If a compliant existing-seam route exists, report a
   concrete `MUST FIX`; do not edit product code.
3. Inspect `app.pre_session_phone_confirm_resolve` for atomic canonical phone/contact ownership, confirmed/provenance
   semantics, ambiguity, archived/merged holders, new-user defaults and least privilege. Reject any legacy contact
   mirror, duplicate identity algorithm, broad relation grant, fake functionIdentity wrapper or second store/port.
4. Run `bash deploy/host/migrate-dev.sh --preflight` from the exact candidate checkout now that the lead has provided
   regular mode-0600 candidate-local copies of the canonical DEV env files. It must target only `bcb_webapp_dev`, use
   declared owners and end rollback-only. Prove migration ledger and both new function signatures are unchanged after.
5. Use only explicit transactions on named DEV and existing canonical context primitives for focused function calls.
   Existing owner data may be read without printing PII; a new-user branch may create temporary rows only inside one
   transaction with unconditional `ROLLBACK` and before/after zero residue. No durable fixture/user/clinic, disposable
   DB, TEST/PROD, deploy or push.
6. Run only existing targeted auth/repository tests, webapp typecheck, scoped lint, privilege generator/gap/byte checks,
   migration checks and `git diff --check`; no full CI. Do not create or commit files.

Return `PASS|FAIL|BLOCKED` per item with exact commands and measured results. Findings require reachable failure,
impact and violated authority. A partial browser-only PASS is an overall FAIL while messenger/channel binding remains
reachable and broken.
