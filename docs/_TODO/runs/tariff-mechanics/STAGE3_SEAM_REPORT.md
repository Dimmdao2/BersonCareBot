## ИТОГ

Item 3.1c реализован и закоммичен: `a43352274` (`fix(entitlements): centralize lifecycle door #1069`). Push/merge не выполнялись.

### Что построено

- Каноническая SQL-функция [0276_access_lifecycle_ladder_local.sql](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0276_access_lifecycle_ladder_local.sql:148) вычисляет состояние, источник политики, warning payload и `mutation_allowed`.
- Она требует совпадающий organization principal; отсутствие/несовпадение даёт `42501`, а не разрешающий пустой результат.
- `SECURITY DEFINER`, owner `app_owner`, EXECUTE строго для `app_staff` и `app_patient`: [grants](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0276_access_lifecycle_ladder_local.sql:321).
- Webapp TypeScript-вычислитель удалён. Webapp теперь вызывает SQL-дверь через [порт](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/ports.ts:22) и [PG-адаптер](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:248).
- Integrator diary/LFK вызывает ту же функцию в [writeDiaryLfkDirect.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:168) и разрешает запись только при `mutation_allowed = true`.

Авторитетной стороной стала база: только она одновременно доступна обоим процессам и читает живые tariff policy, exception и commercial state без cross-app import или дополнительного HTTP-звена. Расчёт состояния теперь существует ровно в одном месте.

### Deploy-контракт

- `expected_secdef_count`: `110 → 111`.
- Добавлены три обязательных SELECT-гранта `app_owner`.
- Добавлена двусторонняя exact-ACL проверка owner/security-definer/EXECUTE-набора: [deploy-test-saas.sh](/home/dev/dev-projects/bcb-wt-tariff/deploy/host/deploy-test-saas.sh:1526).
- Два процессных поведенческих контракта обновлены: [webapp](/home/dev/dev-projects/bcb-wt-[redacted-token].test.ts:90) и [integrator](/home/dev/dev-projects/bcb-wt-[redacted-token].test.ts:42).
- Частная PostgreSQL-репетиция проверяет principal refusal, `терпение`, terminal deny и exact ACL: [rehearsal](/home/dev/dev-projects/bcb-wt-tariff/docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md:242).

### Мутация

Функция временно переименована в integrator production-path. Результат:

```text
Test Files  1 failed (1)
Tests  2 failed | 1 passed (3)

Error: unexpected query: SELECT mutation_allowed
     FROM app.resolve_organization_mechanic_access_missing($1::uuid, $2::text)
```

После восстановления: `3 passed`.

### Literal search

```bash
rg -n --pcre2 --glob '*.{ts,tsx,js,mjs,cjs}' "(['\"])(?:no_trial|read_only|full_access|unconfigured|grace|disabled)\1|lifecycle[^\n]*(['\"])blocked\2|graceDays|readOnlyDays|terminalState" apps/integrator || true
```

Output: пустой.

### Проверки

- PostgreSQL rehearsal: `PASS`
- Webapp Vitest: `14 passed`, PG port: `3 passed`
- Integrator Vitest: `3 passed`
- Webapp/integrator typecheck и lint: успешно
- `bash -n deploy/host/deploy-test-saas.sh`: успешно
- Full CI не запускался.
- Plan/canon, billing и mock-payment routes не менялись. Предсуществующие десять env-изменений остались вне коммита.