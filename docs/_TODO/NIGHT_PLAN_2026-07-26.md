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
- [x] **F-4 (#988)** — fixed `ad70a0da9`, proven live over HTTP (unread 2 → 1, the untouched conversation stays unread). Opening one chat marks EVERY conversation read. Land the scoping half only.
- [x] **F-5** — closed conversation renders read-only `ad70a0da9`: opens 200 with history and `readOnly`, the composer is not rendered, posting answers 409 `conversation_closed` instead of the rejected 404. Closed support conversation renders read-only — never "not found".
- [ ] **F-6** Clinic slug, public page and the booking screens (worker was stopped mid-flight; migration 0243
      and its `expected_secdef_count` 56→57 sit uncommitted).

## G. Process

- [ ] **G-1** Deploy writes a log to a file — tonight's outage had none.
- [ ] **G-2** Land the docs-only branches so the audit trail stops living on side branches; delete the
      remote branches already merged.
- [ ] **G-3** Mark #970 superseded by the owner's confirmed session numbers.
- [ ] **G-4** Full deploy to TEST + the 114-page × 5-role walk, redirects NOT followed, plus DEV screenshots.

## Done tonight (evidence)

- [x] TEST restored after the deploy left all five units down — root cause and fix `aae0b3a4c`.
- [x] Global-admin settings page — grant moved into the closure where it survives deploys, `80cc09abe`.
- [x] Two 500s were a missing PRINCIPAL, not a missing grant — `19f52fed2` (my diagnosis was wrong; the
      worker refuted it with PostgreSQL's own logs).
- [x] Session-revocation code restored and finished — `12e263e63` (unproven against a DB).
- [x] Unmerged branches reconciled — no side branch explains any broken page.
- [x] Pre-production list opened — `docs/_TODO/PRE_PRODUCTION_TODO.md`.
