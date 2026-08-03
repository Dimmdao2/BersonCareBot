# D27 — independent audit of the code-delivery decision table

Auditor: independent Claude agent, no code authorship on this candidate.
Candidate: `c65d911a3` on `wt/trackd-d27de-login-code-screen`, HEAD at audit time `385645ab9`
(clone `/home/dev/dev-projects/bcb-wt-trackd-d27de-login-code-screen`).
Scope: `c65d911a3` (F1–F4 reconcile) together with `96bad16a3` (D27-D/E screen) and `053aad09c`
(B1 rewrite), all already on this branch. F5/F6 are out of scope (separate slices, not built here —
verified, see Boundaries check below).

Authority read: `IDENTITY_AND_MERGE_SCHEME.md` §1a, §2, §2a, §3 (3.1–3.6); `WORK_ORDER.md` item D27,
decision Р-D27 (§2.3); `D27_CHANNEL_ORDER_RECONCILE_BRIEF_2026-08-03.md` F1–F4.

## Step 1 — classification (test vs look), per AGENTS.md §24.4

| Item | Class | Method |
|---|---|---|
| Default OTP channel decision (F1) | repeatable behavior | behavioral test + fault injection |
| Explicit-preference-wins-over-default | repeatable behavior | behavioral test + fault injection |
| Disabled-channel silence vs SMS substitution (F2) | repeatable behavior | behavioral test + fault injection |
| Anonymous-vs-known code path/response shape (anti-enumeration) | repeatable behavior | behavioral test + fault injection |
| Code screen composition (4 owner elements) and alt-channel list (F3) | repeatable behavior | behavioral test + fault injection (crash reproduction) |
| Email-to-unconfirmed-phone gate | repeatable behavior | behavioral test + fault injection |
| `confirming_channel` column + migration 0341 | one-off quality | read + AST/grep introspection, no source-text test written |
| Stale route.ts comment (F4) | one-off quality | read |
| WORK_ORDER.md D27 notes accuracy | one-off quality | read, cross-checked against code |

No test was written asserting absence of source text; the one existing SQL-string assertion in
`getDefaultAuthOtpChannel.test.ts` (`expect.stringContaining('FROM user_phone_history')`) is not a
style/text-pin — it asserts *which data source* the decision reads from, which is the behavior in
question (F1), verified further by mocked-response fault injection below.

## Step 2/3 — blind kill-set, fault injection, results

All fault injections below were applied to the working tree, run against the existing/added test
suite, observed red, then reverted with `git checkout --`. `git status --short` was empty before each
injection and after each revert (confirmed).

| # | Named fault | Method | Result |
|---|---|---|---|
| 1 | Default channel ignores `confirming_channel` (old earliest-linked heuristic silently becomes the rule even when a row has real provenance) | Deleted the `confirming_channel` read branch in `pgChannelPreferencesPort.getDefaultAuthOtpChannel` | **KILLED** — `pgChannelPreferences.getDefaultAuthOtpChannel.test.ts` 4/4 red (`prefers the channel that confirmed the current phone…`, the NULL-fallback case, the no-active-row case, the SMS-never-a-default case) |
| 2 | Explicit profile preference stops winning over computed default | Swapped priority in `channel-preferences/service.ts:resolveAuthOtpChannel` (default checked first) | **KILLED** — `channel-preferences/service.test.ts` → `prefers the explicit saved preference over the computed default` red (`telegram` returned instead of `max`) |
| 3 | Disabled/unconfigured resolved channel silently substitutes SMS instead of staying silent | Reverted `route.ts` to the pre-fix `if (resolved && effectivePolicy[resolved])` / `else if (isRuMobile && effectivePolicy.sms)` structure | **KILLED** — `phoneStartFallback.route.test.ts` → `stays silent when the resolved channel is not enabled+configured (no SMS fallback)` red (delivery became `{channel:'sms'}` instead of suppressed) |
| 4 | Anonymous path regains an enumeration oracle (skips channel resolution / falls to a different code path for an unknown number) | Changed `if (automaticPublicLogin)` to `if (automaticPublicLogin && user)` in `route.ts`, so unknown numbers bypass channel resolution entirely | **KILLED** — `phoneStartFallback.route.test.ts` → `uses the resolved default channel (email) without exposing whether the phone has an account` red (unknown-number request diverged: `challengeDeliveryChannel: 'sms'` instead of `'email'`, extra registration fields present) |
| 5 | Email delivery reaches an account whose phone is not confirmed (phone-trust gate removed) | Deleted the `isPhoneTrustedForUser` gate around `resolved === 'email'` in `route.ts` | **KILLED** — `phoneStartFallback.route.test.ts` → `does not send an email login code for an untrusted entered phone` red (delivery became `{channel:'email', email:'verified@example.test'}` instead of suppressed) |
| 6 | Code screen crashes / loses required elements when B1's channel-list deletion regresses (F3 regression reproduction) | Deleted `OTP_OTHER_CHANNELS_ORDER` export from `otpChannelUi.ts` (the exact fault this candidate fixed) | **KILLED** — `PhoneMessengerAuthFlow.ui.test.tsx` 4/7 red with `TypeError: Cannot read properties of undefined (reading 'filter')`, reproducing the four cases named in the brief exactly (SMS/email policy case, known/unknown neutral-list case, email spam-hint case, "Войти иначе" return case) |
| 7 | Alt-channel list stops showing every configured+enabled channel, or diverges between known/unknown phones | Not injected separately — covered by existing test `shows the same complete global channel list and neutral result for known and unknown phones`, which asserts `unknown.labels === known.labels`, length 4, and identical message. Read `buildLoginAlternatives` (`PhoneMessengerAuthFlow.tsx:50-65`): filters `OTP_OTHER_CHANNELS_ORDER` (global, admin-level `configured+enabled` policy) — no per-user binding check, matching §3.3 "нет разделения, есть у пользователя такой канал или нет" | **PASS** (read + green existing test) |
| 8 | `confirming_channel` written on only one of the real confirmation paths | Read all 7 call sites of `applyPlatformUserPhoneHistoryTransition` (`pgUserByPhone.ts:359,398` source=`otp`; `pgPhoneMessengerBind.ts:144,247,268` source=`messenger`; `pgUserProjection.ts:383,569` source=`projection`/`admin`). Both real confirmation paths (`otp`, `messenger`) plumb `confirmingChannel`; `projection`/`admin` correctly omit it (not a channel confirmation) | **PASS** (read) |
| 9 | Migration not nullable-safe / adds broad privileges / journal inconsistent | Read `0341_user_phone_history_confirming_channel_local.sql` (nullable `ADD COLUMN IF NOT EXISTS` + `CHECK`, no `GRANT`/`ALTER ROLE`/RLS policy change) and `schema.ts` (`confirmingChannel: text('confirming_channel')`, no `.notNull()`). Verified `_journal.json`: 340 entries, `idx` unique, `when` unique and monotonic, `idx=339` matches board reservation for `0341` in `NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` | **PASS** (read + `python3` journal integrity check: unique idx ✓, unique when ✓, sorted when ✓) |
| 10 | Stale route.ts comment (F4) not actually corrected | Read `route.ts:40-47` docblock — no longer describes "SMS → verified email" ladder; now describes resolved/default channel + SMS bootstrap-only + silence-on-disabled, matching current code | **PASS** (read) |
| 11 | WORK_ORDER.md D27 note disagrees with code (F2 / §2a cross-check) | Read `WORK_ORDER.md:868-872` (F2 note: "если резолвнутый канал не enabled+configured — тишина") against `route.ts` — agree. Note: the task's authority pointer to "§2a" for this item did not resolve to on-point text in `IDENTITY_AND_MERGE_SCHEME.md` §2a (that section is the OAuth-contact ruling, unrelated to channel-disablement); the operative authority for this behavior is Р-D27 (§2.3) plus §3.6, which do agree with the code | **PASS** (read; flagged as a non-blocking authority-pointer note, not a code defect) |

## Boundaries check

- No touch to `oauthWebLoginResolve.ts`, `pgOAuthUserResolve.ts`, or any primary-email logic — F5/F6
  untouched by this candidate, confirmed via `git show c65d911a3 --name-only` (15 files, none OAuth/email-primary related) and `grep` for `OAuth`/`oauth` in the diff (no hits). Their absence is not a finding, per task boundaries.
- No item 7 (equal-rights login across contacts) construction found.
- No integrator, D30/tariff/CMS change.
- Migration was read, not applied — no `migrate-dev.sh` run, no DB touched, no `feat`/DEV/TEST/PROD touched.

## Regression sweep (no collateral damage)

```
pnpm --dir apps/webapp exec vitest run \
  src/app/api/auth/phone/start src/infra/repos/pgChannelPreferences \
  src/infra/repos/pgPhoneHistory src/infra/repos/pgPhoneMessengerBind \
  src/infra/repos/pgUserByPhone src/modules/auth src/modules/channel-preferences \
  src/shared/ui/patient/auth src/app/api/auth/check-phone
# Test Files  16 passed (16)
# Tests  76 passed (76)
```

```
pnpm --dir apps/webapp typecheck            # clean, no errors
pnpm --dir apps/webapp exec eslint <10 touched files>   # clean, no errors/warnings
git diff --check c65d911a3~1 c65d911a3      # empty (no whitespace/conflict-marker issues)
```

## Per-fault-class result summary

- F1 (default channel provenance): **PASS** — killed under injection (#1).
- F2 (disabled-channel silence): **PASS** — killed under injection (#3).
- Explicit preference precedence: **PASS** — killed under injection (#2).
- Anti-enumeration (anonymous path): **PASS** — killed under injection (#4).
- Email-to-unconfirmed-phone gate: **PASS** — killed under injection (#5).
- F3 (code screen composition + alt-channel list): **PASS** — killed under injection (#6), completeness confirmed by existing green test (#7).
- `confirming_channel` column/migration (F1 infra): **PASS** — verified by read (#8, #9).
- F4 (stale comment): **PASS** — verified by read (#10).
- WORK_ORDER.md note accuracy: **PASS** — verified by read (#11), one non-blocking authority-pointer note.

## Findings

None survive as MUST FIX. One non-blocking observation recorded in row #11 (task's own authority
pointer to "§2a" for the F2 disabled-channel behavior doesn't resolve to on-point text in the scheme
document — the actual operative authority, Р-D27/§3.6, is present and agrees with the code). This is a
citation mismatch in the audit brief, not a defect in the candidate's code or documentation, and
requires no fix.

## Verdict

**PASS** — all 9 named kill-set items (7 behavioral + 2 one-off/read) closed: either killed under fault
injection on the current candidate, or confirmed correct by read/introspection. No regressions in the
touched surface (76/76 green). No scope creep into F5/F6/item 7 found.

## Artifact / branch state

No product code changed by this audit — all fault injections were applied and reverted in the working
tree; `git status --short` is clean. No new test files added (existing candidate tests were sufficient
to kill every behavioral fault named in the brief). This document is the only new file, committed to
`wt/trackd-d27de-login-code-screen`. Not pushed, not merged into `feat`.
