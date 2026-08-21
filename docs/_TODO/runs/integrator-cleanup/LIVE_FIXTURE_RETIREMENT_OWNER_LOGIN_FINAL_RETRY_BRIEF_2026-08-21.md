# Fixture retirement: final ordinary owner-login candidate gate

Классификация «Тест или взгляд»: ordinary login/session/`GET /api/me` is repeatable runtime behavior, therefore
this gate uses the exact live HTTP path; cleanup and absence of product changes are one-off inspection by process,
tree and filesystem state. No new permanent test or blind audit cycle is required.

Role: `auditor-live`. This is the missing half of the same one-off pre-landing live gate, not a new audit cycle.
Read the `AGENTS.md` heading map and complete §1/§1a/§1b, §5/§6, §9–§10 and §24 before acting; also read
`SERVER CONVENTIONS.md`, `LOCAL_DEV_AND_AGENT_TESTING.md`, the auth module doc, owner product rules §11, and search
again for later owner decisions.

Источник оракула: current owner decision 2026-08-21 — named DEV/TEST checks use already registered owner accounts;
persistent fixture accounts/clinics/data and authenticated synthetic `dev:*` paths are forbidden. Ordinary
email/password flow, its session cookie and `GET /api/me` are the behavior oracle.

Exact prior evidence on the same product tree is
`LIVE_FIXTURE_RETIREMENT_CANDIDATE_OWNER_LOGIN_RETRY_RESULT_2026-08-21.md`, commit `833359463`: rebuilt
`packages/platform-merge/dist/index.js` exports `mutateCanonicalUserContacts`, candidate Next served on isolated
port 5210, `/api/auth/dev-bypass` returned 404, and `/api/auth/dev-public` redirected while clearing session.
Only the ordinary login and `/api/me` remained untested because the protected password input was absent.

## Exact bounded gate

1. Prove `833359463` is an ancestor of HEAD, the tracked tree is clean before the result artifact, and there are no
   product changes after product base `3cf420982`. Reuse the prior same-product build/public-route evidence; do not
   rerun already-green checks. Confirm the existing ignored `dist/index.js` export without printing content; rebuild
   only if the ignored artifact is missing/stale.
2. Confirm `/tmp/bcb-owner-dev-password-20260821` is a regular non-symlink `dev:dev` mode-0600 file. Never print,
   log, commit or place its value in argv. A Node/fetch probe reads it inside the process.
3. Choose a free isolated port 5210–5219. Do not touch shared 5200/4200, TEST or PROD. As in the prior gate, create
   only mode-0600 candidate copies of the canonical DEV env files, install cleanup traps, and start candidate Next
   directly with `setsid npx next dev -H 127.0.0.1 -p <port>` from `apps/webapp`; no migration or shared launcher.
4. Use the existing owner global-admin email named in `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §11. Perform only:
   - ordinary `POST /api/auth/email-password/login`;
   - `GET /api/me` with the returned in-memory session cookie.
   PASS requires login `ok=true`, no `factorRequired`, a session cookie, `/api/me` HTTP 200 and the exact living
   Dmitry Berson global-admin identity/role. A lawful second-factor requirement is `BLOCKED`; do not bypass it.
5. Do not try other passwords, reset auth, create/modify an account, clinic or data, or invoke any fixture.
6. Wait for the terminal result, stop only this process group, and remove the protected password file, candidate env
   copies, PID/cookie/temp files. Confirm no process/listener/temp remains. Do not finish while a process is running.

Create and commit only
`docs/_TODO/runs/integrator-cleanup/LIVE_FIXTURE_RETIREMENT_OWNER_LOGIN_FINAL_RETRY_RESULT_2026-08-21.md` with exact
candidate SHA, safe HTTP classifications, PASS|FAIL|BLOCKED and cleanup evidence. No secret, cookie, response PII,
product edit, DB mutation, fixture, disposable DB, TEST/PROD, migration, landing, deploy, push or full CI.
