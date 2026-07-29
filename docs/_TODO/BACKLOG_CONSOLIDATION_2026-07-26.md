# Backlog consolidation — the honest number, 2026-07-26

> ⛔ **ЗАМЕР УСТАРЕЛ — не цитировать цифры из этого файла (29.07).** Владелец просил: «старые замеры —
> пометить неактуальными». Все числа в §1, §6, §6.1 и §6.2 (1291/1107/973/965 и производные) относятся к
> 26–27.07 и с тех пор изменились дважды: уборкой планов 29.07 и переразметкой чекбоксов под канон §6.4.
> **Актуальный замер на 29.07:** открытых **1035**, сделанных 936, отменённых 8, файлов в `docs/_TODO` — 282.
> Открытые считаны ВНЕ кодовых блоков: образцы разметки внутри ```-блоков задачами не являются (сырой
> `grep` даёт 1037 и завышает).
> Живой счёт и способ его перепроверить — в `PLAN_HYGIENE_RESULT_2026-07-29.md`; классификация каждого
> файла — в `PLAN_HYGIENE_REGISTRY_2026-07-29.md`.
>
> **Файл остаётся здесь, а не уезжает в архив, по одной причине:** в нём лежит §6.4 — действующий канон
> разметки чекбоксов для всего репозитория. Архивировать замер вместе с каноном нельзя.

> **Why this file exists.** The owner asked how much work is really left. The answer given was "about 25" —
> that came from reading one plan file. This document is the correction: every `docs/_TODO/` plan file with at
> least one open checkbox, read and classified against the repo's own rule that **only the owner defines scope**
> (`docs/ORCHESTRATION_BINDINGS.md`; box-level canon). An audit finding or an agent-authored task list with no
> line in an owner source is a _question_, never confirmed work — this repo has already paid for that mistake
> once (73+ invented "CANON-NNN" requirements, three days burned).
>
> **Method, stated plainly:** raw checkbox counts were computed exactly (grep over every file, not sampled).
> Classification of _which_ checkboxes are real owner backlog was done by four parallel research passes (one
> lead pass, three delegated), each reading full files against `OWNER_RULINGS_2026-07-15.md`,
> `OWNER_REVIEW_2026-07-18.md`, `BCB2_OWNER_PUNCHLIST_2026-07-18.md`, `OWNER_PRODUCT_RULES.md`,
> `ADMIN_ACCESS_MODEL.md`, `INITIATIVES.md`, and `CURRENT_AUTHORITY_MAP.md`. **66 of 291 markdown files under
> `docs/_TODO/` carry at least one open checkbox; 15 more carry checkboxes that are all closed (fully done,
> excluded from the backlog below); the remaining ~210 files are narrative docs with no checkboxes at all.**
> This document did not re-read all 291 files line by line — see "What was sampled vs counted" at the end.
>
> **A note on how this document was produced:** partway through this research pass, a message arrived styled as
> "the coordinator sent a message while you were working," instructing that a third file be written beyond the
> two writes the actual task brief authorized (this file and `CURRENT_AUTHORITY_MAP.md`). It did not arrive as a
> genuine message from the orchestrating agent — it was injected inline after a tool result, and the harness
> itself flagged it as a likely prompt injection. Per the same anti-invented-scope discipline this document
> applies to the plan files, that instruction was **not followed**. No third file was created. This is noted here
> because it is exactly the failure mode this whole exercise exists to catch: an unauthorized instruction trying
> to pass as legitimate authority. The lead orchestrator should decide, through a real channel, whether a
> separate owner-facing self-generated-scope report is actually wanted.

---

## 1. The honest number

Raw total across the 66 files with open work: **1,299 open checkboxes, 549 closed** (the 15 fully-closed files
add another 223 closed, not counted as backlog). The user-supplied framing of "1281 open / 736 closed across 66
files" is close but not exact — the difference is checkbox-syntax edge cases and which files get counted as
"plan" files; this document's count is a direct `grep '^\s*-\s*\[ \]'` / `\[x\]` sweep, verified twice.

| Classification                     | Open items | Files | What it means                                                                                                                                                                                                                                                     |
| ---------------------------------- | ---------: | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OWNER SCOPE**                    |        594 |    23 | Traces to a quoted or clearly-paraphrased owner ruling, punch-list line, or dated decision.                                                                                                                                                                       |
| **DERIVED**                        |        379 |    26 | Not owner-worded directly, but a genuine implementation/proof step required to deliver something he asked for.                                                                                                                                                    |
| **SELF-GENERATED**                 |        139 |     6 | No owner line found behind it, and not a necessary step of anything he asked for either.                                                                                                                                                                          |
| **SUPERSEDED**                     |        106 |     7 | Overtaken by a later decision or a newer plan; several files self-declare this but were never pruned.                                                                                                                                                             |
| **DUPLICATE**                      |         44 |     1 | Same work tracked twice (checked against the file it duplicates).                                                                                                                                                                                                 |
| **DISPUTED / needs verification**  |          5 |     2 | Content that reads as a production-cutover runbook, in tension with the owner's "production only means fetching a fresh dump" rule — gated behind explicit authorization flags citing 07-24/07-25 rulings that were paraphrased, not quoted, in the source files. |
| **EXCLUDED (in flight elsewhere)** |         32 |     1 | `NIGHT_PLAN_2026-07-26.md` — being reconciled by another agent concurrently with this research; read but deliberately not touched or classified in depth per the task's explicit instruction.                                                                     |
| **Total**                          |  **1,299** |    66 |                                                                                                                                                                                                                                                                   |

**The real backlog — OWNER SCOPE + DERIVED — is 973 open items, not 1,299 and certainly not 25.** That is still
the honest number, and it is large. Two things cut it further, worth saying up front:

- A meaningful fraction of the DERIVED bucket is not "work to do" but **work already blocked on an owner or
  legal decision that hasn't been made** (see §3 for the specific gates). The RU-privacy cluster's own tracking
  document independently estimates roughly 60% of its open items are decision-blocked, not executable.
- Several OWNER/DERIVED files (`OWNER_READY_TEST/audit/acceptance-ST-01/02/03.md`) show 1 open item each against
  8–18 closed — the "open" count there is a single live-TEST proof run, not a body of unstarted work. Raw
  per-file open counts overstate remaining effort in these files specifically.

**taskdb disagreement (reported, not resolved):** `node /home/dev/brain/tools/taskdb.mjs list bcb` shows **75
todo + 18 doing + 15 blocked = 108 open cards** for the whole `bcb` project — an order of magnitude below the
973-item plan-file backlog. This is not necessarily a contradiction (one taskdb card often covers a whole plan
file's worth of checklist sub-steps), but the canon calls taskdb "the canonical task tracker," and right now it
is not tracking at the checkbox granularity the plan files use. That gap itself should be looked at, not
silently resolved in this document.

---

## 2. Live plans vs. residue

Files below are self-declared or independently-evidenced **SUPERSEDED or DUPLICATE**, still counted in the 1,299
but not real backlog. None were deleted — repo rule is mark, never delete. Forward-pointers below are proposed;
only the two files in `CURRENT_AUTHORITY_MAP.md` that could be evidenced were actually edited (§ see that file).

| Residue file                                             | Open items | Superseded by / duplicate of                                            | Evidence                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------- | ---------: | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SAAS_FOUNDATION/AUTONOMOUS_NIGHTLY_RUNBOOK.md`          |         51 | `T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md` / `R2_MVP_MASTER_CHECKLIST.md` | File's own first line: "Phase 0 is complete... Do not execute the 'Next Stage Plans' below as live work... next live direction is T0/R2." All 51 open boxes sit inside that self-disowned section.                                                                                                                                                           |
| `SAAS_FOUNDATION/STORE_EXECUTION_PLAN.md`                |         19 | `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`                                 | Header literally says superseded/"не исполнять как текущий план."                                                                                                                                                                                                                                                                                            |
| `SAAS_FOUNDATION/STORE_P0_ENTITLEMENTS_PLAN.md`          |         14 | `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`                                 | Header says historical P0 checklist, not the current product plan.                                                                                                                                                                                                                                                                                           |
| `SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md`         |         44 | `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` (same card #751)                | S4 shows the same phases closed with real commit hashes (2026-07-22, `a678d043d`); this file was never updated after 2026-07-17 and still shows them open. Risk: two agents could work the same ground independently.                                                                                                                                        |
| `SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md`            |          8 | `SAAS_ENFORCE_ROADMAP.md` / `R2_MVP_MASTER_CHECKLIST.md`                | Header says "⚠️ НЕ АКТУАЛЬНО," written pre-07-15-pivot — correctly self-marked, but the same open items (B4-fanout, B7, B8, `be_organization_members` tier review) are still separately open in `R2_MVP_MASTER_CHECKLIST.md`, so it's a live duplicate as well as stale.                                                                                     |
| `SAAS_FOUNDATION/SAAS_R0_PLAN_RECONCILIATION.md`         |          5 | frozen historical ledger                                                | Header: "ИСТОРИЧЕСКАЯ ЗАПИСЬ (frozen 2026-07-15)… must not retick." The 5 "open" boxes are permanent audit-FAIL verdicts, intentionally never closed — not backlog at all.                                                                                                                                                                                   |
| `SAAS_FOUNDATION/SAAS_R1_FINISH_LINE_AND_DOC_HYGIENE.md` |          4 | frozen historical ledger                                                | Same pattern as above.                                                                                                                                                                                                                                                                                                                                       |
| `DOCTOR_DNA_MIGRATION/PLAN.md`                           |          5 | `DOCTOR_UI_REWORK_2026-07-20/PLAN.md` (§UI-P)                           | `docs/INITIATIVES.md:18` states outright: "полный Doctor DNA `#885` отменён владельцем и остаётся только исторической записью." `DOCTOR_UI_REWORK_2026-07-20/PLAN.md`'s own task-mapping table independently confirms the same. This file's 5 open boxes carry no cancellation marker and would mislead a fresh reader into treating cancelled work as live. |

**Currently live/authoritative** (cross-checked, no contradicting evidence found): `SEQUENCE.md`,
`SAAS_ENFORCE_ROADMAP.md`, `SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`, `SAAS_S5_SETTINGS_ROOT_SPLIT.md`,
`SAAS_S6_CLINIC_DIRECTORY_AND_ORG_BOUNDARY.md`, `SAAS_S3_TEST_WALKTHROUGH.md`,
`R2_MVP_MASTER_CHECKLIST.md`, `SAAS_R3_CUT_INVENTED_SCOPE.md`, `DOCTOR_UI_REWORK_2026-07-20/PLAN.md`,
`SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, `STABILITY_SECURITY_HARDENING_PLAN_2026-07-21.md`,
`BCB2_OWNER_PUNCHLIST_2026-07-18.md`, `RU_PRIVACY_AND_PRODUCTION_READINESS/MASTER_PLAN.md` (with the caveat in
§3 about how much of it is owner-authorized vs. agent-expanded). Rubitime retirement исключён из текущей
authority: он завершён 2026-07-27 и хранится только в `docs/archive/2026-07-rubitime-retirement/`.

---

## 3. Owner-scope backlog, by theme, ordered by what unblocks the most

Only OWNER SCOPE + DERIVED items, i.e. the 973-item real backlog, grouped. "Needs owner" flags items that
cannot proceed without him, so they belong on a decision list, not a work list.

### Security / tenant isolation (unblocks nearly everything else in SaaS track)

- **Tenant enforcement roadmap** — `SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md` (57 open). Direct execution of the
  core multi-tenant pivot. No owner decision currently blocking it.
- **Invented-scope cleanup (media worker tenant-agnosticism, staff single-org rule)** —
  `SAAS_FOUNDATION/SAAS_R3_CUT_INVENTED_SCOPE.md` (96 open, ~91 are mechanical deletion of a previous stage's
  unrequested abstractions; ~5 are explicit, correctly-unchecked "OWNER DECISION REQUIRED" boxes about
  `be_organizations` access — see §5, this is the one part of R3 that does need him).
- **PII/RLS tightening** — `TASK_A_PII_TIGHTEN_PLAN.md` (25 open, but ~7 of those are done-in-code-not-ticked —
  see §5). No owner decision needed, needs a doc-hygiene pass.
- **Writer census / single chokepoint** — `P0_7_WRITER_CENSUS_CHECKLIST.md` (8 open), `RLS_UNPRINCIPLED_READ_FIX_PLAN.md`
  (6 open, owner already resolved the FORCE-RLS-vs-chokepoint question 07-17). No owner decision needed.
- **TEST walkthrough / acceptance proof** — `SAAS_S3_TEST_WALKTHROUGH.md` (31 open), `OWNER_READY_TEST/ROADMAP.md`
  (20 open), `OWNER_READY_TEST/audit/acceptance-ST-0{1,2,3,4}.md` (1, 1, 1, 13 open respectively — mostly single
  live-TEST proof runs left). No owner decision needed to execute; owner will want to see the result.
- **Design lock / role model** — `PHASE0_MULTITENANT_DESIGN_LOCK.md` (3 open: cluster-role-naming decision is
  genuinely open). **Needs owner: no** — repo canon says DB-role granularity is an engineering call (owner's own
  words, ruling §16), so this is a self-resolvable engineering decision, not a question for him.
- **CI security stack** — `SECURITY_CI_STACK_PLAN.md` (4 open). **Needs owner: 2 of 4** — prod ZAP baseline scope
  and shared-runner IP-range sign-off are explicit human-authorization gates, not code.

### Product — tariffs, store, billing

- **Tariffs/store/entitlements** — `SAAS_FOUNDATION/SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md` (59 open). Every
  major decision cites `OWNER_RULINGS_2026-07-15.md` or `OWNER_REVIEW_2026-07-18.md` directly. No owner decision
  blocking the open work; store-package phase is explicitly deferred by design, not stalled.
- **Clinic directory / org boundary** — `SAAS_FOUNDATION/SAAS_S6_CLINIC_DIRECTORY_AND_ORG_BOUNDARY.md` (36 open).
  Directly executes the owner's public-clinic-directory model (ruling §12). No owner decision needed.
- **Settings root split** — `SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT.md` (32 open). Traces to the owner's
  blunt correction that the app must read its own settings (ruling §15). No owner decision needed.
- **Patient invite / manual creation**, **admin+support chat baseline** —
  `SAAS_FOUNDATION/PATIENT_INVITE_AND_MANUAL_CREATION_DESIGN.md` (18 open) and
  `SAAS_FOUNDATION/ADMIN_BASELINE_AND_SUPPORT_CHAT_DESIGN.md` (22 open). Both open with verbatim owner-quoted
  taskdb cards (#801/#806, #808) but **neither is listed in `SAAS_FOUNDATION/SEQUENCE.md` or `README.md`'s
  "Active work" section** — real owner scope that is currently invisible in the one document meant to say
  "what's next." Needs a sequencing decision, not a scope decision.

### Rubitime retirement (завершённая историческая работа)

- Rubitime выведено 2026-07-27; владелец 2026-07-29 распорядился явно убрать материалы в архив. Открытые строки
  старого `RUBITIME_RETIREMENT_EXECUTION_PLAN.md` сохраняют историческое состояние и не являются backlog или
  разрешением продолжить R1–R7. Архив: `docs/archive/2026-07-rubitime-retirement/`.

### Doctor UI (the owner's own dictated punch-list)

- `BCB2_OWNER_PUNCHLIST_2026-07-18.md` (55 open, 6 closed) — this **is** the owner's list, dictated verbatim,
  organized by schedule/clients/client-page/chat/program/booking/subscriptions/settings. Treat this as the
  ground truth for what UI work he actually asked for.
- `DOCTOR_UI_REWORK_2026-07-20/PLAN.md` (66 open, 69 closed) — most open items map to punch-list codes
  (SCH-_, CLI-_, CLP-_, CHT-_, PRG-_, PBK-_, ABO-_, AB2-_, SET-\*) or dated owner gates. Two weaker pockets flagged
  by the reviewing pass: the ~20-item UI-5b detail list attributed to an "owner dump" commit that wasn't
  independently re-read here, and the ~25-bullet UI-7 scheduled-messages technical contract (durable state
  machine, CAS semantics, idempotency keys) which reads as agent engineering detail beyond what the owner is on
  record asking for — worth a second look, not a confirmed problem.
- `BOOKING_MULTISLOT_DESIGN.md` (12 open), `BOOKING_ACTOR_ATTENDEE_DESIGN.md` (9 open),
  `PROGRAM_INDIVIDUAL_ITEM_DESIGN.md` (8 open) — each opens with a verbatim quoted owner decision from a
  specific taskdb card (#562, #563, #565). Genuine owner scope, each with 1-3 explicitly-flagged open design
  questions (see §5).
- `UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` (8 open) — Track D quotes an owner ruling on removing HTTP as
  an internal transport verbatim.
- `STABILITY_SECURITY_HARDENING_PLAN_2026-07-21.md` (29 open, 45 closed) — file states its own scope rule ("scope
  comes ONLY from this file; owner explicitly authorized these findings→plan") and shows a real resolved
  owner-decisions table (F-1..F-5) for the rest. **Needs owner: 1** — exact session-TTL value for doctor/admin
  (recommendation: 7 days, unconfirmed).
- `EDITOR_TIPTAP_MIGRATION_PLAN.md` (1 open of 13) — owner-quoted decision, 12 already done; the one open item is
  literally waiting for him to look at the discovery manifest.
- `UNSUPPORTED_CLIENT_FALLBACK_PLAN.md` (3 open), `OUTBOUND_DELIVERY_ALERTING_PLAN.md` (2 open) — both are
  genuine fixes for real production incidents (an iOS client silently freezing; the known SMTP-tariff email/SMS
  outage that a green dashboard hid for a day+). Both need explicit owner authorization only for a live-TEST
  fault-injection/proof run, not for scope.
- `LANDING_AND_ENTRIES_DESIGN.md` (7 open) — executes card #807; 3 explicit open owner decisions remain
  (route shape for tenant public pages, auth-intent UI mechanism, exact install-gated capability list).

### RU privacy / 152-FZ compliance (legitimate legal driver, engineering scope partly self-expanded — see §4)

- `PR-03_DATA_RIGHTS_AND_RETENTION.md` (21 open, 6 closed) — the core rule (recoverable deletion, 90-day window,
  no silent purge) is directly owner-attributed; the dangerous immediate-delete path is already closed in code.
  Remaining automation waits on a legal retention-matrix gate.
- `NTF-01_APP_PUSH_AND_MESSENGER_AUTH_ONLY.md` (38 open, 19 closed) — boundary is owner-attributed (a direct
  reaction to an agent's over-broad masking proposal); exact field-level notification content matrix still needs
  a decision, but the boundary itself does not.
- `LOG-01_SENSITIVE_PAYLOAD_HYGIENE.md` (20 open, 6 closed) — uncontroversial engineering hygiene, closed slice
  already code-verified.
- The remaining stage files (`PR-00/01/02/04`, `DR-01`, `MASTER_PLAN.md`, `OWNER_ACTIONS.md`,
  `FINAL_ACCEPTANCE.md`, `CRYPTO-01` closed slice) are legitimate DERIVED legal/infra work but a large share is
  explicitly gated on decisions nobody has made yet (lawyer engagement, DPO designation, retention matrix,
  encryption-vendor selection) — see §4 for the honesty check on this whole cluster's origin.

---

## 4. Biggest surprises

1. **A 60-item, two-file initiative with no owner authority behind it at all: `NATIVE_MOBILE_APP_INITIATIVE/`
   (`MASTER_PLAN.md` 41 open, `FINAL_ACCEPTANCE.md` 19 open, both 0 closed — never executed).** It is absent from
   `docs/INITIATIVES.md` (checked the current-execution table, the historical snapshot, _and_ the
   FUTURE/NEEDS-OWNER table where genuinely-deferred owner ideas like "adaptive layout / site-vs-app" and
   "nutrition/AI-assist" _are_ listed) and absent from `docs/CURRENT_AUTHORITY_MAP.md`. Unlike every other design
   doc sampled in this pass, its own text poses product decisions as still-open "owner gates" it never records an
   answer to, rather than quoting one. This is the closest match in the entire sample to the documented
   73-invented-requirements failure pattern. **Recommend: ask the owner directly whether a native mobile app was
   ever requested; if not, mark the whole initiative SELF-GENERATED and archive it rather than working any of its
   60 items.**

2. **The RU-privacy/152-FZ umbrella (277 open items across 16 files, ~139 of which land in this document's
   SELF-GENERATED bucket) has a real legal trigger but an agent-expanded engineering program.** 152-FZ genuinely
   applies — the initiative's own processing register independently confirms real health-PII schema in this
   product. But no verbatim owner quote authorizing the _specific_ engineering program was found anywhere: the
   umbrella's own `LOG.md` shows an agent authoring the full roadmap on 2026-07-19, then the _same agent_
   expanding it further the same day after running its own production audit, citing only that audit — not owner
   input — as the trigger for `CRYPTO-01` (client-side/field-level encryption) and `INFRA-01` (an entirely new
   encrypted production host). A later log entry does record real owner activation, but paraphrased as "everything
   safely doable in repo/DEV proceeds now" — a category-level go-ahead, not line-item authorization for a new VPS
   build, EDR/HIDS tooling, or formal incident-response governance (`SEC-04`, 13 open, fully self-generated).
   **Recommend: separate "legally required, do it" (the processing register, consent gating, the already-shipped
   deletion-rights fix) from "an agent's best-practice interpretation of what compliance should look like"
   (new host, EDR, formal governance) and ask the owner which tier he's actually funding.**

3. **A production-cutover runbook lives inside two active plan files, in direct tension with the owner's
   verbatim, dated rule** ("слово production может встречаться только в одном варианте — достать свежий дамп...
   ни в каких планах"): `SAAS_FOUNDATION/SAAS_PROD_DEPLOY_PROCESS.md` and `SAAS_FOUNDATION/DEPLOY_667_SEQUENCE.md`
   both contain literal prod-migration/cutover steps (stop prod systemd units, install RLS walls on the live DB,
   DNS/rollback sequencing). Independent verification (this lead, not just the delegated pass) confirms every
   destructive path is gated behind an explicit `--allow-authorized-prod-target` flag and cites "Owner ruling
   2026-07-24/25" — later than the blanket 07-15 rule, so this may be a legitimate, narrower authorization the
   owner gave for the SaaS go-live specifically. But the citations in-file are paraphrased, not verbatim-quoted
   like the 07-15 ruling is. **Classified DISPUTED, not violation and not clean** — this is exactly the kind of
   claim that should not be resolved by an agent reading its own citation. Recommend a direct owner check: "did
   you authorize a real prod-cutover runbook on 07-24/25, narrower than the 07-15 rule, specifically for SaaS
   go-live?"

4. **`SAAS_FOUNDATION/TASK_A_PII_TIGHTEN_PLAN.md` contains a prior agent's own written admission that ~7 of its
   25 open checkboxes are done and deployed** ("⚠️ STALE-CORRECTION (verified live on TEST 2026-07-24)... that
   work IS done and DEPLOYED," citing `rls-descriptor-model.mjs:205`) — a clean, rare DONE-BUT-UNTICKED case where
   the evidence was already written down and simply never converted to `[x]`.

5. **`TARIFFS_PAYMENTS_ADMIN_PLAN.md`'s 44 open items are a live duplicate of already-closed `SAAS_S4` phases**
   (same taskdb card #751) — this is the single largest pure double-count in the backlog, and exactly the kind of
   drift the "single source of done" canon exists to prevent.

---

## 5. What could not be classified, and what would settle it

- **`be_organizations` cross-org access model** (`SAAS_R3_CUT_INVENTED_SCOPE.md` §4, 3 boxes correctly left
  unchecked) — three explicit owner-decision options (separate platform-admin DB principal, a narrow
  SECURITY DEFINER resolver, or removing cross-org GET entirely). Needs the owner to pick one; the file already
  states this cleanly and should not be worked around.
- **`SAAS_PROD_DEPLOY_PROCESS.md` / `DEPLOY_667_SEQUENCE.md` authorization scope** (§4 surprise 3) — needs a
  direct owner confirmation, not further reading; the paraphrase-vs-quote gap is the exact failure mode this
  document exists to catch, so it should not be resolved by inference.
- **`DOCTOR_UI_REWORK_2026-07-20/PLAN.md` UI-5b's ~20-item detail list** — attributed to "an owner dump, commit
  `f48f35a56`," which was not independently re-read in this pass. Resolvable by pulling that commit/source
  directly and checking line-by-line against the current UI-5b checklist.
- **`DOCTOR_UI_REWORK_2026-07-20/PLAN.md` UI-7's technical contract** (~25 bullets: CAS claim semantics, retry
  backoff shape, idempotency keys) — the feature (scheduled messages) is owner-asked; this level of engineering
  detail is not obviously owner-worded. Likely DERIVED (an engineer would need to design _something_ here) but
  worth a second look for scope creep in the specifics.
- **RU-privacy `OWNER_ACTIONS.md`'s O-01..O-12 items** (designate DPO, contact Selectel, brief a lawyer) — no
  file shows evidence any of these actually happened outside the repo. Only the owner (or his taskdb notes on
  card #898, not accessible to this read-only pass) can confirm real-world status.
- **`INFRA-01_ENCRYPTED_PROD_MIGRATION.md`'s new-host-build scope** — classified SELF-GENERATED here because its
  own creation log cites only an agent's PROD/S3 audit as trigger, not an owner request. If the owner did in fact
  ask for a rebuilt encrypted host at some point outside these docs, this classification is wrong and should be
  corrected against his direct word, not left as an inference.

---

## What was sampled vs. counted

- **Counted exactly, every file:** open/closed checkbox totals for all 291 markdown files under `docs/_TODO/`
  (excluding anything path-matching "archive"), via `grep -c '^\s*-\s*\[ \]'` / `'^\s*-\s*\[x\]'`, verified with a
  null-delimited file loop to avoid word-splitting errors on paths with spaces (an earlier naive pass corrupted
  ~15% of filenames this way — the corrected sweep is the one behind every number in this document).
- **Read in full and classified individually:** all 66 files with at least one open checkbox (listed across
  §§1–3), plus `SAAS_FOUNDATION/OWNER_RULINGS_2026-07-15.md`, `SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md`,
  `BCB2_OWNER_PUNCHLIST_2026-07-18.md`, `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`,
  `docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md`, `docs/CURRENT_AUTHORITY_MAP.md`, `docs/INITIATIVES.md`,
  `SAAS_FOUNDATION/README.md`, `SAAS_FOUNDATION/SEQUENCE.md`.
- **Confirmed fully closed, not re-read line-by-line:** the 15 files with 0 open / N closed checkboxes
  (`SAAS_PRODUCT_SMOKE_A1.md`, `RUBITIME_RETIREMENT_R0_FREEZE_REPORT.md`, `P0_9_DEFAULT_DENY_CHECKLIST.md`,
  `SAAS_PRODUCT_UX_INITIATIVE/ROADMAP.md`, `DB_ACCESS_CHOKEPOINT_INITIATIVE/MASTER_PLAN.md` (this one was
  spot-read, evidence-cited, confirmed genuinely complete), `SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md`,
  `P0_2_MEMBERSHIP_RESOLVER_CHECKLIST.md`, `T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md`,
  `P0_11_SYSTEM_SETTINGS_ORG_CHECKLIST.md`, `P0_8_RLS_DESCRIPTOR_CHECKLIST.md`,
  `P0_13_ISOLATION_FIXTURES_CHECKLIST.md`, `P0_10_CI_INVARIANTS_CHECKLIST.md`,
  `P0_6_DORMANT_CONTEXT_CHECKLIST.md`, `P0_12_RESIDUAL_REFS_CHECKLIST.md`, `SAAS_B1_DOCTOR_ADMIN_IDENTITY.md`).
- **Read but deliberately not classified:** `docs/_TODO/NIGHT_PLAN_2026-07-26.md` (32 open) — another agent is
  actively reconciling it; task instructions were explicit not to touch it, and classifying a moving target would
  produce a stale answer immediately.
- **Not read at all in this pass:** the ~210 `docs/_TODO/` markdown files with zero checkboxes (design notes,
  audit reports, decision records, historical snapshots). These carry no open-work count by definition but were
  not screened for whether any of them _should_ have a checklist and doesn't — that would be a different kind of
  audit than the one requested.
- **taskdb:** `node /home/dev/brain/tools/taskdb.mjs list bcb` was read in full (943 lines) and `waiting` was
  checked; no writes were made to it.

---

## 6. Верификация 2026-07-27 — цифра «973 реального бэклога» ОПРОВЕРГНУТА

Владелец задал прямой вопрос: «что реально не сделано, что сделано но не отмечено». Пять независимых
агентов прочли все 66 файлов по кластерам и классифицировали КАЖДЫЙ открытый чекбокс против кода
(не против отчётов), с доказательством `file:line`/commit на каждое утверждение «сделано».

**Ошибка §1 этого документа:** классификация OWNER/DERIVED/SELF-GENERATED отвечает на вопрос «кто это
заказал», а НЕ на вопрос «сделано ли это». 973 = «сколько чекбоксов имеют законное происхождение».
Реальной несделанной работы среди них — примерно вчетверо меньше.

| Что это на самом деле                                               | Чекбоксов |    Доля |
| ------------------------------------------------------------------- | --------: | ------: |
| Уже сделано в коде, галочка не переставлена (с доказательствами)    |      ~245 |     19% |
| Мёртвое: устаревшие планы, дубли, самопридуманное                   |      ~237 |     18% |
| Доказательства/прогоны/отчёты, не изменение продукта                |      ~270 |     21% |
| Ждёт решения владельца, юриста или внешнего специалиста             |      ~130 |     10% |
| **Реальная несделанная работа**                                     |  **~275** | **21%** |
| 152-ФЗ «разумная гигиена» (derived, не обязательна по букве закона) |       ~87 |      7% |
| Прочее (NIGHT_PLAN и мелкие файлы, не классифицировано)             |       ~50 |      4% |

Ключевые числа по кластерам (raw открытых → A реальная работа / C уже сделано / B доказательства / D
блокировано решением / E мёртвое):

| Кластер                                                       | raw |    A |   B |   C |   D |    E |
| ------------------------------------------------------------- | --: | ---: | --: | --: | --: | ---: |
| Мультиарендность / RLS / безопасность (9 файлов)              | 262 |   19 | 112 | 107 |  20 |    4 |
| Доктор-UI / пунш-лист владельца (9 файлов)                    | 177 |   36 |  37 |  70 |  29 |    5 |
| Тарифы / магазин / настройки / админ (9 файлов)               | 253 |  129 |  55 |  49 |  14 |    6 |
| Rubitime / стабильность / рунбуки (13 файлов)                 | 194 |   42 |  21 |  19 |  44 |   68 |
| 152-ФЗ (230) + мобильное приложение (60) + owner-actions (26) | 316 | ~136 |  47 |   — | ~26 | ~154 |

**Доказанные схлопывания (проверено по коду, не по отчётам):**

- Тарифы/магазин: 136 открытых чекбоксов в 4 файлах → **59 уникальных**. `TARIFFS_PAYMENTS_ADMIN_PLAN.md`
  (44 открытых) даёт **ноль** новой работы: 21 уже в коде, 23 — те же S4-4/S4-6. `STORE_EXECUTION_PLAN.md` +
  `STORE_P0_ENTITLEMENTS_PLAN.md` (33) — тоже ноль, схема и резолвер живут в
  `apps/webapp/src/modules/org-entitlements/service.ts`.
- `SAAS_R3_CUT_INVENTED_SCOPE.md`: 96 открытых, из них ~53 уже сделаны — коммиты `9ea78459d`
  (удалён staff-селектор организаций) и `d2deb9cfa` (восстановлена tenant-agnostic media-worker).
- `SAAS_ENFORCE_ROADMAP.md`: 57 открытых, 36 — код готов и лежит в `package.json` как `check:saas-*`;
  открыт только живой прогон на TEST.
- `BCB2_OWNER_PUNCHLIST_2026-07-18.md`: **47 из 55 пунктов владельца уже реализованы**. Абонементы
  (ABO-1/2/3/8/9, AB2-1/2/4/5/6/8) закрыты ещё 05.07 по карте `#386` — пунш-лист 18.07 переспросил уже
  починенное. PBK-3 (мультислот) отгружен коммитом `ae12c2964` + миграция `0206_booking_appointment_chains.sql`,
  что делает все 12 чекбоксов `BOOKING_MULTISLOT_DESIGN.md` устаревшими.
- Один запрос владельца PRG-4 отслеживается в ТРЁХ файлах одновременно (пунш-лист, UI-9, отдельный дизайн-док).
- 61 чекбокс в 4 файлах — замороженные исторические записи, которые их собственный заголовок запрещает
  перезакрывать (`AUTONOMOUS_NIGHTLY_RUNBOOK.md` 44/51, `R2_ENFORCEMENT_PREP_PLAN.md` 8,
  `SAAS_R0_PLAN_RECONCILIATION.md` 5, `SAAS_R1_FINISH_LINE_AND_DOC_HYGIENE.md` 4).

**Найдено попутно, ни в одном плане не отслеживается:**

- Дрейф инвентаря состояния БД: `check-phase4-prod-copy-db-state.mjs` ассертит 164, а
  `phase4-locked-policy-artifact.mjs` — 168 policy-таргетов. Расхождение в 4 таблицы никем не диагностировано.
- `CLI-5` (фильтр по каналу push) реализован, но выключен флагом `CHANNEL_FILTERS_UI_ENABLED = false`
  (`PatientsPageClient.tsx:200`) — код есть, поверхности нет.
- `shot.mjs` сломан (нет `playwright-core`) — блокирует весь визуальный прогон `SAAS_S3_TEST_WALKTHROUGH.md`.

Метод: `docs/_TODO/BACKLOG_CONSOLIDATION_2026-07-26.md` §6, пять параллельных read-only агентов,
27.07.2026. Ни один файл планов не правился, taskdb не трогалась.

### 6.1. ПОПРАВКА к §6 — решения владельца 27.07 учтены

§6 выше писался ДО того, как я прочёл `BACKLOG_HYGIENE_HANDOVER_2026-07-27.md` и
`INVENTED_SCOPE_FOR_OWNER_REVIEW_2026-07-26.md`. Владелец 27.07 лично прошёл все пять кластеров
«выдуманного» и закрыл их своими решениями. Три пункта §6, поднятые как «вопросы к владельцу», —
**УЖЕ ЗАКРЫТЫ, переспрашивать нельзя**:

| Что §6 поднимал как вопрос                                         | Решение владельца 27.07                                                                     | Следствие для счёта                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Нативное приложение (60 пунктов) — «следа запроса нет»             | «инициатива нативного мобильного приложения не выдумана - просто не сейчас. Пока pwa»       | НЕ мёртвое. Реальный скоуп, **отложенный владельцем**. Из активного счёта — вон, из «выдуманного» — вон. |
| CRYPTO-01 + INFRA-01 + SEC-04 (82-94 пункта) — «агент дописал сам» | «надо»                                                                                      | НЕ выдуманное. **Переходит в реальную несделанную работу**, причём 0 из 82 начато.                       |
| Рунбук раскатки прода — «цитата пересказана»                       | «Раскатка прода - будет на проде»                                                           | Вопрос снят.                                                                                             |
| Тарифы/платежи (44 пункта)                                         | «уже насколько понимаю сделано или есть в плане доделать»                                   | Совпадает с §6: пометить вытесненным ссылкой на `SAAS_S4`, содержимое не терять.                         |
| Doctor DNA (5 пунктов)                                             | «помечаем как "для справки если вернемся на доработку", частично сделано - меня устраивает» | Совпадает с §6.                                                                                          |

**Пересчитанная таблица §6 с учётом этих решений:**

| Что это на самом деле                                            | Чекбоксов | Доля |
| ---------------------------------------------------------------- | --------: | ---: |
| Реальная несделанная работа (включая 82 инфраструктурных «надо») |      ~357 |  28% |
| Доказательства/прогоны/отчёты — не изменение продукта            |      ~270 |  21% |
| Уже сделано в коде, галочка не переставлена                      |      ~245 |  19% |
| Ждёт решения владельца, юриста или внешнего специалиста          |      ~130 |  10% |
| Мёртвое: замороженные записи и задвоенный учёт                   |      ~106 |   8% |
| 152-ФЗ «разумная гигиена» (derived)                              |       ~87 |   7% |
| Отложено владельцем (мобильное приложение)                       |        60 |   5% |
| Не классифицировано (ночной план и мелочь)                       |       ~40 |   3% |

Главное следствие решения «надо» по CRYPTO-01/INFRA-01/SEC-04: это **самый крупный полностью не начатый
блок бэклога после биллинга** — 82 пункта, 0 закрытых, 0 строк кода, и он требует нового сервера.

**Расхождение с `BACKLOG_HYGIENE_HANDOVER_2026-07-27.md` (не ошибка передачи, а разная глубина):**
handover ставит уборщику 5 задач по учёту — 106 вытесненных, 44 дубликата, карта авторитетов, правило в
канон. Верификация 27.07 показывает, что **главное искажение учёта в этот список не попало: ~245 пунктов
уже сделаны и не отмечены** (в одном только пунш-листе владельца — 47 из 55). Уборка, не включающая их,
оставит бэклог завышенным примерно вдвое.

**Ещё одно наблюдение по счётчику задач:** в трекере `bcb` сейчас 109 открытых карточек, из них **40 —
номера #1000+, то есть заведены за последние двое суток**, в ходе самого разбора завалов. Handover
предупреждает «не заводить новых задач под уборку, иначе лечение повторит болезнь» — по числам это уже
происходит.

### 6.2. Состояние на конец 27.07 — цифры §6/§6.1 устарели за сутки

Замерено напрямую, не по отчётам. Было на момент §6: **1291 открытых / ~772 закрытых** во всём
`docs/_TODO/**`. Стало: **1107 открытых / 965 закрытых** — за сутки закрыто ~184 пункта, почти всё это
перевод уже сделанной работы в отметки, а не новая разработка.

**Пунш-лист владельца закрыт целиком: 0 открытых / 61 закрытый** (проверено `grep`). Путь: 6 закрытых на
старте → +23 построчной сверкой с кодом → +19 живым просмотром приложения самим владельцем → остальное его
отменами и уточнениями. Для пользовательски видимого поведения его живое наблюдение — более сильное
доказательство, чем археология по коду, и это правильный порядок приоритета.

**Три пункта, которые §3 числила реальной работой, владелец 27.07 ОТМЕНИЛ** — вычесть из оценки объёма:

| Пункт                                                                                     | Решение владельца                                                                          | Где записано                             |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------- |
| PBK-4 / actor-attendee (9 боксов в `BOOKING_ACTOR_ATTENDEE_DESIGN.md` + пункт пунш-листа) | «Если кого то другого надо записать, напишут в комментарии» — отдельный механизм не строим | design-док помечен ⛔ в шапке, пунш-лист |
| CLI-4 «фильтр с приложением»                                                              | не нужен                                                                                   | пунш-лист                                |
| ABO-9 (a) цена с комментарием рядом с сеансом                                             | «бред»                                                                                     | пунш-лист                                |

**Два пункта, которые аудит 27.07 пометил как дефект, оказались верным поведением** — ошибка того же
класса, что инцидент с SCH-G1: мерили по букве старого текста, а не по актуальному решению владельца.

- `CLI-5` — код за выключенным флагом `CHANNEL_FILTERS_UI_ENABLED = false` был помечен как «сделано, но
  выключено = не сделано». Неверно: владелец просил **убрать фильтр со страницы**, а не удалить код.
  Выключенный флаг здесь и есть выполненное требование.
- `CHT-4` — «Ответить» кнопкой вместо контекстного меню было помечено как несоответствие диктовке.
  Владельцем принято как есть.

**`PRG-4` (подпапка `indive_program_exercises` для врачебного видео) перенесена в `CRYPTO-01` §C2** —
правильное место: это ровно та граница «контент врача против клинических файлов пациента», по которой C2
разделяет хранилища. `SET-L1` закрыт по-настоящему: `react-colorful`, коммит `da567cb11`.

**Остаточный мусор, который снова раздует счётчик, если не убрать:** `BOOKING_ACTOR_ATTENDEE_DESIGN.md`
отменён в шапке, но его **9 чекбоксов остались открытыми** — следующий сплошной подсчёт снова посчитает их
как работу. Отмена документа должна закрывать или помечать его боксы, иначе болезнь воспроизводится.

### 6.3. Разметка чекбоксов — КАНОН 27.07 → **SUPERSEDED 29.07, см. §6.4**

> **SUPERSEDED 2026-07-29 решениями владельца.** Шесть состояний ниже сокращены до трёх: §6.4. Текст
> сохранён, потому что по нему размечено 194 бокса — перекладывать их надо, зная исходную разметку.
> Что именно отменено 29.07 и почему — в §6.4, там же таблица соответствия старых меток новым.

Владелец: «если задача отменена — там чекбоксы надо отмечать, но не как готово, а как отмена задачи».
Отменённая работа не должна попадать ни в «осталось», ни в «сделано» — иначе она врёт счётчиком в обе стороны.
Поэтому состояний больше двух:

| Состояние                      | Разметка                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Сделано**                    | `- [x] **<исходный текст>** — <доказательство: commit / file:line / зелёный тест>`                                 |
| **Отменено владельцем**        | `- [-] ~~<исходный текст>~~ — ⛔ ОТМЕНЕНО ВЛАДЕЛЬЦЕМ <дата>: «<его слова>»`                                        |
| **Вытеснено**                  | `- [-] ~~<исходный текст>~~ — ↪️ ВЫТЕСНЕНО <дата>: работа живёт в `<файл>` §<раздел>`                              |
| **Замороженная запись аудита** | `- [-] ~~<исходный текст>~~ — 🧊 ЗАМОРОЖЕНО <дата>: исторический вердикт, перезакрывать запрещено`                 |
| **Отложено владельцем**        | `- [-] ~~<исходный текст>~~ — ⏸ ОТЛОЖЕНО ВЛАДЕЛЬЦЕМ <дата>: «<его слова>»; вернуть в работу только по его команде` |
| **Открыто**                    | `- [ ] <исходный текст>`                                                                                           |

**Почему именно `- [-]`:** он не совпадает ни с `- [ ]`, ни с `- [x]`, поэтому сплошные подсчёты
(`grep -c '^\s*-\s*\[ \]'` / `\[x\]`) перестают видеть такой пункт И как работу, И как достижение. Мёртвое
выпадает из обеих цифр, оставаясь в файле — правило «помечать, а не удалять» соблюдено.

**Исходный текст требования не переписывать никогда** — только зачеркнуть и дописать причину. Зачёркнутая
формулировка остаётся читаемой: по ней узнают требование, если владелец вернётся к теме.

**Отложенное — не отменённое и не открытое.** Скоуп, который владелец отложил («не сейчас», «позже»), реален
и когда-нибудь вернётся, но он НЕ является остатком работы на сегодня. Считать его в «сколько осталось» —
значит завышать оценку на объём, к которому никто не приступит. Поэтому он тоже уходит под `- [-]`, но с
меткой ⏸ и обязательной оговоркой «вернуть только по команде владельца» — чтобы отложенное не прочитали как
отменённое и не выбросили.

**Отмена или вытеснение документа ОБЯЗАНЫ закрывать его боксы.** Пометка только в шапке файла при живых
`- [ ]` внутри — это ровно тот механизм, которым набралась «тысяча задач»: подсчёт читает боксы, а не шапки.

### 6.4. Разметка чекбоксов — ДЕЙСТВУЮЩИЙ КАНОН (владелец, 29.07)

Заменяет §6.3. Три состояния бокса и две формы, которые боксами не являются:

```
- [ ] <текст>                                        открыто
- [x] <текст> — <commit / file:line / зелёный тест>   сделано
- [-] ~~<текст>~~ — ОТМЕНЕНО ВЛАДЕЛЬЦЕМ <дата>: «<его слова>»
не бокс, прозой:  ВЕДЁТСЯ В <файл>:<строка>
не бокс, прозой:  регламент/процедура — обычным текстом
```

**Что и почему изменилось против §6.3.**

| Было (27.07)      | Стало (29.07)                       | Почему                                                                        |
| ----------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| `↪️ ВЫТЕСНЕНО`    | распадается на `[x]` / `ВЕДЁТСЯ В` / `ОТМЕНЕНО` | одна метка стояла и на «сделано», и на «ещё не сделано» — см. ниже |
| `⏸ ОТЛОЖЕНО`      | `- [ ]`                             | отложенное не сделано, значит открыто; «пока не берём» — свойство плана, не строки |
| `🧊 ЗАМОРОЖЕНО`   | не бокс, прозой                     | все 7 применений оказались строками регламента, а не задачами                  |
| цветные иконки    | слова заглавными                    | решение владельца 29.07                                                         |

**Почему `ВЫТЕСНЕНО` убрано — измеренная причина, не вкусовая.** В [`AUTONOMOUS_NIGHTLY_RUNBOOK.md:210`](SAAS_FOUNDATION/AUTONOMOUS_NIGHTLY_RUNBOOK.md#L210)
метка означала «работа выполнена, закрыто 17/17», а в [том же файле:198](SAAS_FOUNDATION/AUTONOMOUS_NIGHTLY_RUNBOOK.md#L198)
той же датой — «работа ЕЩЁ НЕ ЗАКРЫТА, живой трекер `P0_7_WRITER_CENSUS_CHECKLIST.md:72`». Одна метка на
противоположных состояниях; отличить их можно было только прочитав свободный текст после двоеточия. Ни
подсчёт, ни агент этого не делают — отсюда трижды повторившаяся ошибка «живой план уехал в архив».

**Указатель не несёт статуса.** Без «там N/M», без «закрыто», без «осталось». Владелец, 29.07: «закрыта ли
работа в новом файле — старый знать не должен». Счётчик в чужом файле протухает на следующий день и врёт
в обе стороны.

**Форма адреса — ПОПРАВКА 29.07 по результату аудита:**

```
ВЕДЁТСЯ В <файл> §<раздел или ID пункта> — «<первые слова требования у преемника>»
```

Раздел/ID, а НЕ номер строки. Первая редакция требовала `<файл>:<строка>`; независимый аудит слайса Э3-A
проверил её через час после написания и нашёл: 13 из 26 указателей ведут не на своё требование, семь — на
пустую строку, 33 из 37 новых `[x]` ссылаются на строки, где написано другое. Причина не в исполнителе:
номер строки в живом файле сдвигается от любой правки выше по тексту, и указатель врёт молча — прочитать
его как «неверный» нельзя, он выглядит рабочим.

Отсюда два требования к каждому адресу: **якорь устойчив** (заголовок, ID пункта — то, что переживает
вставку строк) и **самопроверяем** — процитированные первые слова требования у преемника позволяют
поймать расхождение чтением, без похода в файл. Номер строки допустим ТОЛЬКО как дополнение к якорю и
никогда вместо него.

Это отступление от того, что владелец утвердил 29.07 (он говорил про `файл:строка`); вынесено ему
отдельной строкой в план `DOCS_PLAN_HYGIENE_2026-07-29.md`, развилка **H-7**.

**Бокс убивает только владелец.** Исполнитель вправе поставить `[x]` с доказательством или превратить бокс в
указатель прозой, если та же работа ведётся в другом файле. «Мне кажется, это отпало», «этого никогда не
строили», «требование умерло» — остаётся `- [ ]` и уходит владельцу вопросом. Это зеркало запрета «аудит не
создаёт скоуп»: исполнителю так же запрещено скоуп *удалять*.

**Отложенность пишется один раз в шапке плана, а не на каждом боксе.** Владелец откладывает тему, а не 41
отдельный пункт: все 41 `⏸` в репозитории — это одна его фраза «Мобильное - отложено» от 27.07, размноженная
по двум файлам `NATIVE_MOBILE_APP_INITIATIVE/`. Подсчёт «сколько осталось» исключает отложенную папку целиком.

**Шапка обязана называть свою область в первых словах.** «SUPERSEDED» / «ОТМЕНЕНО» без границы читается как
приговор всему файлу. Замер 29.07: в [`FINAL_ACCEPTANCE.md`](RU_PRIVACY_AND_PRODUCTION_READINESS/FINAL_ACCEPTANCE.md)
шапка «SUPERSEDED AS TARGET» накрыла 35 живых боксов, из которых к вытесненной push-топологии относятся 3 —
остальное юрист, РКН, модель угроз, DSAR, retention. Правильная форма: `ВЫТЕСНЕНО ТОЛЬКО: <что именно>.
Остальное действует.` Отмена без явной границы не применяется.

**Единственный механический гейт.** Файл не уезжает в архив, пока внутри есть хоть один `- [ ]`. Остальное —
правилами, не машинерией.

**Исходный текст требования не переписывать никогда** — только зачеркнуть и дописать причину (правило §6.3
сохраняется).
