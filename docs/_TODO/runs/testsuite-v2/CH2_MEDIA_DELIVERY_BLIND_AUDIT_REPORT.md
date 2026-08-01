# Ч2 — media delivery chokepoint: independent blind audit

**Role:** `auditor-live`  
**Authority:** `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`, Ч2  
**Target product commit:** `72cbfa172`  
**Audit status:** FAIL

## Blind phase lock

The kill-set below was written before reading the target diff, target-added tests, or the worker report. Its
oracles are Ч2 authority, the pre-target (`72cbfa172^`) route handlers, `apps/webapp/src/app/api/api.md`,
`docs/ARCHITECTURE/MEDIA_HTTP_ACCESS_AUTHORIZATION.md`, and the media module documentation.

Classification chosen before inspection:

- **Behavior / blind kill-set:** authorization and delivery semantics of the common door and five real handlers,
  online-intake URL resolution, structural-gate bypasses, and gate false positives.
- **Inspection:** exact five-handler migration, preserved session/principal wiring and route-specific semantics,
  absence of public fallback, and exclusion of `patient_files`, upload/multipart, preview-worker, and storage
  delete/purge paths.

## Blind kill-set

### A. Common authorization door

| ID  | Fault planted or modeled                                                                                                      | Wrong observable result / impact                                                                                     | Required oracle                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A1  | Treat an org-scoped missing/foreign `media_files` row as usable.                                                              | A user who knows a foreign UUID reaches bytes, a signed URL, playback resolution, HLS proxying, or telemetry.        | Not-found decision and zero downstream S3/playback/event side effects.                                    |
| A2  | Retry the platform-base lookup when `resolvePlatformLfkMediaAccess(id)` is false, or set `allowPlatformBase` unconditionally. | An organization-scoped miss crosses into platform storage without the explicit platform LFK exception.               | Platform retry occurs only after an explicit `true`; false means not found and no downstream side effect. |
| A3  | Ignore the `program_item_submission` uploader ACL.                                                                            | A different patient in the same organization can read another patient's submission.                                  | Other patient denied; uploader patient allowed.                                                           |
| A4  | Over-tighten submission ACL while consolidating it.                                                                           | The uploader or an organization doctor/admin loses legitimate access.                                                | Uploader and doctor/admin allowed.                                                                        |
| A5  | Apply submission-only restrictions to ordinary same-org media.                                                                | Existing catalog/program media stops playing for valid same-org sessions.                                            | Ordinary same-org media remains allowed.                                                                  |
| A6  | Move/omit the doctor workspace or patient business-access principal gate.                                                     | The common door runs without the scoped principal, or a previously rejected session reaches repository/storage work. | The original outer gate/status remains and the door runs only inside its accepted principal context.      |

### B. Five real handlers and delivery semantics

| ID  | Fault planted or modeled                                                                              | Wrong observable result / impact                                                                                                                       | Required oracle                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Remove the common door from any one real handler.                                                     | That public route becomes a live sixth ACL copy/bypass.                                                                                                | A real-handler route test fails before any downstream delivery call.                                                                                                                        |
| B2  | In base `GET /api/media/[id]`, call key lookup, presign, or local-body fallback before authorization. | Missing/foreign media causes storage activity or leaks a redirect/body.                                                                                | Denial precedes all delivery calls; authorized S3 media remains a private **307** whose TTL comes from runtime config and whose redirect cache is `private, max-age=0, must-revalidate`.    |
| B3  | Collapse base submission denial into the other routes' status.                                        | Existing client-visible status contract changes silently.                                                                                              | Submission ACL denial stays **403** for base delivery and **401** for preview/playback/HLS/events, matching the pre-target handlers.                                                        |
| B4  | In preview, authorize after Head/Get/presign, remove body/304 validators, or replace either fallback. | Foreign preview touches S3; valid thumbnails lose private caching/conditional GET; missing preview or failed body read no longer falls back correctly. | Door precedes preview storage; JPEG body/ETag/Last-Modified/private cache remain; missing preview redirects to `/api/media/{id}`; failed body read uses TTL-bound private presign fallback. |
| B5  | Return a presigned HLS master or omit progressive fallback from playback JSON.                        | Relative HLS artifacts escape the same-origin authenticated proxy, or unsupported/failed HLS cannot fall back.                                         | Descriptor keeps same-origin `/api/media/{id}/hls/master.m3u8` and MP4 `/api/media/{id}` fallback; downstream resolver is not called on denial.                                             |
| B6  | Run the HLS proxy when playback is disabled, trust an arbitrary artifact key, or discard `Range`.     | Disabled delivery still streams; an injected key reads an unrelated object; seeking/full segment delivery breaks.                                      | Disabled is **503**; untrusted/missing key is not delivered; valid range preserves 206/headers and invalid range preserves 416; denied access never calls the proxy.                        |
| B7  | Record playback telemetry before media authorization or for submission media.                         | An unauthorised UUID can create health data, or submission playback pollutes telemetry.                                                                | No access means zero event writes; submission returns the established skipped result without a write; an authorised normal event is recorded.                                               |

### C. Online-intake attachment URLs

| ID  | Fault planted or modeled                                                          | Wrong observable result / impact                                                       | Required oracle                                                                                          |
| --- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| C1  | Restore `s3PublicUrl` when private S3 configuration is absent.                    | A patient attachment receives a permanent public-bucket URL.                           | Missing/partial/misconfigured private config yields empty/null/misconfigured output, never a public URL. |
| C2  | Presign private intake attachments with a constant/unbounded lifetime.            | A doctor response exposes a URL beyond the configured security window.                 | Private config uses the runtime video-presign TTL.                                                       |
| C3  | Fold route org/patient authorization into URL building or remove that outer gate. | A correctly signed attachment URL is returned from an incorrectly scoped intake route. | Route authorization remains a separate outer gate (inspection plus existing route behavior).             |
| C4  | Log the object key, credentials, or signed URL on misconfiguration/failure.       | Secrets or stable storage identifiers enter logs.                                      | Logs contain only bounded classification/redacted failure data.                                          |

### D. Structural gate

| ID  | Fault planted or modeled                                                                                                                  | Wrong observable result / impact                                                               | Required oracle                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| D1  | Add a sixth `app/api` delivery route using the known direct delivery/repository primitives.                                               | A new public media path bypasses the door while CI remains green.                              | Gate exits non-zero; removing the fixture restores green.                                                                |
| D2  | Hide a forbidden primitive behind alias, relative import, dynamic import, namespace import, re-export shim, or a direct repository query. | A syntactic rename creates the same reachable bypass.                                          | Each reachable form covered by the gate's structural promise exits non-zero.                                             |
| D3  | Import `@/infra/s3/client` or raw AWS S3 SDK delivery operations directly from `modules/**` or `app/api/**`.                              | App/module code can deliver storage objects outside the single door.                           | Gate exits non-zero for direct infra client and raw SDK delivery paths.                                                  |
| D4  | Move copied ACL/repository delivery into a newly named app-layer helper.                                                                  | A route calls the helper and bypasses the door although the gate claims structural protection. | Finding only if this reachable new path passes the stated gate; no finding for a form outside the gate's actual promise. |
| D5  | Scan background preview generation, storage maintenance, upload/multipart, or delete/purge as if they were HTTP delivery.                 | Legitimate non-delivery code is blocked, encouraging exclusions or disabling the gate.         | These negative-control paths stay green.                                                                                 |
| D6  | Make the gate/self-test trivially green or stop invoking it from the webapp lint/CI path.                                                 | Structural protection disappears without a visible failure.                                    | Clean tree green, self-test proves red then green, and package/workflow wiring actually executes the gate.               |

## Fault injection results

| Fault                                                                                                            | Initial target protection                                                                                                              | Final audit oracle                                                                                                                                                                                               | Result                      |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Remove `authorizeMediaDelivery` from the HLS handler and continue with an allowed result.                        | **MISSED:** original route suite stayed green, 1 file / 5 tests.                                                                       | Added route acceptance; the same mutation now fails `stops HLS before settings and proxy work when the shared door refuses` (`200` received vs required `401`; proxy/settings assertions also become reachable). | **KILLED after audit test** |
| Retry `getMediaAccessRow(id, { allowPlatformBase: true })` when the explicit platform resolver returned `false`. | **MISSED:** original door suite stayed green, 1 file / 4 tests.                                                                        | Added the one-call oracle; the mutation now fails `returns not_found for a foreign or absent organization row...` (`getMediaAccessRow` called twice).                                                            | **KILLED after audit test** |
| Ignore the `program_item_submission` ACL in the common door.                                                     | Door suite failed: the other patient received `ok: true` instead of `{ ok: false, reason: 'forbidden' }`.                              | Existing `allows only the submission uploader or doctor/admin...`.                                                                                                                                               | **KILLED**                  |
| Return a permanent public URL when private online-intake S3 config is absent.                                    | Online-intake suite failed: `https://storage.test/public/media/request-1/file.pdf` received instead of the empty misconfigured result. | Existing `keeps the legacy misconfigured response empty...`.                                                                                                                                                     | **KILLED**                  |
| Weaken the gate by removing `getMediaAccessRow` from its forbidden primitive set.                                | `node scripts/check-media-delivery-chokepoint.mjs --self-test` exited **1** with `self-test failed`.                                   | Existing gate self-test.                                                                                                                                                                                         | **KILLED**                  |

All temporary product/tool mutations above were reversed by exact `apply_patch` operations. A final
`git diff --exit-code 72cbfa172 -- <four mutated product/tool paths>` returned **0**.

The audit extended the green behavior acceptance to 18 tests and added one intentionally red gate acceptance
file. The red test is not a product fix: it is the fixed oracle for the finding below.

## Exact diff/state inspection

### Target and scope

- `72cbfa172` is an ancestor of execution-tree `HEAD=5e93ca35b77dc4a3ac6da8c051ef0c7ce4445ca7`.
  `git log 72cbfa172..HEAD -- <all Ch2 product/tool paths>` was empty, so later feat sync did not alter this
  surface.
- Exact target diff: **15 files, +733/-94**. It adds one door, changes exactly the five named handlers, removes
  the online-intake public fallback, adds worker tests/report and one gate, and wires the gate into webapp lint.
- `rg -l "authorizeMediaDelivery" apps/webapp/src/app/api --glob 'route.ts' | ... | wc -l` → **5**.
  The five results are base, preview, playback, HLS and playback/events. Direct route imports of the three old ACL
  primitives after migration → **0**.
- Target diff paths matching `patient_files|patient-files|upload|multipart|mediaPreviewWorker|preview-worker|delete|purge`
  → **0**. No schema/migration, upload/multipart, preview-worker, storage cleanup/delete/purge or `patient_files`
  code was pulled into Ch2.

### Door and five handlers

- The door first performs the organization-principal-scoped `getMediaAccessRow(id)` query. A platform-base retry
  is conditional on `resolvePlatformLfkMediaAccess(id) === true`; its narrow result carries the row and the granted
  `allowPlatformBase` bit. Submission ACL is then applied through the existing
  `assertMediaPlaybackAccess`/`canAccessProgramSubmissionMedia` rule.
- The door behavior is green for ordinary same-org media, submission uploader, doctor and admin; another patient
  is forbidden; missing/foreign organization row is not found. New one-call acceptance proves the false platform
  resolver cannot trigger a privileged retry.
- Session and doctor-workspace/patient-business outer gates are unchanged in all five diffs and still wrap the
  door in the original principal context.
- Base delivery retains private **307**, runtime TTL presign and
  `Cache-Control: private, max-age=0, must-revalidate`. It maps common-door ACL denial to **403**; preview,
  playback, HLS and playback/events retain **401**.
- Preview retains JPEG body/ETag/Last-Modified/private cache, **307** original-media fallback, and TTL-bounded
  private presign fallback. Playback retains same-origin `/api/media/{id}/hls/master.m3u8` and protected
  `/api/media/{id}` MP4 fallback. HLS retains disabled **503**, door-before-proxy, and `Range` forwarding; the
  unchanged proxy still validates trusted artifact keys and maps range behavior. Playback/events performs no write
  on denial and retains submission telemetry skip.

### Online-intake

- `doctorIntakeDetailResponse.ts` no longer imports or calls `s3PublicUrl`; the scoped census is **0**.
  Private configuration uses `getVideoPresignTtlSeconds()` and `presignGetUrl`; absent private configuration keeps
  the prior empty URL plus bounded runtime error metadata `{ keyKind: 'media' }`.
- `GET /api/doctor/online-intake/[id]` is unchanged: doctor workspace gate → scoped service call under
  `withDoctorWorkspacePrincipal` → exact `organizationId` equality → response builder. URL building did not
  replace the outer authorization gate.
- No object key, credential or signed URL is passed to the misconfiguration logger by the changed module.

### Structural gate inspection

- Clean unmutated product tree: ordinary gate exit **0**. Built-in self-test exit **0**; weakening its named
  primitive set produced exit **1**. Package wiring is live:
  `root lint → apps/webapp lint → check-media-delivery-chokepoint.mjs`; `.github/workflows/ci.yml` runs
  root `pnpm lint`.
- Manual planted direct named, aliased named and relative named ACL imports each exit **1**. Direct exact
  `@/infra/s3/client` from a route exits **1**.
- The following reachable planted routes/modules exit **0**: dynamic ACL import, namespace ACL import, re-export
  shim, relative infra S3 import, raw AWS S3 SDK route, raw AWS S3 SDK module and a renamed app-layer helper that
  queries the org row then presigns without submission ACL.
- The permanent acceptance reports exactly those **7 misses**. Its upload/background-delete negative control is
  green, so the required non-delivery paths are not the reason for the red result.

## Commands and counts

| Command / check                                                                                                                   | Exact result                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm --dir apps/webapp exec vitest run authorize... resolve... mediaDeliveryChokepoint.route... doctorIntake...` on worker tests | **PASS: 4 files, 12 tests**                                                                                                                                                                                                    |
| Same four files after audit acceptance additions                                                                                  | **PASS: 4 files, 18 tests**                                                                                                                                                                                                    |
| `pnpm --dir apps/webapp exec vitest run src/app-layer/media/mediaDeliveryChokepointGate.unit.test.ts`                             | **EXPECTED RED: 1 file; 1 failed, 1 passed; 7 bypass forms named**                                                                                                                                                             |
| Final combined targeted run after formatting                                                                                      | **EXPECTED RED: 5 files; 1 failed, 4 passed; 1 failed, 19 passed tests**                                                                                                                                                       |
| `node scripts/check-media-delivery-chokepoint.mjs --self-test`                                                                    | **PASS** on target; weakened fault exits **1**                                                                                                                                                                                 |
| `node scripts/check-media-delivery-chokepoint.mjs`                                                                                | **PASS** clean; planted matrix results recorded above                                                                                                                                                                          |
| Four workspace package builds needed for local type resolution                                                                    | **PASS: 4/4** (`db-principal`, `operator-db-schema`, `platform-merge`, `error-tracking`)                                                                                                                                       |
| `pnpm --dir apps/webapp typecheck` after those builds                                                                             | **PASS**                                                                                                                                                                                                                       |
| `pnpm --dir apps/webapp exec eslint <12 Ch2 product/test paths>`                                                                  | **PASS**                                                                                                                                                                                                                       |
| `pnpm --dir apps/webapp lint`                                                                                                     | **FAIL before media gate**: unrelated frozen raw-SQL manifest violation in `src/infra/repos/saasBillingTariffSnapshot.devDbProof.test.ts` (20 reported locations); two unrelated unused-disable warnings. No Ch2 ESLint error. |
| `git show --check --oneline 72cbfa172 --`                                                                                         | **PASS**                                                                                                                                                                                                                       |
| `git diff --check`                                                                                                                | **NOT RUNNABLE AS A WHOLE:** Git cannot hash pre-existing character-special `.env.example` (`unsupported file type`).                                                                                                          |
| `git diff --check -- <all audit-owned tests/report>`                                                                              | **PASS**                                                                                                                                                                                                                       |

No full CI was run, per brief.

## Findings and verdict

### MUST FIX G1 — the gate promises a single structural door but accepts reachable new delivery paths

**Reachable scenario:** add an authenticated patient media route that imports a newly named app-layer helper. The
helper calls the existing org-scoped `getMediaAccessRow(id)` and `presignGetUrl`, but omits the submission ACL. A
different patient in the same organization who presents the submission UUID receives its signed object. The
planted route is ordinary valid application code and `check-media-delivery-chokepoint` exits **0**. The same gate
also exits **0** for raw SDK delivery, so an even wider storage bypass is structurally expressible.

**Impact:** the next sixth handler can return another patient's submission or storage object while the promised
CI chokepoint remains green. This is the exact silent regression Ch2 exists to make impossible.

**Violated requirement:** authority Ch2 and `AGENTS.md` §5 require one common pass plus a mechanical check that
fails attempts to go around it; the audit request additionally requires
namespace/dynamic/re-export/relative/raw-SDK bypass resistance. The gate's own failure message says HTTP media
routes must use `authorizeMediaDelivery`, but it never enforces that property.

**Fixed oracle:** `apps/webapp/src/app-layer/media/mediaDeliveryChokepointGate.unit.test.ts` is red on the target
and names all seven accepted bypass forms. Product/tool fix is intentionally not made by the auditor.

## Verdict

**FAIL.** The five migrated handlers and online-intake change satisfy their inspected/behavioral contracts, but the
mandatory structural protection does not. Ch2 checkbox remains open; no audit commit is created for a FAIL.

**НЕ ПРОВЕРЕНО:** live S3/MinIO and PostgreSQL/RLS behavior; DEV/TEST/PROD/server/deploy;
`patient_files` runtime regression (inspection only because it is outside target diff); full webapp lint completion
beyond the unrelated earlier raw-SQL gate failure; full unscoped `git diff --check` beyond the pre-existing
character-device blocker; full CI (explicitly not required).
