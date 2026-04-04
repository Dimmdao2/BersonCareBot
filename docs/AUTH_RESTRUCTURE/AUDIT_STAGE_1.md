# AUDIT — Stage 1 (SMS: маппинг ошибок доставки)

**Scope:** `STAGE_1_SMS_ERROR_MAPPING.md`, `MASTER_PLAN.md` → Stage 1.

**Дата аудита:** 2026-04-04

---

## Verdict

**PASS**

---

## Проверки (gate)

### 1) Ошибки доставки маппятся в `delivery_failed`

**Статус:** OK

- Контракт: `SMS_ERROR_CODES` включает `delivery_failed`; комментарии разделяют `invalid_phone` и `delivery_failed` (`apps/webapp/src/modules/auth/smsPort.ts`).
- `createIntegratorSmsAdapter` для SMS / Telegram / Max:
  - HTTP `!res.ok` при статусе ≠ 429 → `code: "delivery_failed"` (429 → `rate_limited`).
  - `data.ok !== true` при успешном HTTP → `delivery_failed`.
  - `catch` (транспорт) → `delivery_failed`.
- `startPhoneAuth` пробрасывает `sendResult.code` без подмены (`apps/webapp/src/modules/auth/phoneAuth.ts`).

### 2) API message для `delivery_failed` корректен

**Статус:** OK

- `POST /api/auth/phone/start`: при `result.code === "delivery_failed"` ответ **503**, `error: "delivery_failed"`, `message` из `errorMessage()` → **«Не удалось отправить код. Попробуйте позже.»** (`apps/webapp/src/app/api/auth/phone/start/route.ts`).

### 3) UI не показывает «Неверный формат номера» при service failures доставки

**Статус:** OK

- Публичный auth flow: при ошибке `phone/start` используется `data.message ?? "Не удалось отправить код"` и `toast.error(message)` — без жёсткой подмены на текст про формат номера (`apps/webapp/src/shared/ui/auth/AuthFlowV2.tsx`).
- В `shared/ui/auth` строка «Неверный формат номера» не зашита в UI-компонентах (только серверные сообщения для настоящей валидации).
- Сценарий `delivery_failed` покрыт тестом: тост получает API-текст «Не удалось отправить код. Попробуйте позже.» (`AuthFlowV2.test.tsx`).

### 4) Тесты и CI evidence

**Статус:** OK

| Артефакт | Описание |
|----------|----------|
| `integratorSmsAdapter.test.ts` | 500 от интегратора → `delivery_failed`; fetch throw → `delivery_failed` |
| `phone/start/route.test.ts` | `delivery_failed` → 503, ожидаемый `message` |
| `AuthFlowV2.test.tsx` | мок `phone/start` с `delivery_failed` → `toast` с корректным сообщением |
| `pnpm run ci` | **exit 0** (2026-04-04): lint, typecheck, integrator test, webapp test, webapp:typecheck, build, build:webapp, audit --prod |

---

## Findings by severity

### Critical

Нет.

### Major

Нет.

### Minor / informational

- **Информационно:** при `data.ok !== true` и HTTP 200 адаптер не различает «неверный номер» от сбоя интегратора — всё отдаётся как `delivery_failed`. Это согласовано с целью Stage 1 (не маскировать транспортные/серверные сбои под формат номера); уточнение семантики по телу ответа интегратора — отдельная тема, не в scope Stage 1.

---

## MANDATORY FIX INSTRUCTIONS

**Обязательных исправлений по результатам этого аудита нет** (нет `critical` / `major`).

Для прохода FIX-после-аудита при необходимости: ссылаться на этот файл как **закрытый** для Stage 1; новые дефекты — только по новому AUDIT или регрессии.
