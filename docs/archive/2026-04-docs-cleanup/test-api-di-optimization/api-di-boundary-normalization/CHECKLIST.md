# CHECKLIST — API DI / import-boundary track

- [x] Все `route.ts` под `app/api` перечислены; для 58 infra-роутов заполнена таблица в `INVENTORY.md`.
- [x] Текущие импорты audited (не только `@/infra`, но и «толстые» `@/modules` при необходимости).
- [x] Политика allowed/restricted/exceptions записана в `PLAN.md` и согласована с `EXECUTION_RULES.md`.
- [x] Исключения из политики имеют rationale (почему нельзя / нецелесообразно прятать в deps).
- [x] Порядок кластеров в `PLAN.md` обоснован (риск, зависимость от трека A checkpoint).
- [x] Для каждого изменённого endpoint зафиксированы parity assertions (тест или явный чеклист в PR).
- [x] Enforcement: ручной/CI `rg '@/infra/' apps/webapp/src/app/api --glob '**/route.ts'` → пусто; см. `ALLOWLIST_REMAINING_INFRA_ROUTE_IMPORTS.md`.
- [x] Синхронизация `api.md` / `di.md` после кода (`LOW_LEVEL_*` — по-прежнему опционально отдельной арх. задачей).
- [x] Перед merge/push в remote: `pnpm run ci` зелёный; между коммитами — step/phase по test-execution-policy, не полный CI «на всякий случай».
- [x] `.github/workflows/ci.yml` не меняли без внешнего решения (в инициативе — не менять).
