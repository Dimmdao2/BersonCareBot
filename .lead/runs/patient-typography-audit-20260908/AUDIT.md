# Patient typography audit — 2026-09-08

| Field | Value |
| --- | --- |
| Candidate | `60fa76cfc1cdbd01b695f80fdb5b3d90c33d5e77` (`fix(patient): establish semantic typography scale`) |
| Base | `6dcefd07413a378416944b10c8838a54663848ca` |
| Verdict | **FAIL** — reachable rehabilitation controls and readable content remain below the acceptance scale. Live desktop/mobile evidence is additionally **BLOCKED** by this worktree's runtime setup. |
| Screenshots | None: the application could not render a login page; `screenshots/` is intentionally empty rather than containing fabricated evidence. |

## Acceptance matrix

| Acceptance item | Result | Evidence |
| --- | --- | --- |
| Exact candidate and base | PASS | `git show -s --format='candidate=%H%nparents=%P%nsubject=%s' 60fa76cfc`; candidate parent is the supplied base. |
| Patient-only semantic source of truth; Manrope retained | PASS | `apps/webapp/src/app/styles/patient.css:14-48` defines the portal-safe Manrope token panel; `shared/ui/patient/patientVisual.ts:175-205` exports the matching patient-only roles. |
| Contract scale and core colors | PASS | CSS declares page `22/28/600`, section `18/24/500`, body `16/24/400`, action `16/20/600`, secondary `14/20/400`, caption `12/16/500`, micro `11/16/500`, metric `28/34/600`; heading/primary/secondary/accent are `#172f62/#111827/#667085/#284da0`. Exact scan for `#98a2b3` returned no hits. |
| Patient shell titles and modal titles | PASS | Candidate routes shell titles to `patientPageTitleClass` and `PatientModal` title to `patientSectionTitleClass`; the shared class definitions carry the specified values. |
| Patient forms consume readable semantic roles | FAIL | `apps/webapp/src/shared/ui/patient/primitives/label.tsx:8` makes field labels 12px; form/control labels are expressly non-micro in the contract. In the reachable stage metrics form, `PatientTreatmentProgramStagePageProgramSection.tsx:281` renders values at `text-xs` (12px), and lines 322/336/350 render labels only at secondary 14px instead of the required readable form-value body role. |
| Primary actions use 16/20/600 | FAIL | Reachable rehabilitation actions override the shared action role with 12px: `PatientProgramStageItemPageClient.tsx:822,832,846,875` and `PatientTreatmentProgramStagePageProgramSection.tsx:252,301,356,703`. This makes “Следующая рекомендация”, “Комментарии”, completion, difficulty and save actions 12px at 100%. |
| Ordinary patient prose/instructions/errors/statuses are readable | FAIL | Reachable rehabilitation prose is still 12–14px: `PatientProgramStageItemPageClient.tsx:936` overrides `patientBodyTextClass` with `text-sm` for a specialist instruction; line 965 presents the video-question instruction at `text-xs`. `PatientTreatmentProgramStagePageProgramSection.tsx:135,661,664,675,685,780` presents descriptions, contraindications, specialist instruction and group description at `text-xs`. `PatientTestSetProgressForm.tsx:395,405,474,482,522` presents submitted/accepted, unavailable-details, disabled status and error text at `text-xs`. |
| Remaining small text is limited to rational caption/badge/counter/axis/meta usage | FAIL | Full residual scan found rational cases (calendar weekday/date micro labels in `BookingCalendar.tsx:171,209`; nav labels/count badges and compact metadata) but also the ordinary action, input, status, error and instruction cases above. The scan was classified by rendered role rather than by count. |
| Direct readable color and patient/doctor boundary | PASS | `rg` found no patient import from `@/shared/ui/doctor/**` or `@/components/ui/**`; `git diff 6dcefd074 60fa76cfc -- apps/webapp/src/app/app/doctor apps/webapp/src/app/app/settings apps/webapp/src/shared/ui/doctor apps/webapp/src/app/styles/doctor.css` was empty. Direct literal colors were reviewed; the candidate did not leave `#98a2b3` and no lighter default readable-text token was found. |
| Desktop live verification (1440×900) | BLOCKED | Isolated `127.0.0.1:5212` did not reach the login page, so Today, diary/modal, rehabilitation, booking and form/comment surfaces could not be viewed. |
| Mobile live verification (390×844) | BLOCKED | Same startup blocker; no genuine screenshot or mobile overflow assertion is claimed. |

## Findings

### F-1 — rehabilitation actions and values remain below the required semantic scale

Reachable screen impact: a patient opening a rehabilitation stage/program item sees 12px primary/secondary controls (including next recommendation, comments, completion, difficulty and save) and 12px metrics values. This violates the required 16px action and mobile form-value contracts.

Exact locations: `apps/webapp/src/app/app/patient/treatment/PatientProgramStageItemPageClient.tsx:822,832,846,875`; `apps/webapp/src/app/app/patient/treatment/PatientTreatmentProgramStagePageProgramSection.tsx:252,281,301,356,703`; shared form label `apps/webapp/src/shared/ui/patient/primitives/label.tsx:8`.

### F-2 — ordinary rehabilitation prose, status and error text remains 12–14px

Reachable screen impact: the rehabilitation item/stage flow presents patient instructions, contraindications, specialist content, statuses and errors below the stated readable body scale. A clean wrap would be acceptable, but these rules reduce the text instead.

Exact locations: `apps/webapp/src/app/app/patient/treatment/PatientProgramStageItemPageClient.tsx:936,965`; `apps/webapp/src/app/app/patient/treatment/PatientTreatmentProgramStagePageProgramSection.tsx:135,661,664,675,685,780`; `apps/webapp/src/app/app/patient/treatment/PatientTestSetProgressForm.tsx:395,405,474,482,522`.

## Commands and actual results

| Command | Result |
| --- | --- |
| `git show -s --format='candidate=%H%nparents=%P%nsubject=%s' 60fa76cfc` | Candidate parent is `6dcefd074`; exact candidate/base verified. |
| `git diff --stat 6dcefd074 60fa76cfc` | `45 files changed, 310 insertions(+), 143 deletions(-)`. |
| `git diff --check 6dcefd074 60fa76cfc` | PASS; no whitespace errors. |
| `rg -n --glob '*.{ts,tsx,css}' '(\\btext-(xs|sm)\\b|text-\\[[0-9]+px\\]|...)' apps/webapp/src/app/app/patient apps/webapp/src/shared/ui/patient` | Reviewed all remaining small-size/direct-text-color hits by surrounding UI role; findings F-1/F-2 are the non-rational reachable cases. |
| `rg -n "from ['\\\"](@/shared/ui/doctor|@/components/ui)/" apps/webapp/src/app/app/patient apps/webapp/src/shared/ui/patient` | PASS; no hits. |
| `npx next dev -H 127.0.0.1 -p 5212` | BLOCKED: Turbopack rejected the worktree `node_modules` symlink as outside filesystem root. |
| `npx next dev --webpack -H 127.0.0.1 -p 5212` | BLOCKED before login: initially missing workspace package outputs; after local dependency-link recovery and package builds, startup stopped with `Development requires SESSION_COOKIE_SECRET (min 16 chars) in env`. No env secret was read or invented. |
| Tests/full CI | Not run, per audit brief: this is a source + live visual audit with no intended behavior change. |

## Live evidence and cleanup

The auditor's isolated `:5212` server was used only for this pass and was stopped after the failed startup. No migrations, DEV data/settings, shared ports `5200/4200`, or PROD were touched. The absence of screenshots is a documented BLOCKED condition, not a visual PASS.
