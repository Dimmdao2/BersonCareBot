# C3M-11 audit correction (`#1098`)

Read `AGENTS.md` first: the heading map, §5, §10a, §10b, §12, §16, §21, §22 and §24. Authority is
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md` C3M-11/C3M.8 and the accepted audit
`runs/c3m-support-terminology-ui-audit-6b8fd2732.md` at commit `503fbcdaa`.

Work only in `wt/c3m-support-terminology-ui-20260907`. Fix exactly the two accepted findings:

1. Bind the existing `supportGroupLabel` prop inside `DoctorPatientTermsProvider` so the doctor workspace compiles
   and renders. Do not create another context or resolver.
2. Finish the existing terminology projection on every active surface named by C3M11-A2: patient-card support
   since-date, patient-list heading, mobile star-filter accessible label, support-segment tooltip, Today links/text,
   Today preference label and support analytics title. Use the same central resolved terms; do not add page-local
   settings reads or a second dictionary. The Settings chooser's two option names describe the choices and remain
   unchanged.

Preserve the one existing `onSupport` property, tri-state policy behavior and explicit reset. Do not change booking,
schedule, cancellation, payment, archive/block semantics, portal/symptom behavior, tariffs, presets or professions.
Do not touch the unrelated `accessLifecycleSurfaces.ui.test.tsx` failure from #1099 or the non-finding in-memory
test-port observation. Do not write new tests: the auditor retained the C3M-11 behavior oracle. Do not encode UI
wording, counts or DOM shape in tests. Do not run full CI in this branch.

Run the retained C3M-11 policy/route tests, the relevant existing UI suites, webapp typecheck, scoped ESLint/Prettier,
applicable architecture gates and `git diff --check`. Inspect the changed desktop/mobile UI on an isolated port if
the environment is available; otherwise report that live step to the lead without inventing a substitute. Commit
all task-related changes with explicit paths, `#1098`, evidence and remaining work; never `git add -A` and never push.

