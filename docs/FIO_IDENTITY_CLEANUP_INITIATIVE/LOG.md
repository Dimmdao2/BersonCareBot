# FIO / Identity Cleanup Log

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
