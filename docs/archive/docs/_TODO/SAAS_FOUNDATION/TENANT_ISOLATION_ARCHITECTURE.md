# Tenant isolation — the complete model (grounded, for owner sign-off)

> **ОБНОВЛЕНО 12.08.2026:** полный target дополнительно содержит `app_platform_settings` и
> `app_platform_admin` как две узкие объявленные platform-global
> роли и отдельный webapp-owned global-admin DB-login/mTLS certificate/pool. Ни global-admin через staff pool,
> ни staff→platform `SET ROLE` больше не допускаются. Старые `app_owner`/bootstrap/pool формулировки ниже описывают
> исходную реализацию и заменяются DB-layer contract в `DB_PRIVILEGE_LAYER_REBUILD/SCHEME.md` revision 11.

One page, the whole picture, so we stop discovering roles one at a time. Grounded in the current code; items
marked (verify) are to be confirmed during the build, not assumed.

## Principle (decided)

ONE DB chokepoint sets "who is this" from the request; **Postgres RLS filters every query**; the app connects
as a **non-owner** role. NO per-route / per-query org filtering. (The stamp hook already exists:
`modules/auth/service.ts` → `app-layer/principal/sessionPrincipal.ts`; every query funnels through
`infra/db/webappPoolProvider.ts` which applies the principal.)

## The DB roles (few, fixed — NOT one per user)

- `app_owner` — owns tables/policies; **migrations/setup only**; never an app connection.
- `app_staff` — all staff (doctor/admin) connections. Sees its **own clinic** (org-scoped).
- `app_patient` — all patient connections. Sees **only own** data.
- `app_platform_settings` — platform settings/system-health surface only.
- `app_platform_admin` — cross-organization directory/admin surface only. Обе platform-роли без
  clinic/patient/medical membership и `BYPASSRLS`, доступны только dedicated global-admin login после human admin
  context + 2FA.
- `app_worker` — **infra role for background dispatch** (NEW to create). Tied to NO tenant. **NARROW grants
  only** (queue/delivery/media tables it touches) + call-site allowlist + audit. **Never owner/BYPASSRLS,
  never "read all"** — a broad worker role re-opens the leak.

## The principal kinds (ALL already coded in `packages/db-principal`)

`organization · staff · patient · platform_admin · integrator · pre_session · infra` — each maps to a role + a source of "who":

| Entrypoint                                                     | Principal                 | Source of "who"                                                                                   | Role                     |
| -------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------ |
| Authenticated webapp request                                   | staff / patient           | **session membership** (already: sessionPrincipal.ts resolves org from `be_organization_members`) | app_staff / app_patient  |
| Authenticated global-admin webapp request                      | platform_admin            | dedicated global-admin session + mandatory 2FA                                                    | exact app_platform_settings or app_platform_admin surface |
| Pre-auth: login, OTP, public booking, **registration**         | bootstrap                 | **entry type** (split registration: staff-signup vs patient-signup declares which)                | nonstaff pool base       |
| Integrator inbound (Telegram/MAX/webhook)                      | integrator / organization | the message→user/org mapping (verify in `apps/integrator`)                                        | app_patient / org-scoped |
| **Dispatch worker** (send a queued broadcast/message/reminder) | **infra**                 | nothing — the task was already filtered at enqueue                                                | app_worker               |
| media-worker (transcode)                                       | infra                     | nothing — media already scoped at upload                                                          | app_worker               |

**No cross-tenant "generator" job exists in this app (verified).** The scheduler
(`apps/integrator/src/infra/runtime/scheduler/scheduler.ts`) only `claimDueScheduledJobs()` — it moves
**already-created, now-due** jobs into the runtime queue; it does NOT scan other clinics' data to generate
work. Reminders are pre-materialized in-session at booking/config time under filters (`reminder_rules`,
`webapp_reminder_occurrences`), each already carrying recipient+text+org. So EVERYTHING the worker does is
pure dispatch of pre-filtered rows → `app_worker` (infra), no org-partitioning. (An earlier draft listed a
"cross-tenant generator, org-partition" row — that was a generic hedge, not grounded in this codebase; removed.)

## The security model: filter at ENQUEUE, not at dispatch (owner 2026-07-13)

The tenant boundary is enforced the moment a task is **queued**, inside a staff/patient session under RLS:

- a doctor can only queue a send to **his own** clients; a client configures notifications **only for self**;
- a doctor uploads video only into **his own** org; assigns it to a patient's program only for **his own** patient.

The **dispatch worker does not know or need to know who queued it** — it just sends. Hence `app_worker` (infra),
tied to no tenant, narrowly granted. This is safe **only because enqueue was filtered**.

## Media / HLS

Upload happens in the doctor's session → media row **org-tagged**. HLS chunks are cut by the worker but
**tagged to the uploader** (inherit org). A patient sees a video only via **program assignment** (the patient's
program, set by the doctor in-session, only for his own patient). media-worker uses `app_worker` with narrow
media-table grants; it never widens visibility.

**Marketplace (task #724, owner 2026-07-13) — later, not a walls blocker.** Specialists BUY prepared
exercise/video sets. Hard constraint: **files are NEVER copied** — one canonical `content_id`; a purchase is a
**grant row** (`content_access_grants`: user/org → content_id, expires/revoke) referencing the same file. Media
visibility policy becomes an OR: `(own org) OR (valid grant/entitlement) OR (assigned to patient's program)`.
Builds on existing `content_access_grants` (RLS on) + `modules/entitlements` + `modules/products` +
`doctor/lfk-templates`. Mechanics are an engineering call to settle when the store is built.

## Pools (connections)

- webapp target: separate physical pools/logins/certificates for **staff**, **patient/pre-session** and
  **global-admin**, all owned by the same webapp port. Global-admin is not a third software port; its DB login is a
  distinct trust boundary because it crosses organizations. Current two-pool code is incomplete until the third
  webapp-owned pool and mutually exclusive memberships are implemented.
- integrator/worker/media units: connect with the role matching their principal — `app_worker` for dispatch,
  org-scoped for cross-tenant generators. (verify each entrypoint's current DB access during fanout.)

## Why a combined single role is wrong (proven on the rehearsal clone)

A role holding both app_staff+app_patient makes `app.is_staff()=true` even pre-auth → breaks the bootstrap
NULL-org PII path under FORCE. So the base/bootstrap connection role MUST be distinct from app_staff. Confirmed
live on the disposable clone.

## Build order (on TEST — break & fix, per owner)

1. Create `app_worker` + narrow grants. 2. Review+commit the webapp two-pool code. 3. Stamp the right principal
   in each background entrypoint (dispatch→infra; cross-tenant→org-partition). 4. Flip TEST enforce (roles + FORCE

- locked, all units). 5. Drive end-to-end (staff isolation + login + a queued send + a media upload), fix each
  break. 6. Owner acceptance.
