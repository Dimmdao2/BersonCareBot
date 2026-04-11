# Реструктуризация авторизации: Telegram Login Widget first, минимизация SMS

## Проблема

Текущая система авторизации строится вокруг номера телефона РФ (+7) и SMS OTP. Это создаёт комплекс проблем:

1. **SMS стоит денег** — каждая верификация платная; при масштабировании расходы растут линейно.
2. **SMS не работает вне РФ** — иностранные номера не поддерживаются провайдером SMSC.
3. **Ошибки маппинга** — `integratorSmsAdapter` возвращает `code: "invalid_phone"` при любом сбое HTTP к интегратору (транспортная ошибка, timeout, 5xx), а `errorMessage("invalid_phone")` → «Неверный формат номера». Пользователь видит тост о некорректном формате, хотя номер валиден.
4. **Валидация только РФ** — `isValidRuMobileNormalized` (`/^\+7\d{10}$/`) отсекает любые нероссийские номера. Нет международной валидации в UI.
5. **PIN-код избыточен** для пользователей с Telegram/Max — они уже авторизованы платформой.
6. **В мессенджерном Mini App ввод номера не нужен** — `telegram-init` уже авторизует по `initData`, а `request_contact` уже реализован в интеграторе для привязки номера через бот.

## Принцип

```
ПРИОРИТЕТ АВТОРИЗАЦИИ (от лучшего к fallback)

1. Telegram Login Widget  — бесплатно, мгновенно, работает в любой стране
2. Mini App initData       — для входа из ботов (уже работает)
3. request_contact в боте  — привязка номера без OTP (уже работает)
4. SMS OTP                 — только для +7 в вебе, когда нет Telegram
5. Yandex OAuth            — технический fallback-механизм (без публикации в UI)
```

**Ключевое изменение:** Telegram Login Widget становится **основным** методом входа в веб-приложение для всех пользователей. В РФ большинство сидит в Telegram (через VPN или без); у иностранцев тем более нет проблем. Те, у кого нет Telegram — получают SMS (РФ) или служебный fallback через OAuth (без показа в публичном UI).

PIN-код в публичном auth-flow временно скрыт. Возможность включить PIN остаётся опциональной (в профиле/позже, после релиза приложения).
Email остаётся как подключаемый канал в профиле (не как публичный метод входа на первом экране).
Привязка дополнительных каналов — по желанию.

---

## Текущее состояние

**Актуальное поведение и контракты** описаны в **`apps/webapp/src/modules/auth/auth.md`** и в **`docs/AUTH_RESTRUCTURE/auth.md`**. Раздел «Проблема» выше — исходная постановка до инициативы; перечисленные там боли закрыты этапами **Stage 1–7** (см. `STAGE_*.md`). Ниже — краткая сводка после **Stage 8** (документация и зачистка legacy).

### Поведение (финальное)

- **Веб:** при настроенном `telegram_login_bot_username` в `system_settings` — **Telegram Login Widget** как primary; иначе сразу ввод номера. Поле телефона — **`InternationalPhoneInput`** (E.164, libphonenumber); **SMS OTP только для РФ** (+7 mobile); прочие каналы OTP — по политике `check-phone` / `AuthFlowV2` (email не как обязательный публичный вход).
- **Ошибки доставки SMS:** `delivery_failed`, не маскируются под «неверный формат номера» (`integratorSmsAdapter`, Stage 1).
- **PIN** в публичном входе **скрыт** (Stage 5); PIN API остаётся для профиля и др.
- **Yandex OAuth** — только backend + `system_settings`, без кнопки в публичном login UI (Stage 7).
- **Mini App / бот:** `exchangeTelegramInitData`, `exchangeIntegratorToken`, `request_contact`, проекция **`contact.linked`** в webapp.
- **Операционный лог:** событие `phone_otp_delivery` (stdout JSON, маска номера) в `integratorSmsAdapter`.

### Файлы auth-модуля

| Файл | Назначение |
|---|---|
| `modules/auth/service.ts` | Сессии, cookie, exchangeIntegratorToken, exchangeTelegramInitData |
| `modules/auth/phoneAuth.ts` | startPhoneAuth, confirmPhoneAuth |
| `modules/auth/phoneNormalize.ts` | normalizePhone → E.164 (международный) |
| `modules/auth/phoneValidation.ts` | isValidPhoneE164, isRuMobile (SMS РФ), др. |
| `modules/auth/checkPhoneMethods.ts` | resolveAuthMethodsForPhone, AuthMethodsPayload |
| `modules/auth/otpChannelUi.ts` | pickPrimaryOtpChannel, OTP_OTHER_CHANNELS_ORDER |
| `modules/auth/smsPort.ts` | SmsPort interface, PhoneOtpDelivery |
| `modules/auth/oauthService.ts` | exchangeYandexCode, fetchYandexUserInfo |
| `modules/auth/oauthBindingsPort.ts` | OAuthBindingsPort interface |
| `infra/integrations/sms/integratorSmsAdapter.ts` | SmsPort implementation через интегратор |
| `shared/ui/auth/InternationalPhoneInput.tsx` | UI: поле телефона (международное) |
| `shared/ui/auth/AuthFlowV2.tsx` | UI: поток входа (Telegram Login primary, phone/OTP secondary, без PIN шага) |
| `shared/ui/auth/OtpCodeForm.tsx` | UI: форма ввода кода |
| `shared/ui/auth/PinInput.tsx` | UI: ввод PIN |
| `shared/ui/auth/ChannelPicker.tsx` | UI: выбор канала OTP |
| `app/api/auth/phone/start/route.ts` | API: старт SMS/OTP |
| `app/api/auth/phone/confirm/route.ts` | API: подтверждение OTP |
| `app/api/auth/check-phone/route.ts` | API: проверка доступных методов |
| `app/api/auth/telegram-init/route.ts` | API: вход по Telegram Mini App initData |
| `app/api/auth/telegram-login/route.ts` | API: Telegram Login Widget (подпись, сессия) |
| `app/api/auth/telegram-login/config/route.ts` | API: `{ botUsername }` для виджета |
| `app/api/auth/messenger/start/route.ts` | API: вход через мессенджер (deep link) |
| `app/api/auth/oauth/start/route.ts` | API: старт Yandex OAuth |
| `app/api/auth/oauth/callback/yandex/route.ts` | API: callback Yandex OAuth (канонический); legacy — `callback/route.ts` |
| `app/api/auth/exchange/route.ts` | API: обмен integrator token → сессия |

---

## Этапы реализации

## Детальные документы по этапам

- `docs/AUTH_RESTRUCTURE/STAGE_1_SMS_ERROR_MAPPING.md`
- `docs/AUTH_RESTRUCTURE/STAGE_2_INTERNATIONAL_PHONE_VALIDATION.md`
- `docs/AUTH_RESTRUCTURE/STAGE_3_TELEGRAM_LOGIN_WIDGET.md`
- `docs/AUTH_RESTRUCTURE/STAGE_4_AUTH_METHODS_BY_PHONE_TYPE.md`
- `docs/AUTH_RESTRUCTURE/STAGE_5_HIDE_PIN_PUBLIC_AUTH_FLOW.md`
- `docs/AUTH_RESTRUCTURE/STAGE_6_BOT_REQUEST_CONTACT_AND_ONBOARDING.md`
- `docs/AUTH_RESTRUCTURE/STAGE_7_YANDEX_OAUTH_BACKEND_ONLY.md`
- `docs/AUTH_RESTRUCTURE/STAGE_8_CLEANUP_AND_DOCS.md`
- `docs/AUTH_RESTRUCTURE/AGENT_EXECUTION_LOG.md` — журнал исполнения
- `docs/AUTH_RESTRUCTURE/PROMPTS_EXEC_AUDIT_FIX.md` — промпты (`EXEC`, `AUDIT`, `FIX`, `FINAL_AUDIT`, `FINAL_FIX`)

### Stage 1. Фикс маппинга ошибок в integratorSmsAdapter

**Цель:** ошибки доставки не маскируются под «неверный формат номера».

**Задачи:**

- **S1.T01** — Добавить код `"delivery_failed"` в `SMS_ERROR_CODES` (`smsPort.ts`).
- **S1.T02** — В `integratorSmsAdapter.ts`: при HTTP-ошибке интегратора (не 429) возвращать `code: "delivery_failed"` вместо `"invalid_phone"`. При `data.ok !== true` — аналогично.
- **S1.T03** — В `phone/start/route.ts` → `errorMessage`: добавить `case "delivery_failed": return "Не удалось отправить код. Попробуйте позже."`.
- **S1.T04** — В `AuthFlowV2.tsx`: тост при `delivery_failed` показывает адекватное сообщение (уже будет из API, просто убедиться).
- **S1.T05** — Тесты: мок интегратора с 500 → проверить что `sendCode` возвращает `code: "delivery_failed"`.

**Gate:** при сбое доставки пользователь видит «Не удалось отправить код», а не «Неверный формат номера». `pnpm run ci` зелёный.

---

### Stage 2. Международная валидация телефона в UI

**Цель:** поле ввода телефона поддерживает международные номера с выбором страны, inline-валидацией, флагами. Невалидный номер не отправляется на бэкенд.

**Задачи:**

- **S2.T01** — Установить `react-phone-number-input` + `libphonenumber-js` (peer dependency).
- **S2.T02** — Создать `InternationalPhoneInput` — обёртка над `PhoneInputWithCountrySelect` из `react-phone-number-input`:
  - Дефолтная страна: `RU`
  - Флаги из встроенных SVG (библиотека включает)
  - Inline-валидация через `isValidPhoneNumber` из `libphonenumber-js`
  - Красная рамка + текст ошибки при невалидном номере
  - Кнопка «Продолжить» disabled пока номер невалиден
  - Никаких тостов на ошибку формата — только inline
- **S2.T03** — Заменить `PhoneInput` на `InternationalPhoneInput` в `AuthFlowV2.tsx`.
- **S2.T04** — Обновить `phoneNormalize.ts` → `normalizePhoneInternational`: для `+7` — текущая логика; для остальных — E.164 из `libphonenumber-js`.
- **S2.T05** — Обновить `phoneValidation.ts` → `isValidPhoneE164`: проверка через `libphonenumber-js` (вместо regex `+7` only). Оставить `isValidRuMobileNormalized` как вспомогательную для определения «РФ-номер или нет».
- **S2.T06** — Обновить API-роуты (`phone/start`, `check-phone`, `pin/login`, `messenger/start`): использовать `isValidPhoneE164` для общей валидации; `isValidRuMobileNormalized` — только для определения доступности SMS.
- **S2.T07** — Стилизация `react-phone-number-input` под текущий дизайн (shadcn/tailwind). CSS-переменные, тёмная тема.
- **S2.T08** — Тесты: международные номера (+1, +44, +49, +380, +7) — валидация на клиенте и сервере.

**API флагов и форматов:** `react-phone-number-input` содержит всё внутри пакета (SVG-флаги, метаданные стран, форматы). Никаких внешних сервисов и своей базы не нужно.

**Gate:** поле ввода показывает флаг, форматирует номер, inline-валидация работает для любой страны. Кривой номер не уходит на бэкенд. `pnpm run ci` зелёный.

---

### Stage 3. Telegram Login Widget

**Цель:** основной метод входа в веб-приложение — кнопка «Войти через Telegram» (Telegram Login Widget). Бесплатно, без SMS, работает для любой страны.

**Предыстория:**

Telegram Login Widget — отдельный от Bot API механизм авторизации для **веб-сайтов**:
- На страницу добавляется `<script async src="https://telegram.org/js/telegram-widget.js">` + кнопка
- Пользователь нажимает → авторизуется через Telegram (popup или redirect)
- Telegram возвращает подписанный payload: `id`, `first_name`, `last_name`, `username`, `photo_url`, `auth_date`, `hash`
- Сервер проверяет `hash` через `HMAC-SHA256(SHA256(bot_token), data_check_string)`

Важно: **это не Mini App initData** и не бот. Это OAuth-подобный flow от Telegram для обычных сайтов.

**Задачи:**

- **S3.T01** — Backend: `POST /api/auth/telegram-login` — принимает payload от виджета, верифицирует подпись через `bot_token` (аналог `validateTelegramInitData`, но формат другой — не URLSearchParams initData, а JSON с `hash`). Проверка `auth_date` (не старше 1 часа).
- **S3.T02** — Backend: после верификации — `findOrCreateByChannelBinding({ channelCode: "telegram", externalId: id })`, установка сессии, редирект. Логика аналогична `exchangeTelegramInitData`, но без initData-формата.
- **S3.T03** — Клиент: компонент `TelegramLoginButton` — загрузка скрипта виджета, обработка callback. Два режима: popup (предпочтительно) и redirect.
- **S3.T04** — UI в `AuthFlowV2`: **первый экран** — «Войти через Telegram» (большая кнопка) + ссылка «Войти по номеру телефона» (мелкий текст). При нажатии на ссылку — текущий flow (phone → OTP). Telegram Login Widget — primary action.
- **S3.T05** — Определение контекста: если `isMessengerMiniAppHost()` — не показывать Telegram Login Widget (Mini App авторизуется через `initData`). Виджет только для обычного браузера.
- **S3.T06** — Привязка `telegramId` к существующему пользователю: если пользователь уже зарегистрирован по номеру, а теперь входит через Telegram Login — привязать `telegramId` к существующему `platform_users`. Мерж по `phone` (если Telegram вернул номер) или ручная привязка позже через профиль.
- **S3.T07** — `system_settings`: ключ `telegram_login_bot_username` (имя бота для виджета — может отличаться от основного бота, но обычно тот же). Добавить в `ALLOWED_KEYS`.
- **S3.T08** — Тесты: верификация подписи виджета, создание сессии, привязка к существующему пользователю.

**Подпись Telegram Login Widget:**
```
data_check_string = "auth_date=<auth_date>\nfirst_name=<first_name>\nid=<id>\n..." (поля отсортированы, без hash)
secret_key = SHA256(<bot_token>)
hash = HMAC-SHA256(secret_key, data_check_string)
```

Отличие от initData: в initData `secret_key = HMAC("WebAppData", bot_token)`, а в Login Widget `secret_key = SHA256(bot_token)`.

**Gate:** кнопка «Войти через Telegram» на странице логина, клик → Telegram popup → авторизация → сессия → редирект. Без SMS, бесплатно. `pnpm run ci` зелёный.

---

### Stage 4. Адаптация auth flow: выбор метода по типу номера

**Цель:** после ввода номера (если пользователь не вошёл через Telegram Login) — система определяет доступные методы в зависимости от страны номера.

**Задачи:**

- **S4.T01** — Хелпер `isRuMobile(phone: string): boolean` — определяет, что номер российский мобильный.
- **S4.T02** — Обновить `resolveAuthMethodsForPhone`: для не-РФ номеров `sms: false`. Для всех — `telegramLogin: true` (если виджет настроен).
- **S4.T03** — Обновить `AuthFlowV2`: после `check-phone` для не-РФ номеров не предлагать SMS. Публичный UI-порядок: Telegram Login (primary) + вход по телефону как secondary; Email/OAuth в публичном экране не показывать.
- **S4.T04** — `phone/start/route.ts`: если `deliveryChannel === "sms"` и номер не РФ → `400 { error: "sms_ru_only", message: "SMS доступно только для номеров РФ" }`.
- **S4.T05** — Тесты: не-РФ номер → check-phone возвращает `sms: false`; попытка отправить SMS → ошибка `sms_ru_only`.

**Gate:** пользователь с номером +49... не видит опцию SMS; +7... — видит. `pnpm run ci` зелёный.

---

### Stage 5. Скрыть PIN из публичного auth-flow (временно)

**Цель:** PIN не показывается в пользовательском потоке входа вообще (до выхода приложения и переоценки схемы авторизации). PIN остаётся опциональной возможностью в профиле/служебном сценарии.

**Задачи:**

- **S5.T01** — `AuthFlowV2.tsx`: удалить автопереход на шаг `set_pin` после OTP; после успешной авторизации всегда делать редирект в приложение.
- **S5.T02** — Скрыть `PinInput` и связанный шаг из публичного UI входа (без удаления backend-механизма PIN).
- **S5.T03** — Профиль: возможность установить/включить PIN остаётся опционально.
- **S5.T04** — Тесты: любой успешный login-flow (SMS/Telegram) не показывает `set_pin`.

**Gate:** после любого успешного входа в публичном UI нет шага `set_pin`; PIN доступен только как опция вне auth-flow. `pnpm run ci` зелёный.

---

### Stage 6. Привязка номера через бот — улучшение `request_contact`

**Детальный план этапа (задачи, gate, канонический текст приветствия):** [`STAGE_6_BOT_REQUEST_CONTACT_AND_ONBOARDING.md`](STAGE_6_BOT_REQUEST_CONTACT_AND_ONBOARDING.md).

**Цель:** при первом `/start` бот **всегда** запрашивает `request_contact`, если номер ещё не привязан в канале. Номер сохраняется в webapp через проекцию (`contact.linked` / channel-link). **Дополнение (2026-04):** без номера не отдаётся полноценное меню/WebApp при прочих действиях в чате (**прод:** `buildPlan` + `scripts.json` при `linkedPhone: false`, гейт колбэков в `resolver.ts`, executor `sendMenuOnButtonPress` только при `linkedPhone`; `handleUpdate` / `handleMessage` — вне webhook); Mini App при открытии WebApp без tier **patient** — **страховочный** гейт + M2M `request-contact` (см. [`BOT_CONTACT_MINI_APP_GATE.md`](BOT_CONTACT_MINI_APP_GATE.md), журнал `PLATFORM_IDENTITY_ACCESS/AGENT_EXECUTION_LOG.md`, регрессия контента `apps/integrator/src/content/userScriptsLinkedPhoneGate.test.ts`).

**Задачи (исходный Stage 6; по коду расширено):**

- **S6.T01** — Аудит веток `/start` и точек `request_contact` (выполнено; позже расширено единым гейтом по чату).
- **S6.T02** — `handleStart`: если `!hasLinkedPhone` → приветствие (**S6.T06**) → сразу `request_contact`; после привязки — главное меню.
- **S6.T03** — Проекция в webapp после сохранения номера в integrator (события channel-link / `contact.linked`).
- **S6.T04** — Max: аналог запроса контакта и доставка (inline `request_contact` и т.д.).
- **S6.T05** — Тесты: /start без номера → приветствие → запрос контакта → номер → меню; регрессия гейтов в домене и Mini App.
- **S6.T06** — Канонический текст приветствия и эмодзи — в [`STAGE_6_BOT_REQUEST_CONTACT_AND_ONBOARDING.md`](STAGE_6_BOT_REQUEST_CONTACT_AND_ONBOARDING.md).

**Gate:** первый `/start` без номера → **S6.T06** → сразу `request_contact`; в чате без номера — запрос контакта вместо полноценного меню; после привязки и проекции — tier **patient** в webapp; Mini App без tier **patient** — оверлей до синхронизации. `pnpm run ci` зелёный.

---

### Stage 7. Доработка Yandex OAuth

**Цель:** Yandex OAuth полностью рабочий как технический fallback-механизм, но без публикации в пользовательском UI логина.

**Задачи:**

- **S7.T01** — Довести OAuth-метод в backend до production-ready состояния (роуты, валидация, сессия), не добавляя кнопку в `AuthFlowV2`.
- **S7.T02** — `oauth/callback/route.ts`: полный flow — exchange code → userinfo → findOrCreateByEmail → сессия. Привязка через `oauth_bindings` таблицу.
- **S7.T03** — Мерж: если пользователь с таким email уже существует (по `verified_email` в `platform_users`) — привязать OAuth без создания нового пользователя.
- **S7.T04** — Добавить `yandex_oauth_client_id`, `yandex_oauth_client_secret`, `yandex_oauth_redirect_uri` в `system_settings` если ещё не там.
- **S7.T05** — Ограничить запуск через служебный/прямой endpoint (не отображать в публичном UI).
- **S7.T06** — Тесты: OAuth flow от start до сессии; мерж с существующим пользователем; отсутствие кнопки в публичном UI.

**Gate:** вход через Яндекс OAuth работает end-to-end по backend/endpoint, но в публичном auth UI не показывается. `pnpm run ci` зелёный.

---

### Stage 8. Зачистка и документация

**Цель:** убрать устаревший код, обновить документацию.

**Задачи:**

- **S8.T01** — Удалить старый `PhoneInput.tsx` (заменён на `InternationalPhoneInput`).
- **S8.T02** — `auth.md` — обновить документацию auth-модуля.
- **S8.T03** — `checkPhoneMethods.ts` — зафиксировать комментарий/контракт: OAuth реализован, но не включён в публичный UI.
- **S8.T04** — Логирование: при использовании SMS записывать в лог (для мониторинга расходов).
- **S8.T05** — Обновить `CONFIGURATION_ENV_VS_DATABASE.md` — новые ключи в system_settings.
- **S8.T06** — Обновить `deploy/HOST_DEPLOY_README.md` — если есть новые env (не должно быть, но проверить).

**Gate:** `pnpm run ci` зелёный. Документация актуальна.

---

## Порядок выполнения

```
Stage 1 → Stage 2 → Stage 3 → Stage 4 → Stage 5 → Stage 6 → Stage 7 → Stage 8
  │          │          │          │          │          │
  │          │          │          │          │          └── Бот: request_contact при /start
  │          │          │          │          └───────────── PIN скрыт из публичного auth-flow
  │          │          │          └──────────────────────── SMS только для +7
  │          │          └─────────────────────────────────── КЛЮЧЕВОЙ: Telegram Login Widget
  │          └────────────────────────────────────────────── Международное поле телефона
  └───────────────────────────────────────────────────────── Быстрый фикс: ошибки маппинга
```

**Stages 1–3 — минимум для закрытия основных проблем** (ошибки UI, международные номера, бесплатный вход).
Stages 4–7 — полировка и fallback-каналы.
Stage 8 — зачистка.

## Зависимости между stage

| Зависит от | Что | Почему |
|---|---|---|
| Stage 2 | Stage 4 | Международная валидация нужна для определения «РФ или нет» |
| Stage 3 | Stage 4 | `telegramLogin` метод в AuthMethodsPayload |
| Stage 3 | Stage 5 | После Telegram Login нужно единообразно убирать `set_pin` редирект |
| — | Stage 1 | Независимый, можно делать сразу |
| — | Stage 6 | Независимый, можно параллельно с 3–5 |

## Файлы (ожидаемые изменения)

| Файл | Stage | Действие |
|---|---|---|
| `modules/auth/smsPort.ts` | 1 | Изменение (добавить `delivery_failed`) |
| `infra/integrations/sms/integratorSmsAdapter.ts` | 1 | Изменение (коды ошибок) |
| `app/api/auth/phone/start/route.ts` | 1, 4 | Изменение (errorMessage, sms_ru_only) |
| `shared/ui/auth/PhoneInput.tsx` | 2 | Удалён; используется `InternationalPhoneInput` |
| `shared/ui/auth/InternationalPhoneInput.tsx` | 2 | Новый |
| `modules/auth/phoneNormalize.ts` | 2 | Изменение (международная нормализация) |
| `modules/auth/phoneValidation.ts` | 2 | Изменение (isValidPhoneE164) |
| `app/api/auth/check-phone/route.ts` | 2, 4 | Изменение (международная валидация, sms flag) |
| `app/api/auth/pin/login/route.ts` | 2 | Изменение (международная валидация) |
| `app/api/auth/messenger/start/route.ts` | 2 | Изменение (международная валидация) |
| `app/api/auth/telegram-login/route.ts` | 3 | Новый |
| `modules/auth/telegramLoginVerify.ts` | 3 | Новый (верификация подписи виджета) |
| `shared/ui/auth/TelegramLoginButton.tsx` | 3 | Новый |
| `shared/ui/auth/AuthFlowV2.tsx` | 3, 4, 5 | Изменение (TG Login первый, flow по типу номера, PIN скрыт) |
| `modules/auth/checkPhoneMethods.ts` | 4, 7 | Изменение (sms flag, telegramLogin, oauth без UI-публикации) |
| `modules/auth/otpChannelUi.ts` | 4 | Изменение (порядок каналов) |
| `modules/auth/service.ts` | 3 | Изменение (новый метод для TG Login Widget) |
| `integrator/.../handleUpdate.ts` | 6 | Изменение (request_contact при /start) |
| `integrator/.../handleMessage.ts` | 6 | Изменение (handleStart flow) |
| `app/api/auth/oauth/callback/route.ts` | 7 | Изменение (полный flow) |
| `modules/auth/auth.md` | 8 | Изменение (документация) |
| `system-settings/types.ts` | 3 | Изменение (telegram_login_bot_username) |

## Новые зависимости (npm)

| Пакет | Версия | Зачем | Stage |
|---|---|---|---|
| `react-phone-number-input` | latest | Поле телефона с флагами и форматированием | 2 |
| `libphonenumber-js` | latest (peer) | Валидация и парсинг международных номеров | 2 |

## Критерии готовности (definition of done)

- [ ] При сбое доставки SMS пользователь видит «Не удалось отправить код», а не «Неверный формат номера».
- [ ] Поле телефона поддерживает международные номера с флагами и inline-валидацией.
- [ ] Кнопка «Войти через Telegram» — основной метод входа в веб-приложении.
- [ ] SMS доступно только для номеров РФ (+7).
- [ ] Email не показывается в публичном login UI; подключается как опциональный канал в профиле.
- [ ] PIN скрыт в публичном login UI; остаётся опциональной возможностью.
- [ ] Бот при первом /start без номера отправляет приветствие (текст **S6.T06**) и сразу показывает `request_contact`.
- [ ] Yandex OAuth — рабочий fallback-механизм без публикации в UI.
- [ ] `pnpm run ci` зелёный.
- [ ] Документация auth-модуля обновлена.

## Связанные документы

- `docs/AUTH_RESTRUCTURE/STAGE_*.md` — детальные планы по каждому этапу
- `docs/AUTH_RESTRUCTURE/AGENT_EXECUTION_LOG.md` — журнал выполнения этапов
- `docs/AUTH_RESTRUCTURE/PROMPTS_EXEC_AUDIT_FIX.md` — prompt-шаблоны (`EXEC/AUDIT/FIX/FINAL_AUDIT/FINAL_FIX`)
- `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` — правила env vs БД
- `apps/webapp/src/modules/auth/auth.md` — текущая документация auth-модуля
- Telegram Login Widget docs: https://core.telegram.org/widgets/login
- Telegram Bot API `request_contact`: https://core.telegram.org/bots/api#keyboardbutton
- `react-phone-number-input`: https://catamphetamine.gitlab.io/react-phone-number-input/
