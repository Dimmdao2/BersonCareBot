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
