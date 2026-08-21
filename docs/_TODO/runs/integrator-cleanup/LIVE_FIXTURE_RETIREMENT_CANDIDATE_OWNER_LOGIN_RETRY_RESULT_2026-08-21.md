# Fixture retirement candidate owner-login live gate — retry — 2026-08-21

## Result: FAIL

Candidate: `3cf420982d781d945335ecaea9a36966cf037c66` (`wt/live-fixtures-retirement-20260821`).
Isolated origin: `http://127.0.0.1:5210`.

Preflight passed:

- `git merge-base --is-ancestor 12ca8b0ed HEAD` exited `0`.
- `git merge-base --is-ancestor 8b6affa58 HEAD` exited `0`.
- `git merge-base --is-ancestor 5ea4c108 HEAD` exited `0`.
- `git status --short` was empty before the report was created.
- `ss -ltn` showed no listener on `5210`–`5219` before the candidate server was started.

## Package build/import (root cause from the first result)

- `pnpm --dir packages/platform-merge run build` (`tsc -p tsconfig.json`) exited `0`.
- Exact-import check against the rebuilt artifact:
  `node -e "require('./packages/platform-merge/dist/index.js').mutateCanonicalUserContacts"` resolved to a
  `function` — `mutateCanonicalUserContacts` is now available from `packages/platform-merge/dist/index.js`.
  This confirms the stale-`dist` cause of the first FAIL is cleared; no product source was edited.
- The candidate Next.js server subsequently compiled and served `GET /` (`HTTP 200`) with no
  `mutateCanonicalUserContacts` import error in the server log — the runtime compile failure from the first
  result did not recur.

## Live HTTP probe

Env: regular mode-0600 copies of canonical root `.env` and `apps/webapp/.env.dev` were created at the exact
candidate paths (neither file pre-existed in this worktree), and the candidate was started directly with
`setsid npx next dev -H 127.0.0.1 -p 5210` from `apps/webapp` (no `pnpm dev`/`webapp:dev`/`dev:turbo`, no
migration).

| Check | Safe result | Classification |
| --- | --- | --- |
| `GET /api/auth/dev-bypass` | HTTP 404 | PASS |
| `GET /api/auth/dev-public` | HTTP 303 → `Location: http://127.0.0.1:5210/app`; `Set-Cookie` clears `bersoncare_webapp_session` (`Max-Age=0`) and related session cookies | PASS |
| `POST /api/auth/email-password/login` | not attempted | FAIL — precondition missing (below) |
| `GET /api/me` | not attempted | FAIL — depends on the login step above |

**Blocking precondition:** the protected password input this gate's brief says was prepared by the lead at
`/tmp/bcb-owner-dev-password-20260821` was not present on this host at probe time (`test -f` confirmed absent;
`find /tmp -maxdepth 1 -iname '*owner-dev-password*'` returned no match). Per the brief's own constraints, this
run did not try other passwords, did not reset the password/2FA, and did not create a fallback actor. The
ordinary email/password login and the follow-on `GET /api/me` identity check therefore could not be attempted
and are recorded as FAIL rather than skipped, invented, or guessed. This is a missing test precondition, not a
candidate runtime/auth defect and not a legitimate second-factor block, so it does not qualify as `BLOCKED`
under this gate's own definition.

Overall verdict is **FAIL**: two of the four required PASS conditions (ordinary login `ok=true` + cookie, and
`GET /api/me` identity/role) could not be exercised.

## Cleanup evidence

- Candidate server (`next dev`, pid `2718672`, process group `2718658`) was stopped with `kill -TERM` to its
  process group; `pgrep -af "next dev.*5210"` and `ss -ltn | grep ':5210'` both confirmed nothing remained.
- Candidate `.env` and `apps/webapp/.env.dev` mode-0600 copies were removed (`ls` confirms absent).
- `/tmp/live-fixture-owner-login-candidate-retry-20260821.pid` removed (confirmed absent).
- Temp probe response/header files (`/tmp/bcb-retry-devbypass.body`, `/tmp/bcb-retry-devpublic.{body,headers}`)
  removed.
- `/tmp/bcb-owner-dev-password-20260821` was never present during this run — nothing to remove there.
- `git status --short` on the tracked tree is empty after cleanup, before this report was added.

NOT DONE: landing / TEST deploy / push / full CI
