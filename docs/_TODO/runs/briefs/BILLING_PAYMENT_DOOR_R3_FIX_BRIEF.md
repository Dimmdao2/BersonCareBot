# B1.1 — fix-round единой двери оплаты (#1057)

## Authority

- `AGENTS.md` §4a, §5, §10a–§10b, §24.
- `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md`, B1.1: одна дверь с обязательными полями «кто платит, за что, сколько, куда вернуть».
- Product candidate `40d493ca3` из старой ветки `audit-2-11`.
- Независимый частичный аудит на доске: обычный YooKassa payment несёт наш return URL, а manual invoice теряет его до HTTP-вызова (`returnUrlPresent:false`).

## Человеческий разрыв

Платформенный администратор выставляет клинике ручной счёт через общую платёжную дверь, клиника оплачивает его, но YooKassa не знает адреса возврата и не возвращает человека в BersonCare. Деньги и webhook могут пройти; ломается завершение пути человеком.

## Задача

1. Пересадить product commit `40d493ca3` на свежую ветку от текущего `feat/doctor-ui-rebuild` без старых merge-коммитов.
2. Исправить ровно ветку manual invoice YooKassa: обязательный `returnUrl` должен доходить до сформированного provider request так же, как у обычного payment intent.
3. Сохранить прохождение обязательных payer/subject/reference полей через все четыре адаптера и один port. Не возвращать отдельный `createInvoice` bypass и не добавлять fallback на чужой сайт.
4. Использовать существующие тесты `paymentProviderIdentity.unit.test.ts` / `saas-billing/service.test.ts`; добавить один поведенческий кейс только если текущий kill-set не удерживает manual-invoice return URL.
5. Обновить B1.1 в `SAAS_BILLING_PLAN.md` только с фактическим SHA/evidence; другие открытые пункты не закрывать.

## Запрещено

- Новый payment provider, второй payment-door, raw SQL, миграции, DB/DEV/TEST/PROD, deploy.
- Чинить B0.3a, B1.2, B1.3, B1.4, fiscalization или checkout UI «заодно».
- Source-text тест вместо поведения сформированного запроса.

## Acceptance

- Без return URL manual invoice test красный; с исправлением request всех четырёх providers содержит identity/subject/reference, а YooKassa invoice содержит наш return URL.
- Targeted provider/service tests, webapp typecheck, scoped lint и `git diff --check` зелёные.
- Worker коммитит только разрешённые paths и пишет `BILLING_PAYMENT_DOOR_R3_FIX_REPORT.md`.
