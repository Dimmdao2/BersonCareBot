# Audit D30 Ш7 — stale legacy appointment reclaim/drain

## Тест или взгляд

- Повторяемая race/crash/lease semantics — blind kill-set, disposable PostgreSQL и fault injection.
- Разовое отсутствие conversion/drop/producer и сохранность полей — diff/AST/DB inspection, не source-text tests.

## Authority

- Прочитать `AGENTS.md`, особенно §5, §10a–§10b и §24.
- `docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md`, Ш7.
- `docs/_TODO/runs/integrator-cleanup/D30_SH7_LEGACY_DRAIN_BRIEF_2026-08-03.md`.
- Product candidate: `a521ca4d2` в `wt/trackd-d30-sh7-drain`.

Оракул: active legacy count должен штатно прийти к нулю без потери/ранней отправки/дубля; drop разрешён только
после наблюдаемого zero-write периода. Этот candidate обязан быть обратимым и table/consumer не удаляет.

## Независимая проверка

Kill-set до чтения candidate tests. Минимально:

1. Два concurrent reclaim/worker не claim одну строку дважды; live processing younger lease не отбирается.
2. Stale boundary и clock semantics точны; reclaim сохраняет `next_try_at`, attempts, payload и delivery ladder.
3. Crash до finalize возвращает ту же строку в повторный claim без новой строки/потери; повторный reclaim идемпотентен.
4. Future pending 20 rows не отправляются/переносятся раньше due; TG→MAX/one-channel, first-success и Web Push sibling
   старого consumer сохранены.
5. Reclaim реально вызывается в resident worker cadence и ошибка локализована без остановки основной queue.
6. No-new-legacy-producer gate остаётся; нет conversion/enqueue window, raw SQL/import/DB-port обхода.
7. Нет миграции, environment writes и premature `DROP`; документ не ставит Ш7 `[x]`.

Аудитор не чинит product. Можно закоммитить только новые acceptance tests и audit-report; fault injection production
обязательно откатить. Вердикт PASS/FAIL с exact commands и kill-set counts. Не трогать DB/env/deploy/DEV/TEST/PROD,
D27, тарифы/CMS и общий `feat`.
