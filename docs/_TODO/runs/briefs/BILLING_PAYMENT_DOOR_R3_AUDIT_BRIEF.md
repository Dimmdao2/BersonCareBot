# B1.1 — независимый аудит единой двери оплаты, круг 3 (#1057)

Тест или взгляд: **поведенческий аудит плюс inspection границы** — обязательные поля должны реально доехать до сформированного запроса каждого провайдера и обеих веток YooKassa; отсутствие второго payment bypass проверяется caller census.

## Authority

- `AGENTS.md` §4a, §5, §10a–§10b, §24.
- `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md`, B1.1.
- Product transplant `928fe9cee`; fix `61c7ebd14`; evidence `8b847bb07` на `wt/billing-door-r3-current`.
- Предыдущий частичный аудит доказал единственный оставшийся разрыв: manual invoice YooKassa терял наш `returnUrl`.

Источник оракула: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` B1.1 — одна дверь с обязательными полями «кто платит, за что, сколько, куда вернуть».

## Kill-set до чтения тестов

1. Обычная оплата через каждый из четырёх адаптеров несёт payer identity, subject/reference, сумму/валюту и наш return URL.
2. Ручной SaaS invoice YooKassa несёт те же обязательные значения внутри реального invoice payload, включая `payment_data.confirmation.return_url`.
3. Удаление любого обязательного поля из caller/port/provider должно быть поймано сборкой или поведенческим тестом, а не только типом, который провайдер игнорирует.
4. Caller census не находит отдельную рабочую форточку к provider, минующую принятую дверь.
5. Повтор/идемпотентность и остальные B1.2–B1.4 этим bounded diff не изменены.

## Метод и verdict

- Сначала собственный kill-set, затем diff/caller census и тесты. Один fault injection на класс; временные mutations откатить.
- Аудитор не исправляет product. Может коммитить только acceptance tests и `BILLING_PAYMENT_DOOR_R3_AUDIT_REPORT.md`.
- DEV/TEST/PROD, реальные провайдеры, платежи, DDL и migrations запрещены.
- PASS только если ранее найденная потеря return URL поймана тестом и закрыта, а единая дверь фактически одна.

