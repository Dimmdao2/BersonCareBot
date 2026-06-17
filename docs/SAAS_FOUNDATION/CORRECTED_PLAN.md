# SAAS Foundation — PLAN v2 (canonical, 2026-06-17)

**Live plan, in the hardening loop** (revise → fresh adversarial agent → repeat until 2 consecutive
clean — see `LOG.md`). Supersedes `00/01/02_*` framing (history). Evidence: `scope-derivation/`
(VERIFIED_SCOPE + needs-orgid-FINAL + integrator-tables.tsv), `REVIEW_2026-06-17_FRESH.md`,
`FOUNDATION_PLAN.md` (rationale), `spike/` (silo PoC that drove the pivot to RLS).

v2 changelog (incorporates plan-review C-1/C-2/C-3/H-1..H-5):
- **C-1:** scope now spans **`public` + `integrator`** (218 base tables), not public-only. Integrator per-patient tables added via an identity org-bridge.
- **C-3:** RLS = **classified policy generator** (per-table descriptor), not one loop-template; 41 child/junction tables get denormalized `organization_id`+`patient_user_id`.
- **C-2:** context chokepoint is **T0-weight** — Phase 0 builds only the dormant mechanism; the path-audit cutover is T0.
- **H-4:** **three access tiers** (SCOPED / PUBLIC / BOOTSTRAP-READABLE) so default-deny doesn't brick login.
- **H-1/H-2/H-3/H-5** folded into stages below.

## Locked architecture (stable across rounds)
- Tenant = **Organization** (reuse `be_organizations`). Person = `platform_users` (global). Enrollment = `(organization_id, platform_user_id)`.
- Isolation = **shared DB + Postgres RLS**, two row-level walls (practice↔practice via `organization_id`; patient↔patient via patient ownership) — one enforcement layer.
- Fail-safe = **default-DENY + FORCE RLS**, with **three explicit tiers**:
  1. **SCOPED** — RLS by org (+patient by actor). The ~100 tables.
  2. **PUBLIC** — key-free allowlist (store inventory, public-booking catalog, marketing).
  3. **BOOTSTRAP-READABLE** — readable pre-org-context: auth/session/OTP/credential/channel tables + `system_settings` login reads (login resolves identity→org, so these MUST be reachable before context exists). Explicit allowlist.
  A table not in exactly one tier → CI fails (P0.10).

## Scope (re-derived over public + integrator = 218)
- **public:** 84 (incl. catalogs per-tenant) **+ 2** `be_*` gaps (`be_package_items`, `be_patient_package_items`) = **86**.
- **integrator (~15 per-patient):** contacts, content_access_grants, conversations, conversation_messages, message_drafts, question_messages, user_questions, user_reminder_rules, user_reminder_occurrences, user_reminder_delivery_logs, user_subscriptions, mailing_logs, telegram_state (+ `identities`/`users` = the **org-bridge** mapping). `rubitime_*` (8) = LEGACY/frozen; rest = infra/global.
- **org-bridge (C-1):** integrator rows key by `user_id`/`user_identity_id`/`external_chat_id` → resolve via `integrator.identities`/`users` → `platform_users` → enrollment → `organization_id`; backfill org_id on integrator scope tables through this chain.
- **child/junction denorm (C-3):** 41 public (clinical_*_update/_status_history, online_intake_*, support_*_messages, treatment_program_*_stage*, test_results, lfk_complex_exercises…) + integrator children get denormalized `organization_id`+`patient_user_id` so the policy is a cheap indexed equality.
- **Total scope ≈ ~100 tables.** Completeness gate now over **218** (the C-1 fix).

## Phase 0 — stages (dormant; zero behavior change)
| # | Stage | Addresses |
|---|---|---|
| P0.0 | **Inventory over public+integrator (218)** — 3-method + arbiter + completeness gate across ALL non-system schemas → the authoritative scoped/public/bootstrap/legacy classification | C-1 |
| P0.1 | `be_organization_members` (Drizzle) + seed staff→org (doctor→active specialist `518e…`, assertions) | H-5seed |
| P0.2 | `OrganizationMembershipPort` + `resolveOrgForUser` (port/DI) | — |
| P0.3 | `org_enrollments` + backfill all patients→org; **integrator identity↔platform_user bridge map** | C-1 |
| P0.4 | Scope columns: `organization_id` (+ denorm `patient_user_id` on 41 children) on ~100 tables incl integrator + the 2 be_*; batched; backfill→single org | C-1,C-3,H-5 |
| P0.5 | DB roles: migrator/owner vs **non-bypass app role**; **boot-migrations run under migrator** | H-2 |
| P0.6 | Context **MECHANISM** (AsyncLocalStorage + per-request pinned client; resolve `buildAppDeps=cache()` singleton clash) — dormant capability only | C-2 |
| P0.7 | **Full non-request writer census + context**: bot(per-update)/worker(per-job)/scheduler(per-tick)/media-worker + **payment webhook** + **15 server actions** + boot-migrations | H-2 |
| P0.8 | **Classified RLS policy generator** (per-table descriptor: org col, patient col OR parent-join, actor rule) over all scoped; `ENABLE`+`FORCE`; GUC-gated permissive (dormant) | C-3 |
| P0.9 | **Three-tier default-deny**: SCOPED / PUBLIC allowlist / **BOOTSTRAP-READABLE allowlist** | H-4 |
| P0.10 | **CI fail-safe invariant over 218**: every table ∈ exactly one tier (scoped+policy / public / bootstrap) else build fails | C-1,H-4 |
| P0.11 | `system_settings` **org-aware** (org_id on table + integrator mirror + `updateSetting` + admin API + **rule 000 amendment**) | H-3,C2 |
| P0.12 | Residual-risk: polymorphic refs (`item_ref_id`/`linked_object_*`) + JSON-blob-PII scan → each scoped/justified; tie to catalog decision | — |
| P0.13 | Isolation fixtures: **provision synthetic 2nd org + 2nd patient**, then assert practice↔practice AND patient↔patient blocked under non-bypass role | M-1 |

## T0 — enforcement cutover (NOT Phase 0; honest weight)
Opt-in audit of **340 `getPool/getDrizzle/runWebappPgText` + 40 dedicated `.connect()` + 29 raw `.query()` sites** + integrator/media-worker separate pools → route through the chokepoint; flip GUC `enforce_tenancy=on`; switch app to non-bypass role; staging **shadow-run** (log would-be denials) before the real flip. **Gate:** P0.10 invariant green over 218 AND prod-parity confirmed.

## Later phases
Onboarding/provisioning · **marketplace/store** (per-tenant catalogs + buy = **copy-with-ID-remap** into tenant; patient FKs reference tenant-local copies; design before store ships — H-1) · EN locale · multi-region.

## C-findings status (v2)
C-1 ✅ scope over 218 + integrator bridge (P0.0/P0.3/P0.4) · C-2 ✅ chokepoint = mechanism(P0.6)+T0-cutover, re-sized · C-3 ✅ classified generator + child denorm (P0.4/P0.8) · H-1 ✅ store copy = later-phase design (deferred) · H-2 ✅ full writer census (P0.7) · H-3 ✅ real system_settings change (P0.11) · H-4 ✅ 3 tiers (P0.9/P0.10) · H-5 ✅ +2 be_* (P0.4).

## Sizing (v2, honest — up from v1 due to integrator + child denorm + tiers)
- **Phase 0 (dormant): ~6–9 wk** (~100 tables incl integrator + 41-child denorm + classified generator + 3 tiers + chokepoint mechanism + writer census).
- **T0 cutover: ~4–6 wk** (340/40/29 path audit + pool routing + shadow-run).
- Later (onboarding/store/EN/region): separate.

## Open owner-decisions (defaults applied unless overridden)
1. Integrator per-patient data org-owned, scoped via identity-bridge — **default: yes** (applied).
2. Store copy/ID-remap = later-phase design; catalogs get org_id now — **default: defer** (applied).
