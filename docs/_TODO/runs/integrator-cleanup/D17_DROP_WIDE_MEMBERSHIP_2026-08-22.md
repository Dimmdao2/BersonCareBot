# D17(в): широкое членство интегратора снято

**Дата:** 2026-08-23

**Ветка:** `wt/d17-drop-membership-20260822`

**Authority:** `WORK_ORDER.md`, D17; brief D17(в) владельца от 22.08; оракул
`D17_RELATION_READERS_2026-08-22.md`. Галочка D17 этим отчётом не ставится.

## Итог

У логинов интегратора декларативно больше нет ни членства в `app_tenant_service`, ни capability,
которая целится в `app_tenant_service`. Организационный реляционный трафик переведён на отдельную
`NOLOGIN NOINHERIT`-роль `app_integrator_tenant_service`. Она видит только восемь фактически нужных
отношений, на каждом включён `FORCE RLS`; медицинских отношений у роли нет.

Контракт порта не перестраивался. Один принятый контекст по-прежнему обслуживает одну транзакцию, а
три read-after-write места в `writePort.ts` работают обычным реляционным доступом новой роли. Цена
решения — одна дополнительная runtime-роль, одно членство логина, одна relation-capability и точные
ACL/RLS-политики для восьми отношений. Выигрыш — транзакции не дробятся и не получают второй
контекст; цена сопровождения — колоночную перепись нужно обновлять вместе с реальным SQL.

Подтверждённо мёртвый `app.integrator_upsert_content_access_grant(...)` удалён forward-миграцией.
Историческая migration, которая его создала, не переписывалась. Другие корни по догадке не удалялись:
межарендные резолверы остаются единственным повышенным путём опознания, а существующие operation-root
потоки учтены в capability-декларации и не возвращают интегратору табличный доступ к медицинскому
канону.

## Перепись фактического доступа

Перепись сделана по `apps/integrator/src`, общему `packages/platform-merge`, именованным корням из
декларации и всем вызовам под `runWithOrganizationPrincipal`. Реляционная роль получила ровно:

| отношение | операции / колонки интегратора |
|---|---|
| `integrator.user_reminder_occurrences` | `SELECT` контекста/статуса; `UPDATE` состояния доставки; `DELETE` orphan-строк |
| `integrator.user_reminder_delivery_logs` | `SELECT` доставки; `INSERT` журнала |
| `public.reminder_rules` | `SELECT(category, integrator_rule_id, integrator_user_id, organization_id)` |
| `public.org_enrollments` | `SELECT(organization_id, platform_user_id, status)` |
| `public.platform_users` | `SELECT(id, integrator_user_id, merged_into_id)` |
| `public.user_contacts` | `SELECT(contact_kind, is_primary, platform_user_id, value_normalized)` |
| `public.user_channel_bindings` | `SELECT(channel_code, external_id, user_id)` |
| `public.broadcast_audit` | `SELECT(id, organization_id)` |

`app_operational_delivery_worker` не менялся: очередь исходящей доставки — отдельное законное
назначение этой роли и не является широким tenant membership.

Машинная перепись декларации запускалась командой:

```bash
node --experimental-strip-types --input-type=module - <<'NODE'
import { declaration } from './deploy/postgres/privileges/declaration.ts';
const role = 'app_integrator_tenant_service';
const login = declaration.envMapping.dev.bcb_dev_integrator;
const grants = Object.entries(declaration.databases.bcb_webapp_dev.tables)
  .flatMap(([relation, spec]) => Object.entries(spec.grants ?? {})
    .filter(([grantee]) => grantee === role)
    .map(([, grant]) => ({ relation, rls: spec.rls, privs: grant.privs })))
  .sort((a, b) => a.relation.localeCompare(b.relation));
for (const grant of grants) console.log(JSON.stringify(grant));
console.log(`relations=${grants.length}`);
console.log(`old_memberships=${login.memberships.filter((item) => item.role === 'app_tenant_service').length}`);
console.log(`narrow_memberships=${login.memberships.filter((item) => item.role === role).length}`);
const caps = Object.values(declaration.portContext.capabilities)
  .filter((capability) => capability.port === 'integrator');
console.log(`old_capabilities=${caps.filter((capability) => capability.targetRole === 'app_tenant_service').length}`);
console.log(`narrow_capabilities=${caps.filter((capability) => capability.targetRole === role).length}`);
NODE
```

Результат: `relations=8`, у всех восьми `rls=force`; `old_memberships=0`,
`narrow_memberships=1`, `old_capabilities=0`, `narrow_capabilities=1`.

## Мёртвый content-access путь

Продуктовые вызовы проверены не по прежнему отчёту, а точным census:

```bash
printf 'product_root_calls='; rg -l "integrator_upsert_content_access_grant" apps/integrator/src --glob '*.ts' --glob '!*.test.ts' --glob '!*.spec.ts' | wc -l
printf 'product_issue_access_calls='; rg -n "\.issueAccess\(" apps/integrator/src --glob '*.ts' --glob '!*.test.ts' --glob '!*.spec.ts' | wc -l
```

Результат: `product_root_calls=0`, `product_issue_access_calls=0`.

Живой каталог DEV проверен командой вида:

```bash
sudo -n -u postgres psql -X -A -F '|' -t -q -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -c "SELECT 'content_source_relations', count(*) FROM pg_class c WHERE c.relname='content_access_grants' AND c.relkind IN ('r','p');"
```

Результат: `content_source_relations|0`. Удалены product-ветка, retry-операция и функция; migration
`20260822T213000_drop_dead_integrator_content_access_grant_root.sql` только удаляет функцию и не
содержит `GRANT`, `REVOKE`, ролей или политик.

## Живое адверсарное доказательство DEV

До пробы живой каталог содержал старое состояние: `old_membership=1`, `old_capability=1`.
Кандидатная декларация была материализована вручную внутри `BEGIN … ROLLBACK`: новая роль, один
membership, capability, точные ACL и политики. Ни одна проба не оставила запись в DEV.

Факты кандидатного каталога:

```text
candidate_old_membership|0
candidate_old_capability|0
candidate_narrow_membership|1
candidate_narrow_capability|1
```

Под принятым контекстом организации `a0000000-0000-4000-8000-000000000001` рабочие поверхности дали:

```text
allowed_enrollments|236
allowed_contacts|309
allowed_channel_bindings|129
allowed_reminder_rules|46
allowed_occurrences|2602
allowed_delivery_logs|1735
allowed_broadcast_audit|11
medical_rows_without_wide_membership|0
```

Проверка инъекцией выполнялась настоящим `app.begin_port_context(...)` под
`SET SESSION AUTHORIZATION bcb_dev_integrator` в откаченных транзакциях. При возврате широкого
membership та же названная организация снова открыла медицинские строки:

```text
medical_rows_without_wide_membership|0
medical_rows_with_injected_wide_membership|78
medical_rows_after_membership_removed_again|0
```

То есть инъекция доказала именно причинность снятого membership: `0 → 78 → 0`. Отдельные транзакции
обязательны, потому что контракт допускает один принятый контекст на transaction id.

Рабочие потоки покрыты полным набором тестов интегратора: входящее опознание и привязка канала,
upsert правила, постановка/финализация/доставка напоминания, журнал и durable retry. Живая SQL-проба
дополнительно исполнила их фактические relation surfaces под новой ролью; `--execute` не запускался.

## Проверки

```text
pnpm test:db-privileges
259 tests: 161 pass, 0 fail, 98 skip

pnpm --dir apps/integrator test
109 files passed, 1 skipped; 561 passed, 2 expected fail, 1 skipped

pnpm run typecheck
PASS

pnpm run lint
PASS; 0 errors, 2 прежних warning в AppointmentPaymentSection.tsx

node deploy/postgres/privileges/generate-cli.mjs --all --check
4 generated artifacts are byte-identical

node deploy/postgres/privileges/generate-cli.mjs --all --check --port-context-only
2 capability artifacts are byte-identical
```

`bash deploy/host/migrate-dev.sh --preflight` не дошёл до БД: guard отверг путь worktree как
`DEV API env path guard failed`. При отдельной rollback-материализации полного generated SQL проявился
прежний, не относящийся к D17 body-surface gap функции
`app.integrator_bind_bootstrap_channel_phone(...) -> public.doctor_patient_support`. Его не маскировали
расширением прав и не исправляли вне scope. Все D17-каталожные и адверсарные пробы выполнены вручную в
откаченных транзакциях.

Не запускались: `--execute`, TEST, deploy, full CI, PROD, push.
