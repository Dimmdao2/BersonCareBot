# E1 reminder M2M organization context

Status: repo-side fix for the locked TEST post-runtime failure observed on 2026-07-16. No deploy or TEST mutation is part of this artifact.

## Runtime finding

One scheduler reminder tick produced three webapp `role_pool_mismatch` denials while the verified M2M request still held only the bootstrap principal:

1. reminder rule projection (`reminder_rules`);
2. delivery-target availability (`user_web_push_subscriptions`);
3. notify-channel idempotency (`idempotency_keys`).

The scheduler occurrence already carries the canonical `organizationId`. The old signed webapp contracts dropped it, so the webapp could not select a tenant principal before its first product/infra query.

## Contract

- `reminders.dispatchDue` fails closed when an occurrence has no organization.
- The signed rule, delivery-target, and notify-channel requests carry that occurrence organization.
- After signature verification, each webapp route validates the UUID and installs an `organization` DB principal before any query.
- Reminder rule caching is keyed by `(organizationId, integratorUserId)`, not user alone.
- Delivery-target and notify-channel paths verify an active patient enrollment when a platform user resolves.
- Delivery-target resolution also proves that the signed `integratorUserId` and messenger binding resolve to the same platform user.
- A rule or delivery-target denial/unavailable response remains an explicit failure through the HTTP adapter and aborts the occurrence; it never degrades to default rules or legacy messenger fallback.
- A missing delivery target is an explicit 404, not an empty successful binding set.
- Missing or malformed organization context is rejected before DB access.
- The bootstrap role receives no new direct table grants.

This follows `T0_2_REQUEST_PRINCIPAL_CONTEXT_PLAN.md`: a signed M2M caller is not itself a tenant source; the concrete reminder occurrence is.

## Validation boundary

Focused tests cover signed-contract propagation, missing-org denial, organization principal installation, enrollment mismatch, and the org-aware cache/input path. The next authorized TEST rehearsal must additionally prove org A success, org B denial, missing-org denial, and continued raw bootstrap denial before the post-runtime gate is rerun.
