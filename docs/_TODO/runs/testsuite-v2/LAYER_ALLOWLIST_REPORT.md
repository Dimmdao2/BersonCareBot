# Layer allowlist — report

## Снято с allowlist

Из блока `Файлы, которым исключение из границ слоёв ещё нужно` сняты девять записей:

- `modules/auth/oauthWebSession.ts`
- `modules/auth/yandexOAuthCallbackHandler.ts`
- `modules/content-catalog/service.ts`
- `modules/emergency/service.ts`
- `modules/lessons/service.ts`
- `modules/menu/service.ts`
- `modules/messaging/doctorSupportMessagingService.ts`
- `modules/messaging/patientMessagingService.ts`
- `modules/messaging/serializeSupportMessage.ts`

Мёртвых записей среди исходных двенадцати не оказалось: на текущем `feat` каждая всё ещё имела импорт из `@/infra/repos`.
Оставлены `auth/service.ts` (явно вне scope), `system-settings/configAdapter.ts` (соседняя ветка) и `integrator/events.ts`.

## Порты и направление зависимостей

- `ContentPagesPort` и его контрактные row/input types перенесены в
  `modules/content-catalog/ports.ts`: это общий владелец контракта `content_pages` для catalog, lessons и emergency.
  `pgContentPages.ts` теперь только импортирует и re-export'ит этот контракт как реализация для обратной совместимости.
- `ContentSectionRow` уже был в `modules/content-sections/ports.ts`; `menu/service.ts` (и обнаруженный рядом UI-потребитель
  `ContentForm.tsx`) перенаправлены туда.
- `SupportCommunicationPort` и связанные типы строк перенесены в `modules/messaging/ports.ts`: messaging — единственный
  владелец этих операций, а pg/in-memory repos реализуют его и re-export'ят типы для сохранения существующих внешних импортов.
- OAuth-модули больше не выбирают pg/in-memory реализации: callback routes передают `buildAppDeps()`; `oauthWebSession`
  получает `UserByPhonePort`, а Yandex handler — узкий injected набор `oauthBindings`, `userByPhone` и calendar-timezone.
- `integrator/events.ts` импортирует merge-ошибки напрямую из `@bersoncare/platform-merge`, а не через infra re-export.

## Динамический импорт: самотест дыры до/после

Временно добавлялся `return import('@/infra/repos/pgUserByPhone')` в уже снятый с allowlist
`modules/emergency/service.ts`.

- До добавления правила: `pnpm lint` завершился `exit_code=0` (все штатные гейты, включая webapp lint, зелёные).
- После добавления `no-restricted-syntax` с селектором
  `ImportExpression > Literal[value=/^@\/infra\/(db|repos)\//]`: `pnpm lint` завершился `exit_code=1`:

  ```text
  src/modules/emergency/service.ts
    7:17  error  modules must not dynamically import infra/db or infra/repos directly  no-restricted-syntax
  ```

Временная функция удалена. Правило добавлено в оба существующих блока — modules и API routes; allowlist отключает
также `no-restricted-syntax`. Чтобы корневая команда действительно проверяла эти TypeScript-поверхности, webapp lint
теперь вызывает `eslint src/modules src/app/api` вместо нерасширяемого `eslint .`.

## Вопрос владельцу: `integrator/events.ts`

По постановке нужно решить, расширять ли scope на
`AppointmentProjectionPort`, `SubscriptionMailingProjectionPort`, `BranchesProjectionPort` и
`mapRubitimeStatusToPatientBookingStatus`, чтобы снять запись `integrator/events.ts` полностью.
Эту задачу не расширял. На текущем `feat` точный поиск этих четырёх символов в самом `events.ts` пуст;
после переноса merge-ошибок файл всё ещё напрямую импортирует `ReminderProjectionPort` и
`SupportCommunicationPort`, поэтому запись allowlist оставлена.

## НЕ СДЕЛАНО

- Не трогались `auth/service.ts` и `system-settings/configAdapter.ts`.
- `integrator/events.ts` не переведён полностью и не снят с allowlist.
- Новые тесты не добавлялись: это рефакторинг; использованы компиляция, существующие тесты и самотест lint-гейта.

## Проверки

- `npx tsc --noEmit` (из `apps/webapp`) — зелёный.
- `pnpm lint` — зелёный после удаления временного импорта.
- `pnpm vitest --project=fast …` по затронутым модулям — 1 file / 1 test passed.
- `pnpm vitest --project=unit …` по auth и messaging — 4 files / 18 tests passed.
- `pnpm vitest --project=route` — 29 files / 112 tests passed.
