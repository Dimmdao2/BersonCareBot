# P0.4 scoped table batches

Canonical machine-readable artifact: [`scope-derivation/p0-4-batches.tsv`](scope-derivation/p0-4-batches.tsv).

This file is the execution map for P0.4.0. It assigns every table from
[`scope-derivation/needs-orgid-FINAL.txt`](scope-derivation/needs-orgid-FINAL.txt) to exactly one
P0.4 micro-batch. It does **not** start P0.4.P1+ migrations and does not add `organization_id` to
all tables in one diff.

## Batch counts

| Batch     |   Count | Scope                                                                                                              |
| --------- | ------: | ------------------------------------------------------------------------------------------------------------------ |
| P0.4.I1   |       5 | Integrator direct `user_id` path tables.                                                                           |
| P0.4.I2   |       3 | Integrator `identities.user_id` path tables.                                                                       |
| P0.4.I3   |       4 | Integrator child tables that copy org from a scoped parent.                                                        |
| P0.4.I4   |       1 | Integrator `mailings` direct org root.                                                                             |
| P0.4.P1   |      13 | Public clinical EHR, patient file/payment, merge candidates (12 DDL/backfill tables + 1 already-direct-org table). |
| P0.4.P2   |      12 | Public treatment program templates/instances and discussion/action children.                                       |
| P0.4.P3   |      11 | Public LFK plus test attempts/results.                                                                             |
| P0.4.P4   |       7 | Public diary/activity/symptoms/warmup/home blocks.                                                                 |
| P0.4.P5   |       4 | Public online intake.                                                                                              |
| P0.4.P6   |       8 | Public support, doctor notes, specialist tasks.                                                                    |
| P0.4.P7   |      23 | Public reminders, delivery/message logs, media, per-user analytics, ratings.                                       |
| P0.4.P8   |      17 | Public tenant catalogs, content, courses, test catalogs, recommendations, audit roots.                             |
| P0.4.D    |       2 | Polymorphic/declared denorm cases needing explicit resolver or parent path.                                        |
| P0.4.RC   |       1 | `reference_categories` authoritative org semantics.                                                                |
| **Total** | **111** | Matches `needs-orgid-FINAL.txt`.                                                                                   |

## Validation gate

Run the gate from the repository root:

```bash
bash /home/dev/orch/run-tests.sh "node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-4-batches.mjs"
```

The gate proves:

- the batch artifact has exactly 111 table rows;
- no table is duplicated;
- the assigned table set exactly equals `needs-orgid-FINAL.txt`.
- every assigned table is `SCOPED` in `tiers-218.tsv`.

## Execution rule

Each follow-up P0.4 batch must:

- add nullable `organization_id` only for that batch's existing populated tables;
- backfill with an idempotent single-org or parent/bridge query;
- add indexes needed for future tenant filtering;
- prove zero NULL `organization_id` for the batch before any enforcement stage;
- quarantine or explicitly count unresolved rows instead of silently dropping them;
- update this initiative log with the checks run.

`P0.4.BE` remains a separate FK-path support stage for the two `be_*` gaps named in
`CORRECTED_PLAN.md` (`be_package_items`, `be_patient_package_items`). Those tables are already in
the 44 scoped `be_*` set and are not part of the 111 `needs-orgid` table count.
