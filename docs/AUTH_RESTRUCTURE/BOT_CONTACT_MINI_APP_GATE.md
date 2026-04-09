# Mini App: гейт «сначала контакт в боте»

## Зачем

Пользователь может открыть Telegram Mini App **до** того, как в чате с ботом нажал «Поделиться контактом». Сессия webapp создаётся по `initData` ([`exchangeTelegramInitData`](../../apps/webapp/src/modules/auth/service.ts)), а номер в `platform_users` приходит асинхронно после события `contact.linked` из integrator.

## Поведение

- Клиент: признак Telegram Mini App — непустой `window.Telegram.WebApp.initData` ([`isTelegramMiniAppWithInitData`](../../apps/webapp/src/shared/lib/telegramMiniApp.ts)).
- Если `GET /api/me` возвращает пользователя **с привязкой Telegram** и **без** нормализованного телефона — показывается полноэкранный экран с ссылкой на бота (`/api/auth/telegram-login/config` → `botUsername`) и опросом `/api/me` каждые 2 с (до ~90 с, затем состояние «таймаут» и кнопка «Проверить снова»).
- Маршруты **`/app/patient/bind-phone`** гейт **не** блокируют — можно привязать номер через SMS в webapp.
- **Таймаут опроса** (~90 с): затем текст про возможную задержку синхронизации и кнопка «Проверить снова».
- **Контракт `contact.linked`**: событие должно нести не только `phoneNormalized`, но и `channelCode` / `externalId`, чтобы webapp синхронно восстановил и `platform_users.phone_normalized`, и `user_channel_bindings`.
- **Риск `contact.linked`**: если в integrator при `user.phone.link` не найден `userId` по identity, событие в webapp не ставится — номер может задержаться; см. [`writePort`](../../apps/integrator/src/infra/db/writePort.ts).
- **Риск частичной проекции**: UI блока «Привязанные каналы» читает `user_channel_bindings`, а не только `platform_users.phone_normalized`. Поэтому корректная доставка `contact.linked` важна не только для номера, но и для согласованного статуса Telegram в ЛК.
- **Другие разделы**: гейт только в layout пациента; логика «достаточно мессенджера без телефона» (`hasMessengerBinding` и т.д.) на остальных экранах не менялась.

## Код

- UI: [`MiniAppShareContactGate`](../../apps/webapp/src/shared/ui/patient/MiniAppShareContactGate.tsx).
- Подключение: [`apps/webapp/src/app/app/patient/layout.tsx`](../../apps/webapp/src/app/app/patient/layout.tsx).

## Связанные документы

- Сценарий бота и `request_contact`: [STAGE_6_BOT_REQUEST_CONTACT_AND_ONBOARDING.md](./STAGE_6_BOT_REQUEST_CONTACT_AND_ONBOARDING.md).
- Разбор сценариев `/start` в integrator: [INTEGRATOR_TELEGRAM_START_SCRIPTS.md](./INTEGRATOR_TELEGRAM_START_SCRIPTS.md).
