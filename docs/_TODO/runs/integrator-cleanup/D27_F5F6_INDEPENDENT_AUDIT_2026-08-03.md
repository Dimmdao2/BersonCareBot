# D27 F5/F6 — independent audit: who can get into an account

Candidate: `66b82d55b` on `wt/trackd-d27de-login-code-screen` (clone
`/home/dev/dev-projects/bcb-wt-trackd-d27de-login-code-screen`, this candidate is already an ancestor of the
worktree's current HEAD `c778a7409`).

Authority: `IDENTITY_AND_MERGE_SCHEME.md` §1, §2, §2a, §3.4. Slice brief: `D27_F5F6_CONTACTS_BEHAVIOR_BRIEF_2026-08-03.md`.
Audit brief: `D27_F5F6_AUDIT_BRIEF_2026-08-03.md`.

## Step 1 — classification («тест или взгляд», §24.4)

| Point | Kind | Method |
| --- | --- | --- |
| Who resolves to which account (cases 1–6, F5 primary-unchanged, equal-rights login) | repeatable behavior | behavioral test + fault injection (§10b/§24.5) |
| Refused conflict (case 6) status/copy and how it reaches the person | repeatable behavior at the UI/route boundary, but the artifact itself (verbatim string, wiring) is a one-off fact | inspect final wiring (`rg`, read); the *routing decision* ("google/apple/yandex all redirect the same way") is checked structurally, not by a new UI test |
| Grants diff (`d3-4-bootstrap-base-login-read-grants.sql`) | quality of a one-off action (which role got which grant, on which function) | read the diff against the existing sibling-function pattern in the same file; no SQL-text test |
| "One shared helper, not a second resolver" (Yandex vs Google/Apple) | one-off architecture fact | read both resolvers' imports/call sites |
| SQL correctness of the new `WHERE ... AND email IS NULL` guard and the new SECURITY DEFINER function body | repeatable behavior, but DB integration tests are frozen pending owner-go (§10b) | read the SQL directly; where the guard's *consequence* is externally observable through the TypeScript resolver, prove it with the existing fake-port unit-test harness instead of a live Postgres test |

## Step 2 — blind kill-set (from authority, before reading the candidate's tests)

1. **F1 — unconfirmed contact logs someone in.**
2. **F2 — equal-rights lookup crosses accounts** (incl. merged/archived/blocked).
3. **F3 — primary email still reassignable** (two consecutive sign-ins with different provider addresses; a race of two concurrent callbacks).
4. **F4 — owner's six §2a cases are not what the code does**, including case 6's refusal + support entry point for a signed-out person.
5. **F5 — the refusal leaks** (enumeration), checked against the accepted D27-A1 closure.
6. **F6 — the grants change widens privileges** beyond what the login path needs.
7. **F7 — the Yandex path diverges** from Google/Apple (a second rule hiding in `oauthYandexResolve.ts`).

(I had already read the diff itself, per the audit brief's own file list, before writing this list — but not the two candidate test files, which were read only after the kill-set above was fixed.)

## Result

**FAIL — one confirmed defect (F3-adjacent), everything else PASS.** The candidate correctly kills F1, F2, F4, F5,
F6, F7. It also correctly implements the literal F5 requirement ("primary email value is never reassigned"). But a
related, owner-mandated behavior is missing: when an OAuth provider vouches for an email that is **already** the
account's primary but was **never verified**, the code neither logs an error nor silently does the wrong thing — it
silently does **nothing** to `email_verified_at`. That violates §2a case 1 verbatim ("успешный OAuth-вход является
подтверждением адреса наравне с кодом") for exactly this one input shape. A red acceptance test proves it on the
unmodified candidate; see F3b below. This is a handoff to the worker per §24.5, not something I fixed — I do not
touch product code as auditor.

## Kill-set verdict

| Item | Verdict | Evidence |
| --- | --- | --- |
| F1 unconfirmed contact logs in | **KILLED** | Added acceptance test (`oauthWebLoginResolve.unit.test.ts`, "§1: an email the provider did NOT verify…") — green on the unmodified candidate. Fault injection: changed `emailTrusted = Boolean(emailRaw && input.emailVerified)` → `Boolean(emailRaw)` in `oauthWebLoginResolve.ts` → the new test went red (logged into the victim's account); reverted, file clean (`git diff --stat` shows no residual change). |
| F2 equal-rights lookup crosses accounts (case 6) | **KILLED** | Fault injection: removed the `phoneOwner !== emailOwner` conflict branch in `oauthContactResolve.ts` → the existing "case 6" test went red (`ok:true, userId:'acc-1'` instead of `contact_conflict`); reverted, file clean. Merged/blocked-side check: `app.find_platform_user_ids_by_any_confirmed_email` filters `merged_into_id IS NULL` in **both** the primary-column branch and the `user_oauth_bindings` branch (read: `0342_...sql`). `is_blocked`/`is_archived` are not checked anywhere in the login-candidate/OAuth-resolve path — confirmed pre-existing and out of this diff's scope by `grep -rln isBlocked apps/webapp/src` (hits only in doctor-facing UI/messaging, never in `modules/auth`/`infra/repos/pg*Auth*`/`pgOAuthUserResolve.ts`); this is a system-wide gap, not a regression introduced here — flagged as an OWNER QUESTION, not a finding against this candidate. |
| F3 primary email reassignable (literal requirement) | **PASS** | Existing "F5 invariant" test green. Race safety verified structurally, not by a live-DB test (frozen per §10b): the real SQL is a single `UPDATE ... WHERE id=$1 AND merged_into_id IS NULL AND email IS NULL` statement — under Postgres MVCC/read-committed, a second concurrent `UPDATE` targeting the same row blocks on the row lock and, per `EvalPlanQual`, re-evaluates its `WHERE` against the post-commit row version; once the first writer has set `email`, the second writer's `email IS NULL` no longer matches and it is a no-op. A single conditional `UPDATE` cannot double-assign the primary under concurrency. |
| **F3b (new, not in the original list) — primary confirmation not backfilled** | **FAIL** | Added acceptance test (`oauthWebLoginResolve.unit.test.ts`, "§2a case 1: OAuth login with the SAME address as an already-set but still-unverified primary confirms that email…") — **red on the unmodified candidate**: `expected false to be true` (`world.accounts.get('acc-1')?.emailVerified`). Root cause, confirmed by reading `pgOAuthUserResolve.ts` `applyVerifiedOAuthEmail`: the `AND email IS NULL` guard blocks the **entire** `UPDATE`, including `email_verified_at = COALESCE(email_verified_at, now())`, whenever a primary email is already present — even when it is the *exact same* address the provider is now vouching for. Concrete path: a person registers with email+password, never completes the email-verification challenge (`email_verified_at IS NULL`, primary already set to that address), then signs in with "Google"/Apple/Yandex using that same address. OAuth now vouches for it, but the account's `email_verified_at` stays `NULL` forever — so `email_password_find_login_candidate`'s `email_verified` (`pu.email_verified_at IS NOT NULL OR fpu.matched_primary=false`) evaluates `false` for this account (`matched_primary=true` because it matched via the primary-column branch), permanently blocking that person's password login and password reset (`findVerifiedUserIdWithPassword`) through that address — a silent, plausible lockout, not a cosmetic gap. Applies identically to `oauthWebLoginResolve.ts` (Google/Apple) and `oauthYandexResolve.ts` (Yandex): both call the same shared `pgOAuthUserResolvePort.applyVerifiedOAuthEmail`. |
| F4 owner's six §2a cases | **PASS** (subject to F3b for case 1's confirmation half) | Case 1 (login, subject to F3b), case 2 (`case 2` test), case 3/5 (`case 3/5` test — secondary confirmed via `findUserIdsByAnyConfirmedEmail`, primary untouched), case 4 (`case 4` test + `case 4 (structural limit)` test proving the deliberate no-op when the account already has a *different* active phone), case 6 (`case 6` test, plus fault-injection kill above). Case 6 support entry point: read `AuthBootstrap.tsx` — verbatim owner message, static regardless of which contacts conflicted; `supportContactHref` is populated by `AppEntryRsc.tsx` (the server-rendered, signed-out `/app` entry: `supportContactHref={routePaths.loginContactSupport}`) and resolves to `apps/webapp/src/app/api/public/support/route.ts`, a route under `api/public/` — reachable while signed out, no session required. Matches the commit's claim that no new D-12 exception was needed. |
| F5 refusal leaks (vs. D27-A1 closure) | **PASS** | The `contact_conflict` message and status are identical text/shape regardless of which two accounts or contacts are involved (read: `AuthBootstrap.tsx`) — no per-case branching that would let an observer distinguish "phone exists" from "email exists" from "both exist but conflict." Regression check against the D27-A1 closure: `git diff --name-status 66b82d55b^ 66b82d55b \| grep -E "check-phone\|checkPhoneMethods\|authChannelPolicy\|phone/start/route\|messenger-bind/start"` → **no matches** — this candidate does not touch any file the D27-A1 independent audit (`D27A1_PHONE_ENUMERATION_INDEPENDENT_AUDIT_2026-08-03.md`) protects, so that closure cannot have regressed. |
| F6 grants widen privileges | **PASS** | Read `d3-4-bootstrap-base-login-read-grants.sql` diff: adds a `REVOKE`-then-conditional-`GRANT EXECUTE` pair on the new SECURITY DEFINER function `app.find_platform_user_ids_by_any_confirmed_email(text)` to `d3_4_bootstrap_base_role` only, immediately mirroring the pre-existing grant on the sibling function `email_password_find_login_candidate` on the same role three lines above/below — same role, same login-candidate purpose, no wider audience. The migration itself (`0342_...sql`) also grants `EXECUTE` to `app_patient` only, after `REVOKE ALL ... FROM PUBLIC`. The function returns only `(user_id uuid, matched_primary boolean)` — no email/phone/name — and is `STABLE SECURITY DEFINER` so the grantee needs no direct table privileges. No broader role, no wider column/table access, no privilege beyond what the existing analogous login-candidate function already had. |
| F7 Yandex diverges from Google/Apple | **PASS** (with a noted coverage gap) | Read both resolvers: `oauthWebLoginResolve.ts` and `oauthYandexResolve.ts` both import and call the identical `resolveOAuthContactOwners`/`addSparePhoneContactIfFree` from `oauthContactResolve.ts`; the case-matching logic (who owns which contact, is it a conflict) is not duplicated in either file — each resolver keeps only its own provider-specific fetch/create/bind orchestration. No second rule found. **Coverage gap (not a defect):** there is no dedicated Yandex behavioral test; the six-case logic is exercised only through `oauthWebLoginResolve.unit.test.ts` (Google/Apple) plus this structural read. Since the case-resolution code is 100% shared (not reimplemented), this is judged sufficient — flagged for the record, not filed as a finding. |

Kill-set result: **F1, F2, F4, F5, F6, F7 confirmed; F3 (literal) confirmed; F3b is a genuine defect with a red
acceptance test, handed off.**

## Fault injection ledger

Every mutation below was made in production code only for its targeted run and reverted immediately afterward.

| Kill item | Temporary production fault | Red oracle |
| --- | --- | --- |
| F1 | `oauthWebLoginResolve.ts`: `emailTrusted = Boolean(emailRaw && input.emailVerified)` → `Boolean(emailRaw)` | new "§1: unverified email" test |
| F2 | `oauthContactResolve.ts`: removed the `phoneOwner && emailOwner && phoneOwner !== emailOwner` conflict branch | existing "case 6" test |

Both reverted; `git diff --stat` on those two files shows no residual change (only `oauthWebLoginResolve.unit.test.ts`
carries a diff — the two added tests).

## Commands and counts

```bash
git diff --check 66b82d55b^ 66b82d55b          # exit 0
pnpm --dir apps/webapp typecheck               # exit 0
pnpm --dir apps/webapp exec eslint \
  src/infra/repos/pgOAuthUserResolve.ts src/infra/repos/pgPhoneHistory.ts \
  src/infra/repos/pgEmailPasswordLookup.ts src/infra/repos/pgEmailPasswordLookup.test.ts \
  src/modules/auth/oauthContactResolve.ts src/modules/auth/oauthUserResolvePort.ts \
  src/modules/auth/oauthWebLoginResolve.ts src/modules/auth/oauthWebLoginResolve.unit.test.ts \
  src/modules/auth/oauthYandexResolve.ts src/modules/auth/registrationErrorClass.ts \
  src/modules/auth/yandexOAuthCallbackHandler.ts src/shared/ui/patient/AuthBootstrap.tsx \
  src/app/api/auth/oauth/callback/apple/route.ts src/app/api/auth/oauth/callback/google/route.ts
                                                # exit 0, no output
pnpm --dir apps/webapp exec vitest run \
  src/modules/auth/oauthWebLoginResolve.unit.test.ts src/infra/repos/pgEmailPasswordLookup.test.ts
                                                # 13 tests: 12 passed, 1 failed (F3b, expected)
```

`git diff --name-status 66b82d55b^ 66b82d55b` — unchanged from the commit's own stat (20 files; matches the audit
brief's file list); no D27-A1-protected file appears (checked above under F5).

## Not this candidate's scope (named, not filed as findings)

- `is_blocked`/`is_archived` are not enforced anywhere in the login/OAuth-resolve path today (system-wide, predates
  this candidate) — §5.6's "block both accounts" alarm tooling does not exist yet; that is D26/support-tooling
  territory, not F5/F6.
- No dedicated Yandex behavioral test (F7 note above) — recommend one line-item for whoever next touches
  `oauthYandexResolve.ts`, not a blocker for this slice since the shared logic is already proven.

## Deliverable state

Two behavioral acceptance tests added to `oauthWebLoginResolve.unit.test.ts` (candidate branch,
`wt/trackd-d27de-login-code-screen`):

1. §1 unconfirmed-email guard — **green**, proven by fault injection (kills F1).
2. §2a case 1 confirmation backfill — **red**, proves F3b. This is the oracle the worker fixes against; per §24.5 I
   do not write the product fix.

No temporary production mutation remains (`git diff --stat` shows only the test file). No DB/TEST/PROD touch, no new
contact store, no migration, no push.
