# Correction worker brief — #915 DeviceMedia lifecycle, fallback and closed destination seam

Continue the exact committed candidate on `wt/mobile-device-media-ui-20260909`: product `ba92a6623`, retained
independent tests `eca72e42b`, audit report `61c71a436`. Deliver one coherent correction pass for M5-01 and
M5-03…M5-06. Do not write, edit, rename or delete any test or audit artifact; the auditor owns the oracle. Do not
touch Android/Kotlin/Gradle, Jitsi, push, PWA/branding, schema/migrations, server authorization/finalizers, unrelated
UI or PROD. Work only in the assigned worktree, commit all allowed production changes before ending, and do not push.

## Mandatory reading and authority

Run `grep -n "^## \|^### " AGENTS.md`; read the global decision method, §1/§1b, §4a, §5, §7, §9–§12,
§15–§17 and §19–§24 completely. Read `README.md`, `docs/README.md`, server/local-dev conventions,
`docs/ORCHESTRATION_BINDINGS.md`, the complete active plan M3/M5/M7, `apps/mobile-shell/README.md`, the original
worker brief, both independent audit artifacts, both retained acceptance files and every changed production caller
before editing. Use code-search before exact `rg`.

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M5-01: «Один контракт
`DeviceMedia` (`captureMedia`, `pickMedia`, `pickDocument`, `upload`) обслуживает все 6 существующих UI-точек
выбора файла (§3a); каждая из них параметризует этот шов вместо собственного определения среды.» M5-03…M5-06 и
принятый `DeviceMedia`-контракт в `apps/mobile-shell/README.md` дополняют этот атомарный correction scope. Preserve
the existing browser behavior and every existing destination's server authorization/finalization semantics.

## One ownership lifecycle — close all handle leaks

Fix audit MUST FIX 1 as one shared ownership mechanism in `shared/lib/deviceMedia.ts`, not scattered release calls.
A native selection is an owned resource from `selected` until it is either transferred into the shared upload
lifecycle or discarded. Terminal success, error, abort, cancellation after selection, validation refusal, wrong-kind
refusal, replacement, dialog close/reset and component teardown release its handle exactly once. Browser selections
remain no-op resources. In particular cover every reachable pre-upload/drop path named by the audit:

- patient program video missing duration or shorter than the minimum, plus state becoming disabled/busy while the
  picker is open;
- individual-exercise wrong kind, replacement, close/reset/unmount and successful transfer to upload;
- CMS/media-library selection received after upload becomes blocked;
- any equivalent early refusal in `MediaPickerPanel` or `PatientTabFiles` found during the required caller recount.

Make the retained two red `ProgramItemSubmissionSourceDialog` tests green without changing them. Avoid double
release when a component-level cleanup and `deviceMediaMultipartUpload` converge.

## Honest fallback and cancellation

Fix audit MUST FIX 2 on both doctor surfaces. A missing bridge must take the browser input path synchronously when
that can be known before awaiting. A plugin call that rejects or returns malformed/unavailable must fall back to the
already-mounted browser input or produce the surface's existing visible error; it must never be indistinguishable
from user cancellation. Keep browser inputs mounted where the native branch currently removes them. Preserve the
original user gesture for the ordinary browser/PWA path and do not add runtime sniffing outside the accepted
NativeRuntime/native-shell seam.

Wire `AbortSignal` for a native range upload to the accepted `DeviceMedia.cancelUpload()` bridge while the native
network call is active. Remove the listener afterward, keep cancellation idempotent, abort the server multipart
session exactly once, and release the handle exactly once. Do not retain the component-level duplicate abort POST
where the shared lifecycle already owns it.

## Construction gate — closed destinations, no wildcard documents

The candidate's public `DeviceMediaMultipartBeginRequest = {url, extraBody: Record<string, unknown>}` violates the
original brief and §10a construction rule: callers can express arbitrary policy/storage/owner fields and can
override `uploadMode`. Replace it with a closed discriminated destination union for exactly the four accepted
destinations: CMS library/folder, patient program submission/instance(+validated duration), doctor patient-file/
patient/category, and individual-exercise video/instance. The shared module alone maps each variant to its existing
authorized URL and exact allowed body fields; callers cannot provide an arbitrary URL/body, bucket, key, storage
target, policy, organization, owner, presigned host or `uploadMode`. Do not create a second upload engine or server
route.

M5-03 requires a separate system document action with narrow MIME filters. Remove the `['*/*']` native request and
reuse one canonical closed document MIME list matching the accepted Android contract. Do not broaden the native
plugin or a server door. Preserve the existing camera (Photo/Video switch inside CameraX), combined gallery, and
browser/PWA standards-based inputs. Where a source label is `Files` but its authorized destination accepts only
image/video, retain that authorized browser behavior instead of smuggling office documents through the wrong door;
report the exact resulting source mapping.

Do not add a global native-upload mutex unless an actual concurrent cross-surface path is demonstrated; the accepted
candidate already serializes parts within one native upload and the audit found no presently reachable two-upload
surface.

## Validation and delivery

Run the retained tests unchanged: the two-test UI oracle and shared multipart unit file. Run the auditor's previously
green targeted set only where the correction changed its behavior; use the host test lock. Also run webapp typecheck,
scoped ESLint, `node apps/webapp/scripts/check-media-upload-door.mjs`, its `--self-test`, media chokepoint and infra
boundary gates, exact caller/input/`window.Capacitor` inspections and `git diff --check`. No full root CI, DB writes,
live upload or shared dev service.

Commit all and only allowed product paths explicitly, never `git add -A`; commit message references `#915` and
M5-01/M5-03…M5-06. Report the exact SHA, the closed destination variants, ownership/fallback/cancel behavior,
source-action matrix, exact commands/results and factual device/live blockers. Do not finish while a foreground
check is running.
