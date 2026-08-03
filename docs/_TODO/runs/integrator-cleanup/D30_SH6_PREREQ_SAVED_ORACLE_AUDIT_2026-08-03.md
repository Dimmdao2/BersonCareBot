# D30 Ш6 prerequisite — saved-oracle audit

**Дата:** 2026-08-03
**Product candidate:** `6f8e8a011f161527696f5e48dc09c86b8e70b582` + `0359a5c240986c6a04ea86846f60476c2581a1cc` + `2de1e01e45b41d8b701d7a6a144799f1b0e128c3`
**Вердикт:** PASS

## Authority и граница

Проверен только сохранённый kill-set prerequisite D30 Ш6 из
`D30_SCHEDULER_REVERSAL_PLAN.md`: advisory lock до обоих тел, независимая cadence health-probe,
single-flight tenant sweep, безопасная изоляция rejection и неизменность product-конфига/cron.
DEV, TEST, PROD, land, миграции и product-ветка не изменялись.

## Saved oracle

| Требование | Evidence | Вердикт |
|---|---|---|
| Lock проверен до запуска org/health | Временный перенос `startOrganizationTickIfIdle()` перед `assertLockStillHeld()` дал 2 RED в `schedulerLockedTick.unit.test.ts`: initial и later lock loss начали org body | PASS |
| Медленный org sweep не блокирует health и не дублируется | Barrier-test сохраняет 2 health tick при 1 org sweep; удаление single-flight guard дало RED `2` вместо `1` | PASS |
| Org rejection не подавляет health | Targeted test вызывает health и отдельный reporter после rejected org sweep | PASS |
| Reporter rejection не выходит как `unhandledRejection` | Correct candidate: listener получил 0 событий, tracked sweep оставался pending до reporter barrier, следующий sweep стартовал только после его завершения | PASS |
| Containment действительно await'ится | Точная временная мутация `await deps.onOrganizationTickError(error)` → `void deps.onOrganizationTickError(error)` детерминированно дала RED: `sweepsWhileReporterPending` стало `2`, ожидалось `1` | PASS |
| После завершения reporter single-flight очищается | Saved oracle запускает следующий cadence и получает второй org sweep / второй reporter call | PASS |
| Конфиг/interval/quiet/provider не изменены | Product diff содержит только scheduler coordinator/main и tests; `operatorHealthProbeTick.unit.test.ts` подтверждает due interval, disabled, quiet window и invalid lastRunAt | PASS |
| Cron/route/registry/docs не сняты; миграции нет | `git diff --name-only 6f8e8a011f^ 2de1e01e4` ограничен четырьмя scheduler-файлами; deploy/webapp/docs/db отсутствуют | PASS |

## Выполненные проверки

- `pnpm --dir apps/integrator exec vitest --run src/infra/runtime/scheduler/schedulerLockedTick.unit.test.ts src/infra/runtime/scheduler/operatorHealthProbeTick.unit.test.ts src/infra/runtime/scheduler/schedulerDecisionGuard.test.ts` → `3 passed`, `22 passed`.
- После восстановления exact candidate: `schedulerLockedTick.unit.test.ts` → `5 passed`.
- `pnpm --dir apps/integrator run typecheck` → PASS.
- `pnpm --dir apps/integrator run lint` → PASS; `check-queue-port-boundary: OK`.
- `git diff --exit-code 2de1e01e45b41d8b701d7a6a144799f1b0e128c3 --` в product-worktree → exit `0`.

## NOT DONE

Пусто в границе prerequisite-а. Снятие внешнего cron и live-наблюдение `lastRunAt` относятся к самому Ш6,
не к этому prerequisite commit.
