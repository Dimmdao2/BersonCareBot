# Pre-production TODO — things that must happen BEFORE a prod cutover, not before a TEST change

Owner-created list (2026-07-26). The distinction this file exists to enforce: **TEST has no live users
except the owner** (see the `test-has-no-real-users-only-owner` note). Findings phrased as "users will be
affected" are almost never TEST blockers — they are entries here, executed against PROD at cutover time.

Anything added here needs: what, why it can only be done at cutover, and who/what it depends on.

---

## 1. Notify the messenger-only users before the bot is removed — OWNER-ORDERED

**Owner, 2026-07-26:** «11 человек живут только внутри бота — ничего, перед выкаткой на деплой мы сделаем
им рассылку. Там больше чем 11.»

- Telegram (and now MAX, also being cut) is the **only** identity and the **only** delivery channel for a
  set of accounts. Measured on the DEV copy of TEST: **22 platform accounts** hold a Telegram binding with
  no e-mail, no phone, no password/PIN/OAuth, no web-push, no MAX; plus **11 integrator users** that exist
  only as bot identities with no webapp account at all.
- The DEV numbers are the SHAPE, not the value. **Re-count on PROD** with the same queries before the
  campaign — the owner expects the real figure to be larger.
- The campaign must run **while the bot is still alive** — after removal there is no channel left to reach
  these people through. It collects a phone or an e-mail so the account survives the cutover.
- Depends on: nothing in TEST. It is purely a prod-cutover step.

## 2. Docker + blue/green deployment on PROD — OWNER-ORDERED, separate task

**Owner, 2026-07-26:** «На продакшене надо будет настраивать докер и блю/грин для быстрого обновления, так
что это будет отдельная задача.»

- Goal is fast, reversible releases: a new version starts alongside the old one and traffic switches only
  after it is healthy, instead of the current stop-migrate-build-restart window.
- Interacts with **A1** (host privilege): containerising the app is option 3 there, and would make the
  host runtime user largely irrelevant. Decide the two together so the work is not done twice.
- Note for the record: the `docker` group membership found on this dev box during the A1 audit is (per the
  owner) most likely there for wg-easy, not for the deploy path. On PROD, docker becomes load-bearing —
  which means the group's root-equivalence must be designed for, not inherited by accident.

## 3. PWA + push for the global admin — OWNER-ORDERED

**Owner, 2026-07-26:** «надо сделать будет отдельно pwa для глобал админа с пуш-сервисом.»

- Comes out of the D5 notification rework: once alert recipients are derived from roles rather than from a
  list of e-mails/Telegram ids, the global admin needs a surface that can actually receive them.
- The settings matrix the owner specified (which notification/error type goes to push / SMS / e-mail) is
  the app-side half; SMS is deliberately deferred — build the mechanism, wire SMS later.

## 4. Session cutover forced sign-out — ALREADY APPROVED

The owner approved a one-time global sign-out when the session-revocation work lands (staff 12 h idle /
patient 30 d idle; the absolute ceiling numbers are still an open owner question — 7 d/90 d is what the
2026-07-25 ruling records, and the implementation follows the ruling). On PROD this logs everyone out once.

## 5. Re-count every "affected users" figure against PROD

Standing rule rather than a task: every number in the security and Telegram-removal work was measured on a
DEV/TEST copy. Before any cutover step that touches people, re-run the same query against PROD and record
both numbers. No cutover decision should rest on a TEST-derived count.
