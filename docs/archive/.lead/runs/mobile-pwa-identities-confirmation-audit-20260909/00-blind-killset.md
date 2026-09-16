# #915 PWA identity confirmation audit — blind kill-set

Prepared from `MASTER_PLAN.md` M1-01…M1-06 and owner §1.5 before reading the existing manifest-output tests.

| ID | Classification | Fault to inject | Required observable failure |
| --- | --- | --- | --- |
| K1 | Repeated behavior | Cross-wire `patient_default` to a legacy blue icon, omit a Therapy Go `maskable` icon, or substitute a non-Therapy-Go icon. | The public `buildPatientPwaManifest(patient_default)` output oracle rejects the missing/current-brand `any`/`maskable` identity. |
| K2 | Repeated behavior | Cross-wire `patient_branded` to any Therapy Go asset or append a clinic `maskable` icon. | The public `buildPatientPwaManifest(patient_branded)` output oracle rejects Therapy Go leakage and the false clinic maskable icon. |
| K3 | Repeated behavior | Change the branded manifest's resolved clinic name or its established `id`, `scope`, or `start_url`. | The branded manifest output oracle rejects the changed user-visible identity or installed-PWA routing contract. |
| K4 | One-time command/inspection | Remove or alter a documented active brand-asset regeneration command so it no longer invokes `derive:brand-assets`. | Direct execution of every documented active regeneration command is no longer possible/successful; no permanent source-text test is warranted. |
| K5 | One-time inspection | Make the generator nondeterministic or replace retained legacy clinic/admin assets. | Two generator runs yield different hashes, or direct asset inspection finds a required retained asset absent/changed. |

Fault-injection tally starts at `killed 0 / uncaught 0`; product mutations are temporary and must be restored before final validation.
