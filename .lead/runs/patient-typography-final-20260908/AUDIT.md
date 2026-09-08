# Patient typography final audit — 2026-09-08

| Field | Value |
| --- | --- |
| Candidate | `3ad2f03f1adfdfe1eff8197add3d3a8535bf803e` (`fix(patient): close typography role overrides`) |
| Comparison base | `71ea8a3ca` (`feat/doctor-ui-rebuild`); `git merge-base --is-ancestor 71ea8a3ca 3ad2f03f1` passed |
| Verdict | **BLOCKED, NOT FOR LAND** — continuation cleared the login blocker and visibly accepted Home and diary, but the isolated candidate runtime terminated while opening the remaining required patient surfaces. |
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

### Live continuation

The continuation used exactly:

```bash
APP_BASE_URL=http://127.0.0.1:5213 NEXT_PUBLIC_APP_BASE_URL=http://127.0.0.1:5213 HOST=127.0.0.1 PORT=5213 pnpm exec next dev --webpack -H 127.0.0.1 -p 5213
```

`ss -ltnp '( sport = :5213 )'` showed no listener before startup. A temporary `apps/webapp/.env.dev` symlink was made only to `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev`; its content was not read or printed. The published patient credentials were entered through the email/password UI and redirected normally to `/app/patient`, proving that the first login blocker was the missing isolated base-URL override, not an auth finding.

| Surface | 390x844 | 1440x900 | Result |
| --- | --- | --- | --- |
| Today/Home | `screenshots/home-mobile.png`: authenticated Home, program, warm-up, progress, booking and patient navigation are readable; no overflow, overlap, clipping or missing control seen. | `screenshots/home-desktop.png`: authenticated Home captured and visually checked. | PASS |
| Diary/statistics | `screenshots/diary-mobile.png`: weekly interval, symptoms and graph are readable with no clipping, overlap or horizontal overflow. This patient has no general well-being marks or tracked symptoms, so chart values and add-mark modal are unavailable without prohibited data mutation. | `screenshots/diary-desktop.png`: same reachable surface visually checked. | PASS (available state) |
| Booking/cabinet | `screenshots/booking-mobile.png` is a real connection-refused blocker capture: the isolated candidate terminated while opening `/app/patient/booking`. | Not reached after process termination. | BLOCKED |
| Rehabilitation program/stage/exercise | Not reached after process termination. | Not reached after process termination. | BLOCKED |
| Messages/exercise comments | Not reached; no message was sent, so no external recipient was contacted and no incremental-redraw claim is made. | Not reached. | BLOCKED |
| Video/fullscreen modal | Not reached; assigned-video availability was not established. | Not reached. | BLOCKED |

Pre-change screenshots were used only to check for regression or missing controls. No visual finding was observed in Home or diary. The isolated-runtime termination is a reachable live-gate blocker, but is not attributed to the typography diff; no product code was changed.

## Cleanup and validation

The exact isolated `:5213` foreground process was stopped. The temporary `apps/webapp/.env.dev` symlink was removed only after confirming its target. The temporary Chromium profile was outside the clone and was stopped; no cookie or log file was left in the clone. No tests were added or run: this is a one-off visual/style refactor and the required acceptance method is live screenshots. Final cleanup confirms no production-code dirt; only this report, its screenshots, and the queue row are staged for the audit commit.
