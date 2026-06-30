# Фаза 5 — Register / login / forgot (состояния email)

**Статус:** `completed`  
**Канон:** [MAIN PLAN.md](MAIN%20PLAN.md) §5, §6  
**Зависит от:** [PHASE_04](PHASE_04_EMAIL_SETUP_FLOW.md)  
**Следующий:** [PHASE_06](PHASE_06_MERGE_IDENTITY.md)

## Цель

Убрать тупик «duplicate_email» для contact-only аккаунта; forgot только для verified+password; вход по email — предсказуемые состояния.

## Состояния email (канон)

1. Свободен → обычная регистрация  
2. Существует + verified + `user_password_credentials` → login / forgot  
3. Существует + unverified / contact-only, нет credentials → **setup code** (`existing_account_needs_email_setup`)  
4. Verified, нет credentials → setup password code  
5. Конфликт / несколько кандидатов → безопасный auto-merge дублей по email; если две password-строки или hard blocker — support + `email_auth_conflict`  

## Scope

### В scope

- `POST /api/auth/email-password/register` — код `existing_account_needs_email_setup` + отправка setup (не голый 409)
- Явный запрос пользователя «отправить код» на register/setup-required — выпуск setup-code
- `AuthFlowV2` — копирайт и ветки UI по кодам
- `forgot` — reset только verified+credentials; contact-only → setup access (не тупик без письма); внешний ответ может оставаться generic 200
- Опционально: `POST /api/auth/email-password/lookup` для «ввёл email на входе» без перебора
- Тесты MAIN PLAN §11 (Auth)

### Вне scope

- Rubitime create user (фаза 1)
- Merge (фаза 6)

## Definition of Done

- [x] Register + existing bot email + doctor contact → setup path, не duplicate_email
- [x] Forgot + contact-only → setup code (или re-issue), не silent no-op
- [x] Forgot + verified+password → reset mail как сейчас
- [x] Forgot не шлёт на unverified doctor-only email
- [x] Существующий email+password аккаунт без регрессий
- [x] [`LOG.md`](LOG.md)

## Локальные проверки

- [x] `apps/webapp/src/app/api/auth/email-password/forgot/route.test.ts` — обновить ожидания
- [x] `AuthFlowV2.test.tsx` — новые ветки
- [x] `pnpm --filter @bersoncare/webapp exec vitest run …/email-password` — auth routes
- [x] `rg duplicate_email` — UI/API согласованы (409 только для verified+password / неверный resend)

## Якоря

- `forgot/route.ts` — сегодня `void startEmailChallenge(...).catch(() => undefined)`
- `register/route.ts` — `tryResendRegistrationChallenge`
- `auth.md` — обновить раздел Email+password
