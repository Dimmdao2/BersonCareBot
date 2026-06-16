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
| F0.3a | `OrganizationMembershipPort` (modules/*/ports.ts) + pg impl (infra/repos) | `modules/*/ports.ts`, `infra/repos/pg*` | step | S |
| F0.3b | resolver service `resolveOrganizationForUser` + unit tests (single→org / none→default / multi→active) | `modules/*/service.ts`, test | step | S |
| F0.4 | Wire resolver into the 2 gates (`_requireDoctorBookingEngine`, `_requireAdminBookingEngine`) via DI; solo → same default | the 2 `_require*` files + `buildAppDeps` | step | S |
| F0.5 | Validate `?specialistId` ∈ resolved org (reject out-of-org); solo identical | calendar route(s) + parseCalendarQuery consumers | step | S |

### Group EN — enrollment
| # | Scope | Allowed paths | V | Size |
|---|---|---|---|---|
| F0.6 | Drizzle schema + migration `org_enrollments` | `db/schema/*`, `drizzle-migrations/*` | step | S |
| F0.7 | Backfill all clients → single-org enrollment (idempotent, no notifications, no PII print) | `drizzle-migrations/*` or ops backfill | step | S |

### Group SCOPE — clinical org columns (grounded: ~18 tables, see classification above)
| # | Scope | Allowed paths | V | Size |
|---|---|---|---|---|
| F0.8a | Classify the 44 user-owned tables → scope/global/defer/legacy (decision doc; **must NOT scope auth/identity**) | this docs folder | step | S |
| F0.8b | Owner sign-off on ~5 borderline tables | — (gate) | — | S |
| F0.9a | nullable `organization_id` on clinical **B1** (symptom/diary/practice, 6) via Drizzle | `db/schema/*`, `drizzle-migrations/*` | step | S |
| F0.9b | nullable `organization_id` on **B2** (lfk/reminders/intake/notes, 6) | same | step | S |
| F0.9c | nullable `organization_id` on **B3** (communication/content, 6) | same | step | S |
| F0.11 | Backfill `organization_id` → single org, all scope tables (idempotent, no notifications, no PII print) | `drizzle-migrations/*` or ops | phase | M |

### Group RLS — dormant (Phase 0b; **gated on prod-parity**)
| # | Scope | Allowed paths | V | Size |
|---|---|---|---|---|
| F0.12 | DB roles: migration/owner vs non-owner app role | ops/migration + deploy docs | step | M |
| F0.13a | RLS `ENABLE`+`FORCE` + GUC-gated policy on **B1** (6) — raw-SQL custom Drizzle migration | `drizzle-migrations/*` | phase | M |
| F0.13b | RLS on **B2** (6) | `drizzle-migrations/*` | phase | M |
| F0.13c | RLS on **B3** (6) | `drizzle-migrations/*` | phase | M |
| F0.14 | CI invariant: scoped table must have RLS+policy | webapp test | step | S |

### Group REST — dormant
| # | Scope | Allowed paths | V | Size |
|---|---|---|---|---|
| F0.15 | Per-org integration config via `system_settings` (scope), env fallback only as bootstrap | `modules/system-settings/*`, types `ALLOWED_KEYS` | step | M |
| F0.16 | i18n provider ru-only via **proxy** (not middleware) | `proxy.ts`, app root provider, `messages/ru.json` | step | M |
| F0.17 | S3 key prefix carries org (new objects) | `infra/s3/client.ts` | step | S |
| F0.18 | dormant `activeOrganizationId` session field | `shared/types/session.ts`, session write | step | S |
| F0.19a1 | outbox table (Drizzle migration) | `db/schema/*`, `drizzle-migrations/*` | step | S |
| F0.19a2 | outbox relay worker + enqueue helper | new module | phase | M |
| F0.19a3 | route one producer (booking→notify) through outbox | the producer path | phase | M |
| F0.19b | clinical audit-log trigger scaffold | `drizzle-migrations/*` | step | S |
| F0.19c | soft-delete columns on clinical tables | `drizzle-migrations/*` | step | S |
| F0.20 | multi-tenant isolation test fixtures (2 orgs + shared patient) | webapp test | phase | M |

## Clinical scope classification (grounded F0.8 — read-only `information_schema`, 2026-06-17)
> ⛔ **INVALID — superseded by fresh review C1 (REVIEW_2026-06-17_FRESH.md).** The heuristic below
> matched only `platform_user_id|user_id` (2 of 15 user-key columns) and **missed the entire EHR core
> keyed by `patient_user_id`** (18 tables incl. clinical_diagnosis/visit, patient_files, patient_payment)
> + ~20 child tables. Real SCOPE surface ≈ **45–55**, not 18. Re-derive by FK reachability (new F0.8);
> B1/B2/B3 batching invalidated. The list below is kept only as the record of the error.

44 user-owned public tables lack `organization_id`. **NOT all are per-org** — scoping a global
identity/auth table would be a BUG (a person has ONE password / phone / channel binding across all
orgs). Classification:
- **SCOPE — per-org clinical/communication (~18):** symptom_entries, symptom_trackings, lfk_sessions, lfk_complexes, doctor_notes, online_intake_requests, patient_diary_day_snapshots, patient_practice_completions, patient_daily_warmup_presentations, patient_daily_warmup_video_views, reminder_rules, webapp_reminder_occurrences, message_log, support_conversations, broadcast_audit_recipients, material_ratings, patient_content_rating_feedback, product_push_notifications.
- **GLOBAL — do NOT scope (person identity/auth/channel, ~16):** user_password_credentials, user_oauth_bindings, user_pins, login_tokens, email_challenges, email_send_cooldowns, user_email_setup_tokens, channel_link_secrets, phone_messenger_bind_secrets, user_channel_bindings, user_channel_preferences, user_phone_history, platform_user_contacts, user_web_push_subscriptions, user_notification_topics, user_notification_topic_channels.
- **DEFER — global telemetry (~7):** product_analytics_events_recent, product_analytics_user_hourly, media_playback_client_events, media_playback_resolution_events, media_playback_user_video_first_resolve, media_hls_proxy_error_events, notification_delivery_attempts.
- **EXCLUDE — legacy Rubitime (2):** appointment_records, patient_bookings.
- **Borderline → owner sign-off (F0.8b):** product_push_notifications, broadcast_audit_recipients, material_ratings, patient_content_rating_feedback, content_access_grants_webapp.

**Result: SCOPE+RLS surface cut from ~50 to ~18.** Three batches of 6 (drive F0.9a/b/c + F0.13a/b/c):
B1 symptom/diary/practice · B2 lfk/reminders/intake/notes · B3 communication/content.

## Critical sizing / adequacy (my assessment)
- **Right-sized (S/M, step-verifiable):** F0.1, F0.2, F0.4, F0.5, F0.6, F0.7, F0.8, F0.14, F0.17, F0.18, F0.19b, F0.19c — each ~1 PR, low risk.
- **Watch (M, may need a split):** F0.3 (port+impl+service+tests — could split into port/impl vs service/tests); F0.9/F0.10 (split clinical tables into more groups if the list is large — F0.8 decides); F0.13 (RLS across many tables — split per table-group); F0.15 (system_settings org-scoping touches the mirror — keep tight); F0.19a (outbox is genuinely a mini-project — likely 2–3 stages).
- **Already decomposed** F0.19 → a/b/c so no single "outbox+audit+soft-delete" mega-stage.
- **Verdict (after decomposition):** ~20 spine stages → **~30 fine stages** (F0.3→3a/3b; F0.8→8a/8b; F0.9/10→9a/9b/9c grounded by the 18-table classification; F0.13→13a/b/c; F0.19a→a1/a2/a3). Each fine stage ≈ 1 PR, step/phase-verifiable. Per-stage briefs + rule-tags in `02_PHASED_BRIEF.md`.

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
