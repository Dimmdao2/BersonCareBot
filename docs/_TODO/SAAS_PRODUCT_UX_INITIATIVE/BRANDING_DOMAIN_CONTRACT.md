# UX-05 — Branding and domain contract

**Статус:** latest owner clarifications integrated; awaiting full independent audit. Предыдущий UX-05 PASS остаётся
историческим baseline до этих уточнений.
**Authority:** производный branding contract; `OWNER_RULINGS_2026-07-16.md` имеет product/UX приоритет.
**Дата:** 2026-07-15.  
**Scope:** platform landing, organization identity, resolved paid-brand boundary, future custom domains/generated PWA,
sender presentation, legal/support и безопасная деградация. Это discovery-контракт; application code, schema, DB и
тарифы не менялись.

## 1. Что является каноном

Этот контракт развивает, но не отменяет:

- `OWNER_RULINGS_2026-07-16.md` как высший product/UX authority; всё ниже является производным и не может
  переопределить его resolved/deferred/rejected границы;
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

## 2. Core context, launch presentation and deferred future direction

`Core organization context` не является брендингом и не продаётся как paid mechanic. После trusted lookup или для
разрешённой public projection он всегда содержит минимально необходимую идентификацию организации: canonical
display name и нейтральную attribution. На platform-default surfaces действует identity поверхности: Therapysto
для staff/admin и Therapygo для patient. Fully branded org surface использует бренд клиники и не обязана визуально
показывать Therapysto или Therapygo; exact legal/support/security information,
responsible-party copy и presentation определяются отдельным legal/contract/security review.

`Brand presentation` — отдельный published слой: organization name/logo, branded header/body, optional
contacts/content и template presentation поверх общей platform design system. Он требует `branding` entitlement, валидной published revision и
surface-specific readiness. Его отсутствие всегда деградирует к platform visuals + core context, а не к анонимной
поверхности.

| Уровень                                          | Смысл                                                                                                                                                                      | Что не обещает                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **P — Platform-only**                            | Therapysto является staff/admin identity, Therapygo — patient identity; surface identity служит trust anchor/origin/sender fallback, а core organization context показывается там, где подтверждён trusted object/relationship или public projection | Paid brand presentation, отдельный домен или sender identity           |
| **O — Organization identity**                    | На platform origin поверх core context опубликованы organization name/logo, contacts и branded content в общей design system                                               | Отдельную installed app identity, custom hostname или sender domain    |
| **F — future full branded organization surface** | Собственный domain или platform subdomain, org name/logo вместо product-facing platform branding, единый platform layout/design                                            | Per-clinic theme/layout, separate codebase или native organization app |

Only `P` and conservative `O` are active initial-release presentation contracts. `F` is an owner-approved future
commercial capability, but remains absent from initial launch until its domain/origin readiness stage is actually
implemented. It reuses the same product layout/design and changes identity/presentation, not the application model.
A verified hostname alone never upgrades any other surface.

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

The `F` column below is an approved future capability contract, not initial-release behavior. It records readiness
boundaries so future work does not weaken authorization; every `F` cell is absent from initial release.

| Surface                     | P — platform-only                                                                                                    | O — organization identity                                                   | F — future full branded org surface                                                                                                   | Canonical fallback                                                                                                           | Owner / readiness                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Platform landing            | Therapysto acquisition для специалиста/клиники                                                                       | Не подменяется организацией                                                 | Не подменяется организацией                                                                                                           | Platform landing                                                                                                             | Platform; всегда published                                                 |
| Organization public profile | Platform chrome + core display name from published projection                                                        | Paid name/logo/content, specialists, services, addresses, optional contacts | Org-first on active `public_profile` binding; no required visible platform brand inferred                                             | Stable platform alias route                                                                                                  | Public projection + optional brand revision + binding readiness            |
| Public booking              | Platform booking + core org name/context                                                                             | Paid visuals/content plus selected branch/specialist                        | Org-first on active `booking` binding                                                                                                 | Stable platform alias booking route                                                                                          | Booking object/config + optional brand + binding readiness                 |
| Join preview                | Platform trust before lookup; core org name after valid trusted-token lookup                                         | Paid logo/header and masked-recipient presentation                          | Org-first on active `join` binding; token organization still wins                                                                     | Stable platform alias join/recovery route                                                                                    | Invite lifecycle + optional brand + binding readiness                      |
| Login/auth/recovery         | Platform identity/security; core org name only after trusted invite or verified mapping                              | Paid org skin                                                               | Org-branded auth on active `auth` binding; recovery/security function remains reachable without prescribing visible platform branding | Canonical platform auth/recovery                                                                                             | Platform identity system + `auth` binding audit                            |
| Patient shell               | Platform app + core active-org name and explicit multi-org context                                                   | Paid name/logo/header/content in shared design                              | Org-branded identity on pinned origin; same product layout/design                                                                     | Canonical platform patient app                                                                                               | Enrollment/session + optional brand; future origin not launch-ready        |
| Staff shell                 | Platform workspace + core membership-org name                                                                        | Paid name/logo/header/content in shared design                              | Org-branded identity on pinned origin; same product layout/design                                                                     | Canonical platform staff app                                                                                                 | Membership + optional brand; future origin not launch-ready                |
| Manifest/name/icons/install | Stable platform patient/staff identities                                                                             | Те же platform manifests; org не меняет icon/name                           | Generated stable per-origin PWA manifest/name/icons after full origin audit                                                           | Platform patient/staff manifests                                                                                             | Platform or org PWA publication; relevant PWA binding active; assets valid |
| Email                       | Verified platform From + core org identification only when no custom provider is configured                          | Paid branded header/template and optional validated contact                 | Authenticated org sender only after complete sender readiness                                                                         | Configured-custom-provider messages use bounded retry within `expires_at`, then expire; no platform sender fallback          | Sender identity/readiness + template eligibility                           |
| SMS                         | Registered platform/provider sender + neutral core org identification while no org custom SMS provider is configured | Paid copy treatment cannot invent sender identity                           | Registered/verified org sender where provider/region allows it                                                                        | Once org custom SMS provider is configured: hold/bounded retry within `expires_at`, then expire; never platform SMS fallback | Registration, consent/legal basis, delivery policy                         |
| Push                        | Exact installed app/origin identity + neutral core org context when safe                                             | Paid presentation only within notification privacy limits                   | Generated org-PWA identity after origin/readiness activation                                                                          | Platform subscription/channel fallback                                                                                       | Exact origin/app subscription + topic consent                              |
| Legal                       | Platform terms/privacy/operator                                                                                      | Org service/contact/privacy content                                         | Exact required parties/copy/presentation follows applicable law/contracts; no visible Therapysto/Therapygo promise                     | Safe legal-information route                                                                                                 | Legal review + validated published data                                    |
| Support/status              | Platform support and status on platform surfaces                                                                     | Org care/service support content                                            | Recovery/support/status functions remain reachable; exact visible identity follows later contract                                     | Safe support/status route                                                                                                    | Support responsibility review per issue class                              |
| Domain settings/status      | Not configured explanation                                                                                           | Domain upsell/readiness preview                                             | Full verify/status/error/remove UI                                                                                                    | Canonical platform management route                                                                                          | Owner/admin capability; custom-domain entitlement                          |

### 5.1 Core context versus paid additions by surface

| Surface               | Minimum core payload (not gated by `branding`)                                                                                                 | Paid brand additions                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Platform landing      | Platform identity only; no organization implied                                                                                                | None; platform landing is never org-branded                                                                    |
| Published org profile | Canonical org display name from explicit public projection; platform attribution applies only on platform-default presentation                 | Name/logo, expanded branded copy and optional org contacts in shared design                                    |
| Booking               | Canonical org name plus selected service/branch/specialist context from trusted booking config                                                 | Name/logo/header/content in the shared booking layout                                                          |
| Join                  | Before lookup platform only; after valid invite lookup canonical org name + masked-recipient context                                           | Name/logo/header and optional published org contact in shared design                                           |
| Auth/recovery         | On platform-default origin: platform identity; after trusted invite or active binding resolution, canonical org name                           | Org skin/assets; security/recovery function remains reachable, exact visible identity is not selected here     |
| Patient shell         | Active enrollment's canonical org name and explicit multi-org context                                                                          | Name/logo/header/content for the active org in shared design                                                   |
| Staff shell           | Active membership org name and work context                                                                                                    | Workspace name/logo/assets; shared layout/design and clinical/management permissions unchanged                 |
| Email                 | Verified platform sender plus neutral org identification for eligible transactional object                                                     | Branded header/body/template/contact; custom From is a separate sender gate                                    |
| SMS                   | Registered sender plus neutral org identification and safe link context                                                                        | Optional branded copy within provider/legal limits; no inferred sender id                                      |
| Push                  | Exact installed app identity plus privacy-safe org context where useful                                                                        | Limited branded wording; future org-app identity remains deferred                                              |
| Legal/support         | Platform-default surface uses its Therapysto/Therapygo identity and platform information; fully branded surface exposes information required by later legal/contract/security review | Organization-first layout and validated service-support presentation; no mandatory visible Therapysto/Therapygo inferred |
| Domain management     | Canonical org name, hostname/base/binding facts and platform fallback URLs                                                                     | Brand preview only; no effect on proof or readiness                                                            |

In every row, paid additions may disappear independently. The minimum core payload remains after a trusted lookup or
authorized relationship and never contains extra private fields.

### 5.2 Platform landing

- Audience: solo specialist and clinic buyer. Patient entry is a compact `У меня есть приглашение / Войти`, not a
  competing patient-acquisition hero.
- Organization custom domains never redirect the Therapysto root or specialist signup away from Therapysto.
- A published organization profile may be linked from a future directory. Directory/search is explicitly outside
  initial launch by owner ruling 2026-07-16.

### 5.3 Public organization profile and booking

- A public projection contains only explicitly published fields; it never renders private organization/base rows.
- Its canonical platform route uses a server-owned alias record from section 9.3; display slug is lookup/presentation,
  never authority and never an organization identifier accepted from a business-action payload.
- Name/logo/contact, specialists, services, branches and booking availability have independent publication or
  runtime availability. Missing optional data collapses; it does not expose setup controls.
- Unpublished organization: neutral platform 404/recovery. Suspended organization: retained branded identity may be
  shown with booking disabled and a safe contact path according to lifecycle policy.
- Booking creates/uses server-owned booking context. A query `organizationId`, slug or custom Host cannot reassign a
  slot/service/specialist to another organization.

### 5.4 Join, auth and recovery

- Before token validation on platform origin, show platform trust only; a ready fully branded origin may show its
  verified org presentation without exposing recipient data. After safe lookup, the core organization name may be shown;
  logo/brand assets require their paid published readiness. Neither state reveals patient name, diagnosis, service
  or other clinical data.
- The invited email is masked. Wrong-account recovery switches identity or requests a new invite; it never edits the
  invite recipient client-side.
- Account recovery remains platform-owned even in any future org-specific presentation. Organization presentation can surround the flow, but
  recovery credentials, callback origins and support are controlled by the identity system.
- Invite/auth callback URLs are built from allowlisted active origins, never request `Host`. If custom origin becomes
  unavailable, a canonical platform recovery URL remains valid.

### 5.5 Patient and staff shells

- On the platform app, organization identity marks current care/work context; it does not replace global account and
  security surfaces.
- Patient multi-org: one platform app is the default. The active organization is always visible; switching validates
  enrollment before navigation.
- The approved future generated org PWA is organization-scoped once its future commercial/implementation activation
  and readiness gates pass. Links to another enrollment must move through an
  explicit platform handoff/context chooser; the app must not silently recolor itself as a different organization.
- Staff has one active organization, so no organization picker. Solo UI omits meaningless team branding controls;
  clinic owner/admin manages brand in the management surface. Specialist consumes the effective brand but does not
  configure it by default; future assistant behavior is outside current scope.

## 6. Manifest, icon and install contract

### Platform identities — initial release

- Keep stable patient `id=/app`, `start_url=/app/patient`, `scope=/app` and stable staff `id=/app-staff`,
  `start_url=/app/doctor`, `scope=/app` unless a dedicated implementation ADR changes them.
- Organization identity on the platform origin must not dynamically change manifest name/icon by active enrollment.
  One installed identity cannot honestly represent several organizations.
- Install is optional; browser entry remains complete. Push permission is a later, explicit user gesture.

### Future organization-specific origin/PWA readiness gate

Owner direction: paid organization branding may use a custom domain or platform subdomain and automatically create
an organization PWA manifest from verified org name/logo/domain settings. It is not initial release: the platform
web app ships first. The clinic/staff product remains web and may also be installable as desktop PWA. Separate
organization-branded native mobile applications are outside current scope; store/developer-account/publication/
cost/time questions remain non-blocking research backlog.

Before a custom-origin manifest can be `published`, the relevant `patient_pwa` or `staff_pwa` binding and all of the
following must pass:

1. verified hostname ownership, active managed TLS and routing;
2. stable per-origin manifest `id`, in-origin `start_url`/`scope` and validated name/short name;
3. required icon sizes/formats, shared contrast-safe platform design tokens and platform fallback assets;
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

| Sender state                                   | Effective behavior                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `not_configured`                               | Verified platform From; neutral core org identification for eligible transactional mail, paid branded header only if O is ready                  |
| `domain_proof_pending` / `domain_proof_failed` | If a custom provider is configured, user messages hold/retry within `expires_at` then expire; management shows exact proof error and owner alert |
| `domain_proved`                                | Ownership only; configured-provider user messages remain held because provider/alignment/bounce path are untrusted                               |
| `provider_verified`                            | Provider recognizes identity; configured-provider user messages remain held until authentication/alignment and event route are ready             |
| `alignment_pending` / `alignment_failed`       | No custom From and no platform fallback for configured-provider user messages; hold/expire and show failing dimension                            |
| `readiness_ready`                              | Provider + aligned authentication + Return-Path/bounce/complaint route ready; template activation still explicit                                 |
| `active`                                       | Custom org From may be used only for eligible template classes                                                                                   |
| `degraded` / `revoked`                         | Never spoof or use platform fallback for custom-provider user messages; hold within `expires_at`, expire, and alert recovery owner               |

`Reply-To` is used only after address validation. Bounce/complaint suppression is platform-wide by recipient and is
not bypassed by changing org brand or sender. Delivery audit stores effective sender identity and template version,
not raw invite token or clinical payload. Every attempt records effective presentation tier, actual `From` identity
reference, envelope/Return-Path reference, DKIM signer/selector reference, alignment result, `Reply-To` reference,
fallback/hold reason, provider correlation id and template revision. Events link to the attempt so a bounce,
complaint, provider revoke or DNS rotation can be diagnosed without logging message body.

**Owner ruling 2026-07-16:** channel policy is exact. Once an organization custom email provider is configured, no
patient/user email uses the platform email sender. Once an organization custom SMS provider is configured, no
patient/user SMS uses the platform SMS sender. Retry uses only that channel's custom provider while `expires_at` is
valid; expired messages are never sent.

Sender-health incident notification is not fallback delivery: it contains no patient message/body or clinical
content. On transition to `unhealthy`, the registered solo specialist/clinic owner receives an in-app management
incident and a platform service email to the account email, followed by at most one reminder per day and one recovery
notice.

**Standards-backed transport rules:** SMTP `4xx`/enhanced `4.x.x` is transient and `5xx`/`5.x.x` is permanent per
[RFC 3463](https://www.rfc-editor.org/rfc/rfc3463.html); the longer queue cadence in
[RFC 5321 §4.5.4.1](https://www.rfc-editor.org/rfc/rfc5321.html#section-4.5.4.1) is configurable transport guidance,
not a business-message TTL. Recipient-specific permanent failure (for example invalid/unavailable mailbox) terminates
only that message. Permanent authentication/configuration/account/domain failure makes the channel `unhealthy`
immediately. HTTP/SMS submission retries apply to network timeout, `429` (respect `Retry-After`) and
`500/502/503/504`; other `4xx` are permanent unless the provider documents otherwise
([Twilio retry guidance](https://help.twilio.com/articles/48916449686299),
[Twilio 20429](https://www.twilio.com/docs/api/errors/20429)). Retry is bounded, uses backoff+jitter and one stable
`delivery_id`. Once a provider/MTA accepts submission, the platform never creates a new submit; it waits for provider
status/callback and deduplicates callbacks by provider message id. An ambiguous SMTP disconnect after `DATA` is
recorded as `unknown`: SMTP cannot guarantee exactly-once there, so the system reconciles status/dedupe evidence and
does not blindly resubmit a new logical delivery.
This follows the retry/circuit patterns in
[AWS Well-Architected](https://docs.aws.amazon.com/wellarchitected/2023-04-10/framework/rel_mitigate_interaction_failure_limit_retries.html)
and [Azure Circuit Breaker](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker).

**Configurable platform product defaults, not RFC mandates:** `1m / 5m / 15m` with jitter is the
application-to-provider **pre-acceptance submission** schedule for transient network/API failures and SMTP submission
failures only where the provider contract designates application-level retry. A direct SMTP `4xx`/MTA queue uses its
configured SMTP/provider cadence; RFC 5321's roughly 30-minute retry and 4–5-day give-up guidance is the transport
default, but business `expires_at` always caps it and can end it much earlier. After three consecutive systemic
failures mark the sender `unhealthy` and open the circuit; permanent auth/config/account/domain failure opens it
immediately. OTP expires in 10 minutes and is one-use
([NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html)); magic link defaults to 30 minutes; invite email
delivery to 24 hours while invite token defaults to 7 days; appointment changes/reminders expire no later than the
appointment or relevant reminder slot; marketing defaults to a 24-hour/campaign window. Expired is terminal
([Twilio `validity_period`](https://www.twilio.com/docs/messaging/api/message-resource)). Technical delivery metadata
without clinical content defaults to 90 days, configurable for legal/contract requirements; queue payload is
removed/redacted after terminal success/failure/expiry. These values are engineering configuration and do not
reopen an owner decision gate.

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
- Once an organization custom SMS provider is configured, do not send any patient/user SMS through the platform SMS
  sender. Retry only that custom provider within `expires_at`, then expire; never substitute an unregistered
  alphanumeric org name. The owner incident follows the in-app + platform-service-email policy above and contains no
  patient content.

### 7.3 Push

- Notification comes from the exact installed web app/origin subscription. Server cannot cosmetically move a
  subscription between origins.
- Platform PWA may show active organization in a neutral title/body. Sensitive content stays inside authorized app.
- A future per-origin org app uses its org identity only after enrollment/session revalidation. Click destination is an
  allowlisted relative route resolved against the subscription's supported origin.

## 8. Legal and support ownership — implementation/legal review boundary

The table below is an implementation responsibility candidate for later legal/contract review, not an owner ruling
about visible branding on a fully branded surface.

| Issue                                             | Functional responsibility                               | Required reachable function                                                    |
| ------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Care delivery, schedule, service/payment question | Organization support candidate                          | Safe support/recovery path if configured contact is unavailable                |
| Account, login, security, domain failure          | Identity/platform support function                      | Organization cannot reset platform identity ad hoc; recovery remains reachable |
| Privacy/data-controller request                   | Party/parties determined by applicable law and contract | Required request/contact mechanism after legal review                          |
| Platform incident/status                          | Platform incident/status function                       | Accurate incident/status information through a reachable route                 |

Exact controller/operator/processor identity, copy, visible brand and placement require legal/contract/security
approval. UX reserves reachable legal, privacy, terms, support and recovery functions without promising visible
Therapysto/Therapygo/platform branding inside the fully branded org surface.

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

| Failure                                | Public/user result                                                                   | Management/ops result                                                                                                                                                       | Security rule                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Brand draft/invalid asset              | Platform fallback + safe org text                                                    | Field-level validation; draft retained                                                                                                                                      | No client-supplied asset override                                                                      |
| Branding entitlement off               | Platform visuals + mandatory core org context; retained published data not deleted   | Read-only preview/upgrade according to tariff policy                                                                                                                        | Entitlement cannot hide trusted context or grant data access                                           |
| Unknown custom Host                    | Neutral 404/platform entry                                                           | No org data disclosed                                                                                                                                                       | No fuzzy mapping                                                                                       |
| Domain ownership/base pending          | Canonical platform surface                                                           | Base DNS/TLS/routing instruction + recheck                                                                                                                                  | No binding activation before base ready                                                                |
| One surface binding failed             | Failed surface uses one-way canonical fallback; ready siblings remain on custom Host | Per-binding evidence/error/recheck                                                                                                                                          | No hostname-wide activation or outage                                                                  |
| Organization suspended                 | Safe identity/contact; business action disabled                                      | Lifecycle recovery owner/CTA                                                                                                                                                | Domain does not bypass suspension                                                                      |
| Custom sender degraded                 | Hold/retry through the configured custom provider within `expires_at`, then expire   | Exact identity/alignment/bounce failure, circuit state, in-app + platform service-email owner alert without patient content, daily reminder at most, recovery + remediation | Never spoof or use that channel's platform sender for patient/user delivery; stable delivery id/dedupe |
| Invalid future-PWA assets/origin audit | Platform manifest/install only                                                       | Future PWA publication blocked                                                                                                                                              | Stable IDs; no mixed-origin SW/push                                                                    |
| Patient opens wrong-org deep link      | Neutral denial/context recovery                                                      | Auditable only if policy requires                                                                                                                                           | Enrollment/object beats Host/brand                                                                     |
| Support contact invalid                | Platform support fallback                                                            | Block org-support publication                                                                                                                                               | Recovery always reachable                                                                              |

## 11. Ownership and publication objects

Future implementation should keep these concepts separate even if storage is later consolidated:

| Object                               | Scope/owner                                                   | Required lifecycle/audit                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Platform brand and canonical origins | Platform-global                                               | Versioned publish; restricted global-admin change                                                                                                            |
| Platform alias                       | Immutable `organization_id` target + platform route namespace | normalized globally unique current alias; versioned rename redirects; hidden/suspended/retired/quarantined; no silent reuse                                  |
| Organization brand profile           | `organization_id`                                             | draft/validation_failed/ready/published/suspended; revision + actor                                                                                          |
| Public organization projection       | `organization_id`                                             | draft/published/hidden; explicit field projection                                                                                                            |
| HostnameBase                         | immutable `organization_id` target                            | normalization/uniqueness, ownership, TLS, routing, entitlement/decommission, base health, removal/quarantine                                                 |
| HostnameSurfaceBinding               | hostname base + route enum + inherited organization           | disabled/pending audit/active/audit failed/degraded/suspended independently per surface                                                                      |
| Email sender identity                | `organization_id` or platform-global                          | From + envelope/Return-Path + DKIM/SPF/DMARC alignment + provider + Reply-To + bounce/complaint route + template eligibility; effective identity per attempt |
| SMS sender identity                  | `organization_id` or platform-global                          | provider/region registration + active/degraded/revoked                                                                                                       |
| Per-origin PWA publication           | hostname + organization + app class                           | manifest revision, stable id, origin audit, published/disabled                                                                                               |
| Legal/support profile                | platform-global and/or `organization_id`                      | validated contacts, version/effective dates                                                                                                                  |

No new integration/domain configuration belongs in process env. Operational, tenant-aware and integration settings
must follow DB-backed configuration and organization-override conventions during implementation.

## 12. Owner rulings and non-blocking future backlog

Source for current results: [`OWNER_RULINGS_2026-07-16.md`](./OWNER_RULINGS_2026-07-16.md). Historical planner
recommendations remain useful context but do not override resolved wording or future-only timing.

| ID   | Status / owner ruling / source                     | Request                                     | Planner recommendation                                                                                                                                                                                                                               | Safe default until ruling                    | Downstream impact                                       |
| ---- | -------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| BD-1 | ruled / owner clarification 2026-07-16             | Paid org product-facing brand               | Own domain or platform subdomain; org name/logo replace product-facing branding; no custom layout/theme                                                                                                                                              | Platform origin in initial release           | Brand resolver, tariff promise, QA                      |
| BD-2 | future capability / owner clarification 2026-07-16 | Custom origin entry/auth                    | Stage after platform launch and readiness                                                                                                                                                                                                            | Canonical platform origin in initial release | Future setup IA and implementation scope                |
| BD-3 | ruled / owner 2026-07-16 + engineering policy      | Custom-provider failure policy              | Configured custom email forbids platform email and configured custom SMS forbids platform SMS for patient/user delivery; bounded retry within `expires_at`, then expire; alert account owner in-app + platform service email without patient content | Same                                         | Delivery policy, sender status/recovery, compliance     |
| BD-4 | ruled / owner clarification 2026-07-16             | Staff-workspace branded presentation        | Org name/logo may replace product-facing brand on paid org origin; shared layout/design                                                                                                                                                              | Platform workspace in initial release        | Future staff presentation QA                            |
| BD-5 | future capability / owner clarification 2026-07-16 | Organization-specific PWA pinned to one org | Generate manifest/name/icons from verified brand/domain settings; native org app out of scope                                                                                                                                                        | Stable platform app in initial release       | Future PWA implementation; native research backlog only |
| BD-6 | ruled / owner 2026-07-16                           | First public scope                          | Profile + booking + join; directory later                                                                                                                                                                                                            | Same                                         | Platform/public IA                                      |

Future custom-domain/PWA work remains physically absent from initial release. Its approved product contract does not
authorize rollout before readiness, and separate organization native apps remain outside current scope.

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
- future organization PWA is absent from initial release and unavailable until domain/origin and every readiness gate pass; separate native org app is outside scope;
- verified web domain but unverified email/SMS sender never spoofs organization identity;
- custom sender degraded follows the no-platform-fallback, TTL and owner-alert ruling and records effective sender;
- DKIM pass with failed DMARC alignment, broken Return-Path, provider revoke and partial selector rotation cannot be
  called `active` and produce diagnosable fallback/hold audit without message-body logging;
- entitlement enabled + missing capability, and capability present + readiness failed, remain distinct;
- legal/platform support remains reachable from public, join/auth, patient/staff and domain failure states.
- BD-1/BD-4 and BD-3/BD-6 are ruled; BD-2/BD-5 are approved future custom-origin/generated-PWA capabilities, not launch gates.

---

## Implementation log — B1 backend foundation (2026-07-25)

**Built:** `apps/webapp/db/drizzle-migrations/0238_org_brand_publication.sql` (single `org_brand_revisions` table
with `status`+`published_at` on the revision, partial-unique "one published / one draft per org", DB-enforced state
machine via `app.guard_org_brand_revision()`, FORCE RLS), module `apps/webapp/src/modules/org-branding/*`, repo
`apps/webapp/src/infra/repos/pgOrgBranding.ts`, guard `requireOrgBrandingManagementContext`. Commit `361a1920c`.
Scope: name + logo only. No colour/theme, no route/UI, no public/anonymous read path, and NOTHING from tier `F`
(custom domain, per-origin PWA, org sender) — those stay absent per §2.

**Independent adversarial audit (live, real signed principals on a from-dump disposable DB): SHIP-BLOCKED, 2 HIGH.**
Proven SAFE live: staff of org A cannot read or write org B's brand (16 probes); a patient enrolled only in A cannot
read B's published brand even when forced into a B context; drafts/archived invisible to patients; unprincipled
session reads zero rows; patients hold no write privilege; no DELETE/TRUNCATE anywhere. The
enrollment-vs-`current_org_id` predicate was judged CORRECT and kept — a patient's read set is exactly the union of
their active enrollments, which §5.1/§5.5 require for multi-org patient shells, and it cannot reach a non-enrolled org.

HIGH defects found (being fixed):

1. **Patient read was feature-dead.** RLS policy expressions evaluate with the CALLER's privileges, and `app_patient`
   holds no privilege on `public.be_organizations` (nor a read policy under its FORCE RLS), so every patient SELECT
   raised `42501 permission denied for table be_organizations`. Fails closed, but the promised patient read is
   undeliverable and the canonical-name degradation required by §3 would throw instead of degrading. Same blocker in
   `getCoreContext()`. Secondary: because a SELECT policy also gates `UPDATE … WHERE`, staff access silently depended
   on `app_staff` holding SELECT on `org_enrollments`.
   → Fix direction: encapsulate the enrollment check and the canonical-name lookup in `SECURITY DEFINER` helpers
   owned by the principal-helper owner role (the `app.current_*` pattern), so no policy depends on caller table
   privileges. New `app.*` functions must be added to the closure's ownership-normalization preflight in
   `deploy/host/deploy-test-saas.sh`, or the overlay later fails with "must be owner of function".
2. **`ON DELETE SET NULL` on `logo_media_id` is dead and breaks media purge.** The FK's internal
   `UPDATE … SET logo_media_id = NULL` trips the published/archived immutability guard (`P0001`), so the documented
   "purging the asset degrades the brand" never happens; worse, `s3MediaStorage.purgePendingMediaDeleteBatch` deletes
   the S3 objects FIRST and only tolerates SQLSTATE class `23`, so a whole purge batch dies with the assets already
   gone (`strictPlatformUserPurge` shares the exposure). → Guard must tolerate exactly the FK-driven
   non-NULL→NULL logo transition on published/archived rows, nothing wider.

LOW / INFO to keep on the record: `org_brand_revisions` is absent from the enumerated `deploy/postgres/p0-5b-grants.sql`
runtime-DML allowlist (its grants live only inside the migration); deleting a `be_organizations` row cascades brand
history away (the one path that destroys the audit trail); a `draft` can never be discarded (no `draft→archived`, no
DELETE grant); `org_brand_revision_published_content_is_immutable` is nearly unreachable; `REJECTED_MUTATION_KEYS` in
the service is inert. Unverifiable in this slice: any HTTP/route behaviour and entitlement resolution against a real
`org_entitlements` row (no consumer exists yet).

### Re-audit of the fix — M-1, and what it did NOT cover (2026-07-25)

A second independent adversarial audit targeted the new `SECURITY DEFINER` seam itself (the fix widened the
definer surface, and inside a definer body RLS no longer protects anything — the predicate is the only wall).
It reproduced **both** pre-fix HIGH failures and then failed to break the fixed versions: with a real patient
principal, a foreign organization, a deactivated enrolled organization, a random uuid and `NULL` are
**indistinguishable** (`false` / 0 rows / `NULL` name), so the seam is no existence-, name- or active-flag
oracle; privilege independence was proved by _revoking_ `SELECT` on `org_enrollments`/`be_organizations` and
watching both reads still work. Definer hygiene held (`search_path` pinned, `EXECUTE` only for `app_staff` /
`app_patient`, `PUBLIC` denied, `app_owner` still NOLOGIN/BYPASSRLS with **0 members**).

It also found that the HIGH-2 fix had opened **M-1 (MEDIUM), now closed**: the tolerance accepted _any_
single-column `logo_media_id → NULL` write, so `UPDATE org_brand_revisions SET logo_media_id = NULL WHERE id = …`
issued directly by `app_staff` succeeded on **published and archived** rows — blanking the live branded surface
and rewriting the append-only audit row **with no trace**, because the branch deliberately does not re-stamp
`updated_at`. Closed with `AND pg_trigger_depth() > 1`: the referential action always runs inside the RI trigger
of the `media_files` DELETE (depth ≥ 2), a hand-written statement is depth 1. Proven live on a disposable schema
mirror of TEST — direct clear → `P0001` with the row byte-identical; `DELETE` of the media row → succeeds and
degrades the logo on both published and archived revisions.

Two audit findings were deliberately **not** built, because they are owner scope rather than defects:

- there is no deploy-time global FORCE-RLS gate at all (the closure's "exact FORCE assertions" is the 190-line
  specialized finalizer), so a regression to `NO FORCE` on any tenant table is silent. `org_brand_revisions` was
  added to the one-command FORCE cutover/rollback artifact (`deploy/postgres/phase4-force-rls-cutover.sql`, count
  assertion made conditional on the table existing so the emergency rollback stays runnable on a pre-0238
  database), but building a new global gate is a decision, not a fix;
- the patient `FOR SELECT` policy is evaluated for **staff** reads too, so revoking `EXECUTE` on
  `app.current_patient_has_active_org_enrollment` would break staff reads; that coupling is asserted only by a
  text-shape unit test, never by a deploy gate.

## Owner direction on WHO may change branding (2026-07-25) — supersedes the role assumption above

The owner ruled, in their own words, after reading the first implementation:

- **Clinic admin** (the specialist who owns/administers the clinic): may **set, change and delete** the logo,
  change the brand name, and edit their public page (public-page details to be specified later, together).
- **A plain clinic specialist (staff, not admin): may NOT change the brand, the name, or the public page.**

**CORRECTION (same day, after actually reading the guard chain — the first version of this paragraph claimed
the rule was not implemented at all, which was wrong and was reported to the owner as such).** The rule IS
already enforced at the app layer, on exactly the capability model the owner's earlier ruling asked for:
`requireOrgBrandingManagementContext` → `requireOrganizationManagementContext`
(`app-layer/guards/requireRole.ts:367-373`) demands the `organization.management` capability, and
`resolveLaunchCapabilities` (`app-layer/guards/workspaceCapabilities.ts:50-55`) grants that capability only for
membership role `owner` or `admin` — a plain `doctor` membership never receives it, and a global admin in admin
mode gets `platform.operations` only. So a non-admin specialist is already refused the branding mutation
context, and branding is already riding the clinic-admin capability rather than a second role model.

What is genuinely coarse is only the **DB** layer: `org_brand_revisions`' staff policy accepts any `app_staff`
principal of the organization, so the database alone would not distinguish clinic admin from plain doctor. Per
the decision below that is deliberate — the DB enforces the tenant boundary, the app enforces the role.

Also clarified for the record, because the first write-up read as "the logo cannot be deleted": **deleting the
logo is allowed**. What is forbidden is silently rewriting an already-published revision. Removing a logo or
renaming happens by **publishing a new revision** (the previous one is archived), which is what keeps a record of
who changed the clinic's identity and when — and the archive is append-only for the same reason. Product-wise
this must surface as a single "remove logo" action; revisions are an implementation detail the user never sees.

**Open owner choice (asked, not yet answered):** enforce "clinic admin only" in **both** the app and the DB, or
in the **app only**. Recommendation given: app-only, as a single chokepoint (the owner's standing "one chokepoint,
no defensive duplication" rule), with the DB continuing to enforce the own-clinic/foreign-clinic boundary — so a
coding mistake can still never cross tenants. Awaiting the answer before B2 (UI) is built.

### Owner decisions on the brand editing UI (2026-07-25)

- The two actions are named **«Установить»** and **«Очистить»** (not «Заменить»/«Убрать»). «Установить» also
  covers replacing an existing logo — there is no separate replace action.
- **«Очистить» only unlinks the logo from the brand; the image file STAYS in the clinic's file library.** It is
  never queued for deletion as a side effect of clearing the brand. Consequence for 0238: the FK
  `ON DELETE SET NULL` degradation path is reached only when the clinic deletes the file from the library
  itself — clearing the brand is an ordinary new published revision with `logo_media_id = NULL`, and the
  previously used file remains reusable.
- Enforcement of "clinic admin only" (the open choice) is taken as **app-layer single chokepoint**, per the
  owner's standing "one chokepoint, no defensive duplication" rule; the DB keeps enforcing only the
  own-clinic/foreign-clinic boundary, so a coding mistake still cannot cross tenants.

### Owner decision on WHERE branding is visible (2026-07-25)

- **Logo:** inside the cabinet **and** on the clinic's public page. Nowhere else for now.
- **Outbound mail/notifications: clinic NAME only, no logo.** Explicitly deferred: branded e-mail templates
  ("шаблоны писем для брендированных клиник"), which the clinic will configure itself later. Until then the
  platform template stays, carrying the clinic's canonical name.
- The **public page itself is owner-designed work, to be specified together, soon** — so B2 covers the cabinet
  surface and the name in outbound mail; the public-page rendering of the brand waits for that session and must
  read the same published revision rather than growing its own source of truth.

This narrows B2 to: the clinic-admin editing surface (Установить / Очистить + name), the effective-branding
resolution in the staff and patient cabinet shells, and the clinic name in outbound mail. It does NOT include
logo-in-email or the public page.

## Owner spec for the public clinic page — first version (2026-07-26)

The owner asked for the public page to stop being a stub. Verbatim scope, "для начала":

- **Name** — the clinic's name, or a person's name for a solo specialist.
- **Description** — free text about the clinic/specialist.
- **Addresses** — listed from the LOCATIONS already configured in the booking settings, not re-entered.
- **Contacts** — how to reach them.
- **Services with prices and durations** — again from the booking catalogue, not re-entered.
- **Avatar or logo** — the published brand logo, or a personal avatar for a solo specialist.

**Where the data comes from is the important half of this spec:** _«всё это частично берётся из настроек записи,
частично из настроек публичной страницы»_. So the page is a PROJECTION of data the clinic already maintains —
locations, services, prices, durations all come from the booking configuration and must never become a second
copy that can drift — plus a small set of fields that exist only for the public page (description, contacts,
whatever presentation choices we add later).

**Therefore a "public page settings" screen is required** («надо сделать клиникам такую страницу настроек»):
one place where the clinic edits the public-page-only fields and controls what is shown, sitting beside the
brand and public-address sections in the Клиника tab.

Open questions NOT answered by this spec, to raise before guessing: whether individual services/locations can
be hidden from the public page; whether prices may be shown as "from X"; whether the page is visible before the
clinic explicitly publishes it; and what a solo specialist sees instead of clinic-shaped wording. Defaults must
be conservative — show only what the clinic already made public through booking, never expose a location or a
price that the booking flow itself does not expose.

### Owner rulings I initially MISSED, recorded late (sent 2026-07-25, read 2026-07-26)

I was polling the wrong message channel and did not see these for hours. Both change the design.

**1. Branding is fully PUBLIC.** «Я думаю лого и брендирование должно быть публичным полностью, как и публичная
страница клиники/специалиста.» So the published brand — name and logo — is not patient-only data. This directly
contradicts what 0238 currently implements: its patient `FOR SELECT` policy requires
`app.current_patient_user_id() IS NOT NULL` plus an active enrollment, which means an anonymous visitor cannot
read a published brand at all. The public clinic page and the public booking funnel are both anonymous surfaces
and need the published name/logo, so a public read path is required.
Do NOT solve this by loosening the table policy for `PUBLIC` — follow the pattern this codebase already uses for
anonymous reads: a narrow `SECURITY DEFINER` accessor exposing ONLY the published projection (name, logo) for an
organization that is active and published, granted to the unauthenticated pool role, exactly like
`app.is_smtp_outbound_configured()` (0240) and `app.read_org_brand_core_context()` (0238). Draft and archived
revisions must stay invisible; only the published one is public. Any new definer function must bump
`expected_secdef_count` in `deploy/host/deploy-test-saas.sh` in the same change.

**2. SMTP provider, given directly:** `mail.hosting.reg.ru`, port 465, TLS, sender `no-reply@bersoncare.ru`.
Verified 2026-07-26 that the credential restored from the prod dump onto TEST matches exactly this provider,
port, TLS flag and sender — so nothing had to be configured by hand after all.

**3. Demo data is never to be seeded again.** «Демо данные НЕ ЗАВОДИТЬ ВООБЩЕ — мы их вырезали уже из миграции,
было нужно только для разработки.» This is why the product smoke gate must be repointed at real clinics rather
than re-seeded synthetic ones, and why two closure gates skip instead of recreating fixtures.

### Owner answers on the public page (2026-07-26)

- **Visibility: an explicit «Опубликовать» action.** Setting the address does NOT put the page in front of the
  world; the clinic prepares it privately and publishes deliberately.
- **Content selection: everything that is enabled in the booking settings, no second switch.** «Чтобы спрятать
  услугу надо просто выключить её в настройках записи.» So the public page is a pure projection — there is no
  per-service "show publicly" flag to maintain and nothing can drift. Hiding something from the public page and
  hiding it from booking are deliberately the same act.
- **Solo specialist and clinic share ONE page, with the wording adapting** — first-person wording and an avatar
  for a solo specialist instead of clinic-shaped copy and a logo.
