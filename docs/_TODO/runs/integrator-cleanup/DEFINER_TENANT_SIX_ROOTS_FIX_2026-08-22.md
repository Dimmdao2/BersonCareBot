# D17 — замок организации перенесён в шесть DEFINER-дверей

**Ветка:** `wt/definer-tenant-gate-20260822`

**Оракул:** `D17_RELATION_READERS_2026-08-22.md` и пункт D17 в `WORK_ORDER.md`.

**Граница:** только шесть предъявленных корней. Стена записи, неарендные DEFINER-корни, deploy,
TEST, push и full CI не выполнялись. `--execute` не запускался.

## Итог

Предъявленный гейт зелёный без единой пометки `crossesTenantWall` на шести корнях. Решения ведущего
исполнены без замены:

| корень | изменение | причина |
|---|---|---|
| `assert_org_patient_count_quota_available(uuid)` | функция удалена миграцией, декларация и generated ACL удалены | живого вызывающего после 0053 нет |
| `saas_billing_effective_tariff(uuid,uuid)` | EXECUTE `app_tenant_service` снят декларацией | арендатор читает через `…_for_current_org` |
| `record_reminder_occurrence_finalized_projection(...)` | сверка `p_organization_id` с `app.current_org_id()` до первого реляционного чтения | DEFINER обходит RLS |
| `apply_paid_saas_billing_tariff(uuid,uuid)` | та же сверка, отказ `42501` | то же |
| `refresh_saas_billing_invoice_purchased_tariff(uuid,uuid,uuid)` | та же сверка, отказ `42501` | то же |
| `release_carried_seat_debt(uuid,uuid)` | та же сверка, отказ `42501` | то же |

Миграция:
`apps/webapp/db/drizzle-migrations/20260822T200000_tenant_definer_roots_validate_their_organization.sql`.
В ней нет `GRANT`, `REVOKE` и `CREATE POLICY`; права меняются только декларацией и reconcile-артефактом.

## Смерть читателя квоты

Сначала выполнен lexical code-search:

```text
node /home/dev/brain/tools/code-search.mjs "assert_org_patient_count_quota_available caller" --repo bcb -k 20
```

Он вернул исторические миграции, отчёты и тест отсутствия вызова, но не живой вызывающий. Затем точный
поиск по текущим деревьям:

```text
rg -n --glob '!node_modules/**' --glob '!docs/archive/**' --glob '!docs/REPORTS/**' \
  "assert_org_patient_count_quota_available" apps packages tools deploy docs .cursor
```

В исполняемом коде найден только комментарий `pgPublicBookingUserResolve.ts`, прямо фиксировавший, что
вызывающих нет; комментарий обновлён на фактическое удаление D17. Остальные совпадения — исторические
определения/комментарии миграций, отрицательный acceptance-тест, перепись имён, новый DROP и этот DEV-proof.
Нового живого вызывающего нет, поэтому stop-condition брифа не наступил.

## Rollback-only DEV: до, после и честный путь

Постоянный opt-in тест:
`deploy/postgres/privileges/definer-tenant-six-roots.devDbProof.test.mjs`. Он берёт только существующие
строки `bcb_webapp_dev`, не создаёт fixture-сущности, сначала вызывает установленные до правки тела,
затем дословно материализует candidate migration в той же транзакции и заканчивает `ROLLBACK`.

Команда:

```text
RUN_DEFINER_TENANT_SIX_ROOTS_DB=1 node --test \
  deploy/postgres/privileges/definer-tenant-six-roots.devDbProof.test.mjs
```

Результат: `tests 1; pass 1; fail 0`. Напечатанный тестом результат:

```text
dead_root_before=true                  dead_root_after=false
tenant_effective_execute_before=true  tenant_effective_execute_after=false
apply_foreign_before=true             apply_honest_after=true
apply_foreign_after=42501|saas_billing_organization_context_denied
refresh_foreign_before=true           refresh_honest_after=true
refresh_foreign_after=42501|saas_billing_organization_context_denied
release_foreign_before=not_superseded release_honest_after=not_superseded
release_foreign_after=42501|saas_billing_organization_context_denied
reminder_foreign_before=true          reminder_honest_after=true
reminder_foreign_after=42501|reminder_occurrence_organization_context_denied
effective_wrapper_honest_after=1
```

То есть три корня до правки реально обработали чужие строки и вернули `true`; четвёртый прошёл
чужой реляционный SELECT и вернул нормальный доменный ответ `not_superseded`. После правки все четыре
отказали до чтения с SQLSTATE `42501`, а те же честные вызовы сохранили прежние ответы. Живая обёртка
эффективного тарифа своей организации вернула одну строку. DROP мёртвого корня и снятие прямого
EXECUTE также проверены в этой откаченной транзакции.

Попытка штатного preflight из изолированного worktree:

```text
bash deploy/host/migrate-dev.sh --preflight
FATAL: DEV API env path guard failed
```

Причина названа самим guard: в worktree нет канонического корневого `.env`; копировать секретный env
ради проверки нельзя. Приземляемость именно новой миграции всё равно проверена выше её дословной
материализацией на именованной DEV-базе в транзакции с `ROLLBACK`.

## Права и артефакты

Оба generated-артефакта имеют один и тот же смысловой дифф:

```diff
-GRANT EXECUTE ON FUNCTION app.saas_billing_effective_tariff(uuid,uuid)
-  TO "app_platform_settings", "app_tenant_service";
+GRANT EXECUTE ON FUNCTION app.saas_billing_effective_tariff(uuid,uuid)
+  TO "app_platform_settings";
-ALTER/REVOKE/GRANT/shape для app.assert_org_patient_count_quota_available(uuid)
```

Точная проверка новых табличных грантов:

```text
for artifact in deploy/postgres/generated/privileges.bcb_webapp_dev.sql \
                deploy/postgres/generated/privileges.bersoncarebot_test.sql; do
  git diff --unified=0 -- "$artifact" | rg '^\+GRANT .* ON TABLE' | wc -l
done
0
0
```

Точные проверки миграции и исключения:

```text
rg -n "^(GRANT|REVOKE|CREATE POLICY)" \
  apps/webapp/db/drizzle-migrations/20260822T200000_tenant_definer_roots_validate_their_organization.sql | wc -l
0

rg -n "crossesTenantWall" deploy/postgres/privileges/declaration.ts | \
  rg "assert_org_patient_count_quota_available|saas_billing_effective_tariff|record_reminder_occurrence_finalized_projection|apply_paid_saas_billing_tariff|refresh_saas_billing_invoice_purchased_tariff|release_carried_seat_debt" | wc -l
0
```

## Гейт и проверки

На текущей голове после сведения D15b8 гейт видел ещё одну пару сверх исходных девяти:
`record_collapsing_audit_event → admin_audit_log`. Это не седьмой дефект: тело уже связывает
`audit_row.organization_id IS NOT DISTINCT FROM p_organization_id` после проверки аргумента. Анализатор
научен распознавать это NULL-safe равенство; отдельный fixture закрепляет эквивалентность. Сам SQL-корень
не менялся и исключение не добавлялось.

Финальный прогон на уже оформленном дереве:

| команда | результат |
|---|---|
| `node --test deploy/postgres/privileges/definer-tenant-predicate.test.mjs` | 14 pass / 0 fail |
| `pnpm test:db-privileges` | 159 pass / 0 fail / 96 skip, всего 255 |
| `node scripts/check-c4-migration-owned-function-bodies.mjs` | `OK` |
| `node deploy/postgres/privileges/generate-cli.mjs --all --check` | оба privileges и allowlist артефакта совпадают побайтно |
| `node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only --check` | оба port-context артефакта совпадают побайтно |
| `pnpm typecheck` | EXIT=0, 7 workspace-проектов |
| `pnpm lint` | EXIT=0; 0 ошибок, 2 прежних warning в `AppointmentPaymentSection.tsx` |
| `git diff --check` | EXIT=0 |
