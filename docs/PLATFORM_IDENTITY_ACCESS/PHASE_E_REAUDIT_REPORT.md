# Фаза E — повторный аудит и закрытие техдолга D-SA-1

**Дата:** 2026-04-11  
**Вход:** первичный аудит [`PHASE_E_AUDIT_REPORT.md`](PHASE_E_AUDIT_REPORT.md), исполнение E (тесты tier, `[platform_access]`, негативы API/actions), FIX E (**D-TST-1** — `page.warmupsGate.test.tsx`).

## 1. Цель повторного аудита

- Проверить, не осталось ли **хвостов** после первичного аудита (декларативные whitelist без runtime, пробелы в сценариях).
- **Не оставлять техдолг:** закрыть **D-SA-1** (enforcement onboarding server actions по pathname).

## 2. Проверки (сводка)

| Область | Результат |
|---------|-----------|
| `/api/patient/*`, `/api/booking/*` | Все проверенные handlers на **`requirePatientApiBusinessAccess`** |
| Server actions вне профиля | **`requirePatientAccessWithPhone`** (reminders, diary, notifications) |
| RSC персональные данные | **`patientRscPersonalDataGate`**; warmups — тест **D-TST-1** |
| Onboarding server actions (профиль) | **Был зазор D-SA-1** → закрыт кодом ниже |

## 3. Уязвимость / техдолг D-SA-1 (устранён)

**Проблема:** `patientServerActionPageAllowsOnboardingOnly` был только декларативным; теоретически при подделке запроса server action (при наличии валидной сессии) мутации профиля не были привязаны к pathname страницы.

**Решение:**

- `apps/webapp/src/modules/platform-access/onboardingServerActionSurface.ts` — **`patientOnboardingServerActionSurfaceOk()`**: `resolvePatientLayoutPathname` + `patientServerActionPageAllowsOnboardingOnly`.
- Вызов в **`apps/webapp/src/app/app/patient/profile/actions.ts`** до `requirePatientAccess`.
- При отказе: `console.info` **`[platform_access] onboarding_server_action_rejected`**; для OTP-экшена — `{ ok: false, message: "…" }`.
- Тесты: `onboardingServerActionSurface.test.ts`, `profile/actions.surface.test.ts`.

**Остаточный операционный риск (не код):** кастомный деплой без проброса **`x-bc-pathname`** в middleware для `/app/patient/*` — тогда pathname может быть пустым и action отклонится; штатный `middleware.ts` проекта выставляет заголовок.

## 4. Вердикт

- **DoD §3** по onboarding server actions: **без оговорки D-SA-1** после этого FIX.
- Иные пункты DoD §1–§4, §8 — без новых находок относительно [`PHASE_E_AUDIT_REPORT.md`](PHASE_E_AUDIT_REPORT.md).

## 5. CI

Перед пушем: **`pnpm run ci`** (зелёный на момент закрытия).
