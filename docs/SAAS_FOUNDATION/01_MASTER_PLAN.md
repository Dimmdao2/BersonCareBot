# Master plan — SAAS_FOUNDATION

SKELETON (2026-06-17). Phases, **Phase 0 stage spine**, critical sizing, **rules-compliance matrix**.
Sizing convention: stages are **Sonnet-sized** = one migration OR one small code-unit, step-level
verifiable, low blast radius, ≤ ~1 PR each. Prefer more cycles over bigger chunks.

## Phases (sizing from FOUNDATION_PLAN §v3/§13)
| Phase | What | Eng-weeks | Gate |
|---|---|---|---|
| **Phase 0** | dormant org-tenancy foundation (zero behavior change) | ~3–4.5 | none (safe) |
| Phase 0b | DB-role split + RLS dormant | (in P0) | **prod-parity confirmed** |
| T0 | enforcement cutover (resolver everywhere, 4 entrypoints, session, role swap) | ~6–9 | P0+0b done |
| Lifecycle | onboarding/billing/offboarding/bot-routing/quotas | ~5–8 | T0 |
| EN locale | activate en | ~3–4.5 | — |
| EU region | second cell + directory + gateway | ~7–11 | — |

## Phase 0 — stage spine (E1 first)
Legend: **V** = verify level (step/phase). Allowed paths are the scope boundary (§12.3).

### Group E1 — identity → organization
| # | Scope (one-liner) | Allowed paths | V | Size |
|---|---|---|---|---|
| F0.1 | Drizzle schema + migration `be_organization_members` (DDL only) | `apps/webapp/db/schema/*`, `db/drizzle-migrations/*` | step | S |
| F0.2 | Seed staff membership (1 doctor + 5 admins → org; doctor→specialist `518e…`) | `db/drizzle-migrations/*` or ops seed | step | S |
| F0.3 | `OrganizationMembershipPort` + pg impl + service `resolveOrganizationForUser` (not wired) | `modules/*/ports.ts`, `infra/repos/pg*`, `modules/*/service.ts` | step | M |
| F0.4 | Wire resolver into the 2 gates (`_requireDoctorBookingEngine`, `_requireAdminBookingEngine`) via DI; solo → same default | the 2 `_require*` files + `buildAppDeps` | step | S |
| F0.5 | Validate `?specialistId` ∈ resolved org (reject out-of-org); solo identical | calendar route(s) + parseCalendarQuery consumers | step | S |

### Group EN — enrollment
| # | Scope | Allowed paths | V | Size |
|---|---|---|---|---|
| F0.6 | Drizzle schema + migration `org_enrollments` | `db/schema/*`, `drizzle-migrations/*` | step | S |
| F0.7 | Backfill all clients → single-org enrollment (idempotent, no notifications, no PII print) | `drizzle-migrations/*` or ops backfill | step | S |

### Group SCOPE — clinical org columns
| # | Scope | Allowed paths | V | Size |
|---|---|---|---|---|
| F0.8 | Generate authoritative clinical-table list from `information_schema` (doc artifact) | this docs folder | step | S |
| F0.9 | Add nullable `organization_id` to clinical group A (~half) via Drizzle | `db/schema/*`, `drizzle-migrations/*` | step | M |
| F0.10 | Add nullable `organization_id` to clinical group B | same | step | M |
| F0.11 | Backfill `organization_id` → single org (batched, idempotent, no notifications) | `drizzle-migrations/*` or ops | phase | M |

### Group RLS — dormant (Phase 0b; **gated on prod-parity**)
| # | Scope | Allowed paths | V | Size |
|---|---|---|---|---|
| F0.12 | DB roles: migration/owner vs non-owner app role | ops/migration + deploy docs | step | M |
| F0.13 | RLS `ENABLE`+`FORCE` + GUC-gated permissive policies (raw-SQL custom Drizzle migration) | `drizzle-migrations/*` | phase | M |
| F0.14 | CI invariant: scoped table must have RLS+policy | webapp test | step | S |

### Group REST — dormant
| # | Scope | Allowed paths | V | Size |
|---|---|---|---|---|
| F0.15 | Per-org integration config via `system_settings` (scope), env fallback only as bootstrap | `modules/system-settings/*`, types `ALLOWED_KEYS` | step | M |
| F0.16 | i18n provider ru-only via **proxy** (not middleware) | `proxy.ts`, app root provider, `messages/ru.json` | step | M |
| F0.17 | S3 key prefix carries org (new objects) | `infra/s3/client.ts` | step | S |
| F0.18 | dormant `activeOrganizationId` session field | `shared/types/session.ts`, session write | step | S |
| F0.19a | transactional outbox scaffold | new module + table | phase | M |
| F0.19b | clinical audit-log trigger scaffold | `drizzle-migrations/*` | step | S |
| F0.19c | soft-delete columns on clinical tables | `drizzle-migrations/*` | step | S |
| F0.20 | multi-tenant isolation test fixtures (2 orgs + shared patient) | webapp test | phase | M |

## Critical sizing / adequacy (my assessment)
- **Right-sized (S/M, step-verifiable):** F0.1, F0.2, F0.4, F0.5, F0.6, F0.7, F0.8, F0.14, F0.17, F0.18, F0.19b, F0.19c — each ~1 PR, low risk.
- **Watch (M, may need a split):** F0.3 (port+impl+service+tests — could split into port/impl vs service/tests); F0.9/F0.10 (split clinical tables into more groups if the list is large — F0.8 decides); F0.13 (RLS across many tables — split per table-group); F0.15 (system_settings org-scoping touches the mirror — keep tight); F0.19a (outbox is genuinely a mini-project — likely 2–3 stages).
- **Already decomposed** F0.19 → a/b/c so no single "outbox+audit+soft-delete" mega-stage.
- **Verdict:** granularity is adequate for Sonnet; 4 stages flagged for finer split pending the F0.8 table count and an outbox sub-plan.

## Rules-compliance matrix (`.cursor/rules` / AGENTS.md)
Conflicts found in the draft + how stages comply:
| Rule | Impact | Resolution in stages |
|---|---|---|
| §2/§3/§4 + `000-…` integration config in DB not env | draft's SecretsResolver+env = violation | **F0.15** uses `system_settings` (scope) + mirror; **D7** |
| §5.5 new tables via Drizzle, no raw SQL | "migration" was generic | all DDL stages = Drizzle `db/schema`+`drizzle-migrations`; RLS = raw-SQL **custom** Drizzle migration (F0.13) |
| §5.1–5.7 clean-arch (ports/DI, thin routes) | resolver placement | **F0.3** = port in `modules/*/ports.ts`, impl in `infra/repos`, service via `buildAppDeps`; **F0.4** gates stay thin |
| §1b dev-PII isolation | verification must not leak/mutate | seeds/backfills idempotent, **no notifications, no PII in logs**; agent verifies via scratch DB / read-only counts, not patient writes |
| §10 test policy | no full CI per step | each stage V = step/phase (targeted Vitest + affected lint/typecheck); full `ci` only pre-push |
| §12 plan-authoring | plan format | этапы→шаги→проверки→DoD; per-step checklist; scope boundaries (cols above); no "optional"; **LOG.md**; executable plans → `.cursor/plans/*.plan.md` w/ frontmatter |
| §24 subagent orchestration | brief content | brief = self-contained + **no push / no commit to main**, `git -C` + explicit `git add <paths>` (never `-A`), STEP 0 merge feat + freshness marker, timeouts (no infinite waits), agent does NOT start dev-server; ≤1–2 agents |
| §7/§8/§9 git/CI | push semantics | commit per stage (own worktree), **no push** unless owner says; pre-push = full `ci` |

## Sequencing & gates
E1 (F0.1→F0.5) → EN (F0.6→F0.7) → SCOPE (F0.8→F0.11) → **[prod-parity gate]** → RLS (F0.12→F0.14) → REST (F0.15→F0.20).
Each stage: one Sonnet agent, own worktree, commit, no push; orchestrator reviews diff + runs the live/headless check (per §24, not the agent).
