# UX-04 — Entry, invite, activation and install journeys

**Статус:** completed as a decision-ready journey contract; full independent re-audit PASS after integrated correction.
**Дата:** 2026-07-15.
**Scope:** acquisition, trusted entry, identity activation, organization enrollment, first workspace, install и recovery.

## 1. Как читать документ

Документ описывает целевой UX-контракт, но не объявляет отсутствующие API и таблицы реализованными. Для каждого
journey отдельно указаны:

- подтверждённое текущее поведение;
- целевой UX-контракт;
- безопасный default до owner ruling;
- текущий implementation gap.

Три класса состояния нельзя смешивать:

1. **Delivery** — письмо/SMS принято провайдером, доставлено, bounced или не отправлено.
2. **Identity/auth** — кто открыл ссылку и доказал контроль над нужным email/аккаунтом.
3. **Business relationship** — membership staff или enrollment пациента создана/подтверждена.

`delivered` не означает `accepted`, login не означает membership/enrollment, а invite token не является сессией.

## 2. Канонические инварианты

1. Tenant — `Organization`. Solo practice и clinic используют одну organization/account model.
2. Staff login имеет ровно одну active organization membership. Invite во вторую active organization не создаёт
   staff switcher и должен завершиться fail-closed recovery.
3. Patient имеет одну canonical global identity и может иметь несколько organization enrollments.
4. Invite, booking reference, route, query, slug, Host, custom domain и branding не выдают права. Organization
   context берётся из server-side invite/booking/object record и повторно проверяется перед мутацией.
5. Raw token — bearer secret: хранится только hash, не попадает в общие логи/analytics, убирается из visible URL
   после server exchange; token entry использует `Referrer-Policy: no-referrer`.
6. Email invite по умолчанию привязан к normalized invited email. Несовпадение не исправляется заменой email в
   форме acceptance.
7. Все accept/resend/revoke/expire transitions идемпотентны и audit-visible. Явный resend выпускает новый
   invite/token, supersedes предыдущий и сохраняет immutable delivery/audit trail.
8. До auth показывается только минимальный neutral preview: organization name/logo и допустимая attribution
   пригласившего; без диагноза, программы, причины обращения, ФИО пациента и иных clinical details.
9. PWA install предлагается после первого полезного экрана. Push permission — отдельный объяснённый user gesture,
   не автоматический prompt на landing/join.
10. Browser остаётся полноценным способом доступа; install и push не являются условиями активации.
11. Любой `return_to` выбирается сервером из allowlist по типу journey. Произвольные absolute redirect URL
    запрещены.
12. Ошибка должна объяснять восстановление, но не подтверждать постороннему существование аккаунта, пациента или
    закрытой организации.
13. Персонал входит по email + password; пациент на текущем launch contract входит passwordless по OTP. Invite не
    создаёт второй credential owner и не расходуется во время восстановления канала или staff password.
14. Одна canonical identity может получить дополнительную persona/relationship только аддитивно. Нельзя молча
    перезаписывать patient persona значением `doctor` или считать coarse global role готовой persona model.
15. Acceptance выполняет relationship mutation ровно один раз под transaction lock/unique constraint и устойчивым
    idempotency key. Delivery retry, browser refresh и concurrent click не создают второй membership/enrollment.

## 3. Общие lifecycle objects и состояния

Названия ниже — logical contract, не требование немедленно создать таблицы с такими именами.

### 3.1 Invite relationship lifecycle

```text
pending
  -> accepted
  -> expired
  -> revoked
  -> superseded

accepted + replay + authenticated accepted canonical user -> existing relationship, no second mutation
terminal + resend -> new invite id/token linked to predecessor
```

Минимальные факты: invite id, token hash, organization id, invite kind, normalized recipient, intended role или
patient relationship intent, inviter, optional specialist attribution, status/timestamps, expiry, supersession link,
accepted canonical user и created membership/enrollment reference. Recipient исправляется только новым invite:
старый immutable audit trail не переписывается. Resend pending invite выпускает новый token/invite, supersedes
предыдущий и сохраняет связь; resend terminal relationship сначала проверяет, что новый pending relationship
действительно нужен.

### 3.2 Auth/recipient proof

```text
anonymous
  -> raw-token exchange
  -> narrow short-lived continuation
  -> authenticated / onboarding
  -> canonical identity resolved
  -> recipient proof complete
```

Raw bearer принимается сервером один раз, сразу удаляется из URL/history через replace navigation и не переносится
между screens, origins, analytics, referrer или support logs. Browser получает узкий short-lived continuation,
привязанный к invite, recipient-proof progress, origin family и allowlisted next step; это не session и не новый
долгоживущий bearer. После auth сервер снова читает invite, проверяет canonical identity и bound recipient.

Для staff membership и patient enrollment действуют разные ограничения. Patient с существующей identity получает
новый enrollment без второго global account. Staff с active membership другой organization не получает вторую.
Identity, уже имеющая patient persona, при staff invite не теряет её: target создаёт отдельную staff membership/persona
аддитивно, если architecture model это поддерживает; до этого действует fail-closed account-link/support recovery.

### 3.3 Immutable delivery attempts

Каждая попытка доставки имеет immutable id/channel/recipient/invite/provider correlation и append-only историю
provider outcomes/timestamps; retry создаёт новую попытку и не перезаписывает предыдущую. Staff-side status попытки
различает как минимум:

- `queued`, `sent/provider_accepted`, `delivered` where supported;
- `temporary_failure`, `bounce`, `complaint`, `suppressed`;
- `not_attempted` из-за отсутствующего/запрещённого канала;

Acceptance не является delivery state. Invite может быть accepted до webhook `delivered`, оставаться pending после
bounce и иметь одновременно несколько email/SMS outcomes. Auth/recipient proof также не выводится из provider success.

### 3.4 Exactly-once relationship mutation

Accept transaction блокирует invite/relationship row, повторно проверяет status/expiry/recipient/organization и
фиксирует canonical user + membership/enrollment одной транзакцией. Уникальность relationship (staff user + org;
patient canonical user + org) и idempotency key invite id защищают от double click и конкурирующих requests.
Повтор после commit возвращает тот же relationship reference только после auth и совпадения с accepted canonical
user; terminal token сам по себе не выбирает workspace.

## 4. Journey map

| ID | Journey | Trusted organization source | Итоговая relationship |
|---|---|---|---|
| J1 | Solo specialist self-signup | Server-side signup intent | Owner membership + specialist binding |
| J2 | Clinic staff email invite | Staff invite record created inside current clinic guard | Staff membership, optional specialist binding |
| J3 | Patient email invite | Patient invite record | Active organization enrollment |
| J4 | Patient SMS fallback | The same patient invite record; SMS is transport only | Same enrollment as J3 |
| J5 | Public booking | Server-resolved published branch/service/slot | Appointment + active enrollment in exact organization |
| J6 | Returning multi-org patient | Active enrollment or verified target object | Selected active organization context; no new identity |
| J7 | Invite failure/replay | Existing lifecycle record if safely resolvable | No mutation, or existing relationship reopened |

## 5. J1 — Solo specialist self-signup

### Trigger, actor and channel

- **Trigger:** CTA «Создать кабинет» on specialist-oriented platform landing.
- **Actor:** anonymous solo specialist who will become organization owner and clinical specialist.
- **Channel:** email verification is required; web form starts the flow.

### Trust, auth and organization context

- This is not an invite-token flow. A short-lived email challenge proves the submitted email.
- Password is set before confirmation; session is issued only for the verified canonical staff identity.
- Organization context comes from the server-side signup intent created with the challenge, not from a later query,
  Host or client-supplied organization id.
- 2FA is not currently implemented, but full target mechanics are required by owner ruling. Owner first-run includes
  factor enrollment, verification, recovery-code/alternate recovery setup and acknowledgement. Exact factor,
  mandatory staff roles, grace and step-up policy remain pending; before those rulings high-risk owner actions use a
  fail-closed security checkpoint rather than pretending setup succeeded.

### Records and transaction boundary

Current code creates a pending password identity, email challenge and specialist-signup intent; after confirm it
provisions organization + owner membership and creates a doctor session. It deliberately leaves
`membership.specialist_id` and `provisioned_specialist_id` `NULL`: clinical specialist binding is deferred until a
real staff principal exists. Target adds the binding through an authorized, idempotent continuation before claiming
that the owner is a clinical actor; first useful clinical Today is unavailable until then.

Current confirm retry has an additional security gap: when the email challenge row is gone, the route can resolve a
persistent signup intent only by `challengeId`, skip code verification and issue a new doctor session after
idempotent provisioning. Target retry requires an authenticated/idempotency receipt or an already-established
session; a UUID challenge identifier must not become a post-verification session bearer.

The first organization shape is `solo/one active specialist` as composition, not an immutable account type. Inviting
staff later grows the same organization.

### UI screens and states

1. Specialist landing with value, plan boundary and login link.
2. Account form: email, password, specialist name, practice/organization title.
3. Verify email: masked/visible own address, code, cooldown, resend, change data.
4. Provisioning state with authenticated/idempotency-receipt retry; no second organization or unauthenticated session
   reissue on refresh/replay.
5. First-run overview:
   - profile and timezone;
   - service/location or online-care setup;
   - availability/booking readiness;
   - patient invitation readiness;
   - notification/PWA install later, after workspace value;
   - 2FA enroll/verify, recovery codes or alternate recovery, and security acknowledgement;
   - lost/unavailable factor, cooldown/abuse, factor replacement and session-revocation recovery.
6. Authorized specialist-binding continuation, followed by first useful clinical workspace: empty Today with a
   concrete next action, not a clinic team dashboard.

### Delivery, recovery and privacy/security

- Delivery status is limited to the verification challenge; resend observes cooldown/rate limits.
- Duplicate email: offer login/recovery, never create another canonical staff user.
- Expired code: start a new challenge attached to the still-valid/recreated intent; provisioning remains idempotent.
- Disabled public signup: retain a neutral waitlist/demo/contact state; do not expose internal entitlement detail.
- Partial provisioning: show recoverable server state; never create an ownerless organization. Deferred specialist
  binding is a separately authorized idempotent step and the UI must not label it complete early.
- UI and analytics never store password, verification code or raw challenge secret.

### Open decisions and safe default

- **Decision:** one acquisition question «solo / clinic» versus separate signup CTAs. **Safe default:** one account
  form, optional practice-shape question for onboarding composition; no separate tenant models.
- **Decision:** 2FA factor, mandatory roles, grace and step-up frequency. Full setup/recovery/session-revocation
  mechanics themselves are already required. **Safe default:** fail closed before high-risk owner actions; do not
  claim 2FA complete until a factor and recovery path are verified.
- **Current gap:** current registration collects only the core four fields and redirects directly to doctor home;
  no explicit first-run checklist, practice-shape branch or 2FA exists; specialist binding is deferred and current
  `challengeId` retry can reissue a session without another code check.

## 6. J2 — Clinic owner invites staff by email

### Trigger, actor and channel

- **Trigger:** owner/admin with explicit team-management capability opens Organization → Team → Invite.
- **Actor:** inviter is current organization staff; recipient becomes admin, specialist/doctor or assistant according
  to the approved role matrix.
- **Channel:** transactional email is primary. Invite URL is generated from trusted canonical/verified origin.

### Trust, auth and organization context

- Opaque, single-use, expiring token identifies a server-side staff invite.
- Token preview may show clinic title, invited role and masked recipient. It does not create a session/membership.
- Recipient proves the invited email. Existing staff uses normal email + password login and step-up when required;
  a new staff user proves email, sets password once, then authenticates. Invite acceptance never creates a second
  credential owner.
- Full 2FA target includes factor enroll/verify, recovery codes or alternate recovery, lost/unavailable factor,
  cooldown/abuse handling, factor replacement and session revocation. Which factors/roles/grace require it remains a
  ruling; invite acceptance must not pretend nonexistent mechanics succeeded.
- Organization comes only from the invite record created inside the inviter's server-resolved organization context.

### Records and transaction boundary

- Invite record contains organization, invited normalized email, intended role, inviter, expiry and hash-only token.
- Accept transaction re-checks pending status, expiry, recipient email and membership integrity, resolves canonical
  user, creates membership once and creates specialist binding only for a clinical role that requires it.
- Existing membership in the same organization opens the existing workspace without duplicate membership.
- Existing active membership in another organization fails closed. It does not create a staff org switcher.
- Existing global identity with patient persona is not overwritten. Staff persona/membership is added alongside it
  only under a supported additive persona model; otherwise acceptance stops at explicit account-link/support
  recovery. A coarse `platform_users.role = doctor` update is not a valid target model.
- Seat/entitlement check occurs after authorization and before new membership. If unavailable, preserve a draft or
  blocked invite state without sending a link that cannot be accepted.

### UI screens and states

1. Team list with relationship pending/accepted/revoked/expired/superseded and a separate latest-delivery summary.
2. Invite form: email, role, specialist binding/profile fields when relevant, bounded permissions only after policy.
3. Sent state: masked address, expiry, resend cooldown, revoke and correct-recipient action.
4. Public join preview.
5. Existing-account login or new-account password setup.
6. Email proof/password setup where needed, then 2FA enroll/verify and recovery setup according to final policy;
   include lost factor, unavailable factor, cooldown, replacement and revoke-other-sessions states.
7. Role summary before acceptance: organization, role and allowed workspace description.
8. First workspace:
   - specialist → clinical Today;
   - admin without binding → organization overview;
   - admin + binding → default surface according to OM-1 ruling;
   - assistant → bounded operations home after OM-2 ruling.

### Delivery, recovery and privacy/security

- Failed/bounced email leaves a visible delivery failure and allows corrected recipient/new invite.
- Resend creates a new token and marks the old invite superseded; UI says «используйте последнюю ссылку».
- Duplicate email/identity-persona collision routes to login/link/support; it never silently overwrites an existing
  patient persona or recommends an email alias.
- Plan/seat limit returns to owner with selected role/permissions preserved; recipient sees a neutral unavailable state.
- Offboarded/suspended organization cannot activate membership; existing invite is retained for audit and revoked.
- Role and specialist binding are server-created; neither can be overridden in acceptance body/query.

### Open decisions and safe default

- **Decision OM-2:** assistant permissions and first workspace. **Safe default:** no clinical history/write; only
  separately enforced schedule/intake/contact/invite operations.
- **Decision:** 2FA factor, mandatory staff roles, grace and step-up frequency. Full mechanics/recovery are not open.
  **Safe default:** fail-closed step-up gate for owner/admin high-risk actions.
- **Current gap:** current implementation supports `admin | doctor`, seven-day hash-token invite and email OTP, but
  no target accept page was found; public lookup returns full `invited_email`; acceptance updates the coarse global
  role to `doctor`, does not reject another active staff organization, creates membership with `specialist_id = NULL`,
  then issues a doctor session. Assistant, additive personas, specialist provisioning and 2FA are absent.

## 7. J3 — Specialist invites a patient by email

### Trigger, actor and channel

- **Trigger:** authorized specialist or delegated staff opens patient/create/invite action from current organization.
- **Actor:** inviter is attributed separately from the organization; recipient is a new or existing canonical patient.
- **Channel:** transactional email is primary.

### Trust, auth and organization context

- Token points to a server-side patient invite bound to organization and normalized recipient email.
- Preview shows organization and, when policy permits, inviting specialist; no clinical reason or treatment details.
- Patient target is passwordless OTP: an existing patient authenticates globally and proves the bound recipient;
  a new patient verifies the invited email by OTP and becomes the same canonical identity without setting a password.
  Password/OAuth visible in current code are compatibility facts, not target launch policy. Onboarding tier performs
  only activation-whitelisted actions until acceptance completes.
- Organization and intended relationship come from invite record. Email form, Host and custom domain cannot replace it.

### Records and transaction boundary

Recommended candidate:

- staff may create a patient/intake shell and **enrollment intent** when sending, so staff can track `not invited /
  invited / activated`; active business enrollment is confirmed transactionally on acceptance;
- if legal/operational workflow requires an active enrollment before portal acceptance, that status must remain
  visibly `portal_not_activated` and cannot imply successful identity proof;
- accept resolves canonical user first, then creates/reactivates exact organization enrollment once and marks invite
  accepted with canonical user/enrollment references;
- existing canonical patient in another organization receives only a new enrollment, never another global identity.

The exact moment of enrollment creation is an owner/data-contract decision; no UI may hide it behind one generic
`patient created` badge.

### UI screens and states

1. Staff invite form: patient/contact, email, organization fixed, specialist attribution, neutral message preview.
2. Staff delivery/lifecycle row with resend, revoke, correct address and activation status.
3. Patient join preview with safe organization identity and masked recipient.
4. Passwordless patient entry: exchange raw token, scrub URL, request/verify OTP, wrong account/channel recovery.
5. Relationship confirmation: organization and what becomes available; legal/consent steps only if separately required.
6. Activation success and organization-scoped first useful screen:
   - nearest appointment, active program/task or organization Today;
   - if no content exists, clear relationship confirmation and one useful next action/contact, not a dead empty dashboard.
7. Contextual install card.
8. Platform-specific install help/native prompt.
9. First installed launch: restore authenticated session if valid, otherwise passwordless OTP re-auth without
   consuming invite/enrollment again; restore exact authorized organization server-side.
10. Separate notification education and «Включить уведомления» gesture after authenticated context.
11. Granted/denied/default/revoked/subscription-rotated recovery without blocking browser access.

### Delivery, recovery and privacy/security

- Email delivery and invite acceptance remain separate statuses.
- Wrong email is corrected only by staff revoke + fresh invite; recipient cannot substitute another address.
- Existing verified matching identity uses passwordless OTP. OTP/channel recovery does not consume invite; after
  recovery the server re-checks canonical identity and bound recipient before transactional accept.
- Push is offered after value. Denied permission routes to browser/OS instructions and keeps email fallback.
- Notification text and lock-screen copy are neutral by default and include active organization context where useful.
- Invite acceptance and enrollment are idempotent under double click/concurrent requests.
- First installed launch never derives organization from manifest, `start_url`, Host or stale local storage. Push
  subscription belongs to authenticated canonical user + currently authorized context, and every deep link
  revalidates enrollment before showing content/counts.

### Open decisions and safe default

- **Decision:** create enrollment at send versus accept. **Safe default:** store explicit intent/pending portal state;
  active portal relationship only after canonical identity acceptance, unless a separately authorized staff enrollment
  already exists.
- **Decision OM-3:** neutral multi-org default. **Safe default:** trusted invite opens its organization visibly for
  this journey; later neutral entry uses chooser when selection is ambiguous.
- **Current gap:** no canonical specialist→patient email invite/join implementation was found. Existing staff invite
  and generic patient email auth must not be reused as if they already implement patient enrollment semantics.

## 8. J4 — Patient SMS as additional/fallback transport

### Trigger, actor and channel

- **Trigger:** email invite delivery failed, staff explicitly chooses «Отправить также по SMS», or policy schedules
  a consented reminder.
- **Actor:** same inviter and patient relationship as J3.
- **Channel:** transactional SMS is an additional delivery attempt for the same invite lifecycle, not another account.

### Trust, auth and organization context

- SMS possession/click does not elevate identity proof and does not bypass invited-email match.
- Link resolves the same server-side invite/organization. A short redirect token may be channel-specific, but it must
  converge on the same pending invite and single acceptance mutation.
- SMS-only activation, if ever supported, is a separate decision requiring OTP, trusted-phone policy, abuse/rate
  limits, SIM-swap/recovery handling and explicit recipient binding.

### Records, UI and delivery

- Add an SMS delivery attempt with provider state, consent/lawful-basis marker where required and suppression result.
- Do not create a second invite/enrollment merely because another transport was used.
- Staff UI shows email and SMS results independently plus one acceptance status.
- Patient SMS copy is neutral: organization/platform, expiry and HTTPS link; no diagnosis, appointment reason or
  program title.
- If phone is missing/invalid/suppressed, preserve email journey and show staff a bounded correction action.

### Recovery and privacy/security

- Email inaccessible + SMS received does not silently change invite recipient. Recovery is login to the matching
  identity or staff correction/new invite.
- Rate-limit send/resend by recipient, organization and actor; record provider correlation without raw token.
- Opt-out/complaint handling blocks later optional SMS attempts but does not erase the invitation or email route.
- `delivered` SMS is not identity verification and is not automatically added to ordinary notification topic prefs.

### Open decision and safe default

- **Decision:** whether SMS-only activation is launch scope. **Safe default:** no; SMS is manually initiated fallback
  or reminder, email remains identity binding.
- **Current gap:** a patient invite SMS lifecycle is not implemented; current notification-channel canon does not
  include SMS in patient topic defaults.

## 9. J5 — Public booking → identity resolution → enrollment → patient app

### Trigger, actor and channel

- **Trigger:** anonymous visitor starts from a published organization/booking entry and selects service, location and slot.
- **Actor:** anonymous prospective patient; organization is the published provider.
- **Channel:** web booking. Transactional confirmation/activation may use contact phone/email according to verified
  channel policy.

### Trust, auth and organization context

- Server resolves exact organization from trusted published branch/service/slot records. Online booking with
  ambiguous tenant fails closed; body/query/Host cannot choose an arbitrary organization.
- Current public booking resolves/creates canonical patient by normalized phone and treats this path as a trusted
  patient phone source. Portal session is still a separate auth result. The current anonymous response exposes
  internal `userId`; target removes it and uses a signed one-time narrow continuation or authenticated object access,
  never an internal identity id as portal authority.
- A returning authenticated patient is canonicalized before booking; a guest gets a safe post-booking activation path.

### Records and transaction boundary

Target transaction creates or resolves canonical patient, confirms/creates active enrollment for the exact
organization and creates the appointment exactly once. A forced failure must not leave appointment without required
enrollment or an enrollment produced by a failed booking.

Current implementation creates/resolves phone identity and appointment under explicit organization principal, but
the SaaS S6.4 plan still lists ensure-enrollment in the booking transaction as unfinished. UX therefore treats
post-booking organization access as a target contract, not a current guarantee.

### UI screens and states

1. Published organization/booking context.
2. Service/location/format and slot selection.
3. Contact and required form fields; explain how confirmation/access will be delivered.
4. Review with organization, specialist/service, date/time and contact.
5. Booking result:
   - confirmed/pending payment/pending review according to booking state;
   - neutral delivery outcome;
   - «Открыть кабинет» if already authenticated and enrollment is active;
   - «Получить доступ к кабинету» activation action for guest.
6. Identity resolution:
   - matching existing account → passwordless OTP;
   - new canonical identity → passwordless channel proof and activate without creating duplicate;
   - ambiguous/merge candidate → booking remains intact, portal linking goes to safe recovery/support.
7. Organization-scoped appointment screen as first useful app state, then the complete install/first-launch/push
   sequence from J3.

### Delivery, recovery and privacy/security

- Slot conflict returns to slot selection without losing safe form state.
- Confirmation delivery failure does not cancel an already successful appointment; show contact/support recovery.
- Duplicate/ambiguous identity never auto-merges solely by name. Sensitive merge requires existing identity policy and
  audit.
- Direct booking link does not reveal another patient's appointment; opening result requires signed one-time
  continuation or authenticated canonical identity/object authorization.
- Continuation exchange scrubs bearer material from URL/history/referrer/analytics. Replay can open the appointment
  only after passwordless auth and canonical patient/object authorization.
- Enrollment revocation later does not delete appointment/history; access follows retention/recovery policy.

### Open decisions and safe default

- **Decision:** guest portal activation transport when both phone and email are present. **Safe default:** use the
  strongest already trusted path; do not silently bind two identities, and retain a neutral recovery route.
- **Current gap:** current success page only confirms receipt and offers another booking; booking transaction does not
  yet guarantee enrollment, and the API response exposes internal `userId`. No safe portal continuation,
  identity/enrollment activation or installed first-launch states exist.

## 10. J6 — Returning patient with several organizations

### Trigger, actor and channel

- **Trigger:** neutral login/start URL, installed PWA launch, invite deep link, booking result or authorized object link.
- **Actor:** authenticated canonical patient with zero, one or multiple usable enrollments.
- **Channel:** browser/PWA; patient target login is passwordless OTP. Current password/OAuth support is compatibility,
  not the launch contract.

### Trust, auth and organization context

- Authentication is global. Organization is selected only from active/retained enrollments resolved server-side.
- Neutral entry with one enrollment opens it and keeps organization identity visible.
- Neutral entry with multiple enrollments follows OM-3 ruling. Recommended candidate is last successfully used active
  organization; if missing/invalid/ambiguous, show chooser. Safe default before ruling is chooser on ambiguity.
- Trusted invite/booking/object deep link may select its verified organization for that journey and visibly announce
  the context change. It cannot select a foreign/revoked organization.
- Object deep links resolve object → organization → enrollment; UI preference never authorizes the object.

### Records and UI states

- Optional last-active organization preference is convenience only and updated after successful authorized entry.
- Organization chooser lists only permitted relationships with neutral status/recovery labels.
- Persistent switcher appears when more than one usable enrollment exists; with one it collapses but organization
  remains visible.
- Switching clears organization-scoped cached view state, resolves entitlement/content for the destination and lands
  on that organization's Today/last safe destination.
- Appointment/program/message shows organization, specialist/author and response recipient.
- No enrollment: global account/recovery screen, invite entry and support; no empty clinical shell.
- Suspended/revoked current organization: bounded recovery and another-organization chooser if available.

### Delivery, recovery and privacy/security

- Push/deep link notification contains a server-resolvable target, not trusted client organization id. It verifies
  current enrollment at open time.
- Revoked organization disappears from normal switch list; legal/retained read-only access, if required, is a distinct
  policy state rather than a hidden active context.
- Data, unread counts, search and timeline never aggregate clinical records across organizations by default.
- Browser back/refresh cannot resurrect a previous unauthorized organization cache.
- Installed first launch with a valid cookie/session resolves current enrollments server-side. Without a usable
  session it runs passwordless OTP re-auth, then restores the exact last authorized/target organization only after
  revalidation; it never re-consumes the original invite or booking continuation.

### Open decisions and safe default

- **Decision OM-3:** last-active versus chooser on every neutral launch; suspended/archived visibility and care-team
  roster. **Safe default:** chooser whenever more than one context is equally plausible; explicit context on every
  clinical screen.
- **Current gap:** organization enrollment resolution exists, but target switcher/selection contract is not complete;
  current Patient Today also has documented `organization_principal_required` failure in DEV.

## 11. J7 — Expired, revoked, replayed and wrong-recipient invite

The error page first classifies the server-side lifecycle without exposing unnecessary identity data. Recovery does
not reuse a terminal token for a new mutation.

| State | Safe patient/staff-facing message | Server behavior | Recovery |
|---|---|---|---|
| Invalid/forged | «Ссылка недействительна»; no org/patient confirmation | No mutation; generic audit/rate limit | Login to existing account; request new link from known organization |
| Expired | «Срок ссылки истёк»; safe org identity only if record was resolved | Mark/observe expired; no accept | Rate-limited resend to bound recipient or staff issues fresh invite |
| Revoked | «Организация отозвала приглашение» or neutral equivalent | No accept; retain audit | Contact organization; authorized staff creates new invite |
| Superseded | «Используйте последнюю ссылку» | Old token stays terminal | Open newest delivery; staff can resend after cooldown |
| Accepted/replayed | «Доступ уже активирован» | No second membership/enrollment; terminal token grants no context | Authenticate; open exact relationship only when canonical user matches `accepted_by`/relationship |
| Logged in as wrong email/account | Show only masked target and organization-safe preview | No account merge, no recipient substitution | Sign out/switch account; staff revoke/correct/new invite |
| Existing staff in another active org | Neutral membership conflict | No second active membership | Owner/support-led account resolution; do not offer org switcher |
| Existing patient, new org | Passwordless OTP + accept | Add one enrollment to same canonical identity | Open new org; retain other enrollments |
| Existing same relationship | Idempotent success | Reuse existing membership/enrollment; no duplicate | Open workspace/context |
| Organization suspended/closed | Organization unavailable/recovery | No new active business access | Platform/org support; preserve audit and existing retention policy |
| Seat/entitlement unavailable | Recipient sees temporary unavailable state | No membership creation | Owner resolves plan/seat; issue/re-enable fresh invite per policy |
| Email/SMS delivery failure | Staff-only delivery failure; recipient sees nothing | Invite may remain pending; no fake delivered state | Correct contact or resend with new token/allowed channel |
| Concurrent double click | One succeeds, the other becomes replay | Row lock + uniqueness/idempotency re-check | Same authenticated canonical user converges on one relationship reference |

Wrong-recipient handling is intentionally asymmetric:

- recipient cannot edit the target email and consume the same invite;
- staff sees masked/operational delivery information only inside authorized organization management;
- correction revokes/supersedes old invite and produces a fresh lifecycle record;
- ordinary logs and analytics never contain raw token or full message payload.

### Raw-token entry and terminal replay

Every invite entry first performs a server exchange. The response sets `Referrer-Policy: no-referrer`, replaces the
URL before rendering third-party content and returns only a narrow short-lived continuation scoped to the invite,
origin family and next step. Raw bearer is absent from browser history, app state, support tooling and analytics.
Canonical-domain/custom-domain fallback never forwards it cross-origin: server redeems or creates a new one-time
continuation for the verified canonical origin, with an allowlisted relative destination.

An accepted/terminal invite reveals no workspace merely because its token is valid. The user authenticates, then the
server checks `accepted canonical user` or the live membership/enrollment and object authorization. Identity mismatch
returns neutral account-switch/support recovery. This same rule applies to short links and support-assisted replay.

## 12. Cross-journey first-use contract

After a successful relationship mutation, destination is selected from server-approved outcomes:

| Actor/outcome | First useful screen | Never default to |
|---|---|---|
| Solo owner-specialist | Solo clinical Today/first-run checklist | Empty clinic team dashboard |
| Clinic specialist | Own clinical Today | Organization management without capability |
| Admin without specialist binding | Organization overview | Doctor Today |
| Admin with binding | OM-1 selected management/clinical destination | A route that infers access from UI mode |
| Assistant | OM-2 bounded operations home | Doctor routes as shortcut |
| New patient by invite | Invite organization Today/appointment/program or relationship success state | Global mixed clinical feed |
| New patient by booking | Exact appointment in booking organization | Generic install page before value |
| Multi-org returning patient | Verified target or chosen/last-active organization | Silent organization selected from Host/query |

Install card may be dismissed. Already-installed suppresses repeat prompts; unsupported platforms get manual help
(including iOS Add to Home Screen), while browser access remains complete.

### Installed PWA and push lifecycle

1. First launch checks an authenticated server session. Because iOS/iPadOS Home Screen app storage/session behavior
   can differ from Safari, missing session is normal recovery, not a failed activation.
2. Missing/expired session starts patient passwordless OTP. It never consumes invite/enrollment/booking a second time.
3. After auth, the server resolves active enrollments and restores the exact trusted target or last-active authorized
   organization. Manifest, `start_url`, Host and stale local storage are presentation hints only.
4. Push subscription is created only for authenticated canonical user after an explicit gesture in a selected,
   authorized organization context. Denied/default/revoked OS permission, expired/rotated subscription and device
   replacement have settings recovery and do not remove email/browser access.
5. Notification open resolves target object server-side and rechecks current enrollment. Revoked/foreign target gives
   neutral recovery; service-worker caches, badges, counts and message copy cannot leak prior-organization content.

## 13. Owner decisions carried forward

UX-04 does not block documentation on these decisions, but dependent screens stay conditional:

1. OM-2 assistant permissions and first workspace.
2. OM-3 neutral multi-org default and suspended/archived relationship presentation.
3. Mandatory staff 2FA factor, roles and grace/step-up policy.
4. Enrollment creation moment for staff patient invite.
5. SMS-only activation launch scope; safe default is no.
6. UI wording/support path for a supported additive patient+staff persona. No silent persona overwrite is already a
   security/architecture requirement, not an owner choice.
7. Public-booking portal activation channel and ambiguous identity recovery.
8. Invite TTL/resend timing per staff/patient. Single-use, fresh token/invite on resend, immutable attempts and
   exactly-once relationship are security requirements, not owner choices.

These questions move to UX-08. Until rulings, implementation specifications must use the safe defaults above and
must not encode a candidate as an owner-approved product rule.

## 14. Current implementation reuse and gaps

| Area | Reuse candidate | Gap before target journey |
|---|---|---|
| Specialist signup | Existing start/confirm, email challenge and organization + owner membership provisioning | Deferred specialist binding; first-run/full 2FA; `challengeId` post-verification session reissue defect |
| Staff invite | Existing hash token, seven-day expiry, email OTP, org-scoped create/revoke/accept | Public lookup leaks full email; no other-active-org check; coarse role overwrite; deferred specialist binding; assistant/additive persona/full 2FA absent |
| Invite lifecycle/delivery | Current pending/accepted/expired/revoked and create/revoke/accept primitives | No superseded lifecycle, immutable provider attempts, complaint/suppression model, separate proof axis or complete relationship idempotency contract |
| Patient auth | Existing canonical email/password/OTP/OAuth and onboarding tier gates | Target is passwordless OTP; organization invite/enrollment acceptance and channel recovery without consumption absent |
| Public booking | Existing exact-org resolver, trusted phone identity and canonical appointment create | Atomic ensure-enrollment absent; anonymous response exposes internal `userId`; safe one-time portal continuation absent |
| Patient install/push | Existing install instructions and explicit Web Push control | Contextual post-value placement, installed first launch/session-or-OTP recovery, subscription rotation and authorized multi-org deep-link recovery |
| Patient organization | Existing active enrollment resolver | Complete context chooser/switcher and deep-link recovery |

No application/DB/delivery changes belong to UX-04 discovery.
