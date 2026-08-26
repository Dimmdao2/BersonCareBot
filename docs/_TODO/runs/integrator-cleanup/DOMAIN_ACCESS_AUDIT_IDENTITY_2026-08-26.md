# Domain access audit — identity, login and messenger proof (2026-08-26)

## Authority

Read `AGENTS.md` heading map before every action, then §1/§1a/§1b, §5, §6, §9, §10a, §10b and §24 in full.
Product authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D15b, D17, D25 and D27;
`docs/OWNER_DECISIONS.md` identity and database-context decisions. Candidate is the current
`feat/doctor-ui-rebuild` head contained by this audit worktree.

Owner oracle from `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D25:
> «generic webhook не создаёт аккаунт; token-bound webapp flow принимает только self-owned messenger contact,
> сверяет номер, фиксирует подтверждение и доставляет код; интегратор не создаёт аккаунт и не решает merge.»

## Тест или взгляд

This is an independent whole-path audit, not a product fixer. One-time structure is checked by code/diff inspection,
privilege generator byte-checks and safe catalog introspection. Repeatable behavior is checked by the smallest
existing behavioral/live gates and, only when necessary, rollback-only named DEV/TEST probes under the real runtime
role. Never use a disposable database. Do not deploy, push, run full CI, print secrets or perform a real external
delivery. Do not edit production code or leave temporary fault injections. Return findings in the final log; make no
commit unless you intentionally add a durable acceptance test that complies with §10a/§10b.

## Required audit

Before reading existing tests, derive a blind kill-set from the authority. Trace the complete user path:

1. Webapp login/registration attempt → Telegram/MAX contact ownership proof → phone comparison → code delivered back
   to webapp → confirmation/session. A generic `/start`, message or contact without an active attempt must not create
   an account, contact, binding, preference or merge decision.
2. Enumerate every reachable application port, SQL function, table/view/trigger and runtime role used by positive,
   negative, retry and conflict paths. Include function ownership, invoker/definer mode, `EXECUTE`, relation rights,
   RLS/policies and accepted-context gates.
3. Compare that graph with `deploy/postgres/privileges/declaration.ts`, `relation-access.ts`, generated DEV/TEST
   artifacts and runtime overlays. Find missing rights, unnecessary broad rights, order-dependent duplicate function
   definitions and old readers/writers that bypass the intended path.
4. Inspect all relevant settings and tenant bindings without exposing values: enabled/configured state, origin,
   provider/channel selection and clinic/global ownership. A configured-but-unreachable path or reachable path using
   the wrong tenant is a finding.
5. For every finding give: reachable scenario, user impact, exact role/function/relation/config seam, violated owner
   requirement and exact evidence command. Style, speculative hardening and alternative architecture are not findings.

Output a compact matrix `step → runtime role → function/port → relations/settings → PASS|FAIL|BLOCKED`, followed by a
deduplicated MUST-FIX list. Explicitly state what was not proved live.
