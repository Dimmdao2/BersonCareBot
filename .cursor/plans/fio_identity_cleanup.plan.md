---
name: FIO Identity Cleanup
overview: Execution plan for structured identity writers, FIO display cleanup, owner-gated production backfill, legacy audit, and runtime parser retirement.
isProject: true
todos:
  - id: fio-0
    content: Prepare local backfill infrastructure and Zenodo dataset runbook.
    status: completed
  - id: fio-1
    content: Inventory all current name readers/writers and produce read-only dev DB quality report.
    status: completed
  - id: fio-2
    content: Implement shared typed FIO model and parser/scorer using local dictionaries, with focused unit tests.
    status: completed
  - id: fio-3
    content: Build dry-run backfill report from Rubitime/booking/profile/provider sources; no DB writes.
    status: completed
  - id: fio-4
    content: Update booking form contract to collect surname/given/patronymic and prefill phone/email.
    status: completed
  - id: fio-5
    content: Update merge/projection/OAuth/messenger priority so stronger FIO sources cannot be overwritten.
    status: completed
  - id: fio-6
    content: Make patient email and specialist/clinic registrations write structured FIO and derived display_name.
    status: completed
  - id: fio-7
    content: Audit/correct remaining manual, booking, provisioning, OAuth, Telegram, and MAX writers.
    status: completed
  - id: fio-8
    content: Move doctor and patient displays to structured FIO helpers while keeping display_name compatibility.
    status: completed
  - id: fio-9
    content: Run current-preview and separately owner-approved FIO step only inside the final platform production cutover; TEST evidence was re-established on 2026-07-19.
    status: pending
  - id: fio-10
    content: After final production reconciliation, audit active legacy rows and all consumers that parse display_name into FIO.
    status: pending
  - id: fio-11
    content: Retire runtime parser fallback only after registration, production, and legacy-audit gates pass.
    status: pending
---

# FIO Identity Cleanup

Owner requirements authority: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md` §19.

Initiative overview/status: `docs/FIO_IDENTITY_CLEANUP_INITIATIVE/README.md`.

## Execution Principle

This plan is written for senior-agent execution in this repository, not for blind batch work. I will keep phase gates tight, inspect the real code before each change, and use targeted validation. Full `pnpm run ci` is reserved for explicit push/pre-push requests or repo-wide risk, not for each phase.

The work is intentionally ordered so product behavior changes happen only after the name sources and parser are understood.

## Definition of Done

- [x] Local-only dataset infrastructure exists and does not commit Zenodo data.
- [x] Name readers/writers are inventoried and documented.
- [x] A single typed FIO model handles normalization, parsing, confidence, and labels.
- [x] Dry-run report proves which users can be safely backfilled.
- [x] Booking form collects surname and given name as required fields and prefills known phone/email.
- [x] Merge/OAuth/messenger paths cannot overwrite stronger booking/manual FIO.
- [x] Owner-reviewed backfill was transactionally applied and checked on TEST only.
- [x] Patient email registration writes required `last_name` + `first_name`, optional `patronymic`, and derives
      `display_name`.
- [x] Specialist/clinic registration writes structured specialist FIO without mixing it with organization name.
- [x] Every remaining writer/provider path preserves strong structured FIO against weaker provider overwrites;
      the optional new visible same-row conflict indicator remains a Phase 10 owner decision.
- [x] Doctor surfaces use full FIO; patient surfaces use first name.
- [ ] Production backfill has current-copy preview, explicit owner approval, transactional apply, rollback artifact,
      post-apply audit, and UI spot-check.
- [ ] Active consumers no longer require `display_name -> FIO` parsing; only then is the runtime parser fallback
      removed with regression tests.

Booking lifecycle notification templates are a separate notification workstream and do not block structured
identity completion.

## Scope

Allowed:

- `apps/webapp/scripts/fio-backfill/**`
- `docs/FIO_IDENTITY_CLEANUP_INITIATIVE/**`
- `.cursor/plans/fio_identity_cleanup.plan.md`
- later phase-specific code under:
  - `apps/webapp/src/lib/**` or a more appropriate existing shared/module location for FIO helpers
  - `apps/webapp/src/modules/patient-booking/**`
  - `apps/webapp/src/modules/integrator/**`
  - `apps/webapp/src/modules/auth/**`
  - `apps/webapp/src/infra/platformUserMergePreview.ts`
  - `packages/platform-merge/**`
  - `apps/webapp/src/modules/doctor-clients/**`
  - `apps/webapp/src/app/app/patient/**`
  - `apps/webapp/src/modules/booking-notifications/**`
  - `apps/integrator/src/integrations/rubitime/**`

Out of scope unless explicitly added later or opened by the named owner gate:

- production DB writes before the Phase 9 owner gate;
- removing `display_name` from schema;
- committing downloaded or derived large dictionary files;
- multi-tenant identity policy;
- unrelated patient profile redesign;
- real external sends from dev/test outside documented delivery redirect.

## Phase 0 — Prepared Infrastructure

Status: completed.

Artifacts:

- `apps/webapp/scripts/fio-backfill/download-russiannames-dataset.mjs`
- `apps/webapp/scripts/fio-backfill/README.md`
- `docs/FIO_IDENTITY_CLEANUP_INITIATIVE/README.md`
- `docs/FIO_IDENTITY_CLEANUP_INITIATIVE/LOG.md`
- `.tmp/fio-backfill/russiannames/jsonl/{names,midnames,surnames}.jsonl`

Validation already run:

- downloader MD5 verification against Zenodo checksum;
- `node --check` for downloader;
- `pnpm --dir apps/webapp run fio:download-russiannames`.

Gate:

- dataset is local-only and ignored by git.
- no DB writes and no product behavior changes.

## Phase 1 — Inventory And Data Quality Report

Goal:

Establish the real state before touching behavior.

Status: completed.

Actions:

- Map all runtime readers/writers of:
  `display_name`, `first_name`, `last_name`, `patronymic`, `email`, `email_verified_at`, `contact_name`, `payload.name`.
- Inspect, at minimum:
  - `platform_users` schema and repos;
  - patient booking create/reschedule flow;
  - Rubitime appointment projection and M2M lifecycle payloads;
  - OAuth login/merge paths;
  - Telegram/MAX session exchange and bind paths;
  - doctor clients list/card;
  - patient shell/profile/greeting.
- Add `apps/webapp/scripts/fio-backfill/audit-fio-sources.ts` as read-only tooling.
- Emit reports under `.tmp/fio-backfill/reports/`:
  - `name-field-inventory.md`;
  - `fio-quality-report.json`;
  - `fio-quality-report.csv`.

Report metrics:

- active client count;
- missing structured name count;
- one-token/two-token/three-plus-token legacy names;
- Cyrillic vs Latin/mixed names;
- Rubitime full-name candidates by user/phone;
- conflicts between Rubitime/booking and profile fields;
- users with profile phone/email not prefilling booking;
- verified email candidates for booking-created email.

Validation:

- Run only syntax/type checks needed for the script.
- If script imports app code, run targeted script/unit tests through `/home/dev/orch/run-tests.sh`.
- No full CI.

Gate:

- I can state exact current writers and risky overwrite paths.
- No DB writes.

Artifacts:

- `apps/webapp/scripts/fio-backfill/audit-fio-sources.ts`
- `.tmp/fio-backfill/reports/name-field-inventory.latest.md`
- `.tmp/fio-backfill/reports/fio-quality-report.latest.json`
- `.tmp/fio-backfill/reports/fio-quality-report.latest.csv`

Latest aggregate result from dev DB, generated 2026-07-02:

- active client rows: 213
- missing all structured names: 89
- first + last only: 124
- first + last + patronymic: 0
- legacy display one token: 29
- legacy display two tokens: 120
- legacy display three+ tokens: 64
- legacy display Latin/mixed: 34
- users with booking/profile name conflicts: 78
- verified-email users: 24
- booking rows missing email while profile email is verified: 55

Validation run:

- `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec eslint scripts/fio-backfill/audit-fio-sources.ts"`
- `bash /home/dev/orch/run-tests.sh "bash -lc 'set -a && source apps/webapp/.env.dev && set +a && pnpm --dir apps/webapp run fio:audit-sources'"`

## Phase 2 — Shared FIO Model, Parser, And Scoring

Goal:

Create one typed place for name decisions before changing consumers.

Status: completed.

Actions:

- Add a shared FIO module in the narrowest existing appropriate location.
- Define strict types:
  - `StructuredFio`;
  - `FioSource`;
  - `FioConfidence`;
  - `FioCandidate`;
  - `FioDecision`.
- Implement:
  - normalization and casing for Russian name parts;
  - doctor full-FIO label;
  - patient greeting label;
  - candidate parser using token position plus Zenodo `names.jsonl` and `midnames.jsonl`;
  - scorer that favors booking/Rubitime/manual over provider hints;
  - conflict reason codes.
- Do not make the app read dataset files at runtime. Dataset stays script-only; runtime helper must work without `.tmp`.

Validation:

- Unit tests for:
  - `Иванов Иван Иванович`;
  - `Карина Викторовна Прокопенкова` order ambiguity;
  - two-token names;
  - one-token Telegram/OAuth names;
  - Latin provider names;
  - hyphenated names;
  - patronymic recognition;
  - conflicting candidates.
- Targeted `pnpm --dir apps/webapp test -- <new test file>` through `/home/dev/orch/run-tests.sh`.
- Targeted webapp typecheck if exported types are consumed.

Gate:

- Parser can explain confidence and conflict, not just return guessed fields.

Artifacts:

- `apps/webapp/src/shared/lib/fio.ts`
- `apps/webapp/src/shared/lib/fio.test.ts`

Validation run:

- `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/shared/lib/fio.test.ts --project=fast"`
- `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec eslint src/shared/lib/fio.ts src/shared/lib/fio.test.ts"`

Note:

- A first attempt with `pnpm --dir apps/webapp test -- src/shared/lib/fio.test.ts` was stopped because it selected more than the intended file.

## Phase 3 — Backfill Dry Run

Goal:

Generate a reviewable migration proposal before any product or DB writes.

Status: completed.

Actions:

- Add `apps/webapp/scripts/fio-backfill/backfill-platform-user-fio.ts`.
- The Phase 3 scorer remains dry-run only. Any write entrypoint belongs to Phase 9 and must satisfy its independent
  manifest, target, backup, owner-approval, drift, and rollback gates.
- Load local dictionaries from `.tmp/fio-backfill/russiannames/jsonl/`.
- Collect candidates per user from:
  - Rubitime appointment payloads and `contact_name`;
  - native booking snapshots/submissions;
  - existing structured fields;
  - legacy `display_name`;
  - provider/session names only as weak hints.
- Produce:
  - proposed chosen FIO;
  - all rejected candidates with reason;
  - confidence;
  - source;
  - conflict flags;
  - no raw report in chat.

Validation:

- Synthetic unit tests for collector/scorer.
- Run dry-run on dev DB only after explicit env load from `apps/webapp/.env.dev`.
- Confirm report files are under `.tmp/` and not tracked.

Gate:

- Owner can review high/medium/low/conflict counts before any write path exists.

Artifacts:

- `apps/webapp/scripts/fio-backfill/backfill-platform-user-fio.ts`
- `.tmp/fio-backfill/reports/fio-backfill-dry-run.latest.json`
- `.tmp/fio-backfill/reports/fio-backfill-dry-run.latest.csv`

Latest aggregate result from dev DB, generated 2026-07-02:

- total users: 213
- users with candidates: 213
- no change: 43
- fill missing: 9
- replace weak partials: 24
- review conflict: 65
- insufficient: 72
- selected high confidence: 139
- selected medium confidence: 2
- selected low confidence: 70
- selected source Rubitime: 141
- selected source display_name: 67
- selected source profile_structured: 3
- selected none: 2

Validation run:

- `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec eslint scripts/fio-backfill/backfill-platform-user-fio.ts src/shared/lib/fio.ts"`
- `bash /home/dev/orch/run-tests.sh "bash -lc 'set -a && source apps/webapp/.env.dev && set +a && pnpm --dir apps/webapp run fio:backfill-dry-run'"`

## Phase 4 — Booking Form Contract

Goal:

Stop creating new messy names.

Status: completed.

Actions:

- Replace the patient booking confirm contact name input with:
  - surname, required;
  - given name, required;
  - patronymic, optional;
  - phone, prefilled;
  - email, prefilled.
- Prefill from canonical user profile fields, not `display_name` when structured fields exist.
- Preserve backward compatibility:
  - derive legacy `contactName` for existing service/integrator contracts;
  - store structured name snapshot in booking form answers/payload metadata.
- Keep `contact_name` generated as `last first patronymic` until downstream contracts are migrated.

Validation:

- Patient booking create/reschedule tests.
- Confirm form tests for required surname/given name.
- Targeted live smoke only if UI changed materially.

Gate:

- New bookings contain structured FIO and still produce existing lifecycle payloads.

Artifacts:

- `apps/webapp/src/app/app/patient/booking/new/confirm/page.tsx`
- `apps/webapp/src/app/app/patient/booking/new/confirm/ConfirmStepClient.tsx`
- `apps/webapp/src/app/app/patient/cabinet/useCreateBooking.ts`
- `apps/webapp/src/app/api/booking/create/route.ts`
- `apps/webapp/src/modules/patient-booking/{types,ports,createInputValidation,inPersonApiSchemas,canonicalCreate,service}.ts`

Implemented:

- patient confirm step collects `lastName`, `firstName`, `patronymic`;
- surname and given name are required before submit;
- phone and email are prefilled from the current profile/session;
- legacy `contactName` is still generated as `Фамилия Имя Отчество`;
- API accepts optional `contactFio`;
- canonical form profile prefill exposes `first_name`, `last_name`, and `patronymic`;
- booking.created event/attribution includes `contactFio` when provided.

Validation run:

- `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/app/app/patient/booking/new/confirm/ConfirmStepClient.test.tsx src/app/app/patient/booking/new/confirm/confirm-page.test.ts src/modules/patient-booking/createInputValidation.test.ts --project=fast"`
- `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec eslint src/app/app/patient/booking/new/confirm/page.tsx src/app/app/patient/booking/new/confirm/ConfirmStepClient.tsx src/app/app/patient/booking/new/confirm/ConfirmStepClient.test.tsx src/app/app/patient/cabinet/useCreateBooking.ts src/app/api/booking/create/route.ts src/modules/patient-booking/types.ts src/modules/patient-booking/ports.ts src/modules/patient-booking/createInputValidation.ts src/modules/patient-booking/createInputValidation.test.ts src/modules/patient-booking/inPersonApiSchemas.ts src/modules/patient-booking/canonicalCreate.ts src/modules/patient-booking/service.ts"`

## Phase 5 — Merge, Projection, And Provider Priority

Goal:

Prevent Telegram/MAX/OAuth from degrading canonical patient names.

Status: completed.

Actions:

- Update Rubitime/webapp ensure path so appointment FIO is a strong source.
- Update OAuth/session/provider flows so provider names only fill empty or low-confidence fields.
- Update platform merge logic and preview to reflect:
  - manual/booking/Rubitime wins;
  - existing Cyrillic FIO beats Latin provider hint;
  - conflicts are surfaced, not silently overwritten.
- Keep supplementary phone/email contact behavior intact.

Validation:

- Focused tests for:
  - Rubitime full FIO vs Telegram first name;
  - OAuth Latin name vs existing Cyrillic FIO;
  - empty structured fields filled by provider;
  - conflicting booking names flagged;
  - email merge still preserves supplementary contacts.

Gate:

- No path can replace strong structured FIO with weaker provider display data.

Implemented:

- projection update no longer blindly overwrites non-empty `display_name` with weak display-only input;
- structured projection with first+last remains strong and can update derived display name;
- auto/manual merge SQL preserves `patronymic` instead of dropping it;
- auto-merge helper and preview expose effective patronymic;
- merge preview scalar conflicts include `patronymic`.

Validation run:

- `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/infra/repos/pgUserProjection.repo.test.ts src/infra/repos/autoMergeScalarEffective.test.ts src/infra/platformUserMergePreview.test.ts --project=fast"`
- `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec eslint src/infra/repos/pgUserProjection.ts src/infra/repos/pgUserProjection.repo.test.ts src/infra/repos/autoMergeScalarEffective.ts src/infra/repos/autoMergeScalarEffective.test.ts src/infra/platformUserMergePreview.ts src/infra/platformUserMergePreview.test.ts"`
- `bash /home/dev/orch/run-tests.sh "pnpm --dir packages/platform-merge run typecheck"`

## Phase 6 — Structured FIO At Identity Creation

Status: completed on `feat/doctor-ui-rebuild` at `50eba2619` (`a9d70dc85` specialist/clinic foundation,
`4d53e003e` separate patient email registration, `50eba2619` milestone test alignment).

Goal:

Stop creating new ambiguous identities before completing migration cleanup.

Actions:

- Patient email registration accepts separate `lastName`, `firstName`, and optional `patronymic`; surname and given
  name are required.
- Derive `display_name` as a compatibility projection. Do not accept it as the source of truth in owned registration
  flows.
- Specialist/clinic registration accepts structured specialist FIO and keeps organization name as a separate value.
- Preserve provisioning intent, membership, and specialist-profile contracts.
- Update UI, API schemas, domain types, ports, repository write paths, and focused tests using existing columns only.

Gate:

- Patient and specialist registration tests prove required surname/given name, optional patronymic, derived
  `display_name`, and no organization/specialist name mixing.

Evidence:

- Independent C2F audit: `bcb-c2f-855-patient-registration-audit-20260719` — PASS.
- Post-rebase focused registration suite: 6 files / 60 tests — PASS.
- Combined S4/C2F milestone: lint, typecheck, integrator/webapp/media-worker tests, builds and `pnpm run audit` — PASS.
- No TEST/production DB, deploy or real delivery action was performed.

## Phase 7 — Remaining Writers And Provider Priority

Status: implementation completed on `feat/doctor-ui-rebuild` at `c8492fec5`; task `#856` completion/closeout is
recorded at `2718fe68b`.

Goal:

Make every runtime identity writer respect the same source-priority contract.

Actions:

- Audit manual edit, booking, provisioning, OAuth, Telegram, and MAX write paths.
- Provider names are weak hints: fill only empty fields and never overwrite manual/booking/Rubitime FIO.
- Keep provider conflicts visible for manual resolution; do not guess through a silent overwrite.
- Preserve `display_name` only as a derived compatibility field/fallback.

Gate:

- Contract and regression tests cover every writer and prove weak providers cannot degrade strong structured FIO.

Evidence:

- Focused writer/display tests, scoped lint, integrator/webapp typecheck and diff-check passed.
- Independent audit `bcb-c2f-856-audit-20260719`: PASS, safe to integrate, no P0/P1.
- Deferred P2: provider writes may still make compatibility `display_name` disagree with preserved structured FIO;
  the patient shell legacy fallback still uses its older helper.
- Owner question for Phase 10: whether a same-row provider/FIO disagreement needs a new visible conflict indicator,
  or whether strong-wins plus the existing manual-edit/merge-preview paths are sufficient.

## Phase 8 — Display Cleanup

Status: implementation completed on `feat/doctor-ui-rebuild` at `c8492fec5`; task `#856` completion/closeout is
recorded at `2718fe68b`.

Goal:

Make the app consistently use structured names.

Actions:

- Doctor surfaces use full FIO helper:
  - client list;
  - patient card;
  - appointments;
  - communications;
  - search;
  - broadcasts/audience previews where patient labels appear.
- Patient surfaces use first-name helper:
  - shell greeting;
  - profile hero;
  - booking prefill.
- Booking prefill uses structured fields directly when present and does not invoke a parser for those rows.
- Keep `display_name` fallback while legacy rows exist.
- Do not remove `display_name` schema.

Validation:

- Targeted doctor clients/card tests.
- Targeted patient profile/shell tests.
- UI smoke for doctor list and patient profile if changed.

Gate:

- Doctor sees full FIO where available; patient sees given name.

Evidence:

- Doctor label matrix uses the shared full-FIO helper with legacy fallback.
- Patient profile and structured booking prefill use structured identity fields; schema fallback remains intact.
- Covered by the Phase 7-8 combined validation and independent audit above.

## Phase 9 — Production Backfill Closeout

Status: deferred to the final full production cutover after the commercial, SaaS/tenant and legal/readiness launch
gates. The current old production runtime must not receive a standalone FIO backfill.

Goal:

Apply only the owner-reviewed decisions as one ordered data step of the separately approved full migration to the
complete new production system.

Actions:

- Preserve the owner-reviewed artifact as authoritative input; never recompute its decisions with the parser.
- Do not preview/apply FIO independently against the materially outdated production runtime. First complete the new
  code/schema and the commercial, SaaS/tenant and legal/readiness gates, then rehearse the whole cutover chain on
  TEST from a fresh copy.
- Preserve the two exact reviewed TEST exceptions — one expected-missing identity and one preserve-current row —
  without recalculating or replacing the owner's decisions.
- Build a preview from an up-to-date production copy and emit a redacted aggregate plus local PII audit artifact.
- Require explicit owner approval of that exact preview artifact before production apply.
- Use one canonical apply entrypoint with an immutable reviewed manifest: schema/version, unique IDs, explicit
  approval, expected-before snapshot, run ID and hash. Do not commit the draft XLSX generator/extractor.
- Verify exact `current_database()` against an explicit DEV/TEST target on current `151.x`. PROD is not localhost
  here: it is a separately authorized target on `135.106.162.170`.
- Before mutation, verify the canonical host backup/runbook gate and create a durable `0600` rollback manifest.
- Apply in one transaction with conditional expected-before updates, abort/skip accounting for drift, and no PII
  console samples. Rollback is conditional on the recorded post-apply state and must not overwrite later edits.
- Run post-apply reconciliation and selective doctor/patient UI checks.
- Keep XLSX, CSV, decisions, backups, and before/after audit files under ignored local storage; never commit them.

Validation:

- Preview/apply/rollback contract tests against an isolated database fixture.
- Exact target database and mode guards.
- Malformed/duplicate manifest rejection; transaction rollback, stale-row abort/skip, rollback-conflict, and
  pre-commit artifact failure tests.
- Post-apply aggregate reconciliation and owner-selected UI spot-check.

Gate:

- Production mutation remains blocked until the owner explicitly approves the full production change window and
  the exact fresh FIO preview/manifest inside that cutover.

## Phase 10 — Legacy Fallback Audit

Status: blocked under taskdb `#858` until the Phase 9 step completes inside the final production cutover and its
production reconciliation passes.

Actions:

- Audit active identities for missing structured fields.
- Search every consumer that parses `display_name` and classify it as migrated, required legacy fallback, or dead
  code.
- Confirm all owned registrations, booking, manual edit, provisioning, OAuth/Telegram/MAX, and production backfill
  gates are complete.

Gate:

- No active identity requires parsing `display_name` to recover structured FIO, and no consumer silently relies on
  that parser.

## Phase 11 — Runtime Parser Retirement

Status: blocked under taskdb `#858` until production reconciliation and Phase 10 evidence both pass.

Actions:

- The dictionary-backed one-off backfill parser may be retired after migration closeout; it is not a runtime
  dependency.
- Remove runtime `display_name -> FIO` fallback only after every Phase 10 gate passes.
- Search all call sites, remove dead compatibility branches, and add regression tests for doctor full-FIO labels,
  patient first-name greetings, and booking prefill.

Gate:

- Structured fields are the sole source of truth for active identities; `display_name` remains only a compatibility
  label where schema/API compatibility still requires it.

## Separate Notification Track

The former Phase 8 (booking lifecycle templates and verified-email delivery) belongs to the notification roadmap.
It must continue to use DB-backed `system_settings`, but it neither proves nor blocks completion of structured FIO.

## Final Acceptance

- Historical acceptance of taskdb `#24` covers the earlier delivered tranche only. Task `#855` is completed and
  integrated at `50eba2619`; task `#856` implementation is at `c8492fec5`, with completion/closeout at `2718fe68b`.
  TEST evidence `#849` was successfully re-established
  on 2026-07-19. Task `#857` is deferred to the single final platform production cutover, and `#858` remains blocked
  until that production reconciliation succeeds.
- `accepted` remains owner-only.
- Full CI is run only when explicitly preparing push or when repo-wide changes justify it.
