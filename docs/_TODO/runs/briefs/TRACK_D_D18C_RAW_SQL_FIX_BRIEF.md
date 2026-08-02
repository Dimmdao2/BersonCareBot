# Track D D18c — fix по сохранённому oracle

Канон: `AGENTS.md` §5, §10, §24;
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` Р-D18/D18c.
Продуктовый коммит: `034f79100`. Oracle:
`docs/_TODO/runs/integrator-cleanup/D18C_FINAL_RAW_SQL_INDEPENDENT_AUDIT_2026-08-03.md`.

Источник оракула: `docs/_TODO/runs/integrator-cleanup/D18C_FINAL_RAW_SQL_INDEPENDENT_AUDIT_2026-08-03.md` —
«MUST FIX — класс 5 (kill-set), webapp-граница осталась directory-wide, а не поимённой».

Исправить единственный MUST FIX без нового blind-аудита:

- заменить directory-wide разрешение raw SQL для `apps/webapp/src/infra/db/` на минимальный поимённый allowlist
  реально необходимых low-level DB boundary-файлов;
- доказать self-test/fault injection, что новый произвольный production-файл с `.query()` внутри этой директории
  блокируется;
- добавить вариацию `retryThreshold` в существующий projection-health тест, закрыв отмеченный oracle пробел класса 2;
- выполнить targeted tests, raw-SQL census/self-test, integrator/webapp typecheck, scoped lint и `git diff --check`;
- закоммитить исправление и короткий fix evidence. DEV/TEST/PROD не трогать.
