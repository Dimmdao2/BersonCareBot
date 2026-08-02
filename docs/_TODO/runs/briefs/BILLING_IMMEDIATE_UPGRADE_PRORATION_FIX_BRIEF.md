# Немедленное повышение тарифа — один fixer по денежным findings

## Authority

- `AGENTS.md` §§5, 7, 9–10, 24.
- `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md`, Р-14 / 5.6.
- `docs/_TODO/runs/billing/BILLING_IMMEDIATE_UPGRADE_PRORATION_AUDIT_REPORT.md` — единственный независимый аудит,
  коммит `6a7c65ece`; нового blind audit после fixer не запускать.

Источник оракула: audit report, Owner oracle — «an immediate upgrade charges the server-derived price difference
prorated over the remaining already-paid period; the new tariff and snapshot take effect only after confirmed
capture; paidThrough is unchanged; the next full period uses the full new-tariff price».

## Ровно три исправления

1. Классифицировать upgrade/downgrade относительно цены оплаченного snapshot, а не изменяемой live-цены текущего
   тарифа; target остаётся серверным активным тарифом.
2. Если следующий период старого тарифа уже оплачен до upgrade, не оставлять его недоплаченным и не позволять ему
   вернуть старый snapshot. Использовать существующие invoice/subscription/payment paths, без второго биллинга.
3. Capture upgrade-счёта применяет snapshot только к тому оплаченному периоду, для которого рассчитана доплата;
   поздний capture после смены периода не меняет новый период.

## Граница и приёмка

- Исправить production-код минимально по трём сохранённым красным тестам в `service.test.ts`; не менять тесты так,
  чтобы ослабить сценарии.
- Повторить все targeted команды из audit report, typecheck, scoped lint и `git diff --check`.
- Документацию Р-14/5.6 обновить фактом только после зелёного сохранённого oracle и land; DEV/TEST/PROD не трогать.
