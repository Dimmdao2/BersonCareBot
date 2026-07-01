---
name: FIO Identity Cleanup
overview: Master execution plan for structured patient FIO, Rubitime-first backfill, booking form cleanup, merge priority, and lifecycle notification templates.
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
    status: pending
  - id: fio-4
    content: Update booking form contract to collect surname/given/patronymic and prefill phone/email.
    status: pending
  - id: fio-5
    content: Update merge/projection/OAuth/messenger priority so stronger FIO sources cannot be overwritten.
    status: pending
  - id: fio-6
    content: Apply reviewed high-confidence backfill on dev/test with audit artifact and manual spot-checks.
    status: pending
  - id: fio-7
    content: Move doctor and patient displays to structured FIO helpers while keeping display_name compatibility.
    status: pending
  - id: fio-8
    content: Extend booking lifecycle notification settings with per-channel templates and verified-email delivery.
    status: pending
---

# FIO Identity Cleanup

Canonical plan: `docs/FIO_IDENTITY_CLEANUP_INITIATIVE/README.md`.

## Execution Principle

This plan is written for senior-agent execution in this repository, not for blind batch work. I will keep phase gates tight, inspect the real code before each change, and use targeted validation. Full `pnpm run ci` is reserved for explicit push/pre-push requests or repo-wide risk, not for each phase.

The work is intentionally ordered so product behavior changes happen only after the name sources and parser are understood.

## Definition of Done

- [x] Local-only dataset infrastructure exists and does not commit Zenodo data.
- [x] Name readers/writers are inventoried and documented.
- [x] A single typed FIO model handles normalization, parsing, confidence, and labels.
- [ ] Dry-run report proves which users can be safely backfilled.
- [ ] Booking form collects surname and given name as required fields and prefills known phone/email.
- [ ] Merge/OAuth/messenger paths cannot overwrite stronger booking/manual FIO.
- [ ] Backfill apply writes only reviewed high-confidence rows and emits an audit artifact.
- [ ] Doctor surfaces use full FIO; patient surfaces use first name.
- [ ] Booking lifecycle templates are editable through DB-backed settings, not env.

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

Out of scope unless explicitly added later:

- production DB writes;
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

Actions:

- Add `apps/webapp/scripts/fio-backfill/backfill-platform-user-fio.ts`.
- Default mode is dry-run. `--commit` must not exist until Phase 6.
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

## Phase 4 — Booking Form Contract

Goal:

Stop creating new messy names.

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

## Phase 5 — Merge, Projection, And Provider Priority

Goal:

Prevent Telegram/MAX/OAuth from degrading canonical patient names.

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

## Phase 6 — Reviewed Backfill Apply

Goal:

Apply only safe reviewed changes.

Actions:

- Add `--commit` to the Phase 3 script only after dry-run review.
- Require input report id/path and confidence filter.
- Refuse production-looking DB URLs.
- Update only targeted fields:
  `last_name`, `first_name`, `patronymic`, and derived `display_name` if compatibility requires it.
- Write audit artifact with before/after under `.tmp/fio-backfill/applied/`.

Validation:

- Transactional dev/test apply.
- Post-apply read-only diff report.
- Manual spot-check in doctor clients and patient profile.

Gate:

- Backfill result is auditable and reversible from artifact.

## Phase 7 — Display Cleanup

Goal:

Make the app consistently use structured names.

Actions:

- Doctor surfaces use full FIO helper:
  - client list;
  - patient card;
  - appointments;
  - broadcasts/audience previews where patient labels appear.
- Patient surfaces use first-name helper:
  - shell greeting;
  - profile hero;
  - booking prefill.
- Keep `display_name` fallback while legacy rows exist.
- Do not remove `display_name` schema.

Validation:

- Targeted doctor clients/card tests.
- Targeted patient profile/shell tests.
- UI smoke for doctor list and patient profile if changed.

Gate:

- Doctor sees full FIO where available; patient sees given name.

## Phase 8 — Booking Lifecycle Templates And Verified Email

Goal:

Make booking notifications configurable and send email only when safe.

Actions:

- Extend existing `booking_lifecycle_notifications` in `system_settings`.
- Do not add env vars.
- Add per-event/per-channel template fields for:
  - messenger;
  - email;
  - SMS;
  - web push where applicable.
- Template variables:
  `{patientFirstName}`, `{patientFullName}`, `{date}`, `{time}`, `{service}`, `{branch}`, `{address}`, `{manageUrl}`.
- Verified email rule:
  send booking-created email only when canonical user has `email_verified_at IS NOT NULL`.
- Move hardcoded lifecycle text behind template rendering incrementally.

Validation:

- Settings parser tests.
- Template renderer tests.
- Integrator lifecycle tests for channel branches.
- Dev/test delivery safety only through existing redirect protections.

Gate:

- Doctor can edit lifecycle notification templates in settings.
- Booking-created email is attempted only for verified emails.

## Final Acceptance

- Taskdb `#24` can be `done` only after phases implemented and targeted validation is recorded.
- `accepted` remains owner-only.
- Full CI is run only when explicitly preparing push or when repo-wide changes justify it.
