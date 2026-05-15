# MAX: главное инлайн-меню и пустой список slash-команд — журнал выполнения

План: `~/.cursor/plans/max_главное_меню_02c73c6d.plan.md` (локальный путь Cursor).

**Дата выполнения:** 2026-04-14

## Шаг 0 — журнал и оглавление

**Цель (снимок 2026-04-14):** убрать команды `book`/`diary`/`menu` из UI MAX (`setMyCommands` → `[]`); автоприкреплять `menus.main` к исходящим `message.send` / `message.compose` в канал MAX при `linkedPhone` и без своей `replyMarkup`. Состав **`menus.main`** позже выровнен с Telegram: **две** кнопки в одной строке — запись (`booking.open`) + WebApp на **`links.webappHomeUrl`** (см. приложение к журналу ниже и [`CONTENT_AND_SCRIPTS_FLOW.md`](CONTENT_AND_SCRIPTS_FLOW.md)).

**Изменённые / добавленные файлы:**

- `apps/integrator/src/integrations/max/setupCommands.ts`
- `apps/integrator/src/content/max/user/menu.json`
- `apps/integrator/src/kernel/domain/executor/helpers.ts` — `buildMaxMainInlineKeyboardMarkup`
- `apps/integrator/src/kernel/domain/executor/handlers/delivery.ts` — `enrichPayloadWithMaxMainInlineIfApplicable` (после fan-out Rubitime отдельно по интентам)
- `docs/ARCHITECTURE/MAX_CAPABILITY_MATRIX.md`, `docs/README.md`, `docs/ARCHITECTURE/MAX_SETUP.md`
- `apps/webapp/INTEGRATOR_CONTRACT.md`
- Тесты: `executeAction.test.ts`, `deliveryAdapter.test.ts`

### Чек-лист шага 0

- [x] Файл журнала создан в репозитории.
- [x] Ссылка на журнал добавлена в `docs/README.md`.

---

## Шаг 1 — очистка `setMyCommands` и документация

- `setMaxBotCommands({ apiKey }, [])` с комментарием о навигации через инлайн.
- Матрица: пустой список команд; маппинг `/book` и т.д. в `mapIn.ts` сохранён.

### Чек-лист шага 1

- [x] `setupCommands.ts` обновлён.
- [x] `MAX_CAPABILITY_MATRIX.md` обновлён.
- [x] `docs/README.md` обновлён.
- [x] `MAX_SETUP.md`: `setMyCommands` и smoke §6.

---

## Шаг 2 — `menu.json`: запись → мини-приложение

**Исторически (снимок шага):** первая кнопка `menus.main` могла быть WebApp на `links.bookingUrl`.

**Актуально (2026-05, паритет с Telegram):** в `menus.main` — **две** кнопки: callback **`booking.open`** и WebApp на **`links.webappHomeUrl`**; см. приложение в конце файла и [`apps/integrator/src/content/max/user/menu.json`](../../apps/integrator/src/content/max/user/menu.json).

### Чек-лист шага 2

- [x] JSON валиден; ссылки на facts задаются в `webhook.ts` (`buildMaxLinks` / `buildTelegramLinks`).

---

## Шаг 3 — `delivery.ts`: автоприкрепление для MAX

- Условия: user, `linkedPhone`, нет `replyMarkup`, доставка в MAX (`delivery.channels` содержит `max` или каналы пусты и `source === 'max'`).
- Rubitime: обогащение только в ветке per-target, не на общем `resolvedParams` до fan-out.

### Чек-лист шага 3

- [x] Telegram-only исходящие без max-меню (тест `does not attach max main inline when delivery is telegram only`).
- [x] Fan-out: логика на каждом payload с `channels: ['max']`.
- [x] `INTEGRATOR_CONTRACT.md` дополнен.

---

## Шаг 4 — тесты

- `executeAction.test.ts`: прикрепление **главной** строки inline для max; пропуск для telegram-only.
- `deliveryAdapter.test.ts`: ряд из трёх `web_app` → три `open_app`.

### Чек-лист шага 4

- [x] Vitest по затронутым файлам: **77 passed** (локальный прогон).

---

## Шаг 5 — полный CI, без push

- Команда: `pnpm run ci` (из корня репозитория, после `pnpm install --frozen-lockfile` — lockfile уже был актуален).
- Результат: **успех** (lint, typecheck, integrator + webapp tests, build integrator + webapp, `pnpm audit --prod` — без уязвимостей).

### Чек-лист шага 5

- [x] `pnpm run ci` успешно.
- [x] `git push` не выполнялся (первоначальный план); повторный прогон CI и push — см. раздел «Пост-аудит» ниже.

---

## Пост-аудит кода (2026-04-14)

### Методика

Повторная проверка реализации в `delivery.ts`, `helpers.ts`, `setupCommands.ts`, `menu.json` без опоры только на чек-листы; сопоставление с контрактом MAX (`deliveryAdapter`: обязательный `recipient.chatId` для send).

### Находки

| Критичность             | Описание                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Исправлено              | **Подмешивание меню без `recipient.chatId`:** при цепочках вроде Rubitime с телефоном и **пустым** fan-out (или до разрешения адресата) payload мог остаться только с `phoneNormalized`. Разметка добавлялась, тогда как MAX-адаптер всё равно отклонял send (`MAX_PAYLOAD_INVALID`). Добавлена явная проверка `asNumber(recipient.chatId) !== null` в `enrichPayloadWithMaxMainInlineIfApplicable`. |
| Документация            | Уточнены `INTEGRATOR_CONTRACT.md`, `MAX_CAPABILITY_MATRIX.md` (Summary) — условие `chatId`.                                                                                                                                                                                                                                                                                                          |
| Низкая                  | Лог успеха `setMyCommands`: текст **`MAX: setMyCommands ok (empty command list)`** для однозначности в логах эксплуатации.                                                                                                                                                                                                                                                                           |
| Вне scope / принято     | **`message.deliver`** (очередь) по-прежнему **не** проходит через обогащение `message.send` — автоменю только для прямых `message.send` / `message.compose` в executor; это соответствует исходному плану.                                                                                                                                                                                           |
| Не уязвимость           | Факты `links.*` формируются на стороне интегратора (webhook), не из произвольного ввода пользователя в этом пути.                                                                                                                                                                                                                                                                                    |
| Оптимизация (не делали) | Кэш `getBundle({ source: 'max', audience: 'user' })` на процесс — возможный микро-оптимизационный хвост.                                                                                                                                                                                                                                                                                             |

### Правки после аудита

- `apps/integrator/src/kernel/domain/executor/handlers/delivery.ts` — guard по `recipient.chatId`.
- `apps/webapp/INTEGRATOR_CONTRACT.md` — явное условие `chatId`.
- `docs/ARCHITECTURE/MAX_CAPABILITY_MATRIX.md` — пункт Summary про авто-меню и `chatId`.
- `apps/integrator/src/integrations/max/setupCommands.ts` — текст лога.
- `apps/integrator/src/kernel/domain/executor/executeAction.test.ts` — тест **`rubitime fan-out: only max intent gets auto main inline keyboard when linkedPhone`**.

### Повторная верификация

- Полный `pnpm run ci` после правок: **успех** (2026-04-14), integrator **742** тестов.

---

## CI и push (пост-аудит)

- `pnpm run ci` — успех (lint, typecheck, integrator + webapp tests, build, audit).
- Коммит: `cbce51b` — `feat(max): empty bot commands, auto main inline menu, post-audit guard`
- Ветка `main` запушена в `origin`.

---

## Актуализация 2026-05-15 (паритет с Telegram)

Содержимое `apps/integrator/src/content/max/user/menu.json` → ключ `main`: **две** кнопки в одной строке — `booking.open` (callback) и WebApp на **`links.webappHomeUrl`** (как в Telegram `menu.json` / `replyMenu.json`). Ранее зафиксированная в этом журнале схема «три кнопки / запись через `links.bookingUrl`» для `menus.main` **заменена**; детали — `docs/ARCHITECTURE/CONTENT_AND_SCRIPTS_FLOW.md`, `docs/ARCHITECTURE/MAX_CAPABILITY_MATRIX.md`.
