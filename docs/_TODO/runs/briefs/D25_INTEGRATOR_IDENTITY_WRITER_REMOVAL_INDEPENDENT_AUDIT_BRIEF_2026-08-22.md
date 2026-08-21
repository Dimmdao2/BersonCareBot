# D25 — independent audit brief: integrator stops writing canonical identity/contacts

**Role:** `auditor-live` (independent). **You are NOT the author of this candidate.**
**Canon you must read and follow:** `AGENTS.md` — routing header first
(`grep -n "^## \|^### " AGENTS.md`), then §5 (Clean Architecture / one shared chokepoint),
§10 + §10a (test execution policy; a test proves BEHAVIOR, never source text/строки/counts),
§10b (test authoring), §24.4 (**«тест или взгляд»** classification), §24.5 (blind behavior audit),
§24.6 (findings are a gate, not a source of scope).
Also: `docs/ORCHESTRATION_BINDINGS.md`, `.cursor/rules/*.mdc` matching the touched paths.
Code search first, blind grep second: `node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`.

## Candidate under audit

- clone: `/home/dev/dev-projects/bcb-wt-d25-remove-integrator-identity-writers-20260821`
- branch: `wt/d25-remove-integrator-identity-writers-20260821`
- product commit: `ef42f0129`; candidate head after merging current `feat/doctor-ui-rebuild`: `adba7f1ab`
- diff to review: `git diff origin/feat/doctor-ui-rebuild...HEAD` (10 files, +335/−940)
- author: Sonnet 5 / high worker. Its report is an INPUT SIGNAL ONLY, never evidence.

## Authority (owner plan — quote these lines, do not paraphrase)

`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`:

- **Р-D25 (владелец, 31.07)**, line 282: «интегратору остаётся только доставка входа, а создание
  учётки, доверие к телефону и синхронизация личности — вебаппу».
- **D25 checkbox**, line 1134: «D25 — идентичность: интегратору остаётся только доставка входа».
- **D15b/2 checkbox**, line 595: «достижимые `writePort.ts` `user.upsert` →
  `writeIdentityAndPreferencesDirect` и `user.phone.link` → `applyMessengerPhonePublicBind` всё ещё
  записывают каноническую идентичность/контакты из интегратора» … «После удаления двух оставшихся
  writer-путей живая проверка обязана гонять ДВА вебхука, а не один: первый доставляет вход и
  привязывает канал через webapp-owned seam, второй передаёт подтверждённый контакт; интегратор сам
  не создаёт учётку и не доверяет телефону».
- **Р-D26 (владелец, 31.07)**, line ~285: the integrator must not decide or execute an account merge.
- Scheme: `docs/…/IDENTITY_AND_MERGE_SCHEME.md` (§2d write-engine vs port; §5.2/§5.2a/§5.8 merge rules).

## Step 0 — «тест или взгляд» classification (MANDATORY FIRST OUTPUT)

Before reading any existing test, write the kill-set: every named way this candidate could be wrong,
each classified per §24.4 as **взгляд** (one-off removal/state quality — prove by reading the final
state, `rg`, AST, DB introspection, one-off runtime check) or **тест** (repeatable behavior — prove by
a behavior test). Do not write tests asserting absence of strings/imports/SQL text — §10a forbids it.
Only after the kill-set exists may you read the candidate's tests.

## Part A — «взгляд»: is the removal real and complete?

1. Is there any REACHABLE path left by which the integrator writes canonical identity or contacts
   (`platform_users`, `user_channel_bindings`, `user_contacts`, notification topics) other than through
   an exact named root? Enumerate call graphs, not file names. Name every remaining writer, or state
   the enumeration is empty and name exactly how you searched (§«нет без списка мест, где искал»).
2. Are the deletions (`writeIdentityAndPreferencesDirect`, `mergeCandidatesDirect.ts`,
   `repos/messengerPhonePublicBind.ts`, `directPublic/writePort.ts` entries) truly caller-free, and did
   anything that a live person still depends on go away with them? Trace the consequence to the human:
   what does a doctor/patient/support reviewer no longer get?
3. `packages/platform-merge` must remain intact for the webapp. Confirm the webapp side is unchanged.
4. Architecture: does the new path respect §5 (single chokepoint, no new wrapper/gate/duplicate)? If
   the candidate introduced a second way of doing the same thing, that is a finding.

## Part B — «тест»: behavior contracts that must survive

Reuse existing suites where they already cover the class; write missing acceptance tests ONCE (§24.5).
Named risks the audit must settle either way:

1. `user.phone.link` external result contract: `userPhoneLinkApplied` / `phoneLinkReason` /
   `phoneLinkIndeterminate`. In particular: is a **transient DB failure** still reported as
   *indeterminate* (retryable), or did it silently become a definite refusal? Prove by behavior.
2. Conflict path: refusal stays externally neutral (no enumeration), fail-closed, AND still produces
   ONE durable, repeat-aware `admin_audit_log` / `messenger_phone_bind_blocked` case for the human
   reviewer. The candidate now writes it only when an organization is ambiently known and with a
   single candidate id instead of both. Decide, against Р-D26 and the manual-merge review need,
   whether either is a reachable regression of owner requirement (finding) or an accepted narrowing
   (recommendation / owner question — §24.6, do NOT turn a preference into work).
3. `user.upsert`: bootstrap and organization/integrator principals both reach the same exact named
   root; no relation transaction, no direct-writer fallback, no integrator-side merge decision.
4. Merge ambiguity: the old code deferred ambiguous merges. Prove the new path cannot silently lose
   or auto-decide such a case.
5. Fault injection ONCE per independent failure class (§24.5): a green test that stays green when you
   break the product is not evidence. Revert every temporary product change.

## Part C — live two-webhook proof on the candidate (required by D15b/2 before landing)

The plan requires a LIVE check running **two webhooks**: the first delivers login and binds the
channel through the webapp-owned seam; the second passes the confirmed contact. The integrator itself
must neither create the account nor trust the phone.

- Run it against **named DEV** (`bcb_webapp_dev`) with an **existing owner/dev account** —
  see memory recipe `dev-doctor-login` and `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`.
- **Forbidden:** fixtures, surrogate/synthetic clinics or users, disposable DBs, direct SQL instead of
  application behavior, TEST or PROD, deploy, migrations `--execute`/apply, push, full CI.
  In-memory e2e fixtures do NOT count as this proof.
- Do not occupy shared dev ports if another process holds them: use an isolated integrator process on
  a free port. If the proof genuinely cannot be run in this turn, report Part C as **BLOCKED** with the
  exact commands and the exact obstacle. Never report a proof you did not run.

## Hard limits

- You do NOT fix product code. Acceptance tests and the audit artifact are your only lasting output;
  every temporary production break is reverted before the turn ends (§24.3, §24.6).
- No migration authoring, no privilege changes, no `migrate-dev.sh --execute`, no deploy, no push,
  no full CI, no TEST/PROD, no fixtures, no disposable DB.
- A finding exists only for a reachable violation of the owner requirement, a mandatory repo rule, or a
  concrete regression with impact and evidence. Style, alternative architecture and speculative
  hardening are NOT findings (§24.6).
- **One turn only.** Commit anything you want kept BEFORE the turn ends; never end the turn waiting on
  a background process — run long commands in the foreground, or detached with `setsid` and name the log.

## Deliverable

1. The kill-set with per-item classification, and per item: verdict + exact evidence (path:line, command
   with its real output, test name, PNG/log path).
2. Explicit verdict: **PASS TO LAND** / **FAIL** with the bounded corrections named, and Part C stated
   separately as PASS / FAIL / BLOCKED.
3. One ready-to-paste verdict row for `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` in the exact
   format the file already uses (candidate SHA + branch | how it was audited + run record path |
   authority | verdict text).
4. `NOT DONE:` section, even if empty.
