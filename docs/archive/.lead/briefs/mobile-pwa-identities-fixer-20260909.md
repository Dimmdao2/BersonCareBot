# Worker correction brief — #915 PWA identities after audit

Authority: `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`, exact M1-01…M1-06 and owner §1.5.
Candidate `93f2d7b34`, audit authority `a9e8c4f08`, independent audit/tests `dccaef384`, report
`.lead/runs/mobile-pwa-identities-audit-20260909/90-final-audit-report.md`. Deliver both corrections below in one
coherent pass; do not broaden into M1-07 or redesign install UI.

## Mandatory reading

Before every action run the AGENTS.md heading map. Read the global decision method; §1/§1b; §5; §9;
§10/§10a/§10b; §12; §15–§17; §21 and §24. Read the active M1 plan, original worker/auditor briefs and report,
the exact base→candidate/audit diff, both manifest builders/routes, `surfaceLayoutMetadata.ts`, product-surface
resolver, asset generator/package command and `apps/mobile-shell/README.md`. Use code-search before blind grep.

## Required outcome

1. Fix the audit finding: every active documented brand-asset generation command must invoke the actual existing
   `derive:brand-assets` package script. Do not restore the obsolete `derive:icons` alias; the rename must be honest.
2. Fix the lead-confirmed M1-04 gap missed by the retained test: `buildPatientPwaManifest(resolved)` must select
   icons by resolved patient surface. `patient_default` gets the new Therapy Go 192/512 plus distinct maskable icon;
   `patient_branded` keeps the legacy blue `/pwa-icon-192.png` and `/pwa-icon-512.png` installed-PWA icons and must
   not reference any Therapy Go asset. Preserve the branded name from `surfaceDisplayName`, stable `id=/app`,
   `scope=/app`, `start_url=/app/patient`, and the existing default/staff identities. A branded surface has no new
   clinic-specific maskable asset, so do not falsely reuse the Therapy Go maskable icon.
3. Keep one identity source/builder. Reuse the existing icon-set concept or the smallest typed extension; do not
   create a second manifest, route, component or brand registry. Preserve platform-admin 404/metadata/bootstrap
   exclusion, specialist install redirect and all retained assets.

## Boundaries

Expected product scope: `apps/webapp/src/shared/lib/pwa/patientPwaManifest.ts` and
`apps/mobile-shell/README.md`; touch another production file only if the single existing identity boundary strictly
requires it and explain why. Do not edit generated PNGs unless their bytes unexpectedly differ, and never delete
legacy blue/black/admin/clinic assets. Do not touch Android Kotlin/Gradle/plugin implementation, Push/Jitsi/media,
M1-07 NativeRuntime, unrelated UI, DB, deploy, TEST or PROD.

You are a worker: **do not create, edit, delete or reformat tests or audit artifacts**. Run the auditor's retained
tests read-only; product behavior must make them green. Do not weaken an oracle.

## Validation and delivery

Through the shared host lock run the targeted PWA/manifest/metadata/install suites retained by the auditor,
webapp typecheck, scoped ESLint, the brand generator twice with byte-stability check, and `git diff --check`.
Full root CI waits for final integration.

Commit only explicit in-scope product paths with a meaningful `#915` message; never `git add -A`; do not push.
Report exact SHA, files, before/after manifest behavior, commands/results and clean status. Do not finish with a
foreground process running.
