# C3M worker — rehabilitation slice

Read the `AGENTS.md` heading map before every action, then §4a, §5, §9, §10/§10a/§10b, §12, §16–§21 and
§24 in full. Read `README.md`, the whole C3M section of
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, and accepted C3M-01/03/06 code before editing.

Taskdb workstream: `#1098`.

Источник оракула: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M-08 — «Скрыть/запретить
ЛФК/program/catalog paths и зависимые comment/media surfaces».

Implement C3M-08 only. The lead closes it after independent audit/live acceptance.

## Required behavior

1. Use the accepted single workspace resolver/guards. `rehabilitation=OFF` removes the patient-card `ЛФК` tab,
   Overview program widgets/actions, the complete specialist rehabilitation catalog cluster (exercises, LFK
   complexes/templates, clinical tests/test sets, recommendations and treatment-program paths), program assignment
   and all other rehabilitation entry/cross-link surfaces.
2. Gate every rehabilitation read/write API and Server Action with the frozen workspace-disabled `403`; direct
   disabled pages use the frozen page `404`. Hiding menu/buttons alone is not acceptance. Keep organization/actor
   authorization and existing entitlement availability as prior boundaries; preference only narrows them.
3. Because rehabilitation is the parent, its OFF state also removes and denies program comments and program media
   surfaces regardless of their stored child preferences. Do not overwrite those child preferences; ON restores
   their previous effective result through the accepted dependency resolver.
4. Stop hidden program/catalog bootstrap, counters, feeds, badges, pollers, notifications and background work that
   are owned by the touched rehabilitation path. Reuse existing central loaders/services/registries rather than
   adding page-local checks or a second program gate.
5. OFF performs no deletion, archive, unlink or rewrite of existing programs, templates, sessions, comments or
   media. OFF→ON restores the same data and assignments.
6. Preserve clients, basic Overview notes, tasks, appointments, medical record, encounters, files/account, direct
   chat, independent mailings and Today presentation.

## Explicit non-scope

No channel default/per-client override UI, chat or mailing enforcement beyond dependency-owned rehabilitation
surfaces, portal operational policy, symptom tracking, terminology sweep, presets, tariffs/add-ons/domain,
profession roles, solo/clinic fork, database migration or new UI dependency.

This product worker writes no tests (`AGENTS.md` §10b): no label/DOM/component-source/function-format tests. The
independent auditor owns the blind behavioral kill-set. Run affected existing program/catalog/service/route checks,
webapp typecheck, scoped ESLint, architecture guards and `git diff --check`; no full CI or shared dev server.

Commit explicit in-scope paths only with `#1098`, why, evidence, `C3M-08`, and remaining independent audit. Never
`git add -A`, never push, and do not finish the single turn before the commit exists.
