# UX-05 — Branding and domain contract

**Статус:** completed as a decision-ready contract; full independent re-audit **PASS** after integrated correction.
Канонический phase verdict: [`UX05_INDEPENDENT_AUDIT.md`](./UX05_INDEPENDENT_AUDIT.md) §5. Pending BD-1…BD-6
остаются owner gates и не являются rulings.
**Дата:** 2026-07-15.  
**Scope:** platform landing, organization identity, white-label, custom domains, PWA identity, sender presentation,
legal/support и безопасная деградация. Это discovery-контракт; application code, schema, DB и тарифы не менялись.

## 1. Что является каноном

Этот контракт развивает, но не отменяет:

- `REQUIREMENTS.md`, `OPERATING_MODEL.md` и `ROLE_CAPABILITY_MATRIX.md`;
- evidence/recommendations из `UX02_PRODUCT_PATTERNS.md` и `UX02_TECHNICAL_PATTERNS.md`;
- identity/tenant правило: tenant = `Organization`, staff имеет одну active organization membership, patient — одну
  global identity и несколько organization enrollments;
- текущий runtime baseline: один platform origin, отдельные стабильные patient/staff manifest identity, общая область
  service worker `/app`, platform `support_contact_url`, platform SMTP/VAPID settings;
- текущие entitlement mechanic names `branding` и `custom_domain`.

Текущая `be_organizations` хранит только базовое имя/состояние/тариф. Полноценные org-brand profile, publication,
domain, sender и per-origin PWA readiness contracts в коде не подтверждены. Описанные ниже сущности — требования к
будущей реализации, а не заявление о готовом backend.

## 2. Core context и три уровня представления

`Core organization context` не является брендингом и не продаётся как paid mechanic. После trusted lookup или для
разрешённой public projection он всегда содержит минимально необходимую идентификацию: canonical display name,
нейтральную attribution организации и BersonCare/platform disclosure там, где оно нужно для доверия, legal или
recovery. Это позволяет человеку понять, с какой организацией связан invite, booking, care context или
transactional message даже при выключенном `branding`.

`Brand presentation` — отдельный published слой: logo, colors, typography/assets, branded header/body, optional
contacts/content и template presentation. Он требует `branding` entitlement, валидной published revision и
surface-specific readiness. Его отсутствие всегда деградирует к platform visuals + core context, а не к анонимной
поверхности.

| Уровень | Смысл | Что не обещает |
|---|---|---|
| **P — Platform-only** | BersonCare является trust anchor, origin, sender и fallback; core organization context показывается там, где подтверждён trusted object/relationship или public projection | Paid brand presentation, отдельный домен или sender identity |
| **O — Organization identity** | На platform origin поверх core context опубликованы logo, colors, contacts и branded content | Отдельную installed app identity, custom hostname или sender domain |
| **W — True white-label** | Проверенные custom origin/sender и, отдельно, per-origin PWA могут сделать surface organization-first | Исчезновение platform operator/legal/recovery там, где они обязательны |

Уровень вычисляется **по каждой поверхности отдельно**. Организация не становится целиком white-label из-за одного
проверенного hostname. Например, public page может быть W, email sender оставаться O, а staff shell — P/O.

## 3. Неподвижные инварианты

1. Host/domain, slug, logo, цвет, manifest, sender display и выбранная organization в UI не авторизуют пользователя.
2. Порядок проверки: trusted object/relationship → organization context → capability → entitlement → readiness →
   presentation. Branding применяется последним.
3. Canonical platform URL существует для каждой поддержанной organization surface независимо от custom domain.
4. Organization из invite, booking, enrollment или session берётся из server-side записи. Host может только предложить
   entry context и не может переопределить trusted organization.
5. Brand, domain, web TLS/routing, email sender, SMS sender, PWA origin и organization lifecycle имеют независимые
   состояния. `active` в одном измерении не активирует остальные.
6. Клиент не передаёт effective logo URL, sender, organization id или redirect origin. Сервер вычисляет их из
   опубликованной revision, entitlement и readiness.
7. Clinical details не попадают на anonymous/join preview, в lock-screen push, email subject или SMS по умолчанию.
8. Смена бренда/тарифа не удаляет identity, enrollment, clinical history, доставочные записи или legal/audit trail.
9. Canonical fallback не должен создавать redirect loop, открытый redirect или перенос bearer token через сторонний
   origin.
10. Platform support/recovery остаётся достижимым даже при ошибке org-brand, custom domain или sender.

## 4. Server-side resolution contract

```text
request
  -> normalize Host and route (never trust body/query organization)
  -> map platform alias or Host through server-managed registries
  -> resolve route object: public projection | booking config | invite | session/enrollment
  -> verify that object organization agrees with allowed host context
  -> authorize actor/object when the surface is private
  -> resolve organization lifecycle + capability + entitlement
  -> compose mandatory core organization context
  -> resolve independent readiness: brand | hostname base | surface binding | sender | PWA
  -> render effective presentation or canonical recovery
```

Если route object и Host указывают разные организации, сервер не «выбирает более красивую»: он выдаёт нейтральный
conflict/recovery response без названий чужой организации и предлагает canonical platform entry.

## 5. Surface contract

`Owner` ниже — владелец контента/настройки, не security principal. Capability enforcement описан в
`BRANDING_CAPABILITY_MATRIX.md`.

| Surface | P — platform-only | O — organization identity | W — true white-label | Canonical fallback | Owner / readiness |
|---|---|---|---|---|---|
| Platform landing | BersonCare acquisition для специалиста/клиники | Не подменяется организацией | Не подменяется организацией | Platform landing | Platform; всегда published |
| Organization public profile | Platform chrome + core display name from published projection | Paid logo/colors/content, specialists, services, addresses, optional contacts | Org-first on active `public_profile` binding; operator disclosure | Stable platform alias route | Public projection + optional brand revision + binding readiness |
| Public booking | Platform booking + core org name/context | Paid visuals/content plus selected branch/specialist | Org-first on active `booking` binding | Stable platform alias booking route | Booking object/config + optional brand + binding readiness |
| Join preview | Platform trust before lookup; core org name after valid trusted-token lookup | Paid logo/header and masked-recipient presentation | Org-first on active `join` binding; token organization still wins | Stable platform alias join/recovery route | Invite lifecycle + optional brand + binding readiness |
| Login/auth/recovery | Platform identity/security; core org name only after trusted invite or verified mapping | Paid org skin | Org skin only on active `auth` binding; platform identity/support disclosure | Canonical platform auth/recovery | Platform identity system + `auth` binding audit |
| Patient shell | Platform Patient PWA + core active-org name and explicit multi-org context | Paid logo/colors/header/content | Per-origin org shell only on active `patient_pwa` binding | Canonical platform patient app | Enrollment/session + optional brand + W binding |
| Staff shell | Platform workspace + core membership-org name | Paid workspace presentation | Optional org-first skin only on active `staff_pwa`/staff-shell binding | Canonical platform staff app | Membership + optional brand; W staff scope is pending gate BD-4 |
| Manifest/name/icons/install | Stable platform patient/staff identities | Те же platform manifests; org не меняет icon/name | Separate stable per-origin manifest после full origin audit | Platform patient/staff manifests | Platform or org PWA publication; relevant PWA binding active; assets valid |
| Email | Verified platform From + core org identification for eligible transactional mail | Paid branded header/template and optional validated contact | Authenticated org sender only after complete sender readiness | Platform sender or hold/reject per pending gate BD-3 | Sender identity/readiness + template eligibility |
| SMS | Registered platform/provider sender + neutral core org identification | Paid copy treatment cannot invent sender identity | Registered/verified org sender where provider/region allows it | Platform sender or no-send per policy | Registration, consent/legal basis, delivery policy |
| Push | Exact installed app/origin identity + neutral core org context when safe | Paid presentation only within notification privacy limits | Per-origin app identity after W PWA readiness | Platform subscription/channel fallback | Exact origin/app subscription + topic consent |
| Legal | Platform terms/privacy/operator | Org service/contact/privacy disclosures alongside platform | Contractually assigned org/platform disclosures; processor/operator not hidden | Platform legal pages | Platform legal owner + published org legal data |
| Support/status | Platform support and platform status | Org care/service support plus platform account/security support | Org-first support, platform recovery/status still reachable | Platform support/status | Support responsibility per issue class |
| Domain settings/status | Not configured explanation | Domain upsell/readiness preview | Full verify/status/error/remove UI | Canonical platform management route | Owner/admin capability; custom-domain entitlement |

### 5.1 Core context versus paid additions by surface

| Surface | Minimum core payload (not gated by `branding`) | Paid brand additions |
|---|---|---|
| Platform landing | Platform identity only; no organization implied | None; platform landing is never org-branded |
| Published org profile | Canonical org display name and platform attribution from explicit public projection | Logo/colors/assets, expanded branded copy and optional org contacts |
| Booking | Canonical org name plus selected service/branch/specialist context from trusted booking config | Logo/colors/header/content and optional branded confirmation layout |
| Join | Before lookup platform only; after valid invite lookup canonical org name + masked-recipient context | Logo/header/colors and optional published org contact |
| Auth/recovery | Platform identity; after trusted invite or active binding resolution, canonical org name | Org skin/assets; platform identity, security and recovery disclosure remain |
| Patient shell | Active enrollment's canonical org name and explicit multi-org context | Logo/colors/header/content for the active org |
| Staff shell | Active membership org name and work context | Workspace logo/colors/assets; clinical/management permissions unchanged |
| Email | Verified platform sender plus neutral org identification for eligible transactional object | Branded header/body/template/contact; custom From is a separate sender gate |
| SMS | Registered sender plus neutral org identification and safe link context | Optional branded copy within provider/legal limits; no inferred sender id |
| Push | Exact installed app identity plus privacy-safe org context where useful | Limited branded wording; per-origin identity only after W PWA gate |
| Legal/support | Platform operator/security/recovery identity plus responsible org name/contact where contract requires | Organization-first layout and validated optional service-support presentation |
| Domain management | Canonical org name, hostname/base/binding facts and platform fallback URLs | Brand preview only; no effect on proof or readiness |

In every row, paid additions may disappear independently. The minimum core payload remains after a trusted lookup or
authorized relationship and never contains extra private fields.

### 5.2 Platform landing

- Audience: solo specialist and clinic buyer. Patient entry is a compact `У меня есть приглашение / Войти`, not a
  competing patient-acquisition hero.
- Organization custom domains never redirect the platform root or specialist signup away from BersonCare.
- A published organization profile may be linked from a future directory, but directory launch scope is separate.

### 5.3 Public organization profile and booking

- A public projection contains only explicitly published fields; it never renders private organization/base rows.
- Its canonical platform route uses a server-owned alias record from section 9.3; display slug is lookup/presentation,
  never authority and never an organization identifier accepted from a business-action payload.
- Name/logo/colors/contact, specialists, services, branches and booking availability have independent publication or
  runtime availability. Missing optional data collapses; it does not expose setup controls.
- Unpublished organization: neutral platform 404/recovery. Suspended organization: retained branded identity may be
  shown with booking disabled and a safe contact path according to lifecycle policy.
- Booking creates/uses server-owned booking context. A query `organizationId`, slug or custom Host cannot reassign a
  slot/service/specialist to another organization.

### 5.4 Join, auth and recovery

- Before token validation, show platform trust only. After safe lookup, the core organization name may be shown;
  logo/brand assets require their paid published readiness. Neither state reveals patient name, diagnosis, service
  or other clinical data.
- The invited email is masked. Wrong-account recovery switches identity or requests a new invite; it never edits the
  invite recipient client-side.
- Account recovery is platform-owned even under white-label. Organization presentation can surround the flow, but
  recovery credentials, callback origins and support are controlled by the identity system.
- Invite/auth callback URLs are built from allowlisted active origins, never request `Host`. If custom origin becomes
  unavailable, a canonical platform recovery URL remains valid.

### 5.5 Patient and staff shells

- On the platform app, organization identity marks current care/work context; it does not replace global account and
  security surfaces.
- Patient multi-org: one platform app is the default. The active organization is always visible; switching validates
  enrollment before navigation.
- A W per-origin patient app is organization-scoped presentation. Links to another enrollment must move through an
  explicit platform handoff/context chooser; the app must not silently recolor itself as a different organization.
- Staff has one active organization, so no organization picker. Solo UI omits meaningless team branding controls;
  clinic owner/admin manages brand in the management surface. Specialist/assistant consume the effective brand but do
  not configure it by default.

## 6. Manifest, icon and install contract

### Platform identities — launch-safe default

- Keep stable patient `id=/app`, `start_url=/app/patient`, `scope=/app` and stable staff `id=/app-staff`,
  `start_url=/app/doctor`, `scope=/app` unless a dedicated implementation ADR changes them.
- Organization identity on the platform origin must not dynamically change manifest name/icon by active enrollment.
  One installed identity cannot honestly represent several organizations.
- Install is optional; browser entry remains complete. Push permission is a later, explicit user gesture.

### White-label per-origin readiness gate

Before a custom-origin manifest can be `published`, the relevant `patient_pwa` or `staff_pwa` binding and all of the
following must pass:

1. verified hostname ownership, active managed TLS and routing;
2. stable per-origin manifest `id`, in-origin `start_url`/`scope` and validated name/short name;
3. required icon sizes/formats, contrast-safe colors and platform fallback assets;
4. session/cookie, CSRF origin and OAuth callback audit;
5. service-worker registration/update/unregister and cache isolation audit;
6. Web Push subscription/VAPID/origin behavior and uninstall/rebrand recovery;
7. legal/support links and canonical platform fallback;
8. desktop/mobile install smoke on supported browser families.

Changing logo/name does not change manifest `id`. Moving/removing a domain preserves a quarantine/redirect record and
does not assign the old installed identity to another organization.

## 7. Messaging presentation contract

### 7.1 Email

Email has a complete authenticated identity, not merely a visible brand. One `EmailSenderIdentity` binds:

- visible RFC `From` address/domain and display name;
- envelope `MAIL FROM` / `Return-Path` domain and provider bounce route;
- DKIM signing domain and active selector set, including rotation overlap;
- SPF authorization for the effective envelope path;
- DMARC policy/result and alignment of `From` with DKIM and/or SPF identities;
- provider account/domain verification and provider delivery readiness;
- separately validated `Reply-To` address;
- bounce/complaint webhook or provider event route, suppression ownership and recovery owner;
- eligible template classes and presentation tier.

Logo upload, web-host ownership or one DNS record proves none of the other dimensions. `active` is reached only when
provider verification, authentication/alignment, bounce/complaint routing, entitlement and template eligibility all
pass for the exact identity. Domain proof alone is `domain_proved`, not `verified` or `active`.

| Sender state | Effective behavior |
|---|---|
| `not_configured` | Verified platform From; neutral core org identification for eligible transactional mail, paid branded header only if O is ready |
| `domain_proof_pending` / `domain_proof_failed` | Platform sender remains safe default; management shows exact proof error |
| `domain_proved` | Ownership only; provider, DKIM/SPF/DMARC alignment and bounce path are still untrusted |
| `provider_verified` | Provider recognizes identity; authentication/alignment and event route may still be pending |
| `alignment_pending` / `alignment_failed` | No custom From; show failing SPF/DKIM/DMARC dimension without calling sender active |
| `readiness_ready` | Provider + aligned authentication + Return-Path/bounce/complaint route ready; template activation still explicit |
| `active` | Custom org From may be used only for eligible template classes |
| `degraded` / `revoked` | Never spoof org domain; apply chosen fallback-vs-hold policy and alert recovery owner |

`Reply-To` is used only after address validation. Bounce/complaint suppression is platform-wide by recipient and is
not bypassed by changing org brand or sender. Delivery audit stores effective sender identity and template version,
not raw invite token or clinical payload. Every attempt records effective presentation tier, actual `From` identity
reference, envelope/Return-Path reference, DKIM signer/selector reference, alignment result, `Reply-To` reference,
fallback/hold reason, provider correlation id and template revision. Events link to the attempt so a bounce,
complaint, provider revoke or DNS rotation can be diagnosed without logging message body.

**Pending owner request BD-3 (`status=pending`, owner ruling: none):** on custom sender failure, either (A, planner
recommendation) send from verified platform identity with explicit `Организация через BersonCare` disclosure, or
(B) hold/reject delivery for organizations whose contract requires no platform fallback. Until an explicit ruling,
the safe default is platform fallback for transactional identity/security delivery and hold for custom-only marketing.

Recovery must cover partial failures rather than collapse them into `DNS failed`: DKIM pass without DMARC alignment,
broken Return-Path/bounce routing, provider revoke, selector rotation with only one valid key, SPF loss and complaint
webhook outage each deactivate only the affected custom identity/template use and apply BD-3; they never authorize a
different sender or erase previous delivery audit.

### 7.2 SMS

- SMS is optional/fallback invite transport, not stronger authentication and not an automatic notification-topic
  default.
- Sender name/number depends on provider and jurisdiction registration. Web hostname/email sender readiness does not
  activate it.
- Copy is neutral: platform/organization, expiry and HTTPS link; no clinical details.
- If custom sender is unavailable, use the explicitly configured platform sender or do not send. Never substitute an
  unregistered alphanumeric org name.

### 7.3 Push

- Notification comes from the exact installed web app/origin subscription. Server cannot cosmetically move a
  subscription between origins.
- Platform PWA may show active organization in a neutral title/body. Sensitive content stays inside authorized app.
- A per-origin W app uses its org identity only after enrollment/session revalidation. Click destination is an
  allowlisted relative route resolved against the subscription's supported origin.

## 8. Legal and support ownership

| Issue | Primary visible contact | Mandatory fallback/escalation |
|---|---|---|
| Care delivery, schedule, service/payment question | Organization support | Platform path if org contact missing/unavailable |
| Account, login, security, domain failure | Platform support | Organization may assist but cannot reset platform identity ad hoc |
| Privacy/data-controller request | Disclosed party/parties per contract | Platform privacy/operator contact remains published where required |
| Platform incident/status | Platform status/support | Organization can link, not replace source of truth |

White-label does not mean anonymous operator. Exact controller/processor language requires legal approval, but UX must
reserve permanent locations for legal entity, privacy, terms, support and platform recovery.

## 9. Custom-domain base, surface bindings and UI

Custom domain is deliberately two objects. `HostnameBase` proves that one normalized hostname is controlled and can
reliably reach the platform. `HostnameSurfaceBinding` publishes one allowed surface on that base. A failed optional
surface never changes the readiness of a safe sibling.

### 9.1 `HostnameBase`

```text
not_configured
  -> requested
  -> ownership_pending
      -> ownership_failed
      -> ownership_verified
  -> certificate_pending
      -> certificate_failed
      -> routing_pending
  -> base_ready
      -> degraded
      -> suspended
      -> deleting
  -> deleted/quarantined
```

The base owns normalized hostname, global uniqueness, immutable organization target, ownership proof, TLS lifecycle,
routing health, organization lifecycle, `custom_domain` entitlement/decommission state and quarantine. `base_ready`
means only that these base dimensions pass. It does **not** mean that public, booking, join, auth or either PWA can be
served there.

### 9.2 `HostnameSurfaceBinding`

Allowed `surface` values are `public_profile`, `booking`, `join`, `auth`, `patient_pwa`, `staff_pwa`. Each binding has
an independent lifecycle:

```text
disabled -> pending_audit -> active -> degraded -> suspended
                     \-> audit_failed -> pending_audit
```

Every binding points to one `HostnameBase`, one route enum and the immutable organization target inherited from the
base. Its readiness tuple includes `base_ready`, the surface's own publication/business config, entitlement where
applicable and its own security/origin audit. The effective resolver asks for one surface and returns that binding's
`active`, canonical fallback, blocked or recovery result; it does not aggregate sibling states. Thus
`public_profile=active + auth=pending_audit` and `booking=active + patient_pwa=audit_failed` are valid states.
Selective decommission suspends only chosen bindings; base removal suspends all and starts dependency-aware removal.

The management screen shows separately:

- base panel: normalized hostname/owning organization, ownership proof and last check, certificate/renewal,
  DNS/routing health, entitlement/decommission and quarantine;
- surface table: every allowed binding, `disabled/pending_audit/active/audit_failed/degraded/suspended`, its required
  checks, last evidence and independent enable/recheck/suspend action;
- canonical platform URLs for every enabled surface;
- actionable error, retry/recheck and remove actions;
- audit actor/time and quarantine end after removal.

`ownership_verified` is not base readiness, and `base_ready` is not surface readiness. No all-or-nothing `active`
flag exists across the hostname.

### 9.3 Canonical platform alias lifecycle

Every organization surface has a canonical platform route through a server-owned `PlatformAlias` record. It contains
an immutable organization target, normalized current slug, alias version/status and allowed route enums. The slug is
only a lookup/presentation key; authorization and business objects still resolve through trusted server records.

- Normalize deterministically (Unicode normalization/transliteration policy, lowercase ASCII, single hyphens,
  trimmed separators) before uniqueness checks; reserve platform/system/auth/legal route names.
- Current normalized aliases are globally unique within the platform route namespace. Collisions fail explicitly;
  the system never adds a numeric suffix silently after publication.
- Rename creates a new current version and retires the old alias into a server-owned redirect record to the same
  immutable organization. Old links redirect at most once to the equivalent route enum, never to an arbitrary URL.
- Hidden/unpublished projection returns neutral not-found/recovery while retaining the alias mapping. Suspension or
  organization closure preserves safe identity/legal/contact as lifecycle policy allows and disables business
  actions; it never releases the slug to another organization.
- Deleted/retired aliases enter quarantine. There is no silent reuse. Any later reuse requires an explicit platform
  policy, completed quarantine, fresh conflict/security review and an audited assignment; existing redirects must be
  removed or resolved safely first.
- One alias may expose only explicitly supported route enums. A public profile alias cannot make auth/PWA ready or
  re-target booking/invite objects.

### 9.4 Loop-safe redirect contract

1. Unknown/unmapped Host → safe platform 404; never guess organization from slug/query.
2. Known Host with non-ready requested binding → at most one redirect to the equivalent current platform alias route;
   a healthy sibling binding on that Host remains active.
3. Canonical platform route does not automatically redirect back to custom Host. A user may follow an explicit,
   server-generated active-domain link after readiness recheck.
4. Redirect targets come from route enums/server mapping; arbitrary `next`, absolute `return_to` and header-derived
   origins are rejected.
5. Token entry is exchanged/validated server-side before any cross-origin navigation. Raw bearer token is removed
   from visible URL and never copied through an untrusted redirect/referrer.
6. Auth/OAuth callbacks use explicit per-origin allowlists. On origin failure, restart recovery on canonical platform;
   do not bounce callback parameters between hosts.
7. Removed hostname is quarantined and cannot map to another organization until ownership is freshly proved and the
   quarantine policy expires.
8. Old platform alias after rename redirects through its stored immutable target and route enum. Alias collisions,
   quarantined aliases and aliases of removed organizations never resolve by fuzzy slug or current display name.

## 10. Failure and recovery matrix

| Failure | Public/user result | Management/ops result | Security rule |
|---|---|---|---|
| Brand draft/invalid asset | Platform fallback + safe org text | Field-level validation; draft retained | No client-supplied asset override |
| Branding entitlement off | Platform visuals + mandatory core org context; retained published data not deleted | Read-only preview/upgrade according to tariff policy | Entitlement cannot hide trusted context or grant data access |
| Unknown custom Host | Neutral 404/platform entry | No org data disclosed | No fuzzy mapping |
| Domain ownership/base pending | Canonical platform surface | Base DNS/TLS/routing instruction + recheck | No binding activation before base ready |
| One surface binding failed | Failed surface uses one-way canonical fallback; ready siblings remain on custom Host | Per-binding evidence/error/recheck | No hostname-wide activation or outage |
| Organization suspended | Safe identity/contact; business action disabled | Lifecycle recovery owner/CTA | Domain does not bypass suspension |
| Custom sender degraded | Platform fallback or hold per pending gate BD-3 | Exact identity/alignment/bounce failure + remediation | Never spoof From/sender id |
| Invalid PWA assets/origin audit | Platform manifest/install only | W publish blocked | Stable IDs; no mixed-origin SW/push |
| Patient opens wrong-org deep link | Neutral denial/context recovery | Auditable only if policy requires | Enrollment/object beats Host/brand |
| Support contact invalid | Platform support fallback | Block org-support publication | Recovery always reachable |

## 11. Ownership and publication objects

Future implementation should keep these concepts separate even if storage is later consolidated:

| Object | Scope/owner | Required lifecycle/audit |
|---|---|---|
| Platform brand and canonical origins | Platform-global | Versioned publish; restricted global-admin change |
| Platform alias | Immutable `organization_id` target + platform route namespace | normalized globally unique current alias; versioned rename redirects; hidden/suspended/retired/quarantined; no silent reuse |
| Organization brand profile | `organization_id` | draft/validation_failed/ready/published/suspended; revision + actor |
| Public organization projection | `organization_id` | draft/published/hidden; explicit field projection |
| HostnameBase | immutable `organization_id` target | normalization/uniqueness, ownership, TLS, routing, entitlement/decommission, base health, removal/quarantine |
| HostnameSurfaceBinding | hostname base + route enum + inherited organization | disabled/pending audit/active/audit failed/degraded/suspended independently per surface |
| Email sender identity | `organization_id` or platform-global | From + envelope/Return-Path + DKIM/SPF/DMARC alignment + provider + Reply-To + bounce/complaint route + template eligibility; effective identity per attempt |
| SMS sender identity | `organization_id` or platform-global | provider/region registration + active/degraded/revoked |
| Per-origin PWA publication | hostname + organization + app class | manifest revision, stable id, origin audit, published/disabled |
| Legal/support profile | platform-global and/or `organization_id` | validated contacts, version/effective dates |

No new integration/domain configuration belongs in process env. Operational, tenant-aware and integration settings
must follow DB-backed configuration and organization-override conventions during implementation.

## 12. Pending owner decision requests and safe defaults

No BD item below is an owner ruling. All have `status=pending`, `owner ruling=none` and `source=planner proposal,
2026-07-15`. Only an explicit, traceable owner answer may change an item to `ruled`; that update must record exact
source/date. A safe default is temporary fail-safe behavior, not reconstructed consent.

| ID | Status / owner ruling / source | Request | Planner recommendation | Safe default until ruling | Downstream impact |
|---|---|---|---|---|---|
| BD-1 | pending / none / planner proposal 2026-07-15 | How much platform disclosure remains in W | Org-first with legal/operator/security disclosure | Keep platform disclosure | Final W visuals, legal copy, QA |
| BD-2 | pending / none / planner proposal 2026-07-15 | Which custom-domain bindings launch first | Public profile + booking + join first; auth/PWA only after their own audits | Canonical platform for auth/PWA; no effect on ready public bindings | UX-06 setup IA, launch and implementation scope |
| BD-3 | pending / none / planner proposal 2026-07-15 | Custom sender failure: fallback vs hold/reject by template class | Disclosed platform fallback for transactional mail | Transactional fallback; custom-only marketing held | Delivery policy, sender status/recovery screens, compliance |
| BD-4 | pending / none / planner proposal 2026-07-15 | Staff shell white-label depth | Platform workspace + org identity; no full staff rebrand at launch | P/O staff shell | UX-06 staff composition, W staff binding scope |
| BD-5 | pending / none / planner proposal 2026-07-15 | Per-origin patient PWA and multi-org behavior | One platform app first; per-origin W later and org-scoped | Stable platform manifest only | W install prototype, context handoff, implementation |
| BD-6 | pending / none / planner proposal 2026-07-15 | First-launch public scope | Org profile + booking + join projection; directory later | No public directory | Platform/public IA and acquisition scope |

These requests belong in UX-08. UX-06 may model conditional states, but must not silently convert planner
recommendations, target capability names or W launch candidates into current facts or approved launch scope.

## 13. Acceptance scenarios for independent audit

- platform landing remains platform-owned under every tier;
- org A custom Host cannot render/authorize org B invite, booking, enrollment or private object;
- unknown/degraded/removed hostname reaches safe canonical recovery without a loop;
- public binding active while auth is pending, and booking active while PWA audit failed; sibling surfaces stay live;
- selective surface decommission does not remove the hostname base or unrelated bindings;
- branding disabled + valid patient invite/booking/patient shell still shows trusted core org name with platform visuals;
- platform alias rename keeps old links on the same immutable organization; collision/quarantine/removed-org aliases
  never silently resolve to another organization;
- O branding changes shell content but not platform manifest identity;
- patient with org A+B uses one platform app without manifest mutation;
- W PWA is unavailable until every origin gate passes;
- verified web domain but unverified email/SMS sender never spoofs organization identity;
- custom sender degraded follows the safe default while pending BD-3 and records effective sender;
- DKIM pass with failed DMARC alignment, broken Return-Path, provider revoke and partial selector rotation cannot be
  called `active` and produce diagnosable fallback/hold audit without message-body logging;
- entitlement enabled + missing capability, and capability present + readiness failed, remain distinct;
- legal/platform support remains reachable from public, join/auth, patient/staff and domain failure states.
- BD-1…BD-6 remain pending requests until a dated source records an explicit owner ruling.
