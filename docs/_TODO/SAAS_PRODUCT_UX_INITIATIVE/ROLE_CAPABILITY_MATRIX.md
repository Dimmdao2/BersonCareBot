# UX-03 — Role × screen × capability matrix

**Статус:** independently audited decision-ready candidate; unresolved rows still require owner rulings.
**Правило:** `allow` ниже означает target contract только для строк со статусом `approved` или после принятия
`proposal`. Допустимые статусы: `approved`, `current_fact`, `proposal`, `needs_owner_decision`;
`needs_owner_decision` всегда сопровождается safe default.

## 1. Decision order

```text
session/tier → server-resolved relationship/context → object ownership → capability
→ entitlement/mechanic → domain operation → permitted result → UI filter
```

Denial is evaluated at the failed layer: relationship denial (`access denied/recovery`), capability denial
(`forbidden/no action`), entitlement denial (`upgrade/grace/read-only/blocked`) and empty permitted result are distinct
states.

The owner ruling that staff sees the whole clinic defines the organization tenant wall and rejects a patient-level
RLS wall based on `Мои`; it does not make every private/restricted clinical entry readable by every staff role. The
later UX addendum leaves shared-history record classes and capabilities open. Likewise, platform-wide database
authority for global admin is not the same as placing patient behavior in routine SaaS analytics: the unresolved row
below concerns the product support/intervention workflow, not a categorical database-access ban.

## 2. Capability matrix

Abbreviations: `N/A` — entitlement does not apply; `TBD` — owner decision. “Org object” always means an object with a
verified ownership path to the actor's server-resolved organization.

The compact table is read together with §2.1. For every row, `Preconditions and scope` carries session tier,
membership/enrollment and specialist relation; `Screen / capability` carries action and target class; §2.1 makes
the ownership source, server enforcement contract and provenance explicit. Presentation text is never an
enforcement point.

| Actor / surface | Preconditions and scope | Screen / capability | Default/filter | Entitlement relation | Denied/recovery behavior | Audit | Status |
|---|---|---|---|---|---|---|---|
| Global admin / platform | Platform admin session + explicit admin mode | Organization directory, tariff, lifecycle, health | Platform filters over operational data | N/A; tariff editing is platform capability | No org/doctor fallback; explicit platform denial | Irreversible lifecycle/config writes | approved |
| Global admin / support | Platform admin; purpose-specific org target | Diagnose/repair organization | No ordinary patient-card navigation | N/A | Diagnostics only until intervention policy exists | Actor, purpose, org, action, result | needs_owner_decision; safe: diagnostics/repair only |
| Owner / management | One active owner membership | Org lifecycle, ownership transfer, contract/billing | Organization only | Billing mechanic may affect service, not access to recovery | Strong confirmation; preserve last owner | Required | needs_owner_decision; approved safe boundary: owner only |
| Admin / management | One active admin membership | Delegated team/settings/booking operations | Organization only | Relevant mechanic checked separately | Owner-only action hidden/forbidden; no implicit elevation | Writes required | needs_owner_decision; safe: deny irreversible owner actions |
| Owner or admin / management | Membership; capability granted | Team list, staff invite/resend/revoke/deactivate | Org staff only | Seat/team mechanic may block creation, never safe offboarding | Upgrade/recovery state distinct from permission denial | Invite and staff lifecycle | proposal |
| Owner/admin + specialist / shell | Membership + specialist binding | Switch clinical ↔ management surface | Restore only still-authorized route | N/A | Fall back to permitted management or clinical home | Mode change not security audit; sensitive actions are | needs_owner_decision; safe: only capability-allowed sections with unambiguous management/clinical labels |
| Non-clinical owner/admin / shell | Membership, no specialist binding | Open management overview | No clinical filter | N/A | Doctor routes forbidden; setup/binding CTA if authorized | Binding creation audited | approved |
| Specialist / clinical home | Membership + specialist binding | Today, own schedule/tasks | Own specialist context | Mechanic-specific | Permission state or entitlement recovery; never another specialist fallback | Clinical writes/actions | proposal |
| Solo specialist / patients | Bound specialist; one-specialist composition; permitted org records | Patient list/card | No redundant `Мои/Все`; all permitted solo result | Core patient access must not depend on team package | Direct/list/count/search/export parity | Reads per clinical audit policy; writes always | proposal |
| Clinic specialist / patient list | Bound specialist; org-scoped roster capability | View own operational roster | `Мои` = candidate operational union | Core list N/A; team mechanics separate | Foreign org/object denied; empty own roster is not full-org fallback | Sensitive export | needs_owner_decision on `Мои`; safe: assigned/own only |
| Clinic specialist / patient list | Bound specialist + `patients.view_organization` candidate | View all permitted organization patients | `Все доступные` | Never granted by entitlement alone | Control absent/forbidden; API does not broaden scope | Export and bulk actions | needs_owner_decision; safe: deny |
| Specialist / patient card | Bound specialist + authorized patient relation | Read own/shared demographics and operational summary | Patient context fixed server-side | N/A/core | Neutral not-found/forbidden without foreign data leak | Sensitive reads per policy | needs_owner_decision; safe: own/assigned scope and already-authorized operational fields only |
| Specialist / history | Bound specialist; permitted entry classes | Read own authored/assigned history | `Мои события` default | N/A/core retained data | Private/foreign entries absent from list/count/search/export and direct URL | Export required; read per policy | approved |
| Specialist / history | `clinical_history.view_shared` + entry visibility | Read clinic shared history | `Вся доступная` / specialist X after permission | Team tier may package UI mechanic, not grant permission | Control absent/forbidden; private classes remain hidden | Shared export/read policy | needs_owner_decision; safe: deny shared clinical entries |
| Specialist / history write | Binding + patient relation + write capability | Create/amend clinical entry | Author fixed to actor; filter does not impersonate | Relevant clinical mechanic/grant | Read-only/forbidden; never write as selected specialist | Author, object, amendment trail | needs_owner_decision; approved safe boundary: no impersonation |
| Owner/admin without binding / patient | Membership + explicit operational capability | Demographics/schedule/billing sections | No clinical history by role alone | Section mechanic separate | Clinical sections/direct exports forbidden | Sensitive operational writes | needs_owner_decision; safe: minimum operational fields only |
| Assistant / operations | Assistant membership + explicit schedule/contact capability | Schedule, intake, demographics/contact, invite lifecycle | Assigned queue/org schedule as granted | Mechanic/seat separate | Missing capability forbidden; missing entitlement recovery | Appointment/contact/invite writes | needs_owner_decision; recommended bounded baseline |
| Assistant / clinical | Assistant membership, normally no binding | History read/export/write, program authorship | None | Entitlement cannot override denial | Forbidden on UI and direct API; no doctor-route reuse | Denied sensitive attempts if policy requires | needs_owner_decision; safe: deny |
| Patient / global account | Patient tier | Identity/security, organizations, global consent/support | Global, no clinical aggregation | N/A | Recovery without exposing org data | Security/consent changes | approved |
| Patient / one enrollment | Patient tier + active enrollment | Organization Today/program/visits/messages | Org visible; picker collapsed | Org mechanic may change action state, not enrollment validity | Suspended/revoked organization-specific recovery | Clinical action/message audit | proposal |
| Patient / multiple enrollments | Patient tier + selected active enrollment | Switch organization care context | Last-active candidate; persistent picker | Per-org mechanics independently resolved | Invalid remembered org → chooser; no silent context switch | Context preference optional; clinical actions normal | needs_owner_decision; safe: chooser on ambiguity |
| Patient / direct object | Active enrollment owning target object | Read/act on appointment/program/message | Object determines verified org | Object mechanic checked separately | Foreign/revoked target → neutral denial/recovery | Domain action | approved |
| Onboarding patient / activation | Onboarding tier + valid trusted invite/booking state | Activate identity and enrollment | Invite organization shown, not trusted from query/Host | Invite mechanic may block new business action | Expired/revoked/wrong-recipient recovery; no business data | Token lifecycle without raw token | approved; journey UX in UX-04 |
| Anonymous / public | Published trusted projection | Platform landing, org profile, booking/join entry | Published org context only | Public-page/booking mechanic may affect availability | Unpublished/invalid domain → canonical fallback or safe 404 | Booking/invite creation | approved; surface contract UX-04/05 |
| Owner/admin/specialist / primary handoff | Same org; explicit assignment capability; valid source/destination | Request/accept/reject/cancel primary assignment | No history rewrite | Team mechanic separate from permission | Invalid/deactivated destination, stale request, entitlement recovery | Full transition event | needs_owner_decision; safe: no generic transfer |
| Authorized staff / care team | Same org + care-team capability | Add/remove member with explicit powers | Does not change primary | Team mechanic separate | No automatic private-history reveal | Membership transitions | needs_owner_decision; safe: deny implicit access expansion |
| Authorized staff / work item | Same org + object-specific reassign capability | Reassign appointment/task/program/episode | Only selected object | Corresponding mechanic/grant | Pending/reject/cancel; other patient work unchanged | Object transition | needs_owner_decision by object class; safe: no reassignment without an explicit object contract |
| Authorized actor / cross-org | Explicit source/destination/consent contract | Create destination enrollment and share/copy package | Never re-parent source rows | Separate launch mechanic | No generic clinic handoff fallback; safe failure/retention | Source/destination/consent/receipt | needs_owner_decision; safe: out of initial launch |
| Any otherwise-authorized actor / entitled action | Valid relationship + capability | Use paid mechanic | Existing authorization scope only | Enabled/grace/read-only/blocked per mechanic | Upgrade/recovery owner and CTA; no broader fallback | Commercial override/use where required | needs_owner_decision; safe: retained data readable where legally/operationally required, optional mutation blocked |

### 2.1 Ownership, enforcement and provenance supplement

This supplement is normative for the rows above and prevents a compact screen-oriented row from being read as an
implicit permission grant.

| Matrix row(s) | Target and ownership source | Required server enforcement contract | Provenance |
|---|---|---|---|
| Global admin / platform | Platform organizations, tariffs, lifecycle and aggregate operations; platform scope comes only from explicit global-admin session | Dedicated platform capability/port before query or mutation; no organization membership fallback | SaaS owner rulings; UX-01; capability architecture review §§3.1, 10 |
| Global admin / support | Explicit server-resolved organization support target; clinical objects remain separately scoped | Purpose-specific support capability and audited operation; no normal chart route or `adminMode` shortcut | Capability architecture review §§3.1, 9, 10 |
| Owner / management | Actor's sole active membership organization and its contract/ownership records | Membership resolver + owner-only capability + object organization check; preserve one active owner | Owner rulings; capability architecture review §3.2 |
| Admin / management | Actor's sole active membership organization and delegated management objects | Membership resolver + explicit delegated capability + object organization check; owner-only actions fail closed | Capability architecture review §§3.3, 9 |
| Owner or admin / management — team lifecycle | Staff memberships/invites owned by actor's organization | Membership resolver + team lifecycle capability + seat entitlement after authorization | UX-01; UX-02 product patterns; capability architecture review §§2, 8 |
| Owner/admin + specialist / shell | Same server-resolved organization; management relation and specialist binding are independent | Resolve membership and binding independently on every destination route; mode is presentation only | Owner rulings; UX-01; capability architecture review §§2, 3.2–3.4 |
| Non-clinical owner/admin / shell | Management objects in sole membership organization | Membership/capability checks deny clinical actor routes unless a valid specialist binding exists | Owner rulings; capability architecture review §§3.2–3.3 |
| Specialist / clinical home | Specialist binding, assignments and work items owned through the same organization | Membership + binding + action capability + object ownership before entitlement-specific action | UX-01; capability architecture review §§2, 3.4 |
| Solo specialist / patients | Patient enrollments and permitted records owned by the same organization | Relationship/capability checks on list, direct read, count, search and export; composition cannot broaden result | UX-02 product patterns; capability architecture review §§5, 11 |
| Clinic specialist / patient list — own roster | Organization patient enrollments related through the approved definition of `Мои` | Server computes the approved operational union over an already authorized organization dataset | Owner addendum in REQUIREMENTS; capability architecture review §§5, 9 |
| Clinic specialist / patient list — organization roster | Patient enrollments owned by the same organization | Explicit organization-roster capability on list/count/search/export and direct object paths; entitlement alone cannot grant it | Owner addendum in REQUIREMENTS; capability architecture review §§2, 5 |
| Specialist / patient card | Enrollment and card sections owned by the actor's organization, with section/record-class visibility | Resolve enrollment + actor relation + section capability for every direct/list/export path | Owner addendum in REQUIREMENTS; capability architecture review §5 |
| Specialist / history — own/shared reads | Authored, assigned or shared timeline entries linked to the organization enrollment; each entry retains visibility class | Entry-level policy before list/count/search/export/filter; direct object read must use the same policy | Owner addendum in REQUIREMENTS; UX-02 technical patterns §8; capability architecture review §§5, 11 |
| Specialist / history write | Target enrollment and writable record class in the same organization; author comes from authenticated binding | Write capability + record-class policy; server fixes author and stores amendment trail | Capability architecture review §§3.4, 5 |
| Owner/admin without binding / patient | Explicitly delegated operational sections of an organization enrollment | Section-level operational capability; clinical history/authorship denied without separate binding and grant | Capability architecture review §§3.2–3.3, 9 |
| Assistant / operations and clinical | Explicitly delegated organization schedule/intake/contact/invite objects; no implied clinical target | Capability per operation and object scope on UI/API/export; clinical paths denied until a ruling explicitly grants a bounded class | UX-02 product patterns; capability architecture review §§3.5, 9 |
| Patient / global account | Canonical patient identity and global account/consent records | Patient-tier identity check; no organization clinical aggregation | Identity canon; capability architecture review §3.6 |
| Patient / one or multiple enrollments | Active server-resolved enrollment; each care object owns its organization context | Revalidate enrollment on entry/switch and on every direct object; remembered selection is preference only | Identity canon; owner addendum; capability architecture review §7 |
| Patient / direct object | Appointment/program/message ownership path to an active enrollment | Resolve object first, then verify canonical patient + active/retained policy; foreign target returns neutral denial | Identity canon; capability architecture review §§3.6, 7 |
| Onboarding patient / activation | Server-side invite/booking record and its organization; token is lookup material only | Token lifecycle + recipient/identity checks; query, Host and branding cannot replace invite organization | UX-02 technical patterns §§2–3; capability architecture review §3.6 |
| Anonymous / public | Published platform or organization projection and server-verified domain mapping | Public projection/booking policy; no private base row or client-provided organization authority | UX-02 technical patterns §6; capability architecture review §§3.6, 10 |
| Primary handoff | Primary-assignment object within one organization and valid source/destination bindings | Dedicated assignment transition capability with stale-state and active-party checks | Owner addendum; UX-02 technical patterns §8; capability architecture review §6 |
| Care team | Care-team membership object and explicit powers within one organization | Dedicated membership transition; every resulting data access still passes entry/section policy | Owner addendum; capability architecture review §6 |
| Work item | Named appointment/task/program/episode and its current organization owner/assignee | Object-class reassignment capability and transition check; no patient-wide side effect | Owner addendum; capability architecture review §6 |
| Cross-org | Source record retained; destination enrollment and explicit share/copy package are separate objects | Explicit source/destination capabilities, consent and receipt workflow; direct re-parent is rejected | Owner addendum; UX-02 technical patterns §8; capability architecture review §6 |
| Any entitled action | The already-authorized domain object; organization entitlement is server-resolved | Authorization first, then mechanic state; degradation cannot change object scope or erase retained data | UX-02 technical patterns; capability architecture review §8 |

### 2.2 Current data/API gaps — observations, not product rulings

- Current coarse role flags (including owner/admin management shortcuts) are not evidence of the target granular
  capabilities in this matrix; implementation must introduce or map explicit server-enforced capabilities before an
  `allow` proposal becomes real.
- The current schema/API does not yet prove entry-level history visibility, restricted/private record classes or
  list/direct/count/search/export parity. The one-card candidate therefore requires a data/API design gate.
- No canonical primary-assignment, care-team or generic handoff state machine is evidenced as complete. Existing
  specialist/appointment relations must not be relabeled as a finished transfer workflow.
- Patient organization context exists conceptually through enrollment, but UX-01 exposed a current
  `organization_principal_required` patient Today failure. It remains an implementation defect, not a reason to
  weaken the target context contract.
- Entitlement keys and lifecycle states exist as a SaaS direction, but per-mechanic degradation and recovery owners
  are not yet settled; UI composition must keep `needs_owner_decision` states explicit.
- Purpose-specific global-admin support intervention and its audit/session contract are not evidenced as complete;
  current platform access must not be presented as a normal clinical support workflow.

## 3. Screen composition summary

| Screen group | Global admin | Owner/admin non-clinical | Owner/admin + specialist | Specialist | Assistant | Patient | Public |
|---|---|---|---|---|---|---|---|
| Platform operations | Yes | No | No | No | No | No | Published only |
| Organization management | No ordinary org membership | Yes | Yes, management mode | No | Only delegated operational subset | No | No |
| Clinical home | No | No | Yes, clinical mode | Yes | No | Own care home | No |
| Team/handoff | Platform diagnostics only | Manage if capable | Manage/use if capable | Clinic-only actions if capable | No by default | Care-team display TBD | No |
| Patient card/history | Support intervention TBD | Operational sections TBD | Clinical scope via binding, not owner role | Authorized scope | Denied clinical by default | Own org-scoped data | No |
| Account/security/install | Platform account | Yes | Yes | Yes | Yes | Yes | Login/join entry only |
| Public landing/org/booking | Manage platform projection | Configure org projection if capable | Same in management mode | No management by default | Delegated booking ops only | Consume published flow | Yes |

## 4. Handoff state and audit matrix

| Operation | Request | Pending | Accept/complete | Reject/cancel/expire | Required audit fact |
|---|---|---|---|---|---|
| Primary assignment | Actor, A→B, reason | A remains responsible in recommended candidate | B becomes primary; history unchanged | A remains/restores primary | old/new primary, actor, timestamps, reason, correlation id |
| Care team | Member + explicit powers | Optional invite/approval | Active powers only; no implicit private history | No membership/powers | old/new membership and powers, actor, timestamps |
| Work item | Object id, A→B | A remains owner until acceptance candidate | Only object owner changes | Original owner remains | object type/id, old/new assignee, due/status, actor |
| Cross-org | Source, verified destination, purpose/subset | Consent/destination verification | New enrollment + approved copy/share receipt | Source remains intact; package failed/revoked | both orgs, consent, subset, retention, receipt, actor |

For every pending handoff, an inactive destination makes acceptance unavailable and moves the request through an
audited cancel/expire recovery path. An inactive source does not auto-complete or erase responsibility: authorized
management resolves affected future appointments, active work items, primary assignments and care-team membership.
Historical authorship is retained in both cases.

## 5. Matrix acceptance scenarios

The independent critic must trace without contradiction:

- zero/one/multiple active staff memberships;
- owner/admin with and without specialist binding;
- specialist A own/shared/private-B entry across list, direct read, count, search and export;
- assistant schedule/contact route versus clinical direct URL/export;
- patient onboarding, one enrollment, A+B enrollments and revoked B;
- `Мои`, `Вся доступная`, specialist X filters after authorization;
- all primary/care-team/work-item states and disabled source/destination specialist;
- attempted cross-org re-parent versus explicit new enrollment/share flow;
- enabled entitlement + denied capability, and granted capability + disabled/grace/read-only mechanic;
- global-admin diagnostics versus support intervention;
- public/invite/custom domain attempting to override trusted organization context.

Open cells are intentionally not “filled in” by current route behavior or market precedent. Their owner rulings are
prioritized in [`OPERATING_MODEL.md`](./OPERATING_MODEL.md#9-owner-decision-packet-ordered-by-downstream-block).

## 6. Provenance

- Tenant, membership, one-active-staff-organization, patient identity/enrollment and combined owner/admin-specialist
  facts: `SAAS_FOUNDATION/00_DECISIONS_AND_SCHEMA.md`, `P0_2_MEMBERSHIP_RESOLVER_CHECKLIST.md` and
  `OWNER_RULINGS_2026-07-15.md`.
- Current surface/context gaps: UX-01 inventories and acceptance records.
- One-account solo/team, one-card/history/filter and handoff patterns: `UX02_PRODUCT_PATTERNS.md`; these remain
  product candidates, not rulings.
- Invite, PWA, domain, sender, history authorization and audit boundaries: `UX02_TECHNICAL_PATTERNS.md`.
- Required check ordering, safe defaults and unresolved access questions: `UX03_CAPABILITY_ARCH_REVIEW.md`.
