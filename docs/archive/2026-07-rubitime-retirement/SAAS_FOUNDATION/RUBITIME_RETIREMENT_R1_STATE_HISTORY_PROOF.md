# Rubitime retirement R1 — state history proof

> **АРХИВ:** Rubitime выведено из эксплуатации 2026-07-27. Материал сохранён только как историческое доказательство; не использовать как текущий план или runbook.

Proof id: `RR-PROOF-02-STATE-HISTORY`

Run id: `R1-STATE-HISTORY-PROOF-codex-2026-07-14`

Verdict: **PASS** for R1/R2 entry. This proof does **not** authorize raw Rubitime table drops; destructive archive/export/drop
remains an R7 gate.

All evidence below is aggregate-only. No row ids, patient names, phones, emails, payloads, screenshots, or message
bodies are recorded in this file.

## Canonical Contract

Product-visible appointment state:

- `public.be_appointments` — current canonical appointment state.
- `public.be_external_entity_mappings` — Rubitime external id to canonical appointment mapping.

Canonical state/history tables:

- `public.be_appointment_events` — canonical appointment event stream for current app flows and Rubitime projection events.
- `public.be_appointment_history_events` — durable history/event timeline for appointments.
- `public.be_appointment_cancellations` and `public.be_appointment_reschedules` — structured lifecycle details when the
  canonical lifecycle path has enough information.
- `public.be_patient_timeline_events` — patient timeline for native canonical appointment flows.

Rubitime-imported baseline:

- Live Rubitime projection inserts write `projected_from_rubitime` to both `be_appointment_events` and
  `be_appointment_history_events`.
- Live Rubitime projection updates write `rubitime_projection_synced`.
- Recovered mappings write `rubitime_projection_mapping_recovered` to history.
- If legacy provider payload cannot reconstruct a full lifecycle, the canonical baseline/sync event is the product
  history boundary; raw provider payload remains trace-only archive.

## Aggregate Proof

Command:

```bash
node docs/archive/2026-07-rubitime-retirement/SAAS_FOUNDATION/scripts/rubitime-r1-state-history-proof.mjs
```

Target DB alias: `bcb_webapp_dev` on loopback.

| Check                                                 | Result |
| ----------------------------------------------------- | -----: |
| Script verdict                                        |   PASS |
| `be_appointments` with `source='rubitime_projection'` |    356 |
| Live `rubitime_projection` appointments               |    287 |
| Live missing `be_appointment_events`                  |      0 |
| Live missing `be_appointment_history_events`          |      0 |
| Live missing Rubitime baseline/sync history           |      0 |
| `integrator.rubitime_events` rows retained            |    369 |
| `integrator.rubitime_records` rows retained           |     91 |
| `appointment_records` rows retained                   |    403 |

Canonical event buckets for `rubitime_projection` appointments:

| Event type                   | Count |
| ---------------------------- | ----: |
| `projected_from_rubitime`    |   356 |
| `rubitime_projection_synced` |    24 |
| `rescheduled`                |     2 |
| `cancelled`                  |     1 |

Canonical history buckets for `rubitime_projection` appointments:

| Event type                              | Count |
| --------------------------------------- | ----: |
| `projected_from_rubitime`               |   356 |
| `rubitime_projection_synced`            |    24 |
| `rubitime_projection_mapping_recovered` |    10 |
| `rescheduled`                           |     2 |
| `cancelled`                             |     1 |

## Raw Provider Archive Disposition

`integrator.rubitime_events` is raw provider audit/replay material, not product-visible appointment history.

Current approved disposition comes from:

- `docs/_TODO/SAAS_FOUNDATION/T0_4_PRE_SCHEMA_CLEANUP_ADR.md` — ADR-003 keeps Rubitime tables until canonical
  parity/read-source cutover is proven; ADR-006 keeps technical/provider audit state with explicit retention rather
  than folding it into business canon.
- `docs/_TODO/SAAS_FOUNDATION/scope-derivation/t0-4-pre-table-matrix.tsv` —
  `integrator.rubitime_events` is classified as `LEGACY`, purpose `raw_provider_audit`, disposition
  `retain_with_retention`, writer `live webhook writes`, with follow-up `set raw payload retention`.
- `docs/_TODO/SAAS_FOUNDATION/scope-derivation/p0-12-json-payload-columns.tsv` —
  `integrator.rubitime_events.payload_json` is frozen legacy raw event payload; do not expand; no samples.

R1 decision:

- Retain raw provider archive in-place in `integrator.rubitime_events` until R7 archive/export/drop approval.
- Do not use raw provider events as runtime product state.
- Do not print raw provider payloads in docs, logs, or owner-facing reports.
- Do not drop raw provider tables in R1/R2.

Static code proof from the script:

| Area                  | `rubitime_events` refs                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `apps/webapp/src`     | only `apps/webapp/src/infra/platformUserFullPurge.ts` (deletion/purge path, not product runtime read) |
| `apps/integrator/src` | schema/migration docs only in the current static scan                                                 |

## Runtime Boundary

This proof closes raw-provider-event dependency for R1/R2 entry only.

It does **not** close all legacy `appointment_records` consumers. `appointment_records` remains a deprecated but live
legacy projection until the R2/R3 checklist migrates or explicitly assigns doctor/client history, memberships/packages,
analytics, slots/create, lifecycle, Google Calendar, and rollback boundaries.
