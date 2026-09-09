# Тест или взгляд — #915 end-to-end Universal Push wire

Independently audit the committed candidate produced by
`mobile-native-push-wire-correction-worker-20260909`. This is the one confirmation gate for the new cross-stack
surface from canonical notification producers through durable delivery and RuStore serialization to Android
rendering/tap routing. Do not implement product fixes. Permanent edits are limited to behavioral acceptance tests
and `.lead/runs/mobile-native-push-wire-confirmation-audit-20260909/**`; temporary fault injections into product
code must be restored before the final commit.

## Mandatory reading before inspection

1. Run `grep -n "^## \|^### " AGENTS.md`; read the global decision method, §1/§1b, §5, §7, §9–§12 and §24
   completely. In particular read §10a and §10b before deciding whether each requirement is a test or a view.
2. Read `README.md`, `docs/README.md`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`,
   `docs/ORCHESTRATION_BINDINGS.md`, `/home/dev/brain/docs/MODEL_TIERS.md`, the complete active
   `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M6/M7, and module-local documentation beside every
   touched producer, relay/provider and Android runtime.
3. Read the earlier independent native and provider reports only after freezing this audit's blind kill-set:
   `.lead/runs/mobile-native-capabilities-confirmation-audit-20260909/90-final-audit-report.md` and
   `.lead/runs/mobile-rustore-provider-contract-audit-20260909/90-final-audit-report.md`.
4. Use code-search before exact `rg`. Trace real production callers; neighboring tests and worker prose are
   evidence, not authority.

The oracle is the active plan's exact data-only RuStore wire:
`{pushSurface,notificationKind,route,title,body}`. Browser `url`, analytics `pushKind`, role/org data and arbitrary
origins do not authorize Android routing.

## Blind protocol and required kill-set

Before reading existing tests or the candidate diff, create
`.lead/runs/mobile-native-push-wire-confirmation-audit-20260909/00-blind-killset.md`. Classify every item below as
behavioral test or one-time view and name the observable failure it would expose. At minimum cover:

- every production producer that requests a native surface emits the three typed facts together:
  `pushSurface`, `notificationKind`, `nativeRoute`; appointment/patient/specialist reminders are `reminder`, video
  meeting invitations are `call`, and ordinary message/reply/news/admin/operator facts are `message`;
- authenticated patient video keeps its existing browser guest URL while the native route is exactly
  `/app/patient/live/${meetingId}`; an absolute/custom-domain/guest URL never becomes the Android route;
- legacy queued rows may fall back only from an already strict relative same-surface URL and default to `message`;
  absolute, protocol-relative, malformed, cross-surface or missing metadata skips only the native leg and leaves
  browser delivery behavior intact;
- the provider-facing body is data-only and contains exactly `pushSurface`, `notificationKind`, `route`, `title`,
  `body`; route comes from `nativeRoute`, title/body are trimmed and bounded to 120/240 Unicode code points, and
  token/provider credentials or analytics `pushKind` do not enter the data wire;
- Android consumes those exact keys, rejects missing/malformed/overlong data before display, verifies the compiled
  brand and route allowlist, renders accepted server title/body, chooses message/reminder/call channel and emits
  the typed tap event `{pushSurface,notificationKind,route}` without copy or token extras;
- server and Android are observationally identical for Therapy Go `/app/patient/**` and Therapysto
  `/app/doctor/**`, `/app/settings/**`, `/app/account/**`, rejecting prefix lookalikes, absolute/protocol-relative
  URLs, fragments, userinfo, sibling surfaces, backslashes and raw/encoded traversal;
- cold-process receipt still renders a valid notification, invalid data never renders, and permission/target/provider
  skipped outcomes do not manufacture a second logical notification family or messenger fallback.
- when `NATIVE_PUSH_TOKEN_KEYRING_JSON` is absent, ordinary Next/PWA bootstrap remains operational instead of
  throwing `native_push_token_keyring_unavailable`; native registration/delivery returns the M6-11 typed
  non-secret skipped/no-active-target outcome, while configured keyring behavior still works.

Inspect architecture boundaries separately: one existing typed `pushExtras`/queue path, one composite logical
`web_push` adapter, one pre-provider environment policy, no duplicate route-policy or notification-event stack,
no raw secret/token logging, no DB/schema/migration or unrelated UI changes. A source-shape preference is not a
finding; report only a reachable behavior/security/build failure or a named repo-rule violation.

## Tests and fault injection

Retain compact public-boundary oracles, not tests of function names, source strings, exact UI copy, mocks of the
same implementation or invocation circumstances. Prefer extending the existing provider/notification contract
tests and Android JVM runtime tests. Add a producer-level contract only where it observes the durable outbound
payload rather than private construction steps.

For every independent behavioral class, inject one meaningful production fault after the oracle exists, run the
smallest relevant command through `/home/dev/brain/host-orch/run-tests.sh`, record red evidence, restore the fault
and rerun green. A currently failing acceptance test is itself the handoff oracle and must remain committed red;
do not patch product code. Restore all temporary product edits even if a command fails.

Run the relevant TypeScript suites/typechecks/lint and Android unit/compile/lint/assemble gates for all four
brand×environment variants under the shared host lock. Do not run full root CI, write DB/DEV/TEST, use a device,
send a real provider request, read credentials or touch PROD. `git diff --check` is mandatory.

## Report and delivery

Write `.lead/runs/mobile-native-push-wire-confirmation-audit-20260909/90-final-audit-report.md` with:

- exact candidate SHA and inspected diff scope;
- test-or-view classification and producer matrix;
- every kill-set item with command/result and fault-injection evidence;
- exact `убито N / непойманных M` tally;
- PASS only when all required behavior is green and `непойманных 0`; otherwise FAIL with reachable scenario,
  impact, violated M-ID/rule and the retained red oracle;
- factual external blockers separated from repository findings.

Explicitly stage only tests and the two audit artifacts, never `git add -A`; commit with `#915`, do not push. Do not
finish while a foreground command is running.
