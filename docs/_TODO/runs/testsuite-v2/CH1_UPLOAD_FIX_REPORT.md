# Ч1 — fix report по независимому audit `d2ff0858f` (#1082)

## Scope и authority

Worker fix-round поверх product `e94b3069d` и audit/tests `d2ff0858f`. Закрыты только F1–F4 из
`CH1_UPLOAD_BLIND_AUDIT_REPORT.md`; Ч1б cleanup, DB/DEV/TEST/PROD, deploy, migration, новая таблица,
новый upload-service и push не выполнялись.

## Исходный oracle

- `uploadDoorAcceptance.route.test.ts`: 3 red из 23 — incompatible extension, empty proxy filename,
  proxy folder boundary до intent refusal.
- `mediaUploadDoorGate.unit.test.ts`: 8 red из 14 — raw re-export/wrapper, pending/ready direct paths,
  adapter bypasses, forged mark и comment marker.

## Исправления

| Finding | Закрытие                                                                                                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1      | Closed MIME-to-extension policy rejects empty, path-like and incompatible filenames before side effects; proxy no longer substitutes `upload`.                                                                                                          |
| F2      | Proxy validates metadata intent for every file before `buildAppDeps`, folder existence/assignability and any storage write.                                                                                                                             |
| F3      | `ReceivedUpload` is a private `WeakSet` runtime capability created only by received validation. All ready boundaries, including proxy storage and patient-file/multipart paths, assert it; the AST gate rejects forged casts and direct bypass classes. |
| F4      | `check-media-upload-door.mjs` now parses executable AST structure, self-tests its bypass fixtures, and runs both normal and `--self-test` modes through `apps/webapp` lint (therefore root lint/CI).                                                    |

## Verification

All commands were run on the final product tree:

- `pnpm --dir apps/webapp exec vitest run --project=route src/modules/media/uploadDoorAcceptance.route.test.ts` — PASS, 23/23.
- `pnpm --dir apps/webapp exec vitest run --project=unit src/modules/media/mediaUploadDoorGate.unit.test.ts` — PASS, 14/14.
- `pnpm --dir apps/webapp exec vitest run --project=fast src/modules/media/uploadValidation.test.ts` — PASS, 4/4.
- `pnpm --dir apps/webapp exec vitest run --project=ui 'src/app/app/doctor/patients/[userId]/tabs/PatientTabFiles.ui.test.tsx'` — PASS, 4/4.
- `pnpm --dir apps/webapp exec vitest run --project=unit src/infra/s3/s3UploadPrefix.unit.test.ts` — PASS, 1/1.
- `node apps/webapp/scripts/check-media-upload-door.mjs --self-test` — PASS.
- `pnpm --dir apps/webapp typecheck` — PASS.
- Targeted ESLint on all changed upload/gate paths — PASS.
- `node scripts/check-test-runner-visibility.mjs` — PASS.
- `pnpm --dir apps/webapp lint` — PASS, including canonical gate and self-test.
- Scoped `git diff --check` — PASS.

## Not performed

No PostgreSQL runtime/rollback or quota-concurrency proof, no live S3/browser/DEV validation, no storage cleanup
from Ч1б, no deploy and no push. Full repository CI was not required or run for this bounded webapp fix-round.
