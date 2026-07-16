# UX-01 Fresh Independent Audit — 2026-07-15

**Verdict:** **FAIL / completion BLOCKED**

## Confirmed

- Route allocation is exact: `81 specialist + 69 patient/public = 150/150`, without duplicates or omissions.
- Registration is a material `/app` state; current desktop/mobile evidence shows email, password, specialist name and
  organization title.
- All nine canonical manifests and every referenced PNG exist. Current arithmetic is consistent:
  `64 safe = 59 valid + 5 finding-only`; 14 superseded TEST frames are excluded.
- Desktop role boundaries match current navigation: doctor has clinical/content sections; clinic admin additionally has
  `Врачи` and `Настройки клиники`; global admin additionally has analytics/settings/system clusters.
- Assistant remains an explicit `needs-decision`, not silently covered by doctor evidence.
- Privacy-risk settings/communications captures were deleted and are not counted as evidence.
- Old missing-function and read-only DEV premises are marked historical. Disposition labels remain hypotheses.
- The work3 diff contains no application-code changes.

## Completion blocker

The patient slice is not captured. Both current patient PNG are maintenance-guard findings only. Today,
appointments, treatment/program, profile/settings and desktop/mobile patient navigation remain unavailable because
`patient_app_maintenance_enabled=true` and the TEST-only `system_settings_test_lock` was copied into DEV. Tracking:
taskdb `#795`.

After `#795` is resolved through the canonical DEV refresh/settings path, repeat the patient role matrix and run a new
independent acceptance audit.

## Retained non-blocking gaps

- privacy-safe populated regular-doctor communications;
- expanded global-admin mobile navigation Sheet;
- registration submit, verification and first-run;
- sensitive global settings surfaces.

These gaps remain explicit and are not represented as verified states.
