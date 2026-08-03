# TEST — two pages fall with a Server Components 500

Rules: `AGENTS.md` — Маршрут, CORE rules, §1/§1b, §5, §6, §24. Language: internal work is English.

⚠️ **One-shot agent, no next turn** (`AGENTS.md` §24.2): never end while something runs in the background, and
**commit before you finish**.

Authority: this brief (bounded live incident, `ORCH_OPS`). Owner hit both pages on TEST on 2026-08-03 ~19:58 MSK.

## What the owner sees

Both return the generic «Что-то пошло не так — An error occurred in the Server Components render»:

- `https://test.bersoncare.ru/app/account?tab=notifications` — digest **`1641640286`** (screenshot);
- `https://test.bersoncare.ru/app/admin/app-settings`.

## Work

1. **Find the real exception behind digest `1641640286`** in the TEST webapp service log (`journalctl` for the
   webapp unit around 19:58 MSK) — the digest is the key; do not guess from the page name.
2. Do the same for `/app/admin/app-settings` (reproduce it live under a real global-admin session and capture its
   digest and stack).
3. **Say whether the two share one cause.** A strong prior worth checking first, because it has bitten three times
   today: a read that lacks a DB grant or a principal under the acting role gives an unhandled exception, and the
   page renders the generic screen. Today's fixes covered the public pre-auth routes and the billing webhook —
   these two pages are neither.
4. **Fix it** at the same seam the earlier fixes used — a narrow grant or accessor, not a wider role, and not a
   `try/catch` that hides the failure. If the cause turns out to be unrelated to privileges, fix the actual cause
   and say so.
5. Prove both pages render for their intended roles, live on TEST, with status codes.

## Boundaries

- **PROD (`135.106.162.170`) is untouchable.** TEST/DEV only.
- Another agent is redeploying TEST right now for `#1057` — check before you deploy, and do not fight it. If you
  need a deploy, wait for its lock rather than racing.
- Migration numbering: temporary number in the clone; the final one is assigned at land by the lead.
- No push.

## Done means

- The real exception for each page is named with its log line.
- The fix is in place with a behavioral test at the level the repo already tests these pages.
- Live proof both pages return `200` for their roles.
- One commit on your branch, and a report that states plainly whether it was one cause or two.
