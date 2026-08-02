# 0307 — финальный combined CI перед land

Роль: механический worker. Единственный канон правил — `AGENTS.md`; прочитать §9–§10 и §24. Authority работы —
`docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5.6 и принятый независимый отчёт
`docs/_TODO/runs/tariff/TARIFF_CHANGE_PAID_PERIOD_INDEPENDENT_AUDIT_2026-08-02.md`.

Источник оракула: `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5.6 — «повышение сразу;
понижение с начала следующего расчётного периода»; объём файлов переход не блокирует, а новая загрузка
заморожена до попадания в предел.

## Задача

На текущем HEAD `wt/tariff-change-paid-period`, уже содержащем актуальный `feat`, выполнить через общий host-lock:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm install --frozen-lockfile && pnpm run ci"
```

Если прогон зелёный — ничего не менять и сообщить точную команду, SHA и итог. Если падает — исправить только
доказанную regression этого объединённого diff минимальной правкой, прогнать разрешённый resume-gate и targeted
проверку. Устаревший тест обновлять под принятое поведение, продукт под старое ожидание не откатывать.

## Границы

- Не менять смысл тарифной формулы и не придумывать цену self-service upgrade: этот путь обязан оставаться
  fail-closed `saas_billing_upgrade_charge_policy_unresolved` без provider side effect.
- Не трогать DEV/TEST/PROD и не применять миграции; это только repo-level CI.
- Не добавлять новую сущность, harness, migration, plan или тест ради теста.
- Не ослаблять gates, assertions, typing или raw-SQL boundaries.
- Коммитить только если потребовалась минимальная реальная правка; явные пути, без `git add -A`.

## Готовность

- точный full-CI либо канонический resume после зафиксированного сбоя — PASS;
- `git diff --check` — PASS;
- дерево чисто; все изменения, если они были необходимы, закоммичены с `#1057 #1069`;
- в отчёте названы команда, SHA, числа тестов/конкретный failure и почему правка была необходима.
