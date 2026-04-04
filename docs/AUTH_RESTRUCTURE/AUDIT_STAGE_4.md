# AUDIT — Stage 4 (методы входа по типу номера: SMS только РФ, публичный UI)

**Scope:** `STAGE_4_AUTH_METHODS_BY_PHONE_TYPE.md`, `MASTER_PLAN.md` → Stage 4.

**Дата аудита:** 2026-04-04

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

### 2) Канал SMS + не-РФ → `sms_ru_only`

**Статус:** OK

- `phone/start/route.ts`: после `isValidPhoneE164`, если `deliveryChannel === "sms"` (в т.ч. по умолчанию) и `!isRuMobile(normalized)` → **400**, `error: "sms_ru_only"`, сообщение про РФ; `startPhoneAuth` не вызывается.
- **Тест:** `phone/start/route.test.ts` — «returns 400 sms_ru_only when SMS requested for non-RU number» (`+4915123456789`).

---

### 3) Сценарий `+7` работает

**Статус:** OK

- **check-phone:** тест «returns exists false for unknown phone» с `+79993456789` → `methods.sms: true`.
- **phone/start:** тест «returns 200 with challengeId for valid phone» с `+79991234567` (default SMS).
- **resolveAuthMethodsForPhone:** тест с `+79990000111` → `sms: true` для нового номера.
- **UI:** при `methods.sms === true` новый пользователь попадает на шаг `new_user_sms` с кнопкой «Получить код по SMS» (`AuthFlowV2.tsx`).

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
