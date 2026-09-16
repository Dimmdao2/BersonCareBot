# Automatic-merge medical-history organization gate — adversarial audit

- Candidate: `72d9e224ab32e82e46aea49b2cb784f1577744d5`
- Branch: `wt/merge-org-gate`
- Authority: `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18; plan stage Э1 in
  `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`
- Role: adversarial auditor; no product fix is included
- Verdict: **FAIL**

## Test-or-look classification and blind kill-set

Before reading the candidate tests, points 1, 2, 3 and 5 were classified as repeatable behavior and point 4 as
one-off fault injection. The blind kill-set was:

1. histories in different organizations are incorrectly blocked;
2. histories in the same organization are incorrectly allowed;
3. a probe loses its organization or disappears from the union;
4. one-sided or absent history incorrectly blocks;
5. `NULL/NULL` is incorrectly allowed;
6. the manual support path is incorrectly subjected to the automatic gate.

## Findings

### F1 — canon violation: appointment-only history blocks automatic merge

`AUTH_AND_IDENTITY_CANON.md` §18 explicitly says appointment history never blocks. The live DEV proof created two
client accounts whose only qualifying rows were completed `patient_bookings` in the same organization. The gate
returned one conflict row (`expected=0`, `actual_conflicts=1`). Concrete wrong outcome: two accounts with no
medical data, only completed appointments, are rejected by `assertAutomaticMergeHasNoMedicalHistory` instead of
being merged.

Both `patient_bookings` and `be_appointments` are currently automatic probes. The reproduced input used
`patient_bookings`; the same category error is present for `be_appointments` by construction.

### F2 — dropping a medical probe is not caught

Removing only the `doctor_notes` `automaticProbe` while preserving its transfer left the whole targeted suite
green: 1 file, 7 tests. A future regression can omit all doctor notes from the gate and silently merge two medical
profiles in the same organization. This is a named fault from the brief and therefore fails the binary audit gate.

### F3 — the manual-path test does not prove that support stays ungated

Changing `mergePlatformUsersInTransaction` to run `assertAutomaticMergeHasNoMedicalHistory` for
`reason === 'manual'` also left the suite green: 1 file, 7 tests. The current product code is correctly ungated, but its fake
manual client returns no conflict for any gate query, so the regression required by point 5 is not caught.

### F4 — the new query-shape test duplicates SQL text

The test named `asks the database for an organization-scoped intersection...` searches captured SQL for
`conflict_organization_id`, `IS NOT DISTINCT FROM`, and the absence of `target_has`. This violates AGENTS.md §10a
(`ТЕСТ НЕ ДУБЛИРУЕТ КОД, КОНТРАКТ ИЛИ ТЕКСТ`). It catches spelling/shape mutations rather than observable merge
behavior. Fault injection confirms the consequence: equality mutation is caught only by this SQL-text assertion,
while probe removal and manual gating both remain green.

## Evidence by requested point

### 1 → PASS for organization intersection itself

Exact live DEV command:

```text
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -P pager=off -f docs/audit/merge-org-gate-live-proof-2026-09-14.sql
```

The exact SQL is preserved beside this report in `merge-org-gate-live-proof-2026-09-14.sql`. It executes the
candidate's ten-probe `UNION ALL` shape, uses `doctor_notes.user_id` on both sides, crosses a `doctor_notes` row
with a doctor-assigned `treatment_program_instances` row, checks the promo exclusion, and rolls back.

Output:

```text
BEGIN
DO
CREATE FUNCTION
INSERT 0 1
INSERT 0 15
INSERT 0 9
INSERT 0 2
INSERT 0 2
             scenario              | expected | actual_conflicts | verdict
-----------------------------------+----------+------------------+---------
 different_org_doctor_notes        |        0 |                0 | PASS
 same_org_note_vs_doctor_program   |        1 |                1 | PASS
 promo_program_is_not_history      |        0 |                0 | PASS
 history_on_target_only            |        0 |                0 | PASS
 null_org_matches_null_org         |        1 |                1 | PASS
 null_org_does_not_match_known_org |        0 |                0 | PASS
 appointment_history_never_blocks  |        0 |                1 | FAIL
(7 rows)

ROLLBACK
 audit_rows_after_rollback
---------------------------
                         0
(1 row)
```

The first two rows are the point-1 proof: different organizations produce no conflict; a note and a doctor-assigned
program in the same organization produce a conflict. No `clinical_visit` fixture was used.

### 2 → FAIL because appointment probes widen the gate

Exact schema-introspection command:

```text
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN READ ONLY; SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('clinical_visit','clinical_complaint','clinical_diagnosis','clinical_anamnesis_trauma','clinical_anamnesis_illness','clinical_anamnesis_lifestyle','doctor_notes','patient_bookings','be_appointments','treatment_program_instances') AND column_name IN ('organization_id','patient_user_id','platform_user_id','user_id','assignment_source') ORDER BY table_name, ordinal_position; ROLLBACK;"
```

Output relevant to the question (all 10 probes were returned):

```text
be_appointments              | organization_id   | uuid | NO
be_appointments              | platform_user_id  | uuid | YES
clinical_anamnesis_illness   | patient_user_id   | uuid | NO
clinical_anamnesis_illness   | organization_id   | uuid | YES
clinical_anamnesis_lifestyle | patient_user_id   | uuid | NO
clinical_anamnesis_lifestyle | organization_id   | uuid | YES
clinical_anamnesis_trauma    | patient_user_id   | uuid | NO
clinical_anamnesis_trauma    | organization_id   | uuid | YES
clinical_complaint           | patient_user_id   | uuid | NO
clinical_complaint           | organization_id   | uuid | YES
clinical_diagnosis           | patient_user_id   | uuid | NO
clinical_diagnosis           | organization_id   | uuid | YES
clinical_visit               | patient_user_id   | uuid | NO
clinical_visit               | organization_id   | uuid | YES
doctor_notes                 | user_id           | uuid | NO
doctor_notes                 | organization_id   | uuid | YES
patient_bookings             | platform_user_id  | uuid | YES
patient_bookings             | organization_id   | uuid | YES
treatment_program_instances  | patient_user_id   | uuid | NO
treatment_program_instances  | assignment_source | text | NO
treatment_program_instances  | organization_id   | uuid | YES
(21 rows)
```

No probe table lacks `organization_id`. A probe with no matching rows contributes zero rows, and the join then
returns zero rows; the live `history_on_target_only` case confirms that one-sided history is allowed. However,
`patient_bookings` and `be_appointments` widen the block beyond §18; the appointment-only reproduction in point 1
is the reachable defect.

### 3 → PASS for the chosen NULL rule; one explicit residual case

The live proof shows `NULL/NULL → 1 conflict` and `NULL/known-org → 0 conflicts`. Thus ordinary equality would
indeed allow two un-attributed medical histories, while `IS NOT DISTINCT FROM` blocks them.

Exact DEV inventory command:

```text
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN READ ONLY; SELECT * FROM (SELECT 'clinical_visit' AS probe, count(*) FILTER (WHERE organization_id IS NULL) AS null_org, count(*) FILTER (WHERE organization_id IS NOT NULL) AS known_org FROM clinical_visit UNION ALL SELECT 'clinical_complaint', count(*) FILTER (WHERE organization_id IS NULL), count(*) FILTER (WHERE organization_id IS NOT NULL) FROM clinical_complaint UNION ALL SELECT 'clinical_diagnosis', count(*) FILTER (WHERE organization_id IS NULL), count(*) FILTER (WHERE organization_id IS NOT NULL) FROM clinical_diagnosis UNION ALL SELECT 'clinical_anamnesis_trauma', count(*) FILTER (WHERE organization_id IS NULL), count(*) FILTER (WHERE organization_id IS NOT NULL) FROM clinical_anamnesis_trauma UNION ALL SELECT 'clinical_anamnesis_illness', count(*) FILTER (WHERE organization_id IS NULL), count(*) FILTER (WHERE organization_id IS NOT NULL) FROM clinical_anamnesis_illness UNION ALL SELECT 'clinical_anamnesis_lifestyle', count(*) FILTER (WHERE organization_id IS NULL), count(*) FILTER (WHERE organization_id IS NOT NULL) FROM clinical_anamnesis_lifestyle UNION ALL SELECT 'doctor_notes', count(*) FILTER (WHERE organization_id IS NULL), count(*) FILTER (WHERE organization_id IS NOT NULL) FROM doctor_notes UNION ALL SELECT 'patient_bookings', count(*) FILTER (WHERE organization_id IS NULL), count(*) FILTER (WHERE organization_id IS NOT NULL) FROM patient_bookings UNION ALL SELECT 'be_appointments', count(*) FILTER (WHERE organization_id IS NULL), count(*) FILTER (WHERE organization_id IS NOT NULL) FROM be_appointments UNION ALL SELECT 'treatment_program_instances_doctor', count(*) FILTER (WHERE organization_id IS NULL), count(*) FILTER (WHERE organization_id IS NOT NULL) FROM treatment_program_instances WHERE assignment_source = 'doctor') counts ORDER BY probe; ROLLBACK;"
```

Output:

```text
               probe                | null_org | known_org
------------------------------------+----------+-----------
 be_appointments                    |        0 |       521
 clinical_anamnesis_illness         |        0 |         0
 clinical_anamnesis_lifestyle       |        0 |         2
 clinical_anamnesis_trauma          |        0 |         3
 clinical_complaint                 |        0 |        22
 clinical_diagnosis                 |        0 |        14
 clinical_visit                     |        0 |        17
 doctor_notes                       |        0 |         1
 patient_bookings                   |        0 |       337
 treatment_program_instances_doctor |        0 |        48
(10 rows)
```

There is no current DEV row on which the NULL policy can misclassify a real organization. The residual semantic
case is `NULL` versus a known organization: it is allowed even if external knowledge later shows the legacy NULL
row belonged to that same organization. This is not a defect against the explicit owner decision (`NULL` matches
`NULL`), but it is the one direction in which missing attribution can allow a same-organization collision.

### 4 → FAIL: one named fault survives; the two caught faults rely on SQL shape

Baseline command:

```text
pnpm --dir apps/webapp exec vitest run src/infra/accountMergeMedicalHistory.unit.test.ts
```

Output:

```text
Test Files  1 passed (1)
Tests  7 passed (7)
Duration  583ms
```

Fault injection A, replacing the organization intersection with two independent `EXISTS` queries:

```diff
- SELECT DISTINCT target.organization_id AS conflict_organization_id ... JOIN ...
-   ON duplicate.organization_id IS NOT DISTINCT FROM target.organization_id
+ SELECT EXISTS (...probesFor(targetId)...) AS target_has,
+        EXISTS (...probesFor(duplicateId)...) AS duplicate_has
```

Exact test command: the baseline command above.

Output:

```text
exit_code=1
Test Files  1 failed (1)
Tests  2 failed | 5 passed (7)
rejects an automatic merge ...
  Expected: "medical_history: automatic merge requires support"
  Received: "merge: both users have password credentials"
asks the database for an organization-scoped intersection ...
  AssertionError: expected undefined to be defined
```

Result: **caught**, but one red signal is the prohibited SQL-shape assertion and the other is an artifact of the
fake no longer recognizing the gate query, not a two-organization behavioral oracle.

Fault injection B:

```diff
- ON duplicate.organization_id IS NOT DISTINCT FROM target.organization_id
+ ON duplicate.organization_id = target.organization_id
```

Exact test command: the baseline command above.

Output:

```text
exit_code=1
Test Files  1 failed (1)
Tests  1 failed | 6 passed (7)
AssertionError: expected 'SELECT DISTINCT target.organization_i…' to contain 'IS NOT DISTINCT FROM'
```

Result: **caught only by SQL-text inspection**, not by a behavioral NULL result.

Fault injection C:

```diff
- automaticProbe: (ids) =>
-   sql`SELECT organization_id FROM doctor_notes WHERE user_id = ANY(${ids}::uuid[])`,
```

Exact test command: the baseline command above.

Output:

```text
exit_code=0
Test Files  1 passed (1)
Tests  7 passed (7)
Duration  629ms
```

Result: **not caught**. This alone fails the brief's binary acceptance rule.

All three product mutations were reverted with `apply_patch`. Restoration command and output:

```text
git diff --exit-code -- packages/platform-merge/src/pgPlatformUserMerge.ts apps/webapp/src/infra/accountMergeMedicalHistory.unit.test.ts
git status --short --branch
```

```text
exit_code=0
## wt/merge-org-gate
```

### 5 → current blast radius is correct, but manual-path protection is FAIL

Exact caller command:

```text
rg -n "assertAutomaticMergeHasNoMedicalHistory|mergePlatformUsersInTransaction\\(" packages/platform-merge/src apps/webapp/src apps/integrator/src --glob '*.ts' --glob '!*.test.ts'
```

Output:

```text
packages/platform-merge/src/identityProjectionWrite.ts:115:    await mergePlatformUsersInTransaction(db, target, duplicate, reason, { mergeContext });
packages/platform-merge/src/messengerPhonePublicBind.ts:185:  await mergePlatformUsersInTransaction(mergeClient, target, duplicate, 'phone_bind', {
packages/platform-merge/src/pgPlatformUserMerge.ts:171:async function assertAutomaticMergeHasNoMedicalHistory(
packages/platform-merge/src/pgPlatformUserMerge.ts:325:export async function mergePlatformUsersInTransaction(
packages/platform-merge/src/pgPlatformUserMerge.ts:404:    await assertAutomaticMergeHasNoMedicalHistory(client, targetId, duplicateId);
packages/platform-merge/src/manualMergeResolution.ts:2: * Operator-selected resolution for `mergePlatformUsersInTransaction(..., "manual", { resolution })`.
apps/webapp/src/infra/manualPlatformUserMerge.ts:22: * Applies manual merge with dual exclusive lifecycle locks and `mergePlatformUsersInTransaction(..., "manual", { resolution })`.
apps/webapp/src/infra/manualPlatformUserMerge.ts:35:      const mergeResult = await mergePlatformUsersInTransaction(
apps/webapp/src/infra/repos/pgEmailAuth.ts:308:        await mergePlatformUsersInTransaction(
apps/webapp/src/infra/repos/pgUserByPhone.ts:562:              await mergePlatformUsersInTransaction(
apps/webapp/src/infra/repos/pgUserByPhone.ts:669:                await mergePlatformUsersInTransaction(client, target, duplicate, 'phone_bind', {
apps/webapp/src/infra/repos/pgChannelLinkClaim.ts:148:      await mergePlatformUsersInTransaction(
apps/webapp/src/infra/repos/pgEmailPasswordLookup.ts:122:        await mergePlatformUsersInTransaction(mergeClient, targetId, duplicateId, 'projection', {
```

The current branch calls the gate only inside `if (reason !== 'manual')`; the manual support adapter supplies
`'manual'`, while messenger and email paths supply automatic reasons. The point-5 adversarial mutation removed
that condition:

```diff
- if (reason !== 'manual') {
-   await assertAutomaticMergeHasNoMedicalHistory(...);
- }
+ await assertAutomaticMergeHasNoMedicalHistory(...);
```

Exact test command: the baseline command above.

Output:

```text
exit_code=0
Test Files  1 passed (1)
Tests  7 passed (7)
Duration  674ms
```

Thus current manual behavior is correct by code path, but the existing behavioral suite does not prove or protect
it. The mutation was reverted.

Exact error-text dependency command:

```text
rg -n --fixed-strings "automatic merge requires support" packages apps docs --glob '!docs/archive/**'
```

Output:

```text
packages/platform-merge/src/pgPlatformUserMerge.ts:202:      'medical_history: automatic merge requires support (conflict inside one organization)',
apps/webapp/src/infra/accountMergeMedicalHistory.unit.test.ts:137:    ).rejects.toThrow('medical_history: automatic merge requires support');
```

No caller consumes the full old error message. `classifyMergeFailure` uses only `msg.includes('medical_history:')`;
the email claim path maps the error class to `email_conflict`; other automatic paths consume stable classification
codes. The suffix change therefore has no caller blast radius.

## Final matrix

- 1 → **PASS** → live different-org and same-org cross-table DEV cases, rolled back.
- 2 → **FAIL** → no missing org column and empty-side behavior is correct, but appointment-only rows widen the gate.
- 3 → **PASS** → `NULL/NULL` blocks, `NULL/known` allows; DEV has zero NULL probe rows.
- 4 → **FAIL** → dropping `doctor_notes` is not caught; surviving SQL-text test violates §10a.
- 5 → **FAIL** → current manual branch and caller message handling are correct, but manual-gate injection is not caught.

Overall: **FAIL**. No product code was fixed. No automated UI test was run or created. All live writes were inside
the transaction in the SQL artifact and the output proves `audit_rows_after_rollback = 0`.
