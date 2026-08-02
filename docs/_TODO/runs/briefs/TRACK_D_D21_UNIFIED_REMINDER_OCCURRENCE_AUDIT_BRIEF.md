# Тест или взгляд: Track D D21 unified occurrence

Это независимый `auditor-live` после product commit ветки `wt/trackd-d21-unification`. Канон исполнения —
`AGENTS.md` §10a/§10b/§24. Authority и полный acceptance —
`docs/_TODO/runs/briefs/TRACK_D_D21_UNIFIED_REMINDER_OCCURRENCE_BRIEF.md`, исходное решение —
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` Р-D21/D21.

## Сначала классификация

Тестом проверяются достижимое поведение, tenant/security границы, idempotency, migration сохранности и отсутствие
двойной доставки. Взглядом проверяются границы модулей, отсутствие второго scheduler/runtime consumer, scope и
минимальные grants. Style, альтернативная архитектура и hardening без достижимого сценария findings не являются.

## Обязательный независимый kill-set

Не доверять только тестам исполнителя. Временно внести и полностью откатить минимум по одной поломке каждого
дорогого класса:

1. правило без bot identity не планируется либо планируется дважды;
2. Web Push action снова использует legacy occurrence id / skip пишет reason;
3. первый messenger leg гасит sibling либо retry повторяет уже успешный sibling;
4. stale generation после snooze доходит до provider либо replay увеличивает generation второй раз;
5. done/skip/mute/topic-disable не останавливает соответствующие queued legs;
6. foreign tenant/user получает доступ к occurrence;
7. migration теряет накопленное расписание или актуальный pending state.

Для каждого класса записать точную поломку, красную команду и поймавший тест. Если существующий тест не ловит
реальный дефект, оставить минимальный behavioral acceptance test. Все временные product mutations откатить.

## Проверки и вердикт

Запустить scoped integrator/webapp behavioral suites, migration/capability PostgreSQL proof, оба typecheck,
scoped lint, `node scripts/check-no-new-raw-sql.mjs`, `git diff --check`. Проверить `rg`/callgraph: удалённые
webpush-only scheduler, internal tick, cron/deploy reference и legacy table не имеют live consumers; scheduler
не вычисляет бизнес-расписание/текст самостоятельно. Полный CI и PROD запрещены.

Оставить один audit report с числом убитых/непойманных классов и одним вердиктом `PASS К LAND` либо
`MUST FIX`. Product fix аудитор не делает. Допустимы только audit report и необходимые acceptance tests;
закоммитить их в той же ветке.
