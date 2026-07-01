# Decisions & target schema — SAAS_FOUNDATION

SKELETON (2026-06-17). Decisions are **settled** (concrete); schema is the **target sketch** to be
generated via Drizzle. Grounded against prod-mirror `bcb_webapp_dev` (read-only) — see FOUNDATION_PLAN §v3.

## Settled decisions
- **D1 — Tenant = Organization.** Cabinet ≡ Organization; reuse existing `be_organizations` (do NOT add a parallel `cabinet_id`). Solo specialist = org with 1 specialist; clinic = org with N specialists/branches (hierarchy already exists: `be_organizations → be_branches → be_rooms`, `be_specialists.organization_id`).
- **D2 — Identity.** Patient = `platform_users` (global enum role `client|doctor|admin`). **No `persons`/`directory` split in Phase 0** (region-phase work; would fight `be_appointments.platform_user_id`). Enrollment = explicit `(organization_id, platform_user_id)` table (NOT derived: `be_patient_timeline_events` has only 4 rows; 102/241 patients have no `be_*` footprint).
- **D3 — Membership is net-new.** No login-user↔specialist↔org link exists; `be_specialists` = name only. Build `be_organization_members`. Seed: 1 doctor + 5 admins → the single org; doctor → active specialist `518e…` (ignore inactive duplicate `c951…`).
- **D4 — Scoping = one chokepoint + RLS.** A context-aware **org resolver** (port+service) sets `organizationId` into request context; Postgres **RLS** (`ENABLE`+`FORCE`, GUC-gated permissive `current_setting('app.enforce_tenancy',true) IS DISTINCT FROM 'on' OR <predicate>`) enforces. Dormant: GUC unset → permit → zero behavior change. Single resolver, no per-endpoint duplicated checks ([[owner-prefers-single-chokepoint-no-dup]]).
- **D5 — DB roles.** Split **migration/owner role** vs **non-owner app role** (app role today is `rolsuper=f, rolbypassrls=f` and owns tables → owner is RLS-exempt unless FORCE). Required for RLS to actually apply.
- **D6 — Org resolution by channel** (web/PWA/browser-first; bot = delivery + phone-verify, not primary). Authenticated → org from session/membership (dominant). Anonymous public booking → custom domain (Host) / embeddable widget publishable-key / QR-short-link→token→cookie. Bot = shared + deep-link default, per-org bot = paid/tariff. Discovery marketplace later. **Channel-resolved org = scope hint, ZERO authority**; authz = RLS + membership/enrollment, independent of channel; public/no-session reaches only public data. Custom domains are a paid product capability, not a separate tenancy layer: require verified domain ownership, permanent redirect mapping to the org canonical surface, HTTPS/certificate lifecycle, and loop/fallback handling.
- **D7 — ⛔ BROKEN (fresh review C2, see REVIEW_2026-06-17_FRESH.md).** Intended: per-org integration config via `system_settings`. INFEASIBLE — `SystemSettingScope` is role-based (`global|doctor|admin`), no org dimension (`types.ts:174`); collides with rule 000. **Needs redesign:** nullable `organization_id` on `system_settings` OR a dedicated `be_organization_integrations` table + resolver port, with rule 000 amended. Do not start F0.15 until redesigned.
- **D8 — i18n** scaffold ru-only, locale via **proxy** (repo has no middleware), default ru.
- **D9 — Drizzle ORM for all new tables/columns** (`apps/webapp/db/schema/*.ts` + `drizzle-migrations`), types inferred, no raw `pool.query` for new features. RLS DDL (not expressible in Drizzle) → a raw-SQL **custom Drizzle migration**.
- **D10 — Rubitime/legacy frozen.** `patient_bookings`/`appointment_records` (branch-scoped, Rubitime-fed) excluded from scoping; dropped after the ~1-month sunset.

## Open product decisions (do NOT block Phase 0)
- Intra-clinic card visibility `card_visibility_policy` on `be_organizations`: default `all` (every org specialist sees every org patient) vs `assigned`. Deferred — a column + optional 2nd RLS predicate, switchable later. Default `all`.
- Cross-region enrollment policy (region phase).
- White-label scope and custom-domain packaging by tariff: exact fields, redirect semantics, certificate
  operations, and suspension behavior are R5 commercial SaaS work, not Phase 0.

## Target schema (sketch — to be generated via Drizzle)
```
be_organization_members
  id, organization_id FK be_organizations, platform_user_id FK platform_users,
  role text (owner|admin|doctor|assistant), specialist_id FK be_specialists NULL,
  status, created_at, updated_at, UNIQUE(organization_id, platform_user_id)

org_enrollments  (name TBD)
  id, organization_id FK, platform_user_id FK, status, created_at,
  UNIQUE(organization_id, platform_user_id)

be_organizations  (+ nullable, dormant)
  card_visibility_policy text DEFAULT 'all'   -- 'all' | 'assigned'

<~50 clinical tables>  (+ nullable, dormant)
  organization_id uuid NULL  + index

RLS (raw-SQL custom Drizzle migration, dormant via GUC):
  ALTER TABLE <t> ENABLE ROW LEVEL SECURITY; ALTER TABLE <t> FORCE ROW LEVEL SECURITY;
  POLICY using ( current_setting('app.enforce_tenancy',true) IS DISTINCT FROM 'on'
                 OR organization_id = current_setting('app.organization_id',true)::uuid )
```
Exact clinical-table list = stage F0.8 (generated from `information_schema`, not guessed here).
