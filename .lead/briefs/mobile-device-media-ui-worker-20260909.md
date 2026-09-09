# Worker brief — #915 one DeviceMedia source/upload path across existing UI

Deliver M5-01 and M5-04…M5-06 as one coherent web-client integration after the accepted native-capability,
NativeRuntime and multipart-backend candidates are present in this branch. Adapt all reachable existing media
source/upload points in one pass. Do not write, edit, rename or delete tests; the independent auditor owns the
behavioral oracle. Do not touch Android/Kotlin/Gradle, PWA/install/Jitsi/push, schema/migrations, server upload
authorization/finalizers, unrelated UI, data/storage/services or PROD.

## Mandatory reading and authority

Run `grep -n "^## \|^### " AGENTS.md`; read the global decision method, §1/§1b, §4a, §5, §7, §9–§12,
§15–§17 and §19–§24 completely. Read `README.md`, `docs/README.md`, server/local-dev conventions,
`docs/ORCHESTRATION_BINDINGS.md`, the complete active plan M3/M5/M7, `apps/mobile-shell/README.md`, accepted native,
NativeRuntime and multipart audit evidence, media authorization/patient-files plans, module-local media docs, the
upload-door checker and all reachable callers before changing code. Use code-search before exact `rg`.

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: «Один контракт `DeviceMedia`
(`captureMedia`, `pickMedia`, `pickDocument`, `upload`) обслуживает все 6 существующих UI-точек выбора файла (§3a);
каждая из них параметризует этот шов вместо собственного определения среды.» Browser fallback and native upload
must keep the same server authorization, policy selection, confirmation and UI outcomes.

## One source and upload boundary

Consume the accepted `NativeRuntime`; callers never inspect `window.Capacitor`, plugin names, user agent or
hostname. Before adding a helper, ask whether `app-layer/media/mediaUploadAdapter.ts`, the accepted NativeRuntime,
the existing patient source dialog, `MediaPickerPanel` or current `libraryMultipartUpload` can be parameterized.
Do not create a second picker modal, upload backend, upload-session model, policy id or storage choice.

Create one strictly typed client DeviceMedia selection union:

- browser selection carries the existing `File` plus normalized kind/source/size/duration metadata;
- native selection carries only the accepted opaque handle plus mime/display name/size/duration/source/kind;
- URI and bytes never enter JS; no base64, full-video Blob/ArrayBuffer or content-URI exposure;
- cancellation is a normal typed outcome and never a fake upload error.

Create/parameterize one upload operation over a closed destination union: CMS library/folder, patient program
submission/instance, doctor patient-file/patient/category and individual-exercise video/instance. A caller cannot
express bucket, key, storage target, arbitrary policy, organization, owner or presigned host. Each destination uses
only its already-authorized accepted begin response and retains its exact confirm/failure/finalization semantics.

Consolidate the existing browser multipart lifecycle instead of copying it: init → bounded part URL → browser
`File.slice` PUT or native `DeviceMedia.upload({handle,offset,length,presignedUrl,headers})` → ordered ETags →
complete, with the same retry/progress/abort rules. A terminal success/abort/cancel releases the native handle once;
a recoverable part retry reuses the same handle/range. Keep browser single-PUT where it remains the accepted path.
The accepted Android plugin permits exactly one native range upload at a time: parameterize the shared scheduler to
use concurrency `1` for a native handle while preserving the existing bounded browser `File` concurrency. Do not
let parallel workers turn the plugin's intentional `upload already in progress` rejection into retry churn, and do
not fork a second native multipart engine to obtain serialization.

## Existing UI points, no redesign

Recount the exact live file inputs on the candidate. Adapt every reachable point through the shared boundary:

- `MediaPickerPanel` remains the CMS modal chokepoint and retains list-item fetch, kind validation, cache refresh
  and `onPick`; its callers are not forked per runtime.
- `MediaLibraryClient` keeps desktop multi-file, drag/drop, mobile browser inputs, progress/retry and current layout.
  Its multipart helper is absorbed/parameterized; do not leave a wrapper copy of a second lifecycle.
- `PatientTabFiles` keeps separate browser camera-photo, camera-video, gallery photo/video and document actions.
  Native camera uses one accepted CameraX screen where Photo/Video is selected inside the camera; gallery and
  document call the corresponding native methods.
- `ProgramItemSubmissionSourceDialog` remains the only camera/gallery/document source dialog. Native video must
  provide a valid measured `durationSeconds` before begin; existing duration/access/attach-to-discussion behavior
  remains.
- `InstanceAddLibraryItemDialog` keeps its individual-exercise media contract and progress behavior.
- `MediaUploader.tsx` is removed only if exact import/caller searches still prove zero production callers;
  otherwise route it through the same boundary. Do not preserve a dead direct-upload bypass merely for symmetry.

Browser/PWA keeps standards-based hidden inputs, `accept`/`capture`, desktop multiple selection and drag/drop.
Invoke a browser input synchronously in the originating user gesture; do not await native detection first and lose
the picker gesture. Native capability absence/rejection falls back safely without weakening browser uploads.

## Validation and delivery

No tests. Run existing non-test checks only: webapp typecheck, scoped ESLint, upload-door checker+self-test, media
architecture gates, exact `type="file"`/production-caller and `window.Capacitor` inspections, `git diff --check`.
Do not run full root CI, live uploads, DB writes or shared dev services. Commit all and only allowed paths explicitly,
never `git add -A`; do not push. Commit message references `#915`, M5-01/M5-04…06, evidence and remaining native
device/RuStore/live gates. Report exact SHA, public TS contracts, caller matrix, commands/results and factual
blockers. Do not finish while a foreground check is running.
