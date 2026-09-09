# Worker brief — #915 one authorized multipart backend for native media

Deliver the server/common half of M5-04/M5-05 as one coherent extension of the existing media upload door. This is
product code through the repo port. Do not write, edit, rename or delete tests; independent `auditor-live` owns the
behavioral oracle. Do not touch `apps/mobile-shell/**`, PWA/install/NativeRuntime/Jitsi/video-meeting files, push
modules, schema/migrations, TEST/PROD data, storage objects or live services.

## Mandatory reading and authority

Run `grep -n "^## \|^### " AGENTS.md`; read the global decision method, §1/§1b, §4a, §5, §7, §9–§12,
§15–§17, §20–§22 and §24 completely. Read `README.md`, `docs/README.md`, server/local-dev conventions,
`docs/ORCHESTRATION_BINDINGS.md`, the complete active
`docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M5/M7, media HTTP authorization, patient-files plans,
module-local media docs, current upload-door checker and all touched routes/services/repos before changing code.
Use code-search before exact `rg`.

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: «Крупное медиа остаётся native
content URI и стримится в уже авторизованный presigned URL через существующий multipart-путь; base64-моста и копии
всего видео в JS heap нет.» The server remains the authorization/policy/finalization owner; a mobile client never
chooses bucket, storage target, object key, organization or policy id.

## Existing chokepoint, not a second upload backend

Parameterize the existing `mediaUploadAdapter`, `media_upload_sessions` lifecycle and
`/api/media/multipart/{part-url,complete,abort}` routes. Do not add `/api/native/upload`, a second multipart engine,
a second sessions table or a new schema migration. Before adding any function, prove why an existing helper cannot
carry it; prefer one typed destination/policy dispatch at the existing boundary.

Keep current browser/single-PUT behavior intact. Add an explicit server-selected multipart mode to today's
authorized begin doors only:

- CMS keeps `/api/media/multipart/init`, policy `cms` and validated assignable folder;
- patient program submission extends its existing presign door, policy `patient-program-submission`, retaining
  patient business access, instance/org/support/feature gates and video duration requirements;
- doctor patient-file POST extends its existing door, policy `patient-file`, retaining current-org client identity,
  entitlement and atomic quota semantics;
- individual-exercise media-presign extends its existing door, policy `individual-exercise-video`, retaining
  workspace instance and `mediaAllowed` narrowing.

The client may request `uploadMode:'multipart'`, but never supplies an arbitrary policy/storage value. Each begin
door validates exact positive size before calculating part size/count and invokes one common app-layer multipart
begin helper with the already-authorized policy-specific pending creator. `proxy` is not a multipart policy.

## Session policy, authorization and completion

Persist the immutable server-selected policy in the existing S3 multipart object's signed metadata alongside the
current media id, owner user id and expected size; do not add a database column merely to duplicate it. Parse it
with the existing closed policy validator during completion and compare it with session/pending metadata. Generic
part-url/complete/abort routes may accept the established patient or doctor session, but ownership and organization
come only from the installed DB principal/session row. Caller-supplied bucket, storage target, key, URL, policy,
owner or org must fail closed/never enter the lower port.

Extend the one policy-aware finalization dispatch without copying SQL transitions:

- `cms` and `individual-exercise-video` reuse the existing media finalizer with the exact original policy;
- `patient-program-submission` reuses its existing accept/abort path and must not double-enqueue transcoding;
- `patient-file` reuses the existing atomic `confirmFileUpload`/abort semantics and must not leave a legacy-visible
  `patient_files` row on abort or double-charge quota on replay.

Completion remains idempotent: verify exact stored object size/parts, perform one policy finalizer, then one CAS
session transition; retry against an already-ready result closes/returns the same result without a second quota,
ready transition or enqueue. Failure/abort releases multipart state through existing lifecycle logic.

## Privileges and architecture

If patient multipart session access needs additional DB capability, extend only the canonical declarative
`deploy/postgres/privileges/declaration.ts` and regenerate/check its existing artifacts. Do not put GRANT/REVOKE in
a migration and do not grant patient DELETE on media files. Routes stay thin and call app-layer/module ports; no
new direct S3 import, raw SQL or caller storage argument. `node apps/webapp/scripts/check-media-upload-door.mjs`
and `--self-test` must still prove the one door.

Allowed scope is the existing media upload validation/adapter/session repo files, the four named authorized begin
families, existing multipart part/complete/abort routes, the minimum patient-files/program-submission service/port
parameterization needed for existing finalizers, the upload-door checker, canonical privilege declaration/generated
artifacts, and directly affected module/API docs. No client TSX/DeviceMedia adapter in this stage.

## Validation and delivery

No tests. Run existing non-test checks only: webapp typecheck, scoped ESLint, upload-door checker+self-test, media
architecture gates, privilege typecheck/generation/census/checks when touched, `git diff --check`, and verify no
schema/migration diff. Do not perform live uploads, DB writes, migration apply or full root CI. Commit all and only
the allowed paths explicitly, never `git add -A`; do not push. Commit message references `#915`, M5-04/M5-05,
evidence and remaining native/client/live gates. Report exact SHA, changed public response shapes, commands/results
and any factual blocker. Do not finish while a foreground check is running.

