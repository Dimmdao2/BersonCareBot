# Audit Track D D7→D21 reminder action bridge

## Тест или взгляд

Это повторяемое security/product поведение: нужен blind kill-set, inspection SQL/ACL/diff и поведенческий
PostgreSQL acceptance. Следовать `AGENTS.md` §1, §4a, §5, §7–§10 и §24. Authority:
`docs/_TODO/runs/briefs/TRACK_D_REMINDER_ACTIONS_PRODUCT_BRIDGE_BRIEF.md` и D7/D21 в
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`.

Аудировать product commit `6fdc15670` в `wt/trackd-reminder-actions`. До чтения его acceptance-test записать
kill-set минимум для: atomic history+operational reschedule; exact actor/org; retry/replay; rollback при
отсутствующей operational строке; отсутствие runtime table grants; неизменность применённой `0314`; due semantics
done/skip/mute; сохранение D5 canonical rule read.

Известный результат оркестратора: новый PostgreSQL тест пока падает в fixture setup с `42501` при INSERT в
`integrator.user_reminder_occurrences`, потому что fixture отключает RLS только public-таблицам. Это не verdict
продукта. Аудитор вправе минимально исправить только acceptance fixture, закоммитить test/audit artifact и затем
получить бинарный product verdict. Cleanup после partial setup обязан стать безопасным. Production fix аудитор не
делает.

Запустить правильный config:

`pnpm --dir apps/webapp exec vitest run --config vitest.postgres.config.ts src/infra/repos/reminderCallbackCapabilities.postgres.integration.test.ts --reporter verbose`

Также: targeted integrator reminder tests, оба typecheck, scoped lint, raw-SQL gate, journal/freeze gates и
`git diff --check`. Один fault injection на каждый независимый класс; временные production-поломки откатить.

Отчёт сохранить в `docs/_TODO/runs/integrator-cleanup/D7_D21_REMINDER_ACTION_BRIDGE_AUDIT.md`. Один commit может
содержать только исправленный acceptance-test и отчёт. Ничего не push/land, не трогать общий `feat`, DEV/TEST/PROD,
CMS/тарифы/billing/booking/clinic channels. D7/D21/taskdb не закрывать.
