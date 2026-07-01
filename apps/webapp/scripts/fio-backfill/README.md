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
5. apply only reviewed high-confidence changes in a separate `--commit` pass.

The future product path should not depend on this dataset: new registrations
and booking forms should collect surname, given name, and patronymic as separate
fields.
