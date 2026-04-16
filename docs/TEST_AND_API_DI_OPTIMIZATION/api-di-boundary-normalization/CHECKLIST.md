# CHECKLIST — API DI / import-boundary track

- [ ] Все `route.ts` под `app/api` перечислены; для 58 infra-роутов заполнена таблица в `INVENTORY.md`.
- [ ] Текущие импорты audited (не только `@/infra`, но и «толстые» `@/modules` при необходимости).
- [ ] Политика allowed/restricted/exceptions записана в `PLAN.md` и согласована с `EXECUTION_RULES.md`.
- [ ] Исключения из политики имеют rationale (почему нельзя / нецелесообразно прятать в deps).
- [ ] Порядок кластеров в `PLAN.md` обоснован (риск, зависимость от трека A checkpoint).
- [ ] Для каждого изменённого endpoint зафиксированы parity assertions (тест или явный чеклист в PR).
- [ ] Выбран enforcement (ESLint / rg allowlist / тест) и заведена задача, если не внедрено в том же PR.
- [ ] Запланирована синхронизация `api.md` / `di.md` / `LOW_LEVEL_*` после кода.
- [ ] Перед merge/push в remote: `pnpm run ci` зелёный; между коммитами — step/phase по test-execution-policy, не полный CI «на всякий случай».
- [ ] `.github/workflows/ci.yml` не меняли без внешнего решения (в инициативе — не менять).
