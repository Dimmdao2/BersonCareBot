# Track D / D30 — remove incompatible old mechanics from current plans

Роль: same-branch docs worker/fixer в `wt/trackd-plan-hygiene-20260821`. Это один механический correction pass
по первому результату `647c672d4`; новый аудит не нужен.

Перед правками прочитать карту `AGENTS.md`, §«Как решать, что делать», §0, §1 checkbox rules, §7, §12 и §24;
повторить `code-search` более поздних owner-решений, затем точный census в `docs/OWNER_DECISIONS.md`, актуальном
`WORK_ORDER.md` и текущих D30/DB-privilege планах. Более позднее решение заменяет brief.

Источник оракула: `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` —
«Bounded docs worker removes incompatible drain/29.08/DROP mechanics from current D30/handoff/active DB-privilege plans instead of preserving two formulations».

## Scope

- `docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md`
- `docs/_TODO/runs/integrator-cleanup/TRACK_D_ORCHESTRATION_HANDOFF_2026-08-21.md`
- `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`
- `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`
- `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS_TABLES.md`
- новый result `docs/_TODO/runs/integrator-cleanup/TRACK_D_D30_OWNER_DECISION_PLAN_HYGIENE_FIX_RESULT_2026-08-21.md`

`docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/AUDIT_LOG.md`, reports, evidence, архивы, завершённые audit records и
исторические логи не менять.

## Что исправить

1. В current D30 plan и handoff полностью убрать несовместимые старые инструкции про перенос/drain/ожидание
   29.08/PROD re-measure/DROP отсутствующей `integrator.message_retry_jobs`. Не оставлять их зачёркнутыми,
   под баннером `УСТАРЕЛО/ЗАМЕНЕНО` или как второй активный вариант: история уже в Git и завершённых evidence.
2. Оставить одну текущую D30 формулировку: открыта реальная scheduler/topology работа — worker+scheduler в одном
   resident process/systemd unit, один lock/loop, `SKIP LOCKED`, перенос действительно существующих scheduled jobs.
   Не закрывать D30 без code/runtime evidence.
3. Удалить те же stale executable/backreference statements из активных DB-privilege PLAN/FINDINGS; не переписывать
   их audit history и не расширять продуктовый scope.
4. В WORK_ORDER закрыть D39 `[x]` существующим уже приземлённым PASS evidence: census/fix/audit SHAs из очереди
   и `docs/REPORTS/D39_*`; не запускать повторный аудит и не заявлять новую работу. Остальные галочки менять только
   при точном доказанном противоречии.
5. Результат перечисляет exact removed active matches, оставшиеся historical-only matches и актуальный следующий
   D30 step. Никаких новых планов/сущностей.

## Проверки и commit

- `git diff --check`; exact `rg` по пяти active scoped files не оставляет исполняемой drain/29.08/DROP-механики
  и подтверждает ровно один текущий D30 route.
- Проверить D39 SHAs командами `git merge-base --is-ancestor <sha> feat/doctor-ui-rebuild` и записать команды,
  не по памяти.
- Docs-only: не менять код, миграции, AGENTS/canon, DB, DEV/TEST/PROD, deploy, ветки; full CI не нужен.
- Явный staging только scoped paths, без `git add -A`; commit должен назвать `#987`, доказательство и
  `NOT DONE: D30 implementation / landing / TEST / deploy / push / full CI`.
