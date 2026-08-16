# DEV full-control executable matrix — 2026-08-16

Authority: `full-control-pass-brief.md`. Executable declarations: `scenarios.mjs`.

## Role/page coverage

- `global_admin` (actual `dimmdao@gmail.com`): 16 declared roots, including every flat platform-nav
  destination, all four booking subpages, all five Commercial tabs, account security, and runtime
  organization-detail links discovered from rendered pages.
- `doctor` / clinic owner (actual `dimmdao@yandex.ru`): 30 declared roots, including all doctor-nav
  destinations, all three Schedule tabs, all nine Setup sections, all three clinic-settings tabs,
  account, and runtime patient/catalog detail links discovered from rendered pages.
- `patient` (actual phone `+79189000782`, supplied as an already-minted DEV session cookie): 19
  declared roots, all five primary-nav roots, profile/organization/notification/reminder/purchase
  surfaces, CMS/help/support/install pages, daily-warmup deep link, and runtime program/item/journal
  links discovered from rendered pages.

Those counts come from:

```sh
node --input-type=module -e "import {ROLE_SCENARIOS} from './runs/dev-interactive-audit/scenarios.mjs'; for (const [role,v] of Object.entries(ROLE_SCENARIOS)) console.log(role, v.routes.length)"
```

Each page records final URL, substantive body proof, navigation status, DOM/cold and warm settled
latency, all rendered tabs and their action latency, browser console/page errors, request failures,
same-origin API responses and all HTTP 4xx/5xx (including redirected media hosts). Only aborted document
navigations caused by the harness moving to the next page are excluded.

## Control checks ready to run

| Adapter                              | Mutation/readback/restore contract                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| global admin registration tariff     | current tariff/null → alternate → exact GET → original → exact GET                                                    |
| global admin trial                   | current duration → ±1 day → exact GET → original → exact GET                                                          |
| global admin paid-period policy      | current `isActive` → inverse → exact GET → original → exact GET                                                       |
| doctor weekly working schedule       | own active row start minute → +1 → exact GET → original → exact GET                                                   |
| doctor location/service availability | one existing active service+location+specialist tuple → inverse → overview readback → original → overview readback    |
| patient reminder enabled             | rendered switch value → inverse → reload/read → original → reload/read                                                |
| patient reminder time                | rendered schedule time → ±1 minute → save/reopen/read → original → save/reopen/read                                   |
| patient chat                         | rendered composer → append labelled DEV audit message → require visible readback; row remains by append-only contract |
| patient daily warmup                 | `/go/daily-warmup` → require substantive `/content/*` target                                                          |
| patient phone change                 | profile action → require bind-phone surface; stop before number submission                                            |

The phone-change flow is page/open-only. Password, deletion, payment, external delivery, registration
and exercise-comment controls are deliberately not mutated. Reminder time mutation supports both
interval-window and exact-slot schedules and restores through the same rendered dialog. Chat is the
single explicit append-only exception authorized for DEV and is marked as retained in the artifact.

## Authentication and execution state

The harness now rejects synthetic fixtures by default. Doctor/global admin use the real
email-password route; patient requires `DEV_AUDIT_PATIENT_SESSION_COOKIE`. Synthetic dev-bypass is
available only with explicit `DEV_AUDIT_ALLOW_SYNTHETIC=1` and may not be reported as coverage of
the real migrated data.

The first pre-cache-rebuild diagnostic attempt was:

```sh
DEV_AUDIT_PASSWORD='<owner-provided DEV password>' node runs/dev-interactive-audit/run.mjs
```

Artifact: `out/result-2026-08-16T10-13-11-517Z.json`.

- global admin: `POST /api/auth/email-password/login` returned `404`;
- doctor: the same route returned `404`;
- patient: actual session cookie was not supplied, so the run failed closed before navigation.

Listener proof at that moment:

```text
LISTEN 127.0.0.1:5200 next-server PID 960392
GET /app status=200 total=0.405426s
```

That historical server log also contained `404` responses for
`/api/admin/booking-engine/overview`, `/api/doctor/booking-engine/services`, working-hours,
working-days, packages and patient unread-count, plus `403` for doctor notification templates.
The stale Turbopack route graph was subsequently rebuilt by the orchestrator; this artifact is not
current evidence and is not a PASS. The expanded write-enabled pass remains intentionally unexecuted
until the orchestrator serializes it with other work on the shared DEV listener.
