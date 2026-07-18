# FIO backfill tooling

Local tools for the patient FIO cleanup initiative.

## Dataset

Primary local dictionary source:

- Title: `Database of Russian names, surnames and midnames for gender identification`
- Author: Ivan Begtin / Infoculture
- DOI: `10.5281/zenodo.2747011`
- URL: https://zenodo.org/records/2747011
- File used by tooling: `russiannames_db_jsonl.zip`
- Zenodo rights metadata: Creative Commons Attribution 4.0 International

The record description also mentions `CC-BY SA by default`, so keep the dataset
as local tooling input only. Do not commit the ZIP, extracted JSONL files, or a
large derived dictionary into the repository without a separate license review.

## Local storage

Downloaded files live under:

```text
.tmp/fio-backfill/russiannames/
```

`.tmp/` is gitignored. This is intentional: the dataset is an operations input
for a backfill script, not a runtime application dependency.

## Download

From the repository root:

```bash
node apps/webapp/scripts/fio-backfill/download-russiannames-dataset.mjs
```

Force re-download and re-extract:

```bash
node apps/webapp/scripts/fio-backfill/download-russiannames-dataset.mjs --force
```

The downloader verifies the Zenodo-published MD5 checksum before extraction.

## Intended use

Use the extracted JSONL files only for dry-run scoring of existing names:

1. collect candidate names from Rubitime/booking records and current
   `platform_users`;
2. parse into `last_name`, `first_name`, `patronymic`;
3. assign confidence and source priority;
4. write a review report under `.tmp/fio-backfill/reports/`;
5. keep the scorer dry-run only; a reviewed write is a separate Phase 9 operation with its own manifest and gates.

The future product path should not depend on this dataset: new registrations
and booking forms should collect surname, given name, and patronymic as separate
fields.

## Reviewed apply status and safety gate

The owner-reviewed artifact was applied and checked on TEST under taskdb `#849`.
Production was not changed. Aggregate TEST result: 165 updated, 3 already
matched, 1 missing, and 1 changed-after-review row intentionally not
overwritten.

There is currently no committed production-safe apply command. Draft helpers
from an old worktree are not canonical: hostname/localhost is not an environment
guard on this host, they do not provide sufficient stale-row protection, and
their rollback artifact is written too late.

Before adding a production apply entrypoint, Phase 9 of
`.cursor/plans/fio_identity_cleanup.plan.md` requires all of the following:

- immutable versioned reviewed manifest with unique IDs, explicit approval,
  expected-before snapshots, run ID, and hash;
- exact `current_database()` target verification for dev/test/production;
- canonical host backup and a durable local `0600` rollback artifact before
  commit;
- conditional apply and conditional rollback so later edits are not
  overwritten;
- no patient names or other PII in stdout;
- current preview approved separately by the owner before production mutation.

The reviewed XLSX/CSV/JSON, previews, decisions, and before/after artifacts stay
under ignored local storage and must never be committed. Owner-reviewed decisions
must not be recalculated by the parser.

## Source audit

The source audit is read-only. It scans current client profiles, booking names,
Rubitime payload names, appointment projections, and booking-origin contacts.
Reports contain patient data and are written only to `.tmp/fio-backfill/reports/`.

From the repository root:

```bash
set -a && source apps/webapp/.env.dev && set +a
pnpm --dir apps/webapp run fio:audit-sources
```

Generated files:

- `.tmp/fio-backfill/reports/name-field-inventory.latest.md`
- `.tmp/fio-backfill/reports/fio-quality-report.latest.json`
- `.tmp/fio-backfill/reports/fio-quality-report.latest.csv`

## Backfill dry-run

The Phase 3 dry-run proposes structured FIO updates and still performs no DB
writes. It requires the downloaded dictionaries from `.tmp/fio-backfill/russiannames/`.
The script intentionally has no `--commit` mode.

```bash
set -a && source apps/webapp/.env.dev && set +a
pnpm --dir apps/webapp run fio:backfill-dry-run
```

Generated files:

- `.tmp/fio-backfill/reports/fio-backfill-dry-run.latest.json`
- `.tmp/fio-backfill/reports/fio-backfill-dry-run.latest.csv`
