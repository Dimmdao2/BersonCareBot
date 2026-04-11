# AUDIT — Stage 4 (методы входа по типу номера: SMS только РФ, публичный UI)

**Scope:** `STAGE_4_AUTH_METHODS_BY_PHONE_TYPE.md`, `MASTER_PLAN.md` → Stage 4.

**Дата аудита:** 2026-04-04

**Актуализация 2026-04-11:** для `POST /api/auth/phone/start` с **`channel: web`** SMS **запрещён** (`error: sms_disabled_web` при неявном или явном `deliveryChannel: sms` после валидации E.164). Публичный вход — OTP только Telegram/Max; шаг `new_user_sms` удалён из `AuthFlowV2`. Правило `sms_ru_only` остаётся для **`channel: telegram`** с доставкой SMS. Канон: `apps/webapp/src/modules/auth/auth.md`.

---

## Verdict

**PASS**

---

## Проверки (gate)

### 1) `+49` номер → `sms: false`

**Статус:** OK

- `resolveAuthMethodsForPhone`: `smsAllowed = isRuMobile(normalizedPhone)`; для не-РФ → `sms: false` (`checkPhoneMethods.ts`).
- **Unit:** `checkPhoneMethods.test.ts` — «returns sms false for unknown non-RU phone» с `+4915123456789`.
- **API:** `check-phone/route.test.ts` — «returns sms false for unknown non-RU phone» с тем же номером, `methods.sms === false`.

---

### 2) Канал SMS + не-РФ → `sms_ru_only` *(только не-web или явный telegram-канал с SMS)*

**Статус:** OK (с уточнением 2026-04-11)

- Для **`channel: web`** сначала отсекается SMS целиком → `sms_disabled_web` (см. актуализацию выше).
- Для **`channel: telegram`** и `deliveryChannel === "sms"`: после `isValidPhoneE164`, если `!isRuMobile(normalized)` → **400** `sms_ru_only`; `startPhoneAuth` не вызывается.
- **Тесты:** `phone/start/route.test.ts` — `sms_disabled_web` для web; при необходимости отдельные кейсы для telegram+SMS+не-РФ.

---

### 3) Сценарий `+7` работает

**Статус:** OK (с уточнением 2026-04-11)

- **check-phone:** тест «returns exists false for unknown phone» с `+79993456789` → `methods.sms: true`.
- **phone/start:** успех с `+7999…` при **`deliveryChannel: telegram`** (и привязке в БД) или `max` / `email`, не через web+SMS по умолчанию.
- **resolveAuthMethodsForPhone:** тест с `+79990000111` → `sms: true` для нового номера (флаг в check-phone; публичный UI SMS не предлагает).
- **UI:** новый пользователь с мессенджером — `choose_channel`; без мессенджера — `new_user_foreign` / OAuth (без `new_user_sms`).

---

### 4) Публичный UI не показывает Email / OAuth

**Статус:** OK

**Email (OTP в публичном входе):**

- `otpChannelUi.ts`: `isOtpChannelAvailablePublic` для `"email"` всегда **false**; `pickPrimaryOtpChannelPublic` не выбирает email (только telegram → max → sms или `null`); `pickOtpChannelWithPreferencePublic` игнорирует предпочтение email.
- `OTP_PUBLIC_OTHER_CHANNELS_ORDER`: `["max", "telegram", "sms"]` — **без** email.
- `ChannelPicker`: список «других» каналов строится через `isOtpChannelAvailablePublic` — кнопки email в публичном выборе **не** появляются.
- Тесты: `otpChannelUi.test.ts` — `isOtpChannelAvailablePublic` never allows email; `pickPrimaryOtpChannelPublic` при только email → `null`.

**OAuth:**

- `resolveAuthMethodsForPhone` не заполняет `methods.oauth` в ответе (контракт для UI без публичного OAuth) — см. комментарии и тесты `checkPhoneMethods.test.ts` (`oauth` undefined).
- `AuthFlowV2` не содержит ссылок на OAuth; **тест** `AuthFlowV2.test.tsx` — «does not show Yandex OAuth in public login UI».

**Замечание:** в `AuthFlowV2` остаётся ветка `buildAlternatives` с текстом про email для типа `email` — она **недостижима** при текущем `OTP_PUBLIC_OTHER_CHANNELS_ORDER` (в порядке нет `email`). Тип `OtpChannel` и `otpDescription` поддерживают email для единообразия кода, но публичный порядок каналов email не допускает.

---

### 5) CI evidence

**Статус:** OK

| Команда | Результат |
|---------|-----------|
| `pnpm install --frozen-lockfile && pnpm run ci` | **exit 0** (2026-04-04) |

---

## Findings by severity

### Critical

Нет.

### Major

Нет.

### Minor / informational

- **Информационно:** API `check-phone` может возвращать `preferredOtpChannel: "email"` из профиля; публичный flow использует `pickOtpChannelWithPreferencePublic`, который **не** отдаёт приоритет email — согласовано со Stage 4.
- **Информационно:** неиспользуемая ветка `buildAlternatives` / `otpDescription` для email при текущем публичном порядке каналов — можно упростить в отдельном рефакторинге, не блокер.

---

## MANDATORY FIX INSTRUCTIONS

**Обязательных исправлений по результатам этого аудита нет** (нет `critical` / `major`).
