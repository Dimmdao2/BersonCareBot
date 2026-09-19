# S11 / PAY-REL-04 — worker evidence

- Cadence: resident scheduler wakes materialization every 10 minutes (`APPOINTMENT_PAYMENT_RECONCILIATION_WAKE_PERIOD_MS`); it does not call the provider.
- Durable work: one low-priority `outgoing_delivery_queue` row per unresolved appointment intent and one per organization/provider sweep. Each row enters the verified organization principal before provider configuration or settlement.
- Durable checkpoint: `public.be_payment_reconciliation_checkpoints` records each organization/provider watermark. The sweep uses `[min(watermark - 1h, oldest unresolved local intent), now]` and advances only after a non-truncated successful pass.
- Provider authority: YooKassa uses authenticated `GET /v3/payments/{id}` for nonterminal point reads and its existing authenticated list API for sweeps. The normalized fact retains object ref, local provider ref and the same event idempotency key as webhook verification.
- Settlement: reconciliation calls `app.settle_booking_payment_webhook_event(...)`, the accepted atomic settlement/outbox root; no reconciliation path updates payment or appointment relations directly.
- Incidents: provider list truncation, unavailable status capability, unresolved provider binding, binding mismatch and exhausted intent/sweep retries remain diagnosable queue/operator failures. A successful payment observed after local terminal cancellation is returned as `success_after_local_expiry`; terminal provider observations only cancel pending/processing intents and never emit a capture fact.

Validation run by this worker:

- `pnpm run check:db-privileges-generated` — PASS.
- `node deploy/postgres/privileges/migration-order.mjs` — PASS.
- `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` — PASS; rollback-only candidate preflight, `pending=1 total=241`.
- `pnpm run typecheck`, `pnpm run lint`, and targeted Vitest commands could not start because this checkout has no `node_modules` (`eslint`/`vitest` absent; TypeScript cannot resolve workspace dependencies). No dependency install, execute migration, CI, live UI, deploy, or push was performed.
