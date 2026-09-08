# TEST c069 acceptance triage/fix: media upload and processing

Role: WORKER. Start with the `AGENTS.md` heading map, then read the complete relevant parts of §1/1b, §4a, §5,
§§7/9/10/10a/10b, §§15/17/18/19 and §24. Read `docs/MEDIA_PREVIEW_PIPELINE.md`,
`docs/ARCHITECTURE/MEDIA_HTTP_ACCESS_AUTHORIZATION.md`,
`docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` FILES-01..11 and the TEST acceptance report at
`/home/dev/dev-projects/.lead/runs/test-full-acceptance-c0690ddaa/media-storage/REPORT.md`.

Источник оракула: `docs/MEDIA_PREVIEW_PIPELINE.md` — «`video/mp4`, `video/webm`» are supported input MIME types
whose expected result is `ready` through system `ffmpeg`.

Work from current feat. Do not deploy, push, restart services, mutate named TEST/DEV data, create a disposable DB,
touch PROD/S3 secrets, or manufacture a bypass. First classify each observation against code and retained evidence;
fix only a reachable product defect. One report item is already rejected and must not be changed: the mobile
`Медиатека` button correctly invokes the hidden native `accept="image/*,video/*"` input, and a prior real upload
proved it; a browser automation screenshot cannot display the OS picker.

Investigate the two remaining c069 observations as one upload/processing path:

1. A browser-generated `video/webm` was accepted by Files but displayed as `Прочее`, never showed processing, and
   remained non-playable after 40 seconds. The fixture was only 380 bytes. Determine whether it was a valid supported
   WebM and whether the product misclassified/dropped MIME/job creation. Invalid media must get a clear bounded
   failure, not silent permanent generic storage; valid `video/webm` must enter the existing video pipeline.
2. A valid tiny PNG patient program submission stayed `Изображение готовится` for 30 seconds in both patient and
   doctor UI. Correlate the upload-confirm path, preview/media job state and polling/read projection. The fixture was
   deleted by ordinary UI, so use retained logs/code and existing tests; do not recreate TEST data. Fix only if the
   pending state can remain indefinitely or a confirmed-ready image is projected as pending.

The runtime/DB pass found no new c069 media-worker crash. It found one pre-existing row whose target says library
while its object key uses a patient-files layout; classify that separately as old TEST data remediation, not a code
fix unless a current reachable writer still creates that mismatch. Telegram 401 is an external TEST configuration
blocker and outside this workstream.

Migrations never contain GRANT/REVOKE. If a database function or privilege declaration truly changes, perform the
complete §1 migration and privilege analysis; otherwise do not add a migration. Reuse existing media classification,
confirm, job and preview choke points; do not create a parallel pipeline.

WORKER DOES NOT WRITE, EDIT, RENAME OR DELETE TESTS. Run only retained targeted behavior tests, webapp/integrator
typecheck as applicable, scoped ESLint and `git diff --check`; no full CI. Commit only explicit touched paths, never
`git add -A`. Report exact SHA, classification of both observations, files, checks and remaining live rerun.
