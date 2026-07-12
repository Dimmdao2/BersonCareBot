# Phase 3 orchestration — onboarding/provisioning

Status: in progress, started 2026-07-12.

Rules:
- No prod/test/dev database validation.
- Scratch/disposable prod-dump copies only for DB validation.
- No push from this branch unless owner explicitly asks.
- Lead orchestrates scope, branch hygiene, taskdb/docs, validation, audit, and commits.
- Workers/auditors handle bounded implementation or independent checks; Opus is reserved for key checkpoints and final verification.

## M1 — Specialist provisioning backend

Status: implemented and validated.

Scope:
- Added backend-only specialist signup start/confirm API.
- Added `specialist_signup_intents` as BOOTSTRAP pre-org provisioning state.
- Provisioning creates `be_organizations`, `be_specialists`, and owner `be_organization_members`; no `org_enrollments` owner row.
- Password login keeps DB-stored staff role when env allowlists do not promote it; `app.is_staff()` remains role-derived.
- No UI/auth boundary rewrite from #670 in this slice.

Validation, 2026-07-12:
- `pnpm --dir apps/webapp exec vitest --run src/modules/organization-provisioning/service.test.ts src/infra/repos/pgOrganizationProvisioning.test.ts src/infra/repos/pgAuthEmailPorts15B.repo.test.ts src/app/api/auth/specialist-signup/start/route.test.ts src/app/api/auth/specialist-signup/confirm/route.test.ts src/modules/auth/envRole.test.ts`
- `pnpm --dir apps/webapp typecheck`
- `pnpm --dir apps/webapp lint`
- `node scripts/check-saas-db-regression.mjs`
- `node --check` for changed SaaS descriptor/check scripts
- `git diff --check`

Audit:
- Independent Codex verifier found two P1 issues in the first pass: consumed-challenge retry and concurrent replay duplication.
- Both were fixed with consumed-challenge retry logic and transactional `FOR UPDATE`/idempotent provisioning.
- Follow-up verifier verdict: P1s fixed; P2 service-layer replay precheck found.
- P2 fixed by delegating replay and absent-intent handling to the transactional provisioning port; verifier confirmed it is resolved.

Residual:
- This is backend foundation only. Process-family live runtime proof and final prod-dump copy rehearsal remain later phase gates.
