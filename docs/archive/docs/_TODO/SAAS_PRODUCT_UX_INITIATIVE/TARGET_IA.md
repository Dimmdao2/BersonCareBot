# UX-06 — Target information architecture

**Статус:** latest owner clarifications integrated; awaiting full independent audit. Registry remains `57/57`.
U0 current-source reconciliation on 2026-07-19 updated the route denominator to `152/152`; the previous UX-06
`150/150` PASS is a historical pre-ruling/pre-drift baseline.
**Authority:** производная IA; `OWNER_RULINGS_2026-07-16.md` побеждает прежние candidate/prototype assumptions.
**Scope:** logical IA and navigation contract; this is not an implementation route freeze.
**Inputs:** dated UX owner rulings first; UX-01 factual inventory and UX-02 patterns; corrected UX-03…05 contracts.
Earlier UX-03…05 audits are historical pre-ruling evidence, not authority for changed assumptions.

## 1. Rules that shape the IA

1. `Organization` is the workspace. Solo practice and clinic are compositions of the same workspace, not separate
   account types.
2. Staff has one active organization. There is no staff organization switcher. A patient may have several active
   enrollments and switches only between those server-authorized contexts.
3. Staff navigation is assembled from capabilities, specialist binding, organization shape and entitlement state.
   Membership labels and hidden menu items are not authorization.
4. Global platform operations, organization management, clinical work and personal account are separate surfaces.
   An owner/admin who is also a specialist uses one login and one organization context; switching surface does not
   elevate privileges or require a second login.
5. Clinical data is authorized before presentation filters are applied. `Мои`, `Вся доступная история` and a
   specialist filter never broaden list, count, search, export or direct-read scope.
6. Public Host, slug, custom domain, invite URL and brand presentation may resolve an entry candidate but never
   authorize an organization relationship.
7. The target reuses current patient and staff component families. It does not create parallel solo/clinic or
   per-specialist patient route trees.
8. Worker, integrator, scheduler, media and cron remain system actors without a user-facing cabinet. Their health,
   delivery and recovery states surface only through PLAT-07 or a bounded organization status panel.

## 2. Product surface map

```text
Platform public
├── Specialist-oriented landing
├── Product / pricing / demo / specialist signup
├── Staff login
├── Patient «invited / sign in» entry
└── Legal / support / status

Published organization surface
├── Organization profile
├── Services, specialists and locations
├── Public booking
└── Trusted join projection

Authenticated staff workspace — one organization
├── Clinical work              specialist binding + clinical capability
├── Organization management   owner/admin/delegated capability
└── Account                   every staff identity

Reserved future clinic workspace IDs (not launch navigation)
└── Operations                future assistant/receptionist reservation; outside current scope

Patient app — one global identity
├── Organization context resolver / chooser
├── Organization-scoped care surfaces
└── Global account, consent, security and support

Platform administration
├── Organizations / commercial lifecycle
├── Platform configuration and catalogs
├── Aggregate analytics and health
└── Purpose-specific support and platform diagnostics
```

## 2.1 Master target screen-ID registry

This is the only UX-06 identity registry. An ID in the first column is a canonical target screen/group and must have
a composition in `SCREEN_COMPOSITION.md`, or the explicit deferred reason shown here. Names in the alias table below
are flow/state labels only and must never be used as a second route or screen identity.

| Canonical ID | Target screen/group                     | Composition status                                                              |
| ------------ | --------------------------------------- | ------------------------------------------------------------------------------- |
| PUB-01       | Platform landing                        | composed                                                                        |
| PUB-02       | Product and pricing                     | composed                                                                        |
| PUB-03       | Specialist signup                       | composed                                                                        |
| PUB-04       | Login and recovery                      | composed                                                                        |
| PUB-05       | Legal / support / status                | composed                                                                        |
| PUB-06       | Published-organization directory        | deferred by owner ruling 2026-07-16; absent from initial navigation             |
| ORG-PUB-01   | Organization profile                    | composed                                                                        |
| ORG-PUB-02   | Public booking                          | composed                                                                        |
| ORG-PUB-03   | Trusted join                            | composed                                                                        |
| PLAT-01      | Platform overview                       | composed                                                                        |
| PLAT-02      | Organizations                           | composed                                                                        |
| PLAT-03      | Commercial                              | composed                                                                        |
| PLAT-04      | Platform analytics                      | composed                                                                        |
| PLAT-05      | Platform configuration                  | composed                                                                        |
| PLAT-06      | Catalog governance                      | composed                                                                        |
| PLAT-07      | Reliability                             | composed                                                                        |
| PLAT-08      | Platform identity-integrity diagnostics | composed without patient browsing or mutation                                   |
| PLAT-09      | Support reports and escalation          | composed without patient browsing/repair; patient-intervention premise rejected |
| MGMT-01      | Organization overview and setup         | composed                                                                        |
| MGMT-02      | Future team, access and invitations     | reserved/deferred; absent from initial solo release                             |
| MGMT-03      | Booking setup                           | composed                                                                        |
| MGMT-04      | Public page and brand                   | composed                                                                        |
| MGMT-05      | Domains                                 | composed                                                                        |
| MGMT-06      | Senders                                 | composed                                                                        |
| MGMT-07      | Channels and integrations               | composed                                                                        |
| MGMT-08      | Plan, usage and billing                 | composed                                                                        |
| MGMT-09      | Organization settings                   | composed                                                                        |
| CLIN-01      | Clinical Today                          | composed                                                                        |
| CLIN-02      | Patients                                | composed                                                                        |
| CLIN-03      | Patient card                            | composed                                                                        |
| CLIN-04      | Patient history                         | composed as a CLIN-03 tab/state                                                 |
| CLIN-05      | Future clinic visit coordination        | reserved/deferred; absent from initial release                                  |
| CLIN-06      | Schedule                                | composed                                                                        |
| CLIN-07      | Communications                          | composed                                                                        |
| CLIN-08      | Programs                                | composed through patient-card/program detail                                    |
| CLIN-09      | Clinical library                        | composed                                                                        |
| CLIN-10      | Content and media                       | composed                                                                        |
| CLIN-11      | Organization clinical analytics         | composed                                                                        |
| OPS-01       | Future operations home                  | deferred; assistant/receptionist not initial scope                              |
| OPS-02       | Future operations schedule              | deferred; assistant/receptionist not initial scope                              |
| OPS-03       | Future intake and patient contact       | deferred; assistant/receptionist not initial scope                              |
| OPS-04       | Future non-clinical messages            | deferred; assistant/receptionist not initial scope                              |
| PAT-01       | Organization resolver / chooser         | composed                                                                        |
| PAT-02       | Patient Today                           | composed                                                                        |
| PAT-03       | Treatment                               | composed                                                                        |
| PAT-04       | Booking                                 | composed                                                                        |
| PAT-05       | Inbox                                   | composed                                                                        |
| PAT-06       | Progress                                | composed                                                                        |
| PAT-07       | Benefits and payments                   | composed                                                                        |
| PAT-08       | Content and help                        | composed                                                                        |
| PAT-09       | Organization details                    | composed                                                                        |
| PAT-10       | Profile and security                    | composed                                                                        |
| PAT-11       | Notifications and install               | composed                                                                        |
| ACC-01       | Staff profile                           | composed; shared from every staff surface                                       |
| ACC-02       | Staff security                          | composed; shared from every staff surface                                       |
| ACC-03       | Staff notifications                     | composed; shared from every staff surface                                       |
| ACC-04       | Staff install                           | composed; shared from every staff surface                                       |

### Non-canonical aliases and UX-04 state IDs

| Alias / family                                                | Classification                             | Canonical UX-06 destination                                                      |
| ------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| `MGMT-SETUP`                                                  | first-run state/flow label                 | MGMT-01, with security steps in ACC-02                                           |
| `MGMT-TEAM`                                                   | historical future shorthand                | Deferred MGMT-02 only                                                            |
| `MGMT-INVITE`                                                 | historical future create/detail shorthand  | Deferred MGMT-02; no launch acceptance flow                                      |
| `CLIN-PAT-INVITE`                                             | action/flow, not a screen ID               | CLIN-02 or CLIN-03; public acceptance continues through ORG-PUB-03/PUB-04        |
| `ACC-FIRST`                                                   | first-run state label                      | ACC-02                                                                           |
| `PAT-INSTALL`                                                 | install/push state label                   | PAT-11                                                                           |
| `OPS-05`                                                      | obsolete assistant-owned alias             | ACC-01…ACC-04 shared account destinations; no `/app/ops/account` duplicate       |
| `ORG-PUB-04`                                                  | unavailable/degraded state label           | State of ORG-PUB-01, ORG-PUB-02 or ORG-PUB-03 according to the failed projection |
| `ACQ-*`, `STF-*`, `PIN-*`, `SMS-*`, `PBK-*`, `MOR-*`, `ERR-*` | UX-04 journey/state IDs, not UX-06 screens | Mapped to canonical IDs in the UX-07 handoff table in `SCREEN_COMPOSITION.md`    |

## 3. Platform public IA

| ID     | Surface                  | Primary purpose                                              | Primary actor / CTA                                                          |
| ------ | ------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| PUB-01 | Platform landing         | Explain specialist/clinic value, product workflow and trust  | Specialist: start practice, clinic: request demo; patient entry is secondary |
| PUB-02 | Product and pricing      | Capabilities, package comparison, FAQ, demo                  | Specialist/clinic; exact packaging remains a commercial gate                 |
| PUB-03 | Specialist signup        | One entry with `solo practice` / `clinic` composition choice | Future owner; creates organization + owner membership, then binding/setup    |
| PUB-04 | Login and recovery       | Staff email/password; patient passwordless entry; recovery   | Identity-specific routes, no persona mutation from query parameters          |
| PUB-05 | Legal / support / status | Platform operator disclosures and recovery channels          | Any visitor; organization disclosures appear where relevant                  |
| PUB-06 | Directory                | Search published organizations                               | **Deferred by owner ruling 2026-07-16**; do not show an empty directory      |

`PUB-01` is specialist-oriented. The patient CTA is compact: «У меня есть приглашение» / «Войти». Patient free
registration is not presented as the hero path. Public acquisition remains platform-branded; future organization-
specific surfaces do not replace it.

## 4. Published organization IA

| ID                            | Surface                                                            | Composition                                                                                           | Context and fallback                                                                                             |
| ----------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| ORG-PUB-01                    | Organization profile                                               | Identity, services, specialists, locations, contacts and legally reviewed information                 | Published projection by stable platform slug; custom domain is an alias                                          |
| ORG-PUB-02                    | Booking                                                            | Organization identity → service → optional specialist/location → slot → identity proof → confirmation | Organization comes from published service/booking objects, not client input; canonical platform URL always works |
| ORG-PUB-03                    | Join                                                               | Neutral token exchange → organization summary → recipient proof → relationship confirmation           | No private data before proof; expired/revoked/wrong-recipient use neutral recovery                               |
| State: unavailable projection | State of the affected ORG-PUB-01/02/03 screen, not a fourth screen | Unpublished/suspended/domain-degraded state                                                           | Canonical fallback, support/recovery owner and no cross-organization leakage                                     |

Initial public composition: profile + booking + join on the stable platform alias; directory later. Future custom
domain/subdomain entry/auth/generated org PWA is an approved post-launch capability; it waits only for future
commercial/implementation activation and readiness, not another owner product decision. No custom origin/PWA is
assumed in initial release.

## 5. Platform administration IA

Platform administration uses a separate shell and route namespace. It is never an expanded clinical sidebar.

| ID      | Navigation group               | Screens                                                                 | Boundary                                                                             |
| ------- | ------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| PLAT-01 | Overview                       | Platform KPI, organization lifecycle exceptions, delivery/health alerts | Aggregate operational facts, no ordinary chart browsing                              |
| PLAT-02 | Organizations                  | Search, organization detail, lifecycle, entitlement/tariff assignment   | Explicit platform capability and target organization                                 |
| PLAT-03 | Commercial                     | Plans, tariffs, usage, billing exceptions                               | Contract actions audited; no clinical authority implied                              |
| PLAT-04 | Analytics                      | Acquisition, activation, use, delivery and content aggregates           | Aggregation and privacy thresholds defined per metric                                |
| PLAT-05 | Configuration                  | Auth, platform integrations, notification topics, platform defaults     | DB-backed settings and secret-safe states                                            |
| PLAT-06 | Catalog governance             | True platform references/content/media and publication                  | Only after ownership split; org assets do not become global by relocation            |
| PLAT-07 | Reliability                    | Current health, incident archive, audit log                             | Sensitive identifiers minimized; remediation is purpose-specific                     |
| PLAT-08 | Identity-integrity diagnostics | Aggregate integrity signals and invite/registration system failures     | No patient list, profile lookup, merge, name-match review or patient-record mutation |
| PLAT-09 | Support reports and escalation | Organization/platform diagnostics and support reports                   | No patient browsing/session or patient-record repair; system/code defects only       |

Desktop: persistent platform sidebar, page header and dense workbench. Mobile: top bar + full-height navigation
drawer; operational tables become cards/detail routes. Platform administration is desktop-first but must preserve
all denial, recovery and emergency actions on mobile.

## 6. Organization management IA

| ID      | Navigation group          | Screens / actions                                                         | Who sees it                                                                          |
| ------- | ------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| MGMT-01 | Overview                  | Setup checklist, operational status, booking/channel/domain warnings      | Owner/admin; first destination for non-clinical owner/admin                          |
| MGMT-02 | Future team and access    | No initial composition                                                    | Reserved ID; excluded from launch navigation and U10 acceptance implementation       |
| MGMT-03 | Booking setup             | Services, locations, work plan, availability, form, payments, attribution | Separately gated management capabilities                                             |
| MGMT-04 | Public page and brand     | Draft identity, assets, profile, preview, publish history                 | Brand/publication capability; core org identity is not a paid permission             |
| MGMT-05 | Domains                   | Hostname base, surface bindings, readiness, errors, remove/quarantine     | Owner or delegated irreversible capabilities; readiness and entitlement are separate |
| MGMT-06 | Senders                   | Email sender, SMS presentation and push identity readiness                | Sender capability; transport credentials/configuration remain server-owned           |
| MGMT-07 | Channels and integrations | Calendar, delivery channels, notification defaults                        | Organization-owned configuration only; platform integrations stay PLAT-05            |
| MGMT-08 | Plan, usage and billing   | Current plan, limits, invoices, recovery                                  | Owner; delegated view/pay if explicitly allowed                                      |
| MGMT-09 | Organization settings     | Patient terminology, timezone, care defaults, permissions                 | Owner/admin according to section capability                                          |

Management and clinical surfaces share the current organization identity and account chrome. They do not share one
unbounded menu. Owner ruling 2026-07-16 requires one login and distinct surfaces. Launch may use a simple management
page/menu entry; `Clinical work` / `Organization management` switch remains an implementation choice.

## 7. Clinical work IA

| ID      | Group                            | Screen composition                                                                            | Solo mode                                                | Clinic mode                                                                             |
| ------- | -------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| CLIN-01 | Today                            | Appointments, tasks, signals, active care and shortcuts                                       | Own practice, no redundant scope control                 | Own operational scope by default; authorized organization widgets explicit              |
| CLIN-02 | Patients                         | Search, operational roster, filters, preview/list; manual create                              | All permitted practice patients; omit `Мои` toggle       | `Мои пациенты` = actual/scheduled visit relation; `Все доступные` only after capability |
| CLIN-03 | Patient card                     | Identity/care bar, overview, program, visits, communications, files, finance/contact sections | Solo launch card                                         | One org card; future clinic visibility may use visit relation; no hierarchy summary     |
| CLIN-04 | History                          | One authorized organization timeline with type/period/author filters                          | Full permitted solo history                              | `Мои события` default; `Вся доступная история` / specialist only after authorization    |
| CLIN-05 | Future clinic visit coordination | No initial composition                                                                        | Absent in solo launch                                    | Reserved ID; exact future clinic permissions/UI deferred                                |
| CLIN-06 | Schedule                         | Own calendar/list/work plan                                                                   | Own calendar; setup link only with management capability | Own calendar; organization schedule and setup separately gated                          |
| CLIN-07 | Communications                   | Conversations, intake, comments, broadcasts                                                   | Current solo-specialist chat unchanged                   | Future clinic topology remains unselected and is not represented in launch UI           |
| CLIN-08 | Programs                         | Patient assignments and program instances                                                     | Same components                                          | Attribution, visibility and reassignment explicit                                       |
| CLIN-09 | Clinical library                 | Exercises, complexes, tests, recommendations, program templates                               | Allowed platform/org assets                              | Same; scope/source visible                                                              |
| CLIN-10 | Content and media                | Patient-facing content, sections, media, courses                                              | Practice assets + allowed platform assets                | Organization assets + allowed platform assets                                           |
| CLIN-11 | Organization clinical analytics  | Schedule/care/content metrics within authorized organization                                  | Own practice                                             | Own vs authorized team aggregate clearly labeled                                        |

Owner ruling approves one organization-scoped card. A clinic specialist sees the patient through an actual/scheduled
visit relation, sees own events by default and may open all authorized organization history or filter by another
specialist. Record-class/private visibility remains a server policy. Per-specialist card trees are rejected.

### Future clinic visit coordination placement

- Patient-list, calendar and card offer manual create: name, phone, optional email, scheduled appointment or walk-in.
- Future clinic visit coordination creates/books a visit with another specialist; that visit establishes workspace
  visibility. It does not create a separate transfer hierarchy or receiver-approval lifecycle.
- Portal activation later links verified identity to the existing card/program/visits; delivery is not proof.
- Cross-organization movement and generic patient-transfer actions have no navigation.

## 8. Assistant operations IA — deferred future

Owner ruling 2026-07-16 removes assistant/receptionist from initial release. IDs remain reserved in the 57-screen
registry only to prevent future route duplication; they are not launch surfaces or implementation dependencies.

| ID                         | Screen                                                         | Safe composition before ruling                                      |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| OPS-01                     | Future operations home                                         | Deferred architecture reservation; no current product/grants design |
| OPS-02                     | Future schedule                                                | Deferred                                                            |
| OPS-03                     | Future intake and patient contact                              | Deferred                                                            |
| OPS-04                     | Future messages                                                | Deferred; future topology is configurable                           |
| Shared account destination | Profile, security, notifications and install use ACC-01…ACC-04 | No assistant-owned duplicate route or permission model              |

Direct URL, search, counts, suggestions and exports must match the same bounded capability. Empty clinical panels are
not shown as teasers. Upgrade states are used only for entitled mechanics after permission, never for forbidden data.

## 9. Patient IA

| ID     | Surface                    | Scope                                             | Main composition                                                                                |
| ------ | -------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| PAT-01 | Context resolver / chooser | Global relationship list                          | Zero: activation/help; one: enter with visible org; many: chooser and persistent switcher       |
| PAT-02 | Today                      | Active organization                               | Next visit, current program/action, reminders, attributed specialist, organization alerts       |
| PAT-03 | Treatment                  | Active organization / direct object               | Program list, program detail, item execution, author/specialist source                          |
| PAT-04 | Booking                    | Active organization or verified published journey | Upcoming/history, new/reschedule flow, service/specialist/location context                      |
| PAT-05 | Inbox                      | Active organization                               | Conversation threads and service notifications with organization + author/recipient attribution |
| PAT-06 | Progress                   | Active organization                               | Diary, symptoms, rehabilitation journal and reminders; no cross-org raw aggregate by default    |
| PAT-07 | Benefits and payments      | Active organization                               | Purchases, memberships, payments and entitlement state grouped by organization                  |
| PAT-08 | Content and help           | Active organization or published content          | Help, sections, content and courses with source attribution                                     |
| PAT-09 | Organization details       | Active organization                               | Specialists from the patient's visits, location/contact, organization support and disclosures   |
| PAT-10 | Profile and security       | Global                                            | Identity, recovery/security and relationship list                                               |
| PAT-11 | Notifications and install  | Global consent plus explicit org preferences      | Channel consent, topic preferences, platform PWA install; org sender identity is presentation   |

Platform app opens the last active organization with a visible switcher; invalid preference uses the chooser. A
trusted invite/booking deep link visibly enters its verified organization. Initial release uses one platform app.
Future paid organization PWA is pinned to one organization without a switcher and may be generated from verified
origin/name/logo/manifest settings. Separate organization native app is outside current scope.

## 10. Navigation contract

### Platform public — desktop

- Header hierarchy: Therapysto trust anchor → product/pricing → demo/signup. `Создать кабинет` / `Запросить демо`
  remains the primary action; `У меня есть приглашение` / `Войти` is a visually secondary patient/staff entry.
- Landing sections preserve specialist-first order: operating value → solo/clinic paths → workflow/proof → package
  boundary → trust/legal → final signup/demo action. Patient care proof supports the buyer story and does not become
  a patient-acquisition hero.
- Login, recovery, legal, support and status remain reachable from both header/footer and classified recovery states.
  PUB-06 is absent from launch navigation by owner ruling; a disabled or empty directory is not advertised.

### Platform public — mobile

- Compact header keeps one primary signup/demo action visible; product/pricing moves into a drawer or section links.
  The secondary invited-patient/login entry remains present in the header/drawer and near the final CTA, but never
  replaces the specialist CTA.
- CTA priority, identity mode, legal/support/recovery availability and signup state do not change at the breakpoint.
  Long forms become stepwise/stacked; validation, resend and recovery remain adjacent to the affected step.
- Every unknown/degraded organization link can return to PUB-04/PUB-05 without an absolute client-controlled
  redirect. Mobile presentation never changes trusted context or token-exchange rules.

### Published organization surface — desktop

- ORG-PUB-01 is the public hub: organization identity and disclosures → services/specialists/locations → booking CTA;
  a trusted join link enters ORG-PUB-03 directly and does not expose a public patient directory.
- Booking preserves visible organization context across ORG-PUB-02 service, specialist/location, slot, identity,
  review and result states. Back navigation restores safe selections without permitting another organization.
- Legal/support/recovery functions remain reachable. On a custom domain, degraded/unavailable recovery may offer the
  stable platform alias; the fully branded surface does not thereby promise visible Therapysto/Therapygo/platform branding.
  Exact legal/support/security identity, copy and placement follow later applicable law/contracts/security review.

### Published organization surface — mobile

- Organization identity and the primary `Записаться` action stay above the fold; service/specialist/location content
  stacks into drill-down lists. Join remains an explicit trusted-link flow, not an interchangeable booking CTA.
- Sticky booking CTA may shorten presentation but cannot omit organization, selected service/time, privacy/legal or
  recovery facts. Token exchange, recipient proof and canonical fallback are identical to desktop.
- Custom-domain failure offers one-way custom → stable platform recovery without forwarding a raw bearer or creating
  a redirect loop. Legal/support/recovery functions remain reachable from every error/terminal state; visible brand
  on the fully branded surface is not prescribed here.

### Desktop staff

- Persistent sidebar contains only the current surface.
- Surface switch sits next to organization identity, not among patient filters.
- `Clinical work`: Today, Patients, Schedule, Communications, Library, Content; secondary items live in group pages.
- `Organization management`: Overview, Booking, Brand & public, Domains & senders, Integrations, Plan & billing,
  Settings. `MGMT-02 Team` is a reserved future ID and is absent from launch navigation.
- Account/security/install is reached from the profile menu in every staff surface.
- Global admin has its own platform shell and never inherits clinical navigation.

### Mobile staff

- Fixed top bar: surface/organization label, alerts, profile; navigation opens as a full-height drawer.
- Primary task routes keep the same URLs and capability checks as desktop.
- Dense master-detail screens become list → detail; editors retain explicit save/publish actions.
- Owner/admin + specialist surface switch is a top-level drawer control with current mode announced.
- No assistant/receptionist drawer or operations destination exists in launch navigation. Reserved `OPS-01…04`
  must not appear until a separate future clinic contract defines the actor, grants and communication topology.

### Patient mobile and installed PWA

- Bottom navigation: `Сегодня`, `Лечение`, `Прогресс`, `Запись`, `Сообщения`.
- Organization switcher sits in top chrome when several active enrollments exist; with one enrollment the name remains
  visible and picker affordance collapses.
- Profile, notifications, install and organization details are secondary routes.
- Direct object deep links resolve ownership before changing visible context.

### Patient desktop

- Reuse the patient shell and content components; widen layout and expose a compact left/upper navigation, not a
  separate desktop product.
- The same five primary destinations and context switch are present. Detail may use two columns where content permits.

## 11. Shared state contract

Every target screen specification in `SCREEN_COMPOSITION.md` declares applicable states. The common semantics are:

| State                  | Meaning                                                          | Required presentation                                                     |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Loading                | Trusted context is known but data is pending                     | Stable shell/skeleton; no previous-organization data flash                |
| Empty                  | Authorized query succeeded with no objects                       | Explain what is absent and offer only permitted creation/recovery action  |
| Permission denied      | Relationship/capability forbids access                           | Neutral denial; no count, name or upgrade teaser for forbidden data       |
| Entitlement blocked    | Actor is authorized but mechanic is unavailable                  | `hidden`, `read_only`, `grace` or `blocked` plus recovery owner/CTA       |
| Context invalid        | Membership/enrollment/object ownership is stale or foreign       | Fail closed, clear stale preference and offer safe context/recovery       |
| Degraded integration   | Core data remains usable but a channel/domain/sender is impaired | Exact affected dimension, fallback/hold behavior and remediation owner    |
| Suspended organization | Relationship exists but business actions are unavailable         | Retained data/read policy, billing/support recovery; domain cannot bypass |
| Error                  | Operation failed without a safer classified state                | Retry with correlation/support path; preserve entered non-secret data     |

## 12. Current owner outcomes and non-blocking future backlog

| Decision area                                   | Current composition                                                                                                                                                     | Excluded or still-open detail                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Owner/admin navigation — resolved launch        | One login; simple distinct management surface                                                                                                                           | Menu versus switch remains implementation choice; no duplicate account                          |
| Assistant — resolved launch absence             | No OPS launch surfaces                                                                                                                                                  | Future grants outside current scope; no pending owner gate                                      |
| Patient multi-org — resolved launch             | Last active + visible switcher; chooser if invalid                                                                                                                      | No silent substitution or organization merge                                                    |
| Card/history — resolved launch                  | One card; visit relation; own events default; authorized history/specialist filter                                                                                      | Record-class enforcement remains implementation policy                                          |
| Transfer premise — rejected                     | No lifecycle or launch navigation; ordinary another-specialist visit is future clinic scope                                                                             | No separate transfer hierarchy or cross-org movement                                            |
| Entitlement degradation — implementation policy | Core context visible; each mechanic declares degradation                                                                                                                | Not an unresolved UX08 decision                                                                 |
| Branding/domain                                 | Initial platform app; profile+booking+join, directory later; future full branded origin uses own domain or platform subdomain + org name/logo with shared layout/design | Generated org PWA is post-launch; separate native org app remains non-blocking research backlog |

These are outputs of the dated owner rulings, not pending inputs. Historical UX-07 prototype alternatives are
superseded wherever they conflict. Solo-first launch owner gates = `0`; future clinic/native research remains absent
without implying that future product design is complete.
