# Фаза 4 — Email setup flow (UI + API)

**Статус:** `pending`  
**Канон:** [MAIN PLAN.md](MAIN%20PLAN.md) §3, §4  
**Зависит от:** [PHASE_03](PHASE_03_EMAIL_SETUP_TOKENS.md)  
**Следующий:** [PHASE_05](PHASE_05_AUTH_REGISTER_LOGIN_FORGOT.md)

## Цель

Пациент открывает ссылку, задаёт пароль на **существующей** карточке; после submit — verified email + credentials + session.

## URL

`/app/auth/email-setup?token=...` (публичный маршрут в `apps/webapp/src/app`)

## Scope

### В scope

- Validate token (exists, not expired, not used, user exists, email matches current contact email)
- Форма: readonly `email` (`autoComplete="username"`), `new-password`
- Submit: verify token again → `email_verified_at = now()` → upsert `user_password_credentials` → mark token used → session → redirect `/app/patient`
- Expired token UI: «Ссылка устарела» + resend (фаза 3 re-issue)
- Resend endpoint: по expired token извлечь user+email, проверить email still belongs, new token + mail

### Вне scope

- Полный login screen state machine (фаза 5)
- Merge (фаза 6)

## Definition of Done

- [ ] Happy path E2E: token → password → session в patient app
- [ ] Used token cannot reuse
- [ ] Expired → resend flow works
- [ ] Readonly email для keychain (см. MAIN PLAN JSX)
- [ ] Тесты API + RTL страницы (lean: один файл, `beforeAll` при тяжёлом import)
- [ ] [`LOG.md`](LOG.md)

## Локальные проверки

- [ ] `pnpm --filter @bersoncare/webapp test` — auth setup routes + page
- [ ] `pnpm --filter @bersoncare/webapp lint` / `typecheck` по затронутому пакету
- [ ] Ручной smoke: copy link from mail (or test helper), complete setup

## Endpoints (целевые)

| Method | Path | Назначение |
|--------|------|------------|
| GET/POST | `/api/auth/email-setup/validate` | Проверка token → email для формы |
| POST | `/api/auth/email-setup/complete` | Пароль + consume token |
| POST | `/api/auth/email-setup/resend` | Новая ссылка (expired flow) |

Имена уточнить в фазе 0 при согласовании.
