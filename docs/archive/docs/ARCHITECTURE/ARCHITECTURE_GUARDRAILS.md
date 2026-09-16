# Architecture Guardrails

This document captures regression guardrails for the current live runtime path.

## Live Content Path

- Telegram content is loaded from scoped bundles only: `src/content/telegram/user` and `src/content/telegram/admin`.
- Root-level `src/content/telegram/scripts.json` and `src/content/telegram/templates.json` are forbidden when scoped bundles exist.
- Callback buttons declared in `src/content/telegram/user/menu.json` must have matching `callback.received` scripts.

## Security Guardrails

- Repo-known development secrets are rejected at startup outside `test` mode.
- Telegram contact linking accepts only self-owned contacts (`contact.user_id === from.id`).
- Phone linking is conflict-safe: an existing phone cannot be reassigned to another user via webhook flow.

### Registry advisory exceptions

`pnpm run ci` retains the full registry dependency audit. Its only exceptions live in [`scripts/registry-prod-audit-allowlist.json`](../../scripts/registry-prod-audit-allowlist.json): each entry is keyed by both advisory ID and package, states its reason, and has a `reviewBy` date. The audit prints every suppression and its reason; an expired entry fails the gate until it is re-justified or removed.

Add an entry only when no safe dependency remediation is available, with the concrete exposure analysis and a short review window. At review time, remove it if the dependency graph can be fixed; otherwise update the reason and future `reviewBy` date after rechecking the dependency and reachability. Never use an entry to cover another advisory or package.

## SaaS Foundation Guardrails

- New code and schema changes must account for the current `SAAS_FOUNDATION` direction: shared-DB SaaS, tenant = `Organization`, future data isolation.
- New clinical, patient-facing, doctor-facing, booking, messaging, notification, media, catalog, product, payment, entitlement, integration, settings, or staff/admin data must not be global by default.
- Before adding tables, columns, migrations, repositories, APIs, write paths, or jobs, choose and document the ownership path: direct `organization_id`, scoped parent, `specialist_id`, patient/enrollment, appointment, program instance, or true global catalog.
- Do not add ad hoc RLS/enforcement before the canonical `DB_ACCESS_CHOKEPOINT` + `SAAS_FOUNDATION` stages; use dormant/backward-compatible fields and backfills until then.
- Canonical execution rule: `docs/RULES/SAAS_FOUNDATION_AWARE_DEVELOPMENT.md`.

## Integrator Boundary Guardrails

- Integrator routes must not return `accepted: true` without durable persistence or queueing.
- Current behavior is explicit non-acceptance (`accepted: false`) until durable ingestion is implemented.
- Idempotency is persisted and checks payload hash to reject key-reuse with different payloads.
