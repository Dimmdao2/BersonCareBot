# Telegram: inline-навигация «Запись на приём»

## Проблема (до правки)

В цепочке **Запись на приём → Мои записи / Как подготовиться / Адрес** кнопка **«⬅️ Назад»** вызывала **`menu.back`**, который через `telegram.menu.back` подменял сообщение на **`menu: main`** — устаревший блок «⚙️ Меню» (скорая помощь, помощник, уроки и т.д.), не относящийся к сценарию записи.

Дополнительно с экранов **«Как подготовиться»** и **«Адрес»** возврат шёл на **`bookings.show`**: текст сообщения становился списком записей / «нет записей» **без** исходного текста про виджет Rubitime, что выглядело как «другое меню».

## Решение

- Введён callback **`booking.menu`** и сценарий **`telegram.booking.menu`** в [`apps/integrator/src/content/telegram/user/scripts.json`](../../apps/integrator/src/content/telegram/user/scripts.json): `message.edit` того же сообщения на шаблон **`telegram:bookingMessage`** и ту же inline-клавиатуру, что при **`telegram.booking.open`** (две ветки: с webapp URL для кабинета/адреса и fallback с `bookings.show` для «Мои записи»).
- Во всех перечисленных местах цепочки записи **`menu.back`** заменён на **`booking.menu`**; с **`info.prepare`** / **`info.address`** «Назад» ведёт на **`booking.menu`** (возврат к «хабу» записи с виджетом).

## Область

Только **Telegram** (`scripts.json` user). **Max** отдельный контент; аналогичные кнопки при появлении того же UX нужно синхронизировать вручную.

## Тест

Контракт раскладки клавиатуры (ветка с webapp): [`contentConfig.test.ts`](../../apps/integrator/src/content/telegram/user/contentConfig.test.ts) — `telegram.booking.menu`.

## Связь с `menu.back`

`menu.back` по-прежнему используется в других сценариях (уведомления, дневник и т.д.) и открывает `menu.main`, пока этот слой не будет заменён глобально.
