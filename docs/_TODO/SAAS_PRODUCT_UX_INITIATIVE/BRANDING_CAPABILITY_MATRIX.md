# UX-05 — Branding capability and entitlement matrix

**Статус:** integrated correction complete; awaiting full independent re-audit.  
**Связанный контракт:** [`BRANDING_DOMAIN_CONTRACT.md`](./BRANDING_DOMAIN_CONTRACT.md).

## 1. Что разделяет эта матрица

Branding нельзя представить одним boolean. Для каждой операции независимо проверяются:

```text
actor relationship
  -> capability
  -> target organization/object ownership
  -> mechanic entitlement
  -> object lifecycle/readiness
  -> published effective presentation
```

- **Capability** — кто может смотреть/менять/публиковать настройку.
- **Entitlement** — оплачена/включена ли механика для организации.
- **Readiness** — доказана ли техническая и контентная готовность конкретного объекта.
- **Presentation tier** — что фактически увидит пользователь на конкретной surface.

`Core organization context` проверяется как часть trusted relationship/object or published projection and remains
available without `branding`: canonical display name, minimum attribution and required platform disclosure.
`Brand presentation` is a paid/published layer (logo, colors, assets, branded copy/header, optional contacts and
templates). Disabling it replaces visuals/content with platform presentation but never hides required organization
identity from a valid invite, booking, shell or transactional message.

Ни entitlement, ни readiness не расширяют membership/enrollment/clinical authorization.

## 2. Текущая и целевая упаковка

Текущий registry знает только `branding` и `custom_domain`; до enforcement механики могли разрешаться по
backward-compatible default. Это не доказывает готовность UI/backend. Custom sender и per-origin PWA пока нельзя
честно тарифицировать независимо без расширения target entitlement model.

| Product capability | Platform default | Existing mechanic candidate | Дополнительная readiness | Примечание |
|---|---|---|---|---|
| Platform landing/auth/legal/support | Always | none | Platform publication/health | Нельзя выключить org-тарифом |
| Org name as context | Always for authorized/published context | none/core | Trusted org relation/projection | Не считается paid branding |
| Logo/colors/org public presentation | Platform fallback | `branding` | Brand revision valid + published | O tier |
| Neutral org identification in transactional email/SMS/push | Platform channel + core context | none/core | Trusted message object + privacy/channel eligibility | Не зависит от paid branding |
| Branded email/SMS/push presentation | Platform fallback + core context | `branding` | Published template/assets/contact + channel readiness | Sender identity технически отдельна |
| Custom public/booking/join hostname binding | Stable platform alias URL | `custom_domain`; `branding` only changes visuals | HostnameBase ready + individual binding active | C tier; siblings independent |
| Custom auth origin binding | Canonical platform auth | `custom_domain` | HostnameBase ready + `auth` binding cookies/CSRF/OAuth/callback audit | Не включать только DNS success; public siblings независимы |
| Custom org email sender | Platform sender | **needs separate decision/mechanic** | DKIM/SPF/DMARC/provider + Reply-To | Не выводить автоматически из `custom_domain` |
| Registered org SMS sender | Platform sender/no-send | **needs separate decision/mechanic** | Provider/region registration | Не выводить из email/web domain |
| Per-origin manifest/install/push | Platform patient/staff manifests | **needs separate decision/mechanic** | Full W PWA origin gate | True white-label tier |
| Legal/support org presentation | Platform legal/support | `branding` for presentation only | Validated published contacts/legal revision | Platform fallback mandatory |

Packaging is an unresolved planner gate, not an owner ruling. Safe implementation planning treats custom sender and
W PWA as separate target capabilities even if a future commercial package groups them under one tariff.

## 3. Actor × management capability

The names below are target capability semantics, not claims that these exact flags already exist.

| Actor | View effective brand/status | Edit org draft | Publish org brand/public projection | Manage domain proof/routing | Activate sender/PWA | Platform fallback/legal |
|---|---|---|---|---|---|---|
| Global admin — platform config | Platform + aggregate org health | No ordinary org edit | Platform brand/fallback only | Restricted ops/repair, audited | Restricted platform readiness | Yes |
| Global admin — support intervention | Diagnostic view by explicit org target | No by default | No by default | Purpose-specific retry/repair only | Purpose-specific repair only | Cannot impersonate owner silently |
| Organization owner | Yes, own org | Yes | Yes, subject to validation/capability | Request/verify/remove own hostname | Request/activate own ready objects; irreversible contract actions owner-only candidate | Cannot edit platform fallback/legal operator |
| Organization admin | Yes, own org | Yes if delegated | Yes if delegated | Manage if delegated; ownership/contract removal may remain owner-only | Manage if delegated | Cannot edit platform fallback |
| Owner/admin + specialist | Same as management capability in management surface | Same | Same | Same | Same | Clinical mode gives no extra brand power |
| Specialist | Consume effective brand | No by default | No | No | Personal install/push only, not org PWA publication | Platform recovery visible |
| Assistant | Consume effective brand | No by default | No | No | Personal install/push only | Platform recovery visible |
| Patient | Consume published active org context | No | No | No | Own install/push consent only | Platform legal/account support visible |
| Public | Consume explicit public projection | No | No | No | Install prompt only after authorized/useful flow | Platform legal/support visible |

Every organization mutation targets the actor's server-resolved single active membership organization. A global admin
diagnostic target is explicit and audited; `adminMode`, Host, route slug and client organization id are insufficient.

## 4. Surface capability matrix

| Surface/action | Required relationship/capability | Entitlement/readiness | Effective fallback | Denied/error behavior | Audit |
|---|---|---|---|---|---|
| View platform landing | Public | none | N/A | Platform safe error | Platform deploy/content audit |
| View published org profile | Public projection lookup through stable platform alias or verified binding | Publication active; branding optional | Platform chrome + core org context | Neutral 404/disabled action | No private org read; alias/version resolution |
| Edit org brand | Active owner/admin membership + `branding.edit` | Draft allowed even if mechanic off, policy candidate | Read-only preview | Forbidden for other org/direct URL | Actor/revision/change set |
| Publish org brand | `branding.publish` | `branding` enabled + asset/content validation | Last valid publication/platform | Field-level validation or upgrade state | Publication revision/actor/time |
| Configure public profile | `public_profile.edit` | Relevant publication/booking mechanics | Draft retained | Forbidden/validation error | Revision/actor |
| Use branded booking | Trusted public config or patient booking relationship | Booking enabled; brand published optional | Stable platform alias booking + core org context | Booking unavailable independent of brand | Booking/context audit |
| Render join preview | Valid invite lookup | Invite lifecycle; brand published optional | Platform join + core org name after lookup | Generic invalid/expired/revoked | Invite lifecycle; no raw token |
| Render branded auth | Trusted domain/invite context | Origin auth readiness | Canonical platform auth | Neutral origin mismatch/restart | Auth origin/callback event |
| Render patient shell brand | Active enrollment | Brand published; W origin separately active | Platform app + org text | Foreign/revoked neutral recovery | Normal clinical action audit, not color view |
| Render staff shell brand | Active membership | Brand published | Platform workspace | Membership denial; no Host fallback | Normal staff session audit |
| Make HostnameBase ready | `domain.manage` own org | `custom_domain` enabled + ownership/TLS/routing/base lifecycle ready | Stable platform alias URLs | Exact pending/failed/degraded base state | Proof/TLS/routing/base/actor |
| Activate hostname surface binding | `domain.manage` + relevant surface publish capability | Base ready + this binding's publication/config/origin audit | Equivalent stable platform alias route | Failed binding falls back without disabling siblings | Binding/status/evidence/actor |
| Suspend/remove hostname or binding | owner or delegated irreversible capability | Object exists; dependency, retention and quarantine contract | Stable platform alias route | Block unsafe base removal; allow safe selective binding suspension | Base/binding removal + quarantine + dependencies |
| Activate custom email sender | `sender.manage` target candidate | Sender-specific entitlement gate + provider + From/envelope/DKIM/SPF/DMARC alignment + Reply-To + bounce/complaint readiness + template eligibility | Platform sender or hold per pending BD-3 | Never spoof; exact failed dimension/remediation | Actual From/envelope/signer/alignment/provider/template/fallback per attempt |
| Activate SMS sender | `sender.manage` | Sender-specific entitlement + provider/region ready | Platform/no-send policy | Never invent sender id | Registration/status/effective sender |
| Publish W PWA | `pwa_brand.publish` target candidate | Relevant PWA binding + W PWA entitlement gate + all origin checks | Platform manifest | Publish blocked with checklist; other bindings unaffected | Manifest revision/origin/test evidence |
| Change org legal/support | `legal_support.edit` | Validated content; branding entitlement must not hide mandatory disclosure | Platform legal/support | Invalid contacts block org publication | Revision/effective time/actor |
| Personal install/push | Authenticated user for private app; public install flow where allowed | Browser/origin ready; explicit consent | Browser use + other channels | Permission recovery; no nag loop | Subscription/consent, no clinical payload |

## 5. Tier × surface capability

| Surface | P — Platform default | O — Organization identity (`branding`) | C — Custom domain (`custom_domain`) | W — True white-label (future explicit capabilities) |
|---|---|---|---|---|
| Platform landing/signup | Full | Same | Same | Same; separate from org acquisition |
| Org public/profile | Platform + core org context | Paid logo/colors/content | Active `public_profile` binding | Org-first + legal disclosure |
| Booking | Stable platform alias + core context | O visuals | Active `booking` binding | Org-first flow |
| Join | Platform trust, then core context after lookup | O visuals after token lookup | Active `join` binding | Org-first, token org wins |
| Auth/recovery | Platform; core context only after trusted resolution | Paid org skin | Active `auth` binding only | Org skin + platform identity/recovery |
| Patient shell | Platform app + core active-org context | Paid logo/colors/header | Canonical by default | Optional per-origin W app |
| Staff shell | Platform app + core membership-org context | Paid workspace presentation | Canonical by default | Pending BD-4; safe P/O |
| Manifest/install | Stable patient/staff | Same | Same until W gate | Per-origin stable identity |
| Email/SMS | Platform sender + neutral core org identification where required | Branded template/content | Web domain changes nothing | Custom sender only after complete separate readiness |
| Push | Platform installed identity + privacy-safe core org context | Paid presentation within privacy limits | Web domain changes nothing by itself | Per-origin subscription/app identity |
| Legal/support | Platform operator/recovery + responsible core org context where required | Paid org presentation/contact | Same | Assigned disclosure + platform recovery |

`C` is separated from `W`: a verified public hostname does not automatically make auth, sender, manifest, service
worker or push ready.

## 6. Readiness tuples

An effective surface is published only if every required dimension is ready.

| Object | Readiness tuple |
|---|---|
| Brand | content valid + assets valid + contrast/accessibility + published revision + organization active |
| Public profile | explicit field projection + brand fallback + publication active |
| Booking | public projection + booking mechanic/config + valid service/branch/specialist scope |
| Platform alias | deterministic normalization + reserved-name check + global uniqueness + immutable org target + current/redirect/quarantine state + allowed route enum |
| HostnameBase | normalized uniqueness + immutable org target + ownership + TLS + routing + organization lifecycle + entitlement/decommission + not quarantined |
| Hostname surface binding | HostnameBase ready + surface publication/business config + this surface's entitlement + surface-specific origin/security audit |
| Email sender | visible From + envelope/Return-Path/bounce route + DKIM selector/signer + SPF + DMARC alignment + provider verification + validated Reply-To + complaint route + template eligibility |
| SMS sender | provider/region registration + allowed sender + transactional policy/consent basis |
| Per-origin PWA | relevant binding active + stable manifest + icons + session/CSRF/OAuth + SW/cache + push + legal/support smoke |

The effective presentation resolver returns one of:

- `organization_ready` / `white_label_ready`;
- `platform_fallback` with machine-readable reason;
- `hold` for a policy that forbids fallback;
- `blocked` for unsafe business action;
- `read_only` for retained settings/history and recovery.

Resolvers are surface-specific. They never derive one organization-wide white-label boolean: a ready
`public_profile` binding can coexist with `auth=pending_audit`, and `booking=active` can coexist with
`patient_pwa=audit_failed`. `HostnameBase` failure affects its bindings; one binding failure does not mutate the base
or siblings.

Email readiness progresses through separately evidenced stages: `domain_proof_pending/failed` → `domain_proved` →
`provider_verified` → `alignment_pending/failed` → `readiness_ready` → explicit `active`, followed when necessary by
`degraded/revoked`. `active` requires the full tuple above, including a working envelope/bounce/complaint route and
template eligibility. A passing DKIM signature alone cannot activate a DMARC-unaligned `From`.

## 7. Entitlement degradation contract

| Mechanic/state | Existing user/public impact | Management impact | Must remain reachable |
|---|---|---|---|
| `branding` disabled | Platform visuals; core org name/context still shown for trusted/published context and transactional identification | Draft/read-only preview + upgrade/recovery | Account, data, legal, support, stable alias booking state |
| `branding` grace | Last safe published brand may remain during grace | Warning, deadline, billing/recovery CTA | Export/offboarding and platform fallback |
| `custom_domain` disabled | Canonical platform URLs | Custom Host suspended/decommission flow | Canonical surfaces and domain removal |
| One hostname binding degraded | One-way fallback for that surface; ready siblings unaffected | Per-binding health/error/recheck | Stable alias route for affected surface |
| HostnameBase degraded | One-way stable-alias fallback for every binding on that base | Base health/error/recheck | Auth/recovery and active invites via platform origin |
| Sender capability disabled/degraded | Platform fallback or hold per pending BD-3 | Exact identity/alignment/bounce remediation; no spoof | Security/account delivery according to safe default |
| W PWA disabled/degraded | Platform PWA/browser | Read-only manifest status + recovery | Canonical browser/app access |

Tariff loss never deletes brand/domain/sender configuration immediately. It changes effective use and starts an
audited grace/decommission path. Data retention and hostname quarantine are separate policies.

## 8. Configuration and secret ownership

- Platform integration config and secrets remain DB-backed under restricted platform settings; do not add new
  integration env variables.
- Organization overrides/identities must be explicitly `organization_id` scoped and follow the canonical global
  fallback semantics where applicable.
- Brand assets are referenced through trusted media ownership/publication; arbitrary external logo URL from client
  input is not an effective asset.
- Domain DNS proof values may be displayed; provider credentials/private keys are secret and never exposed to org
  UI/logs.
- General audit excludes raw invite tokens, message body clinical content, credentials and unnecessary PII.

## 9. Current implementation gaps for UX-06/09

These are observations, not authorization to implement inside discovery:

1. No evidenced org-brand/public-projection schema and publish lifecycle.
2. No evidenced verified-host registry, TLS/routing state model, quarantine or domain resolver.
3. Current patient/staff manifests are platform-static; there is no per-origin W manifest publication.
4. Current platform SMTP/VAPID/settings do not establish org custom sender identities.
5. Existing `branding`/`custom_domain` mechanics are too coarse for independent sender and W PWA packaging.
6. Current legal/support surfaces are platform-oriented; responsibility split and org support validation need design.
7. No proven surface-specific effective-presentation resolver across public, booking, join/auth, shells and delivery.
8. No evidenced stable platform alias/version/redirect/quarantine lifecycle.
9. No evidenced complete email identity model for envelope/Return-Path, alignment, provider event routing and
   per-attempt effective identity audit.

UX-06 should map settings/status screens around these contracts. UX-09 must split data contracts, resolvers,
readiness jobs, role/capability enforcement and surface adoption into independent epics.

## 10. Audit checklist

- Every surface has P/O/W behavior, fallback, owner, entitlement/readiness and security boundary.
- Core organization context and paid brand presentation are distinct on every surface and channel.
- Platform landing is never organization-white-labeled.
- Host/domain only selects an entry candidate and never grants membership/enrollment/object access.
- HostnameBase and each surface binding have separate readiness; sibling bindings do not fail together.
- Stable platform aliases normalize, reject collision/reserved names, preserve rename redirects and prevent silent
  reuse after suspension/removal/quarantine.
- Canonical fallback is one-way and loop-safe; raw token/open redirect are excluded.
- `branding`, `custom_domain`, custom sender and W PWA are not treated as one readiness flag.
- Custom email `active` proves From/envelope/DKIM/SPF/DMARC alignment/provider/Reply-To/bounce readiness; fallback
  versus hold/reject remains pending owner request BD-3 with no attributed ruling.
- Staff and patient manifest identities stay stable on platform origin.
- Platform legal/account recovery remains reachable under white-label and every failure state.
- BD-1…BD-6 are labeled pending with owner ruling none, planner recommendation, safe default and downstream impact.
