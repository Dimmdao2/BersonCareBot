# P0.12 Residual Reference Checklist

Status: executable checklist for P0.12.1-P0.12.2.

Purpose: find scoped data hiding behind polymorphic references or JSON payloads before RLS family application.

## P0.12.1 Polymorphic References

Targets include:

- `comments.target_*`
- `item_ref_id`
- any other table found by scanning `target_type`, `target_id`, `ref_type`, `ref_id`, `item_ref_id`, or equivalent fields.

Checklist:

- [ ] Scan schema/code for polymorphic reference columns.
- [ ] Classify each target type as SCOPED, BOOTSTRAP, INFRA, LEGACY, TELEMETRY, or unknown.
- [ ] For each SCOPED target, declare resolver path to `organization_id`.
- [ ] For unresolved target types, block RLS family application until owner decision.
- [ ] Add checker artifact or table documenting resolved target coverage.
- [ ] Do not add database FK on polymorphic `item_ref_id`.

## P0.12.2 JSON Payload / Queue PII

Targets include:

- queue payloads;
- webhook payloads;
- delivery logs;
- audit payload JSON;
- retry/outbox payloads.

Checklist:

- [ ] Scan JSONB/text payload columns in SCOPED/BOOTSTRAP/INFRA/TELEMETRY tables.
- [ ] Identify payloads that contain user identifiers, phone, email, Telegram/MAX ids, appointment ids, or clinical content.
- [ ] Classify each user-bearing payload as SCOPED, BOOTSTRAP, LEGACY, or scrubbed/global.
- [ ] For INFRA/TELEMETRY payloads with user-bearing data, define scrub/retention or re-tier decision.
- [ ] Do not print PII samples; use aggregate counts and schema/key names only.
- [ ] Update `LOG.md`.

## Local Gate

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <residual scan/check script> && git diff --check"
```

## Definition Of Done

- No unresolved scoped polymorphic reference remains before RLS family apply.
- Every user-bearing JSON payload is scoped, bootstrap, legacy, or explicitly scrubbed/global.
- Decisions are documented without PII output.
