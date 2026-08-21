# Fixture retirement candidate owner-login live gate — 2026-08-21

## Result: FAIL

Candidate: `62a05c0b90cbd21089b1934d2cc96735c20cfb82` (`wt/live-fixtures-retirement-20260821`).
Isolated origin: `http://127.0.0.1:5210`.

Preflight passed:

- `git merge-base --is-ancestor 12ca8b0ed HEAD` exited `0`.
- `git merge-base --is-ancestor 8b6affa58 HEAD` exited `0`.
- `git status --short` was empty before the report was created.
- `ss -ltn '( sport >= :5210 and sport <= :5219 )'` showed no listener; port `5210` was used.

## Live HTTP probe

The probe used the already registered global-admin owner account with the protected password file read only
inside its Node process. No account, clinic, fixture, migration, TEST, or PROD mutation was performed.

| Check | Safe result | Classification |
| --- | --- | --- |
| `GET /api/auth/dev-bypass` | HTTP 500 | FAIL — expected absent-route 404 could not be reached |
| `POST /api/auth/email-password/login` | HTTP 500 | FAIL — ordinary login could not issue a session; no second-factor result was reached |
| `GET /api/me` | HTTP 500 | FAIL — global-admin identity/role could not be proved |
| `GET /api/auth/dev-public` | HTTP 500 | FAIL — ordinary `/app` redirect and session-clearing behavior could not be proved |

The reachable cause on each failing auth/API route was the candidate runtime compile error:
`mutateCanonicalUserContacts` is imported by `apps/webapp/src/infra/repos/userContactsSql.ts` but is not
exported by `packages/platform-merge/dist/index.js`. This prevents the required live owner-login flow before
any session-cookie or `factorRequired` outcome is available. The protected input was not retried, changed, or
printed.

## Cleanup evidence

The isolated server was started directly with `setsid npx next dev -H 127.0.0.1 -p 5210`, logging to
`/tmp/live-fixture-owner-login-candidate-20260821.log`, and was stopped at the terminal result. The cleanup
check reported all of the following as absent/stopped:

- candidate `.env` and `apps/webapp/.env.dev` mode-0600 copies;
- `/tmp/bcb-owner-dev-password-20260821` protected input;
- `/tmp/live-fixture-owner-login-candidate-20260821.pid`;
- listener on port `5210` (`ss -ltn '( sport = :5210 )'`).

NOT DONE: landing / TEST deploy / push / full CI
