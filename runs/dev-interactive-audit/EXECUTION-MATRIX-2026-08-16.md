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

Each page records final URL, substantive body proof, cold and warm navigation latency, all rendered
tabs, same-origin HTTP failures, non-navigation request failures, console errors/warnings and API
responses. `net::ERR_ABORTED` is excluded because this harness itself causes those aborts when moving
to the next page.

## Reversible controls ready to run

| Adapter | Mutation/readback/restore contract |
|---|---|
| global admin registration tariff | current tariff/null → alternate → exact GET → original → exact GET |
| global admin trial | current duration → ±1 day → exact GET → original → exact GET |
| global admin paid-period policy | current `isActive` → inverse → exact GET → original → exact GET |
| doctor location/service availability | one existing active service+location+specialist tuple → inverse → overview readback → original → overview readback |
| patient reminder enabled | rendered switch value → inverse → reload/read → original → reload/read |

The phone-change flow is page/open-only. Password, contact, deletion, payment, external delivery,
registration, chat append and exercise-comment append are deliberately not mutated because they do
not have a deletion/restore contract. A time-schedule adapter is specified in `scenarios.mjs` but is
not yet implemented: its UI can be restored, but the runner needs a stable actual-patient session
and a rule-specific selector before it can safely distinguish interval and exact-slot schedules.

## Authentication facts and current blocker

The harness now rejects synthetic fixtures by default. Doctor/global admin use the real
email-password route; patient requires `DEV_AUDIT_PATIENT_SESSION_COOKIE`. Synthetic dev-bypass is
available only with explicit `DEV_AUDIT_ALLOW_SYNTHETIC=1` and may not be reported as coverage of
the real migrated data.

Attempted command on the running DEV listener:

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

The same current server log also contains live `404` responses for
`/api/admin/booking-engine/overview`, `/api/doctor/booking-engine/services`, working-hours,
working-days, packages and patient unread-count, plus `403` for doctor notification templates.
Therefore a mutation pass must not start yet: the relevant route handlers are currently absent from
the running Next route graph. This is a named runtime blocker, not a harness skip or PASS.
