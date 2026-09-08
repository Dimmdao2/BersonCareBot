# Worker brief — #1100 video meeting core, access and tariff

You are the product-code worker for one coherent backend stage. Work only in the supplied clean clone and branch.

## Authority and rules

Read `AGENTS.md` first: the universal rules, §1 migration/privilege rules (including the four-point rights review and
the absolute ban on grants in migrations), §§2–5 configuration and Clean Architecture, §§7/9/10, and §24. The owner
checklist is `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`; implement the Wave 1 stream A requirements and only the
backend portions of VM-07, ACC-01..04, ACC-06 and GATE-01..04.

Required owner contract, verbatim by ID:

- VM-07: provider-neutral contract; pages, access, invitations, tariffs and notes do not know Jitsi room/JWT API.
- ACC-01: only an authorized specialist in the active organization may create/resume a meeting for a client they can
  open in the current workspace; tenant and role checks are server-side.
- ACC-02/03: high-entropy guest secret, only its hash stored, expiry/revoke/rotate; fragment secret exchanges for a
  short-lived client-seat capability that grants no patient data.
- ACC-04/06: authenticated patient identity is checked independently; expired/revoked/cross-tenant/tampered access
  fails without disclosing client or room existence.
- GATE-01: active built-in Online branch AND tariff entitlement, with server-side denial on create/join. The tariff
  check must use existing `requireEntitlementForRead/Mutation`, never a private check in the meeting service.
- GATE-02: add `video_meetings` to `MECHANIC_REGISTRY` and every protected action to
  `app-layer/entitlements/protectedActionRegistry.ts`.
- GATE-03: capability remains configurable and is enabled for the owner's developer tariff through the existing
  seed/reconcile/admin write path; migrations never grant tariff rights.
- GATE-04: missing/unhealthy provider configuration fails closed, with safe public errors.

## Deliverable

Implement the complete provider-neutral backend foundation needed by the later UI and notification stages:

1. A `modules/video-meetings` application boundary with strict ports/types and one service-level path for lifecycle,
   authorization and sanitized join material. Jitsi-specific room/JWT details live only in an infra adapter.
2. Drizzle schema + timestamp-named forward migration for meeting/session and rotatable invite-hash lifecycle. Store
   minimum identifiers and timestamps only. Raw invite secrets, JWTs and TURN credentials must not be persisted or
   logged. Enforce idempotent create/resume and safe concurrency in the database/service contract.
3. Thin doctor, authenticated-patient and guest exchange routes using existing request context/auth relationships and
   `buildAppDeps()`. Guest capability can claim only the client seat in one meeting; it cannot read private data.
4. Reuse the existing Online built-in branch resolver. Reuse existing `requireEntitlementForRead/Mutation`; do not
   create another tariff resolver or inline mechanics map.
5. Add `video_meetings` as an ability mechanic in the canonical registry and protected-action registry. Ensure the
   existing tariff constructor/admin APIs can configure it. Identify the existing developer-tariff write/reconcile
   path and make any code/data-definition extension needed so the lead can enable it on named DEV/TEST after landing;
   do not mutate a live database and do not issue an entitlement from a migration.
6. Add Jitsi public/issuer/application-id settings and the JWT signing secret to the existing `system_settings`
   registry. The signing secret is `restricted`/`secret_envelope` and is changed only through
   `createSystemSettingsService().updateSetting`; no new integration secret env variable. Host-only Prosody/JVB/coturn
   secrets are outside this stream.
7. Declare every new DB relation/function/column access first in
   `deploy/postgres/privileges/declaration.ts`, regenerate canonical privilege artifacts, and keep migration SQL free
   of GRANT/REVOKE. Use the narrowest existing runtime role and RLS pattern.

Before creating any helper/gate, inspect whether the existing `requireEntitlementForRead/Mutation`, Online resolver,
patient/workspace relationship guard, system-settings service, invite capability pattern or notification-safe secret
utilities can be parameterized. The repo rule is one chokepoint; parallel wrappers are a defect.

## Excluded

No live pages or entry buttons, no notes, no notification delivery/event, no Jitsi Docker/Prosody/coturn deployment,
no recording/transcription, no TEST/PROD mutation. Do not change owner checkboxes; the lead owns evidence.

## Validation and handoff

Workers do not write, edit or delete tests. Run only useful static/step checks for the files you changed: generated
privilege parity, migration/order checks, webapp typecheck and scoped lint/format/diff checks. Do not run full CI and
do not start shared dev servers. Do not run the named-DEV migration preflight: an independent trusted auditor/lead
does that from the exact committed candidate.

Commit all task changes with explicit path staging (never `git add -A`), a message containing `#1100`, why, evidence,
the plan stage, and what remains. Do not push. End with the exact commit SHA, changed-file list, validation results,
and a concise four-point DB rights handoff. Do not end the turn waiting for any process.
