# Фаза 3 — Email setup tokens + письмо

**Статус:** `completed`  
**Канон:** [MAIN PLAN.md](MAIN%20PLAN.md) §9, §2 (отправка ссылки)  
**Зависит от:** [PHASE_02](PHASE_02_CONTACT_EMAIL_POLICY.md)  
**Следующий:** [PHASE_04](PHASE_04_EMAIL_SETUP_FLOW.md)

## Цель

Инфраструктура одноразовых setup-токенов (TTL 24h, hash в БД) и отправка письма со ссылкой на кабинет.

## Миграция (минимум)

Таблица `user_email_setup_tokens` (см. MAIN PLAN §9):

- `id`, `user_id`, `email_normalized`, `token_hash`, `expires_at`, `used_at`, `revoked_at`, `created_at`
- `source`: `rubitime` | `doctor_profile` | `manual_resend` | `registration_claim`
- `created_by_user_id` nullable

Токен в URL — только plain при выпуске; в БД — **hash**.

## Scope

### В scope

- Drizzle schema + migration webapp
- Модуль: create / validate / consume / revoke previous active for user+email
- Письмо: тема/текст со ссылкой `{publicOrigin}/app/auth/email-setup?token=...`
- Отправка через существующий контур (`sendEmailCodeViaIntegrator` **или** отдельный transactional template — не OTP-код, а link)
- Подключение триггеров из фазы 2

### Вне scope

- UI формы пароля (фаза 4)
- Register lookup API (фаза 5)

## Definition of Done

- [x] Миграция применена локально; schema в `apps/webapp/db/schema`
- [x] Выпуск токена revokes предыдущие active для пары user+email
- [x] TTL 24h enforced
- [x] Письмо уходит через integrator `send-email` (расширить контракт при необходимости: subject/body link, не только `code`)
- [x] Тесты: create, revoke, expired, used, hash not stored plain
- [x] [`LOG.md`](LOG.md)

## Локальные проверки

- [x] `pnpm --filter @bersoncare/webapp exec drizzle-kit check` (или project convention)
- [x] `pnpm --filter @bersoncare/webapp test` — новый модуль tokens
- [x] `rg user_email_setup_tokens` — только webapp modules/infra, не modules→repos нарушений ESLint

## API (черновик для фазы 4)

- Внутренний port: `issueEmailSetupToken({ userId, emailNormalized, source })`
- `sendEmailSetupLink(tokenPlain, to)`
