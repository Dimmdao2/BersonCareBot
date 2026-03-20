# Контент и матчинг скриптов

## Где подтягивается контент

- **Загрузка:** при старте приложения вызывается `loadContentRegistry()` (`src/kernel/contentRegistry/index.ts`). Она сканирует `src/content/<source>/` (или `<source>/user` и `<source>/admin`) и читает:
  - `scripts.json` — массив сценариев (id, event, match, steps);
  - `templates.json` — ключ → текст шаблонов;
  - `menu.json` (опционально) — именованные меню (например `main`) для подстановки в шаги как `params.menu`.
- **Доступ:** адаптер `createContentPort()` (`src/infra/adapters/contentPort.ts`) держит кэш реестра и реализует порт `ContentPort`: `getScripts(scope)`, `getBundle(scope)`, `getTemplate(scope, templateId)`.

## Как выбирается скрипт на входящее событие/коллбек

1. Событие приходит в **eventGateway** → **incomingEventPipeline** → **processAcceptedIncomingEvent**.
2. Вызывается **orchestrator.buildPlan(input)** (`src/kernel/orchestrator/resolver.ts`).
3. **resolveBusinessScript(input, contentPort):**
   - по `input.event.meta.source` и `input.context.actor` (user/admin) определяется **scope** (например `telegram/user`);
   - через `contentPort.getScripts(scope)` получаются скрипты бандла;
   - для каждого скрипта вызывается **scriptMatches(script, input)** (см. ниже);
   - среди подходящих выбирается один с **максимальной specificity** (более конкретный match выигрывает).
4. По выбранному скрипту строится **план шагов**: для каждого step параметры интерполируются из контекста (`{{actor.chatId}}`, `{{input.action}}` и т.д.), при необходимости подставляется меню из `getBundle(scope).menus` (если в шаге указано `params.menu`).
5. Шаги плана по очереди выполняются в **executeAction** (domain executor).

## Где сопоставляются событие и payload со скриптом

Логика матчинга — в **scriptMatches()** и **matchesScriptPattern()** в `src/kernel/orchestrator/resolver.ts`:

- **source** — должен совпадать с `event.meta.source` (если в скрипте задан).
- **event** — тип события: `message.received`, `callback.received` и т.д.
- **match** — объект, который сверяется с нормализованным контекстом:
  - **input** — данные из `event.payload.incoming` (для callback: `action`, `messageId`, `callbackQueryId` и т.д.; для message: `text`, `action` и т.д.);
  - **context** — из `input.context` (например `linkedPhone`, `conversationState`);
  - спец. поля: `textPresent`, `phonePresent`, `excludeActions`, `excludeTexts`.

Для коллбеков обычно матчится `input.action` (например `notifications.show`, `menu.back`). Для сообщений — `input.text` или `input.action` (кнопки).

## Меню из одного источника

Главное инлайн-меню задаётся в **одном месте**: `src/content/telegram/user/menu.json` (ключ `main`). В сценариях в шагах указывается `"menu": "main"` вместо дублирования `inlineKeyboard`. При сборке плана `buildPlan` подставляет `inlineKeyboard` из `bundle.menus.main`. Так и открытие меню (кнопка «Меню»), и возврат по «Назад» показывают один и тот же набор пунктов.
