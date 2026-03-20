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

## Integrator Boundary Guardrails

- Integrator routes must not return `accepted: true` without durable persistence or queueing.
- Current behavior is explicit non-acceptance (`accepted: false`) until durable ingestion is implemented.
- Idempotency is persisted and checks payload hash to reject key-reuse with different payloads.
