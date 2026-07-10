# P0.12 Residual Reference Checklist

Status: executable checklist for P0.12.1-P0.12.2.

Purpose: find scoped data hiding behind polymorphic references or JSON payloads before RLS family application.

## P0.12.1 Polymorphic References

Targets include:

- `comments.target_*`
- `item_ref_id`
- any other table found by scanning `target_type`, `target_id`, `ref_type`, `ref_id`, `item_ref_id`, or equivalent fields.

Checklist:

- [x] Scan schema/code for polymorphic reference columns.
- [x] Classify each target type as SCOPED, BOOTSTRAP, INFRA, LEGACY, TELEMETRY, or unknown.
- [x] For each SCOPED target, declare resolver path to `organization_id`.
- [x] For unresolved target types, block RLS family application until owner decision.
- [x] Add checker artifact or table documenting resolved target coverage.
- [x] Do not add database FK on polymorphic `item_ref_id`.

P0.12.1 execution note (2026-07-08): documented persisted polymorphic reference families in
`scope-derivation/p0-12-polymorphic-references.tsv`: `comments.target_type/target_id`,
`patient_home_block_items.target_type/target_ref`, template/instance stage-item
`item_type/item_ref_id`, `material_ratings.target_kind/target_id`, and
`treatment_program_events.target_type/target_id`. `admin_audit_log.target_id` is documented as a
non-polymorphic text pointer with row ownership already on `organization_id`. Added
`check-p0-12-polymorphic-references.mjs` to verify exact target coverage, schema CHECK parity,
resolved organization paths for SCOPED targets, and no DB FK on polymorphic `item_ref_id`.

## P0.12.2 JSON Payload / Queue PII

Targets include:

- queue payloads;
- webhook payloads;
- delivery logs;
- audit payload JSON;
- retry/outbox payloads.

Checklist:

- [x] Scan JSONB/text payload columns in SCOPED/BOOTSTRAP/INFRA/TELEMETRY tables.
- [x] Identify payloads that contain user identifiers, phone, email, Telegram/MAX ids, appointment ids, or clinical content.
- [x] Classify each user-bearing payload as SCOPED, BOOTSTRAP, LEGACY, or scrubbed/global.
- [x] For INFRA/TELEMETRY payloads with user-bearing data, define scrub/retention or re-tier decision.
- [x] Do not print PII samples; use aggregate counts and schema/key names only.
- [x] Update `LOG.md`.

P0.12.2 execution note (2026-07-08): documented payload-like JSON/text columns in
`scope-derivation/p0-12-json-payload-columns.tsv`. User-bearing SCOPED payloads stay scoped through
materialized `organization_id`; BOOTSTRAP `system_settings.value_json` stays org-aware under P0.11;
LEGACY Rubitime/appointment payloads stay frozen; INFRA queue/outbox payloads are explicitly
classified as transient operational rows with retention/scrub decisions rather than automatic re-tier.
The checker verifies exact artifact coverage, tier parity with `tiers-218.tsv`, no PII-looking sample
values, and retention/scrub decisions for INFRA/TELEMETRY user-bearing payloads.

## Local Gate

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <residual scan/check script> && git diff --check"
```

## Definition Of Done

- No unresolved scoped polymorphic reference remains before RLS family apply.
- Every user-bearing JSON payload is scoped, bootstrap, legacy, or explicitly scrubbed/global.
- Decisions are documented without PII output.
