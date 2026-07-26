# Night plan 2026-07-26 — every owner instruction from this evening, as a checklist

**This file is the single source of "todo" and "done".** Not the chat, not any audit report. An auditor
finding that has no line here is a QUESTION for the owner, never work (see `docs/ORCHESTRATION_BINDINGS.md`).

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
      **Decision — Option C, staged; matches the owner's «все 1+2+3»:**
      1. **A first, alone (safe default, zero deploy risk):** extend the deploy gate to pin the anon-reachable
         definer count for `bersoncarebot_test` (28) and `saas_telemetry_owner` (1), plus a required-grant
         allowlist for the 7 tables — mirroring the existing 27-row `app_owner` VALUES pattern. Purely additive
         assertion; cannot leave TEST half-configured.
      2. **Then the owner split:** a narrow `NOLOGIN NOBYPASSRLS` role owns the 28; grant it exactly the 7
         tables' needed privileges; `system_settings` (the one FORCE-RLS target) gets a **policy**, not bypass.
         Land **WARN-not-FATAL first**, flip to FATAL after clean deploy cycles — the repo's own precedent
         (`assert_specialist_owner_provisioning_seam_pinned` started that way), and the guard against repeating
         the 2026-07-24 mid-deploy outage.
      3. **Then make the gate structural, not a count:** every anon-reachable definer's owner must be in a
         reviewed allowlist, and the DB-owner role must own **zero** of them. Pure `pg_catalog` introspection —
         no AST machinery needed. This closes the gap for FUTURE functions, not just today's 29.
      Named sources behind the shape (not invented): PostgreSQL `CREATE FUNCTION` on SECURITY DEFINER owner
      privileges and `search_path`; `ddl-rowsecurity` on BYPASSRLS/FORCE and on documented covert channels;
      Supabase's schema-scoped `supabase_auth_admin`; PostgREST's private `basic_auth` schema + scalar-returning
      definer accessor. Both shipped systems scope the definer owner narrowly and never reuse the table-owning
      or bypass-everything role.
      Not started — sequenced after G-4 (deploy + page walk).
- [ ] **A-2 (C2) Public read surface.** Owner: study which actions genuinely need it; do not serve public
      data under system roles. External research says a policy over a mixed table is NOT enough (RLS is
      row-granular; covert channels are documented by PostgreSQL itself) — the shape is a **separate public
      projection** plus a dedicated read-only role. Material already in repo: `app_config_reader` (written,
      never applied to TEST), publication flags (`is_published`, `is_active`, `public_widget_visible`),
      `app.resolve_public_organization_slug`, `c4d_platform_library_read`.
- [ ] **A-3 (C2/#1004) Anonymous booking — ALWAYS prove contact ownership.** Owner ruling: «всегда просить
      код или вход». Today: match by phone only, global across clinics, no proof, mints
      `patient_phone_trust_at`, leaks existence three ways (returned user id, confirmed-vs-awaiting-payment
      divergence, 403 for blocked clients) and consumes the victim's package. Uniform response + timing
      required (ASVS 6.3.8, CWE-204). No staff merge queue (see standing rules).
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

- [x] **A-5 first pass, SUPERSEDED — its gate was false assurance.**
      The independent auditor kept all four assertions green with a live instance of the bug present, and the
      headline assertion stayed green when the fix it protects was reverted. Two causes: the establisher regex
      matches a guard's own DEFINITION site (17 guards live under `src/app`), so merely *importing* a guard
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

- [x] **A-5 first pass (superseded above)** (`bf7e951f7`).
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
- [ ] **A-6 (#1007) Cross-tenant writes to shared dictionaries.** Any clinic's doctor can mutate a global
      dictionary for every tenant. Check the same class on all platform-owned catalogues.

## B. Security — host, secrets, database access

- [ ] **B-1 (A1) Split OS identities.** Owner authorised configuring users on THIS box under deploy rights.
      Runtime account with no sudo and **no `docker` group** (docker membership is root by itself and
      survives any sudo trim); deploy stays separate; delete the dormant old deploy path. Also: create a
      root-capable account for me with **no external access** (no SSH, no password login).
- [ ] **B-2 (A2) Postgres host trust.** Narrow `local all all peer`; superuser only via an audited
      break-glass path. Moving the DB to its own host is the fuller answer — private network + TLS with
      certificate verification, never an SSH tunnel.
- [ ] **B-3 (B1) Split the five secrets by consumer** now; a secret store when there is more than one host —
      the owner tied this to B-2 himself.
- [ ] **B-4 (B2) Key ids so signing keys can rotate** without a forced global logout.

## C. Authentication

- [ ] **C-1 (D1) Session revocation.** Owner confirmed: idle 12 h staff / 30 d patient, absolute ceiling 7 d
      / 90 d. Parked code restored and finished (`12e263e63`), NOT yet proven against a database, NOT yet
      adversarially audited. Conflicting older record #970 must be marked superseded.
- [ ] **C-2 (D2/D3/D4) OTP hardening.** Rate limiting on six routes (per-IP and per-account, separate
      thresholds, decaying lockout — a limit that locks out a real clinic is a defect); atomic attempt
      counter; purpose binding. NIST SP 800-63B, OWASP ASVS V6.
- [ ] **C-3 (#1005) Delivery-channel fallback.** Phone entered → SMS if enabled → web-push if subscribed →
      e-mail if bound. NIST 800-63B treats SMS as restricted and expects an alternative. Two hard edges:
      uniform response/timing so it cannot be used to test whether a phone has an e-mail; and a code
      delivered to e-mail proves control of the E-MAIL — it must never stamp phone trust.
- [ ] **C-4 (D5) Admin allowlists → roles.** Remove the DB-resident allowlists that also confer admin;
      recipients derived from roles at send time; owner identity pinned in env.
- [ ] **C-5** Password change screen — exists nowhere today (#1000).

## D. Notifications

- [ ] **D-1 (D5) Routing by role + an owner-facing matrix**: per notification/error type choose push /
      e-mail / SMS. SMS is mechanism-only for now. Operational alerts get their own channel (the July
      SMTP-quota outage went unnoticed for a day because alerts shared a channel).
- [ ] **D-2** Support forms (patient + guest) currently send to Telegram ONLY and 503 without it — move to
      the configured channels **before** the messenger removal.
- [ ] **D-3** PWA + push for the global admin (pre-production list).

## E. Messengers

- [ ] **E-1** Cut Telegram from the RU build (legal) — and MAX too («MAX тоже нахер пока»). Order matters:
      support forms first, then the reversible runtime kill-switch, then code, then data. `telegram_state`
      is shared with MAX — with both going, it retires wholesale.
- [ ] **E-2** Bot-token plaintext in `system_settings` retires with the bot.
- [ ] **E-3** Pre-production: message the messenger-only accounts while the bots still work.

## F. Product / UI

- [ ] **F-1 (#1002) Dropdowns show the KEY instead of the label** — everywhere, since the beginning of the
      project. Must be solved once, in a shared primitive, with a gate so it cannot come back.
- [ ] **F-2 (#1003) Tariffs**: drop the mandatory "reason" on edit; make the quota settings human-readable.
- [ ] **F-3 (#964) Scheduled messages** — unblocked. Alarm icon + time replaces the first delivery tick;
      click to reschedule or cancel; pending messages last in the thread under a divider; collapsing later.
      ~3000 lines exist on `agent/ui964-20260722`; migration must be renumbered, `DoctorCommentsTab` was
      rewritten in feat.
- [ ] **F-4 (#988)** — REOPENED 2026-07-26 by the lead. Code fix `ad70a0da9` is correct and was proven live
      over HTTP (unread 2 → 1, the untouched conversation stays unread) — **but only on DEV, and only after a
      worker applied the required grant BY HAND.** Verified read-only on TEST: `app_patient` has SELECT and
      INSERT on `support_conversation_messages.read_at` and **no UPDATE**, and
      `deploy/postgres/patient-support-mark-read-grant.sql` is referenced by no closure at all
      (`grep -rn "patient-support-mark-read-grant" deploy/` → only its own header and prose in a sibling).
      So a normal `deploy-test.sh` never applies it and mark-read answers 500 / 42501 on TEST.
      **"Proven on DEV after hand-applied SQL" is not proven** — the same class as the repo's own trap «a grant
      written in a drizzle migration does not survive; runtime grants belong in the closure that owns the role».
      In flight: wire it into the closure the way sibling patient grants are wired, and extend the `assert_*`
      allowlist in the SAME change — the deploy pins an exact privilege set per login role and is FATAL mid-run
      on an extra grant (that is what took TEST down on 2026-07-24).
- [x] **F-5** — closed conversation renders read-only `ad70a0da9`: opens 200 with history and `readOnly`, the composer is not rendered, posting answers 409 `conversation_closed` instead of the rejected 404. Closed support conversation renders read-only — never "not found".
- [ ] **F-6** Clinic slug, public page and the booking screens (worker was stopped mid-flight; migration 0243
      and its `expected_secdef_count` 56→57 sit uncommitted).

## G. Process

- [ ] **G-1** Deploy writes a log to a file — tonight's outage had none.
- [ ] **G-2** Land the docs-only branches so the audit trail stops living on side branches; delete the
      remote branches already merged.
- [ ] **G-3** Mark #970 superseded by the owner's confirmed session numbers.
- [x] **G-5 Dependency advisories** — owner instruction 2026-07-26 «обновляй зависимости». Done as far as it
      goes, with one item deliberately left open and the reason recorded so nobody retries it blindly.
      Of the 12 advisories `registry-prod-audit` reported, **10 were already closed** by `bc41c566d` and
      `d60cb1222` (2026-07-23). Of the 3 live ones — all dev/build tooling, none in a production runtime
      dependency — **2 are fixed** in `6a793fb8c` by moving override floors that had gone stale by two days
      (both advisories were published 2026-07-24, after the last override bump): `postcss >=8.5.10 → >=8.5.18`,
      `minimatch@10>brace-expansion 5.0.7 → 5.0.8`.
      **The third cannot be fixed and the CI `audit` step stays red on it.** GHSA-mh99-v99m-4gvg,
      `brace-expansion@1.1.16`: the 1.x line is end-of-life (1.1.16 is its last release ever and carries the
      advisory) and the only consumer left is `eslint@9.39.4` itself, which depends on `minimatch@3` directly.
      **Three routes were tried and all failed — do not repeat them:**
      1. force 5.x into the `minimatch@3` slot → lint dies outright, `TypeError: expand is not a function`
         (5.x is not the CommonJS callable that 3.x requires);
      2. override `@eslint/config-array` / `@eslint/eslintrc` onto `minimatch@10` → the path moves, the
         package stays in the tree, advisory unchanged;
      3. **upgrade ESLint 9 → 10** (which drops the eslintrc machinery and minimatch@3) → blocked UPSTREAM,
         not by us. Our own side is ready: the repo is already on flat config, the root config lints clean
         under ESLint 10, and all four plugins' peer ranges allow it. But `eslint-plugin-react@7.37.5` — the
         latest published version, pulled in by `eslint-config-next` — calls `context.getFilename()`, an API
         **removed** in ESLint 10, and crashes on plugin load. Open upstream issue, no fix released:
         https://github.com/vercel/next.js/issues/89764 (same stack: Next 16.1.6+, ESLint 10, React 19).
      **Decision (lead):** stay on ESLint 9; do NOT apply the `@eslint/compat` `fixupPluginRules` shim — that
      is a wrapper around a broken third-party plugin, not a fix, and not worth taking on for a DoS in a
      lint-time glob expander that no request path reaches. **Revisit when `eslint-config-next` ships an
      ESLint-10-compatible `eslint-plugin-react`** — watch the issue above.
      Consequence to carry forward: `pnpm run ci` cannot be fully green until then. Everything else in the
      chain passes; the `audit` step is red on this one advisory alone.

- [ ] **G-4** Full deploy to TEST + the 114-page × 5-role walk, redirects NOT followed, plus DEV screenshots.
      **STATUS 2026-07-26 afternoon: TEST is UP and the walk RAN. Blocked on ONE thing — session cookies.**
      Deploy took three attempts; each failure was a defect in the TOOLING, never in the product:
      1. the closure replayed a superseded constraint and choked on a legitimate telemetry row — fixed
         `2ea3cfef2`, proven by reproduction on a throwaway DB;
      2. the boot guard read `information_schema.columns`, which is PRIVILEGE-FILTERED, so it mistook
         "the probe's role has no grant" for "the column is missing" and refused to start a healthy app —
         fixed `f132af20c`, proven with the exact role that produced the false alarm;
      3. last night's 0244 registered `app_base_url` for audience `public` and thereby OVERWROTE the
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
      an orphan `deploy/postgres/*.sql` that no closure runs, so `deploy-test.sh` never applies it):**
      - `patient-support-mark-read-grant.sql` — F-4. Wired in `7e0bf0a83`.
      - `patient-write-grants-role-pool-mismatch.sql` — patient INSERT on `reminder_journal`, UPDATE on the
        three `treatment_program_instance*` tables. **Never applied anywhere, not even by hand on DEV** —
        reminder done/snooze/skip and treatment-program item completion 500 with 42501 today. In flight.
      - ~~`patient-media-playback-telemetry-accessors.sql` — wired only into PROD~~ **REFUTED on
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

## Done tonight (evidence)

- [x] TEST restored after the deploy left all five units down — root cause and fix `aae0b3a4c`.
- [x] Global-admin settings page — grant moved into the closure where it survives deploys, `80cc09abe`.
- [x] Two 500s were a missing PRINCIPAL, not a missing grant — `19f52fed2` (my diagnosis was wrong; the
      worker refuted it with PostgreSQL's own logs).
- [x] Session-revocation code restored and finished — `12e263e63` (unproven against a DB).
- [x] Unmerged branches reconciled — no side branch explains any broken page.
- [x] Pre-production list opened — `docs/_TODO/PRE_PRODUCTION_TODO.md`.
