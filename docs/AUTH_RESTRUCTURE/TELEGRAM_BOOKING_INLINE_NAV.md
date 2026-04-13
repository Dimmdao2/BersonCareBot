# Telegram: inline-навигация «Запись на приём»

## Проблема (до правки)

В цепочке **Запись на приём → Мои записи / Как подготовиться / Адрес** кнопка **«⬅️ Назад»** вызывала **`menu.back`**, который через `telegram.menu.back` подменял сообщение на **`menu: main`** — устаревший блок «⚙️ Меню» (скорая помощь, помощник, уроки и т.д.), не относящийся к сценарию записи.

Дополнительно с экранов **«Как подготовиться»** и **«Адрес»** возврат шёл на **`bookings.show`**: текст сообщения становился списком записей / «нет записей» **без** исходного текста про виджет Rubitime, что выглядело как «другое меню».

## Решение

- Введён callback **`booking.menu`** и сценарий **`telegram.booking.menu`** в [`apps/integrator/src/content/telegram/user/scripts.json`](../../apps/integrator/src/content/telegram/user/scripts.json): `message.edit` того же сообщения на шаблон **`telegram:bookingMessage`** и ту же inline-клавиатуру, что при **`telegram.booking.open`** (две ветки: с webapp URL для кабинета/адреса и fallback с `bookings.show` для «Мои записи»).
- Во всех перечисленных местах цепочки записи **`menu.back`** заменён на **`booking.menu`**; с **`info.prepare`** / **`info.address`** «Назад» ведёт на **`booking.menu`** (возврат к «хабу» записи с виджетом).

## Область

**Telegram:** как выше. **Max:** в [`apps/integrator/src/content/max/user/scripts.json`](../../apps/integrator/src/content/max/user/scripts.json) добавлены сценарии **`max.booking.open`**, **`max.booking.menu`**, **`max.booking.open.callback`** (и ветки **`need_phone`**), плюс **`max.bookings.show`** — тот же «хаб» записи (виджет / мои записи / инфо / адрес) и возврат через **`booking.menu`**, что и в Telegram. При изменении цепочки в Telegram имеет смысл сверять Max-ветку и шаблоны с префиксом **`max:`**.

## Тест

Контракт раскладки клавиатуры (ветка с webapp): [`contentConfig.test.ts`](../../apps/integrator/src/content/telegram/user/contentConfig.test.ts) — `telegram.booking.menu`.

## Связь с `menu.back`

`menu.back` открывает **`menu: main`** — одна строка кнопок (**Запись / Дневник / Меню**) в [`menu.json`](../../apps/integrator/src/content/telegram/user/menu.json) и Max; используется из дневника, напоминаний и др.
