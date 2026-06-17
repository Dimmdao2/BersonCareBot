# SAAS Foundation — PLAN v3 (canonical, 2026-06-17)

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
| **SCOPED** | **153** | per-patient/per-tenant. **109 need `organization_id` added** (44 are `be_*`, already org-scoped). RLS by org (+ patient by actor). |
| **BOOTSTRAP-READABLE** | 24 | identity/auth/session/credential/channel + `system_settings` + `platform_users`. Readable pre-org-context (login resolves identity→org). |
| **INFRA** | 22 | migrations/ledgers/idempotency/operator-health/webhook-status — no person data; global. |
| **LEGACY** | 16 | `rubitime_*` (8) + old `booking_*`/`branches`/`patient_bookings`/`appointment_records` (8) — frozen, dropped post-sunset. |
| **TELEMETRY** | 4 | aggregate analytics (product_analytics_*) + infra error telemetry (media_hls_proxy, operator_health) — global. |

CI invariant (P0.10): every base table ∈ exactly one tier → else build fails. (This IS the completeness gate, now over 219.)

## Key design resolutions (round-1 fixes)
- **Bootstrap row-level hybrid (C-B/M-B):** tables that are bootstrap-readable yet hold per-tenant rows (`system_settings`, `platform_user_contacts`, `user_phone_history`) stay in **one** tier (BOOTSTRAP) with policy
  `USING (organization_id IS NULL OR organization_id = current_setting('app.org', true)::uuid)` — global/identity rows always readable pre-context; per-org rows scoped. `system_settings` gets a nullable `organization_id` (global rows NULL; per-org rows set) — reconciles P0.11 with H-4 (no contradiction; one tier, one policy).
- **Integrator org-bridge + orphans (C-C):** bridge = `public.platform_users.integrator_user_id (bigint) ↔ integrator.users.id`. Measured: 247 platform_users (108 linked / 139 NULL), 115 integrator.users (10 unlinked). P0.4 sub-step: enumerate integrator SCOPED rows whose bridge→org resolves NULL → **assign to the single existing org** at backfill (today 1 org; trivially correct) + **CI assert: no SCOPED row has NULL org_id** before any FORCE/enforce flip. Orphan integrator.users (no platform_user) → quarantine list for owner.
- **Denorm key types (H-A):** public SCOPED → `organization_id uuid` (+ patient ownership already `platform_users.id` uuid). Integrator SCOPED → add `organization_id uuid` resolved via bridge at backfill; patient predicate on integrator side uses the **bigint** integrator-user key (no uuid available) — documented per-schema, not a uniform uuid equality.

## Phase 0 — stages (dormant; zero behavior change)
P0.0 reconciliation = DONE (tiers-218.tsv) · P0.1 `be_organization_members`+seed · P0.2 membership resolver (port/DI) · P0.3 `org_enrollments`+backfill + **integrator bridge map** · P0.4 `organization_id` (+denorm `patient_user_id` on child tables; per-schema types) on the **109** + 2 be_ gaps, batched, backfill→single org, **+ orphan NULL sub-step + CI no-NULL assert** · P0.5 DB roles (migrator/owner vs non-bypass app; boot-migrations use migrator) · P0.6 context **mechanism** (AsyncLocalStorage + pinned client; resolve `buildAppDeps=cache()` clash) — dormant · P0.7 **full writer census** (bot/worker/scheduler/media-worker + payment webhook + 15 server actions + boot-migrations) · P0.8 **classified RLS policy generator** (per-table descriptor; bootstrap-hybrid predicate) ENABLE+FORCE GUC-gated permissive · P0.9 three-tier default-deny (SCOPED/PUBLIC/BOOTSTRAP) · P0.10 CI invariant over 219 (exactly-one-tier + no-NULL-org) · P0.11 `system_settings` org-aware (nullable org_id + mirror + rule-000 amend) · P0.12 residual: polymorphic refs (`comments.target_*`, `item_ref_id`) + JSON-blob-PII scan on payload queues · P0.13 isolation fixtures (synthetic 2nd org + 2nd patient) → assert both walls under non-bypass role.

## T0 — enforcement cutover (NOT Phase 0)
Opt-in audit of 340 `getPool/getDrizzle/runWebappPgText` + 40 dedicated `.connect()` + 29 raw `.query()` + integrator/media-worker pools → route through chokepoint; flip GUC + non-bypass role; staging shadow-run. Gate: P0.10 green over 219 + prod-parity.

## Sizing (v3 — up: 109 scoped incl integrator + child denorm + bridge)
Phase 0 (dormant) **~7–10 wk** · T0 cutover **~4–6 wk** · later (onboarding/store/EN/region) separate.

## Open owner-decisions (defaults applied)
1. Integrator per-patient = scoped via bridge (yes). 2. Store copy/ID-remap = later phase (defer). 3. `mailings`/`mailing_topics` = per-tenant SCOPED (default; flag). 4. Orphan integrator.users (10) → quarantine for review.
