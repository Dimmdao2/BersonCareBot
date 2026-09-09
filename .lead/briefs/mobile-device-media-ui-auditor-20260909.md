# Тест или взгляд

Repeatable selection, destination routing, range upload, retry/abort/release and browser fallback behavior is tested
through the shared public client adapter and stable component actions. The exact caller inventory, no-base64/no-
bypass architecture and dead-code removal are inspected; UI wording/layout/count is not tested.

# Auditor-live brief — #915 DeviceMedia UI and streaming upload

Independently audit the exact committed M5-01/M5-04…M5-06 web-client candidate. Product code is read-only. You may
add/commit only stable behavioral acceptance tests and audit artifacts. Do not fix product code or touch Android,
PWA/Jitsi/push, schema/migrations, server authorization/finalizers, data/storage/services or PROD.

Run the AGENTS.md heading map; read the global decision method, §1/§1b, §4a, §5, §9–§12, §15–§17 and §19–§24
fully, with §10a/§10b before tests. Read the complete M5/M7 authority, accepted native/NativeRuntime/multipart audit
evidence, media/patient-files docs, upload-door checker and exact base→candidate diff. Persist the blind kill-set
below before reading tests in `.lead/runs/mobile-device-media-ui-audit-20260909/00-blind-killset.md`.

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: «Нативный путь проходит ту же дверь:
`node apps/webapp/scripts/check-media-upload-door.mjs` и `--self-test` зелёные, ни один маршрут не получает новый
storage-аргумент и не зовёт `presignPutUrl`/`s3*` в обход `mediaUploadAdapter`.»

## Blind behavioral kill-set

1. One typed DeviceMedia/client upload boundary serves every reachable production input; product callers cannot
   detect Capacitor or express policy/storage/org/owner/key.
2. Browser `File`, multiple selection, drag/drop, capture/accept and immediate user-gesture picker remain working;
   missing/rejecting native plugin returns to browser behavior without a white screen or fake cancellation error.
3. Native camera/gallery/document map to the accepted methods and normalized descriptors; no URI/base64/full-video
   bytes enter JS. Program video without valid duration fails before begin.
4. The four destinations call only their authorized accepted begin/confirm path and preserve existing result shape,
   cache/list refresh, discussion attachment, quota/finalization and progress behavior.
5. Multipart sends exact bounded offsets/lengths, ordered ETags and complete once. Recoverable part failure retries
   the same range; exhaustion aborts once; success/abort/cancel releases the native handle exactly once.
6. A cancellation starts no upload. Session/selection replacement cannot complete the previous destination or leak
   a handle. Browser single-PUT/CMS multipart remains compatible.
7. Existing patient source dialog is the only source dialog; no duplicate multipart engine/native upload route,
   storage argument or direct S3/presign bypass exists. Dead MediaUploader is absent only if zero callers are proven.

Use the cheapest public adapter/component seams and shared fakes. Prefer one destination/source matrix to per-page
suites. Assert outputs, HTTP bodies/order, progress and durable UI callbacks, not implementation call counts,
source text, labels or button counts. Temporarily inject and restore: native descriptor with missing duration;
caller-selected policy/storage; wrong part offsets; duplicate complete/release; abort omitted; browser gesture lost
behind an await; one caller bypassing the adapter. Each repeatable fault must go red or remain a failing acceptance
test on the untouched candidate.

Inspect exact caller inventory and diff. Run retained/new targeted tests, webapp typecheck, scoped ESLint,
upload-door+self-test, media architecture gates and `git diff --check`; no full CI or live upload. Commit only
justified tests and `.lead/runs/mobile-device-media-ui-audit-20260909/{00-blind-killset.md,90-final-audit-report.md}`
with explicit paths, never `git add -A`; do not push. Return binary PASS/MUST FIX with reachable scenario, impact,
M-ID, kill tally, exact assertions/commands/SHA and factual live blockers. Restore all production mutations and do
not finish while a foreground check is running.
