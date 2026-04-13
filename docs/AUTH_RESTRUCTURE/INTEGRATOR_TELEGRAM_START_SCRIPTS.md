# Integrator: сценарии Telegram, связанные с `/start` и контактом

Выбор сценария: [`resolveBusinessScript`](../../apps/integrator/src/kernel/orchestrator/resolver.ts) — для каждого события выбирается один скрипт с максимальным `priority * 1e6 + specificity`.

## Контекст `linkedPhone`

Задаётся в [`loadUserContext`](../../apps/integrator/src/kernel/domain/handleIncomingEvent.ts) по данным [`getLinkDataByIdentity`](../../apps/integrator/src/infra/db/repos/channelUsers.ts): телефон берётся **только** из строки `contacts`, у которой `label` совпадает с каналом (`'telegram'` или `'max'`), т.е. номер, привязанный через `setUserPhone` / шаринг в мессенджере. Любой другой телефон у того же `user_id` (без такого `label`) **не** считается привязкой к боту и **не** отключает `telegram.start.onboarding`.

Если после загрузки контекста поле не задано, в [`buildBaseContext`](../../apps/integrator/src/kernel/domain/handleIncomingEvent.ts) выставляется **`linkedPhone: false`**, чтобы матчи сценариев с `context: { linkedPhone: false }` не отваливались на `undefined`.

## Webhook: разбор текста сообщения (`mapBodyToIncoming`)

Файл: [`apps/integrator/src/integrations/telegram/webhook.ts`](../../apps/integrator/src/integrations/telegram/webhook.ts).

Порядок для входящего текста (важен для конкурирующих префиксов):

| Шаг | Условие | Результат |
|-----|---------|-----------|
| 1 | `MESSAGE_TEXT_TO_ACTION` / меню | `action` из словаря или `''` |
| 2 | `/start noticeme` | `start.noticeme` |
| 3 | `/start link_<secret>` | `start.link`, поле `linkSecret` |
| 4 | `/start setrubitimerecord_` | **`start.setrubitimerecord`**; суффикс `[A-Za-z0-9_-]{1,120}` → **`recordId`** (иначе `recordId` нет, `action` всё равно rubitime) |
| 5 | если `action` всё ещё пустой: `/start setphone_<payload>` | нормализация номера → **`start.setphone`**, поле **`phone`** |
| 6 | если пусто: `/start set<word>` | **`start.set`** (прочие deep link; отдельного сценария под все варианты нет) |

Логирование: после маппинга для сообщений с текстом, начинающимся с `/start`, пишется **`debug`** с ключом **`telegramStart`**: `action`, `recordIdPresent`, `linkSecretPresent`, `phoneFromDeepLink` (без самого номера).

## Единый список «особых» `/start` действий

Файл: [`apps/integrator/src/kernel/orchestrator/telegramStartConstants.ts`](../../apps/integrator/src/kernel/orchestrator/telegramStartConstants.ts) — экспорт **`TELEGRAM_START_SPECIAL_ACTIONS`** (`start.link`, `start.noticeme`, `start.setrubitimerecord`, `start.setphone`, `start.set`).

Он должен совпадать с:

- разбором deep link в webhook / `mapBodyToIncoming` (см. таблицу выше);
- полем **`excludeActions`** у `telegram.start` / `telegram.start.onboarding` в `scripts.json`;
- исключениями для антидубликата «голого» `/start` в [`incomingEventPipeline.ts`](../../apps/integrator/src/kernel/eventGateway/incomingEventPipeline.ts) (`allowTelegramStartThroughDedup`: при `action` из этого набора дедуп **не** применяется);
- проверкой в [`buildLinkedPhoneMessageMenuGatePlan`](../../apps/integrator/src/kernel/orchestrator/resolver.ts): при ненулевом `input.action` из этого набора message-level гейт контакта **не** перекрывает сценарий.

## Основные id в `content/telegram/user/scripts.json`

| id | Match | priority | Смысл |
|----|--------|----------|--------|
| `telegram.start.link` | `action: start.link` | 0 | Завершение channel link (`linkSecret` → webapp) |
| `telegram.start.setphone` | `action: start.setphone` | **20** | Deep link: `user.phone.link` по `input.phone`, затем короткое `telegram:startSetphoneWelcome` + reply-меню (Запись / Дневник / Ещё) |
| `telegram.start.setrubitimerecord` | `action: start.setrubitimerecord` | 0 | Rubitime: `recordId` → запись → телефон из записи → `user.phone.link` |
| `telegram.start.noticeme` | `action: start.noticeme` | 0 | В т.ч. запрос контакта |
| `telegram.start.onboarding` | `text` **$startsWith** `/start`, **`excludeActions`**, `linkedPhone: false` | **15** | Короткий текст (`telegram:onboardingWelcome`) + кнопка `request_contact` в одном `message.replyKeyboard.show` |
| `telegram.start` | то же по `text`, `linkedPhone: true` | 0 | Только `user.state.set` → `idle` — **без исходящих сообщений** (welcome/меню не шлём) |

### Почему онбординг не пересекается с payload

`telegram.start.onboarding` и `telegram.start` матчат **`input.text`** с **`$startsWith: "/start"`** и массив **`excludeActions`**:  
`start.link`, `start.noticeme`, `start.setrubitimerecord`, **`start.setphone`**, `start.set`.  
Если `input.action` входит в список, сценарий **не** выбирается — пользователь не видит повторный запрос контакта при deep link (привязка по записи Rubitime, `setphone`, ссылка и т.д.).

Онбординг и `telegram.start.setphone` **не матчатся одновременно**: при `action: start.setphone` срабатывает `excludeActions`. У **`telegram.start.setphone`** задан **priority 20** (выше onboarding 15) на случай будущих пересечений по матчу.

## Max

Файл: [`apps/integrator/src/content/max/user/scripts.json`](../../apps/integrator/src/content/max/user/scripts.json).  
Те же идеи: `max.start.onboarding` / `max.start` с `$startsWith` и тем же `excludeActions`; разбор текста в [`fromMax`](../../apps/integrator/src/integrations/max/mapIn.ts) (не дублирует все Telegram deep link).

- **`max.start.onboarding`:** `user.state.set` → `await_contact:subscription`, затем `message.send` с `max:onboardingWelcome` и **inline**-клавиатурой (`max:requestContact.button`, `requestPhone: true` → в API Max `type: request_contact`, см. `deliveryAdapter`). Текст дублирует смысл Telegram: кнопка + опционально вложение контакта.
- **`max.start`** при `linkedPhone: true`: только `user.state.set` → `idle`, **без сообщения** на `/start`.
- После успешной привязки номера в чате срабатывает `max.contact.phone.link` → `max:phoneLinkedWelcome` + главное меню (`inlineKeyboard`).

## Тесты

| Файл | Что проверяет |
|------|----------------|
| [`buildPlan.test.ts`](../../apps/integrator/src/kernel/orchestrator/buildPlan.test.ts) | Onboarding vs `linkedPhone`, при `linkedPhone: true` на `/start` — план из `user.state.set`; deep link `/start …`, цепочка контакта |
| [`rubitimeDeepLink.test.ts`](../../apps/integrator/src/kernel/orchestrator/rubitimeDeepLink.test.ts) | `setrubitimerecord` не уходит в «общий» текстовый сценарий |
| [`webhook.test.ts`](../../apps/integrator/src/integrations/telegram/webhook.test.ts) | `mapBodyToIncoming`: contact, `setrubitimerecord`, `setphone`, `link` |

Проекция `contact.linked` в webapp: [`events.test.ts`](../../apps/webapp/src/modules/integrator/events.test.ts); запись в БД при `user.phone.link`: [`writePort`](../../apps/integrator/src/infra/db/writePort.ts) (`setUserPhone` → `applied` / `noop_conflict` / `failed`; метаданные `userPhoneLinkApplied`, опционально `phoneLinkIndeterminate` для исполнителя сценариев).

## Legacy

[`handleUpdate`](../../apps/integrator/src/kernel/domain/usecases/handleUpdate.ts) / [`handleMessage`](../../apps/integrator/src/kernel/domain/usecases/handleMessage.ts) **не** вызываются из [`processAcceptedIncomingEvent`](../../apps/integrator/src/kernel/domain/usecases/processAcceptedIncomingEvent.ts). Актуальное поведение — **webhook + `scripts.json` + шаблоны**.
