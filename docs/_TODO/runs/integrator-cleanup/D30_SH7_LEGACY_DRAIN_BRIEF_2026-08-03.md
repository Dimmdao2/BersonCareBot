# D30 Ш7 — безопасный reclaim/drain legacy appointment queue

## Authority и канон

- Сначала прочитать `AGENTS.md`, особенно §1, §5, §7, §9–§10 и §24.
- Owner-plan: `docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md`, пункт **Ш7**.
- Общий checklist: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, пункт **D30**.
- База для работы: текущая голова `feat/doctor-ui-rebuild` после land `25a6c11a7` и DEV apply migration `0339`.

Источник оракула: `D30_SCHEDULER_REVERSAL_PLAN.md` §Ш7 — «Гейт: дренаж — `SELECT count(*) FROM integrator.message_retry_jobs WHERE status IN ('pending','processing')` равен нулю и держится нулём наблюдаемый период; только после этого — снос таблицы и кода».

## Измеренная реальность DEV (read-only, 03.08)

- `integrator.message_retry_jobs`: `113` строк всего; active `24` = `20 pending` + `4 processing`.
- Все active имеют старую appointment payload shape: `booking/intent/retry/targets/webappPushNotify`.
- `pending` созданы до cutover и назначены на 06–29.08; четыре `processing` протухли с due 25–28.07.
- Новая `public.outgoing_delivery_queue`: appointment-reminder total/active `0/0` сразу после apply `0339`.
- Новый producer больше не пишет legacy; executable no-new-producer gate уже принят.

## Задача worker

Довести **обратимую drain-механику**, не выполнять необратимый drop и не трогать окружения:

1. Найти фактическую причину вечного `processing`; добавить race-safe lease/reclaim через существующий repo/порт, без raw SQL из нового production-кода и без ручного DB-update.
2. Обеспечить сохранный дренаж 20 будущих appointment-доставок в единую очередь либо через совместимый consumer — выбрать минимальный путь, который сохраняет исходные `next_try_at`, TG→MAX/одно-канальную ladder, Web Push sibling, first-success, policy/revalidation и не создаёт дубль при повторе/краше.
3. Доказать идемпотентность и crash/race safety в disposable PostgreSQL. Старые строки нельзя молча удалить, преждевременно отправить или потерять.
4. Сохранить/расширить gate, запрещающий новые legacy producers. Никаких новых обходов через прямые DB-импорты.
5. Обновить §Ш7 честным candidate evidence. **Не ставить `[x]`**, не удалять table/consumer: post-cutover zero-write период ещё не наблюдался.
6. Если нужна миграция — использовать temporary high branch number вне journal; финальный номер назначает лид после аудита и sync.

## Граница

- Разрешены затронутые integrator/webapp queue ports, worker/reclaim/drain code, targeted tests, temporary migration и документы Ш7.
- Не трогать D25 identity, тарифы/CMS/разминки, общую migration board, TEST/PROD/DEV DB, deploy и общий `feat`.
- Не возвращать старый producer. Не делать `DROP TABLE`.

## Готовность

- Один coherent product commit в `wt/trackd-d30-sh7-drain`, дерево чистое.
- Targeted unit/integration/disposable-PG, integrator typecheck/lint, queue/import/raw-SQL gates и `git diff --check` PASS.
- В отчёте: точные команды, fault cases (reclaim race, повтор conversion/drain, crash between enqueue/finalize, duplicate prevention), SHA и честный остаток до drop.
