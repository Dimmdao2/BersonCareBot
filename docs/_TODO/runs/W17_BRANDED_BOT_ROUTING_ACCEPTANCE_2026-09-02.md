# W17 — branded bot routing acceptance, 2026-09-02

## Verdict

**PASS AFTER FIX** for the W17 routing surface on candidate `wt/w17-bot-routing-20260902`.

The independent audit run `w17-bot-routing-audit-20260902` ended before writing its report, but its
acceptance tests remained on disk. They were inspected, retained only where they exercise durable
owner contracts, and run red against the worker implementation before the lead correction.

## Failures caught before correction

- forwarding/provider failure was converted to success and retained its dedup key;
- an unsafe MAX destination could be rounded to another recipient;
- tariff/settings read failures looked like “forwarding disabled”;
- clinic-name read failure silently removed the sender identity;
- rejected Telegram/MAX dedicated webhook processing still returned HTTP success;
- the browser-facing settings response removed the public bot id and forwarding fields together
  with the secret;
- malformed partial forwarding input silently reset stored state.

The correction keeps disabled/unconfigured forwarding as a normal no-op, while operational failures
remain visible and retryable. Message text is sent directly and is not copied into a durable queue;
only the existing technical dedup and real failed-attempt records remain.

## Final evidence

```text
pnpm --dir apps/integrator exec vitest --run \
  src/integrations/common/clinicBotInboundForward.acceptance.test.ts \
  src/integrations/telegram/dedicatedWebhook.route.test.ts \
  src/integrations/max/dedicatedWebhook.route.test.ts \
  src/infra/db/clinicSenderName.unit.test.ts \
  src/infra/db/clinicDeliveryCredentials.unit.test.ts \
  src/app/routes.failClosed.test.ts \
  src/infra/adapters/dispatchPort.test.ts

7 files passed; 63 tests passed.

pnpm --dir apps/webapp exec vitest --run --project=unit \
  src/modules/system-settings/clinicDeliverySettings.unit.test.ts

1 file passed; 9 tests passed.

pnpm --dir apps/webapp exec vitest --run --project=route \
  src/app/api/auth/check-phone/checkPhoneEnumeration.route.test.ts

1 file passed; 14 tests passed.

pnpm check:db-privileges-generated

DEV/TEST privilege, allowlist and port-context artifacts match the declaration byte-for-byte.

pnpm test:db-privileges

320 tests; 174 passed; 146 environment-gated skipped; 0 failed.
```

## Deployment boundary

The current shared `test.bersoncare.ru` deployment deliberately remains on the common Therapysto bot.
The branded phone-bind branch is selected only by `patient_branded` surface data. Production wiring
of the tenant Host resolver remains the already-open branding/domain-cutover stage; no domain or Host
behavior is changed by W17. This is a named deployment boundary, not a silent platform fallback.
