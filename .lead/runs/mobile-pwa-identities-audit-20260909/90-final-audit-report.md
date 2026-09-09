# #915 M1-01…M1-06 auditor-live report

Candidate: `93f2d7b34d2d85533e3d429d4fa2148237e86c94` (base `a3a33022765f18f4fb1f9665e4ec31c3ec261e45`).

## Result: MUST FIX

M1-01 → PASS: default `Therapy Go`, env override and preserved installed-PWA identity are covered by `envDatabaseRuntime.unit.test.ts` and `staffPwaManifest.unit.test.ts`.

M1-02/M1-03 → PASS: current-brand `any`/`maskable`/Apple outputs are distinct and staff remains `Therapysto` with its stable identity.

M1-04 → PASS: branded patient metadata retains the clinic name and legacy blue assets.

M1-05 → PASS: admin metadata clears PWA declarations, both manifest handlers 404, and shell bootstrap side effects are absent.

M1-06 → PASS: specialist redirect and admin exclusion from doctor/account install paths are covered; patient preserves the push opt-in within `PwaInstallSection`.

M1-07 → not changed; no native detector was found in the M1 diff.

## Finding

`apps/mobile-shell/README.md` still instructs `pnpm --dir apps/mobile-shell run derive:icons`, but candidate `apps/mobile-shell/package.json` renamed the only command to `derive:brand-assets`. The documented command fails because `derive:icons` no longer exists. This violates M1-02's honest renamed command requirement. Product code is read-only in this audit; no fix was made.

## Fault injection (7/7 killed)

- Therapy Go regression → `staffPwaManifest.unit.test.ts`: expected `Therapy Go`, received `Therapygo`.
- Ignore `PATIENT_APP_NAME` → `envDatabaseRuntime.unit.test.ts`: expected injected name, received `Therapy Go`.
- Patient/staff icon cross-wire → staff manifest test: staff output contained `/therapygo-pwa-icon-192.png`.
- Branded patient re-icon → branded metadata test: expected legacy `/pwa-icon-192.png`.
- Admin metadata/manifest regression → admin metadata assertion and staff route 404 assertion failed.
- Admin bootstrap guard removal → `DoctorWorkspaceShell.ui.test.tsx`: bootstrap spy called once.
- Doctor install inversion / patient push removal → redirect assertions failed for both roles; patient install UI could not find `Enable patient push`.

All production mutations were restored.

## One-time inspection

`pnpm --dir apps/mobile-shell run derive:brand-assets` ran twice; `cmp /tmp/pwa-assets-first.sha256 /tmp/pwa-assets-second.sha256` succeeded and all eight generated files passed `sha256sum -c`. `identify` reported transparent sRGBA 192/512/maskable/180 square outputs. Alpha bounds are centered (for 512: Therapy Go `250x282+134+126`; Therapysto `275x239+116+146`). Legacy blue and black asset SHA-256 files remain present. Exact reference scan showed default patient/staff paths separated and branded metadata on legacy blue paths; install directory scan found only patient and doctor install routes, no `/setup`.

## Validation

Targeted command after building `packages/db-principal`: 8 files, 39 tests passed. `pnpm --dir apps/webapp typecheck` was launched successfully; its chained lint result was not captured after the shell command exceeded the tool foreground response window, so neither is claimed green here. `git diff --check` was clean for candidate and audit diff.
