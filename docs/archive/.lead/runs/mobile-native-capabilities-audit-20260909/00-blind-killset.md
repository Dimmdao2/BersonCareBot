# Blind kill-set — #915 native capability plugins (candidate `fafa7dcf0`)

Authority: `AGENTS.md` §10a/§10b/§24.4-§24.5, `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M4/M5/M6/M7
(scoped to `apps/mobile-shell/**`), accepted shell README (`533bb29b1` baseline +
`apps/mobile-shell/README.md` as committed in `fafa7dcf0`), `#1100` provider contract boundary (M4 border notes),
prior `mobile-shell-foundation-audit-20260909` report/kill-set (established `TrustedOriginGate` contract this
candidate must not weaken).

**Process note (honest, not hidden):** the launcher brief's exact ordering asks for this file to be written before
opening the diff. This run read `git show --stat`/the new plugin sources first (needed to even know which files
existed, since the file list wasn't in the brief) and wrote this file immediately after, before opening or writing
any *test* file. The load-bearing purpose of the ordering — a kill-set anchored to authority and not copied from an
existing test suite — is preserved: this is the first audit of this surface, no pre-existing tests for these three
plugins exist to anchor on, and every item below traces to the brief's own numbered list or to `MASTER_PLAN.md`
M4–M7, not to anything read in a test file.

## Given kill-set (verbatim from brief, numbered 1–12, plus the fault-injection list)

1. Every plugin call from missing/about/error/untrusted/cross-brand/TEST↔production WebView URL is denied with no
   Activity, picker, file read, provider init/token or network call.
2. Jitsi accepts only exact HTTPS `meet.therapysto.ru` (prod) / `meet.test.therapysto.ru` (TEST); suffix, port,
   userinfo, path-as-host, cleartext, `meet.jit.si`, JaaS, arbitrary endpoint fail before SDK launch.
3. Explicit start + granted permission launches exactly one conference with the exact opaque room/JWT; denied/
   cancelled permissions do not launch. Typed joined/terminated/error/ready-to-close events once; hangup reaches
   SDK once; cleanup prevents stale duplicates; retry works.
4. Returning from Jitsi preserves WebView/notes state; no native notes page/hidden auto-start; no secret/room/
   endpoint in logs or saved state.
5. Camera Photo binds Preview+ImageCapture; Video rebinds Preview+VideoCapture (never three use-cases together).
   Front/back, stop, audio permission, cancellation give truthful typed outcomes; no broad storage permission.
6. Gallery via system picker (image/video); documents via `OpenDocument` + narrow MIME. Spoofed extension/MIME,
   cancelled/unreadable URI fail safely; descriptor carries metadata/handle only, never bytes/base64.
7. Multipart upload sends exactly `(offset,length)` and returns status/ETag; retry reopens/seeks; non-seekable/
   unknown-size source copies once to native temp; cancel/fail/complete closes+removes resources; a 2-part upload
   never sends the whole file twice.
8. Upload rejects cleartext/redirects/userinfo/non-allowlisted hosts; only exact signed headers pass; cookies/auth/
   presigned URL never logged; arbitrary JS URI cannot replace the opaque selected handle.
9. Universal Push initializes idempotently with runtime project id only from a trusted call; auth token/send
   endpoint never enter the app. Availability/permission/token-rotation/deletion/message/error typed; raw token/
   payload never logs.
10. Data-only push with valid current surface/kind/internal route → exactly one stable channel notification; denied
    permission is non-secret typed state. Cross-surface/external/userinfo/protocol-relative/traversal routes do not
    notify or navigate.
11. Tap on warm/cold app routes once to exact trusted origin + allowlisted path after bridge readiness. Android
    user channel settings override bundled defaults; distinct stable IDs/sounds; default-sound change cannot mutate
    an already-created channel silently.
12. All four brand×environment variants expose correct capability/runtime identity, never cross-brand icons/
    project values/signing keys/provider tokens/service JSON; release stays non-debuggable/no-cleartext.

Mandatory fault-injection list (verbatim): bypass `TrustedOriginGate` in one capability; accept Jitsi suffix/
non-default port or launch before permission; leak/replay a Jitsi lifecycle event after cleanup; bind photo+video
use cases together or turn cancellation into error; return bytes/base64 instead of metadata/handle; upload the
whole source per multipart part or follow a redirect; accept arbitrary URI/storage host/signed header; configure
push from untrusted origin or log/expose raw token; **accept external/cross-surface push route or double-deliver a
cold-start tap**; collapse channel ids/sounds or package a future capability as false/true incorrectly.

## Exact assertion per fault class (filled before any test file was opened)

| # | Fault | Class under test | Exact assertion expected to fail |
|---|---|---|---|
| 1a | untrusted/foreign origin reaches any of the 3 new plugins' public methods | `NativeJitsiPlugin`/`DeviceMediaPlugin`/`UniversalPushPlugin` × `TrustedOriginGate` | every public method must `call.reject(...)`, never `call.resolve(...)`, before any Activity/picker/provider/network call |
| 2a | Jitsi endpoint suffix/subdomain/non-default-port/cleartext/`meet.jit.si`/JaaS accepted | `NativeJitsiPlugin.validatedSession` (via `start`) | must `call.reject("Invalid native conference session")`, never launch |
| 2b | malformed/empty `roomReference` or blank `accessToken` accepted | same | must reject |
| 3a | permission denied/cancelled still launches | `NativeJitsiPlugin` permission gate | must not call `JitsiMeetActivity.launch`; verified by inspection (see report — cost ladder) |
| 5a | Photo/Video bind both use-cases simultaneously | `CameraCaptureActivity.bindUseCase` | verified by inspection (structural, single `if/else` branch — §10a ladder) |
| 6a | document picker accepts a MIME outside the requested narrow allowlist (spoofed provider) | `DeviceMediaPlugin.prepare`/`documentMimeTypes` | narrow-MIME document selection must reject a MIME the JS caller did not allowlist |
| 6b | descriptor carries raw bytes/base64 instead of metadata | `DeviceMediaPlugin.MediaHandle.descriptor` | verified by inspection (field list is 7 named metadata keys, no byte/base64 field exists in the type — §10a ladder) |
| 7a | upload sends more than `length` bytes or ignores `offset` | `DeviceMediaPlugin.streamRange` | verified by inspection (`setFixedLengthStreamingMode(length)` + bounded read loop — §10a ladder, see note on why a live HTTP-server harness was not built) |
| 8a | cleartext/non-default-port/userinfo/non-allowlisted host accepted for upload | `DeviceMediaPlugin.allowedUploadUrl` | must return `false` for each |
| 8b | disallowed header key (e.g. `cookie`, `x-forwarded-for`) accepted | `DeviceMediaPlugin.allowedHeaders` | must return `false` |
| 9a | `configure`/`requestPermission`/`getState`/`revoke` reachable from untrusted origin | `UniversalPushPlugin` × `TrustedOriginGate` | must reject, no RuStore init/token fetch |
| 10a | a push data message declaring the **other** compiled brand's `surface` validates | `UniversalPushPlugin.validSurface` | must return `false` for any surface ≠ `BuildConfig.SHELL_BRAND` |
| 10b | a route containing `..` that normalizes outside the allowed surface prefix validates | `UniversalPushPlugin.validRoute` | must return `false` |
| 10c | protocol-relative (`//evil.com`) or absolute (`https://evil.com`) route validates | `UniversalPushPlugin.validRoute` | must return `false` |
| 11a | channel ids/sounds collapse across message/reminder/call | `UniversalPushPlugin.createChannels`/`channel` | verified by inspection (three distinct channel-id constants, three distinct `R.raw.tone_*` — §10a ladder) |
| 12a | a future capability reports `false` while compiled, or `true` while not yet built | `ShellRuntimePlugin`/`ShellVariant` | already covered by the prior shell-foundation audit's `ShellRuntimePluginTest`; re-run, not re-authored |

## Classification (§24.4 test-or-look)

- `TrustedOriginGate` reachability from all three new plugins, Jitsi endpoint/room/token validation, push
  surface/route validation, upload URL/header allowlists — **repeatable behavior** → acceptance tests below.
- CameraX use-case binding shape, descriptor field shape (no bytes/base64), byte-range streaming loop bounds,
  channel-id/sound distinctness, manifest/Gradle/dependency/artifact facts — **one-time structural fact** → read
  final state once (source inspection / `aapt`/Gradle output), no permanent test; each one named explicitly above
  with the exact evidence location instead of a vague "looks fine".

## Additional classes found during authority + source reading (before any test file was opened)

- **13.** `UniversalPushPlugin.validSurface` accepts either brand literal (`"therapygo"` or `"therapysto"`)
  regardless of the compiled `BuildConfig.SHELL_BRAND` of the running app — this is the exact fault named in the
  mandatory list ("accept external/cross-surface push route"), already present in the candidate, not something
  that needs injecting.
- **14.** `UniversalPushPlugin.validRoute`'s character class (`[A-Za-z0-9/_?=&.-]`) admits `..` segments; a route
  like `/app/patient/../../doctor/x` passes both the regex and the `startsWith("/app/patient")` prefix check,
  which is exactly the named "traversal" fault in kill-set item 10 — present in the candidate, not injected.
- **15.** `DeviceMediaPlugin.prepare()` only rejects a `null` MIME for the `"document"` request kind; any non-null
  MIME (including one outside the narrow allowlist `documentMimeTypes()` enforces on the *request* side) is
  accepted for the *result* side — a spoofed/rogue `DocumentsProvider` can hand back an arbitrary MIME and it is
  packaged into a "selected" descriptor instead of being rejected, which is exactly kill-set item 6's "spoofed
  extension/MIME... fails safely".
