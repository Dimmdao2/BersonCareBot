# FIO / Identity Cleanup Log

## 2026-07-19 — TEST Manifest Apply/rollback And Clean-Dump Binding

- Reclassified taskdb `#849` as historical TEST evidence: the 2026-07-18 fresh production-dump restore replaced the
  prior 165-row TEST result; production still has no FIO apply.
- Added a TEST-only hash-bound owner-manifest preview/apply/rollback entrypoint using the shared Drizzle port.
- Manifest exceptions are exact: the known missing identity is pinned by ID and the changed-after-review identity is
  pinned to its exact preserved state. Any unlisted or later drift fails closed.
- Apply verifies exact loopback `bersoncarebot_test`, locks rows, writes a unique durable mode `0600` rollback artifact
  before the first conditional update, and emits aggregate-only output. Rollback refuses rows changed after apply.
- Bound this entrypoint into the owner-confirmed full clean-dump TEST chain after Rubitime/history normalization and
  before fixtures/service restart. No DB, TEST deploy, production operation, or PII artifact read was performed in
  this repository change.

## 2026-07-18 — Owner Review TEST Apply And Residual Scope

- Confirmed that the structured FIO core commits are already ancestors of `feat/doctor-ui-rebuild`; there is no
  separate committed FIO branch left to merge.
- Taskdb `#849` records the owner-reviewed TEST apply. Aggregate result:
  - 165 rows updated;
  - 3 rows already matched;
  - 1 missing row skipped;
  - 1 row changed after review and was not overwritten.
- Production backfill has not been executed.
- The authoritative owner-review workbook, its local CSV projection, and TEST before/after audit remain ignored
  local PII artifacts. Their rows are not reproduced in repository documentation. A future production apply must
  verify the exact artifact, build a current preview, and receive a separate owner approval; parser guesses may not
  replace reviewed decisions.
- Reopened the initiative through residual phases without changing owner-only acceptance of historical task `#24`:
  structured patient/specialist registration writers, remaining provider writers, display cleanup, production
  closeout, legacy fallback audit, and runtime parser retirement.
- Residual task mapping: `#855` = structured registrations (Phase 6); `#856` = writers/provider priority + display
  (Phases 7-8); `#857` = owner-gated production closeout (Phase 9); `#858` = legacy audit + runtime parser retirement
  (Phases 10-11). Task `#849` remains historical TEST apply evidence only; it does not describe the post-reset TEST.
- Moved booking lifecycle notification templates out of the FIO completion gate into the notification workstream.
- Four uncommitted helper scripts found in the old worktree are not treated as a mergeable branch. They require a
  separate safety decision before integration because the draft apply flow does not fully enforce current-preview
  approval, stale-row protection, pre-commit rollback durability, and PII-free output.
- Independent read-only safety audit: agent-port run `bcb-fio-integration-audit-20260718b` (`gpt-5.6-terra`, high),
  verdict verified; none of the four draft helpers is safe to integrate unchanged.

## 2026-07-02 — Backfill Infrastructure

- Added local-only Zenodo dataset downloader:
  `apps/webapp/scripts/fio-backfill/download-russiannames-dataset.mjs`.
- Added runbook:
  `apps/webapp/scripts/fio-backfill/README.md`.
- Added webapp npm script:
  `pnpm --dir apps/webapp run fio:download-russiannames`.
- Downloaded and extracted the JSONL dataset locally under:
  `.tmp/fio-backfill/russiannames/jsonl/`.
- Verified MD5 checksum from the Zenodo record:
  `10b4bf03e1eea33f72d4284fd2a582b9`.
- Added initiative plan:
  `docs/FIO_IDENTITY_CLEANUP_INITIATIVE/README.md`.

No product behavior changes and no DB writes were made.

## 2026-07-02 — Master Plan Tightening

- Reworked `.cursor/plans/fio_identity_cleanup.plan.md` into an executable
  senior-agent master plan with phase gates, scope boundaries, exact artifacts,
  and targeted validation per phase.
- Synchronized this README with the same phase order.
- Explicitly documented that full `pnpm run ci` is not a per-phase default; use
  targeted checks unless preparing an explicit push or touching repo-wide
  contracts.

## 2026-07-02 — Phase 1 Source Audit

- Added read-only source audit:
  `apps/webapp/scripts/fio-backfill/audit-fio-sources.ts`.
- Added webapp npm script:
  `pnpm --dir apps/webapp run fio:audit-sources`.
- Generated local PII-containing reports under:
  `.tmp/fio-backfill/reports/`.
- Latest aggregate dev result:
  - active client rows: 213;
  - missing all structured names: 89;
  - first + last only: 124;
  - first + last + patronymic: 0;
  - legacy display one token: 29;
  - legacy display two tokens: 120;
  - legacy display three+ tokens: 64;
  - legacy display Latin/mixed: 34;
  - users with booking/profile conflicts: 78;
  - verified-email users: 24;
  - booking rows missing email while profile email is verified: 55.
- Validation:
  `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec eslint scripts/fio-backfill/audit-fio-sources.ts"`;
  `bash /home/dev/orch/run-tests.sh "bash -lc 'set -a && source apps/webapp/.env.dev && set +a && pnpm --dir apps/webapp run fio:audit-sources'"`.

No DB writes were made.

## 2026-07-02 — Phase 4 Booking Form Contract

- Updated patient booking confirm UI to collect:
  - surname (`lastName`) — required;
  - given name (`firstName`) — required;
  - patronymic — optional.
- Prefills phone from session and email from profile email fields.
- Keeps compatibility by deriving legacy `contactName` as
  `Фамилия Имя Отчество`.
- Added optional API/domain `contactFio` alongside `contactName`.
- Canonical booking form prefill now exposes `first_name`, `last_name`, and
  `patronymic` when structured FIO is provided.
- `booking.created` event payload and canonical appointment attribution include
  `contactFio` when present.
- Validation:
  `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/app/patient/booking/new/confirm/ConfirmStepClient.test.tsx src/app/app/patient/booking/new/confirm/confirm-page.test.ts src/modules/patient-booking/createInputValidation.test.ts --project=fast"`;
  `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec eslint src/app/app/patient/booking/new/confirm/page.tsx src/app/app/patient/booking/new/confirm/ConfirmStepClient.tsx src/app/app/patient/booking/new/confirm/ConfirmStepClient.test.tsx src/app/app/patient/cabinet/useCreateBooking.ts src/app/api/booking/create/route.ts src/modules/patient-booking/types.ts src/modules/patient-booking/ports.ts src/modules/patient-booking/createInputValidation.ts src/modules/patient-booking/createInputValidation.test.ts src/modules/patient-booking/inPersonApiSchemas.ts src/modules/patient-booking/canonicalCreate.ts src/modules/patient-booking/service.ts"`.

## 2026-07-02 — Phase 5 Merge And Projection Priority

- Changed projection update SQL so weak display-only inputs fill only empty
  `display_name`; structured first+last projection remains a strong source.
- Added repo test that guards this SQL behavior.
- Added `patronymic` preservation to `@bersoncare/platform-merge` merge SQL.
- Added patronymic effective-value helper and preview scalar support.
- Validation:
  `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/infra/repos/pgUserProjection.repo.test.ts src/infra/repos/autoMergeScalarEffective.test.ts src/infra/platformUserMergePreview.test.ts --project=fast"`;
  `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec eslint src/infra/repos/pgUserProjection.ts src/infra/repos/pgUserProjection.repo.test.ts src/infra/repos/autoMergeScalarEffective.ts src/infra/repos/autoMergeScalarEffective.test.ts src/infra/platformUserMergePreview.ts src/infra/platformUserMergePreview.test.ts"`;
  `bash /home/dev/orch/run-tests.sh "pnpm --dir packages/platform-merge run typecheck"`.

## 2026-07-02 — Phase 2 Shared FIO Parser

- Added shared typed FIO helper:
  `apps/webapp/src/shared/lib/fio.ts`.
- Added focused tests:
  `apps/webapp/src/shared/lib/fio.test.ts`.
- Covered canonical Russian FIO, non-canonical first-patronymic-last order,
  two-token names, one-token provider names, Latin provider hints, hyphenated
  names, patronymic suffix recognition, conflict selection, and display labels.
- Runtime helper does not read `.tmp` dictionaries. Backfill tooling can pass
  name/patronymic dictionaries explicitly.
- Validation:
  `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/shared/lib/fio.test.ts --project=fast"`;
  `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec eslint src/shared/lib/fio.ts src/shared/lib/fio.test.ts"`.
- Note: an initial `pnpm --dir apps/webapp test -- src/shared/lib/fio.test.ts`
  invocation was stopped because it selected broader tests than intended.

## 2026-07-02 — Phase 3 Backfill Dry Run

- Added dry-run-only proposal script:
  `apps/webapp/scripts/fio-backfill/backfill-platform-user-fio.ts`.
- Added webapp npm script:
  `pnpm --dir apps/webapp run fio:backfill-dry-run`.
- The script refuses `--commit`; Phase 3 has no DB write path.
- Generated local PII-containing reports under:
  `.tmp/fio-backfill/reports/`.
- Latest aggregate dev result:
  - total users: 213;
  - users with candidates: 213;
  - no change: 43;
  - fill missing: 9;
  - replace weak partials: 24;
  - review conflict: 65;
  - insufficient: 72;
  - selected high confidence: 139;
  - selected medium confidence: 2;
  - selected low confidence: 70;
  - selected source Rubitime: 141;
  - selected source display_name: 67;
  - selected source profile_structured: 3;
  - selected none: 2.
- Validation:
  `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec eslint scripts/fio-backfill/backfill-platform-user-fio.ts src/shared/lib/fio.ts"`;
  `bash /home/dev/orch/run-tests.sh "bash -lc 'set -a && source apps/webapp/.env.dev && set +a && pnpm --dir apps/webapp run fio:backfill-dry-run'"`.

No DB writes were made.
