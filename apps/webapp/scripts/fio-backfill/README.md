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

1. collect candidate names from historical booking records and current
   `platform_users`;
2. parse into `last_name`, `first_name`, `patronymic`;
3. assign confidence and source priority;
4. write a review report under `.tmp/fio-backfill/reports/`;
5. keep the scorer dry-run only; a reviewed write is an ordered Phase 9 step of the final platform production
   cutover with its own manifest and gates.

The future product path should not depend on this dataset: new registrations
and booking forms should collect surname, given name, and patronymic as separate
fields.

## Reviewed apply status and safety gate

The exact owner-reviewed artifact was successfully reapplied and checked on TEST on 2026-07-19 under taskdb `#849`,
after the fresh production-dump rehearsal and canonical history normalization. Aggregate result: 165
updated, 3 already matched, 1 expected missing, and 1 preserve-current row intentionally not overwritten.
Production was not changed. The manual decisions and the two exact exceptions remain authoritative; never
recalculate them with the parser.

Historical source note: Rubitime was one input to that completed rehearsal and was retired on 2026-07-27.

Structured registration task `#855` is completed and integrated at `50eba2619`. Remaining-writers/display task
`#856` has implementation at `c8492fec5` and completion/closeout at `2718fe68b`. Production task `#857` is not an
early standalone backfill: it is deferred to the one
final platform production cutover. Legacy audit/parser retirement task `#858` remains blocked until production
reconciliation succeeds.

The repository now has a TEST-only reviewed-manifest apply/rollback entrypoint. It is intentionally not a production
command. Draft helpers from an old worktree remain non-canonical: hostname/localhost alone is not an environment
guard on this host, they do not provide sufficient stale-row protection, and their rollback artifact is written too
late.

Before implementing the FIO step inside the final platform production cutover, Phase 9 of
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

### TEST-only manifest contract

The immutable manifest schema is defined in `owner-reviewed-fio-contract.ts`. It contains:

- TEST environment, run ID, owner-approval reference, and source-review SHA-256;
- unique `platform_users.id` rows with exact expected-before and desired-after name fields;
- exact expected-missing exceptions and exact preserve-current exceptions for the two reviewed edge cases;
- a canonical self-hash. Global `skip missing/drift` policies are forbidden: any unlisted or later drift aborts.

The operation requires all of the following simultaneously:

- explicit `--test`;
- `DATABASE_URL` uses either exact host `127.0.0.1` or the exact local peer socket
  `/var/run/postgresql`, and database path exactly `bersoncarebot_test`; the socket form is used only by the
  owner-gated reset wrapper and is never stored in runtime env;
- live `current_database()` attestation;
- separately confirmed manifest and source-review hashes;
- a real non-symlink manifest file and rollback directory chain;
- a durable mode `0600` rollback artifact written and fsynced before the first conditional update.

Commands below are operator building blocks; the canonical clean-dump TEST reset invokes the apply command itself
after history normalization and before fixtures/service restart:

```bash
# One-time no-DB sealing of the exact owner-decision payload. Output is created as 0600 and never overwritten.
pnpm --dir apps/webapp run fio:owner-reviewed-test:seal -- \
  --manifest /secure/fio-owner-manifest.payload.json \
  --output /secure/fio-owner-manifest.json

# No-DB verification used by the full-reset preflight before writers stop or TEST is restored.
pnpm --dir apps/webapp run fio:owner-reviewed-test:verify -- \
  --manifest /secure/fio-owner-manifest.json \
  --confirm-manifest-sha256 <manifest-payload-sha256> \
  --confirm-review-source-sha256 <owner-review-source-sha256>

# Read-only preview.
pnpm --dir apps/webapp run fio:owner-reviewed-test:preview -- \
  --test --manifest /secure/fio-owner-manifest.json

# TEST apply. Values are approved hashes; stdout is aggregate-only.
pnpm --dir apps/webapp run fio:owner-reviewed-test:apply -- \
  --test \
  --manifest /secure/fio-owner-manifest.json \
  --confirm-manifest-sha256 <manifest-payload-sha256> \
  --confirm-review-source-sha256 <owner-review-source-sha256> \
  --rollback-dir /absolute/private/rollback-directory

# Conditional rollback: current rows must still equal the recorded post-apply state.
pnpm --dir apps/webapp run fio:owner-reviewed-test:rollback -- \
  --test \
  --artifact /absolute/private/rollback-file.json \
  --confirm-artifact-sha256 <artifact-sha256>
```

The protected manifest used by the host full-reset wrapper is installed outside both checkouts as a regular
`deploy`-owned mode `0600` file. Its raw file SHA-256, canonical manifest SHA-256, and original owner-review source
SHA-256 are separate inputs. Rollback filenames are unique per apply attempt; earlier artifacts are never overwritten
or deleted.

## Source audit

The source audit is read-only. It scans current client profiles, booking names,
historical payload names, appointment projections, and booking-origin contacts.
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
