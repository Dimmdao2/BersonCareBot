# Landing, unified entry, tenant public page and PWA install policy — design (#807)

**Статус:** design doc, DOCS-ONLY. No application code, schema or config changed by this pass. Written against
repo state on `feat/doctor-ui-rebuild`, 2026-07-17.

**Authority order:** `docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-17.md` §2 (arms this card, coordinates
with #801/#805/#806/#808) → `docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-17.md` §1 (confirms
`/book/{publicSlug}` canon for #805) → `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_RULINGS_2026-07-16.md`
(highest product/UX authority, dated) → `TARGET_IA.md` / `ENTRY_AND_INVITE_JOURNEYS.md` / `ROUTE_MIGRATION_MAP.md`
/ `SCREEN_COMPOSITION.md` / `IMPLEMENTATION_ROADMAP.md` (audited UX-04/06/09 package, merged to
`feat/doctor-ui-rebuild` at `12cdef5d6`) → `BRANDING_DOMAIN_CONTRACT.md` (UX-05, brand/domain contract) → this
document.

**This is not a from-scratch redesign.** The audited UX package already assigns stage ownership, screen IDs and
engineering invariants for everything card #807 asks for. §0 below cites exactly what already exists; §1 is the
current-code reality audit; §2-§5 are the delta this doc adds (route map, screen states, auth-intent flow, PWA
policy change, config-driven domain model); §6 is the phased TEST-only checklist; §7 collects contradictions;
§8 is the dedicated owner-decision section.

Card #807 text (taskdb, verbatim, owner exploration 2026-07-16, armed 2026-07-17):

> Redesign entry routing before domain/app naming migration. Recommended architecture to validate against
> audited SaaS UX docs: broad rehab-support platform landing with specialist-first commercial CTA; secondary
> patient entry only. Unified auth with optional UX intent specialist/patient but authority/redirect derived
> after auth because one identity may have multiple roles. Tenant/solo public page with branding, booking and
> patient login; direct public booking; separate exact patient/card/program claim flow (#806); future public
> widget, with authenticated patient flow promoted to top-level origin due third-party-cookie limits.
> Reconsider current hard PWA install redirect: browser patient cabinet should remain usable and offer install
> prompt; require installed PWA only for capabilities that truly need it (push/offline) unless owner later
> chooses otherwise. Keep route/domain values DB-backed/public-base configurable, no hardcoded current domain.
> Coordinate #805/#806/#801 and SAAS_PRODUCT_UX_INITIATIVE route/IA docs.

---

## 0. Position in the audited UX package

### 0.a What the package already specifies (cite doc + section + stage ID)

- **Stage ownership is already assigned.** `IMPLEMENTATION_ROADMAP.md` §8 **U6A — "specialist-oriented platform
  landing and acquisition"** (:603-630) owns `PUB-01…05`; its `Outcome` line (:605-606) is verbatim card #807's
  ask: "a specialist or clinic understands the product and reaches signup/demo; patient login remains available
  but secondary." **U6B — "published organization profile, booking and trusted join"** (:632-662) owns
  `ORG-PUB-01…03` (tenant/solo public page + booking + join). **U3S** (:383-424) owns the shared signup/login
  surface `PUB-03/PUB-04`. **U3B** (:450-486) owns install education and installed-launch re-auth (`PAT-11`).
  **U5A** (:353-381) owns the post-auth patient organization resolver that the "authority derived after auth"
  requirement in the card depends on.
- **Landing composition and audience are already ruled**, not just recommended: `TARGET_IA.md` §3 (:150-159)
  — "`PUB-01` is specialist-oriented. The patient CTA is compact: «У меня есть приглашение» / «Войти». Patient
  free registration is not presented as the hero path." `TARGET_IA.md` §10 (:282-298) fixes header hierarchy
  (trust anchor → product/pricing → demo/signup, with the patient/staff entry "visually secondary") for both
  desktop and mobile, and states it explicitly: "CTA priority... do not change at the breakpoint."
  `ROUTE_MIGRATION_MAP.md` row **P01** (:28) already dispositions the current `/` file as `split → PUB-01`:
  "Replace patient-first hero with specialist acquisition; patient entry secondary."
- **Unified auth + post-auth authority is already the target invariant, not a new idea.**
  `IMPLEMENTATION_ROADMAP.md` §4 (:87-113): "Organization context приходит только из server-resolved membership...
  Host/query/client payload — hint/continuation, не authority" and TARGET_IA.md §1 rule 3 (:16-17): "Staff
  navigation is assembled from capabilities... Membership labels and hidden menu items are not authorization."
  `ENTRY_AND_INVITE_JOURNEYS.md` §2 invariant 14 (:52-53): "Одна canonical identity может получить дополнительную
  persona/relationship только аддитивно" — i.e. the package already anticipates one identity holding multiple
  roles, which is exactly card #807's stated reason for deriving redirect after auth, not from a client intent
  flag. `ROUTE_MIGRATION_MAP.md` row **P02** trace (:102) states the target contract for `/app/page.tsx`
  directly: "authenticated launch resolves to `CLIN-01`, `MGMT-01`, `PAT-01/02` or `PLAT-01` according to actual
  relationship/capability" — never from a query-supplied persona.
- **Tenant/solo public page (branding + booking + patient login) is already screen-composed.**
  `SCREEN_COMPOSITION.md` §2 (:42-44): `ORG-PUB-01` = "Organization brand/header; description; specialists;
  services; locations; contacts/legal; booking/join CTA"; `ORG-PUB-02` = "Branded org summary; service →
  specialist/location → slot → identity → review → done"; `ORG-PUB-03` (`/join/[exchange]`) = "Neutral exchange;
  org summary; masked recipient; OTP/auth; relationship confirmation; first useful destination; install prompt."
  `BRANDING_DOMAIN_CONTRACT.md` §5.2/§5.3 (:134-153) fix the exact same shape and its degradation/fallback rules.
  `OWNER_RULINGS_2026-07-16.md` **UX08-06** (:60-64): "Для первой публичной версии выбраны platform landing,
  опубликованные страницы организаций, booking и join. Общий каталог/поиск организаций переносится на потом" —
  directory (`PUB-06`) is the only deferred piece; profile+booking+join are in scope now.
- **The hard PWA install redirect is already contradicted by ruled canon, not an open question about whether
  browser access should exist at all.** `ENTRY_AND_INVITE_JOURNEYS.md` §2 invariant 10 (:45): "Browser остаётся
  полноценным способом доступа; install и push не являются условиями активации." `BRANDING_DOMAIN_CONTRACT.md`
  §6 (:188): "Install is optional; browser entry remains complete. Push permission is a later, explicit user
  gesture." Card #807's "reconsider the hard PWA install redirect" is asking implementation to *catch up* to
  already-ruled canon, not asking for a new product decision.
- **Config-driven domain/public-base is already a sanctioned pattern, not a new mechanism to invent.**
  `.cursor/rules/000-critical-integration-config-in-db.mdc` (AGENTS.md §2) mandates DB-backed
  `system_settings` for exactly this class of value. The repo already has a working instance: `app_base_url`
  (see §4 below) — the gap is three call sites that don't use it yet, not a missing chokepoint.

### 0.b What the package leaves open that #807 needs decided

- **Exact route/shape of the tenant public page relative to `/book/{publicSlug}`.** `SCREEN_COMPOSITION.md` §2
  drafts `ORG-PUB-01` at candidate route `/o/[orgSlug]` and `ORG-PUB-02` at `/o/[orgSlug]/book/**` (:42-43) — but
  `OWNER_RULINGS_2026-07-17.md` §1 (dated *after* the UX package, so it wins per `AGENTS.md`/`IMPLEMENTATION_
  ROADMAP.md` §2 provenance order) confirms only `/book/{publicSlug}` for the **booking** link, and does not
  say where the organization **profile** (branding/services/specialists, i.e. `ORG-PUB-01`) lives relative to
  it. This is a genuine open IA question — flagged as owner decision O-1 in §8, not invented here.
- **Whether the auth-intent split needs a visible UI toggle/selector, or two CTAs into the same shell is
  enough.** The package fixes the *outcome* (specialist CTA primary, patient CTA secondary, one shared login
  surface, §0.a) but does not specify the interaction mechanism for choosing which mode of the shared auth
  surface renders by default. Current code already implements two separate CTAs landing on the same shell
  (§1.3) — #807 needs to confirm this pattern is sufficient or wants a different composition.
- **Precise list of "capabilities that truly need install".** Card #807 gives push/offline as examples
  ("e.g."), not an exhaustive list. `BRANDING_DOMAIN_CONTRACT.md` §7.3 (:310-316) confirms push is
  origin-bound and needs an installed/subscribed context; nothing in the audited package enumerates offline/
  service-worker caching, background sync or badge API as gated capabilities. Flagged as owner decision O-3.
- **Whether the "future public widget... promoted to top-level origin due third-party-cookie limits" note in
  the card has any corresponding canon.** It does not appear anywhere in `TARGET_IA.md`, `ENTRY_AND_INVITE_
  JOURNEYS.md`, `ROUTE_MIGRATION_MAP.md`, `SCREEN_COMPOSITION.md` or `IMPLEMENTATION_ROADMAP.md`. It is a
  #807-local forward-looking note, not sanctioned UX-09 stage scope — treated as non-blocking backlog only
  (§6 Phase 5, not implemented).
- **Exact copy/labels for the two landing CTAs.** Implementation detail, but per memory
  (`communicate-decisions-in-plain-language`, `owner-protocol-expanded`) the owner has previously cared about
  exact wording/IA on this landing; flagged as a design-review checkpoint in §6, not blocking the technical
  contract below.

### 0.c This document's contract for the delta

§1 is the current-code reality audit (evidence, file:line) for landing, auth entry, PWA gate, public org pages
and domain hardcoding. §2 is the route map delta. §3 is the auth-intent flow contract. §4 is the PWA install
policy change. §5 is the config-driven domain/base-URL delta (reuse, not invention). §6 is the phased,
independently-auditable, TEST-only checklist. §7 collects contradictions found against the package and current
code. §8 is the dedicated owner-decision section — it does not answer these for him.

---

## 1. Reality audit (evidence, file:line)

### 1.1 Current landing `/` — patient-first PWA marketing page, not yet specialist-first

`apps/webapp/src/app/page.tsx:1-71`. Doc comment (:1-6) states the current intent plainly: "Корневая страница
«/»: лендинг PWA BersonCare... В обычном браузере остаётся лендинг. В установленной PWA корень страхуется
редиректом в приложение пациента." Section order (:60-67): `HeroSection` → `InstallSection` → `FeatureGrid` →
`SpecialistSection` → `FinalCta` — specialist content is a supporting section, not the hero. `metadata`
(:20-22): "BersonCare — забота о твоём здоровье... Мобильный помощник для восстановления и реабилитации:
разминки, упражнения, дневник самочувствия" — consumer/patient-app framing throughout, matching
`SCREEN_INVENTORY_PATIENT_PUBLIC.md`'s finding (:72, :176): "Public landing has the wrong primary audience for
specialist-oriented SaaS. It currently sells a free patient rehab app and installation." This confirms
`ROUTE_MIGRATION_MAP.md` row P01's disposition is still **unexecuted** — the split has not happened yet.

`apps/webapp/src/components/landing/StandaloneRootRedirect.tsx:1-24` — when the installed PWA opens on `/`, it
redirects to `/app/patient` (:19). This is a *separate* mechanism from the PWA install gate audited in §1.4 —
it only fires when already standalone, is a convenience shortcut for returning installed users, and is
explicitly **not** part of the "hard redirect" problem card #807 flags. It should be preserved as-is; §4 and §6
must not conflate the two.

### 1.2 Auth gateway `/app` — already a single shared surface with post-auth-derived authority

`apps/webapp/src/app/app/page.tsx:1-15` and `apps/webapp/src/app/app/AppEntryRsc.tsx:1-93` are the one shared
entry for staff login, patient login and specialist registration; `/app/tg` and `/app/max` (`apps/webapp/src/
app/app/{tg,max}/page.tsx`) reuse the identical `AppEntryRsc` component with a route-bound messenger surface
hint (`AppEntryRsc.tsx:26,64-69`) — one shell, not three.

Redirect authority is **already** derived from the server session, not a client parameter:
`AppEntryRsc.tsx:36-38` — `if (session) { redirect(getPostAuthRedirectTarget(session.user.role, nextParam ??
null)); }`. `apps/webapp/src/modules/auth/redirectPolicy.ts:12-39` — `getRedirectPathForRole` (:12-15): doctor/
admin → `routePaths.doctor`, everything else → `routePaths.patient`; `getPostAuthRedirectTarget` (:29-39): for
non-`client` roles it **ignores** `nextParam`/fallback entirely and always returns the role path (:34); only
`client` role consults a validated `next` (`isSafeNext`, :18-22, restricted to the `/app/patient` subtree,
excluding `bind-phone`). There is no code path anywhere in this function that reads a client-supplied intent/
persona value to choose the destination. This already matches the target invariant in §0.a and is the correct
foundation for card #807's "authority/redirect derived after auth" — **no regression risk here as long as the
delta in §3 does not introduce a new parameter that this function starts trusting.**

Specialist self-registration already exists as a mode of the same shared shell, gated by a DB-backed flag:
`apps/webapp/src/modules/auth/publicAuthSnapshot.ts:7-24` calls `getSpecialistSignupEnabled()` alongside OAuth/
Telegram config and passes `specialistSignupEnabled` into the client `AuthFlowV2` component.
`apps/webapp/src/shared/ui/patient/auth/AuthFlowV2.tsx:296-328` switches on `p.mode`: `register_verify`
(:296), `specialist_signup_verify` (:307), `password_reset` (:328) — confirming registration (patient) and
specialist signup (staff) are modes of **one** component tree, matching the 2026-07-13 split-registration
ruling (memory: `split-registration-staff-vs-patient`) and `OWNER_RULINGS_2026-07-16.md` UX08-04 (:44-49, "one
login" + `ENTRY_AND_INVITE_JOURNEYS.md` J1 §5 open-decision safe default, :199-200: "one account form, optional
practice-shape question for onboarding composition").

Dev-only entry points already distinguish "specialist/clinic" vs "patient" vs role-specific staff logins as
separate buttons on the same page: `apps/webapp/src/app/app/AppEntryLoginContent.tsx:54-90` — "Регистрация
специалиста / клиники" (`/api/auth/dev-public?view=clinic-registration`), "Как пациент"
(`dev-bypass?token=dev%3Aclient`), plus separate clinic-admin/doctor/global-admin dev buttons. This dev-only
panel is a reasonable analogue for what the two production landing CTAs in §2/§3 should route into.

### 1.3 Hard PWA install redirect — confirmed exactly as the card describes, contradicts ruled canon

`apps/webapp/src/shared/lib/pwa/pwaAppAccessPolicy.ts:1-55`:
- `isPatientPwaGatedPath` (:13-16) — true for the entire `/app/patient` subtree.
- `browserRequiresPwaStandaloneForAppPath` (:23-26), doc comment: "Patient cabinet (`/app/patient/**`) requires
  installed PWA (standalone) unless exempt. Doctor/admin/settings — browser OK." — i.e. **only** the patient
  cabinet is gated; doctor/admin/settings are never gated this way.
- `shouldAllowPwaAppShellAccess` (:37-43): returns `false` (blocks) unless `allowBrowserAccess`, messenger
  mini-app, or already `standalone` — for ordinary browser access to the patient cabinet, this is `false` by
  default.
- `buildPwaInstallLandingRedirectUrl` (:45-54): builds `/?next=<returnTo>#install` or `/#install`.

`apps/webapp/src/shared/ui/patient/pwa/PwaAppAccessGate.tsx:1-41` — client component, `useEffect` (:24-37)
computes the decision every render and calls `router.replace(target)` (:36) when not allowed — a full-page
client-side redirect away from whatever `/app/patient/**` content the user requested, back to the marketing
landing's install anchor.

`apps/webapp/src/app/app/patient/PatientClientLayout.tsx:13,22` — wiring: `const allowPatientBrowserAccess =
process.env.NODE_ENV !== "production";` passed as `allowBrowserAccess` into `PwaAppAccessGate`. **This means in
any build where `NODE_ENV === "production"` (prod and — per `docs/ARCHITECTURE/SERVER CONVENTIONS.md` TEST
topology — the TEST server, which runs the same production build) plain browser access to the entire patient
cabinet is unconditionally redirected away unless the visitor is already in standalone/installed mode or inside
a Telegram/MAX mini app.** There is no system-settings flag, no capability check, no per-feature gate — it is a
path-prefix redirect over the whole `/app/patient/**` tree.

This directly contradicts `ENTRY_AND_INVITE_JOURNEYS.md` §2 invariant 10 and `BRANDING_DOMAIN_CONTRACT.md` §6
(both cited in §0.a) — both already-audited/ruled documents state browser access must remain complete. Card
#807's "reconsider" instruction is implementation catching up to canon, not opening a new product question.
See §7 contradiction 2.

### 1.4 Tenant/solo public page and public booking — not yet built; #805 is `todo`, coordinate not duplicate

`node /home/dev/brain/tools/taskdb.mjs list bcb` confirms **#805 is status `todo`**, not in progress and not
done: "Public booking: trusted clinic-specific link... Needs owner decision... Recommended minimal product
path: explicit organization-scoped public link using stable clinic slug/token resolved server-side to
organization before catalog reads." `OWNER_RULINGS_2026-07-17.md` §1 (:12-19) has since armed it: "владелец
выбрал вариант «/book/имя-клиники»... Карточка #805 разблокирована в todo" — decision made, implementation not
started.

Current `/book/**` (`apps/webapp/src/app/book/new/page.tsx` and siblings) resolves organization from
`branchServiceId`/`branchId` query params carried through the wizard, validated against
`branch.organizationId`/`service.organizationId` (per `SCREEN_INVENTORY_PATIENT_PUBLIC.md` §4 evidence,
`apps/webapp/src/app/book/new/page.tsx:30-82`, lines 53-72) — **not** from a stable public slug. There is no
`/book/{publicSlug}` resolver, no `/o/[orgSlug]` organization-profile route, and no combined branding+booking+
patient-login public page anywhere in the current route tree. `ROUTE_MIGRATION_MAP.md` §2 rows P04-P07 already
disposition the current wizard as `keep/move` reuse target once organization resolution is added (:31-34).

**Coordination, not duplication:** the sibling design doc `docs/_TODO/SAAS_FOUNDATION/
PATIENT_INVITE_AND_MANUAL_CREATION_DESIGN.md` §6 (for #801/#806) already specifies the shared
`ensureActiveEnrollment(organizationId, platformUserId)` chokepoint that both #805's booking-enrollment gap and
its own invite-redeem must call through — one function, not two. That doc also confirms `/join/[exchange]` as
the canonical unbuilt route for `ORG-PUB-03` (its §9 contradiction 10). This design's §2/§8 explicitly does
**not** re-derive the slug resolver, the booking transaction, or the join/redeem route — those belong to #805/
#806 respectively; this design only specifies where the tenant public **page** (branding + booking CTA +
patient login CTA) sits relative to them.

### 1.5 Domain/public-base hardcoding — a sanctioned DB-backed accessor already exists, three call sites bypass it

`apps/webapp/src/modules/system-settings/types.ts` `ALLOWED_KEYS` already contains `app_base_url` with the
doc comment: "Публичный origin веб-приложения (https://…), без завершающего /. Ссылки /app/… строятся от него.
Fallback: env `APP_BASE_URL`." The sanctioned accessor is `getAppBaseUrl()` / `getAppBaseUrlSync()` in
`apps/webapp/src/modules/system-settings/integrationRuntime.ts`, already consumed by: OAuth callbacks
(`app/api/auth/oauth/callback/{google,apple}/route.ts`, `modules/auth/yandexOAuthCallbackHandler.ts`), Google
Calendar callback (`app/api/admin/google-calendar/callback/route.ts:23`), clinic invites
(`app/api/clinic/invites/route.ts:60`), reminders (`modules/reminders/buildReminderDeepLink.ts:49`), web push
(`modules/patient-notifications/patientWebPushNotify.ts:90`), broadcasts
(`modules/doctor-broadcasts/fanOutBroadcastWebPush.ts:14`), online-intake relay
(`modules/online-intake/intakeNotificationRelay.ts:45`), and messenger phone binding
(`app-layer/integrator/messengerPhoneHttpBindExecute.ts:208`). Admin UI to set it already exists:
`apps/webapp/src/app/app/settings/AppParametersSection.tsx:88,119,127` (`patchAdminSetting("app_base_url", ...)`,
placeholder `https://bersoncare.ru`, fallback note "APP_BASE_URL из окружения"), read via
`apps/webapp/src/app/app/settings/adminSettingsData.ts:331-333`.

**The gap is narrow and does not require inventing anything new.** Three call sites still hardcode the literal
domain instead of using the existing accessor:
- `apps/webapp/src/app/page.tsx:26,32` — `export const metadata` sets `metadataBase: new URL("https://
  bersoncare.ru")` and `openGraph.url: "https://bersoncare.ru"` as static values.
- `apps/webapp/src/components/landing/WrongBrowserBanner.tsx:14-15` — `const SITE_URL = "bersoncare.ru";
  const SITE_HREF = "https://bersoncare.ru";`.
- `apps/webapp/src/shared/lib/buildCalendarLinks.ts:53-54` — ICS `UID` suffix literal `@bersoncare.ru` for both
  the with-`bookingId` and without-`bookingId` branches.

This is exactly card #807's "route/domain values DB-backed/public-base configurable, no hardcoded current
domain" — satisfied by migrating these three call sites onto the existing chokepoint, per the repo's
single-chokepoint convention (memory: `owner-prefers-single-chokepoint-no-dup`). See §5.

---

## 2. Route map delta

This delta is additive/corrective over `ROUTE_MIGRATION_MAP.md` rows P01/P02/P04-P07 (§2 of that doc) and does
not re-open rows this design does not touch.

| Current | Target (per this card) | Status | Notes |
|---|---|---|---|
| `apps/webapp/src/app/page.tsx` (`/`) | `PUB-01` specialist-first landing | **unexecuted** (§1.1) | Reorder sections: specialist value/CTA leads; keep `InstallSection` and a compact patient "У меня есть приглашение / Войти" entry per `TARGET_IA.md` §3; do not remove patient-care proof, demote it to a supporting/trust section per `TARGET_IA.md` §10 ("Patient care proof supports the buyer story and does not become a patient-acquisition hero") |
| `apps/webapp/src/app/app/*` (`AppEntryRsc`) | `PUB-03`/`PUB-04` (kept, no route rename) | **already correct shape** (§1.2) | Only change: accept an optional UX-only `intent` hint (§3) to pick which mode the shared shell defaults to; `getPostAuthRedirectTarget`/`getRedirectPathForRole` (redirectPolicy.ts) remain untouched and remain the sole redirect authority |
| `apps/webapp/src/app/book/**` current wizard | `ORG-PUB-02` under owner-confirmed `/book/{publicSlug}` | **owned by #805**, not this card | This design consumes the resolved organization context on the landing/tenant page; it does not implement slug resolution, and must not fork a second booking entry point |
| *(none exists)* organization public profile | `ORG-PUB-01` — route **needs-decision** (see O-1, §8) | **not built** | Branding + specialists/services/locations + booking CTA + patient-login CTA, per `SCREEN_COMPOSITION.md` §2; reuse published-projection concept from `BRANDING_DOMAIN_CONTRACT.md` §11 — no schema invented here |
| `/#install` (landing anchor) | Voluntary install education section (kept), **no longer** a redirect target enforced against `/app/patient/**` | **partially built** (`InstallSection` exists; the enforced-redirect use in `pwaAppAccessPolicy.ts` is removed, §4) | The anchor/section itself is fine and stays; only its use as an *enforced gate destination* is removed |

---

## 3. Auth-intent flow (UX-only hint, authority stays server-derived post-auth)

- **Landing CTAs.** Primary "Создать кабинет" / "Записаться на приём" (specialist/clinic-oriented, matches
  `TARGET_IA.md` §3's "specialist: start practice, clinic: request demo") routes to `/app?intent=specialist`
  (or reuses the existing `?view=clinic-registration`-style parameter already wired for dev, §1.2). Secondary,
  visually subordinate "У меня есть приглашение / Войти" routes to plain `/app` (login mode). Both land on the
  **same** `AppEntryRsc`/`AuthFlowV2` shell (§1.2) — this is not two pages, matching `ROUTE_MIGRATION_MAP.md`
  P02's "single view=registration allocation, no second page-file" precedent (:29).
- **`intent` is a rendering hint only.** It may select which `AuthFlowV2` `mode` renders first (`register_verify`
  vs default login), exactly as the existing `view=clinic-registration` dev parameter already does (§1.2). It
  **must not** be read by `getPostAuthRedirectTarget`/`getRedirectPathForRole` (`redirectPolicy.ts:12-39`) or by
  any server-side authorization check. After successful authentication, the destination is derived **exclusively**
  from `session.user.role` (staff) or the U5A patient organization resolver (patient) — never from `intent`,
  `next`'s shape beyond the existing `isSafeNext` allowlist, or any other client-supplied value. This is not a
  new rule; it is the existing invariant in `redirectPolicy.ts` (§1.2) plus `TARGET_IA.md` §1 rule 3 and
  `ENTRY_AND_INVITE_JOURNEYS.md` §2 invariant 14 (§0.a) — #807's job is to not regress it while adding the
  landing-level hint.
- **Multi-role identity.** When one identity later holds both a staff membership and a patient enrollment
  (`ENTRY_AND_INVITE_JOURNEYS.md` §2 invariant 14, `OWNER_RULINGS_2026-07-16.md` UX08-04 "one login" — §0.a),
  the post-auth destination remains role/context-derived, with an explicit surface switch available afterward
  (`TARGET_IA.md` §6, "Clinical work" / "Organization management" switch; U2 stage, `IMPLEMENTATION_ROADMAP.md`
  :317-351) — this design does not implement that switch (owned by U2), it only ensures the landing/entry layer
  does not hardcode a single persona per identity or bake `intent` into a stored preference that would fight it.
- **Public join (`/join/[exchange]`, `ORG-PUB-03`) and public booking (`/book/{publicSlug}`, `ORG-PUB-02`)
  remain outside this auth-intent mechanism** — both resolve organization/relationship from a server-side
  trusted record (invite token / booking config), never from `intent` or any landing-level hint, per
  `ENTRY_AND_INVITE_JOURNEYS.md` §2 invariant 4 and `BRANDING_DOMAIN_CONTRACT.md` §4.

---

## 4. PWA install policy change

- **Remove path-prefix enforcement for the patient cabinet.** `shouldAllowPwaAppShellAccess`
  (`pwaAppAccessPolicy.ts:37-43`) currently returns `false` for ordinary browser access to any
  `/app/patient/**` path. Target: browser access to `/app/patient/**` is always allowed; `isPatientPwaGatedPath`
  /`browserRequiresPwaStandaloneForAppPath` stop being used as an access gate. `PwaAppAccessGate.tsx` either (a)
  is repurposed into a non-blocking install-prompt surfacing component (no `router.replace`, just conditional
  UI), or (b) is removed from the patient layout tree entirely if the prompt already lives in `InstallSection`/
  settings, whichever the implementer finds is the smaller diff — this design does not mandate which, only
  that no full-page redirect away from requested content remains.
- **Capability-gated exceptions, not a path gate.** Two named examples from the card: Web Push subscription
  (already origin-bound per `BRANDING_DOMAIN_CONTRACT.md` §7.3, "Notification comes from the exact installed
  web app/origin subscription") and offline/service-worker-only behavior. Each such capability shows its own
  in-context "Установите приложение, чтобы получать пуш-уведомления" prompt at the point of use (e.g. the
  notification-settings push toggle, `apps/webapp/src/app/app/patient/notifications/settings/page.tsx`) rather
  than blocking navigation to the page that contains it. The exact enumeration beyond push/offline is owner
  decision O-3 (§8) — do not invent a broader gated list.
- **`StandaloneRootRedirect` is unrelated and stays.** It only fires when `isStandalonePwa()` is already true
  and the path is exactly `/` (`StandaloneRootRedirect.tsx:11-17`) — a convenience shortcut for returning
  installed users, not an access gate. §6's checklist explicitly separates verifying this is untouched.
- **`allowBrowserAccess = process.env.NODE_ENV !== "production"` dev/test bypass becomes moot** once the gate
  itself is removed for patient paths — delete the flag and its plumbing through `PatientClientLayout.tsx`
  rather than leaving a dead parameter. Doctor/admin paths were never gated by this mechanism (§1.3) and need
  no change.
- **Messenger mini-app detection (`isMessengerMiniAppHost`)** is a separate concern (bridges Telegram/MAX
  mini-app auth) and is unaffected — it continues to exist for its current purpose, just no longer needs to be
  consulted for the *browser-access* decision once that decision is always "allow."

---

## 5. Config-driven domain / public-base model (reuse, not invention)

No new `system_settings` key, migration, or admin-UI surface is required — `app_base_url` and its accessors
(§1.5) already satisfy the DB-backed/public-base requirement in `.cursor/rules/000-critical-integration-config-
in-db.mdc` and `AGENTS.md` §2/§3. The delta is exactly the three call sites in §1.5:

- **`apps/webapp/src/app/page.tsx:26,32`** — Next.js static `export const metadata` objects cannot call an
  async DB read directly. Convert to `export async function generateMetadata()` (Next.js App Router supports
  this per-page) and resolve `metadataBase`/`openGraph.url` from `await getAppBaseUrl()`, keeping the existing
  literal as the last-resort fallback only if `getAppBaseUrl()` itself already falls back to `env.APP_BASE_URL`
  (confirmed in `adminSettingsData.ts:331-333` pattern) — no double fallback chain needs inventing, reuse the
  one `getAppBaseUrl()` already implements.
- **`apps/webapp/src/components/landing/WrongBrowserBanner.tsx:14-15`** — this is a client component
  (`"use client"` implied by its use inside the landing bundle); it cannot call the DB-backed accessor
  directly. Pass the resolved base URL down as a prop from the server-rendered `page.tsx`/`LandingHeader`
  parent (which can call `getAppBaseUrl()`), rather than adding a second client-side settings fetch — matches
  the existing pattern in `AppEntryRsc.tsx` (`buildPrefetchedPublicAuthConfig()`, §1.2) of resolving
  DB-backed config server-side once and threading it down as a prop.
- **`apps/webapp/src/shared/lib/buildCalendarLinks.ts:53-54`** — this module is already server-side (used to
  build `.ics` attachments for outgoing notifications). Replace the literal `bersoncare.ru` suffix with the
  host portion of `getAppBaseUrlSync()` (the sync variant already used by sibling notification-adjacent modules
  like `patientWebPushNotify.ts`/`fanOutBroadcastWebPush.ts`, §1.5) — same accessor family, no new one needed.

This closes card #807's domain-hardcoding requirement without adding a second configuration mechanism next to
`app_base_url`, consistent with the single-chokepoint memory rule.

---

## 6. Phased implementation checklist (TEST-only; each phase independently auditable)

- [ ] **Phase 0 — dependency confirmation.** Confirm U5A (patient organization resolver) and U1 (capability
      guard spine) completion status per their own `IMPLEMENTATION_ROADMAP.md` §8 `Completion` criteria before
      Phase 2 (auth-intent) lands — U6A's own `Dependencies` line (`IMPLEMENTATION_ROADMAP.md:619`) names U3S's
      truthful CTA and U1's persona guards as prerequisites. If either is incomplete, this phase records
      `waiting dependency` rather than building a second interim resolver.
- [ ] **Phase 1 — landing composition (`PUB-01`).** Reorder `apps/webapp/src/app/page.tsx` sections per §2;
      specialist CTA leads, patient CTA is compact/secondary and present in header + near final CTA per
      `TARGET_IA.md` §10; keep `InstallSection`, `LegalFooterLinks`/legal reachability, mobile drawer behavior
      unchanged in structure. Audit: desktop + mobile screenshots, CTA priority verified at both breakpoints, no
      regression to `StandaloneRootRedirect` (§1.1) or legal/support reachability (`PUB-05`).
- [ ] **Phase 2 — auth-intent hint (non-authoritative).** Add the `intent` query hint on the two landing CTAs
      (§3); verify `getPostAuthRedirectTarget`/`getRedirectPathForRole` (`redirectPolicy.ts`) are **not**
      modified to read it — this is a negative-assertion test, not just a positive one. Audit: role × `intent`
      matrix (specialist-intent + patient session, patient-intent + staff session, no-intent) all resolve
      identically to the pre-existing role-only behavior; direct-URL bypass of the landing (hitting `/app`
      directly with no `intent`) still works unchanged.
- [ ] **Phase 3 — PWA gate policy change.** Remove/repurpose `PwaAppAccessGate` enforcement per §4;
      `pwaAppAccessPolicy.ts` no longer redirects `/app/patient/**` browser access; add/adjust unit tests in
      `pwaAppAccessPolicy.test.ts` to assert **allow** for plain browser access to patient paths (inverting the
      current "block unless standalone/miniapp" assertions found in that file, §1.3). Audit: manual browser
      (non-installed, non-miniapp) load of `/app/patient` on TEST reaches the actual page, not `/#install`;
      `StandaloneRootRedirect` behavior (installed PWA on `/` → `/app/patient`) unchanged; push-toggle and any
      offline-only affordance still show an in-context install nudge instead of silently working or being
      hidden.
- [ ] **Phase 4 — domain/base-URL de-hardcoding.** Migrate the three call sites in §5. Audit: `curl`/rendered
      HTML on TEST shows `metadataBase`/OG url/ICS `UID` domain matching the TEST server's actual
      `app_base_url` value (not a literal `bersoncare.ru`), confirming the change is live-config-driven and not
      merely a renamed constant; changing `app_base_url` via the existing admin settings UI
      (`AppParametersSection.tsx`) and reloading confirms all three surfaces follow it without a redeploy.
- [ ] **Phase 5 — tenant public page shape (blocked on owner decision O-1, §8).** Do not start until O-1 is
      answered. Once answered: wire `ORG-PUB-01` (branding/services/specialists/booking-CTA/patient-login-CTA)
      at the decided route, consuming — not re-deriving — #805's slug-resolved organization context and #806's
      `ensureActiveEnrollment` chokepoint (§1.4). Audit: no second booking wizard, no second join route; org A's
      page never renders org B's data; unpublished/suspended states match `BRANDING_DOMAIN_CONTRACT.md` §10.
- [ ] **Phase 6 — full CI + coordination checkpoint.** Run the affected app's full test suite (`test:webapp`)
      plus targeted typecheck/lint for touched files; confirm no overlap/duplication against #805's and #806's
      own checklists (`PATIENT_INVITE_AND_MANUAL_CREATION_DESIGN.md` §10); record `LOG.md` handoff entry per
      `IMPLEMENTATION_ROADMAP.md` §3.2 integration-handoff gate. Full `pnpm run ci` only if this phase coincides
      with a merge/integration checkpoint per `AGENTS.md` §9, not on every intermediate commit.

None of the phases above authorize `main`/`test` server deploy, production data changes, or real message
delivery — all validation is DEV/TEST-only per `AGENTS.md` §1a/§1b and this repo's prod-untouchable rule.

---

## 7. Contradictions found

1. **`SCREEN_COMPOSITION.md` candidate route `/o/[orgSlug]/book/**` for `ORG-PUB-02` (:43) vs.
   `OWNER_RULINGS_2026-07-17.md` §1's confirmed `/book/{publicSlug}`** (dated *after* the UX package). Per
   `IMPLEMENTATION_ROADMAP.md` §2 provenance order and `AGENTS.md`'s "dated document wins" convention, the
   07-17 ruling wins for the booking route specifically. `SCREEN_COMPOSITION.md`'s route-column cell for
   `ORG-PUB-02` is stale and should get a follow-up UX-06 amendment — out of scope for this design to edit
   directly (it is the audited package, not this card's artifact), flagged here so the amendment isn't missed.
2. **Current `PwaAppAccessGate`/`pwaAppAccessPolicy.ts` hard-redirects browser access to the entire patient
   cabinet** (§1.3), directly contradicting `ENTRY_AND_INVITE_JOURNEYS.md` §2 invariant 10 and
   `BRANDING_DOMAIN_CONTRACT.md` §6, both already-audited canon predating this card. This is an existing
   implementation gap against ruled canon, not a new decision — exactly why card #807 asks to "reconsider" it;
   §4/§6 Phase 3 is the fix.
3. **Card #807's "future public widget... top-level origin due third-party-cookie limits" has no counterpart
   anywhere in the audited UX-04/06/09 package** (§0.b). It is registered as non-blocking backlog only (§6 does
   not include a phase for it) and must not be implemented as part of this card without a separate design pass
   once it becomes current scope.
4. **`getAppBaseUrl()` already exists and is used in ~10 other modules, but the landing page itself — arguably
   the single most domain-sensitive surface in the app — never adopted it** (§1.5). Not a contradiction between
   documents, but a notable inconsistency within the current codebase worth flagging: the chokepoint was built
   for transactional/notification links and simply never got wired to the marketing surface that most needs it.

---

## 8. Owner decisions (dedicated section — not invented here)

- **O-1 — Tenant public page route/shape.** Single combined `/book/{publicSlug}` page carrying branding +
  services/specialists + booking + patient-login (minimal, literally matches the 07-17 wording, which named
  only the booking link) — vs. a separate profile route (e.g. `/{publicSlug}` or `/o/{publicSlug}`) with
  booking as a sub-flow (matches `SCREEN_COMPOSITION.md`'s `ORG-PUB-01`/`ORG-PUB-02` split, now superseded on
  the exact path per contradiction 1). This blocks Phase 5 (§6) and should be confirmed before that phase
  starts; #805's own booking-slug implementation is unblocked either way since it only needs the resolver, not
  the profile page shape.
- **O-2 — Auth-intent interaction mechanism.** Whether two CTAs into the same shared `AuthFlowV2` shell (current
  precedent, §1.2/§3) is the final composition, or whether the owner wants a different visible selector/copy on
  the landing itself. Non-blocking for the technical contract in §3 (which works either way), but affects
  Phase 1's exact visual design and should go through the same copy/IA review the owner has applied to this
  landing before (memory: `owner-protocol-expanded-2026-06-16.md`).
- **O-3 — Exact "capabilities that truly need install" list.** Card #807 names push/offline as examples, not an
  exhaustive list (§0.b, §4). Confirm whether any other current patient-app feature (e.g. background sync,
  install-triggered analytics, badge API) should also gate on installed/standalone state, or whether push +
  offline is the complete list for launch.

---

## NOT DONE (by this design pass)

- No application code, migration, `system_settings` row, or route file was created or changed — this is a
  docs-only design pass per the mission constraint.
- §5's `generateMetadata()` conversion, the `WrongBrowserBanner` prop-threading, and the `buildCalendarLinks.ts`
  accessor swap are specified but not implemented.
- §4's `PwaAppAccessGate`/`pwaAppAccessPolicy.ts` changes and their test-file updates are specified but not
  implemented; current production/TEST behavior (hard redirect) is unchanged until Phase 3 lands.
- §2/§3's landing reorder and `intent` hint are specified but not implemented; `apps/webapp/src/app/page.tsx`
  is unchanged.
- O-1/O-2/O-3 (§8) are open; Phase 5 (§6) is explicitly blocked on O-1 and must not proceed without it.
- No coordination handoff (`LOG.md` entry per `IMPLEMENTATION_ROADMAP.md` §3.2) has been written yet — that
  belongs to whichever worker picks up Phase 1.
- This design does not audit or modify #805/#806/#801/#808's own implementations; it only records the exact
  chokepoints (§1.4, §5) those cards must share with this one.
