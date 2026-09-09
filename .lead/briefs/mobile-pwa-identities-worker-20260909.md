# Worker brief — #915 two browser/PWA identities and install surfaces

Deliver M1-01 through M1-06 as one coherent browser/PWA stage. This is product code through the repo port. Do not
write, modify, rename, or delete tests; independent `auditor-live` owns behavioral tests. Do not implement M1-07
yet, because the shared `NativeRuntime` boundary is the next accepted stage. Do not touch native SDK/plugin code,
push backend, video meeting code, media upload UI, database/migrations, TEST/PROD or unrelated UI.

## Mandatory reading before action

1. Run `grep -n "^## \|^### " AGENTS.md`; read the global decision method, §1/§1b, §5, §7, §9–§12,
   §14a–§17, §20–§22 and §24 in full. Read `README.md`, `docs/README.md`, both patient/doctor UI style guides,
   `docs/ORCHESTRATION_BINDINGS.md`, and `/home/dev/brain/docs/MODEL_TIERS.md`.
2. Read the complete active authority `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`, especially
   M1-01…M1-07 and the measured baseline. Read the current surface/branding authority and module-local PWA docs.
3. Use code-search before exact `rg`. Trace all manifest, root metadata, install page/account tab, bootstrap and
   admin-surface entrypoints before editing. Inspect existing primitives; parameterize them rather than create
   replacement install components or a second metadata resolver.

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`: «Единственные пользовательские
install-поверхности — `/app/patient/install` и `/app/account?tab=install` для специалиста.» Preserve those two
surfaces and the existing `/app/doctor/install` compatibility redirect; do not create `/setup` or another UI.

## Required behavior — M1-01…M1-06

- Change the single default patient product-name literal to `Therapy Go`; keep the existing `PATIENT_APP_NAME`
  override and installed-PWA `id`, `scope`, `start_url=/app/patient` stable.
- The default patient PWA/metadata uses the supplied source with sphere; staff/Therapysto uses the supplied source
  without sphere. Produce NEW explicitly named `therapygo-*` and `therapysto-*` 192, 512, maskable 512 and
  Apple-touch 180 assets. Never overwrite/delete `/pwa-icon-*` or `/apple-touch-icon.png` (retained blue future-
  clinic identity) and never overwrite/delete `/staff-pwa-*` (retained black platform-admin identity). Center the transparent,
  non-square source on a square canvas and keep the mark within the maskable safe zone. Manifest entries must use
  separate `purpose: 'any'` and `purpose: 'maskable'` files.
- Reuse/parameterize the deterministic brand-asset generator landed by the Android shell foundation. If its target
  model cannot emit web assets, rename `derive-android-icons.mjs` to an honest shared `derive-brand-assets.mjs` in
  the same change, extend that one generator and update its one package command; do not copy its crop/safe-zone
  algorithm into a second script. The worker may change only the generator/command wiring needed for that reuse,
  not other native shell source. Record the exact generation command and verify dimensions/alpha.
- Staff manifest and metadata say `Therapysto`, keep `start_url=/app/doctor`, and never reference patient icon
  files. Default patient and staff manifest builders never reference one another's files.
- Preserve branded patient identity exactly: `patient_branded` keeps `effectivePatientBrand.patientAppName` and
  the legacy blue `/pwa-icon-*`/`apple-touch-icon.png` icon paths until per-clinic icons exist. Do not silently point
  tenant/custom-domain metadata at Therapy Go icons. Use one parameterized metadata/manifest path; no duplicate
  branded manifest builder.
- Platform admin is completely outside patient/staff PWA: admin metadata has no manifest/apple-web-app/PWA icons;
  both manifest routes return 404 for `platform_admin`; `DoctorWorkspaceShell` does not mount
  `StaffPwaBootstrap` OR `StaffWebPushBootstrap`; account/install UI is impossible for admin for every tab/redirect
  path. Prefer the existing `canSurfaceEnterRoute` manifest eligibility chokepoint and return the browser-only
  `platformAdminLayoutMetadata` with `manifest:null`, `appleWebApp:null`, `icons:null`; do not add a second admin
  classifier. Preserve the
  existing black admin asset; do not replace/delete clinic/admin legacy source assets.
- Keep `/app/patient/install` on existing `PwaInstallSection`; keep staff install at `/app/account?tab=install` on
  existing `StaffPwaInstallSection`; consolidate the patient page's duplicate static guide into the existing
  component while retaining its existing `WebPushOptInControls`. `/app/doctor/install` is redirects only:
  specialist goes to account install, platform admin goes to the existing admin home/not-found and never renders
  staff install UI. Keep short, accurate iOS Safari add-to-home-screen and Android browser installation instructions
  by editing existing components only. No speculative help copy or new modal/page.

M1-07 stays open and must not be emulated with a local `window.Capacitor` check. Do not alter service-worker
registration/install prompts/push controls in this stage except where required to prevent platform-admin mounting;
the next web-adapter stage will route every such point through the one typed `NativeRuntime` boundary.

## One shared pass / allowed scope

Expected product scope is limited to current PWA/surface configuration and install files under
`apps/webapp/src/shared/lib/pwa/**`, `shared/lib/surface/surfaceLayoutMetadata.ts`, existing surface/product-name
config, existing manifest route handlers, current install/account/shell entrypoints, generated PWA assets, and the
single shared asset generator/command. Before adding any function/component, apply AGENTS §5: extend the existing
manifest/metadata/install source. Do not create parallel PWA builders, install panels, admin-specific fallback PWA,
or a second branding source.

The branch must start only after any concurrent favicon/metadata work in the integration checkout is committed and
reconciled. Preserve its `therapygo-favicon-32.png`/`therapysto-favicon-32.png` work if present; do not overwrite or
silently absorb an uncommitted neighbor diff.

## Validation and delivery

No tests. Run existing non-test checks only: regenerate assets from the two committed sources, inspect exact PNG
dimensions/alpha/safe-zone, package typecheck/lint/build for webapp and any touched shell generator wiring, scoped
route/metadata build checks that do not require real provider access, `git diff --check`, and exact reference scans
proving no patient/staff icon cross-link and no platform-admin PWA path. Do not run full CI.

Commit all and only the allowed paths with explicit staging, never `git add -A`; do not push. Reference `#915` and
M1-01…M1-06 in the commit message, state that M1-07/native detection remains open, and report commit SHA, exact
commands/results, generated asset paths/dimensions and any factual blocker. Do not finish while a foreground build
is running.
