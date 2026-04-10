# Mini App: гейт «сначала контакт в боте»

## Зачем

Пользователь может открыть Telegram Mini App **до** того, как в чате с ботом нажал «Поделиться контактом». Сессия webapp создаётся по `initData` ([`exchangeTelegramInitData`](../../apps/webapp/src/modules/auth/service.ts)), а номер в `platform_users` приходит асинхронно после события `contact.linked` из integrator.

## Поведение

- Клиент: мессенджерный Mini App — [`isMessengerMiniAppHost`](../../apps/webapp/src/shared/lib/messengerMiniApp.ts) (Telegram: непустой `initData`; MAX: глобальный `window.WebApp` с `ready`, см. dev.max.ru).
- **401 на `/api/me`:** перед проверкой гейта вызывается восстановление сессии — [`ensureMessengerMiniAppWebappSession`](../../apps/webapp/src/shared/lib/miniAppSessionRecovery.ts): сначала `POST /api/auth/telegram-init` при наличии Telegram `initData`, иначе при наличии в URL `?t=` / `?token=` — `POST /api/auth/exchange` (типичный вход из Max/TG по ссылке бота без предварительного захода на `/app`). Если после этого всё ещё 401 — экран «Нет сессии», не разблокирование контента.
- Если `GET /api/me` возвращает пользователя **с привязкой Telegram или Max** и **без** нормализованного телефона — полноэкранный экран: ссылка на бота (Telegram: `/api/auth/telegram-login/config` → `t.me/...`; Max: `openUrl` из [`CHANNEL_LIST`](../../apps/webapp/src/modules/channel-preferences/constants.ts) для канала `max`) и опрос `/api/me` каждые 2 с (до ~90 с, затем «таймаут»).
- **`/app/patient/bind-phone`:** оверлей-гейт не показывается; в Mini App с привязкой к боту страница показывает встроенную подсказку «через бота» ([`PatientBindPhoneClient`](../../apps/webapp/src/app/app/patient/bind-phone/PatientBindPhoneClient.tsx)), без формы SMS. В обычном браузере — прежний поток (Telegram channel / web + OTP по политике `AuthFlowV2`).
- **Таймаут опроса** (~90 с): затем текст про возможную задержку синхронизации и кнопка «Проверить снова».
- **Контракт `contact.linked`**: событие должно нести не только `phoneNormalized`, но и `channelCode` / `externalId`, чтобы webapp синхронно восстановил и `platform_users.phone_normalized`, и `user_channel_bindings`.
- **Риск `contact.linked`**: если в integrator при `user.phone.link` не найден `userId` по identity, событие в webapp не ставится — номер может задержаться; см. [`writePort`](../../apps/integrator/src/infra/db/writePort.ts).
- **Риск частичной проекции**: UI блока «Привязанные каналы» читает `user_channel_bindings`, а не только `platform_users.phone_normalized`. Поэтому корректная доставка `contact.linked` важна не только для номера, но и для согласованного статуса Telegram в ЛК.
- **Другие разделы**: гейт только в layout пациента; логика «достаточно мессенджера без телефона» (`hasMessengerBinding` и т.д.) на остальных экранах не менялась.

## Код

- Оркестратор оверлея: [`MiniAppShareContactGate`](../../apps/webapp/src/shared/ui/patient/MiniAppShareContactGate.tsx).
- Общий UI блок: [`PatientSharePhoneViaBotPanel`](../../apps/webapp/src/shared/ui/patient/PatientSharePhoneViaBotPanel.tsx).
- Страница привязки в Mini App: [`PatientBindPhoneClient`](../../apps/webapp/src/app/app/patient/bind-phone/PatientBindPhoneClient.tsx) + [`bind-phone/page.tsx`](../../apps/webapp/src/app/app/patient/bind-phone/page.tsx).
- Клиентская логика `/api/me` и ссылок: [`patientMessengerContactGate.ts`](../../apps/webapp/src/shared/lib/patientMessengerContactGate.ts).
- Восстановление сессии при 401: [`miniAppSessionRecovery.ts`](../../apps/webapp/src/shared/lib/miniAppSessionRecovery.ts).
- Обёртка layout: [`PatientClientLayout`](../../apps/webapp/src/app/app/patient/PatientClientLayout.tsx).
- Серверный layout и редирект «нужен телефон»: [`layout.tsx`](../../apps/webapp/src/app/app/patient/layout.tsx), политика путей [`patientPhonePolicy.ts`](../../apps/webapp/src/app-layer/guards/patientPhonePolicy.ts), заголовки в [`middleware.ts`](../../apps/webapp/src/middleware.ts).

## Связанные документы

- Сценарий бота и `request_contact`: [STAGE_6_BOT_REQUEST_CONTACT_AND_ONBOARDING.md](./STAGE_6_BOT_REQUEST_CONTACT_AND_ONBOARDING.md).
- Разбор сценариев `/start` в integrator: [INTEGRATOR_TELEGRAM_START_SCRIPTS.md](./INTEGRATOR_TELEGRAM_START_SCRIPTS.md).
