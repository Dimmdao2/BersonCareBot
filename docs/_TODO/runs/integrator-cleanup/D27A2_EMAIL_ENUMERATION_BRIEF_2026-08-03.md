# D27-A2 — убрать email-OTP enumeration через timing/provider failure

## Authority

- Прочитать `AGENTS.md`, особенно §5, §10a–§10b и §24.
- `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D27.
- `docs/_TODO/runs/integrator-cleanup/IDENTITY_AND_MERGE_SCHEME.md` §3: email identifier получает код на email.
- Существующий security-contract: `emailOtpPublic.ts` — «Rate-limit: check by email (no userId needed yet — anti-enumeration)».
- Recent live fix не откатывать: product `4054417ea`, audit `b2b5e5a758`, land `17487d2b4`.

Источник оракула: существующая anti-enumeration ветка возвращает fake UUID для unknown email; public caller не
должен отличить known/unknown по status/body shape, provider outage или response-time class.

## Измеренная уязвимость

- Unknown email сразу получает neutral 200/fake UUID.
- Known email ждёт DB/provider; provider failure возвращает только known caller `503 email_send_failed`.
- Поэтому outage даёт прямое account enumeration, обычный runtime — timing oracle.
- В этом slice durable delivery ещё не строится; это D27-C.

## Выполнить

1. Нормализовать `/api/auth/email-otp/start`: для валидного non-rate-limited input known/unknown/provider success/
   provider failure имеют одинаковые public status/body schema и server-enforced minimum response-time class.
2. Реальная provider failure остаётся в server observability/operator evidence, но не выдаётся caller. Не логировать
   OTP/email PII сверх действующего policy.
3. Сохранить invalid-email и rate-limit semantics, challenge hash/attempt/session/confirm и recent provider principal.
4. Добавить behavior tests: known vs unknown; provider success/failure; body shape/forbidden error; minimum floor;
   rate-limit/invalid не ослаблены. Fault injection возвращающего `503` и убранного delay обязана краснеть.
5. Обновить D27 CURRENT PARTIAL, не ставить `[x]`: durable queue, preference/default и full channel screen впереди.

## Граница

- Только email OTP public start application/route, observability path, targeted tests и D27 docs.
- Не трогать phone/check-phone A1, D25 identity model, registration semantics, durable queue, DB migrations,
  deploy/env/DEV/TEST/PROD, D30, тарифы/CMS и общий `feat`.

## Готовность

- Один commit в `wt/trackd-d27a2-email-enumeration`, clean tree.
- Targeted route/service tests, typecheck/lint/auth/import gates, `git diff --check` PASS; точные commands в handoff.
