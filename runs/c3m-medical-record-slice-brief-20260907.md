# C3M worker — independent medical-record slice

Read the `AGENTS.md` heading map before every action, then §4a, §5, §9, §10/§10a/§10b, §12, §16, §17,
§21 and §24 in full. Read `README.md`, the whole C3M section of
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, and accepted C3M-01/03/06 code before editing.

Taskdb workstream: `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M-07a — «Независимо
скрыть/запретить продольную медкарту при OFF, сохранив clients, Overview notes, tasks, appointments, encounters,
files/account и исторические данные для re-enable».

Implement C3M-07a only. The lead closes it after independent audit/live acceptance.

## Required behavior

1. Use the accepted single workspace resolver/guards; do not create a page-local setting parser or a parallel
   medical-record gate. `medical_record=OFF` removes symptoms, diagnoses, anamnesis/problem history and other
   longitudinal clinical-record surfaces from the doctor card, Overview widgets and direct entry paths, and skips
   their hidden bootstrap/fetch work.
2. Gate every doctor medical-record read/write API or Server Action with the frozen workspace-disabled `403`
   envelope. UI hiding alone is not acceptance. Keep organization/actor authorization as the first boundary and
   workspace preference as the narrowing product gate; preference must never broaden record visibility.
3. Preserve the independent encounter path. When `medical_record=OFF` and `encounters=ON`, the existing `Карта`
   container remains and contains only encounter start/history/visit-bound content. Do not hide appointments,
   schedule, booking, encounter data or encounter actions in this slice.
4. Preserve clients, basic Overview notes, tasks, files and account surfaces. Do not change Today presentation.
5. OFF performs no delete/archive/update of existing clinical data. OFF→ON renders the same stored record and
   history without backfill or reconstruction.
6. Reuse and split the existing `PatientTabKarta`/bootstrap/service paths as needed; do not create a second card,
   second clinical repository, second API family or generic abstraction without a demonstrated second consumer.

## Explicit non-scope

No encounter gating, rehabilitation, communications, portal, symptom `patient_tracking_enabled`, channel policy,
terminology sweep, presets, tariffs/add-ons/domain, profession roles, solo/clinic fork, database migration or new UI
dependency. This stage controls the specialist medical record, not patient symptom-tracking visibility.

This product worker writes no tests (`AGENTS.md` §10b): no label/DOM/component-source/function-format tests. The
independent auditor owns the blind behavioral kill-set. Run affected existing service/route checks, webapp typecheck,
scoped ESLint, architecture guards and `git diff --check`; no full CI or shared dev server.

Commit explicit in-scope paths only with `#1098`, why, evidence, `C3M-07a`, and remaining independent audit. Never
`git add -A`, never push, and do not finish the single turn before the commit exists.
