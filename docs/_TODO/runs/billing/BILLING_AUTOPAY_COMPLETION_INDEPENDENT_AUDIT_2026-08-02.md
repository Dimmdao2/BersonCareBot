# Независимый аудит восстановления после неудачной автоплаты

Продуктовый коммит: `48fd5be84`.

Вердикт: **FAIL — одна обязательная правка.**

## Проверенный путь человека

- Ошибка создания автоматического списания переводит счёт из `draft` в видимый `failed`.
- Поздний `payment.canceled` переводит только `draft`/`pending` в `failed`; оплаченный счёт не откатывается.
- Ручная кнопка оплаты повторно открывает тот же тарифный период с новым ключом провайдера и возвращает checkout.
- Повторный клик сходится на том же checkout и не создаёт второй запрос оплаты.
- Успешный и идемпотентный пути оплаты не изменены.

Целевая проверка:

```text
pnpm --dir apps/webapp exec vitest --run src/modules/saas-billing/service.test.ts src/app/api/clinic/billing/route.route.test.ts
Test Files 2 passed (2)
Tests 36 passed (36)
```

## MUST FIX 1 — новый тест ломает обязательную проверку типов

Достижимый сценарий: любой merge/deploy gate запускает `apps/webapp` typecheck и останавливается в добавленном
тесте. Причина — `vi.fn` вывел для `createIntent.mock.calls` пустой tuple, после чего обращения
`manualCheckout?.[0]` в `service.test.ts:1221-1222` дают `TS2493`.

```text
pnpm --dir apps/webapp typecheck
src/modules/saas-billing/service.test.ts(1221,29): error TS2493
src/modules/saas-billing/service.test.ts(1222,29): error TS2493
```

Требуемая граница фикса: исправить только типизацию/способ проверки аргумента нового mock; продуктовую логику
не менять. Повторный слепой аудит не нужен — после фикса достаточно повторить две команды выше.
