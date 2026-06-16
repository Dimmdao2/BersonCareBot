# Phased brief — SAAS_FOUNDATION

SKELETON (2026-06-17). This file holds the **brief template** (used verbatim per stage) + **per-stage
stubs**. Full per-stage briefs are expanded **on approval**, one stage at a time, just before handing
to a Sonnet subagent. Executable plan per stage also lands as `.cursor/plans/<stage>.plan.md` (YAML
frontmatter, todos) per `.cursor/rules/plan-authoring-execution-standard`.

---
## Brief template (every stage uses this shape — §12 + §24 compliant)

```
# Stage F0.x — <title>
GOAL: <one sentence, the dormant outcome>
NON-GOALS: <explicitly out of scope; e.g. "no RLS", "no env vars", "no UI">

READ FIRST (cold start — do not work from memory):
- docs/SAAS_FOUNDATION/00_DECISIONS_AND_SCHEMA.md, 01_MASTER_PLAN.md
- AGENTS.md §<relevant> + the named .cursor/rules/*.mdc
- <module *.md / etalon files>

ALLOWED PATHS (scope boundary — touch nothing else): <dirs/files>
OUT OF SCOPE (do not change): <adjacent systems, migrations, UI unless listed>

DELIVERABLES (each in Definition of Done, no "optional"):
1. <Drizzle schema/migration | port+service | test | …> — exact files

CONTRACTS: Drizzle ORM only (db/schema + drizzle-migrations); ports in modules/*/ports.ts,
  impl in infra/repos, service via buildAppDeps; route handlers thin; match neighbouring style.

GUARDRAILS:
- Additive & DORMANT: single org → behavior byte-for-byte unchanged. Idempotent migrations/seeds.
- Integration config → system_settings (scope), NEVER env (rule 000).
- dev DB = real PII: NO writes of app data, NO notifications, NO PII in logs; verify via scratch DB / read-only counts.
- No infinite waits (timeouts / attempt caps). Do NOT start the dev-server.
- Git: `git -C <main-checkout>`, explicit `git add <paths>` (NEVER `-A`); STEP 0 = merge feat branch + check freshness marker; commit in own worktree; **NO push, NO commit to main**.

VERIFY (step-level — NOT full ci):
- <targeted Vitest file/pattern>, affected `typecheck`/`lint`, `rg` checks, idempotency re-run.

DEFINITION OF DONE (3–7 measurable): <…>
REPORT: changed areas, checks run + results, what was deliberately skipped.
```

---
## Per-stage stubs (expand on approval)
*(scope/paths/verify already in `01_MASTER_PLAN.md` stage spine; stubs below are placeholders)*

- **F0.1** `be_organization_members` — TBD on approval.
- **F0.2** seed staff membership — TBD.
- **F0.3** membership port + resolver service — TBD (candidate split: port/impl vs service/tests).
- **F0.4** wire resolver into 2 gates — TBD.
- **F0.5** validate `?specialistId` ∈ org — TBD.
- **F0.6** `org_enrollments` table — TBD.
- **F0.7** enrollment backfill — TBD.
- **F0.8** clinical-table inventory — TBD.
- **F0.9 / F0.10** clinical `organization_id` cols A/B — TBD (regroup per F0.8 count).
- **F0.11** clinical org backfill — TBD.
- **F0.12** DB role split — TBD (needs prod-parity confirm).
- **F0.13** RLS dormant (FORCE + GUC-gated) — TBD (split per table-group).
- **F0.14** CI RLS invariant — TBD.
- **F0.15** per-org integration config via system_settings — TBD.
- **F0.16** i18n provider (proxy) — TBD.
- **F0.17** S3 org key prefix — TBD.
- **F0.18** dormant session `activeOrganizationId` — TBD.
- **F0.19a/b/c** outbox / audit trigger / soft-delete — TBD (outbox likely its own sub-plan).
- **F0.20** isolation test fixtures — TBD.
