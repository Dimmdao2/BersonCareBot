# Independent audit — D25 token-bound bot identity (#984)

**Verdict: `FAIL, NOT FOR LAND`.**

Candidate: `bbd367fdc` (`fix(integrator): D25 — channel identity root becomes lookup-only`) on
`wt/d25-token-bound-bot-20260823`, audited at `8c76cab22`.
Brief: `docs/_TODO/runs/briefs/D25_TOKEN_BOUND_BOT_IDENTITY_AUDIT_BRIEF_2026-08-23.md`.
Role: independent `auditor-live` (Opus 5), not the implementation author.

One blocker. It is **not** in the behavior the candidate set out to fix — that part is correct and
proven live. The blocker is that **the migration carrying the fix cannot be applied**: its statement
marker block is missing `-- BCB-MIGRATION-SCHEMA-CREATE: app`, so the runner never grants the seam
owner `CREATE` on schema `app` and the statement dies with `permission denied for schema app`. The
worker declared the owner-aware DEV preflight as NOT DONE; this audit ran it and it is red.

---

## Kill-set (built from authority before reading candidate tests)

Authority: `docs/OWNER_DECISIONS.md` §«Роль бота после появления приложения» (23.08.2026), D25/D15b-2
in `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, `AGENTS.md` §1 / §1b / §5 / §10a /
§10b / §24.4–24.7.

| # | Class | §24.4 | Result |
| --- | --- | --- | --- |
| K1 | Generic unknown Telegram id creates a canonical person/identity/binding/preference | behavior | **dead** — live proof, arm B |
| K2 | Same for MAX | behavior | **dead** — live proof, arm B |
| K3 | The create returns via a renamed mutation, second root, wrapper, fallback, long-polling route, dedicated webhook or second store | look | **closed** — see Q2 |
| K4 | A known existing binding stops resolving / normal bot pipeline regresses | behavior | **no regression** — live proof, arm B |
| K5 | Telegram spoofed `contact.user_id` accepted as a trusted phone | behavior | **held** — new test + injection |
| K6 | MAX missing/invalid HMAC or missing bot token accepted | behavior | **held** — existing test |
| K7 | Proven phone that is not the token-bound attempt's phone accepted | behavior | **held** — new test + injection |
| K8 | Expired / consumed token, replay, profile-bind semantics | behavior | **held** — new test |
| K9 | Account creation reachable outside webapp-owned completion | look + behavior | **closed for creation**, see finding 2 for phone trust |
| K10 | Migration order / owner / grants / generated artifacts / callers inexact; broad relation right; second common pass | look | **BLOCKER — finding 1** |
| K11 | Therapysto initiative touched, bot roles broadened | look | **clean** |

---

## Findings

### 🔴 Blocker 1 — the candidate migration is not appliable by its own declared owner

**Where:** `apps/webapp/db/drizzle-migrations/20260823T093000_channel_identity_root_becomes_lookup_only.sql:1-2`

**What:** the marker block is

```
-- BCB-MIGRATION-OWNER: app_seam_identity_lookup_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
```

and nothing else. `deploy/postgres/privileges/migrate-local.mjs:436-439,463-465` builds the temporary
`GRANT CREATE ON SCHEMA … TO <owner>` **only** from statements that carry
`-- BCB-MIGRATION-SCHEMA-CREATE: <schema>`. A seam owner holds `USAGE` on schema `app` and nothing
more (`nspacl` on DEV: `app_seam_identity_lookup_owner=U/app_object_owner`; the generated artifact
grants seam owners `USAGE ON SCHEMA "app"` and never `CREATE`). PostgreSQL requires `CREATE` on the
schema for `CREATE OR REPLACE FUNCTION`, including a replace of a function you already own.

**Reachable impact:** the first `migrate-dev.sh --execute` / `deploy-test.sh` that reaches this tag
aborts the whole migration transaction with `ERROR: permission denied for schema app`. On TEST that
is not a soft failure — a failed `deploy-test.sh` leaves the environment mid-deploy and the writers do
not come back up on their own. On PROD it blocks the deploy outright. The D25 fix therefore never
reaches any database.

**Live evidence (named DEV `bcb_webapp_dev`, rollback-only, owner-aware — this is the §1 preflight the
worker declared NOT DONE):**

```
RUN_D25_GENERIC_INGRESS_DB=1 node --test \
  deploy/postgres/privileges/d25-generic-ingress-creates-nothing.devDbProof.test.mjs
# arm C:
#   session_user=bcb_dev_migrator  current_user=app_seam_identity_lookup_owner  is_superuser=false
#   ERROR:  permission denied for schema app
# not ok 2 - D25 named-DEV preflight: the candidate migration applies as its declared statement owner
```

**Counterfactual, same probe with only the missing marker's grant supplied** — proves the marker is
the sole cause and that the migration is otherwise exact:

```
oid_before=2206065        oid_after=2206065          # CREATE OR REPLACE keeps the OID
owner_after=app_seam_identity_lookup_owner
secdef_after=true
proconfig_after=search_path=pg_catalog, app, public, pg_temp
verify_no_insert=true     verify_marker=true         # both BCB-MIGRATION-VERIFY predicates hold
membership_leaked=false
```

**Why no offline gate caught it:** `scripts/check-migration-privileges.mjs` has no notion of
`SCHEMA-CREATE` (`grep -n "SCHEMA-CREATE\|CREATE ON SCHEMA" scripts/check-migration-privileges.mjs`
→ empty), and `migration-order.test.mjs` only checks naming/order. This class is *only* catchable by
the owner-aware preflight, which is exactly why `AGENTS.md` §1 makes it mandatory **before audit and
landing** and states «Голый SQL от `postgres` не является preflight».

**Corroboration from the repo's own convention** — every other migration in the active folder that
does `CREATE OR REPLACE FUNCTION app.*` declares the marker; the candidate is the only one that does
not:

```
20260822T010000_the_phone_bind_root_names_the_colliding_account.sql       SCHEMA-CREATE:1
20260822T100000_pre_session_email_and_signup_roots_accept_their_named_context.sql SCHEMA-CREATE:10
… 22 more files, all ≥1 …
20260823T030000_integrator_tenant_role_reaches_delivery_roots.sql         SCHEMA-CREATE:3
20260823T093000_channel_identity_root_becomes_lookup_only.sql             SCHEMA-CREATE:0
```

**Fix (worker, not auditor):** add `-- BCB-MIGRATION-SCHEMA-CREATE: app` as the second marker line,
between `BCB-MIGRATION-OWNER` and `BCB-MIGRATION-LANGUAGE-USAGE` (that order is what
`parseOwnerStatements` reads), then re-run the committed arm C until green. No other change to the
migration is needed — everything else about it is verified exact above.

### 🟡 Finding 2 — D25 is not closed by this landing: the integrator still trusts a phone and can still decide a merge from a generic contact

Not a defect of this diff and not a regression; it is the honest answer to audit question 5, and it
means the D25 checkbox must **not** be ticked when the blocker above is fixed and the branch lands.

Owner text is explicit: «Произвольный `/start`, сообщение, callback **или contact** без действующей
token-bound попытки не создаёт `platform_users`, **не доверяет телефону и не решает слияние**.» The
D25 readiness line in `WORK_ORDER.md` repeats it: «интегратор не создаёт аккаунт **и не решает
merge**».

Reachable path, entirely inside the integrator, with no webapp attempt anywhere in it:

1. `apps/integrator/src/kernel/orchestrator/resolver.ts:288-345` — an unlinked user pressing
   `booking.open` / `menu.more` / `cabinet.open` makes the **bot itself** send a `requestPhone: true`
   keyboard.
2. The user shares their own contact. `mapBodyToIncoming` proves ownership and sets `incoming.phone`.
3. `content/telegram/user/scripts.json` → `telegram.contact.link.confirm` (match: `input.phonePresent`),
   `content/max/user/scripts.json` → `max.contact.phone.link` — both run `user.phone.link` with no
   token check of any kind.
4. `writePort.ts:265-390` → `app.integrator_bind_bootstrap_channel_phone`.
5. That root writes canonical phone trust —
   `INSERT INTO public.user_contacts (…, is_primary=true, confirmed_at=now(), source_origin='direct')`
   plus `public.user_phone_history` — and, when the bound person is a blank row, **executes a merge**:
   `UPDATE public.platform_users SET merged_into_id = v_target_user_id`
   (`20260822T010000_the_phone_bind_root_names_the_colliding_account.sql:159-225,265-278`).

Measured surface on named DEV, read-only:

- phone-trust surface — **142** live channel bindings, every one of which can reach step 5;
- merge surface — **0** blank-person bindings today, because the create branch this candidate removes
  was what manufactured them. The merge branch is therefore latent, not currently firing on DEV data;
  legacy rows on TEST/PROD have not been measured from here.

What the candidate *does* buy structurally: with the identity root lookup-only, a genuinely unknown
messenger id has no binding, so the phone-bind root returns `no_channel_binding` and the person is
told «Сначала откройте приложение из этого бота (кнопка меню), затем снова поделитесь контактом.»
(`shared/phoneLinkUserMessages.ts:10-15`). New users are correctly pushed into the webapp flow rather
than dead-ended. The residue is only for identities that already have a binding.

Per §24.6 this is a gate observation against the owner plan, not new scope invented by the audit: it
belongs on the D25 checkbox as remaining work, and the sequencing is the lead's call.

### 🔵 Recommendations (not findings, no work implied)

1. `writePort.ts:294-301` comments claim the phone-bind root «reports a conflict without deciding or
   executing an account merge (D26)». The root does execute a merge in the `v_source_is_empty` branch.
   Pre-existing, doc-only, but the comment will mislead the next reader of finding 2.
2. The offline gate blind spot from blocker 1 is mechanically closable: `check-migration-privileges.mjs`
   could refuse a statement that creates/replaces an object in a schema the declared owner has no
   `CREATE` on without a `SCHEMA-CREATE` marker. That would catch this class before any DB.

---

## Audit questions, answered

**Q1 — does every user-originated generic Telegram/MAX ingress avoid canonical person/contact/channel
creation, including actor pre-resolution and the signed request-contact helper?**
For **creation**: yes, proven live (arm B below). `createIncomingEventPipeline` →
`ensureResolvedActor` → `ActorResolutionPort.ensureActor` still fires on every user-originated
message/callback, but its one write (`user.upsert`) now reaches a root that creates nothing.
`dispatchRequestContactToUser` passes `writePort` only in the Telegram channel-link branch and that
same lookup-only root is all it can reach. VK ingress returns before the root
(`writePort.ts:226`). For **canonical contact**: no — see finding 2.

**Q2 — can the removed behavior return through a renamed mutation, DB root, wrapper, fallback,
long-polling route, dedicated webhook or second store?**
No. Enumerated mechanically rather than by eye: every `app.*` function with an `INSERT` surface on
`platform_users` / `user_identity` / `user_channel_bindings` / `user_channel_preferences` /
`user_contacts` that also has `EXECUTE` granted to an integrator role, cross-joined from the generated
artifact, leaves exactly two functions —
`app.integrator_bind_bootstrap_channel_phone` (refuses with `no_channel_binding` when no binding
exists, so it cannot create a person) and `app.integrator_set_user_channel_bot_blocked` (bot-blocked
marker only). `app.integrator_upsert_channel_identity` no longer appears in that set at all.
`upsertBootstrapChannelIdentity` has exactly one product caller (`writePort.ts:257`). Long polling
(`telegram/longPolling.ts:110`) and the branded dedicated webhook
(`telegram/webhook.ts:481-519`, `max/webhook.ts:387`) both funnel through the same
`processTelegramUpdate` / `fromMax` → one pipeline. No second store.

**Q3 — do known existing messenger bindings still resolve and use the normal pipeline without a new
account?**
Yes, proven live against a real DEV binding: resolves to the same `platform_users.id`,
`account_created=false`, display-handle refresh still applies, table counts unchanged.

**Q4 — does token-bound login/profile-bind still preserve both proofs?**
Yes, and both are now pinned by tests that did not exist before.
*Provider-owned contact:* Telegram `contact.user_id === message.from.id`
(`telegram/webhook.ts:218-221`) had **no test at all** — added
`apps/integrator/src/integrations/telegram/telegramContactProviderProof.unit.test.ts` (5 cases:
self-owned trusted, forwarded card rejected, `user_id` absent rejected, rejection is not an error
path, plain message carries no phone). MAX HMAC over `vcf_info` with the configured bot token
(`max/mapIn.ts:108-190`) was already covered by `maxContactProviderProof.unit.test.ts` (4 cases:
valid hash trusted; missing hash, mismatched hash and unconfigured token all rejected).
*Phone match to the attempt:* `phoneMessengerBind.ts:200-260` checks `used_token`, `expired`
(+ `updateExpired`), `channel_mismatch`, `phone_mismatch` (+ `updateFailed`), and replays an
`otp_ready` attempt. None of the five was pinned — added
`apps/webapp/src/modules/auth/phoneMessengerBindTokenProofs.unit.test.ts` (9 cases), each of which
also asserts `applyMessengerContactPreOtp` — the only canonical create/bind door on that path — was
never reached, so a guard that refused *after* writing would still be caught.

**Q5 — is account creation reachable only inside webapp-owned completion after proof; does the
integrator remain unable to decide merge or mark arbitrary phone trust?**
Creation: yes. `applyMessengerContactPreOtp` → `app.pre_session_messenger_channel_resolve` is
webapp-owned and self-sufficient — it holds the `INSERT` surface on `platform_users`,
`user_channel_bindings`, `user_contacts`, `user_identity`, `user_phone_history` and
`user_channel_preferences`, so removing the integrator's create branch does **not** strand
registration. This was the main regression risk and it does not materialise.
Merge / arbitrary phone trust: **no** — finding 2.

**Q6 — migration order, owner, grants, generated artifacts, callers.**
Order, owner, artifacts, grants and callers are exact; the marker block is not (blocker 1). Details:
timestamp `20260823T093000` is the newest in the folder and pending on DEV; `migration-order.test.mjs`
24/24; `check-migration-privileges` OK (59 files); `check-c4-migration-owned-function-bodies` OK;
`check-no-new-raw-sql` OK (production debt 0); `generate-cli.mjs --all --check` byte-identical for all
four artifacts. The generated privilege diff contains **only grant removals** — three `GRANT INSERT`
and one redundant `GRANT SELECT` on `platform_users` / `user_channel_bindings` / `user_identity` — and
no new table-level or broad relation right; `user_channel_preferences` grants for that owner survive
because other functions of the same owner still declare them, which is the generator working
correctly. Body-surface row count moves 1010 → 1008 consistently in both artifacts. The migration is a
single `CREATE OR REPLACE`; no second common pass. The only caller,
`upsertBootstrapChannelIdentity`, changed to `Promise<… | null>` and both packages typecheck clean.

**Q7 — Therapysto initiative or broadened bot roles?**
Clean. `git diff --name-only bbd367fdc^ bbd367fdc` touches 12 files, none under
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/`, and no branch commit touches a `therapysto-*`
path. No role, capability, `EXECUTE` grant or port-context catalog entry is widened anywhere in the
diff; the only capability motion is narrowing.

---

## Independent evidence

Fault injection was run once per independent class (§24.5), on classes — not on individual `it`s.

**Class 1 — generic unknown messenger id creates a canonical person.** `deploy/postgres/privileges/d25-generic-ingress-creates-nothing.devDbProof.test.mjs`,
named DEV `bcb_webapp_dev`, three arms, all inside `BEGIN … ROLLBACK`. Counts are
`platform_users/user_identity/user_channel_bindings/user_channel_preferences`.

- **Arm A (injection):** the pre-candidate creating body, taken from the product file of record
  `deploy/postgres/generated/prod-to-target/schema-pre.sql`, replayed in-transaction and probed with
  one unknown Telegram id → `rows_returned=1`, `account_created=true`, `binding_rows=1`, counts
  `304/294/142/122 → 305/295/143/123`. The instrument has teeth: arm B's own predicates
  (`rows=0`, counts unchanged) are exactly what arm A violates.
- **Arm B (acceptance):** candidate migration materialised in-transaction → unknown Telegram id
  `rows=0`, unknown MAX id `rows=0`, `binding_rows=0`, counts `304/294/142/122 → 304/294/142/122`;
  body carries no `INSERT INTO public.platform_users`, carries the lookup-miss contract, and no longer
  mentions `public.user_identity` or `public.user_channel_preferences` at all; known binding resolves
  to the same person with `account_created=false` and its display handle refreshes to `d25AuditHandle`,
  counts still `304/294/142/122`.
- **Arm C (owner-aware preflight):** red — blocker 1.

**Class 2 — Telegram sender-owned contact check.** Loosened `contact.user_id === fromId` to
`contact.user_id !== undefined` in `telegram/webhook.ts` → the forwarded-card case turned red
(`expected '+79180000011' to be undefined`); product file restored with `git checkout --` and the
suite is green again.

**Class 3 — token-bound phone match.** Deleted the
`contactPhone !== row.phone_normalized` guard in `phoneMessengerBind.ts` → 2 of 9 cases turned red
(the mismatch case and the replay-with-different-phone case both returned `ok: true`); product file
restored with `git checkout --` and the suite is green again.

Test and gate runs (each command's own exit code, not a piped one):

| Command | Result |
| --- | --- |
| `pnpm --dir apps/integrator test` (whole package, incl. the new Telegram proof) | 113 files, 576 tests, `exit 0` |
| `npx vitest --run` on 4 webapp bind files (incl. the new token-proof file) | 4 files, 24 tests, `exit 0` |
| `RUN_D25_GENERIC_INGRESS_DB=1 node --test …devDbProof.test.mjs` | arms A+B `ok`, arm C `not ok` |
| `node --test deploy/postgres/privileges/migration-order.test.mjs` | 24/24 |
| `node deploy/postgres/privileges/generate-cli.mjs --all --check` | 4/4 byte-identical, `exit 0` |
| `node scripts/check-c4-migration-owned-function-bodies.mjs` | OK |
| `node scripts/check-no-new-raw-sql.mjs` | OK, production debt 0 |
| `node scripts/check-migration-privileges.mjs` | OK, 59 files |
| `npx tsc --noEmit` in `apps/integrator` and `apps/webapp` | `TSC_EXIT=0` both |
| `npx eslint` on the three files this audit added | `exit 0` |
| `git diff --check` | `exit 0` |

DEV left untouched — verified after every arm:
`304/294/142/122`, `0` rows matching `d25audit-%`, `0` leftover port-context capability rows, `0`
leaked `bcb_dev_migrator → app_seam_identity_lookup_owner` membership, and the installed function body
still the original creating one (this branch must not apply the migration).

---

## Handoff

Blocker 1 is a one-line marker fix for the worker plus a re-run of arm C; per §24.6 the auditor does
not make the product fix. Arm C is committed red on purpose — it is the failing acceptance test that
defines "done" for the next round, and it goes green by itself once the marker is present, because it
derives the runner's grants from the migration's own markers through the runner's own parser.

Finding 2 needs no code from this round: it is a D25 checkbox statement. Do not tick D25 on this
landing.

## Not done (explicit)

- **No product fix.** The migration marker was not edited by this audit; the three product files
  touched by fault injection were restored with `git checkout --` and re-verified green.
- **No full CI** (brief forbids it), no push, no deploy, no TEST or PROD access, no real bot token
  read or printed, no real outbound delivery, no taskdb edit, no Therapysto file touched.
- **No end-to-end HTTP token-bound flow.** It needs persistent fixtures and a live bot; the completion
  behavior was proven through the real module seam instead (`completePhoneMessengerBindFromIntegrator`
  with the real port contract) plus the DB-surface check that
  `app.pre_session_messenger_channel_resolve` owns the creation. The exact post-deploy TEST gate that
  must still run: owner login through `POST /api/auth/phone/messenger-bind/start` → `auth_<token>` →
  self-owned contact in the bot → code delivered → code entered in the webapp, plus the negative case
  «generic `/start` from an unbound messenger id → no `platform_users` row», per the D25 line in
  `WORK_ORDER.md`.
- **Merge-branch surface on TEST/PROD not measured.** Finding 2's blank-person count (`0`) is DEV only;
  this audit has no TEST/PROD access by brief.
- **`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` not edited** — the D25 checkbox is the
  lead's to move.
