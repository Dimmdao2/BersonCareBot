# Patient typography final audit — 2026-09-08

| Field | Value |
| --- | --- |
| Candidate | `3ad2f03f1adfdfe1eff8197add3d3a8535bf803e` (`fix(patient): close typography role overrides`) |
| Comparison base | `71ea8a3ca` (`feat/doctor-ui-rebuild`); `git merge-base --is-ancestor 71ea8a3ca 3ad2f03f1` passed |
| Verdict | **BLOCKED** — source consolidation passes, but the required authenticated live acceptance cannot begin: the normal DEV patient email/password submission remains on the login form. |
| Scope | Audit artifacts only; no product code, migration, DEV data/settings, shared `:5200`/`:4200`, TEST, or PROD changed. |

## Source consolidation

| Check | Verdict | Evidence |
| --- | --- | --- |
| Exact diff, whitespace and accidental scope | PASS | `git diff --check 71ea8a3ca..3ad2f03f1` passed. `git diff --name-status 71ea8a3ca..3ad2f03f1` was reviewed; it is the patient typography role consolidation plus its guide and prior audit artifact, with no data flow, feature, copy, or patient layout change found. |
| Patient-only isolation | PASS | `git diff --name-only 71ea8a3ca..3ad2f03f1 -- apps/webapp/src/app/app/doctor apps/webapp/src/app/app/settings apps/webapp/src/shared/ui/doctor apps/webapp/src/app/styles/doctor.css | wc -l` returned `0`. The final CSS panel is `apps/webapp/src/app/styles/patient.css`; roles are exported from `apps/webapp/src/shared/ui/patient/patientVisual.ts`. |
| Manrope semantic role scale | PASS | `patient.css` is the single patient typography panel; the final `patientVisual.ts` exports body, muted, form-label, caption, micro, action, metric, page/section-title and hero roles. The documented scale in `docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md` names those same roles. |
| Ordinary text/forms/actions/titles/captions | PASS | Final residual scan of `apps/webapp/src/app/app/patient` and `apps/webapp/src/shared/ui/patient` found no caller-local readable `text-*`, weight, line-height, or direct text-color utilities outside the central semantic style sources and home semantic roles. The previous rehabilitation local overrides are absent from the candidate's final fix. |
| Home hierarchy | PASS | The guide and final source retain `patient-type-home-display` and the distinct responsive `patient-type-home-hero-title`; this is a semantic patient role, not a caller-local breakpoint override. |
| Patient UI boundary and residual colors | PASS | No patient import from doctor/shared generic UI was found; residual text colors are patient CSS variables/semantic classes, while icon geometry and comments were excluded. |

## Live acceptance

Candidate startup command, run only on the isolated port:

```bash
cd apps/webapp && npx next dev --webpack -H 127.0.0.1 -p 5213
```

`ss -ltnp 'sport = :5213'` showed no listener before startup. The missing worktree env was linked temporarily (without reading or printing it) to the owner-supplied DEV env and removed during cleanup. `GET http://127.0.0.1:5213/` returned `HTTP=200`; unauthenticated `GET http://127.0.0.1:5213/api/me` returned the expected `HTTP=401`.

| Surface | 390x844 | 1440x900 | Result |
| --- | --- | --- | --- |
| Today/Home | `screenshots/login-mobile.png`: `/app` remains `Проверяем вход…`; no login form became available in this mobile capture. | `screenshots/login-desktop.png` and `screenshots/home-desktop.png`: email/password form rendered, but normal entry of the published DEV patient credentials and submit stayed on that form after 8 seconds. | BLOCKED |
| Diary/statistics, including week/symptom/chart/modal | Not reachable without an authenticated patient session. | Not reachable without an authenticated patient session. | BLOCKED |
| Booking/cabinet | Not reachable without an authenticated patient session. | Not reachable without an authenticated patient session. | BLOCKED |
| Rehabilitation program/stage/item | Not reachable without an authenticated patient session. | Not reachable without an authenticated patient session. | BLOCKED |
| Messages and exercise comments modal | Not reachable without an authenticated patient session. | Not reachable without an authenticated patient session. | BLOCKED |
| Video/fullscreen modal path | Not reachable without an authenticated patient session or assigned content. | Not reachable without an authenticated patient session or assigned content. | BLOCKED |

`screenshots/login-blocked-desktop.png` is an additional real desktop capture of the unauthenticated entry state. These are blocker screenshots, not a claim that the requested authenticated surfaces passed. No screenshot was fabricated and no fixture, bypass, token login, migration, or DEV-data mutation was used.

During first route compilation webpack also reported pre-existing-looking unresolved exports in unrelated auth/operator-health/media modules. The candidate still served `/` and `/app`; the report does not attribute those imports to the typography diff. The decisive live blocker is the normal patient login transition not producing an authenticated session.

## Cleanup and validation

The exact isolated `:5213` foreground process was stopped with `Ctrl-C`. The temporary `apps/webapp/.env.dev` symlink was removed only after confirming its target. No tests were added or run: this is a one-off visual/style refactor and the required acceptance method is source inspection plus live screenshots. Final cleanup confirms no production-code dirt; only this report, its screenshots, and the queue row are staged for the audit commit.
