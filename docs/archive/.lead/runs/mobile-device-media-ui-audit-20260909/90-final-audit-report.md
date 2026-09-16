# auditor-live final report — #915 DeviceMedia UI and streaming upload

**Verdict: MUST FIX** (2 findings). Everything else in the blind kill-set is killed.

| | |
|---|---|
| Candidate audited | `ba92a66239fb7382ffdbe849941839c4e5acb388` |
| Base | `4d84fb260` |
| Audit commit (tests + artifacts only) | `eca72e42b` and this file |
| Authority | `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M5-01/M5-04/M5-05/M5-06, M3-01/M3-03; accepted plugin contract `apps/mobile-shell/README.md` (`DeviceMedia` row) |
| Blind kill-set | `.lead/runs/mobile-device-media-ui-audit-20260909/00-blind-killset.md`, written before any test file was opened |
| Product code | read-only; every injected fault below was reverted (`git status` clean, verified after each) |

---

## MUST FIX 1 — a native handle is released only when the upload actually starts; every refuse/replace path leaks it

**M-ID:** M5-01, M5-04 (kill-set item 5 «success/abort/cancel releases the native handle exactly once» and item 6 «selection replacement … cannot leak a handle»).

`releaseNativeDeviceMediaHandle` is called in exactly one place — the `finally` of
`deviceMediaMultipartUpload` (`apps/webapp/src/shared/lib/media/deviceMediaMultipartUpload.ts:243`).
Every caller path that receives `{outcome:'selected'}` and then returns *without* entering that
function keeps the handle forever. The accepted plugin copies unknown/non-seekable sources once
into app private cache before returning the descriptor (`apps/mobile-shell/README.md`), so a leaked
handle is a full copy of the recording left on the device.

Reachable paths (all `{outcome:'selected'}`, none release):

| File:line | Path |
|---|---|
| `apps/webapp/src/app/app/patient/treatment/ProgramItemSubmissionSourceDialog.tsx:124` | video without duration → `onError('video_metadata_unavailable')` → `return` |
| `…ProgramItemSubmissionSourceDialog.tsx:128` | video shorter than the minimum → `onError('video_too_short')` → `return` |
| `…ProgramItemSubmissionSourceDialog.tsx:116` | `disabled`/`busy` became true while the picker was open → `return` |
| `apps/webapp/src/app/app/doctor/treatment-program-shared/InstanceAddLibraryItemDialog.tsx:496` | non-video picked → `setError('Выберите видео')` → `return` |
| `…InstanceAddLibraryItemDialog.tsx:499` | selection stored in React state; picking again («Заменить видео…») overwrites it, and closing/cancelling the dialog drops it — the previous handle is never released |
| `apps/webapp/src/app/app/doctor/content/library/MediaLibraryClient.tsx:808` | `uploadBlockedAtClientRoot` → `return` |

**Failure scenario:** patient inside Therapy Go taps «Записать», records an 8-second clip, gets the
normal «слишком короткое видео» refusal, retries. Each attempt leaves a full private-cache copy of
the recording on the phone. Nothing is logged, nothing is shown; storage grows until the app is
uninstalled.

**Impact:** unbounded device-storage growth on the patient's phone from ordinary, expected refusals.
Дорогой и молчаливый отказ (§10a ступень 2) — exactly the class the kill-set names.

**Oracle / evidence:** committed failing acceptance test
`apps/webapp/src/app/app/patient/treatment/ProgramItemSubmissionSourceDialog.ui.test.tsx`
(project `ui`), 2 tests, both RED on the untouched candidate:

```
× releases the native handle when the selected video is rejected before begin (too short)
    AssertionError: expected [] to deeply equal [ 'opaque-too-short' ]
× releases the native handle when a video arrives without a usable duration
    AssertionError: expected [] to deeply equal [ 'opaque-no-duration' ]
```

Both tests' other assertions pass on the candidate — the product **does** correctly refuse before
any begin call (`expect(fetchSpy).not.toHaveBeenCalled()`), so kill-set item 3's «program video
without valid duration fails before begin» is confirmed green. Only the release is missing.

**Note for the fixer (§5 «один общий проход»):** the right shape is one release chokepoint for a
terminal selection, not six `release()` calls sprinkled into six `return`s. `DeviceMediaSelection`
ownership crosses the component boundary, so the seam that hands the selection out
(`shared/lib/deviceMedia.ts`) is the natural place to own its disposal.

---

## MUST FIX 2 — a rejected/absent native plugin gives no fallback and no error in two of the five surfaces

**M-ID:** M3-03 («отсутствующий plugin деградирует в web behavior без белого экрана»), M5-06;
kill-set item 2.

`callDeviceMedia` maps «plugin absent / method missing / call threw / malformed result» to `null`,
which `deviceMedia.ts` surfaces as `{outcome:'unavailable'}` — deliberately distinct from a user
cancellation. Three surfaces honour it and click their hidden browser input
(`PatientTabFiles.tsx:171`, `MediaPickerPanel.tsx:487`, `ProgramItemSubmissionSourceDialog.tsx:110`).
Two do not:

- `apps/webapp/src/app/app/doctor/content/library/MediaLibraryClient.tsx:808` —
  `if (pick.outcome !== 'selected' || uploadBlockedAtClientRoot) return;` collapses `unavailable`
  into silence. The hidden `mobileCaptureInputRef` / `mobileFilesInputRef` exist in the DOM but are
  never clicked.
- `apps/webapp/src/app/app/doctor/treatment-program-shared/InstanceAddLibraryItemDialog.tsx:494` —
  `if (pick.outcome !== 'selected') return;`, and at line 735 the `<Input type="file">` is rendered
  **only** in the `!nativeMediaAvailable` branch, so in the native shell there is no browser input in
  the DOM to fall back to at all.

**Failure scenario:** a specialist in Therapysto opens the media library (or the individual-exercise
video field) and taps «Снять фото/видево» / «Выбрать видео…». The `DeviceMedia` call throws — the
plugin's `TrustedOriginGate` rejects because the main frame is not on the exact compiled origin, or
a runtime permission was revoked (`apps/mobile-shell/README.md`: «All native calls are unavailable
unless the active main-frame URL has the exact HTTPS platform origin»). The button does nothing at
all: no picker, no message, no error state. The specialist cannot upload and has nothing to report.

**Impact:** a dead upload button with no diagnosis on two doctor surfaces inside the native shell.
This is the «fake cancellation» class the kill-set forbids, in its silent form.

**Evidence:** inspection of the exact branches above plus the contrast with the three surfaces that
do fall back. Not test-covered: proving it needs the full `MediaLibraryClient` /
`InstanceAddLibraryItemDialog` render harness for a one-line branch, and §10a («цена проверки входит
в решение») makes that machinery more expensive than the defect. Reported as a look, per §24.4.

---

## Kill tally

| # | Kill-set item | Result |
|---|---|---|
| 1 | One typed boundary, callers cannot detect Capacitor or express policy/storage/org/owner/key | **KILLED** |
| 2 | Browser `File`/selection/drag-drop/capture/accept + immediate gesture; plugin absence returns to browser behaviour | **PARTIAL → MUST FIX 2** (browser half killed) |
| 3 | Native methods → normalized descriptors; no URI/base64/full-video bytes; duration-less program video fails before begin | **KILLED** |
| 4 | Four destinations keep their own authorized begin/confirm path, result shape, refresh, attach, quota, progress | **KILLED** |
| 5 | Exact ranges, ordered ETags, complete once, retry same range, abort once, release once, native serialization, browser parallelism | **KILLED for the engine; release-once → MUST FIX 1** |
| 6 | Cancellation starts no upload; selection replacement cannot complete the previous destination or leak a handle | **cancel KILLED; replacement leak → MUST FIX 1** |
| 7 | One source dialog, no duplicate multipart engine / native route / storage argument / S3 bypass; dead code only if proven dead | **KILLED** |

**Uncaught by any test and not a finding: 0.** Every named fault is either killed by a green test
under injection, or represented by a committed failing acceptance test, or reported above with its
exact reachable branch.

### Fault injection ledger (each reverted immediately; `git status` verified clean after)

| # | Injected fault | Assertion that went red |
|---|---|---|
| 1 | `end = start + partSizeBytes` (unbounded last part) | exact contiguous ranges `[[0,32],[32,32],[64,16]]` |
| 2 | `concurrency = Math.min(4, maxParts)` for native too | `maxConcurrentUploads` = 1 |
| 3 | release removed | 4 tests: release lists on success, retry, exhaustion, pre-cancel |
| 4 | release called twice | same 4 tests (`['h']` vs `['h','h']`) |
| 5 | abort omitted on exhaustion | `/abort` called exactly once with the sessionId |
| 6 | `storageTarget:'selectel'` added to the begin body | begin body carries no storage/policy/owner/key |
| 7 | `/complete` POSTed twice | complete-call count = 1 |
| 8 | `concurrency = 1` for browser too | browser `maxInFlight > 1` |
| 9 | ETags sorted descending | ordered ETag array in the complete body |
| 10 | `presignPutUrl` imported into `api/media/multipart/init/route.ts` | `check-media-upload-door.mjs` → exit 1, `route imports storage write presignPutUrl` |

Faults 3/4 also double as the independent «duplicate complete/release» class; fault 10 is the
adapter-bypass class (the door checker's own `--self-test` covers the remaining structural
fixtures). «Browser gesture lost behind an await» was inspected rather than injected: no browser
branch in any of the five surfaces awaits before `.click()` — `nativeMediaAvailable` is a
synchronous context read in all of them.

---

## Commands run (all from this worktree, foreground, all completed)

```
node apps/webapp/scripts/check-media-upload-door.mjs                     → media upload door: OK
node apps/webapp/scripts/check-media-upload-door.mjs --self-test         → OK (all structural bypass fixtures went red)
node scripts/check-media-delivery-chokepoint.mjs                         → exit 0
node scripts/check-webapp-infra-import-boundary.mjs                      → OK
pnpm --dir apps/webapp run typecheck                                     → exit 0
pnpm --dir apps/webapp exec eslint <10 changed product files + 2 tests>  → exit 0
pnpm --dir apps/webapp exec vitest --run (unit/fast/route, 7 files)      → 101 passed
pnpm --dir apps/webapp exec vitest --run --project ui <new ui test>      → 2 failed (the MUST FIX 1 oracle)
git diff --check                                                         → clean
```

No full CI (§9: no repo-level/multi-app contract changed by this candidate; targeted gates cover it).
No live upload.

## Caller inventory (recounted on the candidate, not quoted)

```
rg 'window.Capacitor' apps/webapp/src   → only shared/lib/nativeShellRuntime.ts reads it (M3-01 intact)
rg -ln 'type="file"' apps/webapp/src --glob '*.tsx' --glob '!*test*'  → 5 real UI points
git grep MediaUploader 4d84fb260 -- apps/webapp/src → only its own definition (removal justified)
rg 'presignPutUrl|presignUploadPartUrl|s3(Complete|Abort)MultipartUpload' apps/webapp/src
    → app-layer/media/mediaUploadAdapter.ts + s3Client.ts only (plus gate fixtures)
git diff 4d84fb260 ba92a6623 -- apps/webapp/src | rg '^[-+].*(multiple|onDrop|onDragOver|capture=|accept=)'
    → only the individual-exercise `accept="video/*"` input, moved into the fallback branch
git diff --name-status 4d84fb260 ba92a6623 | rg '^A' → 2 new lib files, no second source dialog, no second engine
rg 'ui/doctor/media/uploadWithProgress' apps/webapp/src → none (move is complete)
```

Server side is untouched and already destination-agnostic: `/api/media/multipart/{part-url,complete,abort}`
derive authorization from the session row, `beginAuthorizedMultipartUpload` computes
`maxParts = ceil(size/partSize)` so the client's `1..maxParts` claim loop is exactly the file's parts,
and `complete` routes each `policyId` to its own existing finalizer (`acceptReceivedProgramSubmission`,
`patientFiles.confirmFileUpload`, `finalizeReceivedMultipart`). Each of the four begin doors selects its
own closed `policyId` server-side; no request field can influence it.

## Observations — NOT findings (§24.6: gate, not a source of scope)

1. `MediaLibraryClient.uploadNativeSelection` calls `libraryMultipartAbort` in its `catch` while the
   engine already aborted the same session — two POSTs to `/api/media/multipart/abort`. The base has
   the identical double-abort on the browser multipart path, so this is not a regression; the second
   POST is ignored.
2. Patient dialog: «Файлы» maps to `pickDeviceMediaFromGallery`, not `pickDocument`. The submission
   door accepts only image/video, so nothing breaks; native «Галерея» and «Файлы» simply become the
   same picker. Live-acceptance/product call, not a defect.
3. `PatientTabFiles` passes `pickDeviceDocument(['*/*'])`. The accepted plugin re-checks the picked
   document against its own closed MIME set, so the client's wide request is not a hole — worth
   confirming during M5-03 native acceptance.
4. The `unavailable` → `.click()` fallback in the three good surfaces happens after an `await`, so
   user activation may already be spent in a real WebView. It is best-effort by construction; the
   browser/PWA path never reaches it.
5. There is no module-level mutex across two concurrent `deviceMediaMultipartUpload` invocations.
   Serialization holds inside one invocation (proven). No reachable UI path today runs two at once —
   each surface disables its own trigger while uploading and no two of the five points are live
   simultaneously. Worth a mutex if a future surface uploads two selections in parallel.

## Live blockers

None encountered. No Android emulator/APK acceptance was attempted (M7-03/M7-04, out of this scope
and gated on the toolchain); no live upload was performed, per brief.
