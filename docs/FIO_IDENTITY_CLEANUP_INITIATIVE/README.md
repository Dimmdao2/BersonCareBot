# FIO / Identity Cleanup Initiative

Status: execution, phase 2 shared parser complete.

Master plan: `.cursor/plans/fio_identity_cleanup.plan.md`.

## Goal

Replace ambiguous patient naming with structured identity fields:

- `last_name` — surname, doctor-facing required for booking;
- `first_name` — given name, patient-facing greeting name;
- `patronymic` — optional middle/patronymic name;
- `display_name` — legacy/derived compatibility field, not the source of truth.

Doctor surfaces should display full FIO when available. Patient surfaces should
address the patient by `first_name` only.

## Execution Principle

This initiative is executed phase-by-phase with explicit gates. The work is not
delegated to blind batch agents: each phase starts from code inspection, keeps a
narrow scope, and uses targeted validation. Full `pnpm run ci` is reserved for
explicit push/pre-push requests or repo-wide risk.

## Source Priority

Canonical patient name resolution, from strongest to weakest:

1. reviewed manual doctor/admin edit;
2. booking/Rubitime full name attached to actual appointments;
3. native booking form structured fields;
4. current structured `platform_users` fields;
5. OAuth / Telegram / MAX profile hints;
6. legacy `display_name`.

Messenger/OAuth names must not overwrite a stronger booking/manual FIO.

## Backfill Dataset

Local dictionary source for the one-off parser:

- Zenodo record: https://zenodo.org/records/2747011
- DOI: `10.5281/zenodo.2747011`
- Author: Ivan Begtin / Infoculture
- File: `russiannames_db_jsonl.zip`

Downloaded data lives in `.tmp/fio-backfill/russiannames/` and is not committed.
Runbook: `apps/webapp/scripts/fio-backfill/README.md`.

## Scope Boundaries

Allowed:

- `apps/webapp/scripts/fio-backfill/**`
- `docs/FIO_IDENTITY_CLEANUP_INITIATIVE/**`
- `.cursor/plans/fio_identity_cleanup.plan.md`
- later phase-specific code under identity, booking, merge, doctor-client,
  patient-display, and booking-notification modules listed in the master plan.

Out of scope unless explicitly added later:

- production DB writes;
- removing `display_name` from schema;
- committing downloaded or derived large dictionary files;
- multi-tenant identity policy;
- unrelated patient profile redesign;
- real external sends from dev/test outside documented delivery redirect.

## Phases

### Phase 0 — Prepared Infrastructure

Status: completed.

Artifacts:

- `apps/webapp/scripts/fio-backfill/download-russiannames-dataset.mjs`
- `apps/webapp/scripts/fio-backfill/README.md`
- `.tmp/fio-backfill/russiannames/jsonl/{names,midnames,surnames}.jsonl`

Gate:

- Dataset is local-only and ignored by git.
- No DB writes and no product behavior changes.

### Phase 1 — Inventory And Data Quality Report

Status: completed.

Goal: establish the real state before touching behavior.

Actions:

- Map all runtime readers/writers of:
  `display_name`, `first_name`, `last_name`, `patronymic`, `email`,
  `email_verified_at`, `contact_name`, `payload.name`.
- Inspect platform users, booking, Rubitime projection, OAuth, Telegram/MAX,
  merge, doctor-client, and patient-display paths.
- Add read-only tooling:
  `apps/webapp/scripts/fio-backfill/audit-fio-sources.ts`.
- Emit reports under `.tmp/fio-backfill/reports/`:
  `name-field-inventory.md`, `fio-quality-report.json`,
  `fio-quality-report.csv`.

Report metrics:

- active client count;
- missing structured names;
- one-token/two-token/three-plus-token legacy names;
- Cyrillic vs Latin/mixed names;
- Rubitime full-name candidates;
- booking/profile conflicts;
- phone/email prefill gaps;
- verified email candidates for booking-created email.

Validation:

- Syntax/type checks needed for the script.
- Targeted tests only if script imports app code.
- No full CI.

Gate:

- Exact current writers and risky overwrite paths are known.
- No DB writes.

Latest dev DB aggregate, generated 2026-07-02:

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

Artifacts:

- `apps/webapp/scripts/fio-backfill/audit-fio-sources.ts`
- `.tmp/fio-backfill/reports/name-field-inventory.latest.md`
- `.tmp/fio-backfill/reports/fio-quality-report.latest.json`
- `.tmp/fio-backfill/reports/fio-quality-report.latest.csv`

### Phase 2 — Shared FIO Model, Parser, And Scoring

Status: completed.

Goal: create one typed place for name decisions before changing consumers.

Actions:

- Define strict types:
  `StructuredFio`, `FioSource`, `FioConfidence`, `FioCandidate`,
  `FioDecision`.
- Implement normalization, casing, doctor full-FIO label, patient greeting
  label, candidate parsing, source scoring, and conflict reason codes.
- Use Zenodo dictionaries only in script/backfill tooling. Runtime helpers must
  not depend on `.tmp`.

Validation:

- Focused unit tests for Russian FIO, ambiguous order, two-token names,
  one-token provider names, Latin names, hyphenated names, patronymics, and
  conflicts.
- Targeted tests through `/home/dev/orch/run-tests.sh`.

Gate:

- Parser explains confidence and conflicts instead of silently guessing.

Artifacts:

- `apps/webapp/src/shared/lib/fio.ts`
- `apps/webapp/src/shared/lib/fio.test.ts`

Validation:

- `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run src/shared/lib/fio.test.ts --project=fast"`
- `bash /home/dev/orch/run-tests.sh "pnpm --dir apps/webapp exec eslint src/shared/lib/fio.ts src/shared/lib/fio.test.ts"`

### Phase 3 — Backfill Dry Run

Goal: generate a reviewable migration proposal before any DB writes.

Actions:

- Add `apps/webapp/scripts/fio-backfill/backfill-platform-user-fio.ts`.
- Dry-run only. `--commit` is not added in this phase.
- Collect candidates from Rubitime, native booking snapshots, existing
  structured fields, legacy `display_name`, and weak provider hints.
- Produce chosen FIO, rejected candidates, confidence, source, and conflict
  flags.
- Keep PII in `.tmp` reports, not chat.

Validation:

- Synthetic unit tests for collector/scorer.
- Dry-run on dev DB only after explicit env load from `apps/webapp/.env.dev`.
- Confirm reports are untracked.

Gate:

- High/medium/low/conflict counts are reviewable before any write path exists.

### Phase 4 — Booking Form Contract

Goal: stop creating new messy names.

Actions:

- Replace single booking contact name input with:
  surname required, given name required, patronymic optional.
- Prefill structured names, phone, and email from the current profile.
- Derive legacy `contactName` for existing service/integrator contracts.
- Store structured name snapshot in booking metadata/submissions.

Validation:

- Patient booking create/reschedule tests.
- Confirm form tests for required surname/given name.
- UI smoke if material UI changed.

Gate:

- New bookings contain structured FIO and still produce existing lifecycle
  payloads.

### Phase 5 — Merge, Projection, And Provider Priority

Goal: prevent Telegram/MAX/OAuth from degrading canonical patient names.

Actions:

- Make appointment/Rubitime FIO a strong source in ensure/projection paths.
- Provider names fill only empty or low-confidence fields.
- Update platform merge logic and preview.
- Preserve supplementary phone/email contact behavior.

Validation:

- Focused tests for Rubitime vs Telegram, OAuth Latin vs Cyrillic FIO, empty
  fields filled by provider, conflict surfacing, and email contact preservation.

Gate:

- No path can replace strong structured FIO with weaker provider display data.

### Phase 6 — Reviewed Backfill Apply

Goal: apply only safe reviewed changes.

Actions:

- Add `--commit` after dry-run review.
- Require input report id/path and confidence filter.
- Refuse production-looking DB URLs.
- Update only targeted fields:
  `last_name`, `first_name`, `patronymic`, and derived `display_name` if
  compatibility requires it.
- Write before/after audit artifact under `.tmp/fio-backfill/applied/`.

Validation:

- Transactional dev/test apply.
- Post-apply read-only diff report.
- Manual spot-check in doctor clients and patient profile.

Gate:

- Backfill result is auditable and reversible from artifact.

### Phase 7 — Display Cleanup

Goal: make the app consistently use structured names.

Actions:

- Doctor surfaces use full FIO helper:
  client list, patient card, appointments, broadcasts/audience previews.
- Patient surfaces use first-name helper:
  shell greeting, profile hero, booking prefill.
- Keep `display_name` fallback while legacy rows exist.
- Do not remove `display_name` schema.

Validation:

- Targeted doctor clients/card tests.
- Targeted patient profile/shell tests.
- UI smoke for changed views.

Gate:

- Doctor sees full FIO where available; patient sees given name.

### Phase 8 — Booking Lifecycle Templates And Verified Email

Goal: make booking notifications configurable and send email only when safe.

Actions:

- Extend existing `booking_lifecycle_notifications` in `system_settings`.
- Do not add env vars.
- Add per-event/per-channel templates:
  messenger, email, SMS, web push where applicable.
- Supported variables:
  `{patientFirstName}`, `{patientFullName}`, `{date}`, `{time}`, `{service}`,
  `{branch}`, `{address}`, `{manageUrl}`.
- Send booking-created email only when canonical user has
  `email_verified_at IS NOT NULL`.
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

- Taskdb `#24` can be `done` only after phases are implemented and targeted
  validation is recorded.
- `accepted` remains owner-only.
- Full CI is run only when explicitly preparing push or when repo-wide changes
  justify it.
