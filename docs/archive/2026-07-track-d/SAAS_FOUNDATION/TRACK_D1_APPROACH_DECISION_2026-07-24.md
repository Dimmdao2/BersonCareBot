# Track D1 — approach decision + execution checklist (2026-07-24)

> Orchestrator decision resolving the two competing D1 implementations (owner request 2026-07-24).
> Authority: `WORK_ORDER.md` §Track D (D1 spec + checkbox), owner ruling 2026-07-23 (taskdb #987),
> `DATABASE_UNIFIED_POSTGRES.md`. Back-links: reconcile analysis `scratchpad/reconcile-987-d1.md`;
> superseded evidence doc `TRACK_D1_IDENTITY_PREFERENCES_EVIDENCE.md` (branch B).

**Привязка после сверки 29.07:** `#987` — самостоятельный Track D workstream, не хвост и не дочерняя карточка
Rubitime `#981`. Единственный master checklist находится в
[`../UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`](../UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md)
§Track D (8 живых D3–D10); этот файл — subordinate approach decision для D1 (7 живых A-checks) и не второй
workstream plan.

## Target result (what D1 must achieve) — from WORK_ORDER §Track D

> **D1 — identity and notification preferences.** ONE integrator transaction writes channel anchors
> (integrator-only channel identity, **retained**) PLUS canonical `public.platform_users` /
> `user_channel_bindings` / `user_notification_topics` **directly**, replacing the `user.upserted` /
> `preferences.updated` HTTP projection fanout. Retain integrator-only channel identity/messenger state
> that are NOT duplicate business projections. (Projection **transport** teardown = D10, not here — old
> handlers stay drain-only until then.)

## The two implementations found

- **(A) feat scaffold** `apps/integrator/src/infra/db/directPublic/writeIdentityAndPreferencesDirect.ts`
  (`c6e2d2bb`, 608 lines, NOT wired): pure TypeScript infra/db repo on an injected `DbPort`; writes run on
  the tx-bound connection (integrator `SET ROLE app_staff`); optional `mergeCandidateIds` hook; explicitly
  chokepoint-compliant. Left unwired pending live-DB confirmation of grants/columns/merge.
- **(B) Codex branch** `codex/direct-public-d1-987` (`46ec76ff4`, wired+tested): business logic in a
  Postgres `SECURITY DEFINER` function `app.upsert_messenger_public_identity` (RLS-bypass) + thin TS
  wrapper + new migration granting integrator DML; fail-closed on ambiguity (no merge).

## DECISION: adopt (A). Retire (B).

Evidence gathered live on TEST `bersoncarebot_test`:

1. **RLS is OFF** (`relrowsecurity/relforcerowsecurity = false/false`) on all D1 targets
   (`platform_users`, `user_channel_bindings`, `user_notification_topics`, `user_channel_preferences`).
   → (B)'s entire justification (crossing an RLS boundary via SECURITY DEFINER) **does not apply** — there
   is no RLS here to bypass. (B) adds a definer function + grants to solve a non-problem.
2. **The integrator already has full DML** on all four tables: runtime role `bcb_test_integrator_login`
   `SET ROLE app_staff` (confirmed `apps/integrator/src/infra/db/withClient.test.ts`), and `app_staff` holds
   `INSERT,UPDATE,DELETE,SELECT` on each. → (A) needs **zero new grants and zero new migration**.
3. **(A) stays inside the declared chokepoint architecture** (infra/db repo on injected DbPort — the guard
   `scripts/check-db-chokepoint.mjs` expects raw SQL there). **(B)'s SQL function is invisible to the
   chokepoint guard** (guard scans TS only) — a permanently ungated security surface.
4. **(A) keeps business logic in TypeScript** → testable/maintainable and it **scales to D2–D10** (far more
   complex domains: diary/LFK ownership, support, reminders). A definer-function-per-domain (B pattern)
   would proliferate ungated RLS-bypass surfaces and put growing business logic in plpgsql.
5. **(A) preserves RLS as the single enforcement layer** for future identity-table hardening; **(A) carries
   a merge-candidate hook** (identity consolidation) where (B) is fail-closed-only.

(B) is finished/tested but reaches "finished" by taking the RLS-bypass shortcut that avoids D1's real
question (can the integrator write these tables directly? — yes, proven above). Its useful specifics
(writePort rewire shape, candidate-resolution query, advisory-lock-per-integrator idempotency) are
**harvested into (A)** as TypeScript. Branch B kept on origin as reference; not merged.

## D1 execution checklist (approach A) — single source of "done"

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] **A1. Complete the scaffold's channel-anchor hook** — wire `writeChannelAnchor` to existing integrator
      repos inside the tx (telegram: `upsertUser` + `resolveCanonicalIntegratorUserId`; max:
      `ensureIdentityForMessenger` → `identities.user_id`), per the `user.upsert` case in `writePort.ts`.
- [ ] **A2. Wire canonical write** to `public.platform_users` / `user_channel_bindings` /
      `user_notification_topics` via the injected `DbPort`, mirroring the webapp consumer
      `apps/webapp/src/infra/repos/pgUserProjection.ts` for exact columns/semantics parity. Include
      `user_channel_preferences` only if the current projection consumer writes it (confirm parity; do not
      add scope beyond the projection it replaces).
- [ ] **A3. Ambiguity handling** — wire `mergeCandidateIds` to `mergePlatformUsersInTransaction`
      (`@bersoncare/platform-merge`) to match the webapp consumer's `mergeCandidates` behavior; keep the
      reject-ambiguity default only if the current consumer also rejects (parity, not a new policy).
      Adopt (B)'s `pg_advisory_xact_lock` per `integrator_user_id` for concurrent-webhook idempotency.
- [ ] **A4. Wire into `writePort.ts`** `user.upsert` + `notifications.update` cases inside `db.tx`,
      removing the `user.upserted` / `preferences.updated` projection producers (keep the outbox/worker
      transport drain-only — teardown is D10). Remove now-dead `readPort` plumbing from `createDbWritePort` + its callers (`worker/main.ts`, `di.ts`).
- [~] **A5. Grants precondition — CORRECTED 2026-07-24 (live A7 finding).** Original claim "no grant needed
  (integrator=app_staff has DML)" was WRONG: `bcb_test_integrator_login` is **NOINHERIT**, so app_staff
  membership grants nothing without `SET ROLE`, and the inbound-telegram **bootstrap** principal
  (`telegram-webhook:pre-routing`, `withClient.ts`) does NOT `SET ROLE` → it runs as the bare login role
  which has USAGE on `public` but **zero table grants** → `SELECT public.platform_users` → 42501, breaking
  ALL inbound telegram on TEST _before_ the D1 write is even reached. Root: migration
  `20260413_0002_integrator_grants_public_messenger_canon.sql` grants `TO CURRENT_USER` (owner at migrate
  time, not the login role); its own comment calls for a follow-up grant to the app role that was never
  applied on TEST (prod gets this via table ownership — same topology divergence as TASK_A FB#1-bootstrap).
  **Fix (in progress):** overlay `deploy/postgres/integrator-login-public-identity-grants.sql` granting the
  integrator login role the census'd public.\* privileges, wired into deploy. Branch B's `GRANT TO CURRENT_USER`
  had the SAME latent flaw. This does NOT change the A-vs-B decision (A/TS still correct); it adds the missing
  grant both approaches needed.
- [ ] **A6. Tests** — update `writePort.userUpsert.test.ts` to assert direct writes; keep/extend the scaffold
      unit test; chokepoint guard green; integrator + webapp typecheck + lint green (scoped).
- [ ] **A7. Live-TEST verification** (cloud could not do this): exercise the real telegram + max webhook
      path against TEST; confirm `platform_users`/`user_channel_bindings`/`user_notification_topics` rows
      are created/updated directly in one tx; confirm ZERO new `user.upserted`/`preferences.updated`
      outbox producer rows; confirm idempotent replay; confirm cross-integrator/patient-context is rejected
      at the app layer.
- [ ] **A8. Independent adversarial audit** (Opus, high-risk tenant-write) against the live behavior +
      the WORK_ORDER D1 rows, then tick the WORK_ORDER D1 checkbox with evidence.

## Not in D1 scope (do not pull in)

- Projection transport teardown (fanout/outbox/worker/`/api/integrator/events`) = **D10**.
- D2–D10 domains. But D1's (A) pattern is the template they follow.
