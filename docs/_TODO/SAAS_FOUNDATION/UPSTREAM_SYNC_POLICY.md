# Upstream Sync Policy — SaaS Foundation

Status: draft policy for `codex/saas-roadmap-foundation`.

Purpose: keep the future SaaS product close enough to the main BersonCareBot codebase so UI/product fixes can be reused without double implementation, while preserving SaaS foundation isolation work.

## Branches

- SaaS foundation branch: `codex/saas-roadmap-foundation`.
- Primary upstream development branch: `feat/doctor-ui-rebuild`, unless the owner names a different branch.
- Do not push this branch unless explicitly requested.

## Sync Cadence

Sync from upstream before starting large R0/R1 micro-stages that touch shared routes, app-layer, DI, settings, media, reminders, messaging, analytics, or patient/doctor UI.

Recommended checkpoints:

- after every 3-6 completed R0/R1 micro-stage commits;
- before taking a large file such as `channelLink`, `messengerPhoneHttpBindExecute`, media health/backfill, or `system_settings`;
- before creating a fork/clone for a separate SaaS product;
- before any branch is proposed for PR/review.

Prefer merge commits for long-running foundation work. Rebase is allowed only with explicit owner direction, because the micro-stage history is part of the audit trail.

## Conflict Resolution Rules

When upstream conflicts with SaaS foundation changes:

- Preserve upstream UI/product improvements unless they reintroduce a forbidden R0/R1 pattern.
- Preserve R0/R1 architectural decisions: no route/page/module DB bypasses that were already removed, no new ESLint allowlist exceptions, no new TypeScript `any`.
- If upstream changed the same route/page, combine both intentions: keep new UI/data shape from upstream, keep DB access behind app-layer/ports/repos from SaaS work.
- Do not resolve conflicts by reverting SaaS commits unless the owner explicitly asks for that.
- If a conflict implies a product decision, stop and ask; do not invent SaaS semantics.

## Pulling UI Fixes After SaaS Extraction

After a separate SaaS repo/product exists, keep the original BersonCareBot repo as an `upstream` remote. Reuse changes by merge or cherry-pick, not by manual copy, when possible.

Good candidates to pull:

- shared UI components;
- doctor/patient screen polish;
- analytics/settings UX fixes;
- bug fixes in common app-layer services;
- tests for common behavior.

High-risk candidates:

- migrations touching tenant-scoped tables;
- auth/session/role changes;
- integration settings and external-channel delivery;
- billing/marketplace/product-platform work;
- prod/deploy/service-name changes;
- changes that assume a single organization or global settings without fallback.

## SaaS Difference Boundary

Keep SaaS-specific behavior configurable instead of forking screens.

Prefer:

- tenant/product settings;
- feature flags;
- app-layer adapters;
- shared components with data-driven variants;
- per-product branding/config files.

Avoid:

- duplicated screens named `*Saas`;
- copied route trees for the same workflow;
- hardcoded product text inside common components;
- separate UI implementations for analytics/settings/patient card unless the workflow is truly different.

## Validation After Sync

For every upstream merge into the SaaS branch:

1. Resolve conflicts and stage only after conflict markers are gone.
2. Run `git diff --check`.
3. Run targeted tests for conflicted files and any touched route/page/service boundary.
4. Run local eslint for conflicted files.
5. Run `rg` checks for the exact R0/R1 invariant at risk, for example direct DB imports in route/page/module files.
6. Record the merge commit and checks in the active initiative log when the sync materially affects R0/R1 work.

Full CI is not required for every sync checkpoint, but it is required before push or PR readiness.

## Extraction Checklist Seed

Before cloning/forking into a separate SaaS product, create a dedicated extraction plan that covers:

- new repo/remote ownership;
- new database name, role, migrations, seed/backfill strategy;
- no production DB reads/writes from the new product;
- separate env files and secrets;
- separate service names, ports, domains, deploy paths, and GitHub Actions secrets;
- separate object storage buckets/prefixes;
- external channel isolation for Telegram, MAX, SMSC, email, web push, S3;
- data sanitization if any dump is used;
- smoke checks for auth, settings, patient/doctor flows, integrations disabled state, and background workers.
