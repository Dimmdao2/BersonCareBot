# D30 Ш3, круг 2 — закрытие блокеров снятия legacy-sweep, 2026-08-23

Источник: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D30 (3).
Исправлены ровно Б1–Б3 из
`docs/_TODO/runs/integrator-cleanup/D30_SWEEP_REMOVAL_AUDIT_2026-08-23.md`.

## Б1 — постоянный сторож write-time producer

Добавлен `apps/webapp/src/infra/repos/pgSpecialistTasks.writeTimeProducer.unit.test.ts`:

- `create` и `update` требуют ровно один вызов корня на той же транзакции с
  `SPECIALIST_TASK_REMINDER_SUPERSEDED` и непустым `deliveries`;
- `complete` требует пустое поколение с `SPECIALIST_TASK_REMINDER_CANCELLED`;
- `delete` требует пустое поколение с `SPECIALIST_TASK_REMINDER_DELETED` и вызов корня до удаления задачи.

Зелёный итоговый прогон:

```bash
pnpm --dir apps/webapp exec vitest --run \
  src/infra/repos/pgSpecialistTasks.writeTimeProducer.unit.test.ts \
  src/modules/specialist-tasks/service.mechanicWriteClearance.test.ts --reporter=dot
# 2 файла, 6 тестов — PASS
```

Fault injection выполнена четырежды одной командой после последовательного снятия соответствующего вызова в
`apps/webapp/src/infra/repos/pgSpecialistTasks.ts`:

```bash
pnpm --dir apps/webapp exec vitest --run \
  src/infra/repos/pgSpecialistTasks.writeTimeProducer.unit.test.ts --reporter=verbose
```

Результат каждой инъекции:

| Снятый вызов | Покрасневший тест | Результат |
| --- | --- | --- |
| `create` | `create materializes the reminder generation in the task transaction` | 1 failed / 3 passed |
| `update` | `update rematerializes the reminder generation in the task transaction` | 1 failed / 3 passed |
| `complete` | `complete cancels the reminder generation in the task transaction` | 1 failed / 3 passed |
| `delete` | `delete terminates the reminder generation before deleting the task` | 1 failed / 3 passed |

После каждой инъекции production-код восстановлен; итоговая точная перепись снова показывает четыре вызова:

```bash
rg -n "replaceSpecialistTaskReminderGeneration" apps/webapp/src/infra/repos/pgSpecialistTasks.ts
# строки 119, 159, 191, 207
```

## Б2 — снято тело sweep

До удаления перепись через `code-search`, затем точный поиск

```bash
node /home/dev/brain/tools/code-search.mjs \
  "enqueueDueReminders listDueReminders specialist tasks" --repo bcb -k 30
rg -n "enqueueDueReminders|listDueReminders" apps deploy docs \
  --glob '!docs/archive/**' --glob '!docs/_TODO/runs/**'
```

показала только порт, сервис, PostgreSQL/in-memory реализации и тестовый мок; нетестового вызывающего не было.
Удалены оба метода из `SpecialistTasksPort`, сервиса, `pgSpecialistTasks`, in-memory реализации и мока
`service.mechanicWriteClearance.test.ts`. Их отдельные тесты отсутствовали. Write-time producer и очередь не
менялись.

После удаления та же точная команда находит только строку исторического статуса аудита в
`docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`; в `apps/**` и `deploy/**` совпадений нет.

## Б3 — исправлена декларация путей и перегенерированы права

Из `REV10_CLINICAL_ACCESS['public.specialist_tasks'].codePaths` сняты:

- удалённый `apps/webapp/src/modules/specialist-tasks/dispatchDueReminders.ts`;
- живой, но больше не относящийся к relation путь
  `apps/webapp/src/modules/operator-health/reconcileJobKeys.ts`.

Генерация выполнена штатным CLI, без `--execute`:

```bash
node deploy/postgres/privileges/generate-cli.mjs --all
node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only
node deploy/postgres/privileges/generate-cli.mjs --all --check
# privileges/org-allowlist для bcb_webapp_dev и bersoncarebot_test совпали побайтово
```

Дополнительные гейты:

```bash
node --test deploy/postgres/privileges/relation-access.test.mjs
# 43/43 PASS
node deploy/postgres/privileges/generate-cli.mjs --census
node deploy/postgres/privileges/generate-cli.mjs --census --db bersoncarebot_test
# обе базы: 217 ACTIVE отношений по 3298 production-файлам — PASS
node deploy/postgres/privileges/generate-cli.mjs --gaps
# обе базы: unresolved=0, gaps=0
```

**Решение по гейту существования пути: да, усилить стоит.** Проверка существования файлов из `codePaths`
(с отбрасыванием допустимого `#anchor`) дёшево и прямо поймала бы удалённый `dispatchDueReminders.ts`. Она не
поймает семантически устаревший, но существующий путь вроде `reconcileJobKeys.ts`, поэтому это полезный
минимальный гейт, а не доказательство актуальности callsite. Сам гейт в этом круге не менялся.

## Остальная проверка и границы

```bash
pnpm --dir apps/webapp run typecheck
# PASS
pnpm --dir apps/webapp exec eslint \
  src/infra/repos/pgSpecialistTasks.ts \
  src/infra/repos/inMemorySpecialistTasks.ts \
  src/infra/repos/pgSpecialistTasks.writeTimeProducer.unit.test.ts \
  src/modules/specialist-tasks/ports.ts \
  src/modules/specialist-tasks/service.ts \
  src/modules/specialist-tasks/service.mechanicWriteClearance.test.ts
# PASS
git diff --check
# PASS
```

`./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges` не зелёный: на неизменённых этим
кругом `declaration.ts:3981` и `:7147` уже лежат два литерала evidence, не входящие в union из `types.ts`.
`git diff --quiet -- deploy/postgres/privileges/declaration.ts deploy/postgres/privileges/types.ts` вернул 0;
вне трёх блокеров этот долг не исправлялся. Исполняемые generator/test/census/gaps-гейты выше зелёные.

`--execute`, DEV/TEST/PROD, миграции, plan-checkbox, push не выполнялись.
