# B1.1 — независимый аудит единой двери оплаты, круг 3 (#1057)

**Дата:** 2026-08-01

**Product transplant:** `928fe9ceeb6e307f20e83e8efbd3518a71ec6502`

**Fix:** `61c7ebd148b73d89872b159910a2c550bdec5365`

**Verdict:** **PASS — Tinkoff сохраняет currency в `DATA` и fail-closed отклоняет non-RUB до HTTP.**

## Kill-set и результат

Kill-set составлен по `SAAS_BILLING_PLAN.md` B1.1 и owner brief до чтения тестов.

| # | Проверка | Результат |
|---|---|---|
| 1 | Обычная оплата через каждый из 4 adapters несёт payer, purpose/subject, amount/currency и наш return URL | **PASS:** Alfa-Bank, CloudPayments, Tinkoff и YooKassa сохраняют обязательные значения в provider payload. Tinkoff передаёт `currency` в `DATA`; так как `/v2/Init` работает только с RUB, non-RUB fail-closed отклоняется до HTTP. |
| 2 | Manual SaaS invoice YooKassa несёт те же значения в реальном invoice payload, включая `payment_data.confirmation.return_url` | **PASS:** caller передаёт точные обязательные значения; `/v3/invoices` payload содержит amount/currency, identity/subject и return URL. |
| 3 | Удаление обязательного поля из caller/port/provider поймано build или поведением | **PASS для проверенных полей и зелёных веток; общий gate остаётся красным из-за Tinkoff currency.** Port weakening ловит compile assertion; caller/provider mutations ловят behavioral assertions. |
| 4 | Нет второй рабочей форточки к provider | **PASS:** все 7 production-вызовов создания платежа идут через `PaymentProviderPort.createIntent`; отдельного provider `createInvoice` и прямого create-payment HTTP call вне `infra/payments` нет. |
| 5 | B1.2–B1.4 и idempotency bounded diff не изменены | **PASS inspection:** product-коммиты меняют только B1.1 door/callers/adapters; existing SaaS billing service suite остаётся зелёным, включая повтор manual invoice и renewal. |

## Fix applied

### Tinkoff теряет обязательную валюту

`createTinkoffPaymentProvider().createIntent` теперь добавляет принятую `currency` в `DATA` вместе с
payer/purpose/subject. До получения credentials и до `fetchWithTimeout` provider принимает только `RUB`;
другая валюта даёт `tinkoff_currency_unsupported`. Поэтому non-RUB minor units не могут быть молча
отправлены как RUB amount.

Acceptance oracle:

```text
pnpm --dir apps/webapp exec vitest run \
  src/modules/saas-billing/service.test.ts \
  src/infra/payments/paymentProviderIdentity.unit.test.ts

Test Files  2 passed (2)
Tests       14 passed (14)
```

Бывший падающий Tinkoff assertion теперь зелёный; отдельный non-RUB case доказывает отсутствие внешнего вызова.

## Caller census / inspection

Точные команды и результаты:

```text
rg -n "\.createIntent\(" apps/webapp/src --glob '!**/*.test.*'
```

Результат: 7 callers — `registryAcquiringGateway.ts` (1), `saas-billing/service.ts` (3),
`payments/service.ts` (3). Каждый вызывает один `PaymentProviderPort.createIntent`.

```text
rg -n "async createIntent\(" apps/webapp/src/infra/payments --glob '!**/*.test.*'
```

Результат: 4 реализации — Alfa-Bank, CloudPayments, Tinkoff, YooKassa.

```text
rg -n "\.createInvoice\(" apps/webapp/src --glob '!**/*.test.*'
```

Результат: 0 совпадений.

```text
rg -n "api\.yookassa\.ru/v3/(payments|invoices)|securepay\.tinkoff\.ru/v2/Init|orders/create|register\.do" \
  apps/webapp/src --glob '!apps/webapp/src/infra/payments/*' --glob '!**/*.test.*'
```

Результат: 0 прямых create-payment endpoints вне provider adapters.

`code-search` до exact census:

```text
node /home/dev/brain/tools/code-search.mjs \
  "payment create intent provider manual invoice payer return url" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs \
  "who calls payment provider create payment adapter" --repo bcb -k 20
```

Результат согласуется с exact census: один provider port, registry bridge и два service consumers;
webhook/refund/list paths не являются второй дверью создания платежа.

## Fault injection

Все временные product mutations откачены; в итоговом diff product-кода нет.

| Класс поломки | Инъекция | Арбитр |
|---|---|---|
| Manual invoice provider branch | удалить `payment_data.confirmation.return_url` | invoice payload test красный: expected confirmation с `return_url`, received только `{ type: 'redirect' }` |
| Manual invoice caller | заменить наш settings URL на `https://yookassa.ru` | SaaS service test красный на exact `/app/settings?tab=billing` return path |
| Door type/port | сделать `payerRef` optional | `pnpm --dir apps/webapp exec tsc --noEmit --pretty false` красный: `Type 'true' is not assignable to type 'false'` в required-fields assertion |
| Alfa-Bank provider | удалить `returnUrl` из form payload | Alfa-Bank provider behavior test красный |
| CloudPayments provider | удалить `Currency` из request body | CloudPayments provider behavior test красный |
| YooKassa ordinary payment | удалить `confirmation.return_url` | YooKassa payment behavior test красный |
| Tinkoff provider | удалить `currency` из `DATA` | Tinkoff provider behavior test красный: `undefined` вместо `RUB` |

## Green evidence вокруг finding

```text
pnpm --dir apps/webapp exec vitest run src/modules/saas-billing/service.test.ts
```

Результат: 1 file, 8 tests passed.

```text
pnpm --dir apps/webapp exec vitest run \
  src/infra/payments/paymentProviderIdentity.unit.test.ts
```

Результат после fix: 1 file, 6 tests passed (включая Tinkoff payload и non-RUB refusal).

```text
pnpm --dir apps/webapp exec tsc --noEmit --pretty false
pnpm --dir apps/webapp exec eslint \
  src/infra/payments/paymentProviderIdentity.unit.test.ts \
  src/modules/saas-billing/service.test.ts
git diff --check
```

Результат: все три проверки прошли без вывода/ошибок на восстановленном product-коде и audit test diff.

## Handoff

Fix закрывает Tinkoff currency finding, не добавляя вторую payment door и не меняя B1.2–B1.4. Новый blind-pass
для этого же класса не требуется.
