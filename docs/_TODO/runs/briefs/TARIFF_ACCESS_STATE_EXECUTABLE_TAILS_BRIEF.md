# Тариф 2.13 — три исполняемых хвоста снесённой колонки (#1069)

Прочитать `AGENTS.md`, особенно §9, §10 и §24. Authority:
`docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md`, пункт 2.13, абзац «Не закрыто — три исполняемых места».

## Последствие

Три действующих доказательства падают на уже удалённой `be_organizations.commercial_access_state`, поэтому зелёное
поведение выдачи тарифа/триала и заморозки оплаченного периода выглядит сломанным. Ложный красный нельзя оставлять:
по нему перестают доверять проверкам.

## Scope

Исправить ровно три названных места на текущем `feat`:

1. `apps/webapp/scripts/check-access-ladder-transitions.mjs` — читать фактическую migration `0297`, не старый номер.
2. `apps/webapp/src/infra/repos/saasBillingTariffSnapshot.devDbProof.test.ts` — fixture без удалённой колонки.
3. `docs/_TODO/SAAS_FOUNDATION/scripts/smoke-phase3-specialist-signup-provisioning.mjs` — доказательство тарифа и
   активного trial без чтения колонки и без требования старого column grant.

Не возвращать колонку, состояние или grant; не переписывать продукт, не добавлять migration/helper/test. Сохранить
проверки: новая клиника получает назначенный тариф и активный trial; оплаченный период держит snapshot; access ladder
принимает решение без четырёх legacy states.

## Приёмка и сдача

Запустить три существующих доказательства их каноническими disposable/opt-in командами, не общей DEV/TEST/PROD БД;
если конкретный proof требует отсутствующий безопасный env, назвать blocker и всё равно выполнить остальные. Scoped
lint/format или применимую syntax-check, webapp typecheck и `git diff --check`. Permanent новые тесты не нужны — чинятся
сами исполняемые доказательства. При полном green поставить 2.13 `[x]` тем же commit с точными командами; иначе оставить
открытым и записать реальный blocker. Коммитить только три файла и строку 2.13, не пушить.

