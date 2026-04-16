# LOG — API DI / import-boundary track

## 2026-04-16 — discovery

**Кластеры** (по путям, без глубокого чтения тел handlers):

1. **Integrator GET (read-only)** — `integrator/subscriptions/*`, `integrator/appointments/*`, `integrator/reminders/*` (кроме dispatch), `integrator/communication/*`, `integrator/delivery-targets`, `integrator/diary/*`: в основном `verifyIntegratorGetSignature` из `@/infra/webhooks/verifyIntegratorSignature`.
2. **Integrator POST / side effects** — `integrator/events`, `integrator/messenger-phone/bind`, `integrator/channel-link/complete`, `integrator/reminders/dispatch`, `integrator/reminders/occurrences/{skip,snooze}`.
3. **Media** — `media/*`, `admin/media/*`, `internal/media-*`.
4. **Doctor admin merge/purge** — `doctor/clients/*`, `admin/users/*`, `admin/audit-log`.
5. **Auth** — `auth/oauth/callback/{google,apple}`, `auth/{max-init,telegram-init}` (logger), `menu` (server runtime log).
6. **Support / misc** — `public/support`, `patient/support`, `patient/diary/purge`, `booking/catalog/*`, `booking/slots`, `me`, `health/projection`, `doctor/appointments/rubitime/*`.

**Нарушения целевой политики** (гипотеза для рефакторинга, не автоматический список «плохих»):

- Любой прямой `@/infra/*` в `route.ts`, кроме явно одобренных исключений (будут перечислены в `PLAN.md` после согласования).

**Гипотезы / needs verification:**

- Можно ли централизовать `verifyIntegratorGetSignature` через тонкий helper в `app-layer` без циклов импорта.
- Фактическое использование `inMemoryOAuthBindingsPort` в callback routes — только test vs prod ветвление.
