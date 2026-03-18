# MAX-First rollout order and production hardening

Рекомендуемый порядок включения фич и чеклист метрик/логов для безопасного вывода в прод.

## Порядок включения (feature order)

1. **MAX bootstrap** — `MAX_ENABLED=true`, webhook, start/menu/callback, open web URL (см. [MAX_SETUP.md](./MAX_SETUP.md)).
2. **MAX entry** — вход в вебапп по ссылке из MAX (`?t=...` с `bindings.maxId`), обмен токена в вебапп.
3. **Channel linking UI** — блок «Подключите мессенджер» в вебапп (Telegram/MAX), привязка каналов к платформенному пользователю.
4. **Reminder fan-out** — после реализации durable reminder dispatch: вебапп вызывает `getDeliveryTargetsForUser`, передаёт `channelBindings` в dispatch; интегратор рассылает по всем каналам.
5. **Booking fan-out** — рассылка уведомлений Rubitime по всем привязанным каналам (интегратор вызывает GET /api/integrator/delivery-targets по phone и создаёт несколько intents).
6. **MAX-first wording** — смена формулировок в меню/настройках: MAX как основной канал, Telegram как дополнительный.

Переменные окружения, влияющие на поведение:

- Интегратор: `MAX_ENABLED`, `APP_BASE_URL`, `INTEGRATOR_WEBHOOK_SECRET` (для вызова вебапп delivery-targets).
- Вебапп: `ALLOWED_MAX_IDS` (опционально, whitelist max user id для входа), `DATABASE_URL` (для persistent identity и channel preferences).

## Метрики и логи (checklist)

- **Entry-token exchange (вебапп)** — логировать успех/ошибку обмена токена и источник (telegram / max / web) в `POST /api/auth/exchange`.
- **Channel linking** — при создании/обновлении привязки в вебапп логировать источник (telegram/max) и userId.
- **Delivery attempts** — интегратор уже пишет `delivery.attempt.log` в БД и в лог (writePort); при fan-out будет по одной записи на канал.
- **Replay / duplicate rejection** — вебапп: idempotency key reuse и несовпадение payload возвращают 409; проверка подписи (timestamp window) отсекает replay; при необходимости логировать отказ по подписи или idempotency.

Идемпотентность и replay-protection уже реализованы: вебапп (reminders dispatch, events) использует idempotency key и хеш тела; проверка подписи с временным окном — в `verifyIntegratorSignature` / `verifyIntegratorGetSignature`.

## Smoke tests (3 вертикали)

1. **MAX → open webapp → session bootstrap**  
   В MAX: /start → меню → «Персональный помощник» → «Открыть приложение». В браузере открывается вебапп с `?t=...`, после обмена токена создаётся сессия. Ручная проверка по [MAX_SETUP.md § 6](./MAX_SETUP.md#6-smoke-проверка-start--меню--открытие-вебапп).

2. **Standalone web login → connect MAX/Telegram**  
   Вход по телефону (SMS) в вебапп, в настройках/главной отображается блок «Подключите мессенджер»; переход по «Подключить» в Telegram/MAX и обратно — привязка отображается как «Уже подключено».

3. **Booking/reminder → multi-channel delivery resolution**  
   Автотест: при `source === 'rubitime'` и `deliveryTargetsPort.getTargetsByPhone`, возвращающем несколько каналов (telegram + max), исполнитель создаёт несколько intents (один на канал). См. `executeAction.test.ts`: «fans out rubitime message.send to multiple channels when deliveryTargetsPort returns bindings».
