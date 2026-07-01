# FIO / Identity Cleanup Initiative

Status: planning, infrastructure prepared.

## Goal

Replace ambiguous patient naming with structured identity fields:

- `last_name` — surname, doctor-facing required for booking;
- `first_name` — given name, patient-facing greeting name;
- `patronymic` — optional middle/patronymic name;
- `display_name` — legacy/derived compatibility field, not the source of truth.

Doctor surfaces should display full FIO when available. Patient surfaces should
address the patient by `first_name` only.

## Source priority

Canonical patient name resolution, from strongest to weakest:

1. reviewed manual doctor/admin edit;
2. booking/Rubitime full name attached to actual appointments;
3. native booking form structured fields;
4. current structured `platform_users` fields;
5. OAuth / Telegram / MAX profile hints;
6. legacy `display_name`.

Messenger/OAuth names must not overwrite a stronger booking/manual FIO.

## Backfill dataset

Local dictionary source for the one-off parser:

- Zenodo record: https://zenodo.org/records/2747011
- DOI: `10.5281/zenodo.2747011`
- Author: Ivan Begtin / Infoculture
- File: `russiannames_db_jsonl.zip`

Downloaded data lives in `.tmp/fio-backfill/russiannames/` and is not committed.
Runbook: `apps/webapp/scripts/fio-backfill/README.md`.

## Execution Plan

### Phase 0 — Inventory and Safety

- Confirm all current name fields and writers:
  `platform_users`, booking records, Rubitime projection, OAuth, Telegram/MAX,
  manual doctor/admin edit, patient profile edit.
- Identify all doctor/patient display helpers using `display_name`.
- Produce a read-only dev DB report with counts:
  empty names, single-token names, mixed Latin/Cyrillic names, conflicting
  names between booking and profile, email/phone prefill gaps.
- No DB writes in this phase.

Validation:

- `rg` map of runtime writers/readers.
- Read-only SQL/report under `.tmp/fio-backfill/reports/`.

### Phase 1 — Shared Name Model

- Add a typed name utility module for:
  normalization, title-casing, full FIO formatting, patient greeting formatting,
  and source/confidence scoring.
- Keep compatibility with existing `display_name`.
- Add targeted unit tests for Russian FIO, Latin hints, one/two/three-token
  inputs, patronymics, and ambiguous cases.

Validation:

- Targeted webapp unit tests for the new name utility.
- `pnpm --dir apps/webapp typecheck` through the repo test wrapper when code is
  changed.

### Phase 2 — Booking Form Contract

- Replace one patient booking `contactName` input with separate fields:
  surname, given name, optional patronymic.
- Prefill surname/given name/patronymic, phone, and email from the current
  user profile where available.
- Make surname and given name required.
- Preserve backward compatibility by deriving legacy `contactName` for existing
  booking lifecycle payloads until integrator contract is migrated.
- Store structured name snapshots in booking/appointment payloads or submissions.

Validation:

- Patient booking create/reschedule tests.
- UI smoke on `http://127.0.0.1:5200/app/patient/booking/new`.

### Phase 3 — Merge and Projection Priority

- Change user ensure/merge paths so Rubitime/booking/manual structured FIO wins
  over Telegram/MAX/OAuth profile hints.
- Provider names may fill only empty low-confidence fields.
- Keep supplementary contact behavior for phone/email; do not invent env config.
- Update merge preview/audit copy to explain name-source priority.

Validation:

- Merge/ensure unit tests covering:
  booking FIO vs Telegram first name;
  OAuth Latin display name vs existing Cyrillic FIO;
  empty profile filled from provider hint;
  conflicting booking names flagged for review.

### Phase 4 — Backfill Dry Run

- Build `scripts/fio-backfill/backfill-platform-user-fio.ts`.
- Input sources:
  Rubitime appointment payloads / `contact_name`;
  native booking snapshots;
  existing `platform_users` fields;
  legacy `display_name`.
- Use local Zenodo JSONL dictionaries for first-name and patronymic recognition.
- Emit report only:
  chosen FIO, source, confidence, conflicts, skipped rows.
- Do not print PII into chat. Reports stay under `.tmp/fio-backfill/reports/`.

Validation:

- Unit tests for parser/scorer with synthetic names.
- Dry-run report manually reviewed before any commit mode.

### Phase 5 — Backfill Apply

- Apply only reviewed `high` and explicitly approved `medium` confidence rows.
- Write an audit JSON with before/after and row ids under `.tmp/`.
- Never set task acceptance; mark task done only after owner review path is clear.

Validation:

- Transactional `--commit` run on dev/test first.
- Sample manual spot-check in doctor client list and patient profile.

### Phase 6 — Display Cleanup

- Doctor client list/card/appointments use structured full FIO.
- Patient app greeting/profile uses `first_name`.
- Patient profile edit moves away from free-form `display_name`.
- Keep a derived fallback while legacy routes still read `display_name`.

Validation:

- Doctor clients/card tests.
- Patient shell/profile tests.
- Live smoke on doctor list and patient app.

### Phase 7 — Booking Lifecycle Templates and Email

- Extend existing `booking_lifecycle_notifications` setting instead of adding
  new env vars.
- Add per-event/per-channel templates for:
  messenger, email, SMS, web push where applicable.
- Use verified email only: `email_verified_at IS NOT NULL`.
- Keep Web Push as primary channel according to notification architecture.
- Move hardcoded lifecycle message text behind template rendering.

Validation:

- Settings parser/render tests.
- Integrator lifecycle tests for messenger/email/SMS/web push branches.
- Dev/test delivery safety checks with redirect enabled.

## Out of Scope For The First Batch

- Production backfill.
- Removing `display_name` from the database.
- Multi-tenant identity policy.
- Reworking unrelated patient profile UX.
- Sending real external messages from dev.

## Current Prepared Infrastructure

- `apps/webapp/scripts/fio-backfill/download-russiannames-dataset.mjs`
- `apps/webapp/scripts/fio-backfill/README.md`
- local ignored dataset directory: `.tmp/fio-backfill/russiannames/`
