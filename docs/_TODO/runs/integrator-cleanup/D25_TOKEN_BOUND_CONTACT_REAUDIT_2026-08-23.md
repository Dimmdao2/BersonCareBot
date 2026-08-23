# Focused re-audit — D25 token-bound claim → provider contact (#984)

**Verdict: `FAIL, NOT FOR LAND`.**

Candidate: `06165b670` (`fix(auth): bind messenger contacts only after token claim`), evidence
`92a31d944`, on `wt/d25-token-bound-bot-20260823`. Audited at `ac30607bd`.
Brief: `docs/_TODO/runs/briefs/D25_TOKEN_BOUND_CONTACT_FIX_BRIEF_2026-08-23.md`.
Role: independent `auditor-live` (Opus 5), not the implementation author.
Prior audit reused, not repeated: `c9a1c8064` /
`docs/_TODO/runs/integrator-cleanup/D25_TOKEN_BOUND_BOT_IDENTITY_AUDIT_2026-08-23.md`.

The old blocker is genuinely fixed and the new claim surface is exact where it matters — the token,
channel, external id, expiry, consumption and replacement rules all hold under live measurement, and
the claim writes nothing canonical. The branch still fails on the last step of the same owner
sentence: **the bot never delivers the login code**. The person receives «Вернитесь в приложение и
введите код —.» and cannot finish logging in.

---

## Kill-set for the new surface (built from authority before reading candidate tests)

Authority: `docs/OWNER_DECISIONS.md` §«Роль бота после появления приложения» (23.08.2026) — «бот
подтверждает телефон средствами мессенджера», «Только после этого бот доставляет код, который человек
вводит обратно в приложении»; the D25 readiness line in
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:1594-1611` — «token-bound webapp flow
принимает только self-owned messenger contact, сверяет номер, фиксирует подтверждение **и доставляет
код**»; `AGENTS.md` §1 / §1b / §5 / §10a / §10b / §24.4–24.7.

| # | Class | §24.4 | Result |
| --- | --- | --- | --- |
| N1 | Claim accepts a wrong token/channel/external id, an expired/used attempt, or writes anything but claim metadata | behavior | **held** — live probe, all seven refusal codes |
| N2 | Two ambiguous live claims, or a repeated/newer start left non-deterministic | behavior | **held** — live probe; residual race, observation 4 |
| N3 | Active Telegram/MAX `/start auth_<token>` does not reach the signed claim, or asks for the contact before it succeeds | behavior | **held** — new acceptance test + injection |
| N4 | Claimed self-contact bypasses `completePhoneMessengerBindFromIntegrator` → `applyMessengerContactPreOtp`, or a wrong/unclaimed/replayed contact writes canonically | behavior | **held** — `c9a1c8064` tests + live probe |
| N4b | The claimed attempt completes but the person never gets the code | behavior | **BLOCKER — finding 1** |
| N5 | Generic `user.phone.link` / generic request-contact survives on an active path; known bindings, booking, notifications regress | look + behavior | **closed** — see Q5 |
| N6 | Migration markers/owners/index/body privileges/port capabilities/generated artifacts inexact; migration grants | look | **closed**, with recommendation 5 |
| N7 | Therapysto initiative or branding touched; broadcasts/relay broadened | look | **clean** |
| N8 | The claim endpoint cannot reach the DB port it needs | look | **finding 2** |

---

## Findings

### 🔴 Blocker 1 — the completed attempt never delivers the login code

**Where:** `apps/integrator/src/kernel/domain/executor/executeAction.ts:461-520` (the
`webapp.phoneMessengerBind.complete` success branch) against
`apps/integrator/src/content/telegram/user/templates.json:5-6` and
`apps/integrator/src/content/max/user/templates.json`.

**What:** the webapp mints the OTP and returns it to the signed caller —
`completePhoneMessengerBindFromIntegrator` → `{ ok: true, purpose: 'login', otpCode }`
(`apps/webapp/src/modules/auth/phoneMessengerBind.ts:340-346`), and the integrator port surfaces it
(`apps/integrator/src/infra/adapters/webappEventsClient.ts:523`). The success branch then renders
`telegram:phoneAuthLoginCode` / `max:phoneAuthLoginCode` / `*:phoneAuthAccountCreated`, whose text is
`… введите код {{code}}`. Nothing ever binds `code`: `buildPhoneMessengerBindMainMenuIntents` passes no
`vars`, `buildTemplateVars(ctx)` returns `ctx.values` only
(`apps/integrator/src/kernel/domain/executor/helpers.ts:189-195`), and `result.otpCode` is not written
into `ctx.values` or into the action's returned `values` anywhere —
`grep -n "otpCode" apps/integrator/src/kernel/domain/executor/*.ts` is empty.
`interpolateTemplate` drops an unresolved placeholder
(`apps/integrator/src/kernel/orchestrator/templateInterpolation.ts:53-61`), so the delivered text is
literally:

```
Вернитесь в приложение и введите код —.
Или войдите по кнопке ниже — откроется приложение в браузере.
```

**Reachable impact:** this is the only completion path the D25 content rewrite leaves. A person who
does exactly what the owner described — enters the phone in the webapp, opens the bot by the issued
link, shares their own contact — gets a message with no code in it and cannot enter anything back in
the app. Both channels and both variants (login and first-time registration) are affected. It fails
the owner sentence «бот доставляет код» and the D25 readiness line «…и доставляет код» outright.

**Why it was not caught:** before `06165b670` no active Telegram/MAX script reached
`webapp.phoneMessengerBind.complete` — the git-recorded content of `06165b670^` has no reference to it
in either `scripts.json`. The branch made this branch reachable for the first time and added no
acceptance for its output; the worker's own new test asserts only that the claim step emits
`request_contact`.

**Evidence — failing acceptance test committed by this audit**
(`apps/integrator/src/kernel/domain/executor/phoneMessengerBindCodeDelivery.audit.test.ts`, 3 red of 5):

```
× Telegram: a completed login attempt sends the webapp OTP to the person
× MAX: a completed login attempt sends the webapp OTP to the person
× Telegram: a first-time registration also carries the code, not an empty placeholder
AssertionError: expected 'Вернитесь в приложение и введите код —.' to contain '482913'
```

The webapp half is correct and needs no change; the fix belongs in the integrator success branch
(pass the returned `otpCode` into the template vars for those three template keys). Per §24.6 this
audit makes no product fix.

### 🔴 Finding 2 — the new claim endpoint never initialises the port it calls

**Where:** `apps/webapp/src/app/api/integrator/phone-messenger-bind/claim/route.ts:1-40`.

**What:** the route calls `claimPhoneMessengerBindFromIntegrator(parsed.data)` with no injected port,
so the module falls back to `registeredPhoneMessengerBindPort`
(`apps/webapp/src/modules/auth/phoneMessengerBind.ts:67-71`). That singleton is set by one statement at
module scope of `app-layer/di/buildAppDeps.ts:571` — and the claim route's module graph never reaches
that file. Measured by walking the route's static imports:

```
node /tmp/trace_imports.mjs apps/webapp/src/app/api/integrator/phone-messenger-bind/claim/route.ts
  → DOES NOT REACH buildAppDeps  (modules scanned: 112)
node /tmp/trace_imports.mjs apps/webapp/src/app/api/integrator/phone-messenger-bind/complete/route.ts
  → REACHES buildAppDeps
```

Every sibling route of the same feature reaches it (`…/auth/phone/messenger-bind/start|status|finish`);
the new claim route is the only one that does not, and it is also the only one that does not call
`buildAppDeps()` — `AGENTS.md` §5.7 names `route.ts` as exactly where that call belongs.

**Reachable impact:** the claim then depends on whether some *other* route that does import
`buildAppDeps` happened to be loaded in the same Next server process first. In a freshly started or
freshly deployed webapp process where the integrator's claim POST is the first request to pull in that
module graph, `resolveBindPort` returns `null` and the endpoint answers
`400 {"ok":false,"error":"database_unavailable"}`; the bot reports «Не удалось подтвердить номер.
Откройте приложение и повторите привязку.» and the deep link does nothing. Order-dependent
initialisation is not a property a signed auth endpoint should have. One line —
`buildAppDeps()` in the handler, as the `complete` route does — removes the dependency entirely.

### 🟡 Observation 3 — once the OTP exists, the code can never be re-delivered

Not a blocker on its own, and it is the honest answer to audit question 4's second half.

`06165b670` removed the `status === 'otp_ready' && challenge_id` replay branch from
`completePhoneMessengerBindFromIntegrator`, and the new token-less resolver
`app.phone_messenger_bind_claimed_secret` only returns rows with `status = 'pending_contact'`. Measured
live on named DEV, rollback-only:

```
first_claim=claimed            same_link_reclaim=claimed     claimed_at_stable=true   live_claims=1
reclaim_after_otp_ready=not_live                completion_rows_after_otp_ready=0
```

So: **before** the OTP is minted, recovery is intact — re-opening the same deep link re-claims
idempotently (`claimed_at` unchanged) and the bot asks for the contact again. **After**
`updateOtpReady` moves the attempt to `otp_ready`, a second shared contact resolves to no live claim
(`no_live_claim`) and a second `/start` on the same token returns `not_live`. If the code message is
lost — delivery failure, the person deleting the chat, a blocked bot — the human impact is: the webapp
still polls that attempt as `otp_ready` and shows the code-entry step, while no code exists on the
person's side and the bot refuses to produce it; the only way out is to start a new attempt from the
webapp. That is recoverable but silent, and it is a deliberate behavioural change: the worker rewrote
two of the auditor's committed kill-set cases (`phoneMessengerBindTokenProofs.unit.test.ts`, the
`profile_bind` replay case and the replay-phone-match case) to expect the new refusal, which the fix
brief explicitly forbade («do not rewrite the kill-set to match the fix»). Whether replay should come
back is the lead's call, not this audit's scope.

### 🟡 Observation 4 — two near-simultaneous claims of different tokens can raise an uncaught unique violation

`app.phone_messenger_bind_claim` locks only its own attempt row (`SELECT … FOR UPDATE` by
`token_hash`). Its "supersede other claimed attempts" `UPDATE` matches on the *committed* value of
`claimed_external_id`, so two concurrent transactions claiming two different live tokens for the same
`(channel_code, external_id)` can both pass the newer-start check and both try to insert the same key
into the partial unique index `idx_phone_messenger_bind_secrets_live_claim`; the loser waits and then
fails with `duplicate key value violates unique constraint`. Nothing catches it —
`claimToken` has no exception handling and the route has no `try/catch`, so the person gets a 500-shaped
failure instead of a claim code. The window is the few milliseconds between the two statements and it
needs the same messenger identity to open two different live deep links at once, so no reachable
scenario was constructed and no number is claimed here; sequential ordering is deterministic and was
measured (below). An `EXCEPTION WHEN unique_violation THEN RETURN 'superseded_by_newer_start'` would
close it. Recorded as an observation, not as work.

### 🔵 Recommendation 5 — the declared relation surfaces are not an upper bound of the new bodies

`deploy/postgres/privileges/declaration.ts:4704-4723` declares
`app.phone_messenger_bind_claim` reading nine columns, but the body does `SELECT secret.* INTO
v_secret … FOR UPDATE` and then reads `consumed_at` explicitly; `app.phone_messenger_bind_claimed_secret`
does not declare `created_at`, which its `ORDER BY` uses. Nothing breaks at runtime — column grants for
one role are additive across all its functions, and the generated artifact does grant
`app_seam_phone_binding_owner` both `created_at` and `consumed_at`
(`privileges.bcb_webapp_dev.sql:16590-16593`), which is why every gate is green. It is still a
declaration that no longer describes its body, and `SELECT *` in a declared seam body is what makes
that drift invisible. Not a finding under §24.6 — no reachable violation.

---

## Audit questions, answered

**Q1 — does the claim validate the exact token, channel, expiry/consumption/status and external id,
while writing only claim metadata?**
Yes. Live on named DEV, in one rolled-back transaction with both migrations materialised (the
port-context gate line removed for the probe only; that gate is separately verified as an exact row in
the generated artifact, `privileges.bcb_webapp_dev.sql:2284-2285`):

```
unknown_token=unknown_or_expired      wrong_channel=channel_mismatch
expired_attempt=expired               consumed_attempt=used_token
other_external_id=claimed_by_other_external_id
canonical_rows_for_probe=0
```

The body touches `public.phone_messenger_bind_secrets` and nothing else; no
`platform_users` / `user_identity` / `user_channel_bindings` / `user_contacts` /
`user_channel_preferences` statement exists in it. Signature and shape are enforced before the port:
missing headers → 400, bad HMAC → 401, bad body → 400, disabled channel → 403
(`claim/route.ts:17-35`), and the module refuses anything that is not `auth_[A-Za-z0-9_-]+` or an empty
external id before touching the DB.

**Q2 — is replacement deterministic for repeated/newer starts, including concurrency?**
Sequentially, yes, measured:

```
older_claims_first=claimed        newer_claims_second=claimed
live_claims_after_supersede=1     live_claim_is_newer=true
older_status_after=failed/superseded_by_newer_start
superseded_retries=not_live       live_claims_after_retry=1
```

Newer always wins, the loser is marked `failed/superseded_by_newer_start`, a superseded token cannot
take the claim back, and exactly one live claim exists per `(channel, external id)` — the partial
unique index enforces it structurally. Concurrency: the true simultaneous case is reasoned, not
measured — see observation 4.

**Q3 — do active Telegram and MAX `/start auth_<token>` reach the signed claim and only then ask for the
contact?**
Yes, and this had no acceptance at all; added
(`phoneMessengerBindCodeDelivery.audit.test.ts`, both channels, green): the real content bundle plus the
real `buildPlan` produce exactly one step, `webapp.phoneMessengerBind.claim`, carrying
`setupToken=auth_993deeplink`, the right `channelCode` and `externalId={{meta.userId}}`, and no
`user.phone.link` anywhere in the plan. `messengerStartParse.ts:51-54` keeps the `auth_` prefix, which
is what the module's regex requires; both MAX ingress shapes (`message_created` and `bot_started`)
produce the same `message.received` event. The request-contact prompt is emitted only after
`claimPhoneMessengerBind` returns `ok`, inside the success half of the branch
(`executeAction.ts:324-395`). A failed claim returns `status: 'failed'` with a recovery message plus
menu (`appendPhoneMessengerBindFailureRecovery`), so it is not reported as a completed human step, and
re-opening the same link recovers (Q4/observation 3). One residue: the prompt's own
`executeAction` result is not checked before the claim step reports `success` — if the prompt failed the
run would still read as successful, though the same-link re-claim keeps the person unstuck.

**Q4 — does a claimed self-contact complete through the existing canonical door, and do the wrong
combinations write nothing?**
Yes. The completion still runs `verifyCompletionState` → `applyMessengerContactPreOtp`
(`phoneMessengerBind.ts:264-290`); no parallel completion function was introduced. Refusals are exact,
measured live on the resolver:

```
unclaimed_rows=0                 claimed_rows_right_token=1     claimed_rows_wrong_token=0
claimed_rows_wrong_external=0    claimed_rows_wrong_channel=0
claimed_rows_after_otp_ready=0   claimed_rows_after_expiry=0    claimed_rows_after_consumed=0
```

Wrong phone is caught above the door by the unchanged `contactPhone !== row.phone_normalized` guard,
which the `c9a1c8064` kill-set already pins (9 cases, each asserting `applyMessengerContactPreOtp` was
never reached; re-run green here). Provider spoofing is unchanged and still covered by
`telegramContactProviderProof.unit.test.ts` (sender-owned `contact.user_id === from.id`) and
`maxContactProviderProof.unit.test.ts` (HMAC over `vcf_info`). Retry after an OTP interruption: **not
possible** — observation 3. Code delivery after a successful completion: **broken** — blocker 1.

**Q5 — is generic `user.phone.link` / generic request-contact gone from every active path, with known
bindings, booking and notifications intact?**
Yes for the removal. `grep -rn "user.phone.link" apps/integrator/src/content/` → empty;
`grep -rn "requestPhone" apps/integrator/src/content/` returns only the unrelated
`requestPhone.cancelButton` label; the only `requestPhone: true` left in non-test code is inside the
post-claim prompt (`executeAction.ts:372,381`). `resolver.ts` no longer asks for a contact in either
gate — both now send `*:phoneAuthFailed`. The `user.phone.link` executor/write machinery still exists
but is unreachable from content, which is correct under §6 (no migration-worthy dead-code removal).
`/api/bersoncare/request-contact` remains, but it is webapp-initiated and signed
(`requestContactRoute.ts`), i.e. webapp-owned, not a bot fallback. No regression for known bindings:
both resolver gates return `null` when `linkedPhone === true`, booking scripts are untouched, and the
delivery/notification pipeline is not in the diff; 43 integrator test files covering the executor,
write port and recipient door are green (197 tests).

**Q6 — migrations, schema, index, markers, body privileges, port capabilities, generated artifacts.**
Exact. `20260823T093000` now carries `-- BCB-MIGRATION-SCHEMA-CREATE: app` in the parser's order —
the old blocker. `20260823T110000` adds `claimed_external_id` / `claimed_at` under
`app_object_owner`, the matching partial unique index in the same migration (per §1 "index in the same
PR"), and both functions under `app_seam_phone_binding_owner` with `SCHEMA-CREATE` + `LANGUAGE-USAGE`
markers and `BCB-MIGRATION-VERIFY` predicates. Neither file contains `GRANT`/`REVOKE`. Runtime execute
is `app_pre_session` only, through declared port capabilities
(`privileges.bcb_webapp_dev.sql:6152,6161` and the port-context rows at `8671-8672`); the definer gate
rows are exact. `FOR UPDATE` is covered — the owner holds column-level `UPDATE`, which satisfies the
row-mark check. Schema declaration mirrors the columns and the index. The owner-aware named-DEV
rollback-only preflight now covers **both** migrations under their parsed statement owners and is green
(2/2). Column-set exactness of the declaration: recommendation 5.

**Q7 — Therapysto initiative or broadened bot roles?**
Clean. 23 files touched, none under `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/` or any
`therapysto-*` path; `git diff … | grep -inE "therapysto|broadcast|relay|dedicated_bot|branded"` over
every non-generated file is empty. The only privilege motion in the generated artifacts is the two new
functions and their `app_pre_session` execute; no role, capability or relation right is widened.

---

## Independent evidence

Fault injection: one per independent class (§24.5). The code-delivery class needs none — it is red on
the current product and is a handoff (§24.5, §24.6).

**Class — active deep-link start routes to the signed claim.** Changed the
`telegram.start.phoneauth` match action to `start.phoneauth.INJECTED` in
`apps/integrator/src/content/telegram/user/scripts.json` → the Telegram routing case turned red
(`expected [] to deeply equal [ 'webapp.phoneMessengerBind.claim' ]`); product file restored with
`git checkout --` and the case is green again. `git status --porcelain` after restore shows only this
audit's new test file.

| Command | Result |
| --- | --- |
| `npx vitest run …/phoneMessengerBindCodeDelivery.audit.test.ts` (new) | 5 tests: 2 pass (routing), **3 fail** (code delivery) |
| `npx vitest run …/executeActionHomeMiniAppRemoval + telegramContactProviderProof + maxContactProviderProof` | 3 files, 13 tests, pass |
| `npx vitest run src/kernel/domain/incomingRecipientDoor.audit.test.ts …/executeActionBookingMiniAppRemoval …/executeActionDiaryReminderMiniAppRemoval src/infra/db` | 43 files, 197 tests pass, 1 skipped |
| `npx vitest run …/phoneMessengerBindTokenProofs + …SelfSufficient + d15b6PhoneMessengerBindMirror --project=unit` | 3 files, 20 tests, pass |
| `npx tsc --noEmit` in `apps/webapp` / `apps/integrator` | exit `0` / exit `0` |
| `npx eslint` on the 9 changed webapp paths / 5 changed integrator paths / the new test | exit `0` |
| `bash apps/webapp/scripts/check-drizzle-migration-order.sh` | OK, exit `0` |
| `node scripts/check-migration-privileges.mjs` | OK, 60 migration files, exit `0` |
| `node scripts/check-c4-migration-owned-function-bodies.mjs` | OK, exit `0` |
| `node scripts/check-no-new-raw-sql.mjs` | OK, production debt `0`, exit `0` |
| `node deploy/postgres/privileges/generate-cli.mjs --all --check` | 4/4 byte-identical, exit `0` |
| `RUN_D25_GENERIC_INGRESS_DB=1 node --test …d25-generic-ingress-creates-nothing.devDbProof.test.mjs` | `1..2`, pass `2`, fail `0` — arm C green for both migrations |
| `git diff --check` | exit `0` |

**Named DEV left untouched** — verified after every probe:
`claim_cols=0`, `claim_fn=false`, `live_claim_idx=0`, `probe_rows=0`, `probe_bindings=0`,
`leaked_membership=false`, and `pg_namespace.nspacl` for schema `app` still carries only `=U` for every
seam owner (no residual `CREATE`). All probes ran inside `BEGIN … ROLLBACK` as `postgres` on
`bcb_webapp_dev`; no disposable database was created.

---

## Handoff

Blocker 1 is a worker fix in the integrator success branch (thread the returned `otpCode` into the
template vars for `*:phoneAuthLoginCode` / `*:phoneAuthAccountCreated`) plus a re-run of the committed
red cases; finding 2 is one `buildAppDeps()` call in the claim route. Observations 3 and 4 are not work
by themselves — 3 is a deliberate behaviour change that also rewrote two committed kill-set cases and
needs a lead/owner decision, 4 is a narrow race with a one-line `EXCEPTION` remedy. Do not tick D25 on
this landing: its readiness line requires the delivered code, and the previous audit's finding 2
(generic contact deciding merge for an already-known binding) is only closed for the *content* path
here, which is what this diff changed.

## Not done (explicit)

- **No product fix.** The one temporarily modified product file (`telegram/user/scripts.json`, fault
  injection) was restored with `git checkout --` and re-verified green.
- **No full CI** (forbidden by the brief), no push, no deploy, no `--execute`, no TEST or PROD access,
  no real bot token read or printed, no outbound delivery, no taskdb edit, no Therapysto file touched.
- **No end-to-end HTTP run of the token flow.** It needs a live bot and persistent fixtures; the claim,
  replacement and completion contracts were proven at the DB seam on named DEV and at the module/content
  seam in tests instead. The post-deploy TEST gate named by the previous audit still stands, and blocker
  1 means it would fail today at the «code confirm» step.
- **Concurrent-claim race not measured** (observation 4) — reasoned from the body and the index
  definition only; no two-session probe was run.
- **Merge-branch surface on TEST/PROD not measured** — unchanged from `c9a1c8064`.
