# B0.3 — apply on DEV and deploy TEST (short run)

Rules: `AGENTS.md` — Маршрут, CORE rules, §1 «Миграции», §6, §9, §24. Language: internal work is English.

⚠️ **Two hard constraints on this run:**
1. **You are one shot — there is no next turn.** Run everything in the foreground; **commit before you finish**.
2. **Finish inside ~20 minutes.** The host reaper kills any port run older than 25 minutes that sits below 1% CPU,
   and a long wait on a build looks exactly like that. This brief is deliberately narrow so it fits. If you are
   running out of time, commit what you have and report where you stopped — do not start the live payment here.

Authority: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` **B0.3**; task `#1057`.

Источник оракула: `#1057` — «клиника выбирает и оплачивает тариф через настоящий PSP, получает и продлевает
доступ».

## State

Your branch `wt/billing-live-vat` carries, on top of `feat`: the paid-tariff accessor (`0348`), the watermark
reconciliation for `0346`, the E1 overlay fix, the U3S smoke fixture update, and the capture path's trial-ending
grant (`bcec559b1`). The last TEST deploy before that final grant ended green.

## Work — only this

1. `bash deploy/host/migrate-dev.sh --preflight && bash deploy/host/migrate-dev.sh --execute` — foreground.
   Record each applied migration with its journal idx/when and verify the result against the database, not the
   runner's word.
2. `bash deploy/host/deploy-test.sh <your branch>` — foreground. It must end green, every closure gate passing.
   If a gate is red, read its output and fix the registered expectation or the real gap, then re-deploy — but keep
   an eye on the clock and stop if you approach the limit.
3. Commit whatever you changed, with the deploy log path in the message.

**Do not run the live payment in this run.** It is the next, separate run.

## Boundaries

- **PROD (`135.106.162.170`) is untouchable.** TEST/DEV only.
- Do not touch the guard trigger, the webhook verification, or the invoice state machine.
- No push.

## Done means

One line: DEV applied (yes/no, with journal values), TEST deploy green (yes/no, with the log path), and anything
still red named exactly.
