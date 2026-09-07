# C3M worker — independent encounters slice

Read the `AGENTS.md` heading map before every action, then §4a, §5, §9, §10/§10a/§10b, §12, §16, §17,
§21 and §24 in full. Read `README.md`, the whole C3M section of
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, and accepted C3M-01/03/06/07a code before
editing.

Taskdb workstream: `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M-07b — «Независимо
скрыть/запретить старт/историю приёмов и visit-bound осмотр, интервенции и назначения при OFF, сохранив
appointments, medical record и исторические данные для re-enable».

Implement C3M-07b only. The lead closes it after independent audit/live acceptance.

## Required behavior

1. Use the accepted single workspace resolver/guards. `encounters=OFF` removes start-encounter CTA, encounter
   history, encounter pages, examination/intervention/prescription and every other visit-bound read/write surface;
   hidden encounter bootstrap/fetch work must not run.
2. Gate every encounter read/write API and Server Action with the frozen workspace-disabled `403` outcome, and
   direct disabled encounter pages with the frozen page `404`. UI hiding alone is not acceptance. Keep existing
   organization/actor authorization and record ownership boundaries intact.
3. Preserve appointments and booking completely: the specialist may still schedule and view appointments without
   creating an encounter. Do not alter online booking, schedule, cancellation, payment or prepayment policy.
4. Preserve the independent longitudinal medical record. When `encounters=OFF` and `medical_record=ON`, the same
   `Карта` container remains with symptoms, diagnoses, anamnesis/problem history and other record sections. Do not
   gate those through `encounters`.
5. Preserve clients, basic Overview notes, tasks, files/account and Today presentation. OFF performs no mutation or
   deletion; OFF→ON restores the same encounter history and visit-bound records.
6. Extend the existing patient-card/encounter services and chokepoints. Do not create a second card, visit model,
   repository, route family or wrapper when the existing common pass can carry the module context.

## Explicit non-scope

No medical-record gating, rehabilitation, communications, portal, symptoms patient tracking, terminology sweep,
presets, tariffs/add-ons/domain, profession roles, solo/clinic fork, database migration or new UI dependency.

This product worker writes no tests (`AGENTS.md` §10b): no label/DOM/component-source/function-format tests. The
independent auditor owns the blind behavioral kill-set. Run affected existing encounter service/route checks,
webapp typecheck, scoped ESLint, architecture guards and `git diff --check`; no full CI or shared dev server.

Commit explicit in-scope paths only with `#1098`, why, evidence, `C3M-07b`, and remaining independent audit. Never
`git add -A`, never push, and do not finish the single turn before the commit exists.
