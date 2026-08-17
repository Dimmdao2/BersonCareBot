## ИТОГ

Исправления закоммичены: `ccbe94538` (`fix(entitlements): make lifecycle door migration reachable #1069`). Push, merge и live DEV/TEST migration не выполнялись.

### Fix 1 — миграция двери

**Было:** SQL двери находился в уже существующей `0276`; базы с watermark `0276` его пропускали.

**Изменено:**

- [0276 восстановлена до исходного окончания](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0276_access_lifecycle_ladder_local.sql:140).
- Создана временная [0277_organization_mechanic_access_door_local.sql](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0277_organization_mechanic_access_door_local.sql:1).
- Функция использует `CREATE OR REPLACE`; owner, ACL и grants повторно применяются [в конце миграции](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0277_organization_mechanic_access_door_local.sql:180).
- Добавлена [journal-запись 0277](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/meta/_journal.json:1944).

Безопасность:

- Если `0276` уже применена без двери — новый watermark `0277` создаст её.
- Если `0276` ещё не применена — Drizzle последовательно применит `0276`, затем `0277`.
- Если дверь уже появилась из изменённой `0276`, `CREATE OR REPLACE` обновит тот же объект, а grants идемпотентно восстановятся. Rehearsal применяет `0277` дважды подряд и проходит.

**Проверки:** journal sync — `OK`; `0276` побайтно соответствует состоянию до append; PostgreSQL rehearsal — `PASS`.

### Fix 2 — два UI-теста

**Было:** fake port не реализовывал `resolveMechanicAccess`; исходный запуск дал `2 failed` с `TypeError: port.resolveMechanicAccess is not a function`.

**Изменено:** fake теперь возвращает реальный `MechanicAccessResolution` для grace/disabled состояний: [accessLifecycleSurfaces.ui.test.tsx:117](/home/dev/dev-projects/bcb-wt-[redacted-token].ui.test.tsx:117).

**Запуск:** `vitest run src/app/app/accessLifecycleSurfaces.ui.test.tsx` → `2 passed`.

### Fix 3 — PostgreSQL rehearsal

**Было:** доказывались лишь наличие функции, grace и terminal disabled.

**Изменено:**

- Применение новой миграции и повторная идемпотентная установка: [rehearsal:194](/home/dev/dev-projects/bcb-wt-tariff/docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md:194).
- Отсутствующий и mismatched principal: [rehearsal:255](/home/dev/dev-projects/bcb-wt-tariff/docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md:255).
- `payments`/`branding` проходят full → grace → read-only → disabled: [rehearsal:312](/home/dev/dev-projects/bcb-wt-tariff/docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md:312).
- Read-only возвращает строку, но `mutation_allowed=false`: [rehearsal:380](/home/dev/dev-projects/bcb-wt-tariff/docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md:380).
- `patient_card` остаётся full-access при сохранённом `false`: [rehearsal:445](/home/dev/dev-projects/bcb-wt-tariff/docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md:445).

Mutation-прогоны дали ожидаемые ошибки:

- `ERROR: mismatched lifecycle door call unexpectedly succeeded`
- `ERROR: read_only_read_allowed_mutation_refused_contract_failed`
- `ERROR: critical_mechanic_unlatchable_contract_failed`
- `ERROR: payments_branding_full_access_ladder_contract_failed`

Финальный rehearsal: `E1/C5A entitlement closure disposable PostgreSQL rehearsal: PASS`.

### Targeted gate

- Webapp typecheck/lint — успешно.
- Integrator typecheck/lint — успешно.
- Service test — `14/14`.
- PG port test — `3/3`.
- Integrator direct-write test — `3/3`.
- UI surfaces — `2/2`.
- `bash -n deploy/host/deploy-test-saas.sh` — успешно.
- Full CI не запускался.
- Billing, mock-payment routes, план и канон не изменялись.
- Предсуществующие десять env-изменений остались вне коммита.