# Blind behavioral kill-set — #915 DeviceMedia UI and streaming upload

Recorded BEFORE reading any test file or test-related code in the candidate.

Candidate: `ba92a66239fb7382ffdbe849941839c4e5acb388` (M5-01, M5-04..M5-06 web client)
Base: `4d84fb2` (merge of wt/mobile-web-runtime-push-20260909 into feat/doctor-ui-rebuild)
Oracle: `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` — "Нативный путь проходит ту же дверь:
`node apps/webapp/scripts/check-media-upload-door.mjs` и `--self-test` зелёные, ни один маршрут не получает
новый storage-аргумент и не зовёт `presignPutUrl`/`s3*` в обход `mediaUploadAdapter`."

## K1 — one typed client boundary, no policy leakage to callers
One typed DeviceMedia/client upload boundary serves every reachable production input; product callers
cannot detect Capacitor and cannot express policy / storage / org / owner / key.
Break: a caller reads `window.Capacitor` or passes a storage/policy/bucket/key argument.

## K2 — browser behavior and fallback preserved
Browser `File`, multiple selection, drag/drop, capture/accept, and the immediate user-gesture picker
remain working. A missing or rejecting native plugin returns to browser behavior — no white screen,
no fabricated cancellation error.
Break: gesture lost behind an `await`; plugin absence throws to the user.

## K3 — native descriptors, no bytes in JS
Native camera / gallery / document map to the accepted plugin methods and to normalized descriptors.
No URI, no base64, no full-video bytes enter JS. Program video without a valid duration fails
BEFORE the begin call.
Break: base64/dataURL path; begin issued for a duration-less native video.

## K4 — four destinations keep their authorized door
The four destinations (CMS library, patient program submission, doctor patient-file, individual-exercise
video) call only their own already-authorized accepted begin/confirm path and preserve the existing
result shape, cache/list refresh, discussion attachment, quota/finalization and progress behavior.
Break: destination A's begin used for destination B; result shape or refresh callback dropped.

## K5 — multipart correctness and native serialization
Multipart sends exact bounded offsets/lengths, ordered ETags, and completes exactly once.
A recoverable part failure retries the SAME range; exhaustion aborts once; success/abort/cancel
releases the native handle exactly once. The shared scheduler NEVER overlaps two native
`DeviceMedia.upload` calls (accepted plugin concurrency is one), while the existing bounded browser
`File` parallelism stays operational.
Break: wrong offsets; unordered/duplicate ETags; double complete; double or missing release;
two concurrent native range uploads; browser parallelism collapsed to 1.

## K6 — cancellation and replacement safety
A cancellation starts no upload. Session/selection replacement cannot complete the previous
destination or leak a handle. Browser single-PUT and CMS multipart stay compatible.
Break: cancel still issues init/part; replaced selection completes the old destination.

## K7 — no duplication, no bypass, dead code only if proven dead
The existing patient source dialog is the only source dialog. No duplicate multipart engine, no second
native upload route, no storage argument, no direct S3/presign bypass. `MediaUploader` is absent only
if zero callers are proven.
Break: second multipart implementation retained; `presignPutUrl`/`s3*` called outside `mediaUploadAdapter`;
a live caller of the removed component.

## Injection matrix (each must go red, then be restored)
1. native descriptor with missing duration
2. caller-selected policy/storage argument
3. wrong part offsets
4. duplicate complete / duplicate release
5. abort omitted on exhaustion
6. browser gesture lost behind an await
7. parallel native range uploads
8. one caller bypassing the adapter

## Assertion policy
Assert outputs, HTTP bodies/order, progress and durable UI callbacks — never implementation call
counts, source text, labels or button counts. One destination/source matrix, not per-page suites.
