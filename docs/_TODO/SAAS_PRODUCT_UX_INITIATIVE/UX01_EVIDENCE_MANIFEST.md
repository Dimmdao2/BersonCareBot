# UX-01 Evidence Manifest

Current evidence is runtime-only under `.claude/screenshots/`; images are referenced, not copied or committed.
Per-file SHA-256 is recorded in the public/registration/patient/doctor/clinic-admin DEV manifests. The global-admin
manifest records file names, routes/states and viewport facts but no per-file hashes. TEST manifests record file names,
routes/states but no hashes or dimensions; file existence and dimensions are rechecked during the independent audit.

## Canonical source manifests

### DEV role matrix — application commit `a537e74df6e5e38d589dd7dc0ec8549dcf848756`

- `.claude/screenshots/UX-ROLE-MATRIX/2026-07-15T16-42-31Z/public/manifest.md`
- `.claude/screenshots/UX-ROLE-MATRIX/2026-07-15T16-42-31Z/registration/manifest.md`
- `.claude/screenshots/UX-ROLE-MATRIX/2026-07-15T16-42-31Z/doctor/manifest.md`
- `.claude/screenshots/UX-ROLE-MATRIX/2026-07-15T16-42-31Z/clinic-admin/manifest.md`
- `.claude/screenshots/UX-ROLE-MATRIX/2026-07-15T16-42-31Z/global-admin/manifest.md`

### DEV patient replay — application commit `a537e74df6e5e38d589dd7dc0ec8549dcf848756`

- `.claude/screenshots/UX-ROLE-MATRIX/2026-07-15T17-51-35Z/patient/manifest.md`

### TEST walkthrough

- `.claude/screenshots/SAAS-S3-TEST-WALKTHROUGH/2026-07-15T13-50-53Z/run-manifest.md`
- `.claude/screenshots/SAAS-S3-TEST-WALKTHROUGH/2026-07-15T14-48-56Z/run-manifest.md`
- `.claude/screenshots/SAAS-S3-TEST-WALKTHROUGH/2026-07-15T15-42-10Z/run-manifest.md`

## DEV retained files

| Slice | Files | Classification |
|---|---|---|
| Public | `desktop-login.png`, `mobile-login.png`, `mobile-root.png` | 3 valid |
| Registration | `desktop-registration.png`, `mobile-registration.png` | 2 valid: specialist/organization signup; no submit |
| Patient replay | `desktop-today.png`, `desktop-booking.png`, `desktop-treatment.png`, `desktop-profile.png`, `desktop-notification-settings.png`, `mobile-today.png`, `mobile-booking.png`, `mobile-treatment.png`, `mobile-profile.png` | 7 valid + 2 finding-only Today error boundaries |
| Doctor | `desktop-today.png`, `mobile-today.png`, `desktop-patients.png`, `desktop-schedule.png`, `desktop-lfk.png` | 5 valid |
| Clinic admin | `desktop-today.png`, `mobile-today.png`, `desktop-clinic-members.png`, `desktop-clinic-settings.png` | 4 valid |
| Global admin | `00-shell-today-desktop.png`, `01-shell-today-mobile.png`, `10-analytics-desktop.png`, `20-system-health-desktop.png`, `22-audit-log-desktop.png`, `40-platform-promo-desktop.png` | 5 valid + 1 finding-only |
| **DEV selected total** | **29** | **26 valid + 3 finding-only** |

Deleted privacy-review attempts are not retained or counted: doctor communications; global health archive, app settings,
auth settings, integrations and technical settings. Obsolete `/app/patient/home` 404 helper captures were deleted.
The two earlier maintenance captures remain historical files but are superseded/excluded from current totals.

## TEST selection and supersession

| Source run | Raw | Valid current | Finding-only current | Excluded |
|---|---:|---:|---:|---:|
| `13-50-53Z` | 40 | 32 | 2 references findings | 6 superseded Today/legacy appointments |
| `14-48-56Z` | 12 | 4 | 0 | 8 KPI-bearing schedule findings superseded |
| `15-42-10Z` | 4 | 4 | 0 | 0 |
| **TEST selected** | **56** | **40** | **2** | **14** |

Current TEST findings retained only as findings: `66-clinic-a-lfk-references-finding.png` and `66-clinic-b-lfk-references-finding.png`.

Final schedule truth comes from `15-42-10Z`; corrected Today/badge truth comes from `14-48-56Z`. Superseded frames are not counted again.

## Aggregate current evidence

| Classification | PNG |
|---|---:|
| Safe retained/referenced | 71 |
| Valid product/role-state | 66 |
| Finding-only | 5 |
| Superseded TEST, excluded | 14 |
| Historical maintenance, excluded | 2 |

The two identical mobile shell hashes for doctor and clinic-admin remain separate role attempts/files but do not by themselves prove different expanded mobile menus; role boundary proof comes from the corresponding desktop navigation and manifests.

## Retained findings after UX-01 acceptance

- Patient Today remains finding-only because `organization_principal_required` persists after active enrollment
  restoration. Other retained patient replay states are valid.
- Registration submit/verification/first-run states were not exercised. The retained form was exposed after a controlled standard DEV admin API update of `specialist_signup_enabled=true`.
- Regular-doctor communications has no retained privacy-safe screenshot.
- Fresh independent patient-replay audit завершён с **PASS**; канонический текущий verdict:
  [`UX01_PATIENT_REPLAY_AUDIT_2026-07-15.md`](./UX01_PATIENT_REPLAY_AUDIT_2026-07-15.md). `UX01_INDEPENDENT_AUDIT.md`
  и `UX01_FRESH_AUDIT_2026-07-15.md` остаются историческими FAIL records и не переопределяют текущий acceptance.

## Controlled DEV mutations for patient replay

- With explicit owner authorization, a database-name-guarded operation removed the copied TEST-only
  `system_settings_test_lock` trigger/function from current DEV only.
- The standard admin settings API set `patient_app_maintenance_enabled=false`.
- Synthetic `dev:client` active enrollment was restored in organization `a000...0001`.
- TEST and PROD were untouched; no application code or external delivery state changed.
