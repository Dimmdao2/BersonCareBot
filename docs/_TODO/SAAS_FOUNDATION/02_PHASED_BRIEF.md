# Phased brief — SAAS_FOUNDATION

SKELETON (2026-06-17). **Brief template** (used verbatim per stage) + **fine stage list with per-stage
rules-check**. Full prose briefs are expanded **on approval**, one stage at a time, just before handing
to Sonnet. Executable plan per stage also lands as `.cursor/plans/<stage>.plan.md` (YAML frontmatter,
todos) per `.cursor/rules/plan-authoring-execution-standard`.

---
## Brief template (every stage uses this shape — §12 + §24 compliant)

```
# Stage F0.x — <title>
GOAL: <one sentence, the dormant outcome>      NON-GOALS: <out of scope: e.g. no RLS, no env, no UI>
READ FIRST (cold start): 00_DECISIONS_AND_SCHEMA.md, 01_MASTER_PLAN.md, AGENTS.md §<n> + named .cursor/rules, <module *.md / etalon>
ALLOWED PATHS (scope boundary — touch nothing else): <dirs/files>     OUT OF SCOPE: <adjacent systems>
DELIVERABLES (each in DoD, no "optional"): 1. <exact files> …
CONTRACTS: Drizzle ORM only (db/schema + drizzle-migrations); ports in modules/*/ports.ts, impl infra/repos, service via buildAppDeps; thin routes; match neighbouring style.
GUARDRAILS:
- Additive & DORMANT: single org → behavior byte-for-byte unchanged. Idempotent migrations/seeds.
- Integration config → system_settings (scope), NEVER env (rule 000).
- dev DB = real PII: NO app-data writes, NO notifications, NO PII in logs; verify via scratch DB / read-only counts.
- No infinite waits (timeouts/attempt caps). Do NOT start the dev-server.
- Git: `git -C <main>`, explicit `git add <paths>` (NEVER -A); STEP 0 = merge feat + check freshness marker; commit in own worktree; NO push, NO commit to main.
VERIFY (step-level, NOT full ci): <targeted Vitest file/pattern>, affected typecheck/lint, rg checks, idempotency re-run.
DEFINITION OF DONE (3–7 measurable): <…>      REPORT: changed areas, checks+results, deliberately skipped.
```

---
## Fine stage list + per-stage rules-check
Rule tags: **D**=Drizzle-only · **P**=ports/DI clean-arch · **E**=config in system_settings not env (rule 000) · **PII**=dev-PII (no writes/notif/PII-print; scratch/RO verify) · **ID**=identity-global (must NOT org-scope auth tables) · **MW**=proxy not middleware · **T**=step/phase test only · **G**=§24 git (no push/commit-main, `git -C`, explicit add) · **Gate**=needs owner/prod input.

| # | Stage | Verify | Rules-check |
|---|---|---|---|
| F0.1 | Drizzle `be_organization_members` (schema+migration) | apply on scratch; idempotent; typecheck | D, T, G |
| F0.2 | Seed staff membership (1 doctor+5 admins→org; doctor→specialist `518e…`; skip dup `c951…`) | RO count on dev (no PII print); idempotent | D, PII, T, G |
| F0.3a | `OrganizationMembershipPort` + pg impl | targeted unit; typecheck | P, D, T, G |
| F0.3b | Service `resolveOrganizationForUser` + unit tests (single→org/none→default/multi→active) | Vitest pattern | P, T, G |
| F0.4 | Wire resolver into 2 gates (`_require*BookingEngine`) via DI; solo→default unchanged | gate test; orchestrator headless smoke (not agent) | P, T, G |
| F0.5 | Validate `?specialistId` ∈ resolved org (reject out-of-org); solo identical | targeted test | P, T, G |
| F0.6 | Drizzle `org_enrollments` (schema+migration) | apply scratch; idempotent | D, T, G |
| F0.7 | Backfill all clients→single-org enrollment | RO count==clients; idempotent re-run | PII, T, G |
| F0.8a | Classify 44 user-owned tables → scope/global/defer/legacy (decision doc) | doc review; **must NOT scope auth/identity** | ID, T(doc), G |
| F0.8b | Owner sign-off on ~5 borderline tables | — | Gate |
| F0.9a | nullable `organization_id` on B1 (symptom/diary/practice, 6) | apply scratch; nullable; typecheck | D, ID, T, G |
| F0.9b | nullable `organization_id` on B2 (lfk/reminders/intake/notes, 6) | same | D, ID, T, G |
| F0.9c | nullable `organization_id` on B3 (communication/content, 6) | same | D, ID, T, G |
| F0.11 | Backfill `organization_id`→single org on all 18 (batched) | RO counts; idempotent | PII, T, G |
| F0.12 | DB roles: migration/owner vs non-owner app role | scratch; **prod-parity confirm first** | Gate, G |
| F0.13a | RLS ENABLE+FORCE + GUC-gated policy on B1 (raw-SQL custom Drizzle migration) | scratch: GUC off=unchanged, on=isolated | D, T, G |
| F0.13b | RLS on B2 | same | D, T, G |
| F0.13c | RLS on B3 | same | D, T, G |
| F0.14 | CI invariant: scoped table must have RLS+policy | the test itself | T, G |
| F0.15 | Per-org integration config via `system_settings` (scope) + mirror; env = bootstrap only | targeted; mirror sync test | **E**, P, T, G |
| F0.16 | i18n provider ru-only via **proxy** (not middleware) | provider mounts; locale resolves | MW, T, G |
| F0.17 | S3 key prefix carries org (new objects) | unit on key builder | T, G |
| F0.18 | dormant `activeOrganizationId` session field | session shape test | T, G |
| F0.19a1 | outbox table (Drizzle migration) | apply scratch | D, T, G |
| F0.19a2 | outbox relay worker + enqueue helper | worker unit; timeout-bounded | P, T, G |
| F0.19a3 | route one producer (booking→notify) through outbox | targeted; same-tx test | P, T, G |
| F0.19b | clinical audit-log trigger scaffold (raw-SQL Drizzle migration) | scratch trigger test | D, T, G |
| F0.19c | soft-delete columns on scope tables | apply scratch; nullable | D, T, G |
| F0.20 | multi-tenant isolation fixtures (2 orgs + shared patient) + isolation test | the test (run under non-bypass role) | T, G |

**Gates inside Phase 0:** F0.8b (borderline tables) and F0.12/F0.13* (prod-parity: prod app-role privileges + pooling). E1+EN+SCOPE (F0.1–F0.11) need **no** prod input — can start immediately.
