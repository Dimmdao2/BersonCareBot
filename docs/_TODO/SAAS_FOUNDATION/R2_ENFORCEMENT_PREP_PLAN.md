# R2 enforcement prep — Trek B plan (autonomous engineering track)

> ⚠️ **НЕ АКТУАЛЬНО (last touched 2026-07-11).** Написан до owner-пивота 2026-07-15
> (`SAAS_R1_FINISH_LINE_AND_DOC_HYGIENE.md`: «The old `bersoncare` production is LEGACY and frozen. There
> will be NO prod cutover — ever»); цель этого файла — «provably safe to flip FORCE RLS» — решает проблему
> пути, по которому больше не идут. Актуально: [`SAAS_ENFORCE_ROADMAP.md`](SAAS_ENFORCE_ROADMAP.md) (там
> свой раздел «R2 — TEST enforced product parity plus isolation»), [`SEQUENCE.md`](SEQUENCE.md). Часть
> закрытых технических пунктов (B4-core patient wall, B4-fanout GUC alignment) зафиксирована как DONE и
> остаётся исторически верной.

> **Разметка чекбоксов 2026-07-27, corrected 2026-07-29.** Было: 8 открытых `- [ ]` считались живым
> бэклогом при сплошном подсчёте. Ни один пункт не отменён владельцем; все 8 остаются `- [ ]` до отдельного
> решения об их ownership/переносе по канону §6.4. На проде это НЕ значит «прод никогда не
> обновится» — 27.07 владелец уточнил: текущий хост не трогают, но НОВЫЙ прод-хост строится и на него
> мигрируют (`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §6); формулировка выше про «no prod cutover — ever»
> не переписана, только это примечание не должно читаться как противоречащее.

Single source of "done" for the pre-flip engineering work (owner rule #1). Ops/deploy/flip
(Trek A steps 2-3, Trek C steps 9-10) are owner-gated and NOT in this file. Report = closed X/N
against this checklist + a "НЕ СДЕЛАНО" section. Each item: worker → independent audit → owner.

Goal: get from "dormant foundation on feat" to "provably safe to flip FORCE RLS", without
touching test/prod. All work is code + scratch-DB only. No push to main/test, no deploy, no flip.

## Context (established)

- R1 dormant foundation + T0.1–T0.4 context plumbing done; 3 R2-readiness holes closed on `feat`
  (taskdb #645–#650), CI green, pushed to `origin/feat`, C1 NOT NULL verified on dev.
- Isolation PATTERN proven live: `smoke-p0-13-db-isolation.mjs` OK (NOBYPASSRLS + FORCE RLS + 2 orgs
  - patient wall, hand-written policies on a compat schema).

## Checklist

- [ ] **B6 — real-policies 2-org proof.** Upgrade the pattern smoke to the ACTUAL migration-generated
  policies on the REAL schema: fresh scratch DB → apply real webapp Drizzle (0141–0168) + integrator
  (I1–I4, C1) migrations → seed a 2nd org + 2nd patient → NOBYPASSRLS role → assert cross-tenant deny
  across a representative set of the real SCOPED policies (not just the ~10 hand-picked ones).
  Gate: org wall + patient wall + fail-closed hold under the real generated policies. Scratch only.
- [x] **B4-core — patient-wall in real policies (Opus design + Sonnet impl).** DONE 2026-07-11
      (taskdb `#653`, LOG.md entry "B4-core patient wall in real RLS policies").
      ⛔ **ЛОЖНАЯ АТРИБУЦИЯ, ИСПРАВЛЕНО 04.08.** Здесь стояло «OWNER DECISION (2026-07-11): doctor visibility =
      org-wide (variant A) — NO assignment predicate in RLS». Владелец 04.08, увидев эту цитату: «Я так сказать
      не мог. Это язык агента». Проверка подтвердила: первичной русской формулировки владельца НЕТ нигде в
      репозитории (поиск по «вариант А», «врач видит», «все пациенты клиники» — пусто), строка написана агентом
      по-английски в отчёте о своей же работе. Дальше `OWNER_DECISIONS_FOR_REVIEW.md` сверил её с записью в
      памяти лида, сделанной теми же английскими словами, и пометил «ПОДТВЕРЖДЕНО» — агентское решение
      подтвердило само себя. **Фактически действует агентский выбор:** предикат назначения в RLS не заводился,
      потому что без него политика короче. Вопрос ВОЗВРАЩЁН владельцу, см. ниже.
      **Действовавшее поведение (факт, не решение):** doctor visibility = org-wide, без предиката назначения.
      Patient wall = **absolute**: a patient sees ONLY their own rows, never any other patient's, in
      any org context. Wired `renderStaffOrPatientPredicate` (rls-sql-renderer.mjs) into the real
      policy generators/descriptors (`rls-descriptor-model.mjs` `patientOwnedColumns` registry — 60
      tables; `p0-8-3/4/5-policy-targets.mjs`; `p0-9-enforce-descriptors.mjs`) for patient-owned SCOPED
      tables with the fail-closed staff-vs-patient shape:
      `org match AND ( current_setting('app.actor')='staff' OR (app.patient_user_id IS NOT NULL AND <patient_col> = app.patient_user_id) )`.
      Staff session sets `app.actor='staff'` (patient sees all org); patient session sets
      `app.actor='patient'` + `app.patient_user_id` (own only); unset → DENY. A patient session can NEVER
      set actor='staff' (separate authenticated code path — that wiring is B4-fanout, not touched here).
      Proved via the real-policy smoke (`smoke-r2-real-policy-isolation.mjs`, exit 0): patient A≠B
      deny, staff sees all org, unset denies, org wall holds for patient sessions too, bigint integrator
      identity path proven on `integrator.content_access_grants`. New migration
      `0169_p0_8_b4_core_patient_wall_rls.sql` (60 tables). Scope explicitly excludes tables reachable
      only via multi-hop FK/JOIN chains (documented in LOG.md, not silently dropped) — see LOG.md for
      the full excluded-table list and rationale.
      **UPDATE 2026-07-11 (B4-fanout gap closure, taskdb `#656`, LOG.md entry "B4-fanout gap closure —
      GUC alignment + chain-only patient wall"): the two gaps this item's own audit left open are now
      CLOSED.** (1) GUC alignment: bigint integrator-identity predicates now read the DEDICATED
      `app.integrator_user_id` GUC (not `app.patient_user_id` cast to bigint) — fixed in
      `rls-sql-renderer.mjs`, `0169` regenerated in place (never applied outside scratch, so safe to
      correct). (2) The 11 chain-only tables (`integrator.conversations`/`message_drafts`/
      `user_questions`/`conversation_messages`/`question_messages`/`user_reminder_occurrences`/
      `user_reminder_delivery_logs`, `support_questions`/`support_conversation_messages`/
      `support_question_messages`/`support_delivery_events`) now get a patient wall via a new
      EXISTS-chain predicate (`patientChainOwnedTables` registry + `renderPatientChainPredicate`),
      migration `0170_p0_8_b4_fanout_chain_patient_wall_rls.sql`. Extended smoke proves staff org-wide
      visibility, a SINGLE MIXED session (uuid + bigint GUCs together) seeing only its own rows across
      BOTH identity spaces including chain-only conversations/messages/reminders, and empty-context
      deny — all across the newly-walled targets. No known patient-owned SCOPED table remains open.
      Also found/fixed 2 bugs along the way: a substring-matching false-positive in
      `check-p0-8-3-policy-generator.mjs`, and a process-exit-code bug in the smoke itself (`\quit 1`
      is not honored on this box's psql 16 — every FATAL assertion was silently non-fatal to the exit
      code; fixed here, same bug flagged as a separate follow-up in 4 sibling smoke/fixture files not
      touched by this pass). The B4-fanout READ-CONTEXT WRAPPER (who sets these GUCs per request) is
      untouched — that is the separate checklist item below, not yet started.
- [ ] **B4-fanout — read-context wrapper + coverage.** The chokepoint read wrapper sets `app.org` +
  `app.actor` (+ `app.patient_user_id` for patient sessions) on every SCOPED read, per session type.
  Apply per process family (webapp readers, integrator DbPort/pool, scheduler, media). Unset → dormant.
  **MODEL SPLIT:** wrapper contract = Opus design; the uniform mechanical sweep across N reader
  call-sites is a **Codex candidate** once the wrapper is designed (bulk, repetitive, well-specified —
  Codex's sweet spot). Security-sensitive spots stay Sonnet-under-audit.
- [ ] **DEFERRED (not now, owner 2026-07-11):** "my patients" soft default filter (UX relevance, not a
  security wall) — try at port level later if needed, no toggle for now. Hard assignment/handoff RLS
  (variants B/C) — only under a future large-clinic business order.
- [ ] **be_organization_members tier review:** currently BOOTSTRAP-global (membership cross-tenant
  readable). Decide if it should be BOOTSTRAP-hybrid before flip. (B6 finding, minor.)
- [ ] **B4-fanout — apply read context per process family (Sonnet, one worker each).** webapp route
  readers; integrator `DbPort.query`/pool Drizzle paths; scheduler/queue; media claim/reclaim.
  Each: reads run under principal; unset context preserves dormant behavior; targeted tests + audit.
- [ ] **B5 — non-bypass DB app role.** Materialize the `NOBYPASSRLS` app role + grants (P0.5), scratch
  prod-parity proof that the app's queries work under it with policies dormant. Runtime role flip = ops (owner).
- [ ] **B7 — shadow-mode toggle.** A GUC/flag "log RLS violations, don't deny" mode so a staging
  shadow-run can surface any query that would break under enforcement. Code + unit only.
- [ ] **B8 — flip plan + rollback (Opus).** Draft the controlled permissive→FORCE + role-switch plan
  with rollback, behind a flag/GUC. Owner approves; execution is ops.

## Done today

- [x] Pattern isolation proof re-run green (`smoke-p0-13-db-isolation.mjs`).
- [x] B4-fanout gap closure: GUC alignment + 11-table chain-only patient wall (taskdb `#656`) —
      see B4-core checklist entry above and LOG.md for full detail. `check-saas-db-regression.mjs`
      full gate green; `smoke-r2-real-policy-isolation.mjs` exit 0.

## НЕ СДЕЛАНО / owner-gated (not in this track)

- Deploy dormant foundation to test/prod; run migrations on test/prod; push to main/test.
- The actual R2 enforcement flip (FORCE RLS + role switch) on any shared env.
- Milestone acceptance of the 3-holes work.
