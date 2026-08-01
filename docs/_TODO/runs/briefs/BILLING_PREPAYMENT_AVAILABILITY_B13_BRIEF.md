# B1.3 — предоплату нельзя включить без тарифа и настроенного провайдера (#1057)

Прочитать `AGENTS.md`, особенно §5, §10a/§10b, §21 и §24. Authority:
`docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md`, B1.3 целиком. Не заменять owner checklist пересказом ниже.

## Последствие

Сейчас клиника может сохранить обязательную предоплату, хотя механика не входит в тариф или платёжный провайдер не
настроен. Ошибку увидит только пациент при записи. Настройка должна остановить ошибку раньше и объяснить её клинике;
booking-time отказ остаётся последним рубежом на случай последующей смены тарифа/настроек.

Источник оракула: B1.3 — «И нужна проверка что платежный провайдер доступен на тарифе и настроен в кабинете. если нет
- то поля предоплата и галочка брать предоплату - недоступны».

## Сначала измерить

Переиспользовать существующие `booking_prepayment` entitlement door, `PaymentsService`,
`providerHasCredentials`/`resolveActiveProvider`, текущий GET/PUT и `BookingPrepaymentSection`. Не создавать новый
экран, таблицу, endpoint, provider registry или вторую проверку credentials. Миграция не нужна и запрещена.

## Требуемое поведение

1. GET текущего policy API возвращает policies и server-derived availability: можно ли включать предоплату и короткую
   причину отказа. Доступность требует одновременно mutation-доступа механики `booking_prepayment`, глобально
   включённых payments и реально настроенного active/default provider по той же проверке, что использует создание intent.
2. UI показывает понятную причину и блокирует включение/поля суммы/save активной policy, пока availability=false.
   Уже сохранённое состояние видно. Возможность выключить существующую предоплату должна сохраниться.
3. PUT fail-closed отклоняет любую active/non-`disabled` policy при отсутствии entitlement или провайдера до записи.
   `mode=disabled` разрешено сохранить, даже когда тариф/провайдер недоступен, чтобы клиника могла выключить разрыв.
4. Существующий booking-time `payment_provider_unavailable` не удалять и не ослаблять.

## Проверка и сдача

Добавить минимальные поведенческие тесты текущего route/service/UI seam: нет entitlement; payments/provider не
настроен; доступно; disabled-save остаётся доступным. Не писать тесты на строки исходника. Для UI использовать
существующий лёгкий component pattern, если он есть; иначе route behavior + typecheck + точная inspection разметки,
не строить новый harness. Один fault injection на server bypass достаточно.

Запустить targeted tests, scoped lint, webapp typecheck и `git diff --check`. При green поставить B1.3 `[x]` тем же
product commit с точными командами/evidence. Коммитить только минимальный product/test/plan scope, не пушить.

