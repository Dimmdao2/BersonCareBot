# Blind kill-set — #915 native Push wire confirmation audit

Written before reading the candidate diff in detail, existing tests, or the two earlier independent
reports (`mobile-native-capabilities-confirmation-audit-20260909`,
`mobile-rustore-provider-contract-audit-20260909`), per AGENTS.md §10a/§10b/§24.4/§24.5. Classification
uses only: the audit brief, MASTER_PLAN.md M6/M7 (read above), and OWNER_PRODUCT_RULES.md §2/§15/§18/
§21-§25/§27/§28 (authority for M6, cited in MASTER_PLAN M6 header).

Oracle (fixed by the plan): data-only RuStore wire `{pushSurface,notificationKind,route,title,body}`.
Browser `url`, analytics `pushKind`, role/org data and arbitrary origins never authorize Android routing.

Classification rule (§24.4): repeatable behavior where the failure is both expensive (money, cross-tenant
data, message loss, wrong recipient, privileged-surface navigation) AND silent (breaks without anyone
noticing) → **test**. One-time action / structural shape (file exists once, no duplicate stack, no secret
logged) → **view** (rg/AST/introspection), not a permanent test.

## Behavioral items → test, with the failure they must catch

| # | Item | Class | Named observable failure if broken |
|---|---|---|---|
| K1 | Every production producer requesting a native surface emits `pushSurface`+`notificationKind`+`nativeRoute` together | test | A producer sets `pushSurface` alone (or only 2 of 3 fields) → delivery adapter either drops the native leg silently for a real notification, or forwards an `undefined`/empty `route` that Android must then guess — an appointment reminder or call invite never reaches the phone and nobody sees an error |
| K2 | Reminders (appointment/patient/specialist) classify as `notificationKind: 'reminder'` | test | A reminder producer is wired with `kind: 'message'` → Android renders/sounds it on the wrong channel (no reminder tone), user misses a scheduled appointment silently |
| K3 | Video meeting invitations classify as `notificationKind: 'call'` | test | Same class as K2 but for calls — user misses a live session start because it rang on the generic message channel or not at all |
| K4 | Ordinary message/reply/news/admin/operator facts classify as `notificationKind: 'message'` | test | An admin/operator producer is miswired to `reminder`/`call` → wrong channel/sound, or (worse) an admin-only fact gets a `nativeRoute` that lands a low-privilege recipient on a route not meant for them |
| K5 | Patient video invitation keeps its existing browser guest URL unchanged, and the *native* route is exactly `/app/patient/live/${meetingId}` — not derived from the guest URL | test, security | The composite adapter derives the native route from the browser guest URL (which can be absolute/custom-domain/host-branded) → Android WebView (privileged origin, cookies) navigates to an attacker-influenced or wrong-tenant absolute URL instead of the fixed authenticated in-app route |
| K6 | Legacy queued rows fall back to native routing only from an already-strict *relative, same-surface* `url`, defaulting `notificationKind` to `message` | test, security | A legacy row with an absolute URL, protocol-relative URL (`//evil.com`), or cross-surface `url` (e.g. therapysto url reaching a therapygo recipient) is accepted as a native route instead of being skipped — native leg silently routes into a foreign or external origin while browser delivery keeps working unaffected |
| K7 | A malformed/missing-metadata legacy row skips **only** the native leg; browser Web Push delivery is unaffected | test | A bug in the new native-routing branch throws or short-circuits the whole composite adapter → browser Web Push (already working, unrelated to this change) silently stops firing for that message too |
| K8 | Provider-facing (RuStore) body is data-only: exactly `pushSurface`, `notificationKind`, `route`, `title`, `body` — no extra keys | test, security | Adapter serializes token/provider credential material, org/role data, or the analytics `pushKind` (`custom\|warmup\|training\|news`) into the outbound provider payload → secret/PII leaves the trust boundary to a third-party provider, silently, in every message |
| K9 | `route` in the wire comes from `nativeRoute`, never from browser `url` | test, security | Same failure class as K5 generalized: any producer where `nativeRoute` is set but the adapter still prefers/falls back to `url` for `route` → external/absolute URL reaches Android as a trusted route |
| K10 | `title`/`body` are trimmed and bounded to 120/240 Unicode code points before entering the wire | test | An overlong or unicode-code-point-miscounted (e.g. surrogate-pair/emoji) title/body is sent un-truncated or truncated at the wrong boundary → provider/Android reject or mis-render, or (if bound is checked in UTF-16 code units instead of code points) a boundary-adjacent emoji is split, corrupting the string silently |
| K11 | Android rejects missing/malformed/overlong data **before** display (does not render partial/garbage notification) | test | `PushRuntime`/`UniversalPushPlugin` renders a notification from a message missing `route` or with a non-allowlisted `route` → user taps it and lands on an arbitrary/undefined screen, or a malformed payload crashes the plugin/renders "undefined" text |
| K12 | Android verifies the compiled brand + route allowlist before rendering/routing (Therapy Go `/app/patient/**`; Therapysto `/app/doctor/**`, `/app/settings/**`, `/app/account/**`) | test, security | Therapysto build accepts a `/app/patient/**` route (or vice versa) → wrong-brand deep link crosses the patient/staff surface boundary the plan treats as absolute (`patient-visibility-and-tenant-walls-decision`-equivalent for native) |
| K13 | Route allowlist rejects prefix lookalikes, absolute/protocol-relative URLs, fragments, userinfo, sibling surfaces, backslashes, raw/encoded traversal | test, security | `/app/doctorish`, `//evil.com/app/doctor`, `/app/doctor@evil.com`, `/app/doctor/../../etc`, `%2e%2e%2f`, or `\app\doctor` is accepted by the allowlist parser (classic prefix-match / path-traversal bypass) → native routing escapes the allowed surface |
| K14 | Server and Android allowlists are observationally identical (same accepted/rejected set for both brands) | test | Server accepts a route Android's compiled allowlist rejects (or vice versa) → a queued message either never reaches a screen the server thought was valid, or Android accepts something the server would have refused, defeating the server-side gate |
| K15 | Android emits the typed tap event `{pushSurface,notificationKind,route}` with no copy/token extras | test | Tap handler forwards `title`/`body`/raw token into the JS bridge event → sensitive/PII content crosses into web NativeRuntime scope that doesn't need it (M6-05 explicitly separates transport from content on the web bridge too) |
| K16 | Cold-process receipt (no prior app state) still renders a valid notification for well-formed data | test | Static/first-run path in `PushRuntime`/`UniversalPushPlugin` depends on in-memory state populated only after a warm start → first push after install/kill is silently dropped |
| K17 | Permission/target/provider "skipped" outcomes do not create a second logical notification family or messenger fallback | test | A skip path falls back to an unauthorized channel (e.g. Telegram/SMS messenger fallback) or writes a second notification-event row → M6-11's "no new notification-event table / no channel fallback" boundary is silently violated |
| K18 | With `NATIVE_PUSH_TOKEN_KEYRING_JSON` absent, ordinary Next/PWA bootstrap stays operational (no `native_push_token_keyring_unavailable` throw reaching unrelated request paths) | test | Missing keyring throws out of a shared DI/bootstrap path → **every** Next/PWA page (not just native-push registration) 500s in an environment without the keyring configured, which is exactly the regression `fd3f6a3b5` claims to fix |
| K19 | With keyring absent, native register/rotate/delivery return the M6-11 typed non-secret skipped/no-active-target outcome (not a 500/throw) | test | Register/rotate endpoint throws an unhandled error or leaks the missing-keyring internal message to the client instead of a typed skip |
| K20 | With keyring configured, native register/rotate/delivery behave as before (no accidental universal skip) | test | The "safe degrade" fix over-broadens and now skips native push even when the keyring **is** configured, silently disabling delivery for everyone |

## One-time / structural items → view (rg/AST/introspection), not a permanent test

| # | Item | Method |
|---|---|---|
| V1 | Exactly one typed `pushExtras`/queue path carries `nativeRoute`/`notificationKind` (no second parallel field or queue) | `rg` over `outboundMessageQueuePort.ts`, producer call sites, `unifiedMessage.ts` for a second field name or duplicate queue write |
| V2 | Exactly one composite logical `web_push` adapter (RuStore transport fan-out lives inside it, not a second adapter/provider) | Read `deliveryAdapter.ts` + provider registry; confirm no second `DeliveryAdapter` implementation or second entry keyed `rustore_universal_push` |
| V3 | Exactly one pre-provider environment policy gate (`assertOutboundMessagePolicy`/`applyPreForkEnvironmentDeliveryPolicy`) — RuStore doesn't get a second/parallel TEST-gate or `readChannel` | Read the composite adapter's call order; `rg` for a second `readChannel`/policy call scoped to RuStore |
| V4 | No duplicate route-policy or notification-event stack introduced | `rg` for a second allowlist table/const or a new `notification_events`-shaped schema/migration |
| V5 | No raw secret/token logged (keyring key material, RuStore auth token, push token) | `rg` for the keyring/token variables reaching `console.*`/logger calls without redaction, in the touched files |
| V6 | No DB/schema/migration changes in this diff (M6-01's schema landed earlier; this correction pass is wire-only per the worker's own commit message) | `git diff --stat` scoped to `apps/webapp/db/schema/**` and `migrations/**` — expect empty |
| V7 | No unrelated UI changes | `git diff --stat` scoped to UI component paths outside the named producer/adapter/Android files |
| V8 | Worker commit message's own "not fixed" note (`videoMeetingInvitationNativePush.contract.test.ts` pre-existing type error + one assertion needing rewrite) is real and scoped to that one test file, not spreading | Read the file, `git blame`/prior commit `88e9240df` for provenance |

## Explicitly out of blind scope (named by the brief, not invented here)

- Real provider request, physical device, DB/DEV/TEST writes, credentials, PROD — brief forbids these; not
  killable in this audit, not counted in the tally.
- Full root CI — brief forbids running it; scoped TS suites/typecheck/lint and the 4 Android
  brand×environment gates are the ceiling.

Next steps after freezing this file: read the two earlier independent reports, then the candidate diff and
existing tests, then confirm/adjust nothing above (kill-set is frozen) and start collecting evidence per item.
