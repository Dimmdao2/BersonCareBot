# Admin console baseline + historical support-chat research (#808)

> **SUPPORT-ПОЛОВИНА SUPERSEDED 31.07.2026.** Разделы §4–§7 ниже сохраняют исследование от 17.07, но не
> являются инструкцией к реализации. Поздние решения владельца заменили один continuous chat на отдельные
> тикеты с репликами/вложениями/статусами/экспортом, platform in-app-only — на обычные настраиваемые
> уведомления, а interim `/app/doctor/**` — на существующий `/app/admin/**` shell. Текущий исполнительный
> канон: [`../SUPPORT_TICKETS_1070.md`](../SUPPORT_TICKETS_1070.md). Сохраняющийся канон этого файла —
> только reality audit и admin-console baseline #808 в §0–§3.

**Status:** admin-baseline design + superseded support research, DOCS-ONLY. No application code, schema,
config or migration changed by this pass. Written against repo state on `feat/doctor-ui-rebuild`, 2026-07-17.

**Authority order:** `docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-17.md` §2 (arms card #808, verbatim: "и
вообще должно быть еще у админа хотя бы базово (техподдержку еще надо сделать чат)") →
`docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md` §5/§12 (foundation-scope aggregates/organization-visibility
rulings; "старший верхний админ" model) → `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_RULINGS_2026-07-16.md`
(highest product/UX authority; UX08-10 rejects a patient-level admin workflow, PLAT-09 approved as
diagnostics/support-report zone) → `TARGET_IA.md` / `ROLE_CAPABILITY_MATRIX.md` / `SCREEN_COMPOSITION.md` /
`IMPLEMENTATION_ROADMAP.md` (audited UX-06/03/09 package, merged to `feat/doctor-ui-rebuild` at `12cdef5d6`) →
`docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` (sibling #751 doc, same night, already claims the
`PLAT-02`/`PLAT-03` temporary placement pattern this document must join, not duplicate) →
`docs/_TODO/SAAS_FOUNDATION/TENANT_WALLS_AND_ACCESS_MODEL.md` (tenant-wall canon) → this document.

**This is not a from-scratch redesign.** The audited UX package already assigns a zone ID to every surface this
card touches (`PLAT-01/02/05/07/09`, `MGMT-01`) and a capability-matrix row to the exact actor ("Global admin /
support"). What it does not do — by its own stated contract — is choose a persistence shape, a reuse-vs-new
call for messaging infra, or a route for _this specific pass_; `IMPLEMENTATION_ROADMAP.md:199` says this
directly for any gap "that assumes a new persistence shape" and U9's own `Workstreams` row only promises
"dedicated capabilities and audit" (`IMPLEMENTATION_ROADMAP.md:720-721`), not a data model. §0 below cites
exactly what already exists; §1 is the current-code reality audit; §2-§4 are the delta this doc adds (IA
baseline, support-chat data/lifecycle/notification design); §5 is the phased TEST-only checklist; §6 collects
contradictions; §7 is the dedicated owner-decision section.

Card #808 text (taskdb, verbatim, owner session 2026-07-17 morning, cited in
[`OWNER_RULINGS_2026-07-17.md:25-38`](./OWNER_RULINGS_2026-07-17.md)):

> «тарифы и оплата без магазина упражнений. плюс админскую часть для управления тарифной сеткой и вообще должно
> быть еще у админа хотя бы базово (техподдержку еще надо сделать чат)»

The tariff-grid admin part is `#751`, fully re-scoped in `TARIFFS_PAYMENTS_ADMIN_PLAN.md`. This document owns the
remainder: "у админа хотя бы базово" (a coherent minimum admin console) + "чат техподдержки" (admin ↔ clinic
support chat).

---

## 0. Position in the audited UX package

### 0.a What the package already specifies

| Topic                                         | Source                                                                                                                                                                                                                                                                                                                                                       | What it fixes                                                                                                                                                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Platform admin is a separate shell            | `TARGET_IA.md:177` ("Platform administration uses a separate shell and route namespace. It is never an expanded clinical sidebar"), `TARGET_IA.md:328` ("Global admin has its own platform shell and never inherits clinical navigation")                                                                                                                    | No new admin work may be bolted onto the doctor sidebar as a permanent home                                                                                                                                                                                              |
| Zone registry for this card                   | `TARGET_IA.md:84-91` (`PLAT-02` Organizations, `PLAT-05` Configuration, `PLAT-07` Reliability, `PLAT-09` Support reports and escalation)                                                                                                                                                                                                                     | Every surface this doc touches already has a canonical ID; none may be invented                                                                                                                                                                                          |
| PLAT-09 candidate route + composition         | `SCREEN_COMPOSITION.md:72` (`/app/platform/support/[orgId]` — "Organization/platform diagnostics, support reports and escalation … purpose required; no clinical section or patient-record mutation")                                                                                                                                                        | Final target route namespace and composition contract for the admin-side support surface                                                                                                                                                                                 |
| PLAT-09 capability row                        | `ROLE_CAPABILITY_MATRIX.md:39` ("Global admin / support … Aggregate/org/platform diagnostics and support reports … No patient-card navigation … approved by owner 2026-07-16") and `:74` ("Explicit server-resolved organization support target … Purpose-specific support capability and audited operation; no normal chart route or `adminMode` shortcut") | The actor/target/audit shape of the admin-side interaction: explicit org target, purpose-specific, audited — matches a "admin opens org X's thread and replies" model directly                                                                                           |
| Clinic-side entry candidate                   | `SCREEN_COMPOSITION.md:78` (`MGMT-01 /app/manage` — "Setup/lifecycle, booking, delivery, domain, plan **and recent admin actions**")                                                                                                                                                                                                                         | `MGMT-01` already anticipates an "admin actions" surface at the owner/admin landing; no new canonical ID is needed for the clinic-side entry point                                                                                                                       |
| U9 owns the final shell                       | `IMPLEMENTATION_ROADMAP.md:699-732` (U9 — "global administration and bounded support"; scope includes "aggregate identity-integrity diagnostics and support reports"; dependency "U1, U7 core identity … platform data ownership classification")                                                                                                            | The _final_, single, unified platform shell (nav, route rename to `/app/platform/**`, full PLAT ownership split) is U9's job, not this card's                                                                                                                            |
| Non-duplication precedent already set tonight | `TARIFFS_PAYMENTS_ADMIN_PLAN.md:126-133,271-282,405-411`                                                                                                                                                                                                                                                                                                     | #751 Phase 3 already chose an _interim_ placement pattern (`(global-admin)` route group under `/app/doctor/**`, mirroring `system-health`) precisely so it does not race U9. This card must reuse the identical interim pattern, not invent a second one                 |
| Owner's organization-visibility model         | `OWNER_RULINGS_2026-07-15.md:135-149` (§12: public directory = separate public table; "внутренние данные... никто не должен видеть, кроме старшего верхнего админа. Ну и если будет потом техническая поддержка отдельно, но сейчас просто админ и всё")                                                                                                     | Confirms: today there is one admin actor; a _future_ separate "техподдержка" role is anticipated but not required now — matches UX08-10's "no patient workflow" framing, and directly anticipates this card's chat as the seed of that future role, not a blocker for it |
| Owner's aggregates model                      | `OWNER_RULINGS_2026-07-15.md:44-72` (§5)                                                                                                                                                                                                                                                                                                                     | Clinics as clients: billing + usage + platform load. This is `PLAT-04` analytics scope (`#800`), explicitly **not** in this wave (`OWNER_RULINGS_2026-07-17.md:29`: "НЕ выбрана: аналитика специалиста (#800)")                                                          |

### 0.b What the package leaves open that #808 needs decided

- Whether `PLAT-09`'s "support reports and escalation … system/code defects only" phrasing (`TARGET_IA.md:189`)
  is a scope _narrower_ than the owner's literal "чат техподдержки" ask (which reads as general clinic↔platform
  support, not defect-report-only). Flagged in §7, not resolved by invention.
- The actual persistence shape (tables, ownership path) for a thread/message model — no such table exists;
  `support_conversations` (§1.5) is a _different_ actor pair (patient ↔ org "admin"=doctor), not clinic ↔
  platform admin.
- Thread lifecycle (one continuous thread per org vs. ticket-per-topic) — not specified anywhere in the package.
- Notification/unread wiring for a brand-new topic — the package says "reuse existing notification infra" is a
  goal (implicit in every other UX-09 stage's "Workstreams" convention) but does not name a topic code.
- Exact interim route segment name and guard reuse — engineering choice, consistent with how #751 Phase 3 made
  the same kind of choice (`tariffs` / `organizations` / `commercial` as "engineering choice, not final IA" —
  `TARIFFS_PAYMENTS_ADMIN_PLAN.md:277`).

### 0.c This document's contract for the delta

Scoped strictly to: (1) a baseline inventory + minimal coherent IA for "хотя бы базово", reusing what already
exists and cross-referencing #751's Phase 3 additions rather than re-specifying them; (2) a support-chat design
(reuse-vs-new verdict, data model, lifecycle, guards, tenant-wall/RLS approach, notification model, UI placement).
It does **not** design U9's final unified shell, does **not** design `PLAT-04` analytics (`#800`), does **not**
re-open `#751`'s tariff/billing scope, and does **not** invent DNS/domain/branding work.

---

## 1. Reality audit (evidence, file:line)

### 1.1 Existing global-admin surfaces — inventory

Today's `global_admin`-tier navigation lives entirely inside `doctorNavLinks.ts` as two accordion clusters
(`apps/webapp/src/shared/ui/doctor/doctorNavLinks.ts:111-151`):

- **"Настройки"** (`accessTier: "global_admin"`, lines 111-136): `admin-app-settings`, `admin-auth`,
  `admin-integrations`, `admin-technical` — four existing pages under `/app/doctor/admin/**`.
- **"Система"** (`accessTier: "global_admin"`, lines 137-151): `system-health`, `health-archive`, `audit-log`.

Both clusters are already marked for migration in the audited package: `ROUTE_MIGRATION_MAP.md:62` (S23 —
`admin/app-settings|auth|integrations|technical` → "move/split" → `PLAT-05` + `MGMT-07`) and
`ROUTE_MIGRATION_MAP.md:63` (S24 — `system-health|health-archive|audit-log` → "move" → `PLAT-07`). Additionally
`analytics` (line 108-110 of `doctorNavLinks.ts`, also `global_admin`-tier) is S22 → `PLAT-04`/`CLIN-11` split,
and the legacy `booking-merge`/`clients/name-match-hints` pages are S26 → explicitly "retire / reclassify before
any reuse … No global-admin patient-repair destination" (`ROUTE_MIGRATION_MAP.md:65`).

**Only one of these nine pages has actually been moved to the target interim shell shape:** `system-health`.
Its `layout.tsx` (`apps/webapp/src/app/app/(global-admin)/doctor/system-health/layout.tsx:1-27`) uses the
`(global-admin)` **route group** (a Next.js parenthesised segment — contributes no URL segment, so the page
still resolves at `/app/doctor/system-health`), gates with `requireGlobalAdminDoctorPage()`, and renders
`DoctorWorkspaceShell` with `enableTenantRuntime={false}` — i.e. explicitly _no_ organization-tenant runtime
context, because a global operator has no organization membership. Its `page.tsx`
(`.../system-health/page.tsx:1-14`) re-confirms the guard and renders `DoctorAppShell` + `DoctorPageHeader` +
one content section (`SystemHealthSection`). `health-archive/page.tsx` and `audit-log/page.tsx` are **still**
plain files under `apps/webapp/src/app/app/doctor/**` (not inside `(global-admin)`), gated by the page-level
`requireAdminDoctorPage()` (weaker: `role==="admin"` only, no `adminMode` check — see §1.2) and wrapped in the
ordinary tenant `DoctorAppShell`, not `DoctorWorkspaceShell{enableTenantRuntime:false}`.

`#751`'s `TARIFFS_PAYMENTS_ADMIN_PLAN.md:271-278` already commits Phase 3 to extending exactly the
`system-health` pattern for a new `apps/webapp/src/app/app/(global-admin)/doctor/tariffs/page.tsx` — this
document's admin-side support surface must join that same pattern (§4.7), not invent a third shape.

### 1.2 Three "admin" guard families — confirmed risk, shared with #751

`apps/webapp/src/app-layer/guards/requireRole.ts` exports, among others:

- `requireAdminWorkspaceApiContext()` (line 224) — **true platform admin**: `role==="admin" && adminMode`.
- `requireClinicManagementApiContext()` (line 246) — **org-level** owner/admin (booking-engine-composed context).
- `requireDoctorWorkspaceApiContext()` (line 209) — plain tenant staff context.

`apps/webapp/src/app/app/settings/requireAdminDoctorPage.ts` mirrors this at page level:
`requireAdminDoctorPage()` (line 5, `role==="admin"` only — used by today's `audit-log`/`health-archive`
pages, §1.1), `requireGlobalAdminDoctorPage()` (line 14, `role==="admin" && adminMode===true` — used by
`system-health`), and `requireClinicManagementDoctorPage()` (line 22, global-admin-in-admin-mode **or**
`canManageOrganization` — org-scoped, used for clinic management pages).

`TARIFFS_PAYMENTS_ADMIN_PLAN.md` (Reality lock table, row "API guard для настоящего platform-admin") already
flags the naming collision risk between `requireAdminWorkspaceApiContext` (true platform) and
`requireAdminBookingEngine`/`requireClinicManagementApiContext` (org-scoped, easy to copy-paste wrong). This
document inherits the identical risk for the new support-thread API and does not re-litigate it — it names the
exact guard to use for each side in §4.3 instead.

### 1.3 `be_organizations` — minimal schema, no admin-facing list yet

`apps/webapp/db/schema/bookingEngine.ts:64-82`: `id`, `title`, `isActive`, `sortOrder`, `tariffId` (nullable FK,
dormant), `createdAt`, `updatedAt`. No aggregate/usage columns. `pgBookingEngine.ts:141-144`'s `listOrganizations()`
reads all rows unconditionally (no org filter in code) but has **no caller today outside internal booking-engine
plumbing** — there is currently no `/api/admin/organizations` route at all (`grep -r "tariffId" apps/webapp/src/app/api`
returns 0 route files, confirmed independently and matching `TARIFFS_PAYMENTS_ADMIN_PLAN.md`'s own finding).
`#751` Phase 3 is the one adding the first such endpoint (`GET /api/admin/organizations`, "только id/title/tariffId
для picker'а" — `TARIFFS_PAYMENTS_ADMIN_PLAN.md:264`). **This document does not add a second one** — see §3.

### 1.4 `be_organizations` RLS status — unconfirmed, shared open risk

No `CREATE POLICY … ON … be_organizations` or `ALTER TABLE be_organizations … ROW LEVEL SECURITY` exists in
`deploy/postgres/*.sql` (checked independently by grep across the full directory — zero hits on the table name
in policy-defining statements, only in unrelated grant lines and other tables' policies). This is the exact same
finding already recorded as open risk #1 in `TARIFFS_PAYMENTS_ADMIN_PLAN.md:388-393` (cites
`ROLE_CAPABILITY_MATRIX.md:38,73`: "Dedicated platform capability/port before query or mutation; no
organization membership fallback"). **Any admin-side cross-org read this document specifies (the support-thread
list across all orgs, §4.4) depends on the same audited cross-org read path #751 needs — one path, confirmed
once, consumed by both**, not two independently-reasoned bypasses.

### 1.5 Existing messaging infra is patient ↔ org, not clinic ↔ platform

`docs/ARCHITECTURE/PATIENT_SUPPORT_CHAT_INBOX.md:1-16` and `apps/webapp/src/modules/messaging/README.md:1-17`
describe the canonical 1:1 chat: `support_conversations` / `support_conversation_messages`
(`pgSupportCommunication.ts:19-60`), keyed per **patient** — `webapp:organization:{organizationId}:platform:{userId}`
when an organization principal is active, legacy `webapp:platform:{userId}` otherwise
(`messaging/README.md:4-8`). The "admin" `sender_role` in this schema means **the clinic/doctor side replying to
a patient** (`doctorSupportMessagingService.ts:17-123`, especially `sendAdminReply` at line 58 — appends a
message with `senderRole: "admin"` and notifies the _patient_), not a platform operator. Signed integrator
`admin-reply` explicitly does **not** establish an organization principal and rejects org-scoped keys
(`messaging/README.md:6-8`, `PATIENT_SUPPORT_CHAT_INBOX.md:11-13`) — the entire schema, its ID scheme, its
Telegram/MAX channel-relay plumbing (`channelCode`/`channelExternalId`/`external_chat_id`) and its RLS/tenant-wall
posture are built around one specific actor pair (organization + patient) and one specific delivery path
(bot/relay). There is no `AdminConversationListRow`/`SupportCommunicationPort` caller anywhere in the codebase
that means "platform admin talking to an organization" — the only consumer is
`doctorSupportMessagingService.ts` (clinic side, patient-facing).

### 1.6 Notification/topic infra — reusable pattern, not a wired topic

`apps/webapp/src/modules/doctor-notifications/doctorTopicChannelDefaults.ts:1-30` defines per-topic default
channel fallbacks (`doctor_patient_messages`, `doctor_patient_program_notes` → `web_push, telegram, max`) and
`notifyDoctorPatientMessageToStaff.ts:58` is the generic "notify staff about topic X" entry point. This is a
clean, reusable **pattern** (topic code → allowed channels → per-user channel prefs → fan-out), not a specific
mechanism this feature can call without adding its own topic code — no `admin_support_*` topic exists today.

### 1.7 Audit-event infra — generic, but current-principal-scoped only

`apps/webapp/src/infra/adminAuditLog.ts:97-116`'s `writeAuditLog(pool, entry)` is the existing generic
append-only audit writer (`actorId`, `action`, `targetId`, `details`, `status`). Line 98:
`const organizationId = currentAuditOrganizationId();` — this **always** derives the organization column from
`getCurrentDbPrincipalOrganizationId() ?? DEFAULT_ORGANIZATION_ID` (line 23-25), i.e. the **acting** principal's
own org context. A platform admin acting on organization X (which is not their own membership — admin has none)
cannot use this function as-is to log "actor = admin, target org = X" — it would silently fall back to
`DEFAULT_ORGANIZATION_ID`. **This is the same class of gap** `TARIFFS_PAYMENTS_ADMIN_PLAN.md` needs solved for
its own tariff/assignment/override audit requirement ("audit-событие на каждое… изменение: actor, target org,
before/after" — `TARIFFS_PAYMENTS_ADMIN_PLAN.md:286-287`, §3.3 Definition of Done). Recommendation (§4.6): extend
`AuditLogWriteEntry`/`writeAuditLog` with an optional explicit `organizationId` override, used by **both**
features, instead of each inventing its own audit call — matches the repo's "single chokepoint, no dup"
preference.

### 1.8 DB role/RLS model — dormant P0.5, descriptor-model-driven

`docs/_TODO/SAAS_FOUNDATION/P0_5_DB_ROLE_SPLIT.md:40-56`: production still runs one unified runtime role;
per-table tenant isolation today is enforced by RLS policies keyed on the request-scoped GUC
(`getCurrentDbPrincipalOrganizationId()` / `app.org`), generated from a central "SaaS tier descriptor model"
(`docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs`) rather than hand-written per table — e.g.
`organization-member-invites-rls.sql:52` shows the generic dormant policy name
`saas_org_dormant_p0_8_3` applied to a `SCOPED` table, not a bespoke policy. **New tables this document proposes
(§4.2) must be registered as `SCOPED`, `organization_id`-owned rows in that descriptor model**, per
`.cursor/rules/saas-foundation-aware-development.mdc` ("choose ownership path… if unclear, mark
`needs_decision`") — not given a one-off hand-rolled policy.

### 1.9 Route namespace — interim vs. final, confirmed by both docs independently

Final target namespace for platform screens is `/app/platform/**` (`SCREEN_COMPOSITION.md:20-26`, explicitly
"Target route names are migration candidates, not an authorization source or an implementation commitment" —
`SCREEN_COMPOSITION.md:6-7`). `#751` Phase 3 already decided, for exactly this reason, to place its new UI at
`apps/webapp/src/app/app/(global-admin)/doctor/tariffs/**` — interim, IA-_compatible_, not IA-_final_
(`TARIFFS_PAYMENTS_ADMIN_PLAN.md:271-278`, risk #6 at `:407-411` names the danger explicitly: "if U9 starts in
parallel, two teams may independently build two different 'platform shells'"). This document's admin-side
support surface follows the identical interim convention (§4.7) for the identical reason.

---

## 2. UX/IA zone mapping for this card

| Zone ID                                  | Candidate route (final, U9)        | Interim route (this pass, matching #751)                                                       | What this document does with it                                                                                              |
| ---------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `PLAT-02` Organizations                  | `/app/platform/organizations`      | reuses `#751`'s `GET /api/admin/organizations` (extend field set, §3)                          | Baseline "clinics as clients" list — identity + tariff + status; no new endpoint                                             |
| `PLAT-03` Commercial                     | `/app/platform/commercial`         | `#751` Phase 3, unchanged                                                                      | Not touched by this document                                                                                                 |
| `PLAT-05` Configuration                  | `/app/platform/configuration`      | existing `admin/app-settings`, `admin/auth`, `admin/integrations`, `admin/technical` (unmoved) | Inventoried only (§1.1); no move performed here — S23 migration itself is U9/#751-Phase-3-adjacent, out of this card's scope |
| `PLAT-07` Reliability                    | `/app/platform/reliability`        | `system-health` (moved), `health-archive`/`audit-log` (not yet moved)                          | Inventoried only (§1.1); no move performed here                                                                              |
| `PLAT-08` Identity-integrity diagnostics | `/app/platform/identity-integrity` | not built                                                                                      | Explicitly **not** this card (patient merge/name-match retirement, `ROUTE_MIGRATION_MAP.md:65`, is its own future contract)  |
| `PLAT-09` Support reports and escalation | `/app/platform/support/[orgId]`    | **new**: `apps/webapp/src/app/app/(global-admin)/doctor/support/[orgId]/page.tsx`              | Admin-side support-chat surface (§4.7)                                                                                       |
| `MGMT-01` Organization overview          | `/app/manage`                      | existing owner/admin landing under `/app/doctor` (today's non-clinical-owner destination)      | Clinic-side support entry point, as a widget/action, not a new canonical ID (§4.7)                                           |

No new canonical screen ID is proposed. Every surface maps to an ID already frozen by the audited package.

---

## 3. "Хотя бы базово" — minimal coherent admin console (delta contract)

The owner's ask is deliberately modest ("хотя бы базово" = "at least a baseline"), and the sibling `#751` doc
already states this pass is not U9's job (`TARIFFS_PAYMENTS_ADMIN_PLAN.md:82-84`, §0a: "этот документ **не
берёт на себя** полную переборку shell/навигации — это scope U9"). This document holds the identical line.

**What already qualifies as baseline today** (no work needed): `PLAT-05`-destined config pages (app-settings,
auth, integrations, technical — §1.1), `PLAT-07`-destined pages (system-health, health-archive, audit-log —
§1.1), all reachable today via the "Настройки"/"Система" doctorNavLinks clusters, all correctly gated to
`global_admin` tier.

**What is missing for "coherent"** (the actual gap, this card's scope):

1. **`PLAT-02` Organizations as clients** — today there is no page that lists organizations at all outside the
   picker `#751` Phase 3 is building for tariff assignment. Recommendation: build **one** shared
   `GET /api/admin/organizations` (extend `#751`'s picker-shaped endpoint with the small additional fields a
   "clients" list view needs — `isActive`, `createdAt`, member/staff count if trivially available from
   `be_organization_members`) and **one** page
   (`apps/webapp/src/app/app/(global-admin)/doctor/organizations/page.tsx`, same shell pattern as
   `system-health`) that lists them + links into a detail view. Per §0a of `TARIFFS_PAYMENTS_ADMIN_PLAN.md`,
   the _identity_ row already opened for the tariff picker is the correct place to add these fields — not a
   second, independently-guarded endpoint. This satisfies "видеть список клиник … наверное, админ только"
   (`OWNER_RULINGS_2026-07-15.md:141`) directly, without touching `#800` analytics.
2. **A visible connective thread between the clusters** — today "Настройки" and "Система" are two independent
   accordions with no shared landing. This document does **not** propose restructuring `doctorNavLinks.ts`
   (that restructuring is exactly the S23/S24 "move" work owned by U9/#751-adjacent follow-up, not this card);
   it only adds the two new items (`organizations`, `support`) as siblings inside the existing "Система" cluster
   (or a renamed cluster, engineering choice, not a new IA decision) so a global admin's _current_ single
   accordion menu already reads as "Organizations · Support · Health · Archive · Audit log" — coherent without
   a shell rewrite.
3. **The support chat itself** (§4).

**Explicitly excluded from "хотя бы базово"** (do not build here): full `PLAT-04` analytics/aggregates (`#800`,
owner-excluded this wave), `PLAT-06` catalog governance (needs an ownership-split gate first, per
`IMPLEMENTATION_ROADMAP.md`), `PLAT-08` identity-integrity diagnostics (separate, patient-merge-adjacent, needs
its own reviewed contract per `ROUTE_MIGRATION_MAP.md:65`), any S23/S24 physical route _move_ (config/reliability
pages stay where they are; only two new pages are added), and U9's full shell/nav rebuild.

---

## 4. Support chat design

### 4.1 Reuse vs. new — verdict: **new, narrow model**; reuse only architecture patterns and the guard/audit/

notification _primitives_, not the `support_conversations` schema or service.

**Why not reuse `support_conversations`:**

- **Different actor pair.** `support_conversations` is keyed on `(organizationId?, platformUserId)` — a
  **patient** identity is load-bearing in the schema, the ID scheme, and the merge/legacy logic
  (`mergeLegacySupportConversationsForPlatformUser`, §1.5). Our actor pair is `(organizationId, staffAccount)` on
  one side and `(platform admin)` on the other — there is no patient anywhere in this relationship. Bending the
  existing table to fit would mean either inventing a fake "patient" row per organization (semantically wrong,
  and risks the exact merge/legacy machinery built for patients firing on non-patient rows) or adding a large
  optional-everything branch to an already message-critical, bot-integrated table.
- **Different tenant-wall shape.** `support_conversations` is _strictly_ single-org-scoped per row by design (a
  patient's conversation with clinic A must never be visible to clinic B — confirmed by the "два изолированных
  диалога" rule, `messaging/README.md:9`). Our admin side needs the **opposite**: one explicit actor (global
  admin) reading **across all organizations**, which `ROLE_CAPABILITY_MATRIX.md:38,73` says must go through "a
  dedicated platform capability/port… no organization membership fallback" — i.e. a deliberate, audited,
  narrow exception to the tenant wall, not a schema whose entire purpose is enforcing that wall for a different
  actor. Mixing both access shapes into one table/port makes it much harder to prove the patient-facing path
  never gains an accidental cross-org leak.
- **Different delivery/channel model.** `support_conversations` carries Telegram/MAX/webapp channel-relay fields
  (`channelCode`, `channelExternalId`, `external_chat_id`) that exist purely to support the bot-integrated
  patient-support flow (`integratorSupportBridge.ts`, `relayOutbound`). None of that applies to a clinic-owner ↔
  platform-admin conversation, which is webapp-only in-app for the baseline (§4.6).
- **What _is_ reused:** the architectural _pattern_ — one "ensure conversation" idempotent entry point, a
  message table with `sender_role` + `read_at` for unread computation, a thin service layer, a notify-on-reply
  side effect — is proven and directly copyable in shape (not in code) from
  `doctorSupportMessagingService.ts`/`pgSupportCommunication.ts`. The **guard** primitives
  (`requireClinicManagementDoctorPage`/`requireGlobalAdminDoctorPage`, §1.2), the **audit** primitive
  (`writeAuditLog`, extended per §4.6), and the **notification topic** primitive
  (`doctorTopicChannelDefaults.ts`, §4.6) are reused as-is, not re-implemented.

This verdict matches the repo's own module-isolation discipline (`.cursor/rules/clean-architecture-module-isolation.mdc`
— new domain gets its own `modules/*/ports.ts`, not a bolt-on branch inside an unrelated module) and the explicit
product-absolutes precedent against building "a parallel X engine beside an existing one" (§1a of `AGENTS.md`,
by analogy — that rule is about LFK/courses specifically, but the reasoning transfers: don't grow
`support_conversations` into a second, incompatible identity model it was never designed for).

### 4.2 Data model (new — `modules/admin-support/**`)

Ownership path: `organizationId` — a direct FK to `be_organizations(id)`. Registered as `SCOPED` in the RLS
descriptor model (§1.8), not as a bespoke policy.

```
admin_support_threads
  id                uuid primary key
  organization_id    uuid not null references be_organizations(id)
  status            text not null  -- 'open' | 'closed'
  opened_by         uuid           -- platform_users.id of the staff member who sent the first message
  created_at        timestamptz not null default now()
  last_message_at   timestamptz not null default now()
  closed_at         timestamptz
  closed_by         uuid           -- either staff or admin account id
  UNIQUE (organization_id) WHERE status = 'open'   -- one active thread per org (§4.5)

admin_support_thread_messages
  id                uuid primary key
  thread_id         uuid not null references admin_support_threads(id)
  sender_role        text not null  -- 'org_staff' | 'platform_admin'
  sender_account_id  uuid not null  -- platform_users.id (staff) or admin account id
  text              text not null
  created_at        timestamptz not null default now()
  read_at           timestamptz    -- set when the *other* side has seen it (mirrors support_conversation_messages)
```

The partial unique index (`WHERE status = 'open'`) gives "one continuous thread per org, reopened by a new
message" for free (§4.5) without an extra "ensure" round-trip on the hot path — insert-or-reuse the single open
row.

### 4.3 Guards / capability

- **Clinic side** (compose a message, view own org's thread): `requireClinicManagementDoctorPage()`
  (`requireAdminDoctorPage.ts:22`) — already exactly "global admin in admin mode **or** `canManageOrganization`",
  i.e. owner/admin capability, org-scoped. No new guard needed.
- **Platform side** (list all orgs' threads, open one, reply, close): `requireGlobalAdminDoctorPage()`
  (`requireAdminDoctorPage.ts:14`) for pages, `requireAdminWorkspaceApiContext()`
  (`requireRole.ts:224`) for API routes — the **true** platform-admin guard, not the org-scoped
  `requireClinicManagementApiContext()` (§1.2's named collision risk applies here verbatim; the new
  `/api/admin/support-threads/**` routes must import `requireAdminWorkspaceApiContext`, never
  `requireAdminBookingEngine`/`requireClinicManagementApiContext`).

### 4.4 Tenant-wall / RLS approach

- Clinic-side reads/writes: standard `organization_id`-scoped RLS wall, same predicate shape as every other
  `SCOPED` org table under `TENANT_WALLS_AND_ACCESS_MODEL.md` — a staff member sees only their own org's row(s).
- Platform-side cross-org read (list of all orgs' open threads, §4.7): **must** go through the same "dedicated,
  audited platform capability/port, no organization-membership fallback" contract §1.4 already names as an open,
  shared risk with `#751`. This document does **not** invent a second resolution — it depends on whichever
  concrete mechanism `#751` Phase 3 lands for `listOrganizations()`/`GET /api/admin/organizations` (audited
  platform read port vs. explicit logged bypass) and reuses it for `admin_support_threads` cross-org listing.
  If `#751`'s Phase 3 has not landed that mechanism yet when this feature is implemented, implementing this
  feature's cross-org list is the trigger to resolve it — not a second one-off decision.

### 4.5 Thread lifecycle

```
(no thread) --org sends first message--> open ---admin replies---> open
   open --admin marks resolved--> closed
   closed --org sends new message--> open (new row is NOT created; existing implementation reuses
                                             the closed row: status→'open', closed_at/closed_by cleared)
```

One active thread per organization for the baseline (owner's literal phrasing is singular — "чат
техподдержки", not "a ticket system"; §7 asks for confirmation if this reading is wrong). Either side may close;
either side reopens it implicitly by sending a new message after closure. No ticket subject/topic field in the
baseline — if the owner wants topic-separated tickets later, that is an additive column
(`subject`/`category`), not a redesign.

### 4.6 Notification / unread model

- **Clinic side (staff notified of an admin reply):** add one new topic code, e.g. `platform_admin_support_reply`,
  to the existing `doctor-notifications` registry (§1.6) — same shape as `doctor_patient_messages`, default
  channel `web_push` only for the baseline (this is a B2B operational channel, not a patient-safety channel;
  telegram/max defaults are a deliberate non-default here, unlike patient messages — flagged as an engineering
  default, not an owner gate, easy to widen later via the same per-user channel-pref mechanism). Badge count on
  the existing `DoctorMenuBadgeKey` mechanism (`doctorNavLinks.ts:17-23`) — add one more key
  (`supportThreadUnread`), same pattern as the existing `communicationsTotal`/`registrationSystemFailures` keys.
- **Platform side (admin notified of a new/updated org thread):** baseline = in-app only. Reuse the existing
  client-side polling architecture (`useSupportUnreadPolling.ts` is the pattern to copy in shape, not import
  directly — it is patient-module-scoped) for a small "N organizations have unread messages" badge on the new
  `PLAT-09` interim page and, if placed inside the "Система" nav cluster (§3), on that nav item. No push/email
  escalation to the admin's own account in the baseline (§7 asks whether this is sufficient).
- **Audit:** every message send and every close/reopen writes one `writeAuditLog` row. Because the admin side
  acts on a _target_ org that is never the admin's own principal (§1.7's gap), this feature is one of the two
  concrete callers (with `#751`) that needs `AuditLogWriteEntry`/`writeAuditLog` extended with an optional
  explicit `organizationId` parameter (falling back to `currentAuditOrganizationId()` when absent, so every
  existing caller is unaffected) — **one** extension, consumed by both features, not two separate audit paths.

### 4.7 UI placement

- **Clinic side (`MGMT-01`-equivalent):** a "Написать в поддержку платформы" action/widget on the current
  non-clinical owner/admin landing (today: wherever `requireClinicManagementDoctorPage()`-gated pages land,
  ahead of the future `MGMT-01 /app/manage` rename). Opens/continues the org's single open thread inline
  (small chat panel, reusing `apps/webapp/src/shared/ui/doctor/primitives/*` shadcn copies per
  `.cursor/rules/doctor-ui-shared-primitives.mdc` — no bespoke chat bubble component). Not a new top-level
  `doctorNavLinks` entry required for the baseline; a single action is enough for "хотя бы базово".
- **Platform side (`PLAT-09` interim):** new
  `apps/webapp/src/app/app/(global-admin)/doctor/support/page.tsx` (list: all organizations with an open/recent
  thread, unread indicator, last message preview — same list-shape precedent as `#751`'s planned
  `/api/admin/organizations` picker) and
  `apps/webapp/src/app/app/(global-admin)/doctor/support/[orgId]/page.tsx` (thread detail + reply box), both
  under a shared `layout.tsx` identical in shape to `system-health/layout.tsx:1-27`
  (`requireGlobalAdminDoctorPage()` + `DoctorWorkspaceShell{enableTenantRuntime:false}`). Final target route
  (`/app/platform/support/[orgId]`, `SCREEN_COMPOSITION.md:72`) is U9's rename to perform later, not this pass's
  job — matching exactly how `#751` treats its own interim `tariffs` segment name
  (`TARIFFS_PAYMENTS_ADMIN_PLAN.md:277`: "инженерный выбор фазы, не финальная IA-навигация").
- **Nav entry:** add `support` (and, per §3, `organizations`) as new items inside the existing "Система"
  `doctorNavLinks` cluster (`doctorNavLinks.ts:137-151`), each `accessTier: "global_admin"`, using the existing
  `badgeKey` mechanism (§4.6) — no cluster restructuring.

### 4.8 Explicit non-goals (baseline)

No patient PII channel (this is staff-identity ↔ platform-identity; if staff pastes patient details, that is a
copy/product-policy question flagged in §7, not something the schema prevents — there is no clinical-object
reference in this model by design, unlike `support_conversations`). No ticket categorization/SLA/routing
automation. No email/SMS escalation to either side. No merge with `support_conversations`' unread bell. No
change to `doctorNavLinks.ts` cluster _names_ or to any S22/S23/S24 route _move_.

---

## 5. Phased implementation checklist (TEST-only; each phase independently auditable)

### Phase 1 — data model + chokepoint extension (no UI)

- [ ] Drizzle migration: `admin_support_threads`, `admin_support_thread_messages` (§4.2), registered `SCOPED`/
      `organization_id`-owned in `docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs` (§1.8) — no
      bespoke hand-written policy.
- [ ] `modules/admin-support/ports.ts` + `pgAdminSupport.ts` implementation (list/ensure-open-thread/append-message/
      mark-read/close/reopen), `inMemoryAdminSupport.ts` DI fake, wired in `buildAppDeps.ts`.
- [ ] Extend `AuditLogWriteEntry`/`writeAuditLog` with optional explicit `organizationId` (§4.6); unit test both
      call shapes (implicit current-principal org, explicit target org) resolve to the correct row.
- [ ] Add `platform_admin_support_reply` topic to `doctor-notifications` registry (§4.6); default channel
      `web_push` only.

**Check:** `pnpm --filter webapp vitest run` on touched files + `pnpm --filter webapp typecheck`.
**Exit:** schema exists, chokepoint extension proven independent of both features' concrete callers.

### Phase 2 — clinic-side surface

- [ ] `POST /api/doctor/support-threads/messages` (send/ensure-open, guarded by
      `requireClinicManagementApiContext()`-equivalent org context — confirm exact composed-gate shape at
      implementation time per §1.2's naming-collision warning).
- [ ] `GET /api/doctor/support-threads/current` (own org's thread + messages + unread count).
- [ ] UI action/panel on the existing owner/admin landing (§4.7), shared doctor primitives only.
- [ ] Badge key `supportThreadUnread` wired through `doctorNavLinks.ts` badge mechanism.
- [ ] A/B isolation test: clinic A never sees clinic B's thread via list/direct/count.

**Check:** contract test on the new routes; RTL test on the panel; `demo-clinic-a`/`demo-clinic-b` isolation
negative.
**Exit:** any clinic staff (owner/admin capability) can open/continue their org's single thread.

### Phase 3 — platform-side surface

- [ ] Confirm (or land, if still open when this phase starts) the audited cross-org read path §4.4 depends on —
      do not implement a second one independently of `#751`.
- [ ] `GET /api/admin/support-threads` (all orgs, open/recent, unread indicator) under
      `requireAdminWorkspaceApiContext()`.
- [ ] `GET /api/admin/support-threads/:orgId`, `POST /api/admin/support-threads/:orgId/messages`,
      `POST /api/admin/support-threads/:orgId/close`, same guard.
- [ ] `apps/webapp/src/app/app/(global-admin)/doctor/support/{page.tsx,[orgId]/page.tsx,layout.tsx}` per §4.7.
- [ ] Nav entries (`support`, `organizations` if not already added by `#751`) inside "Система" cluster.
- [ ] Audit event on every admin message/close/reopen with explicit target `organizationId` (§4.6).
- [ ] Authz negative: `clinic_admin`/doctor session gets 403 on every new admin route and a 404/redirect on the
      new admin pages.

**Check:** authz A/B matrix (admin vs. doctor vs. unauthenticated); desktop+mobile screenshot acceptance of the
new `(global-admin)` pages, matching `system-health`'s existing visual pattern.
**Exit:** global admin can see every organization with an open thread and reply; no organization can see another
organization's thread through this surface.

### Phase 4 — `PLAT-02` baseline organizations list (only if not already delivered by `#751` Phase 3)

- [ ] Confirm with `#751`'s own execution log whether `GET /api/admin/organizations` already exists with the
      fields §3 needs; if yes, extend it (do not duplicate); if the sibling work hasn't landed yet, build the
      shared endpoint once, referenced by both plans' logs.
- [ ] `apps/webapp/src/app/app/(global-admin)/doctor/organizations/page.tsx` — list + basic detail (identity,
      tariff, status; no billing/usage aggregates — that is `#800`).

**Check:** authz matrix; screenshot acceptance.
**Exit:** "видеть список клиник" (`OWNER_RULINGS_2026-07-15.md:141`) is satisfied at baseline.

### Phase 5 — integration acceptance on the test server

- [ ] Fixture: global admin, demo-clinic-a, demo-clinic-b.
- [ ] Clinic A opens a support thread, sends two messages; admin sees it in the list with correct unread count,
      opens it, replies; clinic A sees the reply + badge; clinic A closes; clinic B sends a message, thread
      reopens implicitly, and clinic B never sees clinic A's thread at any point.
- [ ] Negatives: unauthenticated, doctor-without-management-capability on clinic-side routes (403), non-admin on
      platform-side routes (403), cross-org `orgId` forgery on the platform detail route (must resolve to the
      real target org from server-side data, never trust a client-supplied org label for anything but routing).
- [ ] One final `pnpm install --frozen-lockfile && pnpm run ci` after all phases (not per-phase).

**Exit:** demonstrable to the owner on `test.bersoncare.ru`.

---

## 6. Contradictions found

- `TARGET_IA.md:189`'s "system/code defects only" phrase for `PLAT-09` reads narrower than the owner's literal
  "чат техподдержки" (general support). Not treated as a blocking contradiction here — `ROLE_CAPABILITY_MATRIX.md:39,74`'s
  framing ("explicit org/platform target… purpose-specific support capability") is broad enough to host a
  general clinic↔admin chat without touching patient data, which is the actual guardrail both texts agree on.
  Flagged as an interpretation, resolved provisionally toward the broader reading; see §7.
- No other contradiction found between this design and `TARIFFS_PAYMENTS_ADMIN_PLAN.md`, `OWNER_RULINGS_2026-07-15.md`,
  `OWNER_RULINGS_2026-07-16.md`, or `OWNER_RULINGS_2026-07-17.md`.

---

## 7. Owner decisions (dedicated section — not invented here)

1. **Scope breadth of the support chat.** Is "чат техподдержки" meant to be a general-purpose channel for any
   clinic↔platform question (billing, how-to, feature request, bug), or narrower (e.g. only technical/bug
   reports, with billing questions routed elsewhere)? This document designs for the broad reading (§6). If the
   owner means something narrower, the data model (§4.2) is unaffected; only the UI copy/expectations change.
2. **One continuous thread vs. ticket-per-topic.** §4.5 assumes one active thread per organization (matching the
   singular "чат", not "тикеты"). Confirm, or specify if separate threads per topic/category are wanted later.
3. **Admin-side notification urgency for baseline.** §4.6 proposes in-app-only (list + badge, polling) for the
   platform side, with no push/email escalation to the admin's own account. Given "хотя бы базово," is this
   sufficient, or does day-one need an out-of-band ping (email to the account address) when a clinic sends the
   first message?
4. **Content policy for patient references inside the chat.** The schema carries no clinical-object reference by
   design (§4.8), matching UX08-10's rejection of a patient-workflow surface. Should the UI carry an explicit
   warning ("не указывайте персональные данные пациентов") for staff composing a message, or is this left to
   product policy/training rather than the UI?

None of the above blocks Phase 1-2 of §5 (data model, clinic-side surface can be built either way); they matter
starting at Phase 3 (platform-side UI copy) and Phase 5 (acceptance script wording).

---

## NOT DONE (by this design pass)

- No code, schema, migration, or config was written or changed — this is a docs-only pass, per the mission.
- `#751`'s tariff/billing/`PLAT-02`-picker work is not re-specified here; only cross-referenced and, where it
  overlaps (§3, §4.4, §4.6), explicitly deferred to being resolved **once**, shared by both docs.
- U9's final unified platform shell (route rename to `/app/platform/**`, full nav rebuild, ownership split of
  `PLAT-05`/`PLAT-07` moves) is not designed or started here.
- `PLAT-04` analytics/aggregates (`#800`) is not designed here — explicitly out of this wave per
  `OWNER_RULINGS_2026-07-17.md:29`.
- `PLAT-08` identity-integrity diagnostics / patient merge-and-name-match retirement is not designed here — a
  separate, not-yet-reviewed authorization contract per `ROUTE_MIGRATION_MAP.md:65`.
- The four §7 questions are recorded, not answered, by this document.
- No RLS policy, migration, or the `writeAuditLog` extension was implemented — §5 Phase 1 owns that, on TEST
  only, after this design is reviewed.
