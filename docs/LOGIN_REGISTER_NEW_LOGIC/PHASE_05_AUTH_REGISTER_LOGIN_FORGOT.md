# Фаза 5 — Register / login / forgot (состояния email)

**Статус:** `pending`  
**Канон:** [MAIN PLAN.md](MAIN%20PLAN.md) §5, §6  
**Зависит от:** [PHASE_04](PHASE_04_EMAIL_SETUP_FLOW.md)  
**Следующий:** [PHASE_06](PHASE_06_MERGE_IDENTITY.md)

## Цель

Убрать тупик «duplicate_email» для contact-only аккаунта; forgot только для verified+password; вход по email — предсказуемые состояния.

## Состояния email (канон)

1. Свободен → обычная регистрация  
2. Существует + verified + `user_password_credentials` → login / forgot  
3. Существует + unverified / contact-only, нет credentials → **setup link** (`existing_account_needs_email_setup`)  
4. Verified, нет credentials → setup password link  
5. Конфликт / несколько кандидатов → support, без automerge  

## Scope

### В scope

- `POST /api/auth/email-password/register` — код `existing_account_needs_email_setup` + отправка setup (не голый 409)
- Явный запрос пользователя «отправить ссылку» на register/setup-required — выпуск setup-link
- `AuthFlowV2` — копирайт и ветки UI по кодам
- `forgot` — reset только verified+credentials; contact-only → setup access (не тупик без письма); внешний ответ может оставаться generic 200
- Опционально: `POST /api/auth/email-password/lookup` для «ввёл email на входе» без перебора
- Тесты MAIN PLAN §11 (Auth)

### Вне scope

- Rubitime create user (фаза 1)
- Merge (фаза 6)

## Definition of Done

- [ ] Register + existing bot email + doctor contact → setup path, не duplicate_email
- [ ] Forgot + contact-only → setup mail (или re-issue), не silent no-op
- [ ] Forgot + verified+password → reset mail как сейчас
- [ ] Forgot не шлёт на unverified doctor-only email
- [ ] Существующий email+password аккаунт без регрессий
- [ ] [`LOG.md`](LOG.md)

## Локальные проверки

- [ ] `apps/webapp/src/app/api/auth/email-password/forgot/route.test.ts` — обновить ожидания
- [ ] `AuthFlowV2.test.tsx` — новые ветки
- [ ] `pnpm --filter @bersoncare/webapp test` — auth module
- [ ] `rg duplicate_email` — UI/API согласованы

## Якоря

- `forgot/route.ts` — сегодня `void startEmailChallenge(...).catch(() => undefined)`
- `register/route.ts` — `tryResendRegistrationChallenge`
- `auth.md` — обновить раздел Email+password
