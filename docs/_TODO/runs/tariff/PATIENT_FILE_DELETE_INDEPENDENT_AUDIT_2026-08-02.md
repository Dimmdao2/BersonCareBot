# Patient file deletion — independent audit

Candidate product commit: `61fa02ef1`.

Authority: `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5.5 and the
owner brief for this consolidation pass. Scope: an authorized clinic doctor can delete the
clinic's patient file, the canonical row and object lifecycle remain consistent, quota bytes are
released, another organization/patient cannot be crossed, and the UI cannot report success after
a failed operation. Product code was not changed.

## Verdict: FAIL

### MUST FIX — deleting a patient file can silently break a material that uses its library object

Reachable scenario:

1. A patient-file upload with a folder creates both `patient_files` and the linked
   `media_files` row. The patient UI explicitly labels it `В библиотеке`.
2. The clinic selects that media row in the existing material picker; the material persists
   `/api/media/<mediaFileId>`.
3. The doctor deletes the same file from the patient card.
4. `DELETE /api/doctor/patients/[userId]/files/[fileId]` calls
   `patientFiles.deleteFile()` directly. The repository sets the linked media row to
   `pending_delete` and deletes `patient_files`, without calling the existing media usage check.
5. The shared purge deletes the S3 object before deleting `media_files`. Textual material URLs do
   not provide a database constraint, so the purge succeeds and the previously working material
   now points to a deleted object.

Impact: one ordinary confirmation in the patient card can remove an object that is still used by
clinic content. The UI says only that the file disappears from the patient card and storage; it
does not disclose the detected uses or require the existing `confirmUsed` decision. This violates
the required consistent deletion/no collateral breakage boundary and is a concrete data-loss
path, not optional hardening.

Evidence in the candidate:

- `pgPatientFiles.deleteFile()` stages `media_files.status = pending_delete` and deletes the
  canonical patient row without a usage query.
- The ordinary media delete route already calls `deps.media.findUsage(id)` and returns
  `409 media_in_use` unless `confirmUsed=true`.
- `MediaLibraryPickerDialog` and the shared picker persist `/api/media/<id>` references, and
  `s3MediaStorage.findUsage()` searches those references in materials.
- `purgePendingMediaDeleteBatch()` deletes S3 keys before its `DELETE FROM media_files`; material
  URL references are textual and therefore cannot stop the object deletion.

Required product correction: reuse the existing media usage boundary before staging deletion.
When uses exist, do not claim deletion succeeded without the same explicit used-media decision
and a UI that shows the consequence. Do not add a second usage model.

## Passed boundaries

- API authentication and organization/patient lookup return `404` before deletion for a patient
  outside the current organization.
- Repository reads and deletes are organization-scoped under the doctor workspace principal; the
  current schema/RLS boundary remains in place.
- The patient-row removal and creation/staging of a retryable media lifecycle row occur in one
  Drizzle mutation transaction, including legacy patient rows without `media_file_id`.
- Removing `patient_files` immediately removes its bytes from the existing live quota sum; object
  deletion remains retryable through the shared pending-delete purge.
- The UI keeps the confirmation open and shows an error after a non-success response; it only
  removes local state after `{ ok: true }`.
- Existing GET/PATCH behavior was not changed by the product commit.

## Commands and results

```bash
pnpm --dir apps/webapp exec vitest run src/app/app/doctor/patients/'[userId]'/tabs/PatientTabFiles.ui.test.tsx src/app/api/tariffMechanics.route.test.ts src/infra/repos/inMemoryPatientFiles.test.ts src/infra/repos/s3MediaStorage.lifecycle.unit.test.ts src/app-layer/entitlements/protectedActionRegistryCoverage.unit.test.ts
# 5 files passed, 44 tests passed; exit 0

pnpm --dir apps/webapp typecheck
# exit 0

node /home/dev/brain/tools/code-search.mjs "deleteHard getUsageSummary media delete usage" --repo bcb -k 15
# located the canonical usage boundary and delete route; exit 0

rg -n "findUsage\\(|media_in_use|MediaPicker|/api/media/" apps/webapp/src/app/app/doctor/content apps/webapp/src/shared/ui/doctor apps/webapp/src/app/app/doctor
# confirmed the reachable picker/reference path; exit 0
```

No DEV, TEST, PROD, database, migration, S3 object, Track D branch, integration branch, or product
code was changed. No second audit cycle is required: one fixer should address this finding and run
the same targeted behavior set plus a regression for the in-use path.
