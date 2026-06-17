# SAAS Foundation — PLAN v7 (canonical, 2026-06-17)

v7 changelog (folds round-5 — 1 MEDIUM tier-misclassification): **per-USER analytics/error re-tiered TELEMETRY→SCOPED** (`product_analytics_events_recent`, `product_analytics_user_hourly`, `media_hls_proxy_error_events`, `operator_health_failure_archive` — all carry a user key → were a cross-tenant leak under "aggregate=global"). TELEMETRY now = **user-LESS rollups only** (`product_analytics_hourly`, `media_playback_stats_hourly`). New tally SCOPED 152 / INFRA 25 / TELEMETRY 2; **108 need org_id**.


v6 changelog (folds round-4 — 2 MEDIUM doc-accuracy, 0 critical/high): `system_settings` read-surface corrected — 6 external readers named + CI-grep guard + mirror rule named (M1); T0 audit counts replaced with measured figures + counting method, T0 re-sized ~5–8wk (M2).


v5 changelog (folds round-3 doc-nits F1–F5, 0 critical; reviewer confirmed heavy damage repaired): stale **109→104** in P0.4+sizing (F1); `integrator.mailings` org-orphan → **direct org_id add** (F2); 4 direct-add catalog roots named (F3); `reference_categories` stale `tenant_id`/`owner_id` reconciled (F4); `system_settings` 3rd read-site `getByScope` added (F5).


v4 changelog (folds round-2 review C-1/C-2 + H-1/H-2/H-3 + M-1): **artifacts unified** — `needs-orgid-FINAL.txt` is now generated FROM `tiers-218.tsv` (single source) = **104** SCOPED-non-be; outbox/queue pumps + mailing-topic taxonomy **re-tiered SCOPED→INFRA** (no org path); `system_settings` PK/conflict/mirror detail specified; per-integrator-table org-resolution paths enumerated; be_* count made precise.


**Live plan, in the hardening loop** (revise → fresh cold agent → repeat until 2 consecutive clean; `LOG.md`).
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
| **SCOPED** | **152** | per-patient/per-tenant. **108 need `organization_id`** (44 are `be_*`: 41 direct org + `be_organizations` self-scoped + `be_package_items`/`be_patient_package_items` via FK-path). RLS by org (+ patient by actor). |
| **BOOTSTRAP-READABLE** | 24 | identity/auth/session/credential/channel + `system_settings` + `platform_users`. Readable pre-org-context (login resolves identity→org). |
| **INFRA** | 25 | migrations/ledgers/idempotency/webhook-status + **outbox/queue pumps** (projection_outbox, delivery_attempt_logs, integrator_push_outbox, outgoing_delivery_queue — no user/org path) + **mailing-topic taxonomy** (global). No person data. |
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

## Phase 0 — stages (dormant; zero behavior change)
P0.0 reconciliation = DONE (tiers-218.tsv) · P0.1 `be_organization_members`+seed · P0.2 membership resolver (port/DI) · P0.3 `org_enrollments`+backfill + **integrator bridge map** · P0.4 `organization_id` on the **108** SCOPED-non-be (= 94 public ADD [incl. the 4 per-user analytics/error, org via patient `user_id` path] + 13 integrator via bridge-denorm + 1 already-has `patient_merge_candidates`) + 2 be_ FK-path gaps. **Direct-org-add roots (no FK, no patient): content_sections, motivational_quotes, patient_home_blocks, reference_categories, integrator.mailings** → bare `organization_id` ADD (qualify P0.10 via the org_id branch). (+denorm `patient_user_id` on child tables; per-schema types); batched; backfill→single org; **+ orphan NULL sub-step + CI no-NULL assert**. *Note (F4):* `reference_categories` already has stale `tenant_id`/`owner_id` uuid → make `organization_id` authoritative, document/retire the others; RLS predicate keys off exactly one · P0.5 DB roles (migrator/owner vs non-bypass app; boot-migrations use migrator) · P0.6 context **mechanism** (AsyncLocalStorage + pinned client; resolve `buildAppDeps=cache()` clash) — dormant · P0.7 **full writer census** (bot/worker/scheduler/media-worker + payment webhook + 15 server actions + boot-migrations) · P0.8 **classified RLS policy generator** (per-table descriptor; bootstrap-hybrid predicate) ENABLE+FORCE GUC-gated permissive · P0.9 three-tier default-deny (SCOPED/PUBLIC/BOOTSTRAP) · P0.10 CI invariant over 219: exactly-one-tier; **SCOPED ⟺ (org_id OR declared FK/denorm path)**; no SCOPED row NULL org_id post-backfill; `tiers-218.tsv` ↔ `needs-orgid-FINAL.txt` must agree (single source) · P0.11 `system_settings` org-aware (nullable org_id + mirror + rule-000 amend) · P0.12 residual: polymorphic refs (`comments.target_*`, `item_ref_id`) + JSON-blob-PII scan on payload queues · P0.13 isolation fixtures (synthetic 2nd org + 2nd patient) → assert both walls under non-bypass role.

## T0 — enforcement cutover (NOT Phase 0)
Opt-in audit of the DB-access surface — **measured (non-test, excl `.next`/worktrees): ~198 files using `getPool`/`getDrizzle`/`runWebappPgText`, 54 dedicated `.connect()`, ~48 files with raw `.query()`, 28 server-action files** (counting method: ripgrep file-count) — plus the separate integrator/media-worker pools → route all through the chokepoint; flip GUC + non-bypass role; staging shadow-run. Gate: P0.10 green over 219 + prod-parity.

## Sizing (108 scoped incl integrator + child denorm + bridge)
Phase 0 (dormant) **~7–10 wk** · T0 cutover **~5–8 wk** (surface larger than the original fresh-review estimate — ~198 accessor files + 54 connects + 48 raw-query files + 28 server actions) · later (onboarding/store/EN/region) separate.

## Open owner-decisions (defaults applied)
1. Integrator per-patient = scoped via bridge (yes). 2. Store copy/ID-remap = later phase (defer). 3. `mailings`/`mailing_topics` = per-tenant SCOPED (default; flag). 4. Orphan integrator.users (10) → quarantine for review.
