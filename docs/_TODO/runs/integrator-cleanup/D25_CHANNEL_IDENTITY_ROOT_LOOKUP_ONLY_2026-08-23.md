# D25 — `app.integrator_upsert_channel_identity` becomes lookup-only (#984)

Authority: `docs/OWNER_DECISIONS.md` "Роль бота после появления приложения" (owner decision 23.08.2026)
+ D15b/2 / D25 checkboxes in `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`.

## What was broken

`createIncomingEventPipeline` → `ensureResolvedActor` calls `ActorResolutionPort.ensureActor` for
**every** user-originated Telegram/MAX message/callback, unconditionally emitting `writeDb({type:
'user.upsert'})`. `writePort.ts` `user.upsert` called the single exact named root
`app.integrator_upsert_channel_identity` through the one direct-public chokepoint. When the channel
identity was unknown, the SQL body's second branch ran four `INSERT`s — `public.platform_users`
(`display_name=''`), `public.user_identity`, `public.user_channel_bindings`,
`public.user_channel_preferences` — creating a blank canonical person from a bare, unauthenticated
webhook. `dispatchRequestContactToUser` (`integrations/bersoncare/dispatchRequestContact.ts`, called
from `executeAction.ts` `webapp.channelLink.complete` with `writePort` attached) exercised the same
path. The fact that `app.integrator_upsert_channel_identity` is owned by the webapp-side seam
(`app_seam_identity_lookup_owner`) did not change who decided to call it: a generic webhook still made
the create decision, which owner decision 23.08 explicitly forbids ("Произвольный `/start`, сообщение,
callback или contact без действующей token-bound попытки не создаёт `platform_users` … Вызов
webapp-owned DB-функции из generic webhook не меняет владельца действия").

## What changed

**One narrowing, no new wrapper/service/HTTP hop/store.** The SQL body of
`app.integrator_upsert_channel_identity` (migration
`apps/webapp/db/drizzle-migrations/20260823T093000_channel_identity_root_becomes_lookup_only.sql`) had
its create branch deleted entirely — replaced with a bare `RETURN;` (zero rows = "unknown identity,
not an error"). The lookup branch (find an existing binding, optionally refresh
`display_handle` on it) is untouched byte-for-byte. `CREATE OR REPLACE` keeps signature/owner/security
attributes identical, so the function OID and every `regprocedure` reference are unaffected — no
capability/context-declaration change was needed for the door itself.

TS side (`apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts`):
`upsertBootstrapChannelIdentity` now returns `WriteIdentityAndPreferencesResult | null` — `null` when
the root finds nothing, instead of throwing `platform_user_write_failed` (that throw used to be
unreachable for the "unknown identity" case anyway, since the old body always returned exactly one row
either way; now it genuinely means "zero rows", i.e. "not found", not a failure).
`writePort.ts` `user.upsert` already discarded the return value, so no behavior change was needed
there beyond the comment.

**Privilege declaration narrowed to match** (`deploy/postgres/privileges/declaration.ts`,
`app.integrator_upsert_channel_identity(text,text,text)` `relationSurfaces`): removed
`INSERT`/`display_name` from `public.platform_users` (SELECT-only now, columns `id`, `merged_into_id`),
removed `INSERT` from `public.user_channel_bindings` (SELECT + UPDATE only), removed the
`public.user_identity` and `public.user_channel_preferences` surfaces entirely — the body no longer
touches either table at all. Regenerated via `node deploy/postgres/privileges/generate-cli.mjs --all`;
`--check` confirms the artifacts are byte-identical to what the declaration now emits.

## Why this is enough (and why nothing else needed to change)

- `user.phone.link` (→ `app.integrator_bind_bootstrap_channel_phone`) is untouched: it only runs after
  `webapp.channelLink.complete`'s own webapp-owned decision (`executeAction.ts` case
  `webapp.channelLink.complete`, comment: "webapp owns this decision end-to-end"), and per that same
  comment `user.phone.link` was already reduced to a no-op re-sync of an already-canonical phone, never
  a create.
- The token-bound phone-messenger-bind flow (`POST /api/auth/phone/messenger-bind/start` →
  `webapp.phoneMessengerBind.complete` → `completePhoneMessengerBindFromIntegrator` →
  `applyMessengerContactPreOtp`) is a **completely separate** set of SQL roots
  (`app.phone_messenger_bind_completion_state`, `app.auth_phone_bind_upsert_channel_binding`,
  `app.phone_messenger_bind_secret`) — it never called `app.integrator_upsert_channel_identity` and is
  unaffected by this change. Confirmed by `grep`: `upsertBootstrapChannelIdentity` has exactly one
  caller in the whole tree, `writePort.ts` `user.upsert`.
- `dispatchRequestContactToUser`'s conditional `user.upsert` write (from `webapp.channelLink.complete`,
  i.e. already after a webapp-owned channel-link decision) now resolves through the same lookup-only
  root: if that webapp completion already created the binding, this just finds it and optionally
  refreshes the display handle — never a second create path.

## Evidence — what was run and its result

All commands run from the worktree root (`bcb-wt-d25-token-bound-bot-20260823`), no TEST/PROD touched.

- `pnpm --dir apps/integrator test -- <6 targeted files>` → **6 files / 23 tests passed** (existing
  reachability + bootstrap-root tests, plus 3 new files/cases below).
  - `src/infra/adapters/actorResolutionPort.test.ts` (new) — unknown Telegram/MAX actor dispatches
    exactly one `user.upsert` write and resolves without throwing; non-user-originated events write
    nothing.
  - `src/infra/db/directPublic/writeIdentityAndPreferencesDirect.test.ts` (new) —
    `upsertBootstrapChannelIdentity` returns `null` on zero rows, resolves normally on a hit.
  - `src/infra/db/bootstrapChannelIdentityRoot.unit.test.ts` (+1 case) — an unknown/unresolved channel
    identity (root returns zero rows) creates nothing and does not fail `writeDb`.
  - `src/infra/db/writePort.identityRootReachability.audit.test.ts`,
    `src/infra/db/writePort.directProjectionFallback.test.ts`,
    `src/infra/db/userUpsert.identity.test.ts` — unchanged, still green (existing-binding resolution,
    D28 abandoned-number spell-open, reachability-under-principal cases).
- `cd apps/webapp && npx vitest run src/infra/repos/d15b6PhoneMessengerBindMirror.unit.test.ts src/modules/auth/phoneMessengerBindSelfSufficient.unit.test.ts` →
  **2 files / 9 tests passed** — token-bound phone-messenger-bind flow (mismatch/expired/replay/
  profile-bind/"account creation only from webapp completion") unaffected.
- `cd apps/integrator && npx tsc --noEmit` → clean, no output.
- `cd apps/integrator && npx eslint <8 changed files>` → clean, no output.
- `node scripts/check-c4-migration-owned-function-bodies.mjs` → `OK`.
- `node scripts/check-no-new-raw-sql.mjs` → `OK` (counts unchanged from before this branch).
- `node --test deploy/postgres/privileges/migration-order.test.mjs` (run from repo root) →
  **24/24 passed** — new migration filename/timestamp/statement-owner/verify-marker conventions hold.
- `node deploy/postgres/privileges/generate-cli.mjs --all` then `--check` →
  regenerated `deploy/postgres/generated/privileges.{bcb_webapp_dev,bersoncarebot_test}.sql`,
  `--check` reports byte-identical (declaration ⇄ artifact match). `port-context-capabilities.*.sql`
  unchanged (capability descriptor — role/class/purpose/function-identity — was not touched, only
  `relationSurfaces`).
- `node --test deploy/postgres/privileges/*.test.mjs` (repo root) → **280 tests: 162 passed, 118
  skipped (devDbProof fixtures needing a specifically-provisioned live DB not set up in this
  worktree), 0 failed.**
- `git diff --cached --check` → clean, no whitespace errors.

### What was NOT run, and why

`bash deploy/host/migrate-dev.sh --preflight`/`--execute` (the canonical DEV apply route) was **not**
run. The wrapper's `assert_canonical_file` guard hard-requires the exact canonical checkout path
(`/home/dev/dev-projects/BersonCareBot`) and fails fast (`DEV API env path guard failed`) from this
dedicated worktree (`bcb-wt-d25-token-bound-bot-20260823`) by design — it is meant to run once, from
the single canonical checkout, not per-worktree. AGENTS.md §1 references a "bounded candidate-preflight
path" for exactly this candidate-checkout case; no such script currently exists in the repo
(`deploy/host/`, `deploy/postgres/privileges/`) — building one is a separate, larger piece of work, not
bounded to this slice, and was not attempted here to avoid scope creep beyond #984. Everything
verifiable without a live DEV apply (migration static gates, declaration↔artifact `--check`, the full
offline privilege test suite) is green; the live DEV apply/audit-of-privileges-before-landing step is
the one piece of AGENTS.md §1's process this run could not complete from inside the worktree, and is
called out here explicitly rather than silently skipped.

## What was intentionally left out of scope

- `miniapp/tg` / `miniapp/max` (dedicated booking-only mini-app screens) — explicitly deferred by the
  same owner decision, "Отложено до отдельной работы после PROD".
- Therapysto rename/branding initiative
  (`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/`, any `therapysto-*`/`night-*`/`reaudit-*`
  branch) — out of scope per this task's brief, not touched.
- `user.phone.link` / `app.integrator_bind_bootstrap_channel_phone` — reviewed, found already correct
  (post-webapp-decision no-op re-sync), left untouched.
- Trimming `DirectPublicWriteFailureCode.platform_user_write_failed` from the exported union — the
  literal is no longer thrown by `upsertBootstrapChannelIdentity`, but the type is a small shared enum
  used elsewhere in the same module's error contract; removing an unused union member is a pure
  cosmetic cleanup with no functional effect, left as-is to keep the diff minimal.
- Live DEV migration apply (`migrate-dev.sh --preflight`/`--execute`) — see "What was NOT run" above.

## Files changed

- `apps/integrator/src/infra/adapters/actorResolutionPort.ts` — doc-only (via `ports.ts` comment; no
  code change in this file itself).
- `apps/integrator/src/infra/adapters/actorResolutionPort.test.ts` — new.
- `apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts` — lookup-only return
  contract (`WriteIdentityAndPreferencesResult | null`), updated module doc.
- `apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.test.ts` — new.
- `apps/integrator/src/infra/db/writePort.ts` — comment only (behavior unchanged, already discarded the
  return value).
- `apps/integrator/src/infra/db/bootstrapChannelIdentityRoot.unit.test.ts` — new unresolved-actor case.
- `apps/integrator/src/kernel/contracts/ports.ts` — doc comment on `ActorResolutionPort`.
- `apps/integrator/src/integrations/bersoncare/dispatchRequestContact.ts` — comment only.
- `apps/webapp/db/drizzle-migrations/20260823T093000_channel_identity_root_becomes_lookup_only.sql` —
  new migration, narrows `app.integrator_upsert_channel_identity` to lookup-only.
- `deploy/postgres/privileges/declaration.ts` — narrowed `relationSurfaces` for the same function.
- `deploy/postgres/generated/privileges.bcb_webapp_dev.sql`,
  `deploy/postgres/generated/privileges.bersoncarebot_test.sql` — regenerated from the declaration.
