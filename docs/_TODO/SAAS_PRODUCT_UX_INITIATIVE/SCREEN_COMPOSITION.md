# UX-06 — Target screen composition

**Статус:** latest owner clarifications integrated; awaiting full independent audit. Canonical registry remains
`57/57`; previous UX-06 PASS is a historical pre-ruling baseline.
**Authority:** производная composition; `OWNER_RULINGS_2026-07-16.md` имеет product/UX приоритет.
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
- `/app/ops/**` — reserved future namespace only; absent from launch navigation and routing;
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
| ORG-PUB-01 `/[orgSlug]` | Organization brand/header; logo/avatar; description; specialists; services; locations; contacts/legal; booking/join CTA | draft preview, published, unpublished/404, suspended | New published projection; reuse service/specialist/location cards after ownership audit; reserve static platform paths before slug claim |
| ORG-PUB-02 `/[orgSlug]/booking/**` | Branded org summary; service → specialist/location → slot → identity → review → done; `/widget` is the embed-safe iframe surface | empty availability, changed slot, identity collision, payment pending/fail, org unavailable | Reuse current public booking wizard; `/book/[slug]` compatibility redirect; inline/modal loader shares this engine |
| ORG-PUB-03 `/join/[exchange]` | Neutral exchange; org summary; masked recipient; OTP/auth; relationship confirmation; first useful destination; install prompt | missing/expired/revoked/replayed/wrong recipient, existing identity, enrollment conflict, delivery recovery | UX-04 STF/PIN/SMS/ERR states; raw token exchanged before authenticated continuation |

## 3. First-run and invitation states on canonical screens

The labels in the first column are UX flow shorthand, not additional target screen IDs or route families. Their
canonical ownership is fixed here and in the master registry in `TARGET_IA.md`.

| ID / candidate route | Composition | State coverage | Notes |
|---|---|---|---|
| `MGMT-SETUP` → MGMT-01 + ACC-02 | Progress checklist: organization basics, specialist binding, booking, first patient, notifications, 2FA/recovery, plan | new, partial, blocked dependency, completed, suspended | Solo owner-specialist lands on CLIN-01 only after binding; non-clinical owner remains on MGMT-01 |
| `MGMT-TEAM` → MGMT-02 | Historical future-team state shorthand | Deferred; no initial states | Reserved for a later clinic contract |
| `MGMT-INVITE` → MGMT-02 | Historical future-staff invite shorthand | Deferred; no initial states | Reserved for a later clinic contract; no role/grant is frozen |
| `CLIN-PAT-INVITE` → CLIN-02/CLIN-03 | Create card/relationship + scheduled or walk-in visit; optional email-first portal invite and SMS attempt; link verified identity later | created/not-activated/invited/linked; delivery remains independent from proof; duplicate/conflict/revoke/resend | Manual relationship exists before portal activation; delivery never implies proof/access |
| `ACC-FIRST` → ACC-02 | Password, factor enroll/verify, recovery codes, sessions and step-up | factor unavailable/lost, cooldown, replacement, recovery | Staff target requires complete 2FA mechanics; patient remains passwordless OTP per owner ruling |
| `PAT-INSTALL` → PAT-11 | First useful org screen → contextual install education → browser-specific steps → push prompt later | already installed, unsupported, denied, iOS/browser instructions, subscription degraded | Initial release uses platform app; future branded org PWA may be generated from verified origin/name/logo settings; separate native org app is out of scope |

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
| PLAT-08 `/app/platform/identity-integrity` | Aggregate identity-integrity signals and invite/registration system failures | aggregate empty, degraded source, thresholded anomaly, support report | No patient list/profile lookup, merge, name-match review or patient-record mutation |
| PLAT-09 `/app/platform/support/[orgId]` | Organization/platform diagnostics, support reports and escalation | purpose required; no clinical section or patient-record mutation | Patient browsing/session/repair rejected; platform fixes system/code defects |

## 5. Organization management screens

| ID / route | Composition | States / actions | Current reuse |
|---|---|---|---|
| MGMT-01 `/app/manage` | Setup/lifecycle, booking, delivery, domain, plan and recent admin actions | first-run, configured, warning/degraded, suspended, billing recovery | Compose solo-launch settings/status plus SaaS summaries; no Team entry |
| MGMT-02 future `/app/manage/team/**` | No initial composition | Absent from solo launch | Registry reservation; current clinic-member components are not a launch migration commitment |
| MGMT-03 `/app/manage/booking/**` | Services, locations, availability/work plan, public form, payments and attribution | no service/location, invalid schedule, integration fallback, payment degraded | Split current schedule setup + admin booking tabs |
| MGMT-04 `/app/manage/public` | Brand/public profile draft, assets, preview, publish/version history | draft, validation fail, unpublished, published, stale preview | Current patient-home/content preview patterns + new publication object |
| MGMT-05 `/app/manage/domains` | Hostname base list/detail; proof/TLS/routing/base readiness; per-surface bindings; remove/quarantine | every UX-05 base/binding pending/fail/degraded state; canonical fallback always shown | New contract; no current UI claimed as complete |
| MGMT-06 `/app/manage/senders` | Email sender identity/readiness, SMS presentation, push identity and per-attempt effective sender | proof/provider/alignment/bounce fail; hold/retry/expire and owner incident under BD-3, with no configured-channel platform fallback | New org surface; platform transport settings remain PLAT-05 |
| MGMT-07 `/app/manage/integrations` | Org calendar and delivery integrations; health and reconnect | disconnected, degraded, revoked, fallback | Split current global integration UI from org connection state |
| MGMT-08 `/app/manage/plan` | Plan, usage, seats, invoices, upgrade/recovery | grace/read-only/blocked, payment fail, owner-only action | SaaS billing/entitlement data; preserve access to recovery |
| MGMT-09 `/app/manage/settings` | Organization profile, terminology, timezone, patient home/care defaults, permission policy | validation, inherited/default, save conflict, permission denied | Split current clinic/settings and mixed `/app/settings` fields |

## 6. Clinical work screens

| ID / route | Composition | Solo / clinic behavior | States / reuse |
|---|---|---|---|
| CLIN-01 `/app/work` | Today header/context; appointments; tasks; signals; care queue; quick actions | Solo omits scope controls; clinic labels own/authorized org widgets | Reuse Today dashboard; loading/empty/partial widget/degraded source; fix principal defect separately |
| CLIN-02 `/app/work/patients` | Search, operational filters, roster/list, manual create card+scheduled/walk-in visit, optional portal invite | Solo permitted list; clinic `Мои` from actual/scheduled visit relation, then capability-gated `Все доступные` | Reuse patients workbench/calendar; list/count/search/export parity; no full-org fallback on empty own list |
| CLIN-03 `/app/work/patients/[patientId]` | One org card: overview, program, visits/history, communications, files, finance/contact; portal-link status | Solo launch card; future clinic visibility may use visit relation; no hierarchy slot | Reuse central patient card and tabs; section-specific loading/denial; neutral foreign target |
| CLIN-04 card `History` tab | Authorized timeline; period/type/author filters; event author, specialist, visibility | Solo no redundant own/all; clinic own default, available/all only if granted | Reuse visit/event/program components; private classes filtered server-side before controls |
| CLIN-05 reserved `Future clinic visit coordination` | No initial composition | Absent in solo launch; exact future clinic permissions/UI deferred | Registry reservation only; any future implementation reuses ordinary appointments and requires a new contract |
| CLIN-06 `/app/work/schedule` | Calendar/list, own appointments, work plan; object detail/reassign | Solo own schedule; clinic own with separately gated org view | Reuse schedule calendar/KPI; move setup to MGMT-03; empty/no availability/integration degraded |
| CLIN-07 `/app/work/communications` | Threads, intake, comments and broadcasts as capability-gated tabs | Clinic organization attribution and send scope | Reuse communications shell; split non-clinical/clinical classes; delivery partial/fail states |
| CLIN-08 patient card/program routes | Assignment builder, program instance, tests/results, discussion and named work-item assignment | Attribution and visibility always explicit | Reuse treatment program templates and patient program components |
| CLIN-09 `/app/work/library/**` | Source-scoped catalog hub: exercises, complexes, tests, sets, recommendations, templates | Same components; only allowed platform/org/private assets | Reuse catalog master-detail/editors; ownership unknown is a blocking state, not global fallback |
| CLIN-10 `/app/work/content/**` | Content hub, sections, patient-home/motivation, media, courses | Org/private/platform source labels | Reuse CMS/media/course components after ownership split; storage/delete diagnostics move PLAT-06 / PLAT-07 |
| CLIN-11 `/app/work/analytics` | Schedule/care/content metrics for authorized organization | Solo own practice; clinic explicit own/team aggregate | Reuse material ratings/analytics primitives after metric scope contract |

### Patient card decision-safe composition

The screen shell uses the owner-approved one organization card and visit-based specialist relation:

- `Overview`: demographics and scheduling already authorized to the actor;
- `History`: own events by default;
- `All available` and `Specialist X`: available only after shared-read capability and entry visibility;
- `Private entry`: never inferred from organization membership or entitlement;
- alternative per-specialist cards and separate patient hierarchy models are rejected; no duplicate route is allocated.

## 7. Assistant screens — deferred future

| ID / route | Composition | Current state |
|---|---|---|
| OPS-01 `/app/ops` | Reserved future operations home | Not initial release |
| OPS-02 `/app/ops/schedule` | Reserved future schedule | Not initial release |
| OPS-03 `/app/ops/intake` | Reserved future intake/contact | Not initial release |
| OPS-04 `/app/ops/messages` | Reserved future configurable routing | Not initial release; no current design or pending owner gate |

## 8. Patient screens

| ID / route | Composition | Context / state behavior | Current reuse |
|---|---|---|---|
| PAT-01 `/app/patient/organizations` | Relationship list/chooser, current indicator, unavailable relationships and join entry | Platform app: last active + visible switcher; invalid preference → chooser; deep-link verified | New composition over enrollment list; future org-specific app is pinned without switcher |
| PAT-02 `/app/patient` | Organization badge/switcher, next appointment, current program/action, reminders, attributed care contact | No data from previous context during load; suspended/revoked recovery | Reuse patient Today after organization-principal fix |
| PAT-03 `/app/patient/treatment/**` | Program list/detail/item, progress, source specialist/organization | Direct object resolves org before context switch; missing entitlement does not erase retained program | Keep current treatment pages/components |
| PAT-04 `/app/patient/booking/**` | Upcoming/history plus new/reschedule wizard | Active org or trusted booking context; service/location/specialist visible throughout | Keep canonical `/new/**`; retire alias steps after deep-link census |
| PAT-05 `/app/patient/messages/**` | Current solo-specialist chat for initial release | Existing authorized conversation behavior; organization/author context remains truthful | Keep current chat; future clinic topology is configurable and deferred |
| PAT-06 `/app/patient/progress/**` | Diary, symptom/rehab journals, reminders and completion history | Organization/program attribution; no cross-org raw aggregate | Move current diary/reminders under one information group; compatibility redirects |
| PAT-07 `/app/patient/benefits/**` | Purchases, packages/memberships, payment continuation | Group/filter by organization; never mix entitlements | Merge current purchases/memberships/payment surfaces |
| PAT-08 `/app/patient/content/**` | Help, sections, content, courses | Published/source attribution; inaccessible content not-found | Reuse current CMS renderers; retire navigation aliases |
| PAT-09 `/app/patient/organization` | Specialists from actual patient visits, location/contact, org support and disclosures | Active organization only; platform support remains global | Merge current about/address and organization support projection; no separate hierarchy |
| PAT-10 `/app/patient/profile` | Global identity, security/recovery and organization relationships | Relationship list is not a clinical aggregate | Keep current profile; split account/global preferences cleanly |
| PAT-11 `/app/patient/notifications` | Global channel consent, topic preferences, optional org preferences; install entry | Permission denied, unsupported, unsubscribed, sender degraded | Merge settings/install entry; reuse notification and PWA controls |

## 9. Personal staff account screens

| ID / route | Composition | Boundary |
|---|---|---|
| ACC-01 `/app/account/profile` | Name, contact and locale/timezone personal fields | Never stores organization defaults |
| ACC-02 `/app/account/security` | Password, factors, recovery, sessions and high-risk step-up | Shared across staff surfaces; server-authorized |
| ACC-03 `/app/account/notifications` | Personal staff channels/topics | Organization delivery defaults remain MGMT-09 |
| ACC-04 `/app/account/install` | Staff PWA status/instructions | Platform staff app at launch; future branded org PWA keeps shared layout/design |

## 10. Cross-screen state checklist

Every implementation spec derived from this document must explicitly select and test applicable rows:

| Class | Required variants |
|---|---|
| Data | initial loading, refresh, legal empty, partial section failure, retryable error |
| Relationship | unauthenticated, onboarding, no membership/enrollment, multiple staff memberships fail-closed, revoked/suspended context |
| Permission | visible+allowed, visible read-only, neutral denied/direct URL, list/count/search/export parity |
| Entitlement | enabled, grace, read-only, blocked/upgrade, recovery owner unavailable |
| Invite | created, delivery pending/sent/failed, proof pending/verified, accepted, expired/revoked/replayed/wrong-recipient |
| Future clinic another-specialist visit | Not a launch state; define ordinary appointment states only after future clinic scope approval |
| Domain/sender | proof/TLS/routing/binding readiness, safe domain entry fallback, configured custom email/SMS channel has no same-channel platform fallback, bounded retry only within `expires_at`, owner in-app/service-email incident without patient content, removal/quarantine |
| Install/push | unsupported, installable, installed, permission default/denied/granted, subscribed/degraded/revoked |

## 11. UX-07 prototype handoff

Prototype canonical screen compositions, not every CRUD page. UX-04 IDs below are state/flow references, never
additional UX-06 screen identities. Every flow includes its named recovery branches.

| Priority flow | UX-04 state trace | Canonical UX-06 screen trace | Required recovery / boundary |
|---|---|---|---|
| Solo signup and first-run | ACQ-01…ACQ-05 | PUB-01 → PUB-03 → MGMT-01/ACC-02 → CLIN-01 | signup disabled, duplicate/expired challenge, partial provisioning, binding pending, factor recovery; specialist-first desktop/mobile hierarchy |
| Historical staff invite | STF-01…STF-08 + ERR-01…07 as applicable | Future MGMT-02/ORG-PUB-03/PUB-04/ACC-02 | Deferred pre-ruling prototype trace; absent from initial release |
| Manual patient, optional portal link, install and push | PIN-01…PIN-09 + ERR-01…07 | CLIN-02/CLIN-03/CLIN-06 → optional ORG-PUB-03/PUB-04 → PAT-02 → PAT-11 | scheduled or walk-in visit exists before portal identity; wrong recipient, terminal replay, no duplicate card, first value before deferred install/push channel |
| SMS fallback branch | SMS-01…SMS-03 over PIN-01…PIN-05 | CLIN-02/CLIN-03 invite flow → ORG-PUB-03/PUB-04 | transport-only branch of the same invite; email proof remains required; suppressed/rate-limited/terminal states and no SMS auth elevation |
| Public booking to patient app | PBK-01…PBK-08 | ORG-PUB-01 → ORG-PUB-02 → PUB-04 when proof is needed → PAT-04 exact appointment → PAT-11 after value | invalid/unpublished org, no catalog/slots, slot conflict, payment/review, signed continuation, ambiguous identity, atomic enrollment/object authorization |
| Returning multi-org patient | MOR-01…MOR-05 | PUB-04 → PAT-01 → PAT-02 and target PAT-03/04/05 object | zero/one/many, revoked remembered context, visible trusted deep-link context change, no cached cross-org data |

Additional UX-06 validation flows remain mandatory:

1. CLIN-01 ↔ MGMT-01 for owner/admin + specialist, including the MGMT-01 landing for a non-clinical owner.
2. MGMT-04 → MGMT-05 custom-domain setup with canonical fallback and one degraded surface binding while siblings
   remain active.
3. CLIN-03 / CLIN-04 patient card with own-history default, authorized all-history and specialist filters;
   reserved CLIN-05 future clinic visit coordination is explicitly absent from launch.

Visual direction starts only after low-fidelity task flow validates context, hierarchy, denial/recovery and mobile
navigation. Current CRUD editors use the existing template system and do not need bespoke wireframes.
