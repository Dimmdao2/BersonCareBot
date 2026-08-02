# YooKassa Idempotence-Key limit — independent audit (2026-08-02)

Candidate: `adac865f61594128bc1d95911453d48bc3a42bc9`.

## Blind kill-set — recorded before reading candidate tests

Oracle: `SAAS_BILLING_PLAN.md`, Phase 4, “Проверка” — “state-machine + idempotency тесты”; YooKassa interaction-format contract: `Idempotence-Key` has a 64-character maximum.

1. Bypass long-key normalization only in the ordinary payment POST: an assertion must fail because its outgoing `Idempotence-Key` is longer than 64 characters.
2. Bypass long-key normalization only in the invoice POST: an assertion must fail because its outgoing `Idempotence-Key` is longer than 64 characters.
3. Bypass long-key normalization only in the refund POST: an assertion must fail because its outgoing `Idempotence-Key` is longer than 64 characters.
4. Hash a valid non-empty key of length at most 64: an assertion must fail because the wire header is no longer byte-for-byte equal to the original key.
5. Change the original long key between otherwise equivalent requests: assertions must require a different 64-character SHA-256 header; repeated same-original requests must retain the same header and body.

View-only scope checks: internal provider/DB metadata retains the original key; no schema/service/repository change, extra HTTP request, or credential/body logging; every header-setting POST branch uses the normalization boundary.

## Result

All five blind classes are covered; four required product fault injections were run personally and then restored.

| Fault / check | Resulting assertion | Verdict |
| --- | --- | --- |
| Ordinary payment POST uses the original long key | `normalizes a long payment key deterministically without changing its body` fails at `paymentProviderIdentity.unit.test.ts:262` | Killed |
| Invoice POST uses the original long key | `normalizes a long YooKassa invoice key only in its HTTP header` fails at `paymentProviderIdentity.unit.test.ts:281` | Killed |
| Refund POST uses the original long key | `normalizes a long YooKassa refund key only in its HTTP header` fails at `paymentProviderIdentity.unit.test.ts:298` | Killed |
| All keys are hashed, including `b1-1-intent` | `keeps a valid payment key byte-for-byte unchanged` fails at `paymentProviderIdentity.unit.test.ts:244` | Killed |
| Same/different long original | Payment acceptance asserts equal hash and body for repeats, and a distinct SHA-256 hash after changing the original | Covered |

View checks of `adac865f61594128bc1d95911453d48bc3a42bc9`:

- The only product change is the YooKassa adapter: a local `yookassaIdempotenceKey` is derived for outgoing POST headers. The original `idempotencyKey` remains in `paymentMetadata`, and no schema, service, repository, or provider-port code changed.
- Every header-bearing POST (`/invoices`, `/payments`, `/refunds`) uses that local normalized value. No additional fetch is introduced.
- The diff adds no logging; it does not expose credentials, request bodies, or metadata.
- The original non-empty short key remains byte-for-byte unchanged. A long original becomes Node SHA-256 hexadecimal output (64 characters), preserving deterministic retry behavior on the wire while internal identity stays original.

Blind classes: 5; killed/covered: 5; missed: 0.

## Commands and validation

All commands were run from `/home/dev/dev-projects/bcb-wt-yookassa-idempotence-key-limit`.

```text
pnpm --dir apps/webapp exec vitest run --project unit src/infra/payments/paymentProviderIdentity.unit.test.ts
# PASS: 1 file, 10 tests

pnpm --dir apps/webapp exec eslint src/infra/payments/yookassaPaymentProvider.ts src/infra/payments/paymentProviderIdentity.unit.test.ts
# PASS

pnpm --dir packages/db-principal run build
pnpm --dir packages/operator-db-schema run build
pnpm --dir packages/platform-merge run build
pnpm --dir packages/error-tracking run build
# PASS: required only because the first webapp typecheck found their local dist declarations absent

pnpm --dir apps/webapp exec tsc --noEmit
# PASS after the four dependency builds

node scripts/check-no-new-raw-sql.mjs
# PASS: check-no-new-raw-sql: OK (integrator manifest files: 7; webapp manifest files: 21)

git diff --check
# PASS
```

No DB, migration, settings, environment, deploy, or HTTP call outside the mocked unit-test boundary was made. The candidate SHA is `adac865f61594128bc1d95911453d48bc3a42bc9`; the contract limit and the SHA-256 hexadecimal output are both 64 characters.
