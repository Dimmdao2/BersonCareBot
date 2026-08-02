# Тест или взгляд: Track D D18c production raw SQL boundary

Независимый `auditor-live`. Канон — `AGENTS.md` §5, §10a/§10b, §24. Authority —
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` Р-D18/D18c,
`docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` §«Порядок работ» п.1 и worker brief
`docs/_TODO/runs/briefs/TRACK_D_D18C_RAW_SQL_FINAL_BRIEF.md`.

## Классификация

Взглядом/AST проверяются zero production debt, честность named boundaries и отсутствие нового allowlist. Поведением
проверяются эквивалентность projection-health runtime/CLI, параметры SQL fragments и exit semantics. Тестировать
строки исходника вместо поведения запрещено.

## Kill-set до чтения тестов

1. projection-health теряет один из счётчиков/status/oldest/success metrics;
2. параметры фильтра/limit перестают связываться либо CLI получает другую форму результата;
3. DB error/threshold меняет прежний exit code CLI;
4. новый production `.query()` проходит direct, alias/bind, destructuring, computed/optional/dynamic или через
   re-exported helper;
5. обычный production repository ошибочно классифицируется как low-level DB boundary;
6. законный Drizzle `execute(sql\`...\`)`, migrator или test-only PostgreSQL harness блокируется.

Временно внести и откатить по одной поломке каждого повторяемого класса. Недостающие acceptance-тесты можно
оставить; product fix аудитор не делает.

## Проверки и вердикт

Запустить exact census/self-test, projection-health unit/CLI tests, integrator/webapp typecheck, scoped lint,
`git diff --check`. Если безопасно без shared DEV/TEST/PROD, использовать существующий disposable PostgreSQL harness
для сравнения SQL/result/exit semantics; иначе доказать compiled SQL + adapter contract и назвать ограничение без
ложного live claim. Проверить diff от current feat: D21/reminders, CMS/tariffs/billing не затронуты.

Оставить один report и verdict `PASS К LAND` либо `MUST FIX`, с числом убитых/непойманных классов. Допустимы только
acceptance tests/report; временный product diff откатить; explicit staging, commit, no push, clean tree.
