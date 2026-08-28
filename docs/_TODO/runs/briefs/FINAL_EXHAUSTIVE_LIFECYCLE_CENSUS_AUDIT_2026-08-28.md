# Final independent audit — exhaustive lifecycle and purge census (#987)

## Тест или взгляд — классификация по пунктам (`AGENTS.md` §24.4)

- **Взгляд + read-only introspection:** полнота всех объявленных таблиц, корректность каждого `userPurge` /
  `orgPurge`, реальные FK, explicit-purge paths, writers/readers, via-parent chains, staff-only и absent-retired
  факты. Это разовое итоговое состояние; новый постоянный тест текста или списков его честно не докажет.
- **Поведенческий тест / fault injection:** произвольное новое имя, голое/неполное решение, двойная
  классификация, недостижимое окно хранения и реальные account-purge последствия. Это повторяемые дорогие и
  молчаливые отказы; переиспользовать существующий gate и rollback-only proof, не строить второй harness.
- **Живой rollback-only проход:** физический account purge и FK/RLS-поведение только существующей DEV-пробой;
  TEST — только read-only schema/data measurement. Полный CI, deploy и UI здесь ничего дополнительно не доказывают.

You are the independent `auditor-live`. Read `AGENTS.md` heading map first, then §5, §9–§10b and §24. Work only
in the fresh audit clone/branch supplied by the launcher. Audit candidate implementation commit
`603f5f7774d47e32dbc99453c0f15beb58111624`; do not edit product code, do not touch UI, env, taskdb, other
branches, PROD or domains, do not create a disposable database and do not run full CI. TEST may be inspected only
read-only; named DEV may be used only by the existing rollback-only proof. Commit only the audit report and any
genuinely necessary acceptance-test correction/addition allowed by §10a–§10b. Revert every fault injection.

## Authority and why this is a new audit surface

Source of oracle: `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, stage 3:

> Для каждой физической сущности зафиксировать: зачем существует, канонический ключ пользователя/клиники,
> cascade при account/org purge, terminal states, окно хранения, named prune root, scheduler и health signal.

> Приёмка этапа: автоматический census не допускает новую journal/temp таблицу без owner/retention/purge policy;
> живой account purge не оставляет ни одного связанного пользовательского факта вне явно сохранённых по закону.

The earlier independent audit is `docs/_TODO/runs/FINAL_SYSTEMIC_LIFECYCLE_AUDIT_2026-08-28.md`, F1–F3 and its
blind kill-set. Reuse that oracle and fault injection; do not invent scope. The original audit proved the suffix
heuristic incomplete, but it did not and could not audit the new candidate's 164 structured non-lifecycle decisions
or its new purge categories. That classification is a materially new surface and is the sole reason for this pass.

## Required independent verification

Before reading the candidate's lifecycle tests, write a compact kill-set from the authority. Then inspect the
implementation, live schema facts and writer/read call sites. This is an exhaustive audit, not a sample review:

1. Independently derive the complete set of physical tables from the canonical declaration and prove each appears
   exactly once in the existing lifecycle registry or its structured non-lifecycle decision map. No suffix/name
   heuristic, extra-name list, second registry or self-certifying candidate set may survive.
2. For every structured decision, verify `userPurge` and `orgPurge` against actual FK behavior, explicit purge code
   and relevant writers/readers. In particular, actively challenge all new categories: `via-parent` chains really
   reach a purged root; `staff-authored` references cannot point at the patient accepted by strict purge;
   `self-expiring` has a real bounded expiry/prune path; `absent-retired` is absent from both managed schemas;
   `not-user-scoped` / `not-org-scoped` do not hide raw person/clinic identity; `owner-question` is used only where
   authority truly leaves a product choice.
3. Re-run the earlier F1/F2 paths: `manual_patient_commands`, `patient_diary_day_snapshots`,
   `patient_practice_completions`, and retaining `specialist_tasks` while nulling only its patient reference.
   Confirm the two payment-history columns now retain the accounting rows but remove the purged person's raw id.
4. Search independently for person/org identifiers without FKs (including misleading column names and values copied
   by writers), and for tables reachable only through parent chains. A registry statement is not evidence for itself.
5. Verify decided retention windows still point to a real prune target, installed scheduler contract and health
   signal. Do not turn an unresolved owner choice into an invented retention/deletion policy.
6. Reuse the arbitrary-name injection `public.bcb_probe_sms_deliveries` and verify it is red, then revert it and prove
   the suite green. Also verify the gate catches a bare decision, a missing user/org decision, duplicate
   classification and an unexecutable decided window. Do not add source-text tests.
7. Inspect the existing rollback-only purge proof and run the targeted contract/purge checks appropriate to the
   candidate. Distinguish candidate regressions from already-recorded live divergences; do not call a known red gate
   green. No full CI and no deploy.

## Verdict and artifact

Return exactly `PASS, FOR LAND` or `FAIL, NOT FOR LAND`. Every finding must name a reachable owner-authorized
consequence, exact evidence and violated authority; style, alternative architecture and speculative hardening are
not findings. Explicitly report the exact commands beside every number, the complete list of missed kill-set classes
(including zero), whether all injections were reverted, the candidate SHA, and any remaining owner-question.

Write the report to `docs/_TODO/runs/FINAL_EXHAUSTIVE_LIFECYCLE_CENSUS_AUDIT_2026-08-28.md`, append one verdict row
to `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`, commit those allowed files, and leave the tree clean. Write
progress notes to `/home/dev/brain/runs/agent-port/final-exhaustive-lifecycle-census-audit-20260828.md`; do not end
while a foreground command is still running.
