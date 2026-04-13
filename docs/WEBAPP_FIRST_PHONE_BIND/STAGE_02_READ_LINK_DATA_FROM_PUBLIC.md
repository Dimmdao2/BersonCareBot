# Этап 2: Чтение link-data для оркестратора из `public` (bindings + `platform_users`)

## Контекст

Сегодня `loadUserContext` → `readPort` `user.byIdentity` → **`getLinkDataByIdentity`** (`apps/integrator/src/infra/db/repos/channelUsers.ts`) возвращает строку по **`integrator.identities`** и телефон из **`integrator.contacts`** с `label = resource` (`telegram` / `max`). Это задаёт **`phoneNormalized`** и флаг **`linkedPhone`** в сценариях.

Цель этапа: для **признака «телефон привязан к каналу»** и для **номера, показываемого/используемого как канон с webapp**, опираться на **`public.user_channel_bindings`** + **`public.platform_users`** (тот же канон, что и при TX bind), чтобы убрать класс рассинхронов «бот видит linked, мини-апп нет» и наоборот **по этому измерению**.

Сценарии в `scripts.json` **не переписываются**: они по-прежнему матчят `context.linkedPhone`; меняется **источник** данных в `getLinkDataByIdentity` (или узкий helper + сборка результата).

Доп. вызовы `getLinkDataByIdentity`: `readPort.ts`, `userLookup.ts`, `app/routes.ts` (`resolveIntegratorUserIdForMessenger`). При единой реализации внутри функции **дополнительные файлы не обязаны** меняться.

## Какие поля сейчас отдаёт `getLinkDataByIdentity` (и зачем)

| Поле | Смысл | Где живёт сейчас | В webapp `public`? |
|------|--------|------------------|---------------------|
| `userId` | ID пользователя **integrator** (`integrator.users`) | `identities.user_id` | **Нет** (это integrator-сущность; в `public` свой `platform_users.id`) |
| `channelId` / `chatId` | Внешний id канала (Telegram user id и т.д.) | `identities.external_id` | В binding: `external_id` + `channel_code` |
| `phoneNormalized` | E164 для сценариев, `linkedPhone`, админ-логика | `contacts.value_normalized` при `label = resource` | **Да** — целевой канон: `platform_users.phone_normalized` (по `user_id` из binding) |
| `userState` | Черновики/шаги Telegram | `telegram_state.state` | **Нет** (остаётся в integrator) |
| `username` | `@username` Telegram | `telegram_state.username` | **Нет** (остаётся в integrator; при желании позже дублировать в проекции — отдельная задача) |

Итого: **переносить в этапе 2** имеет смысл в первую очередь **`phoneNormalized`** (и логику «есть доверенный/привязанный телефон для канала») на **`public`**. **`userId` в ответе** по-прежнему — integrator `users.id` из `identities`, пока контракт call sites не меняется. Связь **integrator user ↔ platform user** остаётся предметом согласованности (поле `platform_users.integrator_user_id`, binding и т.д.) — при расхождении возможны **другие** баги, не только «linked phone».

## Результат этапа

- [ ] Для пары `(resource, externalId)` телефон для **`linkedPhone` / `phoneNormalized`** в контексте оркестратора берётся из **`public`** (через binding → `platform_users`), с явными правилами: пустой телефон → `linkedPhone === false`.
- [ ] Семантика **label = resource** в `contacts` не ломает продукт: сценарии онбординга/гейты совпадают с тем, что видит webapp по канону.
- [ ] Ветки **telegram** и **max** в `getLinkDataByIdentity` обновлены согласованно (или общий helper).
- [ ] Регресс: `resolveIntegratorUserIdForMessenger` и admin lookup по каналу ведут себя ожидаемо (при смене источника телефона `userId` из identities **не** исчезает).

## Чек-лист аудита (этап 2)

- [ ] Пользователь с binding и телефоном в `platform_users` → `linkedPhone === true`, корректный `phoneNormalized` в контексте.
- [ ] Binding есть, телефона нет → `linkedPhone === false` (как в strict-воронке до шаринга).
- [ ] Нет identity в integrator → по-прежнему `null` или согласованное поведение (зафиксировать в коде/логе).
- [ ] Есть только старый телефон в `contacts` без записи в `public` после cutover TX — задокументировать ожидание (временный дрейф до миграции данных или явный repair); не молчаливый wrong success.
- [ ] `pnpm run ci`; при необходимости — точечные тесты на `readPort` / `handleIncomingEvent` / `buildPlan` с моком БД.

## Примечание про «старые данные»

Если запись новых привязок всегда идёт через TX bind, **Rubitime и операционные потоки не теряют строки** — старые расхождения ограничены по времени. Для разового выравнивания исторических рядов при необходимости — отдельный ops/SQL шаг (не блокер этапа, но пункт аудита при cutover).
