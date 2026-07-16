# UX-04 — Independent identity/security/product audit

**Historical pre-ruling notice (2026-07-16):** этот PASS предшествует
[`OWNER_RULINGS_2026-07-16.md`](./OWNER_RULINGS_2026-07-16.md). Он сохраняется без переписывания как evidence для
неизменившейся части прежнего scope, но **superseded for current normative acceptance** и не подтверждает
интеграцию новых owner outcomes. Текущий канон ожидает полный re-audit.

**Дата:** 2026-07-15
**Вердикт:** **PASS after integrated correction and full re-audit**
**Scope:** `ENTRY_AND_INVITE_JOURNEYS.md`, `UX04_SCREEN_STATE_LIST.md`, входные UX-02/03 артефакты,
owner rulings и релевантный current code. Application/DB/delivery state не менялись.

Разделы 1-5 сохраняют исходный FAIL и correction brief как audit history. Итоговый re-audit и действующий
вердикт зафиксированы в разделе 6.

## 1. Итог проверки

Структурно draft покрывает все семь обязательных journey: solo signup, staff invite, patient email invite, SMS
fallback, public booking, returning multi-org patient и terminal/wrong-recipient recovery. Сильные инварианты уже
заданы правильно:

- tenant context приходит из server-side invite/booking/object record, а не из Host/query/branding;
- staff one-org и patient multi-org не смешаны;
- delivery, identity и relationship названы разными понятиями;
- email остаётся binding для patient invite, SMS не повышает уровень доверия;
- acceptance требует recipient proof и exactly-once relationship mutation;
- install идёт после первого value, push — только после отдельного user gesture;
- permission denial, browser access и notification consent не смешаны;
- wrong-recipient, expired, revoked, superseded и concurrent replay имеют fail-closed recovery.

Этого недостаточно для PASS: current/target граница содержит несколько фактических ошибок, patient auth
противоречит прямому owner ruling, а retry/token/install contracts оставляют security-critical двусмысленности.
Ниже один полный correction brief, сгруппированный по корневым причинам. Его нельзя раздавать как серию узких
двухстрочных исправлений.

## 2. Consolidated correction brief

### F1 — Auth/persona contract не согласован с owner ruling и canonical identity

Owner ruling фиксирует: персонал использует email + password, пациент пока использует passwordless OTP; полная 2FA
механика должна быть подготовлена (`OWNER_RULINGS_2026-07-15.md:74-79`). Draft вместо этого предлагает пациенту
`sets/reuses an approved auth method`, `create credential` и перечисляет password/OAuth/OTP без разделения current
capability и target launch policy (`ENTRY_AND_INVITE_JOURNEYS.md:248-249,272,409`,
`UX04_SCREEN_STATE_LIST.md:36`). Это не открытое решение владельца.

Нужна единая правка J3/J5/J6 и screen states:

1. Target patient entry/activation — passwordless OTP по подтверждённому каналу; существующий password/OAuth в коде
   отмечается только как current/compatibility fact, если он действительно сохраняется.
2. Invite не расходуется при password recovery/channel recovery; relationship mutation выполняется только после
   повторной проверки canonical identity и bound recipient.
3. Staff target остаётся email + password. Для нового staff сначала recipient proof и установка password, для
   существующего — обычный login/step-up без создания второго credential owner.
4. Один global person, который уже является patient и получает staff invite, нельзя молча превратить из patient в
   doctor и потерять patient persona. Target должен определить additive persona/membership outcome либо явный
   fail-closed account-link/support path. Это architecture/product contract, а не разрешение переписать coarse
   `platform_users.role`.
5. Owner уже потребовал подготовить 2FA механику. Открыты factor, обязательные staff roles, grace и step-up policy,
   но не сам факт наличия target mechanics. Помимо setup нужны recovery codes/alternate recovery, lost-factor,
   factor replacement, session revocation, cooldown/abuse и unavailable-factor states для owner first-run и invited
   staff. `ACQ-05` не может ограничиваться абстрактным `security/2FA gate`.

### F2 — Current-vs-target section скрывает реальные identity/security gaps

Нужно перепроверить и переписать current facts целиком, а не добавить несколько сносок:

1. J1 ошибочно утверждает, что current signup сразу создаёт specialist binding
   (`ENTRY_AND_INVITE_JOURNEYS.md:133-136`). Current provisioning создаёт organization + owner membership с
   `specialist_id = NULL`; binding явно deferred
   (`deploy/postgres/specialist-owner-provisioning-rls.sql:149-182`). Journey map может описывать target outcome,
   но current reuse/gap обязан назвать deferred binding и отсутствие готового clinical actor.
2. Current signup `confirm` имеет security-relevant retry path: если email challenge уже отсутствует, route находит
   persistent signup intent по `challengeId`, не проверяет code и после idempotent provisioning снова выдаёт doctor
   session (`specialist-signup/confirm/route.ts:30-89`; это поведение закреплено route test). Поэтому current flow
   нельзя без оговорки называть `retry-safe`: UUID challenge сейчас фактически становится post-verification bearer
   для повторной session issuance. UX target должен требовать authenticated/idempotency receipt или уже
   установленную session, а current defect — попасть в implementation gap/security backlog; audit не предписывает
   конкретный code fix.
3. J2 правильно требует fail-closed при active staff membership другой organization, но current
   `app.accept_org_invite` такого check не делает: он обновляет global role до `doctor` и upsert-ит active membership
   целевой организации (`organization-member-invites-rls.sql:207-270`). Это прямой current gap, а не уже доступный
   reuse contract.
4. Current staff acceptance также не создаёт specialist binding: SQL прямо устанавливает `v_specialist_id := NULL`
   (`organization-member-invites-rls.sql:230-263`). Current gap table должна отделить membership acceptance от
   будущей specialist provisioning.
5. Public lookup staff invite до auth возвращает полный `invited_email`, хотя target preview требует masked
   recipient (`clinic/invites/accept/lookup/route.ts:18-29`). Отсутствие page не устраняет API privacy gap.
6. Public booking действительно ещё не создаёт enrollment atomically; кроме того, anonymous response сейчас отдаёт
   внутренний `userId` (`booking/public/create/route.ts:55-95`). Target continuation должен быть signed one-time
   handle или authenticated object access, а внутренний identity id не должен описываться как portal continuation.
7. Current invite statuses не имеют `superseded`, provider delivery attempts, complaint/suppression и accepted
   relationship axis в целевой полноте. Target reuse table должна сказать это явно и не создавать впечатление, что
   current `create/revoke/accept` уже реализует целую lifecycle model.

### F3 — Invite lifecycle и token exchange описаны двумя несовместимыми способами

В начале документа справедливо разделены delivery, identity и relationship, но diagram затем снова складывает их в
одну линейную status machine (`pending_delivery → delivered/delivery_failed` рядом с `pending_acceptance`). Один
invite может оставаться pending acceptance после bounce, быть accepted до provider delivery webhook или иметь
несколько email/SMS attempts с разными outcomes. `accepted` в delivery status list также усиливает смешение
(`ENTRY_AND_INVITE_JOURNEYS.md:17-23,55-72,89-99`).

Нужно за один pass определить:

- invite/relationship axis: pending, accepted, expired, revoked, superseded;
- отдельную коллекцию immutable delivery attempts с channel/provider states;
- отдельный auth/recipient-proof state, который не хранится как delivery success;
- concurrency rule и database uniqueness/idempotency key для exactly-once membership/enrollment;
- resend semantics для pending/terminal/current relationship без переписывания старого audit trail;
- correction semantics: новый recipient означает новый invite, а не mutation старого recipient.

Token contract тоже должен быть завершён. После первичного server exchange raw bearer удаляется из URL/history и
не передаётся дальше между screens; browser получает узкий short-lived continuation, не session и не новый
бессрочный bearer. Для accepted/replayed invite переход в existing relationship разрешается только после auth и
совпадения с `accepted canonical user`/действующей relationship. Сам terminal token не должен выбирать чужой
workspace. Те же правила нужны для referrer, analytics, support logs, custom-domain fallback и cross-origin
redirects.

### F4 — Install/push flow заканчивается до первого запуска установленного приложения

Draft правильно ставит install после value и push после gesture, но `PIN-07/PIN-08` покрывают только предложение и
permission. Не покрыт обязательный переход browser → installed PWA, особенно описанное в UX-02 различие cookie и
non-cookie storage на iOS/iPadOS.

Нужно добавить в J3/J5/J6 и state list:

- первый launch установленной PWA с сохранённой session и без неё;
- passwordless re-auth без повторного consumption invite/enrollment;
- восстановление exact active organization из server-side enrollment/authorized target, а не из manifest,
  `start_url`, Host или stale local storage;
- уже установленное приложение, повторный install offer, unsupported/manual iOS flow и dismissed offer;
- push subscription только после authenticated canonical user и выбранного разрешённого context;
- denied/default/revoked OS permission, subscription expired/rotated и settings recovery;
- notification/deep-link revalidation при revoked enrollment и запрет cross-org cached counts/content.

Browser access должен оставаться полноценным во всех этих состояниях.

### F5 — Screen/state list пока не является точной проекцией journeys

После F1-F4 надо синхронно обновить `UX04_SCREEN_STATE_LIST.md`, не создавать ещё один parallel list:

- заменить patient `create credential` на owner-approved passwordless OTP/recovery contract;
- разделить invite relationship и per-channel delivery attempts в `STF-01/STF-03/PIN-02`;
- добавить token exchange/URL scrub и safe continuation states;
- добавить current-persona collision без silent role overwrite;
- расширить owner/staff 2FA recovery states;
- добавить first installed launch/session transfer or re-auth state между install и push;
- для replay указать auth + accepted-user/relationship match до exact-context redirect;
- сохранить no-enrollment, ambiguous identity, foreign/revoked target и organization unavailable как разные recovery
  outcomes.

## 3. Owner decisions и решения, которые нельзя приписывать владельцу

Корректно остаются открытыми: OM-2 assistant scope, OM-3 neutral multi-org default, точный patient-invite enrollment
moment, SMS-only activation launch scope, public-booking activation channel, 2FA factor/mandatory roles/grace и
TTL/resend values.

Нужно исправить provenance:

- patient passwordless OTP и необходимость полной 2FA mechanics уже даны владельцем, это не новые hypotheses;
- exact token storage/exchange, idempotency/concurrency, no-silent-role-overwrite и one-active-staff-org enforcement —
  security/architecture requirements, их не надо отправлять владельцу как инженерный выбор;
- product choice о том, допускается ли одна global identity одновременно в patient и staff personas и как это
  объясняется в UI, можно вынести в UX-08 только если после architecture-safe baseline остаются реально разные
  пользовательские варианты;
- current code behavior никогда не считается owner decision.

## 4. Acceptance trace

| Область | Результат |
|---|---|
| Семь mandatory journeys присутствуют | PASS |
| Trigger / actor / channel / trusted organization source | PASS |
| Staff one-org и patient multi-org target boundary | PASS target; FAIL current-gap honesty |
| Email binding, SMS fallback и no SMS elevation | PASS |
| Identity resolution и canonical patient reuse | FAIL: patient auth policy/persona collision incomplete |
| Membership/enrollment exactly once и transaction boundary | PARTIAL: target intent есть; lifecycle/idempotency contract incomplete |
| Delivery outcome отдельно от acceptance | FAIL: prose correct, state machine/list conflates axes |
| Wrong-recipient / expiry / revoke / replay / concurrency | PARTIAL: recovery present; accepted-user/token exchange checks incomplete |
| Privacy до auth и redirect/token hygiene | FAIL: current full-email leak omitted; exchange continuation unspecified |
| Public booking → enrollment → portal | PARTIAL: target sound; continuation/internal-id boundary incomplete |
| Returning multi-org context and deep-link authorization | PASS, subject to OM-3 ruling |
| Install after value and explicit push consent | PARTIAL: first installed launch/session recovery absent |
| Staff password and 2FA target/recovery | PARTIAL: password direction sound; full 2FA mechanics incomplete |
| Current versus target honesty | FAIL: specialist binding, retry/session, other-org acceptance and privacy gaps omitted |
| Owner decisions versus agent/architecture decisions | FAIL: patient auth ruling blurred; technical invariants over-escalated |

## 5. Re-audit gate

Один capable correction owner должен согласованно обновить существующие `ENTRY_AND_INVITE_JOURNEYS.md` и
`UX04_SCREEN_STATE_LIST.md` по F1-F5, сохранив семь journeys и safe defaults. После этого нужен один полный
identity/security/product re-audit всего UX-04, а не цепочка узких fix/audit циклов.

Проверка audit artifact: `git diff --check` должна быть PASS. App tests/DB smoke не требуются, потому что аудит не
меняет application code, schema или runtime state.

## 6. Full re-audit after integrated correction — 2026-07-15

### 6.1 Метод и итог

Повторно проверены не только changed lines, а весь UX-04: orchestration canon, `REQUIREMENTS.md`, `ROADMAP.md`,
`OPERATING_MODEL.md`, `ROLE_CAPABILITY_MATRIX.md`, owner rulings, UX-02 identity/PWA evidence, релевантный current
code, оба исправленных product artifacts и исходные F1-F5 выше.

Итоговый вердикт — **PASS**. Все пять корневых finding закрыты согласованно; ранее проходившие tenant, channel,
privacy, recovery и multi-org инварианты сохранены. PASS означает полноту и непротиворечивость decision-ready UX
contract. Он не означает, что перечисленные current implementation gaps уже исправлены, и не утверждает открытые
owner decisions.

### 6.2 Проверка F1-F5

| Finding | Результат re-audit |
|---|---|
| F1 — auth/persona/2FA | PASS: patient target буквально passwordless OTP; current password/OAuth отделены как compatibility facts; staff остаётся email+password; recovery не расходует invite; patient+staff persona только additive либо fail-closed link/support; полные 2FA setup/recovery/replacement/session-revocation states заданы, а открыты только factor/roles/grace/step-up policy |
| F2 — current-vs-target honesty | PASS: deferred specialist binding зафиксирован для signup и staff invite; `challengeId` session-reissue defect, missing other-active-org check, coarse role overwrite, pre-auth full-email leak, incomplete lifecycle/delivery и public-booking internal `userId` перечислены как current gaps, не target behavior |
| F3 — lifecycle/token exchange | PASS: relationship, immutable delivery attempts и auth/proof разведены в три независимые оси; exactly-once row lock/uniqueness/idempotency, fresh invite on resend, immutable predecessor trail, raw-token URL scrub, narrow continuation, accepted-user replay match и cross-origin restriction заданы явно |
| F4 — installed PWA/push | PASS: browser→installed first launch, valid/missing session, passwordless re-auth без повторного invite consumption, server-side org restoration, iOS/manual/already-installed states, explicit push gesture, permission/subscription rotation и deep-link enrollment recheck покрыты |
| F5 — screen/state parity | PASS: `UX04_SCREEN_STATE_LIST.md` синхронно отражает исправленный contract без parallel list; PIN-08 добавляет first installed launch, PIN-09 — полный push lifecycle; staff/persona, token scrub, delivery axes, replay и 2FA recovery states представлены буквально |

### 6.3 Полный journey trace

| Journey | Trigger/channel/trust | Identity/relationship outcome | Recovery/privacy | Результат |
|---|---|---|---|---|
| J1 solo signup | Landing CTA, email challenge, server-side signup intent | Verified staff identity → owner membership → отдельно authorized specialist binding | Duplicate/expired/partial provisioning, no unauthenticated `challengeId` retry in target, full security setup | PASS |
| J2 staff invite | Authorized team management, primary email, hash-only invite | Email+password staff auth; exactly-one same-org membership; other-org/persona collision fail closed | Masked preview, seat/org unavailable, supersede/correction, 2FA recovery, no client role/binding authority | PASS |
| J3 patient email invite | Org-bound invite, email primary | Passwordless canonical patient proof → exactly-one org enrollment; multi-org adds enrollment, not identity | Wrong address, inaccessible channel, idempotent replay, first value, install/first-launch/push recovery | PASS |
| J4 SMS fallback | Additional attempt on same invite | No new identity/invite/enrollment and no email-proof bypass | Consent/suppression/opt-out/rate limits; neutral copy; no SMS topic-default side effect | PASS |
| J5 public booking | Published server-resolved branch/service/slot | Canonical phone identity + target atomic appointment/enrollment; portal session remains separate | Ambiguous identity, slot/delivery failure, signed continuation, no internal id authority, exact appointment first value | PASS |
| J6 returning multi-org | Neutral/PWA/trusted object entry | Global auth then server-resolved active enrollment; no staff-style org switch semantics | Chooser on ambiguity, revoked/foreign target denial, cache/count isolation, installed re-auth | PASS subject to OM-3 presentation ruling |
| J7 terminal/wrong-recipient | Server-classified invite lifecycle | No mutation for terminal token; exact existing relationship only after auth + accepted-user/live-relationship match | Invalid/expired/revoked/superseded/wrong account/seat/org/concurrency states remain neutral and audit-visible | PASS |

### 6.4 Security, privacy and provenance trace

- Organization authority always comes from server-side signup intent, invite, booking catalog/object or active
  enrollment. Host, custom domain, query, manifest, selected specialist and remembered context remain hints only.
- Pre-auth preview stays neutral and masked; clinical reason/content is excluded. Current full-email lookup is
  explicitly documented as a defect, not normalized into target UX.
- Email/SMS provider success never proves identity or relationship. Raw bearer, provider payload and clinical copy
  are excluded from ordinary analytics/support logs.
- Staff one-active-organization and patient multi-enrollment models remain distinct. Filters and UI destination do
  not widen authorization.
- Patient passwordless OTP and the requirement to prepare complete 2FA mechanics are correctly attributed to owner
  rulings. Token exchange, exactly-once mutation, no silent persona overwrite and one-active-staff-org enforcement
  are correctly treated as architecture/security requirements. OM-2, OM-3, enrollment timing, SMS-only scope,
  activation channel, 2FA policy details and TTL/timing remain explicit pending decisions.

### 6.5 Validation

- Seven required journeys: present and complete.
- `ENTRY_AND_INVITE_JOURNEYS.md` ↔ `UX04_SCREEN_STATE_LIST.md`: consistent.
- Current code claims sampled against signup provisioning/confirm, organization invite accept/lookup and public
  booking create paths: consistent with the corrected gap table.
- `git diff --check`: PASS.
- App tests/DB smoke: not run; docs-only discovery/audit, no runtime mutation.
