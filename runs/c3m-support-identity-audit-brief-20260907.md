# C3M auditor-live — organization-scoped support identity

## Тест или взгляд

- Повторяемое tenant-boundary поведение support/demographics/media — поведенческие acceptance-тесты с независимым
  fault injection.
- Разовая форма migration/backfill/constraints и privilege declaration — чтение итогового состояния, migration
  checks и отдельный rollback-only preflight; постоянные тесты на SQL/source text запрещены.
- Архитектурные границы, полнота call sites и отсутствие второй favorite-сущности — чтение diff и существующие
  architecture guards, не тесты на строки исходника.

Before every action read the `AGENTS.md` heading map and the relevant full sections. Read §1 migration and
privilege rules, §4a, §5, §9, §10/§10a/§10b, §12 and §24 in full. Read `README.md`,
`docs/RULES/SAAS_FOUNDATION_AWARE_DEVELOPMENT.md`, `deploy/postgres/privileges/README.md`, the whole C3M section
of `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, and the candidate diff before verdict.

Taskdb workstream: `#1098`. Candidate branch: `wt/c3m-support-identity-20260907`; candidate HEAD after syncing
current integration base: `251b9f1fc`; product commit: `edf156aa2`; integration base: `81d3e417c`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M-02 — «Закрепить onSupport
как единственный источник группы «Избранные / На сопровождении»; исправить composite identity support profile,
миграцию/backfill/ambiguity report, ports/infra/in-memory parity и tenant negatives до добавления новых client
overrides. Не создавать отдельный favorite».

This is the first independent audit of C3M-02. It is a gate against that authority, not a source of new scope.

## Blind acceptance protocol

Before opening existing tests, derive and write the kill-set from the oracle. At minimum distinguish these fault
classes, refining them only where the implementation reveals a real reachable path:

1. The same `patient_user_id` belongs to two organizations: reading or changing support/demographics in one
   organization must neither read nor mutate the other organization row.
2. A row absent in organization A must not fall back to the same patient's row in organization B; create/update
   must target the exact composite identity.
3. Every support-profile port, service and route call must carry authoritative organization context. Patient media
   routes must derive it from an already-authorized organization relationship, never trust an arbitrary client
   organization id or a process-global fallback.
4. `onSupport` remains the only group property. No `favorite`, second group, second switch or compatibility path
   may appear.
5. The migration must backfill only unambiguous rows, explicitly report/refuse ambiguous multi-organization rows,
   make `organization_id` mandatory, and replace patient-only uniqueness with composite uniqueness without losing
   unrelated profile data.
6. Drizzle schema, PostgreSQL repository, in-memory repository and all route/service call sites must agree on the
   composite identity. Existing program-interaction behavior must remain unchanged inside the selected organization.

For every named behavioral fault, leave either a green acceptance test whose fault injection you personally proved
would fail, or a failing acceptance test that demonstrates the candidate defect. Do not create tests for source
text, SQL text, function signatures, call counts, labels, DOM shape, formatting, or implementation details. Inspect
migration shape and one-time state directly rather than encoding it as a permanent source-text test.

Existing `uploadDoorAcceptance.route.test.ts` fixtures that omit the newly mandatory organization context may be
updated minimally as test infrastructure. Keep their original behavioral assertions. Add only indispensable tenant
negative behavior; do not broaden into media feature work.

## Required inspection and evidence

- Review the complete diff `81d3e417c...251b9f1fc`, not only the worker report.
- Verify all touched reads and mutations, including demographics stored in `doctor_patient_support`, support policy,
  dashboard/card bootstrap and the three patient program-submission media routes.
- Verify clean architecture and that no second helper/path bypasses the canonical organization-scoped service.
- Independently analyze migration privileges: identify the object owner/execution role, whether grants/default
  privileges or the privilege declaration must change, and whether the migration contains forbidden GRANT/REVOKE.
  Record the analysis in the artifact. Do not modify privilege declarations unless a real required-right gap exists.
- Run targeted behavioral checks, webapp typecheck, scoped ESLint, migration order/privilege generators, architecture
  guards and `git diff --check`. Do not run full CI or occupy the shared dev server.
- Do not run the owner-aware rollback-only migration preflight in this pass. The lead will launch that as a separate
  bounded verification because long DB operations must survive the agent turn and be checked separately.
- Do not touch PROD, TEST, deployment, tariffs, presets, roles, terminology UI, channel defaults, client overrides,
  symptom tracking or module navigation.

Write `runs/c3m-support-identity-audit-251b9f1fc.md` with the kill-set, fault-injection evidence, commands/results,
privilege analysis, findings and binary verdict. A finding must name a reachable scenario, impact, exact violated
requirement and evidence. Recommendations/style are not findings.

The auditor does not fix product code. It may commit only its acceptance tests/test-fixture corrections and the
audit artifact, staging explicit paths only; never `git add -A`, never push. If the candidate fails, leave the
acceptance oracle failing and report the precise handoff. If it passes, all committed tests must be green. Commit
before ending the single turn with a message containing `#1098`, `C3M-02`, verdict and evidence.
