Тест или взгляд: повторяемые решения о выдаче сессии и выборе auth-policy — поведенческие route-тесты; wiring,
отсутствие дублирующего resolver и UI-форма signup/login — разовая инспекция diff и live evidence без UI-тестов.

# Independent blind behavior audit — TEST c069 auth entry fixes

Role: `auditor-live`. Audit the exact committed candidate `ab3cd0b784350086294480e4ef93374dde79306a` in the
supplied `test-auth-entry-c069` worktree against base `e5fb19c71`. Start with the `AGENTS.md` heading map, then read
§10a, §10b and §24 completely before inspecting tests. Read the authority and the worker brief
`.lead/briefs/fix-test-auth-entry-batch-20260908.md`. Do not deploy, push, use shared DEV/TEST servers, mutate named
databases, or touch PROD.

Источник оракула: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` TPB-21 —
«Служебная email-доставка подтверждения регистрации и восстановления доступа работает независимо от выключенного
passwordless email-code login.»

Before reading existing tests, write a blind kill-set from the authority and the two confirmed TEST incidents. It
must at least distinguish these independent failures:

1. specialist signup intent incorrectly falls back to password login when staff passwordless email-code login is
   disabled;
2. patient/admin explicit login portals resolve the shared host's staff policy instead of their portal policy on
   OTP start/resend/confirm;
3. a confirmed credential with a role incompatible with the requested portal receives a session;
4. a compatible role is rejected, or a request without an explicit portal loses established host-based behavior;
5. password login accepts a role on the wrong explicit portal.

Then inspect the candidate diff, production wiring and only then retained tests. Classify every item as behavioral
test or one-time inspection under §24.4. Add only missing tests for costly silent auth/session behavior at the
cheapest public route layer; never test UI wording, DOM shape, source text, call counts unrelated to the boundary,
or implementation structure. For each already-green independent class, perform one temporary production fault
injection and record which assertion turns red. Revert every temporary production mutation. A failing acceptance
test on the untouched candidate is a valid finding and must remain as handoff; do not fix product code.

Run only targeted auth route/unit tests and `git diff --check`, no full CI. If tests or an audit artifact are added,
stage explicit files and commit them on the candidate branch; otherwise leave the branch unchanged. Report binary
PASS/MUST FIX, exact tested SHA, the kill-set mapping, fault-injection evidence, commands/results, and any untested
item with the concrete reason.
