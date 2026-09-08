# Independent auditor brief: clinical complaint → patient symptom tracking

## Exact candidate and authority

Audit committed candidate `b6413042e` on branch
`wt/patient-symptom-bridge-audit-20260908` against the worker authority in
`/home/dev/dev-projects/bcb-wt-patient-symptom-clinical-bridge-20260908/.lead/briefs/patient-clinical-symptom-bridge-20260908.md`
and the owner's requirement: when a doctor adds or updates a clinical symptom, the same patient receives a linked
symptom tracking, can add point-in-time entries, and sees doctor and patient values in the same history/graph. Do
not add delayed messages or author/source distinction.

Read `AGENTS.md` heading map and the complete relevant sections: migration rules in §1, §4a, §5, §9–§10b,
§15–§17 and §24. This is an audit gate, not authority for new product scope.

## Тест или взгляд — классификация до проверки

- Повторяемое поведение: создание/обновление/закрытие жалобы, зеркалирование severity, tenant/patient walls и
  сохранение единой истории — поведенческие тесты и blind kill-set.
- Разовое устройство: schema/FK/unique, миграция/backfill, privilege declaration, отсутствие GRANT/REVOKE и
  архитектурные границы — чтение итогового diff/DDL/DI, без тестов исходного текста.
- Визуальный patient UI в этом аудите не проверяется; его принимает владелец по скриншотам интеграционной ветки.

## Audit method

Before reading existing tests, write a blind kill-set from the authority. Then inspect the complete diff
`6102a732d..b6413042e`, production paths, schema, migration, RLS/privilege declarations and actual current tests.
For each requirement classify `test` or `look` under §24.4.

Prove at minimum:

1. create complaint and both visit creation paths create exactly one durable linked tracking for the same tenant
   and patient, never by symptom title;
2. initial and later doctor severity writes reach the same history path that patient instant entries use;
3. resolving archives/deactivates the linked tracking without deleting history, and reopening restores it;
4. cross-patient/cross-organization ids fail closed;
5. transaction/DI changes do not bypass existing ports or break patient SECURITY DEFINER entry points;
6. migration/backfill is deterministic and idempotent, follows schema-B/current privilege declarations, contains
   no GRANT/REVOKE, and does not create duplicate tracking links;
7. existing standalone diary tracking remains functional.

Write only missing behavioral acceptance tests whose failure is expensive and silent under §10a/§10b. Tests must
exercise behavior/functions/data flow; no source-text, formatting, selector-count, table-count or migration-string
tests. Validate each new behavioral test with one intentional production fault per independent kill class, then
restore all production changes. Do not fix product code.

No disposable database, historical replay, PROD, TEST deployment, push or landing. If DB runtime evidence is truly
required, name it BLOCKED rather than touching a database; static migration/privilege inspection is allowed.

## Deliverable

Create `docs/_TODO/runs/patient-ui-system-audit-20260907/PATIENT_SYMPTOM_BRIDGE_ACCEPTANCE_20260908.md` with one
`PASS|FAIL|BLOCKED` line per numbered requirement, exact evidence/commands, any real MUST FIX scenario and the blind
kill-set. Commit only the audit report and behavioral acceptance tests you authored. Leave the worktree clean and
do not push.
