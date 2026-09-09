# #915 M1 PWA identities/install surfaces — blind behavioral kill-set

Recorded before inspecting any test file. Oracle: auditor-live brief and the active M1/M7 authority to be read next.

| ID | Behavioral fault to inject | Required observable result |
| --- | --- | --- |
| K1 | Revert the default patient name, ignore `PATIENT_APP_NAME`, or change patient `id`, `scope`, or `start_url`. | Default metadata/manifest says `Therapy Go`; the environment override reaches both outputs; `id=/app`, `scope=/app`, and `start_url=/app/patient` stay stable. |
| K2 | Cross-wire patient and staff icon paths, or remove the separately declared maskable icon. | Patient and staff metadata/manifests expose their own current-brand `any`, `maskable`, and Apple icon paths; staff remains `Therapysto` with `id=/app-staff`, `scope=/app`, `start_url=/app/doctor`. |
| K3 | Apply Therapy Go default name or icons to a branded patient/custom-domain surface. | A branded patient surface retains `effectivePatientBrand.patientAppName` and legacy blue clinic icon paths. |
| K4 | Emit a patient/staff manifest, Apple web-app metadata, or PWA icons for `platform_admin`; serve either manifest handler to admin. | Resolved admin metadata contains none of those PWA fields, and both public manifest handlers return 404 for admin while valid patient/staff responses still succeed. |
| K5 | Remove the admin-shell bootstrap guard. | A platform-admin shell produces neither staff install/service-worker bootstrap nor staff web-push bootstrap side effect. |
| K6 | Invert specialist/admin doctor-install routing, permit admin install UI, or allow admin account install through a query tab. | Specialist `/app/doctor/install` redirects to `/app/account?tab=install`; platform admin cannot reach staff install UI or account install for any tab/query. |
| K7 | Remove patient push opt-in while consolidating install UI, or invent a native detector. | Patient install keeps the established patient install primitive and existing push opt-in behavior; non-admin browser/PWA service-worker behavior is unchanged and M1 adds no native detector. |

Classification: K1–K6 are stable output, route, access, or side-effect contracts and may justify behavioral tests at their cheapest public seam. K7 push behavior may be covered only if a stable existing public seam exists; install copy, DOM shape, filenames/counts, layout, and asset pixels are one-time inspection evidence, not permanent tests.
