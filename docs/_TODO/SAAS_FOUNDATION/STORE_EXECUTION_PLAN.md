# УСТАРЕЛ / SUPERSEDED — Store / Tariff / Entitlements execution plan

> **Не исполнять как текущий план.** P0 facts могут использоваться как historical implementation evidence.
> Актуальные требования: [`../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md`](../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md)
> §P4; актуальная декомпозиция: [`SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`](./SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md)
> и `IMPLEMENTATION_ROADMAP.md` stage C4/C5. Manual-tariff/no-billing first cut и конечный boolean mechanic list
> больше не являются product contract; store — future capability, own/base library должны работать независимо.

> **2026-07-27 checkbox pass (owner canon `BACKLOG_CONSOLIDATION_2026-07-26.md` §6.3).** Was: 19 open boxes
> counted as live backlog by raw grep, despite this file's own header declaring it superseded. Now: all 19
> marked `- [-]` — most (P1.b mechanic gating, P2 tariff CRUD) verified ✅ already shipped under `SAAS_S4`
> (`requireEntitlement*`/`protectedActionRegistry.ts`, `/api/admin/commercial`), the rest (P3 exercise-package
> store, P4 cross-tenant analytics, P5 billing/branding/domain) confirmed genuinely not built and marked ↪️
> superseded-and-tracked-in-S4. Why: dead/duplicate boxes were inflating the repo-wide open-checkbox count in
> both directions (looked like backlog, actually done or already tracked elsewhere).

Owner model (2026-07-13): **tariff → entitlements (per-mechanic toggles) → clinic**. Prices + inclusions are
ADMIN-CONFIGURED DATA (never hardcoded). Decisions: no real billing in the first cut (admin manually assigns a tariff);
tariff sets defaults + **per-clinic override**; **full per-mechanic constructor**; store packages **admin-curated only**
(clinics creating their own exercises is a separate existing feature, NOT the store).

**How to use this file:** each phase is a hard checklist — WHAT must exist, HOW it must work, WHAT to verify, and
what must NOT happen. Desktop Codex implements a phase; Sol adversarially audits the diff
(`node /home/dev/brain/tools/audit-agent.mjs --model gpt-5.6-sol --range <gitrange>`); a `🔴 OPUS CHECK` line marks
the milestones that additionally require an Opus final acceptance against reality before the phase is called done.
Branch: `auto/code-pg-delta`. Test DB `bersoncarebot_test` (enforced walls). Demo clinic_admin logins (email+password,
no OTP): `demo-clinic-a@bcbtest.local` / `Demo2026walls!` (org `e34c9155-9aa5-460e-9137-386cd42f23aa`),
`demo-clinic-b@bcbtest.local` (org `48bd676a-a8a7-4e15-a496-00cad9ea4c8c`). Global-admin = role=admin + adminMode.
Never touch prod / bcb_webapp_prod; never wipe test DB; never BYPASSRLS; deploy webapp DB-preserving; small scoped
commits (never `git add -A`).

## Canonical mechanic list (single source of truth — apps/webapp/src/modules/org-entitlements/types.ts, MECHANICS)

`booking, exercise_catalog, exercise_packages, courses, cms_pages, files, patient_card, subscriptions, payments,
mailings, patient_app, patient_app_paid_subscription, branding, custom_domain`. A new mechanic defaults to enabled
until a tariff excludes it.

---

## P0 — entitlement foundation — ✅ DONE (commits c1f07c130, 52d99299b)

- [x] `saas_tariffs` (global catalog, `mechanics` jsonb), `be_organizations.tariff_id`, `saas_org_entitlement_overrides`
      (org-scoped FORCE RLS). deploy/postgres/store-p0-entitlements-rls.sql (applied to test) + drizzle schema + migration 0180.
- [x] `modules/org-entitlements`: `resolveOrgEntitlements` = override ?? tariff ?? true; `isMechanicEnabled`. `pgOrgEntitlements` port.
- [x] Verified live: org-A staff sees own override, org-B sees 0 (isolation); precedence proven. Dormant.

## P1 — enforcement chokepoint

### P1.a — slice — ✅ DONE (commit 530cb2bbd)

- [x] DI-wired `orgEntitlements` (pg + in-memory fake, default-on). `requireEntitlement(mechanic)` guard: auth FIRST
      (requireDoctorWorkspaceApiContext), then `isMechanicEnabled(org from ctx)`, disabled → 403 `entitlement_required`.
- [x] Gated `courses` create (`POST /api/doctor/courses`). Verified live: default 200 → override off 403 (A) → B 200 → restore 200.

### P1.b — gate the remaining mechanics (default-on; auth ALWAYS before the entitlement check)

For EACH mechanic below, add `requireEntitlement("<mechanic>")` AFTER the existing auth guard on the mechanic's
WRITE/primary routes ONLY (do not gate pure reads unless noted). Ground the exact route file before editing.

- [-] ~~`mailings` → `apps/webapp/src/app/api/doctor/broadcasts/*` (create/send route).~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ, зафиксировано в `apps/webapp/src/app-layer/entitlements/protectedActionRegistry.ts:45-46` (`mailings.execute`, `mailings.draft.save` gated via `requireEntitlementForMutationAction`; guard in `apps/webapp/src/app-layer/guards/requireEntitlement.ts`).
- [-] ~~`booking` → the clinic booking-engine write routes `apps/webapp/src/app/api/admin/booking-engine/*` (branch/service/slot create) — NOT patient booking reads.~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ: `protectedActionRegistry.ts:83-86` (branch/service/schedule-block create+delete gated via `requireEntitlementForMutation`); GET routes explicitly exempted as reads at lines 124-126 — reads were never double-gated, per the box's own instruction.
- [-] ~~`cms_pages` → `apps/webapp/src/app/api/doctor/content/*` (page/section create).~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ: `protectedActionRegistry.ts:47-69` (content pages/sections + patient-home block actions, 20 mapped entries under the `cms_pages` mechanic).
- [-] ~~`files` → `apps/webapp/src/modules/media` upload entry route(s) under doctor.~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ: `protectedActionRegistry.ts:81-82` (`files.patient-file.create`/`update` gated via `requireEntitlementForMutation`; GET/download exempted as reads at lines 119, 123).
- [-] ~~`patient_card` → gate the doctor patient-card WRITE route(s) (notes/edits), not the list.~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ: `protectedActionRegistry.ts:71-80` (visits/anamnesis/complaints/diagnoses/physical/comorbidities write routes gated; list/GET routes exempted).
- [-] ~~`subscriptions` (абонементы) → `modules/memberships` doctor-facing package assign/create routes.~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ: `protectedActionRegistry.ts:70` (`subscriptions.patient-package.create` gated via `requireEntitlementForMutation`).
- [-] ~~`payments` → the booking payment enable/config write path (coordinate with the existing `booking_payment_enabled` per-org flag — do NOT double-gate reads).~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ: `protectedActionRegistry.ts:87` (`payments.booking-settings.patch` gated; GET exempted as read at line 127 — not double-gated).
- [-] ~~`patient_app` → the toggle/entry that turns the patient app on for a clinic (identify; if none, note deferred).~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ: the box's own fallback ("if none, note deferred") is exactly what's recorded — `protectedActionRegistry.ts:133` (`DECLARED_NO_SURFACE.patient_app`: "code-search: no patient_app_enabled/toggle action").
- [-] ~~`exercise_catalog`, `exercise_packages`, `patient_app_paid_subscription`, `branding`, `custom_domain` → these
  mechanics have NO clinic-writable surface yet (exercises are global/admin; branding/domain don't exist). Do NOT
  invent routes — leave them resolver-only (they gate future P3/P5 surfaces). Note each as "no surface yet".~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ: exactly this determination is recorded per-mechanic in `protectedActionRegistry.ts:130-137` (`DECLARED_NO_SURFACE`), confirmed still true by direct grep (no `saas_exercise_packages`/branding/custom_domain schema or routes) as of 2026-07-27.
- Each gating = 1 small commit. Default-on: no tariff/override ⇒ enabled ⇒ zero behavior change.
- Verify per mechanic (curl): default create works; with an override `enabled=false` for org A that mechanic's route
  → 403; org B unaffected; remove override → works. Reuse the P1.a smoke shape.
- 🔴 OPUS CHECK (end of P1.b): full regression sweep on demo-clinic-a — every gated route still 200 by default (no
  accidental block), a spot cross-tenant check (A override never affects B), and no auth-bypass (entitlement never
  runs before auth). Confirm the app is not broken for the existing single tenant.

## P2 — global-admin tariff constructor + assign-to-clinic (the "prices are configured here")

- [-] ~~`GET/POST/PATCH /api/admin/tariffs` (+ delete/deactivate), guarded by `requireAdminWorkspaceApiContext` (global
  admin ONLY — NOT clinic_admin). CRUD on `saas_tariffs`: name, description, price_minor, currency, and the full
  per-mechanic toggle map (`mechanics` jsonb keyed by the MECHANICS list). Validate mechanic keys against MECHANICS.~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ, evolved shape: unified `apps/webapp/src/app/api/admin/commercial/route.ts` (`GET` + `POST` discriminated-union `create_tariff`/`update_tariff`/`archive_tariff`, zod-validated), guarded by `requirePlatformOperationsApiContext` (`apps/webapp/src/app-layer/guards/requireRole.ts:231`, doc comment: "Platform-only API boundary. It intentionally has no organization resolution path." — stricter than the plan's named guard, same effect: clinic_admin gets 403).
- [-] ~~`POST /api/admin/organizations/:id/tariff` — assign/unassign a tariff to a clinic (writes `be_organizations.tariff_id`);
  global-admin only. (Optional: per-clinic override editor writing `saas_org_entitlement_overrides` — global-admin only.)~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ: `assign_tariff`/`upsert_override`/`delete_override` actions in the same `commercial/route.ts` (lines 135-156), implemented in `apps/webapp/src/infra/repos/pgPlatformEntitlements.ts` (`assignTariff`, `upsertOverride`, `deleteOverride`, line ~317+).
- [-] ~~UI: a global_admin-tier page (accessTier "global_admin") "Тарифы" — list tariffs, a constructor form
  (name/price + a checkbox grid of ALL mechanics), and a clinic→tariff assignment control. Reuse shared+shadcn only.~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ: `apps/webapp/src/app/app/admin/commercial/page.tsx` + `CommercialConstructorClient.tsx`, gated behind `requirePlatformOperationsPage` (global-admin tier).
- [-] ~~RLS/grants: `saas_tariffs` writes run under app_staff (already granted); the app-layer global-admin gate is the
  real restriction. If a pre-session/definer read is ever needed, follow the house SECURITY DEFINER pattern; likely none.~~ — ✅ СДЕЛАНО ДО ВЫТЕСНЕНИЯ, evolved stronger than planned: a dedicated `app_platform_settings` principal (not plain app_staff) owns commercial writes — `deploy/postgres/c5a-platform-operations-runtime.sql`, `deploy/postgres/store-p0-entitlements-rls.sql`.
- Verify (curl): global admin creates a tariff with `payments=false`, assigns it to org A → org A `payments` route 403,
  org B (no tariff) 200. A clinic_admin (demo-clinic-a) CANNOT reach `/api/admin/tariffs` (403) nor the Тарифы page.
- 🔴 OPUS CHECK: the tariff/assign endpoints are global-admin-only (a clinic_admin gets 403), writes land correctly,
  and assigning a tariff actually flips enforcement end-to-end (tariff, not just override, drives the gate).

## P3 — admin-curated exercise store (packages)

- [-] ~~Global admin assembles platform exercises (currently GLOBAL, `modules/lfk-exercises`) into sellable PACKAGES
  (extend `modules/lfk-templates` ordered-set primitive; or a new `saas_exercise_packages`). Admin-curated ONLY.~~ — ↪️ ВЫТЕСНЕНО 2026-07-27: не построено — проверено `grep -rn "saas_exercise_packages"` (0 совпадений); текущий статус зафиксирован как "S4-3/C5D deferred" в `apps/webapp/src/app-layer/entitlements/protectedActionRegistry.ts:132` (`DECLARED_NO_SURFACE.exercise_packages`). Работа живёт в `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`.
- [-] ~~Grant-based access: a clinic whose tariff includes `exercise_packages` (+ specific packages) gets READ access to
  those packages/exercises via grants — **files are NEVER copied** (reference/grant, per owner). Reuse the content
  `entitlements`/grant pattern.~~ — ↪️ ВЫТЕСНЕНО 2026-07-27: та же зависимость на deferred S4-3/C5D (см. выше); работа живёт в `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`.
- [-] ~~Media pipeline unchanged (global). Gate the clinic-facing package browse behind `exercise_packages` entitlement.~~ — ↪️ ВЫТЕСНЕНО 2026-07-27: package browse не существует (не проверено глубже факта отсутствия package-роутов); работа живёт в `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`.
- Verify: admin creates a package; a clinic with the entitlement sees it (read), a clinic without does not; no file copy.
- 🔴 OPUS CHECK: cross-tenant — a clinic without the grant cannot read package/exercise media (no leak); grant is read-only.

## P4 — per-clinic analytics for the global admin

- [-] ~~Cross-tenant aggregate dashboard for global admin built on the org-tagged `modules/product-analytics` base
  (per-clinic metrics: registrations, activity, retention). Global-admin-only page + API. NOT per-user only.~~ — ↪️ ВЫТЕСНЕНО 2026-07-27: не построено — проверено, `apps/webapp/src/modules/product-analytics/` содержит только per-page/topic aggregation (`buildAdminDashboard.ts`, `service.ts` etc.), нет per-clinic/cross-tenant файла или route. Если решится делаться — трекать в `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`, не здесь.
- Verify: global admin sees per-clinic breakdown; a clinic_admin cannot access the cross-tenant view.
- 🔴 OPUS CHECK: cross-tenant read is global-admin-only; no clinic can see another clinic's aggregates.

## P5 — tenant billing + branding/custom-domain (LATER — biggest, real money)

- [-] ~~Tenant billing domain, SEPARATE from patient `payments`/`memberships` (per FOUNDATION_PLAN.md:458): org billing
  account, invoices, subscription lifecycle (trial/active/past_due/suspended/cancelled), a REAL PSP (today only mock).~~ — ↪️ ВЫТЕСНЕНО 2026-07-27: не построено — крупная денежная фаза, объём не проверялся дальше факта отсутствия billing-схемы; если делается, живёт в `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`, не здесь.
- [-] ~~`branding` + `custom_domain` as paid capabilities (greenfield: add columns/side-tables to be_organizations;
  domain routing in proxy.ts per [[no-middleware-use-proxy]]).~~ — ↪️ ВЫТЕСНЕНО 2026-07-27: не построено — проверено `grep -n "custom_domain\|branding" apps/webapp/db/schema/schema.ts` (0 совпадений) и подтверждено `DECLARED_NO_SURFACE` в `protectedActionRegistry.ts:135-136`. Живёт в `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`.
- 🔴 OPUS CHECK (mandatory, money + prod-facing): real-PSP integration, charge/refund correctness, subscription
  state machine, and that a suspended clinic is correctly gated. Do NOT ship without Opus acceptance + owner sign-off.

---

### Global invariants (verify every phase)

- Default-on: any org without a tariff/override keeps ALL mechanics — the existing single tenant must never break.
- `requireEntitlement` ALWAYS after auth; org comes from the authenticated context, never client input.
- Org isolation: an override/tariff for org A must never affect org B (RLS + org-from-ctx).
- Full CI once at the END of the store initiative, not per step. Never leave test broken (rollback if broken).
