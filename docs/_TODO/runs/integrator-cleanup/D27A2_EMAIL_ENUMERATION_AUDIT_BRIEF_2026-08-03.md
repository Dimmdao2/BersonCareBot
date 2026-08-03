# Audit D27-A2 — email OTP enumeration closure

## Тест или взгляд

- Repeatable known/unknown/provider/timing/cooldown behavior — blind kill-set, route/service acceptance tests and
  targeted fault injection.
- One-time no-PII observability/scope boundary — diff and call-graph inspection; no source-text tests.

## Authority

- Read `AGENTS.md` §10a–§10b and §24.
- `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D27.
- `docs/_TODO/runs/integrator-cleanup/D27A2_EMAIL_ENUMERATION_BRIEF_2026-08-03.md`.
- Candidate `04ae70531` in `wt/trackd-d27a2-email-enumeration`.

Oracle: a valid public request must not reveal whether the email belongs to an account through status/body shape,
provider outcome, timing class or cooldown/retry behavior. Invalid syntax may remain 400; abuse controls must remain.

## Independent kill-set

Write kill-set before reading candidate tests. At minimum verify:

1. Known/unknown/provider success/failure return the same public status and schema; forbidden `email_send_failed`
   or equivalent does not escape.
2. A provider delayed beyond the nominal 500 ms floor cannot make only known email measurably slower. A minimum
   floor alone is insufficient if the known path still awaits provider while unknown returns at the floor.
3. Repeat/resend/cooldown behavior cannot distinguish known from unknown. Test the second request and existing
   cooldown/rate-limit state, not only a first non-rate-limited request.
4. Provider throw and false result are contained, operator/server evidence remains, and logs contain no email/OTP.
5. ChallengeId/retry schema and UUID shape do not distinguish fake vs real; confirmation/session/attempt semantics
   for a real delivered challenge remain unchanged.
6. Invalid email and rate/abuse controls are not weakened. If neutral public behavior requires changing limiter
   placement/state, it must still bound attacks for both known and unknown inputs.
7. Recent provider principal/runtime fix is preserved; no durable queue, DB migration, identity change or unrelated
   auth/D30/tariff code entered this slice.

Auditor does not fix product. It may commit only new acceptance tests and audit-report; revert every production
fault injection. Verdict PASS/FAIL with exact commands and killed/uncaught counts. No DB/env/deploy/DEV/TEST/PROD.
