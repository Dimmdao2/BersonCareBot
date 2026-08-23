# D30 Ш3 (3) — снятие legacy-sweep задач специалиста, 2026-08-23

## Результат

Удалены legacy sweep, internal route, operator-health registry entry, CSRF/infra-principal declarations и host-cron документация. Write-time producer `createPgSpecialistTasksPort` и единая `public.outgoing_delivery_queue` не изменялись.

`node /home/dev/brain/tools/cronport.mjs list` выполнен до правки: строки задачи специалиста нет; host-cron removal — no-op. `crontab` напрямую не вызывался.

## Проверки

- `grep -rn "specialist-task-reminders\|specialist_task_reminders_tick" . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git` после удаления возвращает только `docs/_TODO/runs/` и `docs/archive/`; активных путей нет.
- `node deploy/postgres/privileges/generate-cli.mjs --all`, затем `--all --port-context-only`, затем `--all --check` — DEV и TEST privilege/allowlist artifacts совпадают с декларацией побайтно.
- `node --test deploy/postgres/privileges/relation-access.test.mjs deploy/postgres/privileges/function-census.test.mjs` — 57/57 PASS.
- `pnpm --dir apps/webapp exec vitest --run src/infra/repos/pgSpecialistTaskReminderGenerationDoor.unit.test.ts` — 4/4 PASS. Обратный знак подтверждён: write-time generation вызывает `app.replace_specialist_task_reminder_generation`, передаёт queue payload с `eventId`, `channel`, `nextRetryAt`; затем `app.refresh_specialist_task_reminder_materialization` фиксирует материализацию.
- `pnpm --dir packages/db-principal run typecheck` и `pnpm --dir apps/webapp run typecheck` — PASS.
- `pnpm --dir apps/webapp run lint` — PASS (2 pre-existing warnings в `AppointmentPaymentSection.tsx`, ошибок 0).

Не выполнялись `--execute`, TEST/PROD изменения, deploy или push.
