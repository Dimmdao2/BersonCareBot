# Complete lifecycle census — systemic closure of Track D stage 3 (#987)

You are the implementation worker. Read `AGENTS.md` heading map first, then §5, §9–§10b and §24. Work only in
`/home/dev/dev-projects/bcb-wt-fix-lifecycle-purge-census-20260828` on branch
`wt/fix-lifecycle-purge-census-20260828`. Do not touch TEST/PROD, env, UI, taskdb, other branches or domains. Do
not create a disposable database. Do not run full CI. Commit all completed work before ending.

## Authority and exact defect

Owner-authorized plan: `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, stage 3:

> Для каждой физической сущности зафиксировать: зачем существует, канонический ключ пользователя/клиники,
> cascade при account/org purge, terminal states, окно хранения, named prune root, scheduler и health signal.

> Приёмка этапа: автоматический census не допускает новую journal/temp таблицу без owner/retention/purge policy;
> живой account purge не оставляет ни одного связанного пользовательского факта вне явно сохранённых по закону.

Independent audit: `docs/_TODO/runs/FINAL_SYSTEMIC_LIFECYCLE_AUDIT_2026-08-28.md`, F1–F3. The first worker commit
`3841bbfba` fixed F1/F2 for four named tables but did **not** close F3 systemically: it added three names to
`JOURNAL_LIFECYCLE_EXTRA_CANDIDATES`, while tables outside suffixes/extras still evade the gate. Its own report
measured many declared tables with no decision. That is patching examples, not closing the class.

## Required implementation

1. Preserve and finish the F1/F2 behavior already in `3841bbfba`: purge must remove
   `manual_patient_commands`, `patient_diary_day_snapshots`, `patient_practice_completions` and null only
   `specialist_tasks.patient_user_id` while retaining the specialist's task.
2. Replace the suffix/extra-name candidate heuristic with exhaustive coverage of the independent declaration
   oracle. Every declared physical table must be in exactly one of:
   - the full lifecycle registry, with all applicable retention/purge/scheduler facts; or
   - a structured non-lifecycle decision that states why it is not a journal/temp store and explicitly states
     account-purge and organization-purge semantics (including explicit `not-user-scoped` / `not-org-scoped`).
   A bare reason string is not sufficient.
3. Do not invent a second registry or a parallel table list. Extend/parameterize the existing
   `journal-lifecycle-registry.ts` and its existing contract test. Remove suffix/extra candidate machinery once
   exhaustive coverage makes it redundant.
4. Classify the entire current declaration, not just names that resemble logs. Use the real schema/declaration,
   existing purge code, FK definitions and call sites. Do not guess from table names. If a genuine product-policy
   choice has no owner authority, encode a stable owner-question in the existing registry rather than leaving the
   table unclassified or choosing deletion/retention yourself.
5. The gate must fail if an auditor injects an arbitrarily named new table such as
   `public.bcb_probe_sms_deliveries`, regardless of suffix. It must also fail on a bare/non-structured exception,
   duplicate classification, missing user/org purge semantics, or a lifecycle entry with an unexecutable decided
   window.
6. Reconcile onto the current `feat/doctor-ui-rebuild` before implementation. Current feat already resolved
   message/media purge truth and actor-FK policy; preserve the newer truth. Do not reintroduce retired
   `integrator_user_id`, raw post-purge identity, or stale OQ2–OQ5 prose from the older base.
7. Update the active systemic plan only where needed to state factual completion/evidence. Do not rewrite archive
   reports.

## Validation and evidence

- Run the existing lifecycle contract suite and prove the arbitrary-name injection makes it red, then revert the
  injection and show green.
- Run the existing rollback-only purge proof only on named DEV if needed by repository rules; never mutate TEST.
- Run scoped typecheck/lint and `git diff --check`.
- No full CI and no deploy.
- In the final report, give exact commands beside every count/result, list any owner-question with the exact missing
  decision, and name the commit. A green test without the arbitrary-name fault injection is not acceptance.

Write progressive notes to
`/home/dev/brain/runs/agent-port/complete-lifecycle-census-20260828.md`; do not end while a foreground command is
still running.
