# SAAS Foundation — PLAN v9 (canonical, 2026-06-30)

v9 changelog (pre-start sizing pass): architecture/scope unchanged from v8, but the executable Phase 0 spine is no longer allowed to run from aggregate labels. The pass found oversized start risks in P0.4/P0.7/P0.8/P0.11/P0.13 and split them into micro-stages with local gates. P0.1 remains the first executable stage; any agent brief must target one `P0.x.y` micro-stage, not an aggregate `P0.x` bucket.

v8 changelog (folds round-7 confirmation — 1 HIGH, a real leak the 1st clean missed → why 2-consecutive matters): 3 audit tables (`admin_audit_log`, `broadcast_audit`, `content_section_slug_history`) had a **FK / soft reference to `platform_users`** via non-standard columns (`actor_id`/`changed_by_user_id`) → my column-name heuristic tiered them **INFRA/global = cross-tenant leak**. Root cause systematic (same class as r5). **Fix: derivation is now FK-based** (`pg_constraint` FK→platform_users) **+ soft user-ref columns**; the 3 → SCOPED. New tally SCOPED 155 / INFRA 22 / TELEMETRY 2; **111 need org_id**. P0.10 invariant hardened (below).


v7 changelog (folds round-5 — 1 MEDIUM tier-misclassification): **per-USER analytics/error re-tiered TELEMETRY→SCOPED** (`product_analytics_events_recent`, `product_analytics_user_hourly`, `media_hls_proxy_error_events`, `operator_health_failure_archive` — all carry a user key → were a cross-tenant leak under "aggregate=global"). TELEMETRY now = **user-LESS rollups only** (`product_analytics_hourly`, `media_playback_stats_hourly`). New tally SCOPED 152 / INFRA 25 / TELEMETRY 2; **108 need org_id**.


v6 changelog (folds round-4 — 2 MEDIUM doc-accuracy, 0 critical/high): `system_settings` read-surface corrected — 6 external readers named + CI-grep guard + mirror rule named (M1); T0 audit counts replaced with measured figures + counting method, T0 re-sized ~5–8wk (M2).


v5 changelog (folds round-3 doc-nits F1–F5, 0 critical; reviewer confirmed heavy damage repaired): stale **109→104** in P0.4+sizing (F1); `integrator.mailings` org-orphan → **direct org_id add** (F2); 4 direct-add catalog roots named (F3); `reference_categories` stale `tenant_id`/`owner_id` reconciled (F4); `system_settings` 3rd read-site `getByScope` added (F5).


v4 changelog (folds round-2 review C-1/C-2 + H-1/H-2/H-3 + M-1): **artifacts unified** — `needs-orgid-FINAL.txt` is now generated FROM `tiers-218.tsv` (single source) = **104** SCOPED-non-be; outbox/queue pumps + mailing-topic taxonomy **re-tiered SCOPED→INFRA** (no org path); `system_settings` PK/conflict/mirror detail specified; per-integrator-table org-resolution paths enumerated; be_* count made precise.


**Live plan, hardened; pre-start decomposition applied** (`LOG.md`).
Supersedes `00/01/02_*` (history). Authoritative scope artifact: **`scope-derivation/tiers-218.tsv`**
(every base table → exactly one tier; reconciliation PERFORMED, not asserted). Other evidence:
VERIFIED_SCOPE.md, REVIEW_2026-06-17_FRESH.md, FOUNDATION_PLAN.md, spike/.

v3 changelog (folds round-1 review C-A/C-B/C-C + H-A/H-B/H-C + M-A/M-B):
- **C-A/H-C/M-A:** the 219-wide reconciliation is now actually run (`tiers-218.tsv`), spanning public+integrator+drizzle — every previously-missed table (comments, patient_merge_candidates, mailing_logs_webapp, user_subscriptions_webapp, reminder_delivery_events/occurrence_history, patient_home_blocks, all integrator per-patient) is tiered.
- **C-B/M-B:** tier model gives each table EXACTLY one tier; bootstrap tables that also hold per-tenant rows use a **row-level org predicate** (below) — no double-assignment.
- **C-C/H-A:** integrator org-bridge + **orphan/NULL handling** + explicit **bigint↔uuid** key types.
- **H-B:** telemetry-split applied uniformly (delivery logs/queues → SCOPED; aggregate analytics → TELEMETRY).

## Locked architecture (stable)
- Tenant = **Organization** (`be_organizations`). Person = `platform_users`. Enrollment = `(organization_id, platform_user_id)`.
- Isolation = **shared DB + Postgres RLS**; two row-level walls (org_id + patient ownership), one layer.
- Fail-safe = **default-DENY + FORCE RLS**, three tiers (see tiers-218.tsv).

## Reconciliation (PERFORMED over 219 = 218 base + drizzle ledger)
| Tier | Count | Meaning / RLS treatment |
|---|---|---|
| **SCOPED** | **155** | per-patient/per-tenant. **111 need `organization_id`** (44 are `be_*`: 41 direct org + `be_organizations` self-scoped + `be_package_items`/`be_patient_package_items` via FK-path). RLS by org (+ patient by actor). |
| **BOOTSTRAP-READABLE** | 24 | identity/auth/session/credential/channel + `system_settings` + `platform_users`. Readable pre-org-context (login resolves identity→org). |
| **INFRA** | 22 | migrations/ledgers/idempotency/webhook-status + **outbox/queue pumps** (projection_outbox, delivery_attempt_logs, integrator_push_outbox, outgoing_delivery_queue — no user/org path) + **mailing-topic taxonomy** (global). **No FK/soft-ref to platform_users** (enforced — see P0.10). |
| **LEGACY** | 16 | `rubitime_*` (8) + old `booking_*`/`branches`/`patient_bookings`/`appointment_records` (8) — frozen, dropped post-sunset. |
| **TELEMETRY** | 2 | **user-LESS** aggregate rollups only (`product_analytics_hourly`, `media_playback_stats_hourly`) — global. (Per-USER analytics/error are SCOPED, not here.) |

CI invariant (P0.10): every base table ∈ exactly one tier → else build fails. (This IS the completeness gate, now over 219.)

## Key design resolutions (round-1 fixes)
- **Bootstrap row-level hybrid (C-B/M-B):** tables that are bootstrap-readable yet hold per-tenant rows (`system_settings`, `platform_user_contacts`, `user_phone_history`) stay in **one** tier (BOOTSTRAP) with policy
  `USING (organization_id IS NULL OR organization_id = current_setting('app.org', true)::uuid)` — global/identity rows always readable pre-context; per-org rows scoped. `system_settings` gets a nullable `organization_id` (global rows NULL; per-org rows set) — one tier, one policy. **PK detail (H-1):** `(key,scope)` → `(key,scope,organization_id)`, with a **partial unique index** for the global row (`WHERE organization_id IS NULL`, since SQL NULLs don't dedupe); `ON CONFLICT` target + the port read predicates (`infra/repos/pgSystemSettings.ts:28-30,36-43,52-76` incl. `getByScope`) become org-aware with NULL-fallback. **External readers of `public.system_settings` (the read surface is NOT only the port)** — `media-worker/{watermarkEnabled,pipelineEnabled}`, `integrator/.../publicSystemSettings`, `infra/repos/pgBookingEngine`, `pgBookingRubitimeBridge`, `modules/system-settings/configAdapter` (all read global `admin` keys → NULL-fallback keeps them correct today) — P0.11 must org-qualify each OR document-global-only + add a **CI grep** asserting no `system_settings` SELECT outside the org-aware accessors. Integrator mirror (`integrator.system_settings`, same PK) changes identically; **both `000-critical-integration-config-in-db.mdc` AND `system-settings-integrator-mirror.mdc`** amended in lockstep.
- **Integrator org-bridge + orphans (C-C):** bridge = `public.platform_users.integrator_user_id (bigint) ↔ integrator.users.id`. Measured: 247 platform_users (108 linked / 139 NULL), 115 integrator.users (10 unlinked). P0.4 sub-step: enumerate integrator SCOPED rows whose bridge→org resolves NULL → **assign to the single existing org** at backfill (today 1 org; trivially correct) + **CI assert: no SCOPED row has NULL org_id** before any FORCE/enforce flip. Orphan integrator.users (no platform_user) → quarantine list for owner.
- **Denorm key types (H-A):** public SCOPED → `organization_id uuid` (+ patient ownership already `platform_users.id` uuid). Integrator SCOPED → add `organization_id uuid` resolved via bridge at backfill; patient predicate on integrator side uses the **bigint** integrator-user key (no uuid available) — documented per-schema, not a uniform uuid equality.
- **Per-integrator-table org-resolution paths (H-3):** direct `user_id` → `integrator.users.id → platform_users.integrator_user_id → org` (contacts, mailing_logs, user_subscriptions, user_reminder_rules, content_access_grants); via `identities` → `identities.user_id → users…` (conversations, user_questions, message_drafts); via **parent denorm** (conversation_messages, question_messages, user_reminder_occurrences, user_reminder_delivery_logs); **`mailings` has NO user path → direct `organization_id` add** (a broadcast belongs to the creating clinic). Each must terminate at non-NULL org before the CI gate (orphans → single-org assign / quarantine, C-C).
- **be_* precision (M-1):** of 44, 41 carry `organization_id` directly; `be_organizations` self-scopes on its `id`; `be_package_items`/`be_patient_package_items` scope via FK-path to package parents (P0.4 covers the 2).

## Phase 0 — aggregate stages (dormant; zero behavior change)
This line is a map, not an execution brief: P0.0 reconciliation = DONE (tiers-218.tsv) · P0.1 organization membership · P0.2 membership resolver · P0.3 enrollments + integrator bridge map · P0.4 scoped-table org columns/backfill · P0.5 DB roles · P0.6 dormant context mechanism · P0.7 writer census · P0.8 classified RLS policy generator · P0.9 three-tier default-deny descriptors · P0.10 CI invariants · P0.11 org-aware `system_settings` · P0.12 residual reference scans · P0.13 isolation fixtures.

### Pre-start sizing audit
Execution MUST use the micro-stage spine below. Do not hand an agent a brief for aggregate P0.4/P0.7/P0.8/P0.11/P0.13.

| Aggregate | Sizing risk found | Required split before implementation |
|---|---|---|
| P0.4 scoped columns/backfill | 111 tables + public/integrator + child denorm + orphan handling = too large for one PR | Split by table family and schema; each micro-stage has one migration/backfill/check pair. |
| P0.7 writer census | Crosses webapp, integrator, scheduler, worker, media-worker, webhooks, server actions | Split into inventory-only first, then runtime adapters by process family. |
| P0.8 RLS generator | Descriptor model + SQL generation + policy application + FORCE/GUC tests in one bucket | Split descriptor schema, SQL rendering tests, then per-tier/per-family policy migrations. |
| P0.11 `system_settings` | Public schema + integrator mirror + ports + admin API/UI + repo rules | Split storage/mirror, read path, write path, UI/rules/grep guard. |
| P0.13 isolation fixtures | Needs non-bypass role, synthetic org/person data, request context, RLS assertions | Split fixture factory, DB isolation assertions, then app-level smoke. |

### Phase 0 — executable micro-stage spine
Each row is intended to fit one small PR. Each stage updates `LOG.md`, runs only local checks for the touched area, and stops if its gate fails.

| Stage | Scope | Local gate |
|---|---|---|
| P0.1.1 | Drizzle DDL for `be_organization_members` only. | Migration generated; schema typecheck for webapp. |
| P0.1.2 | Seed existing staff membership: admins + doctor; specialist `518e…` only after existence/active/appt-count assertion. | Idempotent seed proof; inactive `c951…` cannot be selected. |
| P0.2.1 | `OrganizationMembershipPort` in module + pg implementation in infra. | No module imports from `infra/db` or `infra/repos`; targeted tests compile. |
| P0.2.2 | `resolveOrganizationForUser` service + unit tests for single org, none, multi-active. | Resolver tests green; solo behavior resolves the current org. |
| P0.2.3 | Wire resolver into the two existing doctor/admin gates through DI. | Gate tests/smoke show current single-clinic behavior unchanged. |
| P0.3.1 | Drizzle DDL for `org_enrollments`. | Migration generated; no runtime callers changed. |
| P0.3.2 | Backfill current clients into the single org; no notifications, no PII logging. | Count-only verification; no writes outside the new table. |
| P0.3.3 | Build integrator bridge map (`platform_users.integrator_user_id` ↔ `integrator.users.id`) + quarantine report for orphan users. | Count report only; no orphan silently dropped. |
| P0.4.0 | Generate the concrete table-family batches from `tiers-218.tsv` / `needs-orgid-FINAL.txt`. | Sum equals 111 need-org tables; every table assigned to exactly one batch. |
| P0.4.P1 | Public clinical EHR: visits, complaints, diagnoses, anamnesis, comorbidity, patient files/payment. | Migration + idempotent single-org backfill + no-NULL count for this family. |
| P0.4.P2 | Public treatment programs: instances, stages/groups/items/events, action log, discussion messages/reads. | Migration + idempotent single-org backfill + no-NULL count for this family. |
| P0.4.P3 | Public LFK/tests: complexes, sessions, assignments, attempts/results. | Migration + idempotent single-org backfill + no-NULL count for this family. |
| P0.4.P4 | Public diary/activity: day snapshots, practice completions, warmup presentations/views. | Migration + idempotent single-org backfill + no-NULL count for this family. |
| P0.4.P5 | Public intake: requests, answers, attachments, status history. | Migration + idempotent single-org backfill + no-NULL count for this family. |
| P0.4.P6 | Public support/comms: conversations/messages/questions, doctor-patient support, doctor notes, specialist tasks. | Migration + idempotent single-org backfill + no-NULL count for this family. |
| P0.4.P7 | Public reminders and messaging/media: rules, journal, occurrences, message log, media files/folders/uploads, ratings/feedback. | Migration + idempotent single-org backfill + no-NULL count for this family. |
| P0.4.P8 | Public tenant catalogs and audit roots: content, courses, tests, recommendations, quotes, diagnosis catalog, admin/broadcast/slug audit. | Migration + idempotent single-org backfill + no-NULL count for this family. |
| P0.4.I1 | Integrator direct-user path tables. | Bridge resolves to non-NULL org or explicit quarantine. |
| P0.4.I2 | Integrator identity-path tables. | Bridge resolves to non-NULL org or explicit quarantine. |
| P0.4.I3 | Integrator parent-denorm child tables. | Parent org copied deterministically; no orphan child remains. |
| P0.4.I4 | Integrator `mailings` direct-org root. | Single-org backfill now; later writes must carry creating org. |
| P0.4.D | Add declared denorm keys for child tables that cannot express the policy through direct `organization_id` alone. | Descriptor row explains the source FK/path; P0.10 can verify it. |
| P0.4.BE | Close the two `be_*` FK-path gaps (`be_package_items`, `be_patient_package_items`). | FK-path invariant proves both scope through package parents. |
| P0.4.RC | Make `reference_categories.organization_id` authoritative; document/retire stale `tenant_id`/`owner_id` usage. | `rg` proves RLS predicates and new writes use exactly `organization_id`. |
| P0.5.1 | DB role split: migrator/owner vs non-bypass app role; deploy docs only where confirmed. | Scratch/prod-parity proof before any runtime role flip. |
| P0.6.1 | Dormant context carrier: AsyncLocalStorage + pinned client design, resolving `buildAppDeps=cache()` interaction. | Unit tests show unset context preserves current behavior. |
| P0.7.1 | Writer census artifact only: webapp routes/actions, integrator API, worker, scheduler, media-worker, payment/webhooks, boot migrations. | Inventory reconciles against `rg` counts; no code behavior changes. |
| P0.7.2 | Wrap webapp route/action writers with tenant context where they touch SCOPED rows. | Family-specific tests; unset context still permits dormant behavior. |
| P0.7.3 | Wrap integrator API/bot writers with tenant context. | Family-specific tests; unset context still permits dormant behavior. |
| P0.7.4 | Wrap integrator worker/scheduler writers with tenant context. | Family-specific tests; unset context still permits dormant behavior. |
| P0.7.5 | Wrap media-worker writers with tenant context. | Family-specific tests; unset context still permits dormant behavior. |
| P0.7.6 | Wrap payment/webhook and boot-migration writer paths or document them as migrator-only. | Family-specific tests; unset context still permits dormant behavior. |
| P0.8.1 | RLS descriptor model: SCOPED/BOOTSTRAP/INFRA/LEGACY/TELEMETRY + predicate templates. | Descriptor covers all 219 artifacts exactly once. |
| P0.8.2 | SQL renderer tests for org predicate, patient predicate, bootstrap hybrid, unset-GUC permit, wrong-org deny, empty-GUC deny. | Pure unit tests green; no DB mutation. |
| P0.8.3 | Apply ENABLE+FORCE GUC-gated permissive policies to public direct-org SCOPED families. | Scratch DB policy smoke before merge. |
| P0.8.4 | Apply policies to public FK/denorm-path SCOPED families. | Scratch DB policy smoke before merge. |
| P0.8.5 | Apply policies to integrator bridge/denorm SCOPED families. | Scratch DB policy smoke before merge. |
| P0.8.6 | Apply BOOTSTRAP hybrid policies (`organization_id IS NULL OR = app.org`) where required. | Scratch DB policy smoke covers pre-context login reads. |
| P0.8.7 | Apply explicit INFRA/LEGACY/TELEMETRY treatment descriptors and deny unsupported user refs. | Scratch DB policy smoke plus P0.10 invariants. |
| P0.9.1 | Three-tier default-deny descriptors for enforce mode; still dormant in prod. | Enforce-mode tests run only on scratch/non-prod role. |
| P0.10.1 | CI invariant: every base table exactly one tier; `tiers-218.tsv` ↔ `needs-orgid-FINAL.txt` agree. | Fails on any missing/duplicate table. |
| P0.10.2 | CI invariant: every FK/soft-ref to `platform_users` is SCOPED/BOOTSTRAP/LEGACY, never INFRA/TELEMETRY. | Reproduces the r7 leak class. |
| P0.10.3 | CI invariant: SCOPED has direct org, declared FK path, or declared denorm path; no SCOPED row NULL org after backfill. | Batch-level null checks feed the invariant. |
| P0.11.1 | `system_settings` storage shape in public + integrator mirror: nullable org, PK/partial unique, migration/backfill. | Global rows remain NULL and unique. |
| P0.11.2 | Org-aware read path + NULL fallback across port and named external readers. | CI grep blocks raw `system_settings` SELECT outside accessors or documented global-only readers. |
| P0.11.3 | Org-aware write path through `updateSetting` + mirror sync; no second route-level sync. | Existing global admin settings still round-trip. |
| P0.11.4 | Admin UI/rules/docs update for org-aware settings. | `ALLOWED_KEYS` unchanged unless a real key is added; rules mention mirror lockstep. |
| P0.12.1 | Polymorphic refs scan (`comments.target_*`, `item_ref_id`) with explicit resolver/backfill decisions. | No unresolved scoped polymorphic reference before RLS family apply. |
| P0.12.2 | JSON-blob PII scan on payload queues/logs and payload retention decision. | Every user-bearing payload is SCOPED/BOOTSTRAP/LEGACY or documented as scrubbed/global. |
| P0.13.1 | Synthetic 2nd org + 2nd patient fixture factory for scratch/in-process tests. | Fixture never writes to prod/dev PII DB unless explicit opt-in guard passes. |
| P0.13.2 | DB-level isolation assertions under non-bypass role. | Org wall and patient wall both fail closed in scratch. |
| P0.13.3 | App-level smoke for current single-clinic behavior under dormant mode. | Doctor/patient smoke unchanged; no dev-server started by subagent. |

### Phase 0 Definition of Done
- All micro-stages above are completed or explicitly cancelled with a reason in `LOG.md`.
- P0.10 invariants are green over the full 219 artifact universe.
- No aggregate P0.4/P0.7/P0.8/P0.11/P0.13 brief remains as an executable agent task.
- Dormant mode preserves current single-clinic runtime behavior.
- Full `pnpm run ci` is reserved for pre-push / final integration, not for every micro-stage.

## T0 — enforcement cutover (NOT Phase 0)
Opt-in audit of the DB-access surface — **measured (non-test, excl `.next`/worktrees): ~198 files using `getPool`/`getDrizzle`/`runWebappPgText`, 54 dedicated `.connect()`, ~48 files with raw `.query()`, 28 server-action files** (counting method: ripgrep file-count) — plus the separate integrator/media-worker pools → route all through the chokepoint; flip GUC + non-bypass role; staging shadow-run. Gate: P0.10 green over 219 + prod-parity.

## Sizing (111 scoped incl integrator + child denorm + bridge)
Phase 0 (dormant) **~8–12 wk** after pre-start micro-stage split. The estimate increased because P0.4/P0.7/P0.8/P0.11/P0.13 were under-decomposed for safe execution. T0 cutover **~5–8 wk** (surface larger than the original fresh-review estimate — ~198 accessor files + 54 connects + 48 raw-query files + 28 server actions) · later (onboarding/store/EN/region) separate.

## Open owner-decisions (defaults applied)
1. Integrator per-patient = scoped via bridge (yes). 2. Store copy/ID-remap = later phase (defer). 3. `mailings`/`mailing_topics` = per-tenant SCOPED (default; flag). 4. Orphan integrator.users (10) → quarantine for review.
