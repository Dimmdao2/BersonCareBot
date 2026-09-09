# Тест или взгляд

Repeatable auth, policy, lifecycle, idempotency, quota and finalization behavior is tested through public
module/route seams. One-time privilege generation, architecture/chokepoint shape, absence of schema migration and
storage metadata wiring are inspected with generated gates/diff; do not test source or SQL text.

# Auditor-live brief — #915 shared multipart backend for native media

Independently audit the exact committed server/common M5-04/M5-05 candidate. Product code is read-only. You may
add/commit only stable behavioral acceptance tests and audit artifacts. Do not fix product code, touch Android/PWA/
NativeRuntime/Jitsi/push, apply privileges/migrations, write DEV/TEST data, access storage or run real uploads.

## Mandatory reading and blind order

Run the AGENTS.md heading map; read the global decision method, §1/§1b, §4a, §5, §9–§12, §15–§17, §20–§22 and
§24 fully, with §10a/§10b before opening tests. Read the complete M5/M7 authority in
`docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`, media authorization, patient-file
plans, module docs, existing upload-door checker and exact base→candidate diff. Persist the kill-set below before
reading tests in `.lead/runs/mobile-media-multipart-backend-audit-20260909/00-blind-killset.md`.

## Blind behavioral kill-set

1. Patient, specialist, restricted staff, cross-org and wrong-instance callers cannot begin/read/complete/abort a
   multipart session outside the exact existing surface guard; ownership is never accepted from request data.
2. Each begin door selects only its fixed policy and existing pending creator. Caller bucket/storage/key/policy/org
   is rejected or ignored before the storage port; `proxy` cannot become multipart.
3. Exact positive size is required before init, part count/limits stay bounded, and object metadata binds media id,
   owner, expected size and fixed policy; mismatch/tamper fails before finalization.
4. `cms`, program submission, patient file and individual-exercise completion invoke their existing semantic
   finalizers. Program video enqueues once; patient-file quota/ready transition happens once; individual exercise is
   not accidentally revalidated as `cms`.
5. Complete replay is idempotent with the same observable result and no second quota, transition or enqueue.
   Partial/missing/wrong-size/wrong-ETag upload does not become ready.
6. Abort/failure terminates the right session/upload. Patient-file abort removes the current pending linked record
   rather than leaving it legacy-visible; no unrelated media/session is affected.
7. Existing browser single/proxy and CMS multipart behavior remains unchanged. Part-url/complete/abort still use one
   lifecycle/lock path; no second native upload route or storage argument bypasses `mediaUploadAdapter`.
8. Patient DB rights are no broader than required session operations and current-user RLS; no patient media DELETE,
   cross-user read, migration-local grant or schema change is introduced.

## Tests, fault injection and inspection

Extend existing route/module suites at the cheapest public seam; do not create one suite per route when one typed
matrix proves distinct guards/policies. Use current fakes/builders, assert outputs and durable side effects rather
than private call counts. Temporarily inject and restore: caller-selected policy/storage; cross-user session access;
wrong stored policy/size; duplicate complete; patient-file abort leaving a row; program double-enqueue;
individual-exercise using `cms`; bypass upload adapter. Every repeatable fault is caught by retained green behavior
or represented by a failing acceptance test on the untouched candidate.

Inspect exact diff, generated privilege artifacts, current RLS/principal mechanism and zero schema/migration diff.
Run targeted retained/new tests, webapp typecheck, scoped ESLint, upload-door+self-test, media architecture and
privilege gates, `git diff --check` and clean status. A bounded rollback-only named-DEV privilege probe is allowed
only through documented scripts and must always roll back; do not apply/reconcile. Full CI and live object upload
belong to final integration.

Commit only justified tests and
`.lead/runs/mobile-media-multipart-backend-audit-20260909/{00-blind-killset.md,90-final-audit-report.md}` with
explicit paths, never `git add -A`; do not push. Return binary PASS/MUST FIX with reachable scenario/impact/M-ID,
kill tally, exact failed assertions, commands/SHA and factual live blockers. Restore all production mutations and
do not finish while a foreground command is running.
