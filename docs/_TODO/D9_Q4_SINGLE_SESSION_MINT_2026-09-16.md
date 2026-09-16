# Д9 Q4 — одно рождение сессии при регистрации специалиста

Дата: 2026-09-16
Источник оракула: `docs/_TODO/AUTH_DOORS_FIX_2026-09-16.md`, Д9/Q4 — «одно рождение сессии на одно подтверждение личности».

## Что изменено

- Первый `setSessionFromUser` после успешного кода остаётся единственной точкой рождения сессии. Если выдача организации не состоялась, эта сессия по-прежнему ведёт человека на `/app/account?tab=security`.
- В `modules/auth/service.ts` добавлен `updateCurrentSessionFromUser`: он обновляет свежую проекцию того же пользователя в уже существующей cookie-сессии, сохраняет исходный `issuedAt` и не продлевает срок сверх TTL новой роли.
- Обновление fail-closed: отсутствующая/истёкшая сессия, несовпадающий `userId` или изменившийся `sessionEpoch` завершаются ошибкой; тихого рождения новой сессии и оживления отозванной сессии нет.
- После успешного провижининга `specialist-signup/confirm` обновляет существующую сессию вместо второго `setSessionFromUser`. Роль и актуальный `sessionEpoch` приходят из повторной загрузки пользователя; организация остаётся канонической membership-проекцией и разрешается по тому же `userId` при следующем чтении сессии — отдельного `organizationId` в `AppSession` нет.

## Доказательство

Постоянный поведенческий тест: `apps/webapp/src/app/api/auth/specialist-signup/confirm/route.route.test.ts`.

Он проходит через публичный `POST` handler с настоящими `setSessionFromUser` и `updateCurrentSessionFromUser` и проверяет конечный результат цепочки:

- одна запись пересечения identity-boundary;
- одна запись журнала входа;
- одна fresh-login отметка и одна отметка устройства;
- финальная cookie сохраняет тот же `issuedAt` и `sessionEpoch`, но содержит роль `doctor` и `pending_enrollment`;
- ответ возвращает выданный `organizationId`.

Проверки:

- `/home/dev/brain/host-orch/run-tests.sh "pnpm -C apps/webapp exec vitest run src/app/api/auth/specialist-signup/confirm/route.route.test.ts src/app/api/auth/specialist-signup/start/route.route.test.ts src/modules/auth/sessionColdComposition.unit.test.ts src/modules/auth/telegramMiniAppTokenSeparation.unit.test.ts src/modules/auth/service.publicIdentityCutover.acceptance.test.ts"` → 5 файлов, 21 тест, PASS.
- `/home/dev/brain/host-orch/run-tests.sh "pnpm -C apps/webapp exec tsc --noEmit -p tsconfig.json"` → PASS.
- `/home/dev/brain/host-orch/run-tests.sh "pnpm -C apps/webapp exec eslint src/modules/auth/service.ts src/app/api/auth/specialist-signup/confirm/route.ts src/app/api/auth/specialist-signup/confirm/route.route.test.ts"` → PASS.

### Целевая инъекция

Второй вызов в `specialist-signup/confirm` временно возвращён к `setSessionFromUser`, затем выполнена команда:

`/home/dev/brain/host-orch/run-tests.sh "pnpm -C apps/webapp exec vitest run --project=route src/app/api/auth/specialist-signup/confirm/route.route.test.ts"`

Результат: FAIL на `recordIdentitySessionStart` — ожидался 1 вызов, получено 2. Инъекция откатана; тот же тест на итоговом коде проходит.

### Отказ выдачи организации

Отдельным временным сценарием `provisionSpecialistOwner` возвращал ошибку. Та же route-проверка дала 2/2 PASS: ответ `503 provisioning_pending` содержал `redirectTo: /app/account?tab=security`, а cookie оставалась рабочей doctor-сессией с `pending_enrollment` и одной записью рождения. Временный сценарий удалён, чтобы постоянный тест защищал ровно одно заданное свойство.

## НЕ СДЕЛАНО

- Галочка Д9/Q4 в плане не поставлена — это делает ведущий после независимого аудита.
- Другие вызывающие `setSessionFromUser` не менялись.
- Миграции не создавались и не накатывались; DEV DB, TEST и PROD не трогались; `.env` не читался.
- Полный CI не запускался: для ограниченной правки выполнены требуемые typecheck, eslint и затронутые тесты.
