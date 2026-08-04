# Auth-bypass claim, verified: real DB-level primitive, NOT reachable through today's HTTP surface

Response to `AUTH_BYPASS_CLAIM_BRIEF_2026-08-04.md`. Branch `wt/auth-bypass-check`, no fix applied (per brief scope).

## Headline answer

**Reproduced to a full session-equivalent result — but only by executing SQL directly as Postgres role
`app_patient`, a capability with no HTTP-reachable path found in the current codebase.** The two-step chain
(mint a challenge for an arbitrary `user_id` with a self-chosen `code_hash`, then consume it) is real, was
executed end-to-end on a disposable throwaway cluster, and was traced past the DB boundary into the actual
API route to the exact line that would mint a session cookie. It is **not** an independently exploitable
remote auth bypass today: no application code path forwards attacker-controlled `user_id`/`code_hash` into
`email_auth_insert_email_challenge`, and `app_patient` is `NOLOGIN` in every real deployment (only reachable
via `SET ROLE` from the webapp's own already-authenticated DB connection). Calling this "the same threat
model as D27-C" overstates it: D27-C's actual bug was reachable from a genuine anonymous HTTP session; this
one requires a categorically stronger starting capability (raw SQL execution as `app_patient`) that nothing
in this codebase currently hands an outside caller.

## Method

DEV is currently blocked (ledger repair in progress, see `DEV_SCHEMA_SYNC_REPORT_2026-08-04.md` — 4 migrations
stuck behind a stray watermark row). Per brief §"Границы", verified instead on a throwaway cluster built from
the full migration chain, using the repo's own disposable-Postgres harness
(`apps/webapp/scripts/postgres-integration/{harness-lib,cli}.ts`, the same mechanism
`pnpm run test:webapp:postgres` uses):

```
pnpm install --frozen-lockfile                                   # node_modules wasn't installed in this worktree
pnpm --dir apps/webapp exec tsx scripts/postgres-integration/cli.ts build-template
  → [migrate] Drizzle migrations complete count=363 direct=363 reconciled=0   (clean, full chain, zero errors)
pnpm --dir apps/webapp exec tsx scripts/postgres-integration/cli.ts clone --template=<built> --name=pbt_authbypass_check01
```

`email_auth_insert_email_challenge` and `email_otp_public_consume_latest_challenge` are defined in the
committed **a0-greenfield baseline** (`docs/ARCHITECTURE/DB_DUMPS/a0-greenfield/schema.sql`) and refined by
migration `0249_email_challenge_purpose_binding.sql` — both are part of the plain migration chain the harness
runs; the `deploy/postgres/organization-member-invites-rls.sql` runtime overlay only re-applies the identical
bodies defensively on every deploy (its own header calls this out as a "resurrection" guard), so nothing
overlay-specific had to be reproduced separately for this test.

`app_patient` is `NOLOGIN` even in this harness (discovered/created generically for ownership-transfer
grants). To connect **as** it directly — mirroring the exact runtime shape `deploy-test-saas.sh` itself
tests against (`deploy-test-saas.sh:2538`: "login and SET ROLE app_patient... Exercise that exact
transport/role transition here") — the operator role ran `ALTER ROLE app_patient LOGIN;` in this disposable
clone only, then connected with `-U app_patient` directly. No principal/session context was ever installed —
no staff/patient GUC, no `app.install_signed_context()` call — proving these accessors need none.

Cluster torn down at the end of this turn (`cli.ts teardown`); confirmed the process for `pbt_cluster_IL2zx2`
is gone and no data directory remains. (Two unrelated `pbt_cluster_*` postgres processes were already running
on the box before this turn, started by some other agent/session — left untouched, not mine.)

## 1. Reproduced end-to-end — both links, then the actual API route

**Link (a): mint a challenge for someone else's identity, with a self-chosen code hash.**

```sql
-- as app_patient, no principal set
SELECT app.email_auth_insert_email_challenge(
  '11111111-1111-1111-1111-111111111111'::uuid,   -- victim's platform_users.id
  'victim@example.invalid',                        -- victim's real email
  'attacker-chosen-hash-000',                      -- ATTACKER'S OWN CHOICE, not derived from any code
  extract(epoch FROM clock_timestamp())::bigint + 600
);
→ challenge_id = 03814480-5f91-4afa-b0db-50572d3f92f5   (succeeds, no error, no ownership check)
```

**Link (b): consume it with the same self-chosen hash — `purpose IS NULL` grandfathered as valid.**

```sql
-- as app_patient, still no principal set
SELECT * FROM app.email_otp_public_consume_latest_challenge('victim@example.invalid', 'attacker-chosen-hash-000');
→ ok=t, user_id=11111111-1111-1111-1111-111111111111, code=NULL, retry_after_seconds=NULL
```

Post-state confirms this is not a no-op: the victim's `platform_users.email_verified_at` is now set, and the
challenge row is gone (consumed exactly as a legitimate login would). Both claims in the oracle report are
therefore **CONFIRMED literally**: (a) any `app_patient`-privileged caller can mint a challenge for an
arbitrary `user_id`/email with a self-chosen `code_hash`; (b) `purpose IS NULL` is genuinely treated as valid
by the consume function (the row above never had its purpose stamped at all).

**To the actual session, not stopping at "the function returned true":** `POST /api/auth/email-otp/confirm`
(`apps/webapp/src/app/api/auth/email-otp/confirm/route.ts:71-112`) calls
`confirmPublicEmailOtpChallenge(email, code, …)`, which is a thin wrapper that hashes the raw code and calls
exactly this same `consumeLatestEmailChallenge` DB function. **If `result.ok` is true for any reason, the
route unconditionally loads the user and calls `setSessionFromUser(sessionUser)`** — no re-check of how the
row got there, no re-verification of ownership. So the DB-level result proven above is not a dead end: had it
been reachable from that route with attacker-controlled inputs, it would have produced a real session cookie
for the victim's account. The chain to a session is real and unconditional; what's missing is a way to
reach the DB function with attacker-chosen `user_id`/`code_hash` through that route.

## 2. What actually stops it: no HTTP path forwards attacker-controlled `user_id`/`code_hash`

`insertEmailChallenge` (the one TypeScript wrapper around this DB function,
`apps/webapp/src/infra/repos/pgEmailAuth.ts:72`) has exactly **one caller in the whole codebase**:
`startEmailChallenge()` in `apps/webapp/src/modules/auth/emailAuth.ts:277`. Every one of its 12 call sites
(`email-otp/start`, `email-otp/register`, `specialist-signup/start` ×2, `email/start`,
`email-password/forgot` ×2, `email-password/setup-access`, `email-password/register` ×2,
`doctor/patients/[userId]/email-change`, `pgEmailSetupAccessPort.ts`) passes a `userId` that the **server**
already resolved (session, email lookup, invite/registration state, admin identity) — never an
attacker-supplied, email-independent id — and a `codeHash` that is always
`hashEmailChallengeCode(generateEmailCode())`, i.e. a fresh random code the server itself generates and
emails. There is no route, public or authenticated, that accepts a `code_hash` or an unrelated `user_id` as
request input for this function. The same holds for `email_auth_verify_user_email` (see §3) and for the
`purpose`-setter — every call site stamps a value the server chose, never one from the request body.

`app_patient` itself is `NOLOGIN` in every real environment (`deploy-test-saas.sh:2538` region: "nonstaff
login and SET ROLE app_patient" — a single service login authenticates, then switches role). An external
caller cannot open a Postgres session as `app_patient` directly; the only way to execute SQL "as app_patient"
is through the webapp process's own connection pool, which — per the above — never passes these two
parameters through unfiltered. No SQL-injection-shaped construction (string-concatenated query text) was
found in any of the reviewed accessors; every call in `pgEmailAuth.ts` uses parameterized queries.

**Net: this is a real, confirmed latent primitive with zero defense inside the database layer itself (no
ownership/RLS/principal check in the function bodies), but it is gated entirely on already having raw SQL
execution as `app_patient` — a capability nothing in today's HTTP surface hands to an anonymous caller.** It
is not, by itself, a working remote auth bypass. It would become one instantly if combined with a *separate*
bug that grants that execution capability (a SQL injection elsewhere reusing the same connection, leaked
`nonstaff` DB credentials, or an exposed Postgres port) — none of which were searched for or found in this
turn; that combination is out of scope here and is a distinct finding if anyone goes looking for it.

**Why "same threat model as D27-C" doesn't fit:** D27-C's actual bug (`email_auth_enqueue_otp_delivery` /
`email_auth_set_email_challenge_delivery_code`, per `D27C_FIX3_BRIEF_2026-08-04.md`) *was* reachable from a
genuine anonymous HTTP session, because `challenge_id` is legitimately returned to any caller in
`/api/auth/email-otp/start`'s own JSON response (`route.ts:123` — `challengeId` field) — turning "know a
challenge_id" into nothing more than "make your own ordinary request, then reuse the id it gave you against
someone else's." That is a real IDOR reachable with zero extra capability. This claim's chain requires
`user_id`/`code_hash` values that are never returned to, or accepted from, any client at all — the "same
threat model" framing conflates a demonstrated HTTP-reachable IDOR with an undemonstrated raw-SQL-execution
precondition.

## 3. Same lens applied to the rest of the `app.email_auth_*` / `app.email_otp_public_*` family

All grants to `app_patient` (full list pulled from the migrations + overlay, not guessed):

| Function | What it hands a caller who already has raw `app_patient` SQL execution | HTTP-reachable with attacker-controlled key argument? |
|---|---|---|
| `email_auth_insert_email_challenge(uuid,text,text,bigint)` | Mint a challenge for **anyone**, self-chosen hash | No (see §2) |
| `email_otp_public_consume_latest_challenge(text,text)` | Consume the latest challenge for **any email** — this is also the one legitimate public route calls, with a real code hash it computed itself | Yes, but only with the hash of a code the *server* generated and mailed — not attacker-chosen through this route |
| `email_auth_set_email_challenge_purpose(uuid,text)` | Stamp **any** challenge id with any of the 9 known purposes, no ownership check | No |
| `email_auth_delete_email_challenge_by_id(uuid)` | Delete **any single** challenge by id, no ownership check → anonymous DoS on one pending login/reset/invite if the id is known | No route exposes a "delete by id" call; an attacker *can* legitimately learn a fresh id by submitting the *victim's own* email to `/api/auth/email-otp/start` (that route returns `challengeId` to whoever asked), but nothing forwards that id into this delete function |
| `email_auth_delete_email_challenges_for_user(uuid)` | Delete **every** pending challenge for **any** `user_id` at once — wider-blast-radius DoS (kills password-reset/signup/invite in flight) than the by-id variant | No |
| `email_auth_verify_user_email(uuid,text)` | **Confirmed live, one call, no code at all:** set any user's email to any string and mark it verified — see reproduction below. Strictly stronger than the two-step chain in §1 | No (only ever called after the code has already been verified through the normal flow, with matching values) |
| `email_auth_find_email_owner_conflict` / `_find_email_send_cooldown` / `_find_email_otp_lock` | Read-only leaks: cooldown/lockout timing and email-conflict existence for **any** `user_id` | No (each caller's own id only) |
| `email_auth_register_email_otp_lockout(uuid)` / `_reset_email_otp_lockout(uuid)` | Force-escalate or clear **any** user's OTP lockout counter | No |
| `email_auth_find_email_challenge_for_confirm/_for_consume`, `_find_latest_email_challenge_for_user`, `_find_latest_pending_…` | All take `(challenge_id, user_id)` or `user_id` as an explicit pair the *function itself* filters `WHERE … AND user_id = p_user_id` — scoped correctly even under direct execution | N/A, already ownership-checked in the function body |
| `email_otp_public_find_user_by_email` / `_find_or_create_user` / `_register_patient` | Deliberately anonymous-safe: designed exactly for public lookup/registration, no bypass by themselves | Yes, by design |
| `email_otp_public_delete_unverified_registration(uuid)` | Delete **any** pending unverified registration row by id | Called only with the server's own just-created id |
| `email_otp_public_find_email_send_cooldown_by_email` / `_find_latest_email_challenge_by_email` | Read-only, by email — used by the legitimate anonymous flow itself | Yes, by design (anti-enumeration cooldown check) |

**One-call proof for `email_auth_verify_user_email`** (no challenge, no code, nothing else involved):

```sql
-- as app_patient, no principal set
SELECT app.email_auth_verify_user_email(
  '22222222-2222-2222-2222-222222222222'::uuid,   -- victim
  'attacker-controlled@evil.invalid'
);
```
```
 id                                   | email                             | email_verified_at
--------------------------------------+-----------------------------------+------------------------------
 22222222-2222-2222-2222-222222222222 | attacker-controlled@evil.invalid   | 2026-08-04 11:58:28.967431+03
```
This is the single most severe function in the family under this threat model — it doesn't even need the
two-step insert/consume dance the oracle report described. It shares the exact same root cause and the exact
same reachability gate as everything above: no ownership check in the function body, no HTTP route that
forwards these particular arguments unfiltered.

**Common root cause across the whole family:** every `SECURITY DEFINER` accessor here trusts whichever ids
the *caller* passes; nothing in the database layer itself binds a challenge, a user id, or an email to the
session that's supposed to own it (no RLS on `email_challenges`/`platform_users` for `app_patient`'s
purposes, no signed-principal check inside the function bodies — contrast with the patient-invite family,
which `PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md:169-171` documents as deliberately requiring a
purpose/action-bound HMAC before these DB calls even run). The only thing preventing exploitation today is
that the TypeScript call sites happen to always supply consistent, server-derived values — a property of the
application code, not of the database contract, and therefore not something a future route change is
guaranteed to preserve.

## Answer to each "готово" requirement

- **Bypass reproduced to a session-equivalent result:** yes, at the DB layer, traced to the exact
  unconditional `setSessionFromUser` call the real route would take. **Not reproduced through the live HTTP
  surface** — no route forwards the required attacker-controlled arguments. Named cause: role `app_patient`
  is `NOLOGIN` outside the webapp's own connection, and every TypeScript call site computes `user_id`/
  `code_hash` server-side.
- **Per-function verdict:** table in §3 above.
- **External reachability:** no — confirmed structural, not incidental (NOLOGIN role + no matching route),
  but enforced entirely by application code and role plumbing, not by the database contract itself. A
  future route or a SQL-injection elsewhere reusing the same connection would need zero DB-side change to
  turn this into a live remote bypass.
