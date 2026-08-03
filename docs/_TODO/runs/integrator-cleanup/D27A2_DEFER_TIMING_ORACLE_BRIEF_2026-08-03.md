# D27-A2 — mark the timing oracle deferred (one-line slice)

Rules: `AGENTS.md` — Маршрут, CORE rules, §10/§10a/§10b (tests), §24.
Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` item **D27** / decision **Р-D27** (§2.3);
audit report `docs/_TODO/runs/integrator-cleanup/D27A2_EMAIL_ENUMERATION_AUDIT_2026-08-03.md`; the lead's acceptance
line for `528ce88ca` in `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`.

Источник оракула: `docs/_TODO/runs/integrator-cleanup/D27A2_EMAIL_ENUMERATION_AUDIT_2026-08-03.md` — «**MUST FIX —
delayed provider remains a timing oracle.** … A caller can classify a known address by response time.»

## The single change

In `apps/webapp/src/app/api/auth/email-otp/start/route.route.test.ts` the case
`keeps a known address out of a slower response-time class when its provider exceeds the floor` is red by decision,
not by accident: an arbitrary provider delay cannot be masked from inside the request, and the honest closure is
taking the provider out of the public request latency (durable auth delivery queue, D27-C / D30).

Mark that single case as deliberately deferred so the branch does not carry a red test into `feat`, and put a
comment above it that states: why it is deferred, that it is the acceptance test for the D27-C/D30 slice, and that
it must not be "fixed" by a fixed sleep (a constant delay only moves the delta, it does not remove the class).
Keep the test body intact — it is the saved oracle, not dead code.

## Boundaries

- Touch nothing else: no product code, no other test, no docs beyond what the change needs, no DB/env/deploy.
- Do not delete the test. Do not weaken any other assertion.

## Done means

- `pnpm --dir apps/webapp exec vitest run src/app/api/auth/email-otp/start/route.route.test.ts src/modules/auth/emailOtpPublic.unit.test.ts` → all reported cases pass, the deferred one reported as skipped.
- `pnpm --dir apps/webapp typecheck` and scoped ESLint pass; `git diff --check` clean.
- One commit on `wt/trackd-d27a2-email-enumeration`, no push.
