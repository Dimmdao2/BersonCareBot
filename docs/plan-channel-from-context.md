# План: канал доставки только из сценариев и контекста

## Цель

- Нигде, кроме **сценариев** (content) и **интеграций** (adapters), код не должен знать, в какой канал идёт отправка.
- Канал задаётся **параметром** (из сценария или из контекста события). Имя канала соответствует интеграции, в которую уходят исходящие события.
- Сейчас: оставить в сценариях явный `channels: ['telegram']` где нужно; во всех остальных местах убрать хардкод и брать канал из контекста (источник события = канал ответа).

## Объём изменений

### 1. Где сейчас жёстко задан канал

| Место | Что сделать |
|-------|-------------|
| **Executor** (`executeAction.ts`) | Убрать `channels: ['telegram']` во всех местах, где сами собираем payload интента. Оставлять только `maxAttempts: 1` или не задавать `channels`. |
| **DispatchPort** (`dispatchPort.ts`) | Добавить правило: для `message.send`, если `payload.delivery.channels` нет или пустой — брать канал из `intent.meta.source`. |
| **Сценарии** (`content/**/scripts.json`) | Не менять: оставить `"delivery": { "channels": ["telegram"], "maxAttempts": 1 }` там, где уже есть. |
| **deliveryDefaultsPort** (infra) | Не трогать в этой фазе. Позже можно вернуть defaultChannels из source. |
| **resolveTelegramRecipient** (fallback на smsc) | Не трогать: это выбор fallback-канала в слое доставки. |

### 2. Конкретные правки в executor (убрать `channels: ['telegram']`)

Во всех перечисленных местах заменить:

```ts
delivery: { channels: ['telegram'], maxAttempts: 1 }
```

на:

```ts
delivery: { maxAttempts: 1 }
```

Список мест (номера строк ориентировочные, искать по `delivery: { channels:`):

1. `message.replyKeyboard.show` / `message.inlineKeyboard.show` / `admin.forward` — один общий case (~594).
2. `draft.send` — один intent (~985).
3. `conversation.user.message` — один intent (~1078).
4. `conversation.admin.reply` — два intents: пользователю (~1171) и админу (~1193).
5. `conversation.close` — два intents: пользователю (~1247), админу (~1262).
6. `conversation.listOpen` — один intent (~1314).
7. `question.listUnanswered` — один intent (~1374).
8. `conversation.show` — один intent (~1420).

Итого: порядка 10–11 вхождений в одном файле.

### 3. Конкретная правка в dispatchPort

В `readChannel(intent)`:

- Сейчас: для `message.send` читаем `payload.delivery?.channels`; если массив непустой — возвращаем первый элемент; иначе `null`.
- Нужно: для `message.send`, если `channels` отсутствует или пустой — возвращать `intent.meta.source` (канал = источник события). Иначе по-прежнему первый элемент `channels`.

Так интенты без указанного канала будут уходить в тот же канал, откуда пришло входящее событие.

---

## Пошаговый план (без поломок)

### Шаг 1. DispatchPort: fallback канала из meta.source

- Файл: `src/infra/adapters/dispatchPort.ts`.
- В функции `readChannel`: для типа `message.send`, если после чтения `payload.delivery?.channels` результат пустой (нет массива или длина 0), вернуть `intent.meta?.source ?? null`.
- Проверка: существующие тесты dispatchPort; при необходимости добавить тест на intent без channels, с meta.source = 'telegram'.

### Шаг 2. Executor: убрать channels из всех собранных интентов

- Файл: `src/kernel/domain/executor/executeAction.ts`.
- Заменить во всех перечисленных выше местах `delivery: { channels: ['telegram'], maxAttempts: 1 }` на `delivery: { maxAttempts: 1 }`.
- Поиск по строке `channels: ['telegram']` и замена только этой части (оставить `delivery` и `maxAttempts`).
- Проверка: `npm run build`, `npm run test`; при необходимости — ручной прогон сценариев (вопрос пользователя, ответ админа, неотвеченные вопросы).

### Шаг 3. Сценарии не трогать

- В `content/telegram/user/scripts.json`, `content/telegram/admin/scripts.json`, `content/telegram/scripts.json`, `content/rubitime/scripts.json` оставить текущие `"delivery": { "channels": ["telegram"], "maxAttempts": 1 }` как есть.
- Канал для шагов `message.send`, заданных в сценариях, по-прежнему приходит из параметров шага.

### Шаг 4. Регрессия

- Убедиться, что все исходящие сообщения (вопрос пользователя, уведомление админу, ответ пользователю, подтверждение админу, закрытие диалога, списки диалогов/неотвеченных, просмотр диалога) по-прежнему приходят в Telegram.
- При необходимости добавить/обновить тест: intent с `delivery: { maxAttempts: 1 }` без channels и с `meta.source = 'telegram'` обрабатывается и уходит в telegram-адаптер.

---

## Дальнейшее (после плана)

- При подключении VK/других мессенджеров: в сценариях можно задавать соответствующий канал в `delivery.channels` или не задавать — тогда будет использоваться `meta.source` (канал, откуда пришло взаимодействие).
- Рассылки: целевой канал будет задаваться параметром (из сценария или из выбора пользователя), без хардкода в домене/инфра.
- Общие сценарии (не привязанные к одному мессенджеру): достаточно не указывать канал в шаге — будет использоваться канал из контекста (источник события).
