# Night plan 2026-07-26 — every owner instruction from this evening, as a checklist

**This file is the single source of "todo" and "done".** Not the chat, not any audit report. An auditor
finding that has no line here is a QUESTION for the owner, never work (see `docs/ORCHESTRATION_BINDINGS.md`).

**Reconciliation pass 2026-07-27.** Markers were re-counted in this file after the audit corrections:
**36 closed / 20 open / 5 cancelled or superseded** (пересчитано 27.07 после сверки коммитов с планом; прошлая
строка «32 closed / 15 open» устарела — числа считаны `grep`, а не оценены). `[x]` is used only for work that is done; `[-]` records
cancelled or superseded work and is excluded from both totals. Detail and evidence are inline on each item.

## Standing rules the owner restated tonight

- **Не изобретать.** Every design decision must come from established practice with a named source
  (standard, primary documentation, shipped system, published incident). Inventing a mechanism is a defect
  even if it works.
- **Automation over human queues.** «я один админ пока и специалисты тоже не сидят на поддержке 24 часа (то
  есть например решение мержить все записи руками было бы нерационально)». Any option whose safety depends
  on staff reviewing a queue promptly is disqualified unless it degrades safely when nobody looks. This
  retires the "staff merge queue" option for booking identity and keeps OTP-always.
- **Everything that must later happen on PROD gets written down** — `docs/_TODO/PRE_PRODUCTION_TODO.md`.
- **Do not stop after reporting.** Keep work in flight; a message to the owner is not the end of a turn.
- **Loop until clean:** fix → re-run auditors → fix → screenshots on DEV → curl on TEST → repeat until every
  auditor passes AND the live pages prove themselves. One auditor is not enough; use several with different
  angles (correctness / security / try-to-reproduce).
- Answer in Russian, work internally in English. No flattery openers. No trailing offers.

## A. Security — database privilege model

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] **A-1 (C1) Split the definer owner + policies instead of bypass + a gate.** Owner: «думаю надо делать
      все 1+2+3». Corrected facts: 46 anon-reachable definers, of which only **17** are owned by the
      BYPASSRLS `app_owner`; 28 belong to the DB owner (no BYPASSRLS, 162/209 tables are FORCE RLS); 2 with
      dynamic SQL are inert constant literals. All 115 definers already pin `search_path` and none is granted
      to PUBLIC. The existing deploy gate pins only `app_owner`'s count — 29 anon-executable definers owned
      by other roles are pinned by nothing.
      **Researched and DECIDED 2026-07-26 (lead, on a research brief verified live against `bersoncarebot_test`).**
      Facts above re-verified: 115 definers, all pin `search_path`, none granted to PUBLIC, 46 anon-reachable,
      17 owned by `app_owner`, 162 FORCE-RLS tables — all confirmed. **Two corrections:** 17+28 = 45, not 46;
      the 46th is `app.report_saas_isolation_event`, owned by a **third** role `saas_telemetry_owner` (NOLOGIN,
      no BYPASSRLS). And the 28 DB-owner-owned functions touch exactly **7 tables** — of which **6 have RLS not
      enabled at all** (`relrowsecurity=false`), so for those the owner split reduces blast radius but restores
      no row-level protection; that remainder is A-4, and A-1 must not claim credit for it.
      Also verified live: the 2026-07-24 remedy is already in place — `app.provision_specialist_owner` is owned
      by `app_owner` (NOLOGIN, BYPASSRLS, **0 members**, owns exactly the 3 P2-B tables).
      **Decision — Option C, staged; matches the owner's «все 1+2+3»:** 1. **A first, alone (safe default, zero deploy risk):** extend the deploy gate to pin the anon-reachable
      definer count for `bersoncarebot_test` (28) and `saas_telemetry_owner` (1), plus a required-grant
      allowlist for the 7 tables — mirroring the existing 27-row `app_owner` VALUES pattern. Purely additive
      assertion; cannot leave TEST half-configured. 2. **Then the owner split:** a narrow `NOLOGIN NOBYPASSRLS` role owns the 28; grant it exactly the 7
      tables' needed privileges; `system_settings` (the one FORCE-RLS target) gets a **policy**, not bypass.
      Land **WARN-not-FATAL first**, flip to FATAL after clean deploy cycles — the repo's own precedent
      (`assert_specialist_owner_provisioning_seam_pinned` started that way), and the guard against repeating
      the 2026-07-24 mid-deploy outage. 3. **Then make the gate structural, not a count:** every anon-reachable definer's owner must be in a
      reviewed allowlist, and the DB-owner role must own **zero** of them. Pure `pg_catalog` introspection —
      no AST machinery needed. This closes the gap for FUTURE functions, not just today's 29.
      Named sources behind the shape (not invented): PostgreSQL `CREATE FUNCTION` on SECURITY DEFINER owner
      privileges and `search_path`; `ddl-rowsecurity` on BYPASSRLS/FORCE and on documented covert channels;
      Supabase's schema-scoped `supabase_auth_admin`; PostgREST's private `basic_auth` schema + scalar-returning
      definer accessor. Both shipped systems scope the definer owner narrowly and never reuse the table-owning
      or bypass-everything role.
      **STAGE 1 DONE 2026-07-26 (`9b40d74e9`) — the gate is in, and it was proven able to FAIL.**
      A new assertion pins the anon-reachable definer counts for the DB-owner role (28) and
      `saas_telemetry_owner` (1), plus a 17-row required-privilege allowlist for the 7 tables those 28
      functions actually touch (read out of each function body, not guessed). It runs after the units are
      up, so a red gate can never take TEST down. **Proven to fail four independent ways** — revoking a
      table privilege from the owner, revoking EXECUTE from the anon role, adding a spurious
      anon-reachable definer, and revoking the telemetry function — each producing the right FATAL and
      returning to green when undone. A trap was caught during that proof: PostgreSQL grants EXECUTE to
      PUBLIC by default on function creation, which silently masked one violation until the fixture
      revoked it explicitly.
      **Measured numbers differ from the research above — explained, not drift.** Live today: 118 definers
      (was 115), 48 anon-reachable (was 46), `app_owner` owning 19 of them (was 17). The +2 anon-reachable
      are exactly `app.phone_otp_public_booking_issue_challenge` and `..._consume_challenge` from migration
      0245 — the A-3 public-booking OTP seam this branch shipped, which is also why `expected_secdef_count`
      moved 56→58. The two numbers this new gate pins (28 and 1) reproduced **exactly**.
      Stages 2 (owner split behind WARN-then-FATAL) and 3 (structural allowlist instead of a count) remain.
      **Privilege-sweep update 27.07:** group A is closed by `5b9bc3935`: 22 narrow
      `SECURITY DEFINER` accessors cover PIN, channel-link secrets, e-mail setup tokens, OAuth bindings and
      login tokens; the pinned secdef count moved 83→105. Group C is closed by `e212a50c7`: staff `SELECT`
      on all three playback-analytics tables is restored. Group B (the patient's delivery telemetry) has the
      owner's decision in `OWNER_PRODUCT_RULES.md` §18 — revoke the grant — but that revocation is **not
      implemented**. Group D is only partly done. These closures do not complete A-1 stages 2–3.
      **Same-day sweep continues 27.07 on the patient-facing side** (not a separate box — same A-1 pattern,
      migration `0252_patient_action_accessors.sql`): `7907b84bd` moves LFK-diary complex-cover reads
      (`pgLfkDiary.ts`), the phone-challenge store (`pgPhoneChallengeStore.ts`) and platform LFK media access
      (`pgPlatformLfkMediaAccess.ts`) off direct bootstrap-role table grants onto narrow `app`-schema
      accessors; `e3949e113` does the same for the phone-OTP lockout/lock-check path
      (`pgPhoneOtpLimits.ts` → `app.phone_auth_find_otp_lock` / `..._register_otp_lockout` / `..._reset_otp_lockout`).
      Scoped tests green: `pgPhoneOtpLimits.test.ts`, `pgLfkDiary.test.ts`, `pgPhoneChallengeStore.test.ts`,
      `pgPlatformLfkMediaAccess.test.ts`, `patientActionAccessorsMigration.test.ts` — 20/20, re-run during
      this reconciliation. Still does not complete A-1 stages 2–3 (the structural owner-split and allowlist
      gate remain open).
- [ ] **A-2 (C2) Public read surface.** Owner: study which actions genuinely need it; do not serve public
      data under system roles. External research says a policy over a mixed table is NOT enough (RLS is
      row-granular; covert channels are documented by PostgreSQL itself) — the shape is a **separate public
      projection** plus a dedicated read-only role. Material already in repo: `app_config_reader` (written,
      never applied to TEST), publication flags (`is_published`, `is_active`, `public_widget_visible`),
      `app.resolve_public_organization_slug`, `c4d_platform_library_read`.
      **Reconciled 2026-07-26 (audit pass): one narrow instance closed, the item itself is not.**
      `881ca0950` scoped the `c4d_platform_library_read` policy `TO app_staff` and fronted the one
      legitimate anonymous read through a new SECURITY DEFINER accessor
      (`app.read_platform_media_row`) — `app_patient` could ambiently `SELECT` any
      `owner_kind='platform'` row via `media_files` before this; live platform-row count was 0, so the
      hole was armed, not firing. That closes one of several listed exposures. `app_config_reader` is
      still unapplied to TEST, no separate public projection exists, and the other three named surfaces
      were not touched. Stays open.
- [x] **A-3 (C2/#1004) Anonymous booking — ALWAYS prove contact ownership** — PROVEN, not just landed.
      Owner ruling: «всегда просить код или вход». Three commits close it: `124d7d074` splits the public
      route into `create` (validates + tenant-binds, pins the intent to a phone-OTP challenge, no
      contact-keyed lookup at all — uniform by construction, not padding) and `confirm` (takes only
      `challengeId`+`code`; nothing about the booking is re-derived from the caller's input); `73cfaf547`
      drops the `retryAfterSeconds` echo that let a caller learn whether a phone had a recent code
      request; `53b93c41e` moves the OTP-table reads off a runtime-role grant onto two `app_owner`
      SECURITY DEFINER accessors (migration 0246) after finding the DEV-only version depended on a
      worker's hand grant. All three of the plan's named oracles close: no identifier returned on either
      step, status divergence and package consumption now happen behind proof, and `booking_blocked` is
      unreachable anonymously because nothing looks the contact up before proof. 53 tests pass
      (`route.test.ts` ×2, `publicBookingVerification.test.ts`, `pgPublicBookingUserResolve.trust.test.ts`,
      re-run live during this reconciliation). Live on TEST: `phone_otp_public_booking_issue_challenge`
      and `..._consume_challenge` both present in `pg_proc` — migration 0246 is applied, not just
      committed. The commit's own live proof (challenge/confirm round trip, lockout, replay-refused) was
      run on DEV only — the anonymous end-to-end click-through **on TEST** is H-5's job, not re-done here,
      and stays open there.
- [ ] **A-4 (C3) `platform_users` rebuild.** Owner: «ну значит переделывать». Practice says do NOT bolt RLS
      onto it — move identity out of the RLS surface (private schema + dedicated role, Supabase `auth` shape)
      or expose 2-3 accessors returning scalars not rows (PostgREST `basic_auth` shape); split PII satellite
      (GDPR Art. 4(5)). Must keep ~40 pre-auth read sites and ~8 pre-auth write sites working. Same class:
      `appointment_records`, `patient_bookings` (no `organization_id` at all).
- [x] **A-5 (#1006) — gate rebuilt and PROVEN against both attacks** (`0f4035e7b`). The census now decides
      lexical coverage **per call site** over the TypeScript AST (`typescript` is already a repo dependency;
      no framework added): a read counts as covered only inside a `runWith*Principal` callback or after an
      **awaited** guard in the same statement list. An import covers nothing, an unawaited call covers
      nothing, a comment covers nothing. Read detection spans the whole server module graph, not just
      `src/app`, so a read reached through `configAdapter`/`pgAppRuntimeSettings` is no longer invisible.
      Both of the auditor's attacks were reproduced: attack (a) guard-imported-but-not-awaited — old gate
      4/4 green, new gate 3 assertions red; attack (b) anonymous page reaching the bare
      `app_runtime_settings` query — old gate 4/4 green, new gate 2 red. Removing each attack returns 4/4.
      `getOptionalPatientSession` is out of the establisher list (it returns `null` and stamps nothing), and
      the pages that relied on it are now **visible in a frozen manifest of 12** rather than silently
      accepted — up from the 5 in my hand-written list. The gate also states in the file what it honestly
      cannot carry: principal establishment is a runtime, per-async-context property that no source scan
      decides.
      **The product bug behind it is fixed too:** `getAppBaseUrl()` now reads through
      `app.read_public_runtime_setting`, the definer accessor the anonymous role may execute (migration
      0245 registers the key exactly as 0193 does for the timezone — no new function, definer count
      unchanged). And `getConfigValue` now distinguishes "the database has no value" (an answer, cacheable)
      from "the read never happened" (not an answer, never cached) — that was the poisoning mechanism.
      Proven: `og:url` was `http://127.0.0.1:5200`, is now `https://test.bersoncare.ru`. Also settled: `/` is
      dynamic, not statically rendered, so the wrong origin was never frozen beyond the 60 s cache.

- [ ] **A-5 first pass, SUPERSEDED — its gate was false assurance.**
  ПРЕЕМНИК 27.07:
  live A-5 is the AST gate in `0f4035e7b` above.
  The independent auditor kept all four assertions green with a live instance of the bug present, and the
  headline assertion stayed green when the fix it protects was reverted. Two causes: the establisher regex
  matches a guard's own DEFINITION site (17 guards live under `src/app`), so merely _importing_ a guard
  satisfies it; and reads through modules outside `src/app` (`configAdapter`, `pgAppRuntimeSettings`) make
  the page invisible to the census entirely. Also `getOptionalPatientSession` sits in the establisher list
  but returns `null` and stamps nothing for an anonymous caller. Being repaired; a false gate is worse
  than no gate.
  **Two of my own claims here were wrong, corrected by the audit:** (1) the "five public pages" — four of
  them never touch `system_settings` at all; they read through `app.read_public_runtime_setting`, a
  definer accessor the anonymous role may execute, under an explicitly declared bootstrap principal, and
  get the CORRECT value with zero denials. Only the landing genuinely reaches `system_settings`, and the
  `getConfigValue` chokepoint has 50 call sites across 18 files, so attributing the denial volume to five
  pages was unfounded. (2) The claim that 26 `api/integrator/*` handlers "express no principal at all" is
  false — every one of them stamps a bootstrap principal through `assertIntegratorGetRequest` /
  `verifyIntegratorSignature`. The count is 0, not 26. The consequence (same 42501, same bare login role)
  is real, but it is deliberate, not accidental — #1008's stated reason must be rewritten.
  **A real product bug came out of it:** the anonymous landing serves the env fallback instead of the
  configured `app_base_url`, AND `configAdapter` caches that failure in a process-global map keyed only by
  setting name — poisoning it for ~60 s for authenticated consumers too: clinic invite links, booking
  confirmation e-mails, OAuth redirect base. Being fixed with the gate.

- [ ] **A-5 first pass (superseded above)** (`bf7e951f7`).
  ПРЕЕМНИК 27.07:
  live A-5 is the AST gate in `0f4035e7b` above.
  **The class was far smaller than the denial count implied, and the count was misleading.** Census: 173
  page/layout entries, 88 read the DB in their own scope, **87 already stamped a principal, exactly 1 did
  not** — now fixed. Server actions swept too: 0 unstamped. Route handlers are outside the class by
  construction (a route is the root of its own async context; nothing above it to fail to inherit from).
  The 15 800 `system_settings` denials come from **5 genuinely public pages** whose config read
  (`modules/system-settings/configAdapter.ts::getConfigValue`) catches the denial and falls back to env —
  they never 500; they log once per anonymous request. Fixing that noise properly IS item A-2, not this
  one. Gate: `app-layer/principal/pagePrincipalCensus.test.ts`, copied from the repo's existing
  source-scanning census tests, proven to FAIL when either fix is reverted. Three stale frozen-count
  gates repaired in passing (my attribution of the breakage was wrong — it was `1561246d8`, not
  `ad9db8266`, and `ad9db8266` broke two different assertions).
  Escalated, not fixed: **#1009** — `/app/doctor/admin/booking` is 308-redirected for every request with
  no role check, so it is unreachable while still counted as a live surface, AND neither sanctioned
  principal shape fits its booking-engine read. **#1008** — 26 `api/integrator/*` handlers read the DB
  expressing no principal at all.
- [x] **A-6 (#1007) Cross-tenant writes to shared dictionaries** — CLOSED and proven, `7705cd8f5` +
      `f5e7c2d2b`. `clinical_test_measure_kinds` (no `organization_id` by design, pre-SaaS-pivot table)
      let any clinic's doctor mutate the platform-wide catalog; the guard now enforces ownership on write.
      Swept the same class across `reference_categories/items`, `courses`, `content_pages`, `tests/
    test_sets`, `lfk_exercises` + `owner_kind='platform'` siblings — this table was the sole outlier.
      `f5e7c2d2b` hardens the deploy SQL so an absent table warns instead of aborting the whole closure.
      Proof: `route.test.ts` (146 new lines) re-run during this reconciliation — 4/4 pass.

## B. Security — host, secrets, database access

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] **B-1 (A1) Split OS identities.** Owner authorised configuring users on THIS box under deploy rights.
      Runtime account with no sudo and **no `docker` group** (docker membership is root by itself and
      survives any sudo trim); deploy stays separate; delete the dormant old deploy path. Also: create a
      root-capable account for me with **no external access** (no SSH, no password login).
      **Re-verified live 2026-07-26 (`cd2ce0a0a` + execution) — the core split landed and is provably
      working, two named sub-asks are not.** `bersoncarebot-webapp-test.service` runs as `bcb-web-test`,
      `bersoncarebot-api-test`/`worker-test`/`scheduler-test` run as `bcb-api-test` (`systemctl show
    -p User -p Group` on all four, live), `bersoncarebot-media-worker-test` intentionally stays on
      `deploy` (hard-pinned by `assert-media-worker-test-unit-properties.sh`, out of this runbook's
      scope). Both new accounts: `id` shows no `sudo`, no `docker`, only their own primary group.
      Cross-read provably blocked: `sudo -u bcb-web-test cat /opt/env/bersoncarebot/api.test` →
      `Permission denied`, and the reverse. `/api/health` → `200 {"ok":true,"db":"up"}`. - [x] **B-1: finished identity split.** Web runs as `bcb-web-test`; integrator, worker and scheduler
      run as `bcb-api-test`; both have neither `sudo` nor `docker`, services answer, and the web identity
      cannot read integrator keys. This was re-verified live; full CI was green at `8393cb4f5` (10,919
      tests, 0 failures; the known dev-tool advisory is separately dispositioned in G-5). - [ ] **B-1 remainder: remove the dormant old deploy path.** Two candidate SSH keys under
      `deploy/.ssh/` still make the exact target ambiguous; this is open, not owner-deferred. - [ ] **B-1 remainder: create the separate root-capable identity with no external access.** `dev`
      already resembles that shape, but the requested separate identity has not been created; this is open,
      not owner-deferred.
- [x] **B-2 (A2) Postgres host trust** — narrowing done and verified live; break-glass requirement was
      already met, not newly built. `pg_hba.conf` today: `local all postgres peer`, `local tgcarebot
    tgcarebot peer`, then straight to `host ... scram-sha-256` — the catch-all `local all all peer` line
      is gone (re-checked directly against `/etc/postgresql/16/main/pg_hba.conf` during this
      reconciliation). Discovery before the cut confirmed nothing depends on it: every app `DATABASE_URL`
      and every `psql`/`pg_dump` call in `deploy/host/*.sh` and the backup scripts use TCP +
      scram-sha-256, never the socket. "Superuser only via an audited break-glass path": becoming
      `postgres` already requires `sudo -u postgres`, and every `sudo` invocation is captured in the
      persistent journal (actor + full command) — confirmed as the existing audited path rather than
      inventing a new one. Moving the DB to its own host is explicitly the item's own "fuller answer",
      not a requirement of this line.
- [ ] **B-3 (B1) Split the five secrets by consumer** now; a secret store when there is more than one host —
      the owner tied this to B-2 himself.
- [ ] **B-4 (B2) Key ids so signing keys can rotate** without a forced global logout.

## C. Authentication

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [x] **C-1 (D1) Session revocation** — `12e263e63` was superseded, not finished; the replacement is
      proven. Owner confirmed: idle 12 h staff / 30 d patient, absolute ceiling 7 d / 90 d. An independent
      adversarial audit broke `12e263e63` against a live database and found six defects; `988f0decd`
      replaces the timestamp-based mechanism entirely with a single per-user monotonic epoch compared
      for equality (migration 0244, `platform_users.session_epoch`) and closes all six.
      `sessionCookie.ts` names the numbers exactly as ruled:
      `SESSION_SLIDING_TTL_STAFF_SECONDS` = 12h, `SESSION_SLIDING_TTL_SECONDS` (patient) = 30d,
      `SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS` = 7d, `SESSION_ABSOLUTE_MAX_AGE_SECONDS` = 90d. Proven
      against a database, not just in memory: `f132af20c` fixed a boot-guard false positive
      (`information_schema.columns` is privilege-filtered, so the probe's role mistook "no grant" for
      "no column"), and tonight's TEST deploy exercised the epoch for real — it invalidated every stale
      cookie in the smoke fixture, which is the mechanism doing exactly its job under load, not a defect.
      38/38 tests re-run clean during this reconciliation (`service.sessionRevocation.test.ts`,
      `sessionRevocationSchema.test.ts`, `service.sessionConcurrency.test.ts`). Live: `/api/health` →
      200 on the running TEST webapp. #970 superseded — see G-3.
- [x] **C-2 (D2/D3/D4) OTP hardening.** Rate limiting on six routes (per-IP and per-account, separate
      thresholds, decaying lockout — a limit that locks out a real clinic is a defect); atomic attempt
      counter; purpose binding. NIST SP 800-63B, OWASP ASVS V6.
      **Reconciled 2026-07-26: three of four steps landed and proven, one determination made, one gap
      confirmed live.** `fefa3bbad` — atomic attempt counters (real lost-update bug: both OTP engines
      read-then-wrote attempts non-atomically; now DB-computed `attempts + 1` under a row lock) plus
      per-IP limiting on 8 confirm routes that had none. `ed7ab130b` — decaying lockout (2/4/8/16 min,
      capped 30 min, NIST §5.2.2), keyed per phone/email identifier via `phone_otp_locks`/
      `email_otp_locks`. `913e140a6` — purpose binding on `email_challenges`. All three proven with real
      two-connection Postgres concurrency tests (`pg_blocking_pids` barrier), not sleeps.
      **Per-IP vs per-account determination:** the per-IP sliding window (`auth.confirm`, 30/10min) and
      the decaying lockout (keyed per-identifier, i.e. per-account) ARE two separate mechanisms with
      separate thresholds — this satisfies the plan's "per-IP and per-account, separate thresholds"
      textually, even though neither commit message calls the identifier-keyed lockout "per-account" by
      name.
      **Confirmed live gap, not yet closed:** `/api/auth/email-password/login/factor/route.ts` has no
      per-IP rate limiter at all — read the file during this reconciliation, no `rateLimit`/limiter call
      anywhere in it, only an account-level `factor_locked` from `staffSecurity.completeLogin`. Stays
      open on this gap alone.
      ✅ **ЗАКРЫТО 27.07, полный CI зелёный** (10 919 тестов, 0 падений; единственная красная строка — известная
      уязвимость в dev-инструментах, #1014, решение владельца «деплоим с ней»). `fefa3bbad`, `ed7ab130b`, `913e140a6`, `256640c4f` — неделимый счётчик попыток, ограничение по адресу на восьми ручках, растущая блокировка, привязка кода к назначению, и закрыта дыра на втором факторе.
      🔴 **ЧАСТЬ ГАЛОЧКИ СНЯТА 27.07 — «ограничение по адресу» в locked-режиме НЕ РАБОТАЕТ. taskdb #1055.**
      Найдено независимым аудитом C-5, подтверждено прямым запросом к TEST. `public.auth_rate_limit_events`
      выдана ТОЛЬКО `app_staff` (`deploy/postgres/p0-5b-grants.sql:85`); `relacl` — ровно
      `{bersoncarebot_test, app_staff}`. У `bcb_test_nonstaff_login` — голой bootstrap-роли, под которой
      исполняются ВСЕ восемь анонимных ручек подтверждения — `SELECT/INSERT/DELETE` = `f/f/f`.
      Цепочка: bootstrap-принципал не делает `SET ROLE` (`packages/db-principal/src/index.ts:897-900`) →
      запись лимитера падает по правам → исключение проглатывается в
      `createSlidingWindowRateLimit.ts:78` в переменную замыкания `dbUnavailable=true`, которая **никогда
      не сбрасывается и ничего не логирует** → общий лимитер `auth.confirm` обслуживает все ~10 ручек из
      ПАМЯТИ ПРОЦЕССА: счётчик не общий для пяти юнитов и обнуляется на каждом рестарте и деплое.
      Тесты этого не видят по построению — они мокают лимитер. Тот же класс, что три другие находки этой
      ночи: написано, выглядит рабочим, молча не работает.
      Остальные три шага C-2 под сомнение НЕ ставятся — неделимый счётчик, растущая блокировка и привязка
      к назначению доказаны настоящими двухсоединительными тестами конкуренции против Postgres.
      Лечение — узкая `SECURITY DEFINER`-процедура под bootstrap-роль по образцу `0252`, НЕ грант на
      таблицу (§4 канона владельца; лишний грант роняет деплой — инцидент 24.07). Блокирует C-5.
      ✅ **ПОЧИНЕНО И ДОКАЗАНО ЖИВЬЁМ 27.07** (`dc628b1d0`, миграция `0254`, деплой
      `deploy-test-20260727T050632Z`). Четыре узкие `SECURITY DEFINER`-функции (`auth_rate_limit_count`,
      `_record`, `_prune_scope`, `_prune_key`), владелец `app_owner`, `EXECUTE` выданы bootstrap-роли и
      `app_patient`. Семантика окна, подсчёта и advisory-локов не менялась — это правка ПРАВ, не логики.
      Решающая проверка под настоящей рантайм-ролью: `SET ROLE bcb_test_nonstaff_login` →
      `count` = 0 → `record` → `count` = **1**, то есть счётчик вырос В БАЗЕ, а прямой
      `SELECT count(*) FROM auth_rate_limit_events` по-прежнему `permission denied`.
      Гейт деплоя: `80/80 secdef functions pinned`, 42 обязательных гранта.
      Побочно: тихий откат в память теперь пишет `warn` ОДИН раз — раньше он молчал, и именно поэтому
      поломка прожила незамеченной. Сам механизм отката не переделывался: нужен ли ему сброс или ретрай —
      **вопрос владельцу**, не наша инициатива.
- [x] **C-3 (#1005) Delivery-channel fallback.**
      Действующая цепочка после решения владельца 27.07: Phone entered → SMS, если канал включён и номер
      подходит → подтверждённый e-mail, если он привязан. Web Push остаётся только каналом обычных уведомлений
      и не используется для регистрации или кодов входа. Публичный ответ, сохранённый challenge/lockout и
      минимальное окно ответа одинаковы при наличии/отсутствии аккаунта и канала; provider delivery идёт через
      Next `after` после ответа. Код, доставленный на e-mail, подтверждает e-mail и никогда не
      выставляет phone trust. NIST 800-63B-4 считает SMS restricted и требует альтернативный тип
      аутентификатора, но не признаёт e-mail допустимым OOB authenticator; e-mail fallback — продуктовое решение
      владельца, anti-enumeration — OWASP Forgot Password / ASVS 6.3.8. Доказательство:
      `apps/webapp/src/app/api/auth/phone/start/route.ts` + `phone/confirm/route.ts`,
      `apps/webapp/src/modules/auth/phoneStartFallback.route.test.ts`,
      `apps/webapp/src/infra/integrations/sms/integratorSmsAdapter.deferred.unit.test.ts`,
      `apps/webapp/src/infra/integrations/sms/stubSmsAdapter.deferred.unit.test.ts`,
      `apps/webapp/src/infra/repos/pgPhoneChallengeStore.unit.test.ts`,
      `apps/webapp/src/shared/ui/patient/auth/PhoneMessengerAuthFlow.ui.test.tsx` (13/13).
- [x] **C-4 (D5) Admin allowlists → roles.** Remove the DB-resident allowlists that also confer admin;
      recipients derived from roles at send time; owner identity pinned in env.
      **Разведка сделана 26.07 → `docs/_TODO/C4_ADMIN_ALLOWLISTS_2026-07-26.md`.** Главное оттуда:
      списков СЕМЬ, а не один; те же ключи служат адресатами оповещений, поэтому «снять права» и
      «переселить адресатов» делаются ОДНОЙ правкой — иначе молча гаснет всё оповещение (уже прожито
      в июле); поле `admin_emails` сейчас ПУСТОЕ (спит, не заряжено); вход владельца от списков НЕ
      зависит (роль прописана в его строке миграцией `0233`) — это и делает порядок безопасным.
      Две мои формулировки владельцу были неверны и исправлены в том файле.
      **Implemented after the recon, `5f81febc4` + `c28267883` — but proven incomplete, stays open.**
      The seven allowlists (`admin_emails/admin_phones/admin_telegram_ids/admin_max_ids/doctor_phones/
    doctor_telegram_ids/doctor_max_ids`) stop conferring role; alert recipients now derive from role
      at send time; the technical-settings UI fields are marked inert. **Confirmed live during this
      reconciliation: the integrator reads the same seven lists independently and is untouched by
      either commit** — `apps/integrator/src/infra/db/messengerStaffIds.ts` still keys off
      `admin_telegram_ids`/`doctor_telegram_ids`/`admin_max_ids`/`doctor_max_ids` to decide who is
      staff, and `apps/integrator/src/infra/db/adminIncidentAlertRelay.ts` still loads
      `admin_telegram_ids`/`admin_max_ids` directly. Neither file was touched by `5f81febc4`. This is
      C-4's own line ("Remove the DB-resident allowlists that also confer admin") — a brand-new
      `platform_users` row can still be stamped `role:'admin'` through this path. That is the remainder,
      not a new item.
      ✅ **ЗАКРЫТО 27.07, полный CI зелёный** (10 919 тестов, 0 падений; единственная красная строка — известная
      уязвимость в dev-инструментах, #1014, решение владельца «деплоим с ней»). закрыт полностью, включая последнюю дыру в интеграторе: `5f81febc4`, `c28267883`, `e14fdbfd6`. Семь списков больше не выдают роль; новая учётка не может родиться администратором от идентификатора в списке. Доказано отрицательно: аккаунт с идентификатором в списке админов создаётся клиентом.
- [x] **C-5** Password change screen — exists nowhere today (#1000).
      ✅ **ЗАКРЫТО И ДОКАЗАНО ЖИВЬЁМ 27.07** (`60e0ff883`, `85a2cbef8`, `9cf2602c9`; деплой
      `deploy-test-20260727T071117Z`, exit 0). Экран **Аккаунт → Безопасность**: требует текущий пароль,
      при успехе отзывает остальные сессии через уже существующий `session_epoch` из C-1 и выдаёт свежую
      куку, чтобы текущая сессия выжила. Политика пароля вынесена из reset БЕЗ изменения — одна на оба
      потока. Лимитер — общий `auth.confirm`, порядок: принципал → аутентификация → лимит, чтобы аноним
      не жёг общий бюджет клиники. Ошибки разделены по причинам (неверный текущий / слабый новый / лимит),
      а не один общий тост — прямое следствие урока #1049.
      Сквозная проверка настоящими HTTP-запросами под живой сессией врача: неверный текущий → 401;
      верный → 200; вход старым паролем → 401; вход новым → 200.
      🔴 **Чего это стоило и почему записано в §14 канона:** C-5 прошёл ПЯТЬ гейтов — воркер, независимый
      аудит, correction, вторую независимую перепроверку и полный CI на 9448 тестов — и был СЛОМАН.
      Первый живой запрос дал 500. У `app_patient` (а путь исполняется именно под ней —
      `enterStaffSecuritySelfPrincipal` подменяет принципал на пациентский даже в кабинете врача) не было
      прав ни на одну таблицу записи. Все тесты мокают базу и не могут отдать `permission denied`.
      Лечение — миграция `0256`, `app.set_staff_security_self_password_hash(text)`: принимает только хеш,
      идентификатор берёт из принципала, подменить аргументом нельзя. Счётчик 80→81.

## D. Notifications

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] **D-1 (D5) Routing by role + an owner-facing matrix**: per notification/error type choose push /
      e-mail / SMS. SMS is mechanism-only for now. Operational alerts get their own channel (the July
      SMTP-quota outage went unnoticed for a day because alerts shared a channel).
      **Landed subset, not closure:** `b81b539db` added the admin e-mail alert channel, but audit found it
      never reached SMTP. `85b58b536` routes it through the dedicated operator relay; neighbouring channel
      failures were fixed in `8393cb4f5`, where full CI was green (10,919 tests, 0 failures). The routing
      matrix and the per-notification decision remain open.
      **Reminder-queue incident (24.07 20:00 → 27.07 17:20):** migration
      `0260_outgoing_delivery_scope_text_ids.sql` fixed the text/uuid comparison; the lead applied it to
      TEST and proved it on a real stuck row. `5af05df70` stops scope failures retrying forever. Full
      chronology and evidence are in [OUTBOUND_DELIVERY_ALERTING_PLAN.md](OUTBOUND_DELIVERY_ALERTING_PLAN.md#инцидент-2026-07-24--2026-07-27--напоминания-пациентам-не-уходили); do not duplicate it here.
      **Owner ruling 27.07 closes the open half of the routing question** — `OWNER_PRODUCT_RULES.md` §28:
      operator alerts are a separate class (all channels by default, past user preferences and past the
      dev filter), ordinary admin notifications follow §21. Still to BUILD, none of it exists yet: - [ ] the operator-alert destination list and channel switches in the global-admin cabinet; - [x] the undisableable floor — enforced server-side in `operatorHealthAlertConfig.ts`: disabling the
      emergency class, e-mail, or any critical channel is REJECTED with a cause, and a stored config that
      already violates the floor is repaired on read so the alert still goes out. 15 scoped tests, re-run by
      the lead in the main tree (the worker's own clone had no `node_modules` and it said so); - [ ] no early return on an empty recipient set: fall back, count, and let the counter alert.
      **What counts as an emergency is now decided too** — §28.1: a failed precondition/channel self-test,
      never a share of recipients. The probe machinery already exists (`runOperatorHealthProbes`: MAX,
      Telegram, Rubitime, Google Calendar) and **nothing schedules it** — no cron, no timer, no in-process
      job. Open work: - [x] the probes are now driven from the leader-elected scheduler with per-channel interval, timeout,
      consecutive-failure threshold and a quiet window (`14e88c606`) — **an independent audit returned
      FAIL and the lead confirmed the three worst findings by reading the code**: the new DB reads carry no
      principal context, so on TEST every tick throws before reaching the probes; the configured threshold
      does not drive paging (hardcoded `PROBE_CRITICAL_CONSECUTIVE_FAIL_RUNS = 3`); an unbounded quiet
      window can silence the probes forever.
      **All three fixed in `cefd66fb6`, confirmed by re-reading the code, not the worker's report:**
      (1) `operatorHealthProbeTick.ts` wraps config load + last-run read + probe run in
      `runWithInfraPrincipal` — no more bare DB call outside a principal; (2) the hardcoded 3-strike
      constant is deleted from `criticalHealthSignals.ts`; the banner and the critical-signal classifier
      now fire on `probeIncidentsOpenCount > 0` (an incident the integrator only opens after each probe's
      _configured_ `consecutiveFailures`), proven by a new test asserting `reportOperatorFailure` is
      NOT called below a raised per-channel threshold; (3) `quietWindowMaxDurationMs` (default 24h, capped
      60s–7d by schema) bounds `isOperatorHealthProbeQuiet` so a stored `quietUntil` can no longer silence
      probes indefinitely. `25479901a` re-aligned the banner test to the new incident-based threshold and
      added the `DELETE /api/admin/settings` census/exemption entry for the probe-config reset route.
      Integrator scoped tests 11/11 green (`operatorHealthProbeTick.test.ts`,
      `operatorHealthProbeRunner.test.ts`, `operatorHealthProbeSettings.test.ts`), webapp scoped tests
      66/66 (+1 skipped) green (`criticalHealthSignals`, `adminDoctorTodayHealthBanner`,
      `dispatchOperatorAlert`, `operatorHealthAlertConfig`, `csrfOrigin`), re-run during this reconciliation. - [ ] add the missing probes: SMTP connect+AUTH, a daily real test send, SMS balance, web push; - [x] per-channel timeouts replaced the single 15 s constant, and the threshold is configurable —
      **and now wired to what actually pages**, per the `cefd66fb6` fix above. - [ ] an external heartbeat whose silence is the alert, on a transport we do not own. - [x] the admin form for the probes (§28.3): enable, interval, timeout, consecutive failures, each field
      showing its default, with a reset control — and the settings service gained the delete path a reset
      actually needs (it had none). IMAP service-mailbox fields landed with it (secret-enveloped password,
      never returned to the client); the mail probe itself is a separate slice and is NOT built. - [ ] the deploy must issue its own short, auto-expiring silence (§28.7), and an active silence must be
      visible on the health page — neither exists yet.
- [x] **D-2 DONE 2026-07-26 (`eb62b6544`) — and the defect was worse than this line said.**
      Both routes (`api/patient/support`, `api/public/support`) hardcoded `ADMIN_TELEGRAM_ID` and relayed
      to Telegram only: unset id → 503 before anything was attempted, relay failure → 502. **Neither route
      persisted the submission anywhere** — so a patient's message was not merely undelivered, it was
      LOST, with only a `reason`/`route` line in the log and no trace of the address or the text.
      Now: delivery goes through `dispatchOperatorAlert` — the existing config-driven multi-channel
      mechanism built for operator alerts in `f5ecb6e78`, with a new `"support"` block. Channels are a
      matter of configuration, so removing Telegram later changes nothing here. When no channel confirms
      delivery the submission is **persisted** (bounded ring buffer in `operator_job_status`, a table the
      runtime role already has grants for — deliberately no new table, because the deploy asserts exact
      per-role privileges and a new grant surface in a shared worktree is how TEST went down on 07-24),
      and the empty-audience alert fires on its own, so the gap is visible without anyone polling a queue.
      The user now always sees «Сообщение получено», never a 5xx.
      **This unblocks E-1** — cutting Telegram and MAX no longer kills support.
      Worker's own flagged compromise, recorded rather than hidden: persisting into
      `operator_job_status.meta_json` is the smallest safe addition, not the proper dedicated table the
      full support design (`ADMIN_BASELINE_AND_SUPPORT_CHAT_DESIGN.md`) describes. No operator-facing
      list screen exists — that is the natural next increment if wanted.
- [ ] **D-3** PWA + push for the global admin (pre-production list).

## E. Messengers

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [-] ~~**E-1 — CANCELLED 2026-07-26 by the owner. Nothing is cut; both stay, switchable.**~~ — ОТМЕНЕНО ВЛАДЕЛЬЦЕМ 26.07: «тг мы не вырезаем тогда, оставляем просто отключаемым в настройках».
  Owner, verbatim: «тг мы не вырезаем тогда, оставляем просто отключаемым в настройках» — and earlier,
  that MAX may come back as a login method. So the original instruction («MAX тоже нахер пока») is
  **superseded**: no kill-switch to build, no code to delete, no `telegram_state` retirement, no data
  migration. Everything this item asked for already exists and was verified working today.
  **Verified live 2026-07-26** (`90cd8cf22`): the four «Доступные способы входа» toggles
  (`auth_email_enabled`, `auth_sms_enabled`, `auth_telegram_enabled`, `auth_max_enabled`) each block
  the **server-side** login path before any send or session creation — not merely hide a button, so
  they cannot be bypassed by posting straight to the endpoint. Disabled channels are also absent from
  the login UI, fail-closed if the policy fetch is missing.
  **Login and delivery are genuinely separate axes in the code**, which is what makes the owner's
  position workable: the login gate is the `system_settings` toggle; the delivery gate is the env
  (`MAX_ENABLED`, `TELEGRAM_BOT_TOKEN`, `SMSC_ENABLED`) consumed only when building dispatch adapters.
  `max-init` never touches the dispatch layer. So messenger delivery can be off while messenger login
  stays on, with nothing to change.
  Gap found and closed: three login routes had **no test** proving the disabled-channel gate — the code
  was right but the protection rested on a fail-open default. Now asserted.
  Market context that also removes the urgency (research 2026-07-26): Russian clinics have **not** left
  Telegram — a Naumen study of 23 major chains, Apr–Jun 2026, found half still use it despite fines, with
  MAX growing fastest but not dominant. Cutting both would have been **stricter than the market**, not
  catching up to it.
  Remaining, and unchanged: the legal restriction is about **what content** travels over a foreign
  messenger, not about having the channel at all — see D-1/#913 for the field-level matrix.

- [ ] **E-2** Bot-token plaintext in `system_settings` retires with the bot.
- [ ] **E-3** Pre-production: message the messenger-only accounts while the bots still work.

## F. Product / UI

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [x] **F-1 (#1002) Dropdowns show the KEY instead of the label** — closed at the root, not patched.
      `9caef151e` fixed it once in the shared primitive: `select.tsx`'s wrapper now auto-collects labels
      from its own `<SelectItem>` children instead of relying on 105 call sites to opt in a
      `displayLabel` (the old pattern, which is why it kept coming back). Also converged a byte-identical
      duplicate `components/ui/select.tsx` into a re-export and killed two hand-rolled raw-key fallbacks.
      `55b10b3d5` fixed four `SelectTrigger` sites that hand-computed a label independently of their own
      `SelectContent` list and had drifted. Gate: `selectValueLabelCensus.test.ts` (source census with a
      self-test) + `select.selectedLabel.test.tsx` (behavioural), both proven to fail on deliberate
      reintroduction. 14/14 tests re-run clean during this reconciliation. Live screenshot exists:
      `runs/screenshots/f1-select-labels/`.
- [x] **F-2 (#1003) Tariffs** — both parts done and proven, `6f923c920`. (1) The mandatory reason on edit
      is gone — `reasonSchema.min(1)` and the disabled-save gate removed; audit trail still writes
      unconditionally. (2) Quota units are human-readable — `QUOTA_UNIT_LABELS` replaces raw keys
      (`appointments`→«Записи», `bytes`→«Байты», etc.) in the select + snapshot caption. 31/31 tests
      re-run clean (`route.test.ts`, `service.test.ts`) during this reconciliation. Verified live on DEV:
      blank-reason `POST update_tariff` → 200, persisted, reverted; screenshot
      `host-orch/shots/20260726-1708/i0_app_doctor_commercial_2026-07-26T14-08-13Z.png` shows the label
      live. Not yet reviewed by the owner — that review, not more engineering, is what remains.
- [ ] **F-3 (#964) Scheduled messages** — unblocked. Alarm icon + time replaces the first delivery tick;
      click to reschedule or cancel; pending messages last in the thread under a divider; collapsing later.
      ~3000 lines exist on `agent/ui964-20260722`; migration must be renumbered, `DoctorCommentsTab` was
      rewritten in feat.
- [x] **F-4 (#988)** — REOPENED 2026-07-26 by the lead, CLOSED 2026-07-27. Code fix `ad70a0da9` is correct and was proven live
      over HTTP (unread 2 → 1, the untouched conversation stays unread) — **but only on DEV, and only after a
      worker applied the required grant BY HAND.** Verified read-only on TEST: `app_patient` has SELECT and
      INSERT on `support_conversation_messages.read_at` and **no UPDATE**, and
      `deploy/postgres/patient-support-mark-read-grant.sql` is referenced by no closure at all
      (`grep -rn "patient-support-mark-read-grant" deploy/` → only its own header and prose in a sibling).
      So a normal `deploy-test.sh` never applies it and mark-read answers 500 / 42501 on TEST.
      **"Proven on DEV after hand-applied SQL" is not proven** — the same class as the repo's own trap «a grant
      written in a drizzle migration does not survive; runtime grants belong in the closure that owns the role».
      Wired in `715867dfb`, applied by the deploy, verified present on TEST.
      **PROVEN LIVE 2026-07-26 over HTTP as the owner's own client record: mark-read returns 200.**
      That is the 500→200 transition, so `patient-support-mark-read-grant.sql` genuinely works. F-4's
      privilege half is closed.
      **🔴 The reminder half does NOT work, and the grant was necessary but not sufficient.** All three
      actions (done / snooze / skip) answer HTTP 404 `not_found`. Root cause is one level deeper: RLS policy
      `saas_org_dormant_p0_8_4` on `reminder_occurrence_history` has **no patient branch at all** —
      `(is_staff AND org) OR (integrator_user_id = current_integrator_user_id())`. Under a patient session the
      ownership `SELECT` in `pgReminderJournal.ts:145-151` is silently filtered to zero rows — not a 42501,
      an empty result — so the code returns `not_found` and never reaches the `reminder_journal` INSERT the
      grant protects. **Correction to the repo's own documentation:** the grant file describes this gap as
      affecting snooze/skip only; it also breaks `done`. Recorded as taskdb **#1018**, owner-gated because the
      grant file itself declares the policy change out of its scope.
      **Not separately proven:** the `treatment_program_instance_stages`/`_stage_items` UPDATE grants — this
      patient's active program has no `available` stage containing items, so the guarded write path is
      unreachable. A data state, not a defect; needs another patient/instance or a doctor unlocking a stage.
      ✅ **ЗАКРЫТО 27.07 — обе половины доказаны живьём.** Половина с правами (mark-read) была закрыта
      26.07. Половина с напоминаниями закрыта работой по H-3: патч RLS `699604a8e` дал пациентскую ветку
      для «выполнено», миграция `0253` (`170eddc7c`) добавила две узкие `SECURITY DEFINER`-процедуры для
      «отложить» и «пропустить» — по решению владельца §4, не грантом на таблицу.
      **Сквозная проверка 27.07 настоящими HTTP-запросами под живой пациентской сессией владельца**
      (та самая, что раньше отдавала 404 на все три действия):
      `POST .../occurrences/{id}/snooze` → **200** `{"ok":true,"snoozedUntil":…}`;
      `POST .../occurrences/{id}/skip` → **200** `{"ok":true,"skippedAt":…}`;
      `POST /api/patient/reminders/{id}/done` → **200** `{"ok":true,"doneAt":…,"firstDoneForOccurrence":true}`.
      Это же закрывает пробел, который аудит H-3 честно пометил как непроверяемый без живой сессии.
      Данные при проверке изменены по-настоящему: три напоминания владельца на TEST отложено/пропущено/
      выполнено. TEST — площадка для этого, но факт записан, чтобы он не выглядел неожиданностью.
      Остаётся непроверенным ровно то, что и было: гранты `treatment_program_instance_stages`/`_stage_items`
      — у этого пациента нет этапа `available` с пунктами, путь записи недостижим. Состояние данных, не дефект.
- [x] **F-5** — closed conversation renders read-only `ad70a0da9`: opens 200 with history and `readOnly`, the composer is not rendered, posting answers 409 `conversation_closed` instead of the rejected 404. Closed support conversation renders read-only — never "not found".
- [x] **F-6** Clinic slug, public page and the booking screens (worker was stopped mid-flight; migration 0243
      and its `expected_secdef_count` 56→57 sit uncommitted).

## G. Process

      ✅ **ОСНОВНАЯ ЧАСТЬ СДЕЛАНА И ПРОВЕРЕНА ЖИВЬЁМ НА TEST 27.07** (`edbcd7eeb`, `d4d9a2771`, `55befc20f`).
      Владелец 27.07: «я все еще не вижу slug в кабинете врача и на странице публично формы записи нет
      ссылок на запись, так что я не могу протестировать — не знаю где смотреть. Это пока проеб.» Он был
      прав: начинка (`reserveSlug`/`claimReservedSlug`/`renameSlug`, миграции 0203/0218) существовала и
      была покрыта тестами, но её не звало НИ ОДНО место — ни роут, ни форма.
      Теперь есть: экран **Настройки → Организация → «Публичная запись»** (поле, правила ввода, кнопка
      «Создать адрес», видимая копируемая ссылка `{APP_BASE_URL}/book/{slug}`), API-роут
      `POST /api/clinic/slug` за существующей capability `organization.management` (owner|admin), и
      канонический **308** со старого адреса на новый — `resolveCanonicalSlug` до этого не звал никто,
      кроме тестов.
      Проверено живьём под настоящей сессией врача на TEST: страница отдаёт 200 и содержит секцию
      «Публичная запись» / «Slug клиники» / «Создать адрес». `/book/{неизвестный}` отдаёт 404.
      **Ослабление политики по решению владельца §12** (`0255`, taskdb #1058): слаг никогда не достаётся
      ДРУГОЙ клинике, но своя может вернуть себе своё имя. Доказано атакой по живой базе, три отказа:
      чужая вставка → `duplicate key ... uq_organization_slug_claims_slug`; смена владельца строки →
      `aliases are immutable outside same-organization reclaim`; удаление алиаса →
      `durable organization slug claims cannot be deleted`. Возврат себе — прошёл.
      **Снят выдуманный скоуп:** исполнитель зашил лимит «переименовать можно один раз за жизнь», которого
      не было в задании и который противоречил и исследованию, и решению владельца. Удалён.
      **ОСТАЁТСЯ:** обязательный шаг выбора слага ПРИ РЕГИСТРАЦИИ (решение владельца 27.07 —
      «обязательный»); сегодня адрес можно занять только из настроек уже созданной клиники. Пока ни одна
      клиника на TEST слаг не заняла, поэтому сценарий смоука `public.booking.slots` остаётся единственным
      исключением (400), и H-5 владелец сможет проверить только после того, как займёт адрес.
      ✅ **ЗАКРЫТО ПОЛНОСТЬЮ 27.07 — обе половины, деплой `exit 0`, смоук 22/22 БЕЗ исключений.**
      Вторая половина (`b2d09762f` + correction `ecd79e640`): выбор публичного адреса стал **обязательным
      шагом регистрации** — миграция `0257`, две узкие definer-функции (счётчик 81→83), pre-auth ручка
      живой проверки занятости, резервирование имени связано с созданием клиники одной транзакцией
      `provision_specialist_owner`, `retry` идемпотентен.
      **Независимый аудит нашёл три дефекта, все закрыты:** (1) пользователь, начавший регистрацию ДО
      деплоя и подтвердивший ПОСЛЕ, блокировался навсегда — почта подтверждалась, создание клиники падало
      кодом, которого не было в карте ошибок, и человек видел «подождите», а повтор и новая регистрация
      давали 403 и 409. Теперь отсутствие адреса ловится ДО расходования кода: «Выберите публичный адрес
      клиники и повторите подтверждение. Код ещё действует.» (2) Сам деплой стал красным — смоук
      регистрации не мог собрать схему, потому что накатывает явный список миграций, а `0257` и слаговые
      `0203`/`0218` в него не входили; предохранитель `SELECT 1 / (…)` в оверлее это поймал делением на
      ноль. Список дополнен, смоук снова реально проводит регистрацию. (3) Pre-auth ручка проверки
      занятости была без ограничения частоты — добавлено по образцу соседей, с установкой принципала
      первой строкой (урок #1055).
      **Владелец занял адрес `dmitryberson` для «Точки Здоровья» 27.07 через новый экран** — это и
      подтвердило первую половину живьём, и сделало возможным сценарий публичных слотов.
      **Снята пометка «известное исключение»** с `public.booking.slots`: она держалась на том, что publish-
      потока нет и слага нет. Оба условия отпали. Смоук стал 22/22 (`5c6c37192`), сценарий теперь в
      обязательном гейте.
      **Ложная тревога, записанная честно:** я сообщил владельцу, что публичная запись сломана — 400
      `ambiguous_booking_tenant`. Это было НЕВЕРНО, поправлено ему в течение часа. Ручка работает: две
      активные услуги отдают слоты анонимно. Падала одна услуга, «Сеанс 40 мин», деактивированная
      владельцем 01.06, — и отказ был ПРАВИЛЬНЫМ. В фикстуре смоука стоял идентификатор именно этой мёртвой
      услуги. Урок: я сообщил вывод, проверив симптом и не проверив причину. Диагностика самой ошибки
      усилена по ходу разбора: `93d16e1eb` пишет причину отказа резолвера в приватный лог (публичный код
      ответа остаётся нейтральным, чтобы не давать анониму перечислять клиники/услуги через сообщение об
      ошибке), `5597edb61` сузил discriminated union перед чтением полей бронирования для этого же
      диагностического лога — без него TypeScript не давал читать поля, которых нет на всех ветках union.
      **Разбор той тревоги вскрыл настоящий дефект (taskdb #1059, НЕ чинил — нет строки в плане, меняет
      поведение записи):** авторизованный путь `/api/booking/slots` не проверяет активность услуги вовсе,
      поэтому залогиненный пациент может записаться на услугу, которую клиника отключила. Публичный путь
      это проверяет, авторизованный — нет. Вопрос владельцу отправлен с рекомендацией закрыть.
      **ОСТАЛОСЬ ЗА ВЛАДЕЛЬЦЕМ (taskdb #1058 follow_up):** резервирования имён не истекают никогда —
      любой с одноразовой почтой может занять красивый адрес навсегда; и список зарезервированных слов
      проверяется только в коде, но не в базе.

- [x] **G-1** Deploy writes a log to a file — done and live, not just wired. `DEPLOY_LOG_DIR` in
      `deploy/host/deploy-test.sh` points at `~/.local/state/bersoncarebot/deploy-logs/`; confirmed live
      during this reconciliation — 11 real log files there, 91KB–166KB each, timestamps spanning
      tonight's deploy attempts through 23:23.
- [x] **G-2** Land the docs-only branches so the audit trail stops living on side branches; delete the
      remote branches already merged. **Checked, unchanged:** 7 `docs/*` branches still on `origin`
      (`docs/dna-reconcile-20260723`, `docs/dna-settings-live-20260723`, `docs/ui1-appointment-live-20260723`,
      `docs/ui2-reconcile-20260723`, `docs/ui6-settings-live-20260723`, `docs/uip-messages-blocker-20260723`,
      `docs/uip-mobile-menu-live-20260723`), none merged into `main`. No work done on this tonight.
      ✅ **ЗАКРЫТО 27.07 — и закрыто НЕ ТАК, как пункт предписывал буквально.**
      Пункт просит «влить, потом удалить влитое». Проверка показала, что вливать нечего и **вливание
      навредило бы**: все семь веток — дубликаты после ребейза, их содержимое уже в `feat`, причём в
      строго более новом виде. Доказано двумя независимыми способами: `git cherry` помечает шесть из семи
      как уже вышестоящие по patch-id, а седьмую (`f678d13b8`) сверил вручную — её файл аудита идентичен
      `feat`, а её матрица доказательств на пять дней старше (A-DNA-001 там `partial` «нет живого PNG»,
      в `feat` — `real-done` с замерами цвета на именованном SHA).
      **Вливание откатило бы матрицу назад:** `uip-mobile-menu` → 40/49 (−5 доказанных строк),
      `dna-reconcile` → 41/48 (−4), `ui2-reconcile` → 44/45 (−1) против нынешних **45 доказанных / 44
      частичных**; `uip-messages-blocker` уронил бы отдельный отчёт с 14/14 до 11/14, стерев закрытие на
      TEST и повторный аудит под locked-принципалом. Риск потери доказательств здесь был во ВЛИВАНИИ,
      а не в удалении.
      Удалены с `origin` семь веток; хеши сохранены здесь, чтобы след пережил удаление:
      `33d939dec` dna-reconcile · `a857b8eee` dna-settings-live · `2180226ec` ui1-appointment-live ·
      `d7674d56a` ui2-reconcile · `73adb5426` ui6-settings-live · `172cf6638` uip-messages-blocker ·
      `f678d13b8` uip-mobile-menu-live.
      **Остаточный риск, не связанный с ветками:** сами PNG и манифесты, на которые ссылаются эти доки,
      лежат ВНЕ git — в `/home/dev/dev-projects/.lead/runs/…`. Удаление веток их не трогает, но если тот
      каталог когда-нибудь почистят, доказательная база исчезнет независимо от веток.
- [x] **G-3** Mark #970 superseded by the owner's confirmed session numbers — done, in taskdb.
      `node taskdb.mjs get 970` shows status `done`, note `SUPERSEDED 26.07 решением владельца по срокам
    сессий (пункт C-1 плана...)`, pointing at commit `988f0decd` (the C-1 epoch mechanism). This is the
      correct target — see C-1 above.
- [x] **G-5 Dependency advisories** — owner instruction 2026-07-26 «обновляй зависимости». Done with an
      explicit, expiring advisory exception rather than a falsely red CI outcome.
      Of the 12 advisories `registry-prod-audit` reported, **10 were already closed** by `bc41c566d` and
      `d60cb1222` (2026-07-23). Of the 3 live ones — all dev/build tooling, none in a production runtime
      dependency — **2 are fixed** in `6a793fb8c` by moving override floors that had gone stale by two days
      (both advisories were published 2026-07-24, after the last override bump): `postcss >=8.5.10 → >=8.5.18`,
      `minimatch@10>brace-expansion 5.0.7 → 5.0.8`.
      **The third cannot be fixed upstream today:** GHSA-mh99-v99m-4gvg,
      `brace-expansion@1.1.16`: the 1.x line is end-of-life (1.1.16 is its last release ever and carries the
      advisory) and the only consumer left is `eslint@9.39.4` itself, which depends on `minimatch@3` directly.
      **Three routes were tried and all failed — do not repeat them:** 1. force 5.x into the `minimatch@3` slot → lint dies outright, `TypeError: expand is not a function`
      (5.x is not the CommonJS callable that 3.x requires); 2. override `@eslint/config-array` / `@eslint/eslintrc` onto `minimatch@10` → the path moves, the
      package stays in the tree, advisory unchanged; 3. **upgrade ESLint 9 → 10** (which drops the eslintrc machinery and minimatch@3) → blocked UPSTREAM,
      not by us. Our own side is ready: the repo is already on flat config, the root config lints clean
      under ESLint 10, and all four plugins' peer ranges allow it. But `eslint-plugin-react@7.37.5` — the
      latest published version, pulled in by `eslint-config-next` — calls `context.getFilename()`, an API
      **removed** in ESLint 10, and crashes on plugin load. Open upstream issue, no fix released:
      https://github.com/vercel/next.js/issues/89764 (same stack: Next 16.1.6+, ESLint 10, React 19).
      **Decision (lead):** stay on ESLint 9; do NOT apply the `@eslint/compat` `fixupPluginRules` shim — that
      is a wrapper around a broken third-party plugin, not a fix, and not worth taking on for a DoS in a
      lint-time glob expander that no request path reaches. **Revisit when `eslint-config-next` ships an
      ESLint-10-compatible `eslint-plugin-react`** — watch the issue above.
      `4d20bd705` records **GHSA-mh99-v99m-4gvg** as an advisory allowlist entry, not a hidden dismissal:
      it expires and the registry audit fails again unless its review-date gate is renewed deliberately.
      Full CI passed at `8393cb4f5`. Revisit by the allowlist review date or when the upstream
      `eslint-config-next` compatibility issue is fixed.

- [x] **G-4 DONE 2026-07-27 (`976c59bbf`) — 570 probes, 114 routes × 5 roles, zero breaks.**
      Redirects were not followed, and this was not a status-code count: every one of the 134 `200 OK`
      bodies was re-fetched and scanned for error-boundary markers, because a 200 that renders a crash is
      exactly the failure this walk exists to catch. **No credential was created, changed or reset** — the
      existing operator smoke fixture's cookies were read, nothing was written, and every artifact was
      grepped for the session cookie name before being committed.
      Proven live: the patient wall refuses doctor pages; the C-4 admin gate admits only `global_admin` to
      `/app/admin/*`; all 26 legacy `/app/doctor/admin/*` and `/app/platform/*` paths redirect in exactly
      **one** hop.
      **Left open, honestly:** 26 dynamic-id routes were not rendered (minting ids risks probing another
      tenant's row), server actions are out of reach for a GET-only walk, and client-side failures are
      invisible to it. `/app/patient/diary/lfk/journal` (#1032) therefore stays **unverified, not cleared** —
      it returned 200 only because the owner's test patient has zero LFK complexes, so execution returns
      early and never reaches the failing join, which lives in a server action.
      **For the owner:** `clinic_admin` and `doctor` came back byte-identical on all 114 routes. That may be
      the intended capability model, but he has said a clinic admin needs a clinic-wide schedule of his own
      (#1028), so it is flagged rather than assumed correct.
      **STATUS 2026-07-26 afternoon: TEST is UP and the walk RAN. Blocked on ONE thing — session cookies.**
      Deploy took three attempts; each failure was a defect in the TOOLING, never in the product: 1. the closure replayed a superseded constraint and choked on a legitimate telemetry row — fixed
      `2ea3cfef2`, proven by reproduction on a throwaway DB; 2. the boot guard read `information_schema.columns`, which is PRIVILEGE-FILTERED, so it mistook
      "the probe's role has no grant" for "the column is missing" and refused to start a healthy app —
      fixed `f132af20c`, proven with the exact role that produced the false alarm; 3. last night's 0244 registered `app_base_url` for audience `public` and thereby OVERWROTE the
      `server`-audience row (the unique index is `(key, scope)`, audience is not part of it), blinding
      the integrator accessor — fixed `522e7976f`, with both directions of the widening pinned.
      Deploy also **lied**: it printed "TEST units are left RUNNING and healthy" while all five were down.
      That is worse than the outage, because an operator believes it. Recorded as taskdb **#1016**.
      **Verified landed on TEST:** patient mark-read (`read_at` UPDATE), reminder done/snooze/skip
      (`reminder_journal` INSERT on 5 columns), treatment-program item writes (UPDATE on 3 tables).
      Those are the two grant mines found this morning — both now genuinely applied by a normal deploy.
      **Walk result (570 probes): 15 OK, 540 REDIRECT, 15 LOGIN-PAGE-AS-200 → 552 non-OK.** Every role
      behaves as anonymous. This is NOT page breakage: the deploy switched session revocation to a
      monotonic epoch, so every cookie in `/run/bersoncarebot/saas-smoke.fixture` (minted 2026-07-25 22:16)
      is now invalid. **The harness earns its keep here** — the same 570 probes the night walk called
      "570/570 fine" are correctly reported as failures.
      **Same single cause makes the deploy's own mandatory product smoke red (17/21): every failure is a
      307 or a 401.** Do NOT hunt product bugs in that smoke until the fixture is refreshed — they are
      session failures wearing a product-failure costume.
      **Blocker:** refreshing the fixture means minting sessions, and the only tool for it
      (`regenerate-saas-smoke-fixture.mjs`) sets password hashes on real accounts. Owner authorised his own
      three accounts (global admin, the Точка Здоровья doctor, and his client record) and the client was
      given e-mail `kinesiospace@gmail.com`; config written outside the repo, existing hashes backed up
      for rollback. Details and the standing danger of that script: taskdb **#1017**.
      Harness built and proven on DEV: `docs/_TODO/SAAS_FOUNDATION/scripts/walk-app-pages-no-redirect.mjs`
      (`redirect: "manual"`, GET-only, cookies never written to disk). Redirect trap reproduced:
      `/app/doctor/schedule` as `public` → **307 → /app**, recorded as REDIRECT, not OK. 26 dynamic-segment
      paths are listed as skipped, not silently dropped.
      **🔴 The walk is GET-only, so it proves pages LOAD — it does not prove anything WORKS.** Both
      privilege defects found this morning break on a button press, not on page load, and a GET walk would
      have reported both surfaces green. A click-through under the patient role is required on top of the walk.
      **Preconditions found by a read-only sweep before deploying (each is the same class as F-4 —
      an orphan `deploy/postgres/*.sql` that no closure runs, so `deploy-test.sh` never applies it):** - `patient-support-mark-read-grant.sql` — F-4. Wired in `7e0bf0a83`. - `patient-write-grants-role-pool-mismatch.sql` — patient INSERT on `reminder_journal`, UPDATE on the
      three `treatment_program_instance*` tables. **Never applied anywhere, not even by hand on DEV** —
      reminder done/snooze/skip and treatment-program item completion 500 with 42501 today. In flight. - ~~`patient-media-playback-telemetry-accessors.sql` — wired only into PROD~~ **REFUTED on
      re-verification.** It IS applied on TEST — reached by `\ir` from
      `deploy/postgres/test-strict-rls-finalizer.sql` (commit `0ee8418ac`), which
      `apply_test_strict_rls_finalizer()` runs inside the same closure. The sweep's `grep <basename>`
      could not see an `\ir` include, and its description of the file's contents was wrong too.
      **Lesson for the next sweep of this class: grep for the basename AND follow `\ir` includes** —
      a file can be wired without any shell script naming it.
      Separate drift recorded, not acted on: on this one DEV is the STALE side — it still has direct
      SELECT for `app_patient`/`app_staff` on the four raw telemetry tables that TEST has already
      revoked in favour of a sealed definer accessor (`saas-system-health-diagnostics.sql:178-190`).
      **Verified clean by the same sweep** (so the coverage is known, not just the hits): journal integrity
      246/246 tags↔files after `2423509cc`; `d3-4-bootstrap-base-login-read-grants.sql`,
      `phase4-force-rls-cutover.sql`, `u9a-platform-settings-role.sql`,
      `specialist-owner-provisioning-rls.sql`, `c5a-platform-operations-runtime.sql` all genuinely wired;
      migrations 0243/0244/0245 pending-but-correct, they apply on the next ordinary deploy.
      Unexplained and judged inert, recorded rather than dismissed: `app_owner|org_brand_revisions|SELECT`
      exists on DEV, on TEST it does not, and no committed file grants it.
      **Related TEST-only migration evidence:** SaaS billing foundation `53dd848c2`, then audit-block closure
      `f773c5d8c`, closed all five audit defects. Migration 0259 was executed against the real TEST schema
      inside a rolled-back transaction; an injected active trial proved the trial-vs-manual discriminator.
      This is evidence for the release/process gate, not a claim that G-4's GET-only route walk proves billing.

## Done tonight (evidence)

- [x] TEST restored after the deploy left all five units down — root cause and fix `aae0b3a4c`.
- [x] Global-admin settings page — grant moved into the closure where it survives deploys, `80cc09abe`.
- [x] Two 500s were a missing PRINCIPAL, not a missing grant — `19f52fed2` (my diagnosis was wrong; the
      worker refuted it with PostgreSQL's own logs).
- [ ] Session-revocation code restored and finished — `12e263e63` (unproven against a DB).
  ПРЕЕМНИК 27.07: C-1's live mechanism is `988f0decd`, proven against a DB; see C-1 above.
- [x] Unmerged branches reconciled — no side branch explains any broken page.
- [x] Pre-production list opened — `docs/_TODO/PRE_PRODUCTION_TODO.md`.

## H. Разблокировано ответами владельца 26.07 — это РАБОТА, а не вопросы

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

Владелец закрыл висевшие развилки. Каждая строка ниже — задача к исполнению; вопрос по ней **закрыт**,
повторно не поднимать. Правила целиком: [`OWNER_PRODUCT_RULES.md`](../ARCHITECTURE/OWNER_PRODUCT_RULES.md).

- [x] **H-1 (#848 SCH-G5) Слоты по правилу владельца** — audited and pinned, no fix was needed. Недельный
      график = дневной с автоповтором и только там, где настроен; дневной переопределяет недельный; нет
      ни одного — **записи нет** (никаких умолчаний). `c71eab636` audited the actual production
      entrypoint (`buildSlotsForContext`/`computeSlotsInternal` in `service.ts`) against exactly this
      rule and found the engine already implements it — weekday fallback dates to the original engine
      (`23e11e5eb`, 2026-05-29), per-date-override-wins to `d5c246bc6d` (2026-06-12), both pre-dating
      tonight's ruling. No "default schedule" fallback path exists anywhere in
      `modules/booking-scheduling/` (checked directly). Added 3 tests at the service level pinning all
      three branches of the rule, including the no-schedule-at-all → zero-slots case. 10/10 tests re-run
      clean during this reconciliation.
- [ ] **H-2 (#913) Что видно в уведомлении.** Запись и напоминания о занятиях — **открыто, как было**;
  личный чат — только «новое сообщение от <имя>»; рассылка — тема открыто, содержание при переходе.
  ИЗМЕНЕНО 27.07 для рассылки: `fcd956395` восстановил полное тело в
  `fanOutBroadcastEmail.ts` и `deliveryJobs.ts`; действующее правило владельца —
  `OWNER_PRODUCT_RULES.md` §15: «текст открыто, как есть».
  **Проверено 26.07: только решение, кода нет.** Строка «новое сообщение от» нигде не встречается в
  `apps/webapp/src`/`apps/integrator/src` (прямой grep). taskdb #913 подтверждает: статус `blocked`,
  решение записано в заметке, но реализации нет.
  ~~✅ **СДЕЛАНО 27.07** (`298c025d7` → correction `e1c6f62a1` → correction `d99c72d9d`; полный CI зелёный,
  9470 тестов).~~ Реализация рассылки из этих коммитов вытеснена `fcd956395`.
  **Личный чат:** было — текст сообщения до 500 символов плюс описания вложений; стало — только
  «новое сообщение от <имя>» и ссылка, во всех четырёх каналах (пуш, Telegram, MAX, почта). Хелпер
  `previewText`, который резал и отправлял текст, удалён — живых вызывающих не осталось.
  ~~**Рассылка:** тема и ссылка, тело не уходит. Включая SMS — первый исполнитель вывел SMS из-под
  правила НАМЕРЕННО и переименовал тест, чтобы это узаконить («sms keeps its existing full-content
  rendition»); правило владельца каналов не исключает, исключение снято.~~
  **Запись и напоминания о занятиях — байт в байт не тронуты.** Это половина правила, которую легче
  всего сломать по инерции; проверено сторожевым тестом и диффом по всем трём коммитам.
  **Имя отправителя** — единственное живое содержимое уведомления, поэтому пропущено через фильтр:
  структурное ФИО → отображаемое имя → нейтральное слово. Телефон, почта и сырой идентификатор
  отбрасываются в ОБЕ стороны. Без этого правило приватности вынесло бы наружу телефон пациента
  вместо текста — второй аудит поймал именно это.
  **Контракт между приложениями** чуть не сломали: поле имени сделали обязательным на подписанной
  ручке интегратор→вебапп, из-за чего старый интегратор получал бы 400 на каждый ответ врача.
  Сделано необязательным с нейтральным запасным значением, покрыто тестом на старый payload.
  **ОСТАЛОСЬ ЗА ВЛАДЕЛЬЦЕМ (4 вопроса, taskdb #913 follow_up):** врачебный админ-чат в Telegram
  (пересылает сообщение пациента целиком — «уведомление» или «сам чат, где врач работает»); картинка
  рассылки (уходит целиком в Telegram и в письмо); уведомление о заявке (несёт имя пациента и 200
  символов жалобы, в §2 такого вида нет); подпись врача при ответе из бота берётся из имени его
  Telegram-профиля, а не из ФИО в системе.
- [x] **H-2: оставшаяся половина — уведомления личного чата.** `298c025d7` / `e1c6f62a1` /
      `d99c72d9d` остаются действующим доказательством для чата: без текста и превью, только факт,
      дата-время и ссылка по `OWNER_PRODUCT_RULES.md` §22. `fcd956395` не отменяет эту половину.
- [x] **H-3 (#1018) «Отложить» и «пропустить» у пациента** — через узкую служебную процедуру
      (`SECURITY DEFINER`), НЕ грантом на таблицу. Владелец подтвердил, что это стандартная практика.
      **Наполовину сделано.** `699604a8e` дал `reminder_occurrence_history` пациентскую RLS-ветку — это
      чинит ТОЛЬКО «выполнено» (`recordDone`), которое до этого 404-ило вместе с двумя другими. «Отложить»
      и «пропустить» (`recordSnooze`/`recordSkip`) по-прежнему нужен либо `UPDATE`-грант, либо (per
      владельца) отдельная `SECURITY DEFINER`-процедура — taskdb #1018 держит статус `doing` именно с
      этим открытым вопросом. Не закрыто.
      ✅ **ЗАКРЫТО И ДОКАЗАНО ЖИВЬЁМ 27.07** (`170eddc7c`, миграция `0253`, деплой
      `deploy-test-20260727T033946Z`). Две узкие `SECURITY DEFINER`-процедуры
      (`app.patient_snooze_reminder_occurrence`, `app.patient_skip_reminder_occurrence`), владелец
      `app_owner`, `EXECUTE` только `app_patient` — ровно решение владельца, НЕ грант на таблицу.
      Проверка под настоящей ролью: `SET ROLE app_patient` → обе процедуры зовутся, при отсутствии
      принципала возвращают пусто (fail-closed), а прямой `UPDATE reminder_occurrence_history` —
      `permission denied`. Гейт деплоя: `76/76 secdef functions pinned`.
      Независимый аудит (кросс-провайдер): предикат владения держится под BYPASSRLS; мост
      `platform_users.integrator_user_id` проверен живьём как один-к-одному (UNIQUE, 125 непустых /
      125 различных), пациент не может его перенаправить; динамического SQL нет; границы snooze 1–720
      минут совпадают со всеми тремя валидаторами прикладного слоя; `recordDone` побайтово не тронут.
      **Открытый ВОПРОС владельцу, не работа:** те же методы зовут ещё две подписанные интеграторские
      ручки бота под bootstrap-принципалом — они были сломаны и ДО этой правки (`UPDATE` на таблице не
      было ни у одной роли, кроме `app_staff`). Строка плана говорит «у ПАЦИЕНТА», поэтому скоуп не
      расширялся. Нужны ли те же кнопки в боте — решает владелец (taskdb #1018 follow_up).
- [x] **H-4 (#818) Убрать пять mock-подтверждений оплаты** вне dev/test. Владелец: «да».
      **Проверено — работы не было.** Все пять `*/payments/mock-complete/route.ts` (`booking/memberships`,
      `booking`, `booking/products`, `booking/public`, `booking/public/products`) не содержат ни одной
      проверки `NODE_ENV`/`isProduction` (прямой grep по каждому файлу). Решение владельца есть, кода нет.
      ✅ **ЗАКРЫТО 27.07, полный CI зелёный** (10 919 тестов, 0 падений; единственная красная строка — известная
      уязвимость в dev-инструментах, #1014, решение владельца «деплоим с ней»). `15ad7ba6f` — пять способов подтвердить оплату без банка закрыты вне разработки, гейт fail-closed.
- [ ] **H-5 (#805) Публичная запись без входа** — открыть ссылку на TEST как посторонний, создать записи
      (владелец: «конечно, можно и не одну»), проверить правильную клинику и отсутствие чужих данных.
      **Проверено — разрешение получено, само действие не выполнено.** taskdb #805 остаётся в статусе
      `blocked`; никаких новых артефактов (скриншотов, логов запроса) с сегодняшней датой не найдено.
      Замечу отдельно: этот пункт технически НЕ зависит от блокера G-4 (протухшие session-куки) — он про
      анонимный поток, сессия не нужна вообще.
- [x] **H-6 (#1038) Критические тревоги глохнут на 24 часа** посреди аварии: каденция владельца
      (сразу → +1 ч → каждое утро красным) сделана только для двух тем; «база лежит» и «пробой изоляции
      клиник» пишут один раз и молчат. Это доделка уже принятого решения (#950 P3), не новый скоуп.
      ✅ **ЗАКРЫТО, проверено независимо 27.07 против кода, а не по отчёту** (`def478961`).
      Глушилка снята: плоский 24-часовой dedup заменён на тот же жизненный цикл `operator_incidents`
      (`openOrTouchCriticalAlertIncident` / `claimIncidentAlertIfDue` / `resolveStale...`), что был
      построен для `outbound_delivery_provider`, и теперь он распространён на ВСЕ критические темы —
      «база лежит», «пробой изоляции клиник», мёртвые heartbeat. 7 тестов перепрогнаны независимо:
      воспроизведение молчания, эскалация T0/+1ч, отсутствие звонка каждые 5 минут, остановка после
      resolve. Ничего реально не отправлялось — релей замокан на HTTP-границе.
      **Как именно легли три ноги каденции, дословно — чтобы не было иллюзии:** T0 и +1 час это
      настоящие критические вызовы (`phase: "initial" | "one_hour_repeat"`). Третья нога, «каждое утро»,
      реализована НЕ отдельным красным вызовом, а утренней сводкой: `digestHealthSnapshotLines.ts:50`
      ПЕРЕСЧИТЫВАЕТ критические сигналы из живого снимка (`classifyCriticalHealthSignals`), а не читает
      таблицу инцидентов. Поэтому сводка физически не может показать зелёное, пока авария идёт — это и
      был корень июльского провала (#950: «дайджест слал зелёное» сутки). Так же устроена и
      привилегированная тема: `outboundProviderIncidentCadence.ts:9-11` прямо документирует, что после
      +1ч «daily digest as the only repeat».
      **Если под «каждое утро красным» имелся в виду ОТДЕЛЬНЫЙ повторный вызов, а не строка в сводке —
      это не сделано ни для одной темы, и тогда пункт надо открыть заново.** Формулировку не
      переинтерпретирую молча.
- [x] **H-7 (#1040) Заменить предупреждение утверждающим гейтом** в `c5a-platform-operations-runtime.sql`:
      пропуск закрытия прав сейчас виден только в консоли, ничем не проверяется, деплой выходит 0.
      Там же: гейт `assert_app_owner_secdef_table_grants_complete` пинит **количество**, а не состав —
      два компенсирующих сбоя переноса владельца проходят незамеченными.
      ✅ **ЗАКРЫТО 27.07, полный CI зелёный** (10 919 тестов, 0 падений; единственная красная строка — известная
      уязвимость в dev-инструментах, #1014, решение владельца «деплоим с ней»). `005db0710` — предупреждение заменено утверждающей проверкой: пропуск закрытия прав теперь FATAL, а не строка в логе, которую никто не читает.
- [x] **H-8 Способы входа — гибко настраиваемые, ничего не вырезать** — то же требование, что и E-1, и
      закрыто той же живой проверкой. Владелец 26.07: «пока делаем гибко настраиваемыми через глобал
      админку все механизмы. ничего не вырезаем из кода. С юристом решаю.» `PlatformAuthChannelPolicySection.tsx`
      (`/app/admin/auth`) даёт переключатели для email/SMS/Telegram/MAX плюс отдельно Google/Yandex OAuth
      (Google сейчас выключен — ждёт юриста, #1035). Ничего не удалено из кода. `90cd8cf22` (E-1) уже
      доказал живьём, что эти тумблеры блокируют вход на сервере ДО отправки/сессии, не просто прячут
      кнопку. Отдельной новой работы под H-8 не требуется.

**Осталось за владельцем, не наша работа:** #881 (отзыв старых ключей — он отзовёт сам, живём с этим),
#899 (ответственный за ПДн и юрист), #1035 (юрист по 149-ФЗ), #1039 (остаток абонемента уходит в минус —
это ВОПРОС, в плане владельца такой строки нет).

## НЕ СДЕЛАНО

Открытые пункты и их честный остаток (эта сводка не добавляет новых чекбоксов):

- **A-1:** stages 2–3 — отдельный владелец для 28 definer-функций и структурный allowlist; группы A/C
  privilege sweep закрыты, B не реализована, D частична.
- **A-2:** отдельная публичная read-model/роль и остальные названные поверхности.
- **A-4:** rebuild `platform_users` и связанных identity-сurface.
- **B-1:** удалить старый deploy path и создать запрошенную отдельную root-capable identity без внешнего
  доступа; выполнен только split runtime OS identities.
- **B-3, B-4:** разделение секретов по потребителям и key IDs для ротации.
- **C-3:** fallback каналов доставки OTP.
- **D-1:** owner-facing routing matrix и решение по каждому типу уведомления; e-mail relay и outage fix —
  только закрытые части этого более широкого пункта.
- **D-3:** PWA/push глобального администратора.
- **E-2, E-3:** retirement plaintext bot token и предупреждение messenger-only accounts до pre-production.
- **F-3:** scheduled messages.
- **H-5:** независимый анонимный TEST click-through публичной записи.
