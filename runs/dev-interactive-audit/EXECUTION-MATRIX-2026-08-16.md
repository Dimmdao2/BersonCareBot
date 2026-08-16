# DEV full-control executable matrix — 2026-08-16

Authority: `full-control-pass-brief.md`. Executable declarations: `scenarios.mjs`.

## Role/page coverage

- `global_admin` (actual `dimmdao@gmail.com`): every unique platform route template, all five
  Commercial tabs, account security, and one representative runtime organization-detail template.
- `doctor` / clinic owner (actual `dimmdao@yandex.ru`): declared roots include all doctor-nav
  destinations, all three Schedule tabs, all nine Setup sections, all three clinic-settings tabs,
  account, one representative per runtime content/catalog detail template, and all eight tabs of the
  exact `+79189000782` / «Берсон Дмитрий» patient card.
- `patient` (actual phone `+79189000782`, supplied as an already-minted DEV session cookie):
  declared roots, all five primary-nav roots, profile/organization/notification/reminder/purchase
  surfaces, CMS/help/support/install pages, home-page daily-warmup CTA, and one representative per
  runtime program/content template.

Those counts come from:

```sh
node --input-type=module -e "import {ROLE_SCENARIOS} from './runs/dev-interactive-audit/scenarios.mjs'; for (const [role,v] of Object.entries(ROLE_SCENARIOS)) console.log(role, v.routes.length)"
```

Each page records exact final URL with preserved query, a unique main/panel marker, navigation status,
DOM/cold and warm settled latency, required-tab click/readback latency, browser console/page errors,
request failures, same-origin API responses and all HTTP 4xx/5xx. `net::ERR_ABORTED` is ignored only
while the harness itself is replacing the current document; settled-page aborts remain failures.

## Control checks ready to run

| Adapter                              | Mutation/readback/restore contract                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| global admin registration tariff     | rendered selector: current tariff/null → alternate → save/reload/exact GET → original → save/reload/exact GET         |
| global admin trial                   | rendered duration → ±1 day → save/reload/exact GET → original → save/reload/exact GET                                 |
| global admin paid-period policy      | rendered `isActive` → inverse → save/reload/exact GET → original → save/reload/exact GET                              |
| doctor weekly working schedule       | rendered weekday time → alternate 15-minute slot through `POST replace=true` → exact GET → UI restore → exact GET     |
| doctor location/service availability | rendered service×location switch → inverse → full matrix readback → UI restore → lossless full-matrix readback        |
| patient program/warmup enabled       | each exact rendered switch → inverse → reload/read → original → reload/read                                           |
| patient program/warmup time          | each exact rendered dialog time → alternate → save/reopen/read → original → save/reopen/read                          |
| patient chat                         | rendered composer → append labelled DEV audit message → require visible readback; row remains by append-only contract |
| patient daily warmup                 | rendered «Начать разминку» on `/app/patient` → require substantive `/content/*` target                                |
| patient phone change                 | profile action → require bind-phone surface; stop before number submission                                            |

The phone-change flow is page/open-only. Password, deletion, contact-change and external delivery are
not mutated. Reminder mutations restore through the same rendered dialogs. Chat and an actual payment
link attempt are explicit append-only DEV evidence and are marked as retained in the artifact.

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
