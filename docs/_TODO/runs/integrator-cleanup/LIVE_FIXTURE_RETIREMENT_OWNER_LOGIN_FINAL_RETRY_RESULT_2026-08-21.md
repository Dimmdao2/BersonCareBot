# Fixture retirement candidate owner-login live gate — final retry — 2026-08-21

## Result: PASS

Candidate: `98526782852494ef3b4a766c04c094a8850c4e3b` (`wt/live-fixtures-retirement-20260821`,
`Merge branch 'feat/doctor-ui-rebuild' into wt/live-fixtures-retirement-20260821`).
Isolated origin: `http://127.0.0.1:5210`.

## Preflight

- `git merge-base --is-ancestor 833359463 HEAD` exited `0` — the prior same-product evidence commit is an
  ancestor of the current candidate HEAD.
- `git merge-base --is-ancestor 985267828 HEAD` exited `0` (HEAD itself).
- `git log --oneline 3cf420982..HEAD -- apps/ packages/` returned **0** commits — no product changes after
  product base `3cf420982`.
- `git status --short` was empty both before candidate-env setup and after cleanup.
- `ss -ltn` showed no listener on `5210`–`5219` before the candidate server was started.
- Prior same-product build/public-route evidence reused, not rerun (`LIVE_FIXTURE_RETIREMENT_CANDIDATE_OWNER_LOGIN_RETRY_RESULT_2026-08-21.md`,
  commit `833359463`):
  - `packages/platform-merge/dist/index.js` was already present and confirmed newer than every file under
    `packages/platform-merge/src/*.ts` (`stat` mtimes: newest src `1787292507`, dist `1787302176`) — the
    ignored build artifact is not stale, so **no rebuild was performed**.
  - `node -e "console.log(typeof require('./packages/platform-merge/dist/index.js').mutateCanonicalUserContacts")`
    printed `function` — export presence reconfirmed without printing content.

## Live HTTP probe

Candidate mode-0600 copies of the canonical root `.env` and `apps/webapp/.env.dev` (source:
`/home/dev/dev-projects/BersonCareBot/.env`, `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev`) were
created at this worktree's matching paths (neither pre-existed here), and the candidate was started directly
with `setsid npx next dev -H 127.0.0.1 -p 5210` from `apps/webapp` (no `pnpm dev`/`webapp:dev`/`dev:turbo`, no
migration, no shared launcher).

| Check | Safe result | Classification |
| --- | --- | --- |
| `GET /api/auth/dev-bypass` | HTTP 404 | PASS |
| `GET /api/auth/dev-public` | HTTP 303 → `Location: http://127.0.0.1:5210/app`; `Set-Cookie` clears `bersoncare_webapp_session` (`Max-Age=0`) and related session cookies | PASS |
| `POST /api/auth/email-password/login` | HTTP 200, `ok=true`, no `factorRequired`, `role="admin"`, session cookie set (`bersoncare_webapp_session`, not `Max-Age=0`) | PASS |
| `GET /api/me` (with returned session cookie) | HTTP 200, `ok=true`, response matched the expected existing owner identity from `OWNER_PRODUCT_RULES.md` §11, `role="admin"` | PASS |

The login/`/api/me` probe used the ordinary global-admin identity named in
`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §11. The response matched the expected existing owner identity from
that section (the single live global admin, no clinic membership). Password was read
from the protected file `/tmp/bcb-owner-dev-password-20260821` (regular file, non-symlink, owner `dev:dev`,
mode `0600`) inside a Node/`fetch` probe process; the value was never printed, logged, committed, or placed in
argv. The initial login attempt returned `403 csrf_origin_forbidden` (ordinary same-origin CSRF check on the
mutating `POST`); adding a matching `Origin: http://127.0.0.1:5210` header — standard browser behavior, not a
bypass — resolved it, and the retry returned `200`/`ok=true`. No other password was tried, no reset/2FA/account
mutation was performed, and no fixture was invoked.

**Overall verdict: PASS.** All four required conditions were met: ordinary login `ok=true` with no
`factorRequired` and a session cookie, and `GET /api/me` HTTP 200 returning the exact living Dmitry Berson
global-admin identity/role.

## Cleanup evidence

- Candidate server (`next dev`, process group `2730056`) stopped with `kill -TERM` to its process group.
  `pgrep -f "next-server|next dev -H 127.0.0.1 -p 5210"` (excluding the checking shell's own command line)
  returned no match; `ss -ltn | grep ':5210'` returned no listener.
- Candidate `.env` and `apps/webapp/.env.dev` mode-0600 copies removed (`ls` confirms absent).
- `/tmp/bcb-owner-dev-password-20260821` removed (`ls` confirms absent). Its value was never printed or
  logged during this run.
- Node probe script `/tmp/bcb-final-login-probe.mjs` removed.
- Temp probe response/header files (`/tmp/bcb-final-devbypass.body`, `/tmp/bcb-final-devpublic.{body,headers}`)
  removed.
- PID/log files (`/tmp/live-fixture-owner-login-final-retry-20260821.{pid,log}`) removed.
- `git status --short` on the tracked tree is empty after cleanup, before this report was added.

NOT DONE: landing / TEST deploy / push / full CI.
