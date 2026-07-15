# UX-06 — Target screen composition

**Статус:** completed as a decision-safe screen-composition contract; full independent UX-06 re-audit **PASS**
after integrated correction. Канонический phase verdict:
[`UX06_INDEPENDENT_AUDIT.md`](./UX06_INDEPENDENT_AUDIT.md) §7 (`57/57` compositions; unknown target IDs `0`).
**Contract:** screen specifications below are logical compositions. Target route names are migration candidates, not
an authorization source or an implementation commitment.

## 1. Composition grammar

All screens reuse the existing shell → template → zone → primitive model from
`SCREEN_ARCHITECTURE_GUIDE.md`. Staff and patient primitives remain physically isolated. A target screen contains:

- `Context`: organization, specialist binding, patient enrollment or platform target resolved by the server;
- `Header`: identity, title, scoped status and primary action;
- `Control`: tabs/search/filter/sort after authorization;
- `Content`: one coherent work object or dashboard;
- `Recovery`: empty, denied, entitlement, degraded and error states;
- `Audit`: author/actor/status facts where the action changes access, delivery, billing or clinical responsibility.

Target URLs use four logical namespaces:

- `/app/work/**` — clinical work;
- `/app/manage/**` — organization management;
- `/app/ops/**` — bounded assistant/operational work;
- `/app/platform/**` — global platform operations;
- `/app/account/**` and existing `/app/patient/**` — personal staff and patient surfaces.

The namespaces make ownership clear. `ROUTE_MIGRATION_MAP.md` defines compatibility and reuse; implementation may
stage redirects rather than rename everything at once.

## 2. Public, acquisition and join screens

| ID / candidate route | Composition | Primary states and actions | Reuse / dependency |
|---|---|---|---|
| PUB-01 `/` | Specialist hero; solo/clinic value paths; workflow; patient-care proof; pricing teaser; security/trust; demo/signup CTA; compact patient entry | default, signup disabled, demo fallback, legal/status degraded | Replace current patient-first copy/composition; reuse public primitives and legal footer |
| PUB-02 `/product`, `/pricing` | Capability groups, solo/clinic comparison, tier matrix, FAQ, demo | loading pricing, unavailable tier, contact sales | Packaging OM-8/BD decisions; no entitlement promise before ruling |
| PUB-03 `/signup` | Composition choice → identity fields → organization fields → terms → email challenge → result | duplicate email, challenge cooldown/expired, partial provision recovery, specialist-binding pending | Reuse current registration/start-confirm and email challenge; add first-run contract from ACQ-01…05 |
| PUB-04 `/login`, `/recover` | Persona-safe staff login; patient passwordless entry; recovery | unknown recipient, rate limit, expired code, locked/recovery | Reuse current public auth and patient email setup mechanics after privacy/session fixes |
| PUB-05 `/legal/**`, `/support`, `/status` | Platform operator terms/privacy, support and service status | published, unavailable, external support fallback | Keep legal pages; separate platform support from org care support |
| PUB-06 `/organizations` | Search/filter of explicitly published organization projections | loading, no result, unpublished target, degraded directory source | Deferred by BD-6 and absent from safe-launch navigation; composition is retained so the ID is not an unmapped promise |
| ORG-PUB-01 `/o/[orgSlug]` | Organization brand/header; description; specialists; services; locations; contacts/legal; booking/join CTA | draft preview, published, unpublished/404, suspended | New published projection; reuse service/specialist/location cards after ownership audit |
| ORG-PUB-02 `/o/[orgSlug]/book/**` | Branded org summary; service → specialist/location → slot → identity → review → done | empty availability, changed slot, identity collision, payment pending/fail, org unavailable | Reuse current public booking wizard; make org projection and identity resolution explicit |
| ORG-PUB-03 `/join/[exchange]` | Neutral exchange; org summary; masked recipient; OTP/auth; relationship confirmation; first useful destination; install prompt | missing/expired/revoked/replayed/wrong recipient, existing identity, enrollment conflict, delivery recovery | UX-04 STF/PIN/SMS/ERR states; raw token exchanged before authenticated continuation |

## 3. First-run and invitation states on canonical screens

The labels in the first column are UX flow shorthand, not additional target screen IDs or route families. Their
canonical ownership is fixed here and in the master registry in `TARGET_IA.md`.

| ID / candidate route | Composition | State coverage | Notes |
|---|---|---|---|
| `MGMT-SETUP` → MGMT-01 + ACC-02 | Progress checklist: organization basics, specialist binding, booking, first patient, notifications, 2FA/recovery, plan | new, partial, blocked dependency, completed, suspended | Solo owner-specialist lands on CLIN-01 only after binding; non-clinical owner remains on MGMT-01 |
| `MGMT-TEAM` → MGMT-02 | Members and pending invitations; role/capability summary; seats; invite CTA | empty, loading, delivery pending/failed, accepted, revoked, expired, seat blocked | Reuse current clinic members list; do not expose raw reusable token as the primary delivery flow |
| `MGMT-INVITE` → MGMT-02 | Recipient, role, specialist-binding intent, bounded permissions, review, send | duplicate membership, other-active-org conflict, entitlement/seat block, retry/resend | Public acceptance continues through ORG-PUB-03/PUB-04; assistant outcome remains OM-2-safe |
| `CLIN-PAT-INVITE` → CLIN-02/CLIN-03 | Resolve existing identity or create pending relationship; email-first invite; optional SMS attempt; relationship summary; delivery history | invite lifecycle independent from delivery and OTP proof; wrong recipient/revoke/resend; manual-create pending/claimed/conflict | Public acceptance continues through ORG-PUB-03/PUB-04; manual entry never implies recipient proof |
| `ACC-FIRST` → ACC-02 | Password, factor enroll/verify, recovery codes, sessions and step-up | factor unavailable/lost, cooldown, replacement, recovery | Staff target requires complete 2FA mechanics; patient remains passwordless OTP per owner ruling |
| `PAT-INSTALL` → PAT-11 | First useful org screen → contextual install education → browser-specific steps → push prompt later | already installed, unsupported, denied, iOS/browser instructions, subscription degraded | Reuse current install/notification UI; one platform manifest while BD-5 pending |

## 4. Platform administration screens

| ID / route | Composition | States / safety | Current reuse |
|---|---|---|---|
| PLAT-01 `/app/platform` | KPI, lifecycle exceptions, delivery failures, incidents, pending repairs | aggregate empty, degraded source, stale metrics, permission denied | Current analytics/health cards after metric ownership split |
| PLAT-02 `/app/platform/organizations` | Search/filter/list → organization detail: lifecycle, owners, plan, domain/sender health, audit links | no match, suspended/closed, repair pending, restricted detail | SaaS organization/tariff foundations; new shell |
| PLAT-03 `/app/platform/commercial` | Plans/tariffs, usage, billing exceptions and entitlement override history | disabled plan, grace, payment/provider degraded | Existing tariff/store foundations, not current doctor usage alias |
| PLAT-04 `/app/platform/analytics` | Acquisition, activation, patient app, clinical aggregate, content/delivery tabs | date/source empty, privacy threshold, degraded pipeline | Move current global analytics tabs after org/global metric classification |
| PLAT-05 `/app/platform/configuration` | App, auth, integrations, technical modes grouped by risk | secret masked, validation fail, dependency degraded, maintenance confirmation | Move current admin settings clients; keep DB-backed configuration |
| PLAT-06 `/app/platform/catalogs` | Platform references/content/media governance, publication and ownership | ownership unresolved, publish conflict, storage degraded | Split current global-looking catalogs only after data ownership gate |
| PLAT-07 `/app/platform/reliability` | Health, incident archive, operation/registration audit | healthy empty, incident detail, identifier-safe export, retry | Move current system health/archive/audit pages |
| PLAT-08 `/app/platform/identity-repair` | Duplicate/name-match diagnostics, merge review, dry-run/result | PII-restricted, ambiguous match, stale target, rollback/support | Move booking-merge/name hints; strict purpose/audit |
| PLAT-09 `/app/platform/support/[orgId]` | Organization diagnostics and explicit repair actions | purpose required, timed support state, denied clinical section | Pending owner decision; safe default has no ordinary clinical chart |

## 5. Organization management screens

| ID / route | Composition | States / actions | Current reuse |
|---|---|---|---|
| MGMT-01 `/app/manage` | Setup/lifecycle, team, booking, delivery, domain, plan and recent admin actions | first-run, configured, warning/degraded, suspended, billing recovery | Compose current clinic settings/members status plus SaaS summaries |
| MGMT-02 `/app/manage/team/**` | Team list/detail, invitations, capabilities, specialist binding, deactivation preflight | empty, pending invite, multi-membership conflict, seat block, deactivation recovery queue | Current clinic members and invite components |
| MGMT-03 `/app/manage/booking/**` | Services, locations, availability/work plan, public form, payments and attribution | no service/location, invalid schedule, integration fallback, payment degraded | Split current schedule setup + admin booking tabs |
| MGMT-04 `/app/manage/public` | Brand/public profile draft, assets, preview, publish/version history | draft, validation fail, unpublished, published, stale preview | Current patient-home/content preview patterns + new publication object |
| MGMT-05 `/app/manage/domains` | Hostname base list/detail; proof/TLS/routing/base readiness; per-surface bindings; remove/quarantine | every UX-05 base/binding pending/fail/degraded state; canonical fallback always shown | New contract; no current UI claimed as complete |
| MGMT-06 `/app/manage/senders` | Email sender identity/readiness, SMS presentation, push identity and per-attempt effective sender | proof/provider/alignment/bounce fail, fallback/hold under BD-3 | New org surface; platform transport settings remain PLAT-05 |
| MGMT-07 `/app/manage/integrations` | Org calendar and delivery integrations; health and reconnect | disconnected, degraded, revoked, fallback | Split current global integration UI from org connection state |
| MGMT-08 `/app/manage/plan` | Plan, usage, seats, invoices, upgrade/recovery | grace/read-only/blocked, payment fail, owner-only action | SaaS billing/entitlement data; preserve access to recovery |
| MGMT-09 `/app/manage/settings` | Organization profile, terminology, timezone, patient home/care defaults, permission policy | validation, inherited/default, save conflict, permission denied | Split current clinic/settings and mixed `/app/settings` fields |

## 6. Clinical work screens

| ID / route | Composition | Solo / clinic behavior | States / reuse |
|---|---|---|---|
| CLIN-01 `/app/work` | Today header/context; appointments; tasks; signals; care queue; quick actions | Solo omits scope controls; clinic labels own/authorized org widgets | Reuse Today dashboard; loading/empty/partial widget/degraded source; fix principal defect separately |
| CLIN-02 `/app/work/patients` | Search, operational filters, roster/list, optional preview; invite patient | Solo permitted list; clinic `Мои` then capability-gated `Все доступные` | Reuse patients workbench; list/count/search/export parity; no full-org fallback on empty own list |
| CLIN-03 `/app/work/patients/[patientId]` | Care bar; overview, program, visits/history, communications, files, finance/contact; team summary slot | Solo team slot absent; clinic team/primary attribution conditional | Reuse central patient card and tabs; section-specific loading/denial; neutral foreign target |
| CLIN-04 card `History` tab | Authorized timeline; period/type/author filters; event author, specialist, visibility | Solo no redundant own/all; clinic own default, available/all only if granted | Reuse visit/event/program components; private classes filtered server-side before controls |
| CLIN-05 card `Collaboration` + `/app/work/handoffs` | Primary/care-team/work-item state, request/detail, accept/reject/cancel, stale/deactivation queue | Hidden in solo; clinic only if capability/mechanic exists | New state objects required; no generic transfer; entitlement recovery cannot reveal history |
| CLIN-06 `/app/work/schedule` | Calendar/list, own appointments, work plan; object detail/reassign | Solo own schedule; clinic own with separately gated org view | Reuse schedule calendar/KPI; move setup to MGMT-03; empty/no availability/integration degraded |
| CLIN-07 `/app/work/communications` | Threads, intake, comments and broadcasts as capability-gated tabs | Clinic organization attribution and send scope | Reuse communications shell; split non-clinical/clinical classes; delivery partial/fail states |
| CLIN-08 patient card/program routes | Assignment builder, program instance, tests/results, discussion and named work-item assignment | Attribution and visibility always explicit | Reuse treatment program templates and patient program components |
| CLIN-09 `/app/work/library/**` | Source-scoped catalog hub: exercises, complexes, tests, sets, recommendations, templates | Same components; only allowed platform/org/private assets | Reuse catalog master-detail/editors; ownership unknown is a blocking state, not global fallback |
| CLIN-10 `/app/work/content/**` | Content hub, sections, patient-home/motivation, media, courses | Org/private/platform source labels | Reuse CMS/media/course components after ownership split; storage/delete diagnostics move PLAT-06 / PLAT-07 |
| CLIN-11 `/app/work/analytics` | Schedule/care/content metrics for authorized organization | Solo own practice; clinic explicit own/team aggregate | Reuse material ratings/analytics primitives after metric scope contract |

### Patient card decision-safe composition

The screen shell assumes one organization enrollment identity because that is the recommended candidate, but the
following panels remain gated pending OM-4/5:

- `Overview`: demographics and scheduling already authorized to the actor;
- `History`: own/assigned entries only by safe default;
- `All available` and `Specialist X`: controls are absent until shared-read capability and entry visibility exist;
- `Private entry`: never inferred from organization membership or entitlement;
- alternative per-specialist cards: no target route is allocated; if owner rejects one-card, UX-06 must be revised
  before implementation rather than creating duplicate routes ad hoc.

## 7. Assistant screens

| ID / route | Composition | Safe state until OM-2 |
|---|---|---|
| OPS-01 `/app/ops` | Assigned operational queue and status cards | Only explicit tasks; no patient clinical summary |
| OPS-02 `/app/ops/schedule` | Permitted appointment list/detail and named actions | Deny ungranted writes; no clinical notes |
| OPS-03 `/app/ops/intake` | Intake and administrative patient contact/invite lifecycle | Minimum demographics/contact fields; direct clinical routes forbidden |
| OPS-04 `/app/ops/messages` | Explicitly non-clinical templates/threads if granted | Surface absent by default, not an empty doctor chat |

## 8. Patient screens

| ID / route | Composition | Context / state behavior | Current reuse |
|---|---|---|---|
| PAT-01 `/app/patient/organizations` | Relationship list/chooser, current indicator, unavailable relationships and join entry | Zero/one/many; invalid preference → chooser; deep-link proposal verified and visible | New composition over enrollment list |
| PAT-02 `/app/patient` | Organization badge/switcher, next appointment, current program/action, reminders, attributed care contact | No data from previous context during load; suspended/revoked recovery | Reuse patient Today after organization-principal fix |
| PAT-03 `/app/patient/treatment/**` | Program list/detail/item, progress, source specialist/organization | Direct object resolves org before context switch; missing entitlement does not erase retained program | Keep current treatment pages/components |
| PAT-04 `/app/patient/booking/**` | Upcoming/history plus new/reschedule wizard | Active org or trusted booking context; service/location/specialist visible throughout | Keep canonical `/new/**`; retire alias steps after deep-link census |
| PAT-05 `/app/patient/messages/**` | Thread list/detail plus service-notification activity | Organization first, explicit author and reply recipient; no hard-coded specialist | Split current chat and notification chromes into one inbox model |
| PAT-06 `/app/patient/progress/**` | Diary, symptom/rehab journals, reminders and completion history | Organization/program attribution; no cross-org raw aggregate | Move current diary/reminders under one information group; compatibility redirects |
| PAT-07 `/app/patient/benefits/**` | Purchases, packages/memberships, payment continuation | Group/filter by organization; never mix entitlements | Merge current purchases/memberships/payment surfaces |
| PAT-08 `/app/patient/content/**` | Help, sections, content, courses | Published/source attribution; inaccessible content not-found | Reuse current CMS renderers; retire navigation aliases |
| PAT-09 `/app/patient/organization` | Care team, location/contact, org support and disclosures | Active organization only; platform support remains global | Merge current about/address and organization support projection |
| PAT-10 `/app/patient/profile` | Global identity, security/recovery and organization relationships | Relationship list is not a clinical aggregate | Keep current profile; split account/global preferences cleanly |
| PAT-11 `/app/patient/notifications` | Global channel consent, topic preferences, optional org preferences; install entry | Permission denied, unsupported, unsubscribed, sender degraded | Merge settings/install entry; reuse notification and PWA controls |

## 9. Personal staff account screens

| ID / route | Composition | Boundary |
|---|---|---|
| ACC-01 `/app/account/profile` | Name, contact and locale/timezone personal fields | Never stores organization defaults |
| ACC-02 `/app/account/security` | Password, factors, recovery, sessions and high-risk step-up | Shared across staff surfaces; server-authorized |
| ACC-03 `/app/account/notifications` | Personal staff channels/topics | Organization delivery defaults remain MGMT-09 |
| ACC-04 `/app/account/install` | Staff PWA status/instructions | Platform staff app by safe BD-4 default |

## 10. Cross-screen state checklist

Every implementation spec derived from this document must explicitly select and test applicable rows:

| Class | Required variants |
|---|---|
| Data | initial loading, refresh, legal empty, partial section failure, retryable error |
| Relationship | unauthenticated, onboarding, no membership/enrollment, multiple staff memberships fail-closed, revoked/suspended context |
| Permission | visible+allowed, visible read-only, neutral denied/direct URL, list/count/search/export parity |
| Entitlement | enabled, grace, read-only, blocked/upgrade, recovery owner unavailable |
| Invite | created, delivery pending/sent/failed, proof pending/verified, accepted, expired/revoked/replayed/wrong-recipient |
| Handoff | request, pending, accepted/completed, rejected, cancelled, expired, source/destination deactivated |
| Domain/sender | proof/TLS/routing/binding readiness, canonical fallback, sender fallback/hold, removal/quarantine |
| Install/push | unsupported, installable, installed, permission default/denied/granted, subscribed/degraded/revoked |

## 11. UX-07 prototype handoff

Prototype canonical screen compositions, not every CRUD page. UX-04 IDs below are state/flow references, never
additional UX-06 screen identities. Every flow includes its named recovery branches.

| Priority flow | UX-04 state trace | Canonical UX-06 screen trace | Required recovery / boundary |
|---|---|---|---|
| Solo signup and first-run | ACQ-01…ACQ-05 | PUB-01 → PUB-03 → MGMT-01/ACC-02 → CLIN-01 | signup disabled, duplicate/expired challenge, partial provisioning, binding pending, factor recovery; specialist-first desktop/mobile hierarchy |
| Staff invite | STF-01…STF-08 + ERR-01…07 as applicable | MGMT-02 → ORG-PUB-03/PUB-04 → ACC-02 → CLIN-01 or MGMT-01 or OPS-01 | delivery axis separate from relationship, expired/wrong account/other-org/seat block, assistant safe default |
| Patient email invite, install and push | PIN-01…PIN-09 + ERR-01…07 | CLIN-02/CLIN-03 → ORG-PUB-03/PUB-04 → PAT-02 → PAT-11 | wrong recipient, terminal replay, no duplicate enrollment, first value before install, installed re-auth and push recovery |
| SMS fallback branch | SMS-01…SMS-03 over PIN-01…PIN-05 | CLIN-02/CLIN-03 invite flow → ORG-PUB-03/PUB-04 | transport-only branch of the same invite; email proof remains required; suppressed/rate-limited/terminal states and no SMS auth elevation |
| Public booking to patient app | PBK-01…PBK-08 | ORG-PUB-01 → ORG-PUB-02 → PUB-04 when proof is needed → PAT-04 exact appointment → PAT-11 after value | invalid/unpublished org, no catalog/slots, slot conflict, payment/review, signed continuation, ambiguous identity, atomic enrollment/object authorization |
| Returning multi-org patient | MOR-01…MOR-05 | PUB-04 → PAT-01 → PAT-02 and target PAT-03/04/05 object | zero/one/many, revoked remembered context, visible trusted deep-link context change, no cached cross-org data |

Additional UX-06 validation flows remain mandatory:

1. CLIN-01 ↔ MGMT-01 for owner/admin + specialist, including the MGMT-01 landing for a non-clinical owner.
2. MGMT-04 → MGMT-05 custom-domain setup with canonical fallback and one degraded surface binding while siblings
   remain active.
3. CLIN-03 / CLIN-04 / CLIN-05 clinic patient card with the safe own-history default and visibly unavailable
   shared-history/handoff alternatives until OM-4…7 rulings.

Visual direction starts only after low-fidelity task flow validates context, hierarchy, denial/recovery and mobile
navigation. Current CRUD editors use the existing template system and do not need bespoke wireframes.
