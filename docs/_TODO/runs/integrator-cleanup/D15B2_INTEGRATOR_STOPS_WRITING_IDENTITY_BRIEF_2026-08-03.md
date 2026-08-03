# D15b/2 — the integrator stops owning identity writes

Rules: `AGENTS.md` — Маршрут, CORE rules, «Как решать, что делать», §5 (DB only through the app's own port, raw SQL
forbidden for new code), §10/§10a/§10b, §24. Language: internal work is English.

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — **D15b/2** (owner-approved scope);
`runs/integrator-cleanup/IDENTITY_AND_MERGE_SCHEME.md` **§2b**; census
`runs/integrator-cleanup/D15B1_IDENTITY_CENSUS_2026-08-03.md` §4 — **read that section first, it replaces the file
list the plan used to carry.**

Источник оракула: `IDENTITY_AND_MERGE_SCHEME.md` §2b — «интегратор только отправляет и получает сообщения
(отправляет коды и запросы предоставления контакта, принимает доверенные контакты от каналов и OAuth)… а
авторизацию и сборку сущности платформенного юзера… делает порт идентификации».

## What the census actually found — do not re-derive it

Not «11 files». **Three real write sites**, and only one of them belongs to the integrator alone:

1. **`apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts`** — the integrator's own
   bespoke SQL. `insertPlatformUser` / `enrichPlatformUser` write `integrator_user_id, phone_normalized,
   display_name, first_name, last_name, patient_phone_trust_at`. Trigger: mutation `user.upsert`
   (`writePort.ts:322`) — on **every** incoming Telegram/MAX message, new person or not. The webapp already holds
   the literal equivalent: `apps/webapp/src/infra/repos/pgUserProjection.ts` (INSERT:254, UPDATE:276), and the
   file's own header says so. **This is the one that must go.**
2. `packages/platform-merge/src/pgPlatformUserMerge.ts` and 3. `…/messengerPhonePublicBind.ts` — a **shared
   package both apps already call**, not integrator-owned duplication. One implementation, two callers. Do not
   delete or fork these; decide their place deliberately (below).

Also found: `writeNotificationTopicsDirect` in the same file is **dead** — `writePort.ts` has no such `case` any
more. And `apps/integrator/src/infra/scripts/check-d30-outgoing-delivery-claim-concurrency.ts` raw-INSERTs
synthetic `platform_users` rows; it is a CLI/deploy-gate harness, not a runtime path — say in your report whether
you left it, and why.

Two files the old plan named — `channelUsers.ts` and `mergeIntegratorUsers.ts` — **do not write `platform_users`
at all**. Do not touch them.

## Work

1. **Kill the integrator's bespoke identity write.** `user.upsert` must stop running the integrator's own
   INSERT/UPDATE against `platform_users`. The canonical write is the one the webapp already owns; route the
   mutation to it. ⛔ Do **not** resurrect the HTTP projection seam that `#987` removed — the direction is direct
   transactional writes through **one owned implementation**, not a second network hop.
2. **Decide the shared package's place, in writing.** Under §2b the identity port is the single owner of identity
   assembly. State plainly whether `packages/platform-merge` *is* that port's implementation (both apps calling one
   owner — acceptable, and then say what makes it the owner) or whether it must move behind the webapp's port. Give
   the reason from the code, not from taste. This is the sentence D15b/3 will build on.
3. **Delete the dead `writeNotificationTopicsDirect`** and the stale reference to it in
   `D15A_IDENTITY_RESEARCH.md` (a false record is worse than an open gap).
4. Keep behavior identical for a real person: an incoming message from a brand-new channel user must still create
   the person and bind the channel; an existing one must still be enriched.

## Live proof — two webhooks, not one

The census corrected this too: the **first** webhook creates the person and binds the channel; the **merge decision
and phone trust happen only on the second** (the reply to the contact request). Your live check on DEV must run
**both**, in order, for Telegram and for MAX, and show the resulting rows. A green single-webhook check proves half
the behavior and is not accepted.

## Boundaries

- **PROD (`135.106.162.170`) is untouchable.** DEV only; TEST deploy is the lead's step after land.
- No schema change unless the move genuinely requires one — and then reserve the migration number on the board
  before creating the file.
- No push, no merge into `feat`.

## Done means

- The integrator no longer writes `platform_users` on `user.upsert`; the census's file list is the checklist.
- Behavioral tests cover both webhooks for both channels, plus the enrich path for an existing person.
- Integrator + webapp typecheck, scoped ESLint, `git diff --check` clean; the touched test files pass.
- The report states: what now performs the write, where the shared package stands, and the exact live evidence
  from the two-webhook run.
