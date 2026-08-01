# B1.1 — bounded fix-round T-Bank currency (#1057)

## Authority

- `AGENTS.md` §4a, §5, §10a–§10b, §24.
- `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md`, B1.1.
- Product `928fe9cee` + `61c7ebd14`; audit/test `1f5cc7ee8`, `BILLING_PAYMENT_DOOR_R3_AUDIT_REPORT.md`.
- Official T-Bank contract: `https://developer.tbank.ru/eacq/intro/developer/openapi` — интернет-эквайринг работает в RUB; валютную конвертацию при необходимости делает интегратор. `/v2/Init` не имеет operational `Currency` field.

Источник оракула: B1.1 — «Одна дверь оплаты, у которой обязательные поля: кто платит, за что, сколько, куда вернуть»; сумма включает amount и currency. Для T-Bank нельзя молча трактовать non-RUB minor units как RUB.

## Один fix

1. В существующем Tinkoff adapter сохранить принятую `currency` в допустимом `DATA`, чтобы обязательное значение не терялось на boundary.
2. До HTTP запроса fail-closed отклонять currency, отличную от `RUB`; конвертацию, курс и второй payment path не строить.
3. Довести оставленный audit test до зелёного и добавить только один monetary-safety case: non-RUB не вызывает fetch.
4. При полном зелёном наборе обновить B1.1 checkbox/evidence тем же product commit.

## Запрещено

- Не менять B1.2–B1.4, callers, другие providers, invoice flow, idempotency, webhook/refund, DB/migrations/DEV/TEST/PROD/deploy.
- Не ослаблять test до «currency присутствует где-нибудь», если non-RUB всё ещё может уйти как RUB amount.

## Done

- Existing provider audit: 13/13 green; new non-RUB refusal green; fault removal of `DATA.currency` makes the existing Tinkoff assertion red.
- SaaS billing suite, typecheck, scoped lint, `git diff --check` green.
- Один product commit + updated audit report/plan evidence; push/land не делать. Повторный blind audit не нужен.

