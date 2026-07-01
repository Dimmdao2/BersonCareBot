---
name: FIO Identity Cleanup
overview: Structured patient FIO, Rubitime-first backfill, booking form cleanup, and lifecycle notification templates.
isProject: true
todos:
  - id: fio-0
    content: Prepare local backfill infrastructure and Zenodo dataset runbook.
    status: completed
  - id: fio-1
    content: Inventory all current name readers/writers and produce read-only dev DB quality report.
    status: pending
  - id: fio-2
    content: Add shared typed name normalization/formatting/scoring module with tests.
    status: pending
  - id: fio-3
    content: Split patient booking contact name into surname/given/patronymic with phone/email prefill.
    status: pending
  - id: fio-4
    content: Update merge/ensure priority so booking/manual FIO beats Telegram/MAX/OAuth hints.
    status: pending
  - id: fio-5
    content: Implement dry-run FIO backfill script using local Zenodo JSONL dictionaries and review reports.
    status: pending
  - id: fio-6
    content: Apply reviewed high-confidence FIO backfill on dev/test with audit artifact.
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

## Definition of Done

- [x] Local-only dataset infrastructure exists and does not commit Zenodo data.
- [ ] Name readers/writers are inventoried and documented.
- [ ] Booking form collects surname and given name as required fields.
- [ ] Merge/OAuth/messenger paths cannot overwrite stronger booking/manual FIO.
- [ ] Backfill dry-run report is reviewed before any DB writes.
- [ ] Doctor surfaces use full FIO; patient surfaces use first name.
- [ ] Booking lifecycle templates are editable through DB-backed settings, not env.

## Scope

Allowed:

- `apps/webapp/scripts/fio-backfill/**`
- `docs/FIO_IDENTITY_CLEANUP_INITIATIVE/**`
- targeted identity/booking/notification modules listed in the docs plan during later phases

Out of scope for phase 0:

- production DB writes;
- removing `display_name` from schema;
- changing live booking/notification behavior;
- committing downloaded or derived large dictionary files.
