# #915 PWA identity correction — confirmation audit

Candidate chain: product `93f2d7b34`, audit/tests `dccaef384`, correction authority `b88cae29a`, corrected product `4f646315c`.

## Verdict: PASS for M1-01…M1-06 correction

The correction preserves one typed patient icon-set boundary. The public manifest builder now distinguishes the default Therapy Go installation from a branded clinic installation without changing the branded clinic name or installed-PWA route identity.

| Authority | Result | Evidence |
| --- | --- | --- |
| M1-01 | PASS | `buildPatientPwaManifest(patient_default)` retains `id: '/app'`, `scope: '/app'`, `start_url: '/app/patient'` and `Therapy Go`. |
| M1-02 | PASS | Default output has only Therapy Go 192/512 `any` entries and its separate Therapy Go `maskable` entry. |
| M1-03 | PASS | Retained manifest suite keeps the separate Therapysto output and current-brand assets. |
| M1-04 | PASS | Added public builder oracle proves `patient_branded` retains `Clinic A Care`, stable id/scope/start URL, exactly legacy blue 192/512 `any` icons, and no maskable/Therapy Go entry. |
| M1-05 | PASS | Retained metadata/manifest-route/admin-bootstrap tests pass. |
| M1-06 | PASS | Retained install redirect/account/patient-push tests pass. |

## Permanent behavioral test

Extended `apps/webapp/src/shared/lib/pwa/staffPwaManifest.unit.test.ts` rather than adding a parallel suite.

- Fault protected: a branded clinic manifest receives Therapy Go icons or a false clinic maskable icon.
- User-visible consequence: a clinic-installed PWA silently becomes Therapy Go or advertises an asset that does not exist for that clinic.
- Oracle: M1-04 and owner §1.5; the public `buildPatientPwaManifest(BRANDED_RESOLVED)` output.

## Fault injection

**убито 3 / непойманных 0**

| Fault | Resulting failed assertion / command | Restored |
| --- | --- | --- |
| Default manifest cross-wired to legacy blue icons and its maskable entry omitted | `keeps the patient installation identity and only renames it` failed at `expect(patient.icons).toEqual(...)`: received blue 192/512 and no maskable entry. | Yes |
| Branded manifest cross-wired to the default Therapy Go icon set (including its maskable icon) | `uses the branded Host resolve for the patient manifest identity` failed at `expect(branded.icons).toEqual(...)`: received Therapy Go 192/512 plus maskable. | Yes |
| Active mobile-shell README command changed to obsolete `derive:icons` | `pnpm --dir apps/mobile-shell run derive:icons` failed with `ERR_PNPM_NO_SCRIPT Missing script: derive:icons`. | Yes |

## One-time command and asset inspection

- Both active README command locations — `apps/webapp/public/brand/README.md:13` and `apps/mobile-shell/README.md:23` — contain `pnpm --dir apps/mobile-shell run derive:brand-assets`; that command was run twice successfully.
- Hash command over the generated web and Android asset outputs recorded 42 files. Both `cmp /tmp/915-brand-assets-before.sha256 /tmp/915-brand-assets-after-first.sha256` and `cmp /tmp/915-brand-assets-after-first.sha256 /tmp/915-brand-assets-after-second.sha256` succeeded.
- `identify` confirmed current Therapy Go and Therapysto output sizes: 192, 512, maskable 512, Apple touch 180; all are `srgba`.
- Retained assets remain present: blue `pwa-icon-192.png`, `pwa-icon-512.png`, `apple-touch-icon.png`; black `staff-pwa-icon-192.png`, `staff-pwa-icon-512.png`.

## Validation

Passed through `/home/dev/brain/host-orch/run-tests.sh`:

```bash
pnpm --dir apps/webapp exec vitest run src/config/envDatabaseRuntime.unit.test.ts src/config/surfaceRoutes.unit.test.ts src/shared/lib/pwa/staffPwaManifest.unit.test.ts src/app/manifest.webmanifest/route.route.test.ts "src/app/app/(staff-personal)/doctor/install/page.unit.test.ts" src/app/app/account/layout.unit.test.ts src/app/app/patient/install/page.ui.test.tsx src/shared/ui/doctor/shell/DoctorWorkspaceShell.ui.test.tsx
```

Result: 8 files, 50 tests passed.

Passed through the same host lock:

```bash
pnpm --dir apps/webapp exec eslint src/shared/lib/pwa/patientPwaManifest.ts src/shared/lib/pwa/staffPwaManifest.unit.test.ts src/shared/lib/surface/surfaceLayoutMetadata.ts src/app/manifest.webmanifest/route.ts src/app/manifest-staff.webmanifest/route.ts "src/app/app/(staff-personal)/doctor/install/page.tsx" src/app/app/account/layout.tsx src/app/app/patient/install/page.tsx src/shared/ui/doctor/shell/DoctorWorkspaceShell.tsx
```

`pnpm --dir apps/webapp typecheck` was also executed through the lock but is not green: an unrelated existing error is in `src/modules/patient-notifications/videoMeetingInvitationNativePush.contract.test.ts:23` (`Promise<void>` is not assignable to `Promise<ChannelPreference>`). It is outside this audit's writable/PWA scope and unchanged between `4f646315c` and `HEAD`; it is not an M1 finding.

`git diff --check` passed after restoration.
