# Worker brief: patient segmented navigation primitive

## Authority

Owner: «свести к одному общему набору элементов и стилей без хардкода в тегах и дублирования значений в css»
and «давай агентам один примитив/токен на объединение по очереди чтобы не пересекались». This pass owns exactly one
family: patient segmented tabs/pagers. Systematize the existing patient cabinet; do not invent or choose a new DNA.

Read `AGENTS.md` heading map and §§10a, 10b, 15, 17, 21, 24. Read R1/F5 and the segmented token inventory in
`/home/dev/dev-projects/bcb-wt-patient-ui-system-audit-20260907/docs/_TODO/runs/patient-ui-system-audit-20260907/PATIENT_UI_SYSTEM_AUDIT.md`.
Use `code-search` before exact `rg`.

## Exact scope

You own only:

- a patient-local segmented presentation primitive under `apps/webapp/src/shared/ui/patient/`;
- `apps/webapp/src/shared/ui/patient/primitives/tabs.tsx` only if necessary to expose the existing Base UI behavior;
- `apps/webapp/src/app/app/patient/diary/PatientDiaryWeekNavStrip.tsx`;
- `apps/webapp/src/app/app/patient/content/[slug]/PatientDailyWarmupPager.tsx`;
- `apps/webapp/src/app/app/patient/treatment/program-detail/PatientPlanTabStrip.tsx` and its panel linkage;
- the matching segmented block in `PatientProgramStageItemPageClient.tsx` only if it is the same semantic family;
- behavioral tests only if a current suitable test file already exists and the test catches navigation behavior.

Do not edit `patient.css`: portal-safe `--patient-segmented-*` tokens already exist in the integration candidate and
will be cherry-picked separately. In this worker branch, reference those variable names without fallback literals.
Do not edit Button/Card/Input/modal/chat, doctor UI, API/domain/DB, or unrelated patient pages.

## Required outcome

1. Create one typed patient segmented strip/cell presentation contract that owns the current container/cell geometry,
   dividers, focus, active/hover/disabled states and uses only `--patient-segmented-*`/existing patient tokens.
2. Migrate the exact pager/strip callers above where semantics match. Preserve labels, arrows, routes, disabled logic,
   dimensions and current visual values. Do not mechanically force unlike controls into the primitive.
3. `PatientPlanTabStrip` must use the existing patient/Base UI Tabs behavior or an equivalent single typed contract:
   roving focus and ArrowLeft/ArrowRight/Home/End work; tab/panel ids and `aria-controls`/`aria-labelledby` are linked.
4. Do not create cross-zone shared UI and do not import doctor primitives.
5. No tests that inspect source, class strings, tag counts, colors, formatting or DOM wrapper counts. Only observable
   keyboard/navigation behavior qualifies.

Run `git diff --check`, targeted ESLint and the cheapest relevant existing behavioral tests. Commit only allowed paths
on `wt/patient-ui-segmented-20260908`; no push, feat landing, TEST deployment or screenshots. Finish the one turn with
SHA and exact checks; do not wait on a background process.
