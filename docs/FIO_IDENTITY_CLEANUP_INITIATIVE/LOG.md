# FIO / Identity Cleanup Log

## 2026-07-19 — Owner sequencing: FIO backfill only inside final production cutover

- The current production system is materially older than the new SaaS/FIO model; a standalone FIO backfill into
  that runtime is explicitly forbidden.
- Phase 9 is deferred until commercial, SaaS/tenant and legal/readiness launch gates are complete and the full
  migration chain has been rehearsed repeatedly on TEST from a fresh copy.
- At the final cutover, FIO remains a hash-bound, separately approved ordered step with fresh preview, backup,
  durable rollback and reconciliation. This decision does not authorize production access or mutation now.
- Phase 10/11 parser retirement remains downstream of the successful production reconciliation.
- A parallel owner-directed agent owns the legal-compliance documentation plan; this FIO entry records sequencing
  only and does not duplicate or modify that plan's scope.

## 2026-07-19 — C2F Patient Public Email-OTP Registration

- Added a separate public patient email-registration start flow: required normalized `last_name` + `first_name`,
  optional `patronymic`, and a derived compatibility `display_name`; it creates only an unverified `client`
  `platform_users` identity and creates no organization, membership, specialist, enrollment, clinic, or booking data.
- Ordinary `/api/auth/email-otp/start` is now lookup-only. Unknown email addresses receive the existing generic
  success shape without a new identity or delivery; already-issued historical challenges continue through the
  unchanged confirmation lookup/session path.
- Pending structured registrations can resend without rewriting their identity fields; verified, non-client, and
  legacy unstructured pending duplicates fail closed. A delivery failure rolls back only the identity created by
  that request.
- Added the forward function-only migration, journal entry, public-bootstrap overlay, base-login grants, and grant
  checker coverage for the narrow SECURITY DEFINER accessors. No DB, TEST, production, deploy, env, or delivery
  operation was performed.

## 2026-07-19 — C2F Owner-Unambiguous Structured Registration Foundation

**Historical note:** the final two bullets of this entry describe the intermediate state before the separate public
patient email-registration flow above was integrated. They are superseded by the lookup-only ordinary OTP contract
and structured registration closure; they are retained only as execution history and are not current blockers.

- Updated the owned compatibility `POST /api/auth/email-password/register` contract and the shared
  password-credentials port to require normalized `lastName` + `firstName`, accept optional `patronymic`, and
  write only the derived `display_name` together with the existing structured `platform_users` columns through
  `app.email_password_register_pending`.
- Specialist/clinic signup now collects structured specialist FIO, derives the unchanged
  `specialistFullName` compatibility/provisioning label with the shared formatter, and keeps
  `organizationTitle` separate. `specialist_signup_intents`, its Drizzle schema, port, service, and PostgreSQL
  repository remain structurally unchanged.
- Added a function-only forward migration plus journal entry and updated the public-bootstrap overlay, base-login
  grant artifact, and signature checker for the six-argument SECURITY DEFINER function. No table or column was
  added.
- The pending-registration storage stores structured fields. Old `sessionStorage` entries with a display label are
  retained only for confirmation of their existing challenge; they are not parsed and cannot resend through the new
  structured API.
- Focused route/repository/UI/provisioning tests, webapp typecheck, scoped ESLint, Drizzle journal/frozen checks,
  and affected grant/protocol checkers passed locally. No DB, TEST, production, deploy, or real delivery action was
  performed.
- Historical intermediate state (superseded): at this point live patient `/api/auth/email-otp/start` still could
  create an unknown identity without structured FIO. The later separate structured registration flow and lookup-only
  ordinary OTP contract above closed this gap.

## 2026-07-19 — Owner-reviewed TEST Apply Re-established After Fresh Restore

- Applied the exact hash-bound owner-reviewed manifest to the prepared `bersoncarebot_test` after canonical
  Rubitime/history normalization and before restarting writers.
- Aggregate result: `165` updated, `3` already matched, `1` expected missing, `1` preserved at its reviewed
  current state, `0` unexpected missing and `0` unexpected drift.
- A unique private rollback artifact was written with mode `0600` and fsynced before the first conditional update.
  Manifest rows, names and other PII were not printed or copied into repository documentation.
- Temporary TEST owner membership and `BYPASSRLS` were removed immediately after apply and independently asserted
  absent. Production was not accessed or changed.
- This restores the TEST evidence lost when the earlier TEST snapshot was replaced. It does not close production
  task `#857`, registrations/writers `#855/#856`, or parser retirement `#858`.

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

## 2026-07-19 — Phases 7-8 Remaining Writers And Display Cleanup

- Integrated structured writer priority and display cleanup at `c8492fec5`.
- Telegram/MAX hints now fill empty structured fields without replacing existing strong FIO.
- Doctor/manual edit paths derive the compatibility `display_name`; doctor labels use full structured FIO with
  legacy fallback, while patient profile and booking prefill prefer patient-facing structured fields.
- Validation passed: focused integrator writer tests, changed webapp matrix, scoped lint, integrator/webapp
  typecheck, and `git diff --check`. Full CI was not repeated because the previous C2F milestone was green and the
  next full run remains reserved for the next milestone.
- Independent audit `bcb-c2f-856-audit-20260719`: PASS, safe to integrate, no P0/P1.
- Deferred P2 debt for the final report/legacy audit: messenger projection and pre-bind merge may still make
  compatibility `display_name` disagree with preserved structured FIO; the patient shell legacy fallback is not yet
  consolidated on the profile helper; several source-scan tests can be hardened later.
- Owner question for Phase 10: when Telegram/MAX supplies a different name for the same existing row, is silently
  preserving strong FIO plus manual edit/merge preview sufficient, or is a new visible conflict indicator required?
- No DB, TEST, production, deploy, migration, backfill, PII artifact, or real delivery action was performed.
