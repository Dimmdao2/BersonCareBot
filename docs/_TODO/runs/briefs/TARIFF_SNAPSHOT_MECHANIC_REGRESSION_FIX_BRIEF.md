# Тариф 2.13 — paid-period snapshot regression после migration 0297 (#1069)

Прочитать `AGENTS.md` §1b/§5/§10/§24. Authority:
`docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` 2.13 и красный DEV oracle
`saasBillingTariffSnapshot.devDbProof.test.ts` на commit `0f184d521`.

## Последствие

Клиника оплатила тариф с включённой механикой `courses`. Во время оплаченного периода оператор выключает её в
живом тарифе — текущая дверь немедленно возвращает `disabled`, хотя оплаченный snapshot обязан действовать до конца
периода. DEV: 2 сценария прошли, этот один красный. Причина по diff: migration `0297` при удалении
`commercial_access_state` пересоздала три функции и заменила канонический
`app.saas_billing_effective_tariff(organization_id, tariff_id)` на direct `public.saas_tariffs` join.

## Scope

В ветке `wt/tariff-access-state-tails` создать migration `0305` (номер уже забронирован; первая строка
`-- TEMPORARY LOCAL MIGRATION NUMBER 0305`) и journal entry. Исторические `0295`/`0297` не менять.

Migration должна `CREATE OR REPLACE` только три функции в их текущей post-0297 форме, сохранив удаление четырёх
legacy states и все сигнатуры/owners/grants, но восстановив LATERAL frozen/live switch:

1. `app.read_current_patient_organization_entitlements()`;
2. `app.resolve_organization_mechanic_access(uuid, text)`;
3. `app.resolve_organization_cabinet_access(uuid)`.

Каждая читает tariff row только через `LEFT JOIN LATERAL app.saas_billing_effective_tariff(...) AS tariff ON true`;
не возвращать `commercial_access_state`, не менять quota code, policies, product TypeScript или test assertions.

## Проверка и сдача

Worker: journal sync, migration SQL parse/applicable static checks, access-ladder proof, webapp typecheck, scoped
lint/diff. DB/DEV/TEST/PROD не трогать; лид применит migration на DEV через `migrate-dev.sh` и повторит ровно три
сценария. Коммитить migration+journal и короткую plan note; checkbox 2.13 до зелёного DEV не закрывать. После worker —
один независимый audit по exact three-function diff; нового test/harness/fault framework не создавать.
