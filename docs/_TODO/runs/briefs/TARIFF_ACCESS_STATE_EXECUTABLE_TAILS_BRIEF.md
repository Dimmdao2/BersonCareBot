> **Retired-path notice.** Any command or path below that targets a pre-B0 retired database executor is preserved only as historical evidence; it is not runnable or current guidance. Other content in this document is unchanged. See [the current B0 retirement rule](/docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md).

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

Запустить три существующих доказательства в среде по `AGENTS.md` §1b. Snapshot product-proof выполняется на
`bcb_webapp_dev` после `migrate-dev.sh --preflight` → `--execute`; A0 disposable для него не использовать, потому
что baseline намеренно не содержит runtime ACL. RLS/ACL этим proof не заявлять — при необходимости это отдельный
A1/TEST gate под точным login. Если конкретный proof требует отсутствующий безопасный env, назвать blocker и всё
равно выполнить остальные. Scoped
lint/format или применимую syntax-check, webapp typecheck и `git diff --check`. Permanent новые тесты не нужны — чинятся
сами исполняемые доказательства. При полном green поставить 2.13 `[x]` тем же commit с точными командами; иначе оставить
открытым и записать реальный blocker. Коммитить только три файла и строку 2.13, не пушить.
