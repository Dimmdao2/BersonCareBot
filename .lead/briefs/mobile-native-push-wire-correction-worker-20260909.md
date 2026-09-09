# Worker correction brief — #915 one end-to-end native Push wire

Close the proven cross-stack native Push integration break in one coherent product pass. Work on the existing
`wt/mobile-native-capabilities-audit-20260909` correction branch after its current confirmation auditor has stopped.
Do not write, modify, rename or delete tests; the next independent `auditor-live` owns behavioral oracles. Do not
touch DB schema/migrations, provider credentials, TEST/PROD state, signing, PWA/install UI, Jitsi/media behavior or
unrelated notification copy. Do not create another push channel, queue, provider adapter or route-policy stack.

## Mandatory reading before action

1. Run `grep -n "^## \|^### " AGENTS.md`; read the global decision method, §1/§1b, §5, §7, §9–§12 and §24
   completely. Read `README.md`, `docs/README.md`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`,
   `docs/ORCHESTRATION_BINDINGS.md`, `/home/dev/brain/docs/MODEL_TIERS.md` and module-local docs beside every
   touched notification/relay/native component.
2. Read the complete authority `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`, especially M6-04 through
   M6-11 and M7. Read `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §15 and §21–§25 completely.
3. Use code-search before exact `rg`. Trace the actual path from every production `pushSurface` producer through
   the durable queue/relay, `createWebPushDeliveryAdapter`, RuStore request serialization, `PushRuntime`, Android
   notification and tap routing. Existing neighboring code/tests are evidence, not authority.

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: data-only RuStore wire is
`{pushSurface,notificationKind,route,title,body}` and browser `url` is not a trusted Android route.

## Proven reachable failures to close together

- The accepted server adapter sends `{route,title,body,pushSurface}` while `PushRuntime` reads
  `{route,surface,kind}`. Every real provider message is therefore rejected before display.
- Android discards the authorized title/body and renders the hardcoded placeholder `New notification`.
- The browser URL is frequently an absolute clinic/custom-domain URL and the video invitation uses a guest URL;
  treating it as the Android route suppresses native delivery or opens the wrong surface. A provider-neutral,
  explicitly produced native route is required.
- Server routing accepts staff `/app/settings` and `/app/account`, while Android accepts only `/app/doctor`.
  Both ends must share the same observable allowlist without creating a second implementation branch.
- Existing analytics `pushKind` values (`custom|warmup|training|news`) are not Android sound-channel kinds and must
  not be overloaded as `message|reminder|call`.

## Required end-to-end contract

Extend the existing typed `pushExtras` contract, its outbound queue/relay mapping and integrator typed view with:

- `pushSurface: 'therapygo' | 'therapysto'`;
- `nativeRoute: string` — a bounded relative cabinet route independent of browser `url`;
- `notificationKind: 'message' | 'reminder' | 'call'`.

Update every production producer that currently sets `pushSurface` so the three fields travel together. Reuse its
existing authorized copy and browser URL. Assign `reminder` to appointment/patient/specialist reminders, `call` to
video-meeting invitations, and `message` to message/reply/news/admin/operator facts. For the authenticated patient
video invitation, keep the browser guest URL unchanged but set native route to
`/app/patient/live/${meetingId}`. For ordinary patient/staff notifications, derive or build the relative cabinet
path at the producer boundary where the intended destination is known; do not trust or copy an arbitrary absolute
origin into the native route.

The composite delivery adapter must validate surface/kind/route before target/provider access and serialize exactly
the data-only wire `{pushSurface,notificationKind,route,title,body}`. The wire `route` comes only from
`pushExtras.nativeRoute`. For backward compatibility with already queued rows, a missing new field may use only an
already strict relative same-surface legacy `url` plus `message` default; never infer from an absolute, protocol-
relative, custom-domain or guest URL. Invalid native metadata skips the native leg without weakening the browser
leg. Preserve one logical `web_push`, one pre-provider environment policy and current per-transport outcomes.

Use bounded, trimmed notification copy on the native wire (title maximum 120 Unicode code points, body maximum 240
Unicode code points); preserve the full existing browser copy. Android independently rejects missing/overlong or
malformed fields rather than displaying them. It reads the exact wire keys, verifies the compiled brand, kind and
route, renders the accepted title/body, selects the stable message/reminder/call channel, and emits the same typed
`pushSurface`/`notificationKind`/`route` event shape for the later web NativeRuntime. Do not put copy into tap
extras. Keep permission behavior and cold-process rendering intact.

Make Android and server route behavior observationally identical:

- Therapy Go: `/app/patient` and descendants;
- Therapysto: `/app/doctor`, `/app/settings`, `/app/account` and descendants;
- reject raw/encoded/backslash traversal, prefix lookalikes, fragments, absolute/protocol-relative URLs, userinfo,
  foreign routes and sibling surfaces.

Do not duplicate route parsing merely to satisfy file boundaries: extend/reuse the current single helper on each
runtime side. Do not edit existing tests to fit the correction.

## Validation and delivery

Do not run or write tests. Run applicable non-test gates in the foreground: TypeScript typecheck/build and scoped
lint for changed webapp/integrator production files, Android compile/lint/assemble for both brand×environment debug
variants and unsigned release variants through the shared host lock, secret/payload scans and `git diff --check`.
Do not run full CI and do not use a DB/device/provider/PROD.

Commit all and only the required production/docs paths with explicit staging, never `git add -A`; do not push.
Reference `#915`, name the corrected wire, route and notification behavior, and report the SHA plus exact commands
and results. Do not finish while a foreground build is still running.
